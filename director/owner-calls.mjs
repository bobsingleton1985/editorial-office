import {privateParse,privateStringify} from '../privacy-vault.mjs';
import {normalizeDialogueCommand} from '../relay/owner-dialogue-contract.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const aliases = new Map([
  ['heroine','heroine'], ['героиня','heroine'], ['героине','heroine'],
  ['columnist','columnist'], ['колумнист','columnist'], ['колумнисту','columnist'],
  ['reporter','reporter'], ['репортер','reporter'], ['репортеру','reporter'],
  ['newspaper_editor','newspaper_editor'], ['редактор','newspaper_editor'], ['редактору','newspaper_editor'],
]);
export function callRecipient(value) {
  const id = typeof value === 'string' && aliases.get(value.trim().toLowerCase().replaceAll('ё','е'));
  if (!id) throw Error('unsupported_call_recipient');
  return id;
}
export function parseOwnerCall(value) {
  if (!value || typeof value.text !== 'string' || !value.text.trim()) throw Error('missing_call_text');
  const target = Object.hasOwn(value,'target') ? callRecipient(value.target) : null;
  if(value.instructionEligible!==undefined&&typeof value.instructionEligible!=='boolean')throw Error('invalid_call_context');
  if(value.confidential!==undefined&&typeof value.confidential!=='boolean')throw Error('invalid_call_privacy');
  const confidential=value.confidential!==false;
  const command=normalizeDialogueCommand(value.command);
  if(command&&(value.instructionEligible===false||!target||['/конец','/hangup'].includes(value.text.trim().toLowerCase())))throw Error('invalid_dialogue_command');
  return {text:value.text.trim().slice(0,500),target,confidential,...(command?{command}:{}),...(value.instructionEligible===false?{instructionEligible:false}:{})};
}
export function enqueueOwnerCall(dir, value, commandId=null) {
  const command = parseOwnerCall(value);
  if(commandId!==null&&!(typeof commandId==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(commandId)))throw Error('invalid_call_id');
  const id = commandId??`${Date.now()}-${randomUUID()}`;
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,id+'.json'), temp = file+'.'+randomUUID()+'.tmp';
  const existing=()=>{
    for(const candidate of [file,path.join(dir,'done',id+'.json')]){
      try{
        const stored=parseOwnerCall(privateParse(fs.readFileSync(candidate,'utf8')));
        if(stored.confidential!==command.confidential||stored.text!==command.text||stored.target!==command.target||JSON.stringify(stored.command??null)!==JSON.stringify(command.command??null)||(stored.instructionEligible!==false)!==(command.instructionEligible!==false))throw Error('call_id_conflict');
        const fd=fs.openSync(candidate,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        const parent=fs.openSync(path.dirname(candidate),'r');try{fs.fsyncSync(parent);}finally{fs.closeSync(parent);}
        return {id,status:'queued',target:command.target,replayed:true};
      }catch(error){if(error.code!=='ENOENT')throw error;}
    }
    return null;
  };
  if(commandId!==null){const receipt=existing();if(receipt)return receipt;}
  try {
    fs.writeFileSync(temp,privateStringify({text:command.text,confidential:command.confidential,...(command.target?{target:command.target}:{}),...(command.command?{command:command.command}:{}),...(command.instructionEligible===false?{instructionEligible:false}:{}),at:Date.now()}),{mode:0o600});
    const fd=fs.openSync(temp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    try{fs.linkSync(temp,file);}catch(error){
      if(error.code!=='EEXIST'||commandId===null)throw error;
      const receipt=existing();if(receipt)return receipt;
      throw Error('call_queue_changed_retry');
    }
    const fdDir=fs.openSync(dir,'r');try{fs.fsyncSync(fdDir);}finally{fs.closeSync(fdDir);}
  } finally { if(fs.existsSync(temp))fs.unlinkSync(temp); }
  return {id,status:'queued',target:command.target};
}
