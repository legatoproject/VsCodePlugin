//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import { Task, TaskExecution, TaskProcessEndEvent, tasks, Uri, workspace } from 'vscode';
import { LeafManager, LEAF_TASKS } from '../leaf/core';
import { LegatoManager, LEGATO_MKTOOLS } from '../legato/core';
import { ITestCallbackContext } from 'mocha';
import { listDefinitionFiles } from '../legato/files';

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
        leafManager.getLeafPath().then((path: string | undefined) => assert.ok(path, 'Leaf installation checked successfully')).catch((reason: any) =>
            assert.fail(`Leaf is not installed`));
    });

    test(`List profiles`, function (done) {
        this.timeout(LEAF_TIMEOUT);
        leafManager.getProfiles().then(profiles => {
            profiles = Object.keys(profiles);
            console.log(`Found profiles: ${profiles}`);
            assert.notEqual(profiles, undefined, `No profile found`);
            done();
        }).catch((reason) => {
            assert.fail(`Failed to get profiles - reason: ${reason}`);
        });
    });

    const EXPECTED_IP_ADRESS = "10.0.0.1";
    test(`Set DEST_IP`, function (done) {
        this.timeout(LEAF_TIMEOUT);
        let alreadyProcessed: boolean = false;
        tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
            console.log(`EVENT#TASK=${event.execution.task.name}`);
            if (event.execution.task.name === LEAF_TASKS.setEnv && !alreadyProcessed) {
                alreadyProcessed = true;
                if (event.exitCode === 0) {
                    done();
                } else {
                    done(new Error(`Failed to set IP to ${EXPECTED_IP_ADRESS}`));
                }
            }
        });
        this.slow(2000);
        leafManager.setEnvValue("DEST_IP", EXPECTED_IP_ADRESS);
    });


    test(`Get DEST_IP value`, function (done) {
        this.timeout(30000);
        this.slow(2000);
        leafManager.getEnvValue("DEST_IP").then((ip: string | undefined) => {
            if (ip) {
                console.log("DEST_IP=" + ip);
                assert.equal(ip, EXPECTED_IP_ADRESS);
                done();
            }
        }).catch((reason: any) => {
            console.log(`Failed to get IP - reason: ${reason}`);
        });
    });
});

suite("Legato Tests", function () {
    test(`List def files`, function (done) {
        listDefinitionFiles().then((files) => {
            files.forEach((uri: Uri) => { console.log(`DEF_FILE=${uri.path}`); });
            console.log(`Workspace scanned:${workspace.rootPath} - DEF found:${files.length}`);
            assert.notEqual(files.length, 0, "To continue, ensure at least one definition file is provided in the workspace");
            LegatoManager.getInstance().saveActiveDefFile(files[0]);
            done();
        });
    });

    test(`Buid active SDEF file`, function (done) {
        buildActiveDefFile(this, (uri: Uri) => {
            return (uri !== undefined) ?
                require('path').basename(uri.fsPath) === "test.sdef" : undefined;
        }, LEGATO_MKTOOLS.mksys, done);

    });

    test(`Buid active ADEF file`, function (done) {
        buildActiveDefFile(this, (uri: Uri) => {
            if (uri) {
                return require('path').basename(uri.fsPath) === "helloWorld.adef";
            }
        }, LEGATO_MKTOOLS.mkapp, done);
    });

    function buildActiveDefFile(testCallback: ITestCallbackContext, defFileFilter: any, expectedMktool: string, done: MochaDone) {
        listDefinitionFiles().then((files) => {
            let foundSdef: Uri | undefined = files.find(defFileFilter);
            if (foundSdef) {
                let alreadyProcessed: boolean = false;
                tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
                    if (event.execution.task.name === LEAF_TASKS.setEnv && !alreadyProcessed) {
                        alreadyProcessed = true;
                        if (event.exitCode === 0) {
                            console.log(`Building active definition file \'${foundSdef ? require('path').basename(foundSdef.fsPath) : "N/A"}\'`);
                            let fetchedTasks = tasks.fetchTasks();
                            fetchedTasks.then((result: Task[]) => {
                                result.forEach((t: Task) => {
                                    if (t.name === expectedMktool) {
                                        console.log(`Legato build task ${t.name}... `);
                                        tasks.executeTask(t).then((taskExec: TaskExecution) => {
                                            //on success build, assert OK
                                            tasks.onDidEndTaskProcess((event: TaskProcessEndEvent) => {
                                                if (event.execution.task === t) {
                                                    console.log(`Build terminated with exitCode:${event.exitCode}`);
                                                    if (event.exitCode !== 0) {
                                                        done(new Error(`Build failed: ${event.exitCode}`));
                                                        assert.equal(0, event.exitCode, `Build successfully ended`);
                                                    }
                                                    done();
                                                }
                                            });
                                        });
                                    }
                                });
                            });
                        } else {
                            done(new Error(`Failed to set active def file ${foundSdef}`));
                        }
                    }
                });

                LegatoManager.getInstance().saveActiveDefFile(foundSdef);
                testCallback.timeout(300000);

            } else {
                assert.fail("To continue, ensure at least one definition file is provided in the workspace");
            }
        });
    }
});