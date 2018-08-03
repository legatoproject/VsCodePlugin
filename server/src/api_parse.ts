"use strict";
import { spawn } from "child_process";
import * as fs from "fs";
import { join } from "path";

export function walkSync(d: string): string[] {
  console.log(`walk ${d}`);
  if (fs.statSync(d).isDirectory()) {
    return fs
      .readdirSync(d)
      .map(f => walkSync(join(d, f)))
      .reduce((a, b) => a.concat(b), []);
  } else {
    return [d];
  }
}

export function listApis(searchPaths: string[]): string[] {
  let output: string[] = [];
  searchPaths.forEach(searchPath =>
    output.push(
      ...walkSync(searchPath)
        .filter(x => x.endsWith(".api"))
        .map(x =>
          x
            .replace(searchPath, "") // get relative path
            .replace(/^\//, "") // remove initial slash
        ) 
        //.map(x=> {console.log(`--> ${x}`); return x;})
    )
  );
  return output;
}
