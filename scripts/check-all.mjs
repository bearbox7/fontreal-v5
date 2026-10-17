import { mkdirSync,readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync("work",{recursive:true});
for(const file of readdirSync("scripts").filter(f=>f.startsWith("check-")&&f.endsWith(".mjs")&&f!=="check-all.mjs").sort()){
  const r=spawnSync(process.execPath,["--experimental-strip-types",`scripts/${file}`],{stdio:"inherit"});
  if(r.status!==0)process.exit(r.status||1);
}
const result=spawnSync(process.execPath,["node_modules/typescript/bin/tsc","--noEmit","--incremental","false"],{stdio:"inherit"});
process.exit(result.status||0);
