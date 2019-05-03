#!/usr/bin/env python3
# LEAF_DESCRIPTION vscode plugin interface
"""
Leaf Package Manager

@author:    Legato Tooling Team <letools@sierrawireless.com>
@copyright: Sierra Wireless. All rights reserved.
@contact:   Legato Tooling Team <letools@sierrawireless.com>
@license:   https://www.mozilla.org/en-US/MPL/2.0/
"""

import json
import subprocess
import sys
import traceback
from abc import ABC, abstractmethod
from pathlib import Path

from leaf import __version__
from leaf.api import PackageManager, RemoteManager, WorkspaceManager
from leaf.core.constants import LeafSettings
from leaf.core.error import WorkspaceNotInitializedException
from leaf.core.jsonutils import jloads
from leaf.model.environment import Environment
from leaf.model.tags import TagUtils


class LeafHandler(ABC):
    """
    Generic class to define handlers
    """

    def get_ws_folder(self, **kwargs):
        out = kwargs["workspace"]
        if out is None:
            raise ValueError("Missing workspace in request")
        return Path(out)

    @abstractmethod
    def get_name(self):
        pass

    @abstractmethod
    def execute(self, **kwargs):
        pass


class RemotesHandler(LeafHandler):
    """
    Input Payload:
    {
        "command": "remotes"
    }
    """

    def get_name(self):
        return "remotes"

    def execute(self, **kwargs):
        rm = RemoteManager()
        out = {}
        for alias, remote in rm.list_remotes().items():
            out[alias] = remote.json
            if remote.is_fetched:
                out[alias]["info"] = remote.info_node
        return out


class PackagesHandler(LeafHandler):
    """
    Input Payload:
    {
        "command": "packages",
        "args": {
            "skipInstalled": true, // Optional, default false
            "skipAvailable": true // Optional, default false
        }
    }
    """

    def get_name(self):
        return "packages"

    def execute(self, **kwargs):
        pm = PackageManager()
        ipmap = None
        apmap = None
        if "skipInstalled" not in kwargs or not kwargs["skipInstalled"]:
            ipmap = pm.list_installed_packages()
        if "skipAvailable" not in kwargs or not kwargs["skipAvailable"]:
            apmap = pm.list_available_packages()

        # if we have install & available packages, tag packages:
        if ipmap is not None and apmap is not None:
            mflist = list(ipmap.values()) + list(apmap.values())
            TagUtils.tag_latest(mflist)
            TagUtils.tag_installed(apmap.values(), ipmap.keys())
        out = {}
        # Build the output list
        if ipmap is not None:
            out["installedPackages"] = {}
            for pi, ip in ipmap.items():
                data = ip.json
                data["folder"] = str(ip.folder)
                data["info"]["customTags"] = ip.custom_tags
                out["installedPackages"][str(pi)] = data
        if apmap is not None:
            out["availablePackages"] = {}
            for pi, ap in apmap.items():
                data = ap.json
                data["remoteUrl"] = ap.url
                data["info"]["customTags"] = ap.custom_tags
                out["availablePackages"][str(pi)] = data
        return out


class WorkspaceHandler(LeafHandler):
    """
    Input Payload:
    {
        "command": "workspaceInfo",
        "workspace": "/path/to/workspace"
    }
    """

    def get_name(self):
        return "workspaceInfo"

    def execute(self, **kwargs):
        wm = WorkspaceManager(self.get_ws_folder(**kwargs))
        out = {}
        out["rootFolder"] = str(wm.ws_root_folder)
        if wm.is_initialized:
            out["initialized"] = True
            out["profiles"] = {}
            for pfname, pf in wm.list_profiles().items():
                out["profiles"][pfname] = pf.json
                out["profiles"][pfname]["current"] = pf.is_current
        else:
            out["initialized"] = False
        return out


class VariablesHandler(LeafHandler):
    """
    Input Payload:
    {
        "command": "resolveVariables",
        "workspace": "/path/to/workspace",
        "args": {
            "profile": "OptionalProfileName",
            "keys": ["optional", "keys"]
        }
    }
    """

    def get_name(self):
        return "resolveVariables"

    def execute(self, **kwargs):
        out = {}
        wm = WorkspaceManager(self.get_ws_folder(**kwargs))
        if not wm.is_initialized:
            raise WorkspaceNotInitializedException()
        profile = wm.get_profile(kwargs["profile"] if "profile" in kwargs else wm.current_profile_name)
        wm.is_profile_sync(profile, raise_if_not_sync=True)

        pf_env = wm.build_full_environment(profile)
        command = ""
        for key, value in pf_env.tolist():
            command += Environment.tostring_export(key, value)
        command += " env"

        lines = subprocess.check_output(["sh", "-c", command]).decode().splitlines()

        def find_value(key, lines):
            for line in lines:
                if line.startswith(key + "="):
                    return line[len(key) + 1 :]

        for k in kwargs.get("keys", pf_env.keys()):
            out[k] = find_value(k, lines)
        return out


class InfoHandler(LeafHandler):
    """
    Input Payload:
    {
        "command": "info"
    }
    """

    def get_name(self):
        return "info"

    def execute(self, **kwargs):
        out = {}
        pm = PackageManager()
        out["version"] = __version__
        out["configFolder"] = str(pm.configuration_folder)
        out["cacheFolder"] = str(pm.cache_folder)
        out["packageFolder"] = str(pm.install_folder)
        return out


def send_response(request_id, result=None, error=None):
    out = {}
    if request_id is not None:
        out["id"] = request_id
    if error is not None:
        out["error"] = {"type": type(error).__name__, "message": str(error)}
    elif result is not None:
        out["result"] = result
    print(json.dumps(out), flush=True)


if __name__ == "__main__":
    handlers = {}
    for handler in (InfoHandler(), RemotesHandler(), PackagesHandler(), WorkspaceHandler(), VariablesHandler()):
        handlers[handler.get_name()] = handler

    for line in sys.stdin:
        line = line.strip()
        if line.lower() == "exit":
            # On 'exit' keyword, end loop
            print("Stop leaf binding", flush=True)
            break
        # Ignore blank lines
        if line != "":
            try:
                json_data = jloads(line)
                request_id = json_data.get("id")
                request_command = json_data.get("command")
                request_workspace = json_data.get("workspace")
                request_args = json_data.get("args", {})
                try:
                    if request_command is None:
                        raise ValueError("Missing command in request")
                    if request_command not in handlers:
                        raise ValueError("Unknown command: {command}".format(command=request_command))
                    handler = handlers[request_command]
                    send_response(request_id, result=handler.execute(workspace=request_workspace, **request_args))
                except Exception as e:
                    send_response(request_id, error=e)
                    if LeafSettings.DEBUG_MODE.as_boolean():
                        traceback.print_exc(file=sys.stderr)
                        sys.stderr.flush()
            except Exception as e:
                print("Invalid leaf request: {line} ({error})".format(line=line, error=e))
                if LeafSettings.DEBUG_MODE.as_boolean():
                    traceback.print_exc(file=sys.stderr)
                    sys.stderr.flush()
