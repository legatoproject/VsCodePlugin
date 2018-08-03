import { basename } from "path";

// launch.json root template
let launchJson: { version: string; configurations: Object[] } = {
  version: "0.2.0",
  configurations: []
};

export function genLaunchConfig(
  sdefName:string,
  appName: string,
  target: string,
  toolchainPath: string,
  configName: string,
  exeName?: string

) {
  exeName = exeName || appName + "Exe";
  return {
    name: configName,
    type: "cppdbg",
    request: "launch",
    cwd: "../",

    miDebuggerServerAddress: "localhost:9091",
    program: `\${workspaceRoot}/_build_${sdefName}/${target}/app/${appName}/staging/read-only/bin/${exeName}`,
    //preLaunchTask: "legato.startGDBServer",
    //"postDebugTask": "stopApp",
    miDebuggerPath: toolchainPath,
    MIMode: "gdb",
    setupCommands: [
      // {
      //     "text": "-gdb-set solib-search-path ${workspaceRoot}/_build_DmitryApp/wp85/app/DmitryApp/staging/read-only/lib/",
      //     "description": "set so search path"
      // },
      {
        text: "-gdb-set sysroot remote:/",
        description: "set sysroot",
        ignoreFailures: true
      }
    ],
    logging: { trace: true, traceResponse: true, engineLogging: true }
    // "stopAtEntry": true
  };
}

// tasks.json
let tasksJson: { version: string; tasks: Object[] } = {
  // See https://go.microsoft.com/fwlink/?LinkId=733558
  // for the documentation about the tasks.json format
  version: "2.0.0",
  tasks: []
};

// helper function to simultaneously set the identifier property
// and update it in the dict with the same identifier as the key
// so you don't have to type it twice
function updateWithIdent(dict: any, ident: string, data: any) {
  data["identifier"] = ident;
  dict[ident] = data;
}

export function setTasks(
  tasks_arr: any[],
  sdefPath: string,
  appName: string,
  target: string,
  legatoRoot: string,
  destIP?: string,
  exeName?: string
) {
  exeName = exeName || appName + "Exe";
  destIP = destIP || "192.168.2.2";
  let env = {
    DEST_IP: destIP,
    APP: appName,
    LEGATO_ROOT: legatoRoot
  };

  let builtSdefPath = `${basename(sdefPath, ".sdef")}.${target}.update`;
  let legato_tasks_dict: { [index: string]: any } = {};

  // pull out any legato tasks from the array
  tasks_arr
    .filter(
      x => "identifier" in x && (<string>x["identifier"]).startsWith("legato.")
    )
    .forEach(x => {
      legato_tasks_dict[x.identifier] = x;
      let index = tasks_arr.indexOf(x) ;
       tasks_arr.splice(index, 1);
    });

  // update or set said legato tasks
  updateWithIdent(legato_tasks_dict, "legato.startGDBServer", {
    label: "Start GDB Server",
    type: "shell",
    command:
      `ssh -L9091:localhost:9091 root@$DEST_IP "sh -c \\"source /etc/profile; watch -g 'legato status 2>/dev/null | grep tried.*current'; sleep 1; app stop $APP; sleep 1; logger @@@@@@GDBCFG@@@@@@@@@@; gdbCfg $APP; logger @@@@@@@@@@@@; app runProc $APP --exe=/bin/gdbserver -- localhost:9091 /bin/${exeName}  \\""`,
    dependsOn: "legato.gdbCfg",
    options: {
      env: env
    },
    isBackground: true,
    problemMatcher: {
      owner: "custom",
      pattern: {
        regexp: "_________________"
      },
      background: {
        activeOnStart: true,
        beginsPattern: "_____________",
        endsPattern: "^.*Listening on port.*$"
      }
    }
  });

  updateWithIdent(legato_tasks_dict, "legato.gdbCfg", {
    label: "Configure GDB Server",
    type: "shell",
    command:
      `ssh -L9091:localhost:9091 root@$DEST_IP "sh -c \\"
      source /etc/profile;
      until app start $APP; do echo 'Failed to start app... retrying'; sleep 1; done;
      app stop $APP; 
      gdbCfg $APP \\""`,
    dependsOn: "legato.updateSystem",
    options: {
      env: env
    },
  });

  updateWithIdent(legato_tasks_dict, "legato.stopApp", {
    label: "Stop App",
    type: "shell",
    command: "$LEGATO_ROOT/bin/app stop $APP",
    options: {
      env: env
    },
    problemMatcher: []
  });

  updateWithIdent(legato_tasks_dict, "legato.updateSystem", {
    label: "Install System",
    type: "shell",
    dependsOn: "legato.buildSystem",
    command:
      "$LEGATO_ROOT/bin/update ${workspaceRoot}/" + builtSdefPath,
    options: {
      env: env
    },
    group: {
      kind: "build",
      isDefault: true
    }
  });

  updateWithIdent(legato_tasks_dict, "legato.buildSystem", {
    label: "Build System",
    type: "shell",
    command: // TODO: replace with leaf shell
      `cd $LEGATO_ROOT; source bin/configlegatoenv; cd - ; $LEGATO_ROOT/bin/mksys -t ${target} -C "-g" ${sdefPath} `,
    options: {
      env: env
    },
    problemMatcher: {
      fileLocation: "absolute",
      base: "$gcc"
    }
  });

  updateWithIdent(legato_tasks_dict, "legato.readLogs", {
    label: "Read Logs",
    type: "shell",
    command: "ssh root@$DEST_IP /sbin/logread -f",
    options: {
      env: env
    }
  });

  // now add them back to the array
  Object.keys(legato_tasks_dict).forEach(k => {
    tasks_arr.push(legato_tasks_dict[k]);
  });
}
