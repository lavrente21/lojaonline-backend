const fs=require('node:fs');const path=require('node:path');
const roots=[path.resolve(__dirname,'../../lojaonline-main'),path.resolve(__dirname,'../../lojaonline-admin-main')];
const sinks=/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\s*(?:=|\()/;
const dangerous=/\$\{[^}]*\b(?:req\.|email|telefone|morada|linha1|linha2|cidade|codigo_postal|pais|rotulo|assunto|codigo|nome|message|e\.message|descricao|url|slug)\b[^}]*\}/i;
let errors=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.git')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(?:js|html)$/.test(ent.name)){const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);lines.forEach((line,i)=>{if(sinks.test(line)&&dangerous.test(line)&&!/(?:esc\w*\(|escaparHTML\(|escapeHtml\()/i.test(line))errors.push(`${p}:${i+1}: interpolação potencialmente não escapada num sink HTML`);});}}}
for(const r of roots)if(fs.existsSync(r))walk(r);
if(errors.length){console.error(errors.join('\n'));console.error(`CHECK XSS: ${errors.length} possível(is) problema(s).`);process.exit(1)}
console.log('CHECK XSS: nenhuma interpolação de campo potencialmente perigosa detetada nos sinks verificados.');
