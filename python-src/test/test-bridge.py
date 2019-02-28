import json
import os
import subprocess
from subprocess import Popen

import unittest
from pathlib import Path

from leaf import __version__


LCI_BIN = ROOT_FOLDER = Path(__file__).parent.parent / "leaf-bridge.py"


COMMAND_EXIT = "exit\n"
COMMAND_INFO = '{{"command":"info"}}\n'
COMMAND_REMOTES = '{{"command":"remotes"}}\n'
COMMAND_PACKAGES = '{{"command":"packages"}}\n'
COMMAND_PACKAGES_INSTALLED = '{{"command":"packages","args":{{"skipAvailable":true}}}}\n'
COMMAND_PACKAGES_AVAILABLE = '{{"command":"packages","args":{{"skipInstalled":true}}}}\n'
COMMAND_WORKSPACE = '{{"command":"workspaceInfo"}}\n'
COMMAND_WORKSPACE__ws = '{{"command":"workspaceInfo","workspace":"{ws}"}}\n'
COMMAND_VARIABLES__ws = '{{"command":"resolveVariables","workspace":"{ws}"}}\n'
COMMAND_VARIABLES__ws_var = '{{"command":"resolveVariables","workspace":"{ws}","args":{{"keys":["{key}"]}}}}\n'
COMMAND_VARIABLES__ws_name = '{{"command":"resolveVariables","workspace":"{ws}","args":{{"profile":"{key}"}}}}\n'


class TestLeafCodeInterface(unittest.TestCase):
    def test_info(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_INFO.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertEqual(__version__, result["result"]["version"])
            self.assertTrue(Path(result["result"]["packageFolder"]).is_dir())
            self.assertTrue(Path(result["result"]["configFolder"]).is_dir())
            self.assertTrue(Path(result["result"]["cacheFolder"]).is_dir())

    def test_remotes(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_REMOTES.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(isinstance(result["result"], dict))
            self.assertEqual(3, len(result["result"]))

    def test_packages(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_PACKAGES.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(isinstance(result["result"], dict))
            self.assertEqual(len(result["result"]), 2)
            self.assertTrue(isinstance(result["result"]["installedPackages"], dict))
            self.assertTrue(isinstance(result["result"]["availablePackages"], dict))
            self.assertGreater(len(result["result"]["installedPackages"]), 1)
            self.assertGreater(len(result["result"]["availablePackages"]), 1)

        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_PACKAGES_AVAILABLE.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(isinstance(result["result"], dict))
            self.assertEqual(len(result["result"]), 1)
            self.assertTrue(isinstance(result["result"]["availablePackages"], dict))
            self.assertGreater(len(result["result"]["availablePackages"]), 1)

        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_PACKAGES_INSTALLED.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(isinstance(result["result"], dict))
            self.assertEqual(len(result["result"]), 1)
            self.assertTrue(isinstance(result["result"]["installedPackages"], dict))
            self.assertGreater(len(result["result"]["installedPackages"]), 1)

    def test_workspace(self):
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=COMMAND_WORKSPACE.format().encode())
            result = json.loads(outs.decode())
            self.assertIsNotNone(result.get("error"))
            self.assertIsInstance(result.get("error"), dict)
            self.assertIsInstance(result.get("error").get("type"), str)
            self.assertIsInstance(result.get("error").get("message"), str)

        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_WORKSPACE__ws.format(ws="/foo/bar")).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertFalse(result["result"]["initialized"])

        workspace = os.getenv("LEAF_TEST_WORKSPACE")
        self.assertIsNotNone(workspace)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_WORKSPACE__ws.format(ws=workspace)).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(result["result"]["initialized"])
            self.assertEqual(workspace, result["result"]["rootFolder"])
            self.assertEqual(1, len(result["result"]["profiles"]))

    def test_variables(self):
        workspace = os.getenv("LEAF_TEST_WORKSPACE")
        self.assertIsNotNone(workspace)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws.format(ws=workspace)).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(len(result["result"]) > 10)
            self.assertEqual("192.168.2.2", result["result"]["DEST_IP"])
            self.assertEqual("wp76xx", result["result"]["LEGATO_TARGET"])
            self.assertFalse("FOO" in result["result"])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_name.format(ws=workspace, key="SWI-WP76")).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertTrue(len(result["result"]) > 10)
            self.assertEqual("192.168.2.2", result["result"]["DEST_IP"])
            self.assertEqual("wp76xx", result["result"]["LEGATO_TARGET"])
            self.assertFalse("FOO" in result["result"])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_name.format(ws=workspace, key="FOOO")).encode())
            result = json.loads(outs.decode())
            self.assertEqual("InvalidProfileNameException", result.get("error").get("type"))
            self.assertEqual("Unknown profile FOOO", result.get("error").get("message"))
            self.assertFalse("result" in result)
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_var.format(ws=workspace, key="DEST_IP")).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertEqual(1, len(result["result"]))
            self.assertEqual("192.168.2.2", result["result"]["DEST_IP"])
        with Popen([str(LCI_BIN)], stdout=subprocess.PIPE, stdin=subprocess.PIPE) as proc:
            outs, errs = proc.communicate(input=(COMMAND_VARIABLES__ws_var.format(ws=workspace, key="FOO")).encode())
            result = json.loads(outs.decode())
            self.assertIsNone(result.get("error"))
            self.assertEqual(1, len(result["result"]))
            self.assertEqual(None, result["result"]["FOO"])
