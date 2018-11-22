import json
import os
import subprocess
from subprocess import Popen

import unittest
from pathlib import Path

from leaf import __version__


LCI_BIN = ROOT_FOLDER = Path(__file__).parent.parent / "leaf-codeInterface.py"


COMMAND_EXIT = "exit\n"
COMMAND_INFO = '{"command":"info"}\n'
COMMAND_REMOTES = '{"command":"remotes"}\n'
COMMAND_INSTALLED = '{"command":"installedPackages"}\n'
COMMAND_AVAILABLE = '{"command":"availablePackages"}\n'
COMMAND_WORKSPACE = '{"command":"workspaceInfo"}\n'
COMMAND_WORKSPACE__ws = '{"command":"workspaceInfo","workspace":"%s"}\n'
COMMAND_VARIABLES__ws = '{"command":"resolveVariables","workspace":"%s"}\n'
COMMAND_VARIABLES__ws_var = '{"command":"resolveVariables","workspace":"%s","args":{"keys":["%s"]}}\n'
COMMAND_VARIABLES__ws_name = '{"command":"resolveVariables","workspace":"%s","args":{"profile":"%s"}}\n'


class TestLeafCodeInterface(unittest.TestCase):

    def testInfo(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_INFO.encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertEqual(__version__, result['result']['version'])
            self.assertTrue(Path(result['result']['packageFolder']).is_dir())
            self.assertTrue(Path(result['result']['configFolder']).is_dir())
            self.assertTrue(Path(result['result']['cacheFolder']).is_dir())

    def testRemotes(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_REMOTES.encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(isinstance(result['result'], dict))
            self.assertEqual(3, len(result['result']))

    def testAvailable(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_AVAILABLE.encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(isinstance(result['result'], dict))
            self.assertGreater(len(result['result']), 1)

    def testInstalled(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_INSTALLED.encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(isinstance(result['result'], dict))

    def testWorkspace(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_WORKSPACE.encode())
            result = json.loads(outs.decode())
            self.assertIsNotNone(result.get('error'))

        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_WORKSPACE__ws % '/foo/bar').encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertFalse(result['result']['initialized'])

        workspace = os.getenv("LEAF_TEST_WORKSPACE")
        self.assertIsNotNone(workspace)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_WORKSPACE__ws % workspace).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(result['result']['initialized'])
            self.assertEqual(workspace, result['result']['rootFolder'])
            self.assertEqual(1, len(result['result']['profiles']))

    def testVariables(self):
        workspace = os.getenv("LEAF_TEST_WORKSPACE")
        self.assertIsNotNone(workspace)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws % workspace).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(len(result['result']) > 10)
            self.assertEqual("192.168.2.2", result['result']['DEST_IP'])
            self.assertEqual("wp76xx", result['result']['LEGATO_TARGET'])
            self.assertFalse('FOO' in result['result'])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_name % (workspace, "SWI-WP76")).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertTrue(len(result['result']) > 10)
            self.assertEqual("192.168.2.2", result['result']['DEST_IP'])
            self.assertEqual("wp76xx", result['result']['LEGATO_TARGET'])
            self.assertFalse('FOO' in result['result'])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_name % (workspace, "FOOO")).encode())
            result = json.loads(outs.decode())
            self.assertEqual("Unknown profile FOOO", result['error'])
            self.assertFalse('result' in result)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_var % (workspace, 'DEST_IP')).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertEqual(1, len(result['result']))
            self.assertEqual("192.168.2.2", result['result']['DEST_IP'])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_var % (workspace, 'FOO')).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get('error'))
            self.assertEqual(1, len(result['result']))
            self.assertEqual(None, result['result']['FOO'])
