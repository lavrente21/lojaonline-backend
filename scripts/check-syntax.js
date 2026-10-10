const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(item.name==='node_modules'||item.name==='.git')continue;const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.isFile()&&item.name.endsWith('.js'))files.push(full)}}
walk(root);
let failed=0;
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){failed++;console.error(`FAIL ${path.relative(root,file)}\n${r.stderr||r.stdout}`)}}
console.log(`Verificados ${files.length} ficheiros JavaScript; falhas: ${failed}.`);
process.exitCode=failed?1:0;
