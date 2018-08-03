import { genLaunchConfig, setTasks } from './cfgTemplates';
import { workspace, window, Uri } from 'vscode';

export function updateLaunchJson(folder:Uri, sdefData:any, appname: string, target: string, gdbpath: string){
    let launchJson = workspace.getConfiguration("launch", window.activeTextEditor.document.uri);
    let config_arr = launchJson.get("configurations",[]);
    let launchConfigName = "[Legato] GDB Remote Debug";
    let unrelatedConfigs = config_arr.filter((x:any) => x['name'] !== launchConfigName); // the ones we want to preserve
    let newConfig = genLaunchConfig(sdefData['name'],appname, target, gdbpath, launchConfigName);
    launchJson.update("configurations", unrelatedConfigs.concat([newConfig]));
    console.log(launchJson);
}

export function updateTasks(folder: Uri, sdefPath: string, appname:string, target: string, legatoroot:string, destIP?:string, exeName?:string){
    let tasksJson = workspace.getConfiguration("tasks", window.activeTextEditor.document.uri);
    let tasks_arr = tasksJson.get("tasks",[]);
    setTasks(tasks_arr,sdefPath,appname,target,legatoroot,destIP,exeName);
    tasksJson.update("version", "2.0.0");
    tasksJson.update("tasks", tasks_arr);
}