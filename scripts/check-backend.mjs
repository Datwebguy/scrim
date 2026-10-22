import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(dir) {
  for(const e of await readdir(dir,{withFileTypes:true})) {
    const file=dir+'/'+e.name;
    if(e.isDirectory()) await walk(file);
    else if(/\.(mjs|js)$/.test(file)) { const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'}); if(r.status!==0) process.exit(r.status??1); }
  }
}
for(const root of ['apps','packages','api','scripts']) await walk(root);
