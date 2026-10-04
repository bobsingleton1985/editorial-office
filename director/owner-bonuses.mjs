import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {grantOwnerBonus} from './economy.mjs';
export const validCommandId=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id);
const aliases={all:'all','всем':'all',columnist:'columnist','колумнист':'columnist','колумнисту':'columnist',reporter:'reporter','репортер':'reporter','репортеру':'reporter',newspaper_editor:'newspaper_editor','редактор':'newspaper_editor','редактору':'newspaper_editor',heroine:'heroine','героиня':'heroine','героине':'heroine'};
export function parseBonus(target,usd,id){
 const key=String(target).toLowerCase().replaceAll('ё','е'),who=Object.hasOwn(aliases,key)?aliases[key]:null;
 if(!who)throw Error('unknown_recipient');
 if(typeof usd!=='string'||!/^\d+(?:[.,]\d{1,2})?$/.test(usd))throw Error('invalid_amount');
 const [whole,fraction='']=usd.replace(',','.').split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(amount<=0n||amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid_amount');
 if(!validCommandId(id))throw Error('invalid_command_id');
 return {version:1,type:'owner_bonus',id,target:who,cents:Number(amount)};
}
function atomic(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
export function enqueueBonus(dir,command){
 if(!Number.isSafeInteger(command.cents)||command.cents<=0)throw Error('invalid_amount');
 const value=BigInt(command.cents),canonical=parseBonus(command.target,`${value/100n}.${String(value%100n).padStart(2,'0')}`,command.id);
 if(canonical.cents!==command.cents)throw Error('invalid_amount');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const filename=path.join(dir,command.id+'.json');
 // Keep requests immutable, including after processing: retries with the same ID
 // must match the same amount and recipient and cannot become another payment.
 const payload=JSON.stringify(canonical);
 const temp=filename+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,payload,{mode:0o600});try{fs.linkSync(temp,filename);}catch(error){if(error.code!=='EEXIST')throw error;const old=JSON.parse(fs.readFileSync(filename,'utf8'));if(JSON.stringify(old)!==payload)throw Error('command_id_conflict');}}
 finally{try{fs.unlinkSync(temp);}catch{}}
 return bonusStatus(dir,command.id);
}
export function bonusStatus(dir,id){
 if(!validCommandId(id))throw Error('invalid_command_id');
 const result=path.join(dir,'receipts',id+'.json');
 if(fs.existsSync(result))return JSON.parse(fs.readFileSync(result,'utf8'));
 return {id,status:fs.existsSync(path.join(dir,id+'.json'))?'queued':'unknown'};
}
export function processBonusQueue(st,dir,now,persist){
 let files;try{files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();}catch(e){if(e.code==='ENOENT')return null;throw e;}
 for(const file of files){
  const id=file.slice(0,-5);if(!validCommandId(id))continue;
  const receiptPath=path.join(dir,'receipts',file);if(fs.existsSync(receiptPath))continue;
  let result;
  try{const command=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));if(command.id!==id)throw Error('command_id_mismatch');result=grantOwnerBonus(st,command,now);}
  catch(error){result={id,status:'rejected',error:error instanceof SyntaxError?'invalid_json':error.message,at:now};}
  // Durable canonical state precedes the external acknowledgement. If saving
  // fails, retry without another credit; restart replays only uncommitted work.
  if(result.status==='applied'&&persist()!==true)throw Error('bonus_checkpoint_failed');
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true,mode:0o700});atomic(receiptPath,result);
  return result;
 }
 return null;
}
