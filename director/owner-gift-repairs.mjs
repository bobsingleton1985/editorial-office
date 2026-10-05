// Trusted local reconciliation jobs only; no browser/Telegram endpoint creates them.
import fs from 'node:fs';
import path from 'node:path';
import {applyOwnerMoneySplit} from './owner-intent.mjs';
export function processOwnerGiftRepairs(st,dir,now,persist){
 let files;try{files=fs.readdirSync(dir).filter(f=>/^[a-zA-Z0-9_-]{1,80}\.json$/.test(f)).sort();}catch(e){if(e.code==='ENOENT')return null;throw e;}
 for(const file of files){
  const acknowledgement=path.join(dir,'receipts',file);if(fs.existsSync(acknowledgement))continue;
  const id=file.slice(0,-5);let result;
  try{
   const job=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),keys=['version','type','id','turnId','expectedText','target','cents','forward'];
   if(!job||Object.keys(job).length!==keys.length||keys.some(k=>!Object.hasOwn(job,k))||job.version!==1||job.type!=='owner_gift_repair'||job.id!==id)throw Error('invalid_repair');
   const fingerprint=JSON.stringify(job),previous=st.ownerGiftRepairReceipts?.[id];
   if(previous){if(previous.fingerprint!==fingerprint)throw Error('repair_id_conflict');result=previous;}
   else{
    const turn=Object.values(st.chars).flatMap(p=>p.ownerDialogue||[]).find(t=>t.id===job.turnId);
    if(!turn||turn.text!==job.expectedText||turn.instructionEligible===false||turn.status!=='answered')throw Error('repair_turn_mismatch');
    const receipt=applyOwnerMoneySplit(st,turn,{kind:'money_split',target:job.target,command:{type:'money',cents:job.cents},forward:job.forward},now,{reconcile:true});
    turn.reconciliation={id,source:'owner_authorized_bug_repair',at:now,note:'Завершена ранее пропущенная часть исходного распоряжения; первоначальный ответ модели сохранён.'};
    result={id,status:'applied',turnId:turn.id,fingerprint,ledgerIds:receipt.ledgerIds,summary:receipt.summary,at:now};st.ownerGiftRepairReceipts??={};st.ownerGiftRepairReceipts[id]=result;
   }
  }catch(e){result={id,status:'rejected',error:e instanceof SyntaxError?'invalid_json':e.message,at:now};}
  if(result.status==='applied'&&persist()!==true)throw Error('repair_checkpoint_failed');
  fs.mkdirSync(path.dirname(acknowledgement),{recursive:true,mode:0o700});const temporary=acknowledgement+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(result),{mode:0o600});const fd=fs.openSync(temporary,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,acknowledgement);
  return result;
 }
 return null;
}
