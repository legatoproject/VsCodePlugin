//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import { Task, TaskExecution, TaskProcessEndEvent, tasks, Uri, workspace } from 'vscode';
import { LeafManager } from '../leaf/leafCore';
import { LegatoManager } from '../legato/legatoCore';

const leafManager: LeafManager = LeafManager.getInstance();
const LEAF_TIMEOUT: number = 10000;
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

suite("Leaf Tests", function () {
    // Defines a Mocha unit test
    test(`Check Leaf installation`, function () {
        console.log(`WORKSPACE: ${process.env.CODE_TESTS_WORKSPACE}`);
        leafManager.getLeafPath().then((path: string) => assert.ok(path, 'Leaf installation checked successfully')).catch((reason: any) =>
            assert.fail(`Leaf is not installed`));
    });

    test(`List profiles`, function (done) {
        this.timeout(LEAF_TIMEOUT);
        leafManager.listProfiles().then(profiles => {
            console.log(`Found profiles: ${profiles}`);
            assert.notEqual(profiles, undefined, `No profile found`);
            done();
        }).catch((reason) => {
            assert.fail(`Failed to get profiles - reason: ${reason}`);
        });
    });
});

suite("Legato Tests", function () {
    test(`List sdef files`, function (done) {
        LegatoManager.getInstance().listSdefs().then((files) => {
            files.forEach((uri: Uri) => { console.log(`SDEF=${uri.path}`); });
            console.log(`Workspace scanned:${workspace.rootPath} - SDEF found:${files.length}`);
            assert.notEqual(files.length, 0, "To continue, ensure at least one SDEF is provided in the workspace");
            LegatoManager.getInstance().setActiveSdef(files[0]);
            done();
        });
    });

    test(`Buid active sdef`, function (done) {
        let sdefUri = LegatoManager.getInstance().getActiveSdef();
        assert.notEqual(sdefUri, undefined, "To continue, ensure an active SDEF is present in the workspace");
        this.timeout(300000);
        let fetchedTasks = tasks.fetchTasks();
        fetchedTasks.then((result: Task[]) => {
            result.forEach((t: Task) => {
                if (t.name === "mksys") {
                    console.log("Execute mksys task...");
                    tasks.executeTask(t).then((taskExec: TaskExecution) => {
                        //on success build, assert OK
                        tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
                            if (event.execution.task === t) {
                                console.log(`Build terminated with exitCode:${event.exitCode}`);
                                assert.equal(0, event.exitCode, `Build successfully ended`);
                                done();
                            }
                        });
                    });
                }
            });
        });
    });
});