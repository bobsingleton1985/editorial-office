import {validateRecord} from './chronicle-store.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {digest} from './chronicle-core.mjs';
import {removePrivateDetails} from './phone-privacy.mjs';
const clean=value=>{
 if(Array.isArray(value))return value.map(clean);
 if(!value||typeof value!=='object')return value;
 const out=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
 if([out.task,out.taskId,out.id].some(x=>typeof x==='string'&&x.startsWith('owner-task-'))){if('title'in out)out.title='Конфиденциальное поручение';if('brief'in out)delete out.brief;if('summary'in out)out.summary='Конфиденциальное поручение.';}
 return out;
};
export function sanitizeChronicle(body){
 return body.split('\n').filter(Boolean).map(line=>{
  const r=JSON.parse(line);r.data=clean(r.data);
  if(r.type==='state'&&r.data.relations)r.data.relations=removePrivateDetails(r.data.relations);
  if(r.type==='event'&&r.data.kind==='relationship_changed')r.data.facts.evidence=removePrivateDetails(r.data.facts.evidence);
  r.id=digest([r.type,r.at,r.data]);validateRecord(r);return JSON.stringify(r);
 }).join('\n')+'\n';
}

export function migrateChronicleFile(file){
 if(process.env.NODE_ENV==='test')return;
 const marker=file+'.privacy-v1';if(fs.existsSync(marker))return;
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 if(fs.existsSync(file)){
  const original=fs.readFileSync(file,'utf8'),next=sanitizeChronicle(original);
  fs.writeFileSync(file+'.privacy-next',next,{mode:0o600});fs.renameSync(file+'.privacy-next',file);
 }
 fs.writeFileSync(marker,'legacy_private_history_sanitized\n',{mode:0o600});
}
