#!/usr/bin/env python3
# LEAF_DESCRIPTION vscode plugin interface
'''
Leaf Package Manager

@author:    Legato Tooling Team <letools@sierrawireless.com>
@copyright: Sierra Wireless. All rights reserved.
@contact:   Legato Tooling Team <letools@sierrawireless.com>
@license:   https://www.mozilla.org/en-US/MPL/2.0/
'''

import json
import os
import subprocess
import sys
import traceback
from abc import ABC, abstractmethod
from collections import OrderedDict
from pathlib import Path

from leaf import __version__
from leaf.constants import EnvConstants
from leaf.core.packagemanager import PackageManager, RemoteManager
from leaf.core.tags import TagManager
from leaf.core.workspacemanager import WorkspaceManager
from leaf.format.logger import Verbosity


LEAF_DEBUG = os.getenv(EnvConstants.DEBUG_MODE, "") != ""


class LeafHandler(ABC):
    '''
    Generic class to define handlers
    '''
    def _getWorkspace(self, **kwargs):
        out = kwargs['workspace']
        if out is None:
            raise ValueError("Missing workspace in request")
        return Path(out)

    @abstractmethod
    def getName(self):
        pass

    @abstractmethod
    def execute(self, **kwargs):
        pass


class RemotesHandler(LeafHandler):
    '''
    Input Payload:
    {
        "command": "remotes"
    }
    '''

    def getName(self):
        return "remotes"

    def execute(self, **kwargs):
        rm = RemoteManager(Verbosity.QUIET)
        out = {}
        for alias, remote in rm.listRemotes().items():
            out[alias] = remote.json
            if remote.isFetched():
                out[alias]['info'] = remote.getInfo()
        return out


class PackagesHandler(LeafHandler):
    '''
    Input Payload:
    {
        "command": "packages"
        "args": {
            "skipInstalled": true, // Optional, default false
            "skipAvailable": true // Optional, default false
        }
    }
    '''

    def getName(self):
        return "packages"

    def execute(self, **kwargs):
        pm = PackageManager(Verbosity.QUIET)
        ipMap = None
        apMap = None
        if 'skipInstalled' not in kwargs or not kwargs['skipInstalled']:
            ipMap = pm.listInstalledPackages()
        if 'skipAvailable' not in kwargs or not kwargs['skipAvailable']:
            apMap = pm.listAvailablePackages()
        
        # if we have install & available packages, tag packages:
        if ipMap is not None and apMap is not None:
            mfList = list(ipMap.values()) + list(apMap.values())
            TagManager().tagLatest(mfList)
            TagManager().tagInstalled(apMap.values(), ipMap)
        out = {}
        # Build the output list
        if ipMap is not None:
            out['installedPackages'] = {}
            for pi, ip in ipMap.items():
                data = ip.json
                data['folder'] = str(ip.folder)
                data['info']['customTags'] = ip.customTags
                out['installedPackages'][str(pi)] = data
        if apMap is not None:
            out['availablePackages'] = {}
            for pi, ap in apMap.items():
                data = ap.json
                data['remoteUrl'] = ap.remoteUrl
                data['info']['customTags'] = ap.customTags
                out['availablePackages'][str(pi)] = data
        return out


class WorkspaceHandler(LeafHandler):
    '''
    Input Payload:
    {
        "command": "workspaceInfo",
        "workspace": "/path/to/workspace"
    }
    '''

    def getName(self):
        return "workspaceInfo"

    def execute(self, **kwargs):
        wm = WorkspaceManager(self._getWorkspace(**kwargs), Verbosity.QUIET)
        out = {}
        out['rootFolder'] = str(wm.workspaceRootFolder)
        if wm.isWorkspaceInitialized():
            out['initialized'] = True
            out['profiles'] = {}
            for pfName, pf in wm.listProfiles().items():
                out['profiles'][pfName] = pf.json
                out['profiles'][pfName]['current'] = pf.isCurrentProfile
        else:
            out['initialized'] = False
        return out


class VariablesHandler(LeafHandler):
    '''
    Input Payload:
    {
        "command": "resolveVariables",
        "workspace": "/path/to/workspace",
        "args": {
            "profile": "OptionalProfileName",
            "keys": ["optional", "keys"]
        }
    }
    '''

    def getName(self):
        return "resolveVariables"

    def execute(self, **kwargs):
        out = {}
        wm = WorkspaceManager(self._getWorkspace(**kwargs), Verbosity.QUIET)
        if not wm.isWorkspaceInitialized():
            raise ValueError("Workspace %s is not initialized" % wm.workspaceRootFolder)
        profile = wm.getProfile(kwargs['profile'] if 'profile' in kwargs else wm.getCurrentProfileName())
        if not wm.isProfileSync(profile):
            raise ValueError("Profile %s is out of sync" % profile.name)
        exports = ""
        profileEnv = wm.getFullEnvironment(profile)
        exports = "; ".join(map(lambda kv: 'export %s="%s"' % kv, profileEnv.toList()))
        lines = subprocess.check_output(["sh", "-c", exports + ' && env']).decode().splitlines()

        def findValue(key, lines):
            for line in lines:
                if line.startswith(key + "="):
                    return line[len(key) + 1:]

        for k in kwargs.get('keys', profileEnv.keys()):
            out[k] = findValue(k, lines)
        return out


class InfoHandler(LeafHandler):
    '''
    Input Payload:
    {
        "command": "info"
    }
    '''

    def getName(self):
        return "info"

    def execute(self, **kwargs):
        out = {}
        pm = PackageManager(Verbosity.QUIET)
        out['version'] = __version__
        out['configFolder'] = str(pm.configurationFolder)
        out['cacheFolder'] = str(pm.cacheFolder)
        out['packageFolder'] = str(pm.getInstallFolder())
        return out


def sendResponse(requestId, result=None, error=None):
    out = {}
    if requestId is not None:
        out["id"] = requestId
    if error is not None:
        out["error"] = error
    elif result is not None:
        out["result"] = result
    print(json.dumps(out), flush=True)


if __name__ == '__main__':
    handlers = {}
    for handler in (InfoHandler(),
                    RemotesHandler(),
                    PackagesHandler(),
                    WorkspaceHandler(),
                    VariablesHandler()):
        handlers[handler.getName()] = handler

    for line in sys.stdin:
        line = line.strip()
        if line.lower() == "exit":
            # On 'exit' keyword, end loop
            print("Stop leaf binding", flush=True)
            break
        # Ignore blank lines
        if line != "":
            try:
                jsonObject = json.loads(line)
                requestId = jsonObject.get("id")
                requestCommand = jsonObject.get("command")
                requestWorkspace = jsonObject.get("workspace")
                requestArgs = jsonObject.get("args", {})
                try:
                    if requestCommand is None:
                        raise ValueError("Missing command in request")
                    if requestCommand not in handlers:
                        raise ValueError("Unknown command: %s" % requestCommand)
                    handler = handlers[requestCommand]
                    sendResponse(requestId,
                                 result=handler.execute(workspace=requestWorkspace, **requestArgs))
                except Exception as e:
                    sendResponse(requestId, error=str(e))
                    if LEAF_DEBUG:
                        traceback.print_exc(file=sys.stderr)
                        sys.stderr.flush()
            except Exception as e:
                print("Invalid leaf request: %s (%s)" % (line, e), flush=True)
                if LEAF_DEBUG:
                    traceback.print_exc(file=sys.stderr)
                    sys.stderr.flush()