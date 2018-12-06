import * as assert from 'assert';
import { LanguageClient } from 'vscode-languageclient';
import { LegatoLanguageManager } from '../legato/legatoLanguage';

/**
 * Tests suite to validate Legato language integration
 */
suite("Legato Languages Tests", function () {
    test(`Legato language client integration`, function (done) {
        const legatoLanguageManager = new LegatoLanguageManager();
        legatoLanguageManager.startLegatoServer(true).then((client:LanguageClient) => {
            let disposable = client.start();
            assert.equal((<LanguageClient>client).initializeResult, undefined);
            client.onReady().then(_ => {
                try {
                    let expected = {
                        capabilities:
                        {
                            definitionProvider: true,
                            documentHighlightProvider: true,
                            documentSymbolProvider: true,
                            foldingRangeProvider: true,
                            textDocumentSync: 1,
                            completionProvider: {
                                resolveProvider: true
                            }
                        }
                    };
                    assert.deepEqual(client.initializeResult, expected);
                } catch (e) {
                    disposable.dispose();
                    done(e);
                }
                done();
            }, e => {
                disposable.dispose();
                done(e);
            });
        });
    }).timeout(20000);
});
