//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import { LeafManager } from '../leaf/leafCore';

const leafManager: LeafManager = LeafManager.getInstance();
const LEAF_TIMEOUT:number = 7000;

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Leaf Tests", function () {

    // Defines a Mocha unit test
    test(`Check Leaf installation`, function () {
        console.log(`WORKSPACE: ${process.env.CODE_TESTS_WORKSPACE}`)
        leafManager.getLeafPath().then((path: string) => assert.ok(path, 'Leaf installation checked successfully')).catch((reason: any) =>
            assert.fail(`Leaf is not installed`));
    });

    test(`List profiles`, function(done) {
        this.timeout(LEAF_TIMEOUT);
        leafManager.listProfiles().then(profiles=> {
            console.log(`Found profiles: ${profiles}`);
            assert.notEqual(profiles, undefined, `No profile found`);
            done();
        }).catch( (reason) => {
            assert.fail(`Failed to get profiles - reason: ${reason}`);
         });
     });

});