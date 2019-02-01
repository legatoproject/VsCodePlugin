/*import * as assert from 'assert';
import { LanguageClient } from 'vscode-languageclient';
import { extPromise } from '../extension';

**
 * Tests suite to validate Legato language integration
 *
suite("Legato Languages Tests", function () {
    test(`Legato language client integration`, async function () {
        const legatoLanguageManager = (await extPromise).legatoLanguageManager;
        let lspClient: LanguageClient = await legatoLanguageManager.lspClientPromise;

        assert.equal(lspClient.initializeResult, undefined);
        await lspClient.onReady();
        let expected = {
            capabilities: {
                definitionProvider: true,
                documentHighlightProvider: true,
                documentSymbolProvider: true,
                foldingRangeProvider: true,
                textDocumentSync: 1,
                completionProvider: { resolveProvider: true }
            }
        };
        assert.deepEqual(lspClient.initializeResult, expected);
    }).timeout(60000);
});*/
