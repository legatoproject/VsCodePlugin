import * as fs from 'fs-extra';
import * as os from 'os';
import { DelayedPromise, WaitingPromise } from "../commons/promise";
import assert = require("assert");
import { ITestCallbackContext } from "mocha";
import { Scheduler, Immediate, Sequencer } from "../commons/scheduler";
import { ProcessLauncherOptions, TaskProcessLauncher, OutputChannelProcessLauncher, ProcessLauncher, createReturnCodeError } from "../commons/process";
import { TaskDefinitionType } from "../commons/identifiers";
import { join } from 'path';

// Provide a marker from an index
type MarkerProvider = (i: number) => string;
// Provide a list of marker corresponding to the expecting execution order
type ExpectedOrderProvider = (indexes: number[], start: MarkerProvider, stop: MarkerProvider) => string[];
// Compute a delay from a list of task delay
type Reducer<T> = (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T;
// The delay that we are waiting to consider a promise as pending
const DELAY_TO_CONSIDER_PENDING_MS = 100;
// How many promise we want to generate to test a scheduler
const PROMISE_TO_GENERATE_FOR_SCHEDULER_TEST = 10;

/**
 * Test suite for commons folder
 */
suite("Commons Tests", function () {
    test("DelayedPromise", delayedPromise);
    test("WaitingPromise", waitingPromise);
    test("Scheduler/Immediate", schedulerImmediate);
    test("Scheduler/Sequencer", schedulerSequencer);
    test("ProcessLauncher", processLaunchers);
});

/**
 * Wait for a promise during DELAY_TO_CONSIDER_PENDING_MS
 * If the promise do not resolve during this delay, the test pass
 * If the promise resolve or reject during this delay, the test fail
 * @param promise the promise to test as pending
 */
function checkPending(promise: Promise<any>): Promise<void> {
    return new Promise(async (resolve, reject) => {
        setTimeout(resolve, DELAY_TO_CONSIDER_PENDING_MS); // Called 100ms later to prove that we are still awaiting
        let resolved: boolean;
        try {
            await promise; // We should be stuck here if pending
            resolved = true;
        } catch {
            resolved = false;
        }
        // If the test fail, reject is called before resolve by timeout, so resolve have ne effect
        // If the test pass, resolve is called by timeout before reject, so reject have no effect
        reject(new Error(`DelayedPromise should not be ${resolved ? 'resolved' : 'rejected'} yet`));
    });
}

/**
 * Test DelayedPromise
 * @param this the test callback context
 */
async function delayedPromise(this: ITestCallbackContext): Promise<any> {
    // Check pending and resolve
    let dp1 = new DelayedPromise<string>();
    let result = "Some result";
    await checkPending(dp1);
    dp1.resolve(result);
    assert.strictEqual(await dp1, result);

    // Check pending and reject
    let dp2 = new DelayedPromise<string>();
    await checkPending(dp2);
    let error = new Error("Some error");
    dp2.reject(error);
    await assert.rejects(dp2, error);
}

/**
 * Test WaitingPromise
 * @param this the test callback context
 */
async function waitingPromise(this: ITestCallbackContext): Promise<any> {
    // Check pending and resolve
    let result = "Some result";
    let dp1 = new WaitingPromise<string>((resolve, _rejects) => resolve(result));
    await checkPending(dp1);
    dp1.execute();
    assert.strictEqual(await dp1, result);

    // Check pending and reject
    let error = new Error("Some error");
    let dp2 = new WaitingPromise<string>((_resolve, reject) => reject(error));
    await checkPending(dp2);
    dp2.execute();
    await assert.rejects(dp2, error);
}

/**
 * Test a scheduler
 * @param context the test callback context. Used to set timeout.
 * @param expectedOrderProvider provide a list of marker corresponding to the expecting execution order
 * @param reducer Compute a delay from a list of task delay
 * @param scheduler the scheduler to test
 */
async function scheduler(context: ITestCallbackContext, expectedOrderProvider: ExpectedOrderProvider, reducer: Reducer<number>, scheduler: Scheduler): Promise<void> {
    let indexes = Array.from(Array(PROMISE_TO_GENERATE_FOR_SCHEDULER_TEST).keys());
    let startMarkerProvider = (i: number) => `Start P${i}`;
    let stopMarkerProvider = (i: number) => `Stop P${i}`;
    let expectedOrder: string[] = expectedOrderProvider(indexes, startMarkerProvider, stopMarkerProvider);

    let executionOrder: string[] = [];
    let taskDurationGenerator = (i: number) => (PROMISE_TO_GENERATE_FOR_SCHEDULER_TEST - i) * 50; // 450, 400, 350, and so on...
    let waitingPromises = indexes.map(i => new WaitingPromise<string>((resolve, reject) => {
        executionOrder.push(startMarkerProvider(i));
        setTimeout(() => {
            executionOrder.push(stopMarkerProvider(i));
            resolve(`Result of promise #${i}`);
        }, taskDurationGenerator(i));
    }));
    context.timeout(indexes.map(taskDurationGenerator).reduce(reducer) + 2000); // 2s more than expected task execution durations
    await Promise.all(waitingPromises.map(scheduler.schedule, scheduler)); // Wait for all promises to finish
    assert.strictEqual(executionOrder.join('\n'), expectedOrder.join('\n'), `Scheduler have not scheduled operation as expected`);
}

/**
 * Test scheduler Immediate
 * @param this the test callback context
 */
function schedulerImmediate(this: ITestCallbackContext): Promise<void> {
    // Return ['Start P0', 'Start P1', 'Start P2', ..., 'Stop P2', 'Stop P1', 'Stop P0'] for any indexes
    let expectedOrder: ExpectedOrderProvider = (indexes, start, stop) => indexes.reduceRight<string[]>((accumulator, i) => {
        accumulator.unshift(start(i));
        accumulator.push(stop(i));
        return accumulator;
    }, []);
    let max: Reducer<number> = (accumulator: number, i: number) => i > accumulator ? i : accumulator;
    return scheduler(this, expectedOrder, max, new Immediate());
}

/**
 * Test scheduler Sequencer
 * @param this the test callback context
 */
function schedulerSequencer(this: ITestCallbackContext): Promise<void> {
    // Return ['Start P0', 'Stop P0', 'Start P1', 'Stop P1', 'Start P2', ...] for any indexes
    let expectedOrder: ExpectedOrderProvider = (indexes, start, stop) => indexes.reduce<string[]>((accumulator, i) => {
        accumulator.push(start(i));
        accumulator.push(stop(i));
        return accumulator;
    }, []);
    let sum: Reducer<number> = (accumulator: number, i: number) => accumulator + i;
    return scheduler(this, expectedOrder, sum, new Sequencer('My test sequencer'));
}

/**
 * Execute a command both in shell or as process using the given list of launchers
 * @param cmd the command to run
 * @param launchers the process launchers to use
 * @param overridenCwd the overriden cwd if any
 */
function executeBothMode(label: string, cmd: string, launchers: ProcessLauncher[], overridenCwd?: string): Promise<void>[] {
    // Launch all launchers in parralel
    let out: Promise<void>[] = [];
    for (let launcher of launchers) {
        // Launch shell and process mode in parralel
        out.push(launcher.executeInShell(`Test executeInShell - ${label}`, cmd, overridenCwd));
        out.push(launcher.executeProcess(`Test executeProcess - ${label}`, ['bash', '-c', cmd,], overridenCwd));
    }
    return out;
}

/**
 * Test ProcessLaunchers : TaskProcessLauncher and OutputChannelProcessLauncher
 * Test env, default cwd and overriden cwd in shell mode and process mode
 * @param this the test callback context
 */
async function processLaunchers(this: ITestCallbackContext): Promise<any> {
    this.timeout(20000); // Take 5563ms on my laptop, let's double it for releng

    // Create temporary folders
    // prefix is prefix and path of tmpdir (fs.mkdtemp API is awkward)
    let prefix = join(os.tmpdir(), 'tests-vscode-LegatoExtension-ProcessLaunchers-');
    let defaultCwd = await fs.mkdtemp(prefix);
    let overridenCwd = await fs.mkdtemp(prefix);

    // Create Launchers
    let envName = 'foo';
    let envValue = 'bar';
    let options: ProcessLauncherOptions = {
        envProvider: () => Promise.resolve({ [envName]: envValue }),
        defaultCwd: defaultCwd
    };
    let channel = new OutputChannelProcessLauncher('Unit tests output channel', options);
    let launchers: ProcessLauncher[] = [
        new TaskProcessLauncher(TaskDefinitionType.Tests, options),
        channel
    ];

    // List of promises launched in parralels
    let parralelPromises: Promise<any>[] = [];

    // Test cwd (default and overriden)
    let cwdShellTestCmdProvider = (cwd: string) => `test $(pwd) = "${cwd}"`;
    parralelPromises.push(...executeBothMode('Default CWD', cwdShellTestCmdProvider(defaultCwd), launchers));
    parralelPromises.push(...executeBothMode('Overriden CWD', cwdShellTestCmdProvider(overridenCwd), launchers, overridenCwd));

    // Test envvars
    parralelPromises.push(...executeBothMode('Envvars', `test $\{${envName}\} = "${envValue}"`, launchers));

    // Test return code
    // A rejected promise will clear the pending operations, so let's do it sequencialy by waiting for each one
    // First, wait for all previous operationq to finish
    await Promise.all(parralelPromises);
    let customReturnCode = 205;
    let expectedError = createReturnCodeError(customReturnCode);
    for (let launcher of launchers) {
        let shellPromise = launcher.executeInShell('Test executeInShell - return code', `exit ${customReturnCode}`);
        await assert.rejects(shellPromise, expectedError);
        let processPromise = launcher.executeProcess('Test executeProcess - return code', ['bash', '-c', `exit ${customReturnCode}`]);
        await assert.rejects(processPromise, expectedError);
    }

    // Dispose channel
    channel.dispose();
}
