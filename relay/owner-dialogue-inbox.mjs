import fs from 'node:fs';
import path from 'node:path';
const actors=new Set(['heroine','columnist','reporter','newspaper_editor']);
export class OwnerDialogueInbox{
 constructor(file){this.file=file;this.records=[];if(file&&fs.existsSync(file))this.records=JSON.parse(fs.readFileSync(file,'utf8'));}
 save(){if(!this.file)throw Error('dialogue_storage_unavailable');fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';fs.writeFileSync(temp,JSON.stringify(this.records),{mode:0o600});const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,this.file);const dir=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 enqueue(b,now){
  if(!b||!actors.has(b.person)||typeof b.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(b.id)||typeof b.text!=='string'||!b.text.trim()||b.text.length>500)throw Error('invalid_owner_dialogue');
  const text=b.text.trim(),old=this.records.find(t=>t.id===b.id);
  if(old){if(old.text!==text||old.person!==b.person)throw Error('dialogue_id_conflict');return {id:old.id,status:old.acked?'received':'queued',replayed:true};}
  if(this.pending().length>=50)throw Error('dialogue_queue_full');
  const previous=this.records;this.records=[...previous,{id:b.id,person:b.person,text,source:'site',at:now}];
  try{this.save();}catch(e){this.records=previous;throw e;}return {id:b.id,status:'queued'};
 }
 pending(){return this.records.filter(t=>!t.acked).map(t=>({...t}));}
 ack(id){const t=this.records.find(t=>t.id===id);if(!t)throw Error('unknown_dialogue');if(t.acked)return; t.acked=true;try{this.save();}catch(e){delete t.acked;throw e;}}
}
