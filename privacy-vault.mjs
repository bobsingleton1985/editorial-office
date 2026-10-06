// Local encrypted storage. Never export the key or persist plaintext fallbacks.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
let key;
function encryptionKey(){
 if(key)return key;
 let raw;
 if(process.env.NODE_ENV==='test'&&process.env.PHONE_PRIVACY_TEST_KEY)raw=process.env.PHONE_PRIVACY_TEST_KEY;
 else {try{raw=execFileSync('/opt/homebrew/bin/python3',[fileURLToPath(new URL('./privacy_keychain.py',import.meta.url))],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();}catch{throw Error('privacy_key_unavailable');}}
 if(!/^[a-f0-9]{64}$/.test(raw))throw Error('privacy_key_unavailable');
 return key=Buffer.from(raw,'hex');
}
const SCHEMA='editorial-private-aes256gcm-v1';
export function seal(value){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
 cipher.setAAD(Buffer.from(SCHEMA));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return {schema:SCHEMA,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function unseal(value){
 if(value?.schema!==SCHEMA){if(value&&typeof value==='object'&&(['iv','tag'].some(k=>Object.hasOwn(value,k))||String(value.schema||'').startsWith('editorial-private-')))throw Error('privacy_vault_unreadable');return value;} // one-way migration of legacy JSON
 try{const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(value.iv,'base64'));cipher.setAAD(Buffer.from(SCHEMA));cipher.setAuthTag(Buffer.from(value.tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.data,'base64')),cipher.final()]).toString('utf8'));}
 catch{throw Error('privacy_vault_unreadable');}
}
export const privateStringify=value=>JSON.stringify(seal(value));
export const privateParse=text=>unseal(JSON.parse(text));
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const input=fs.readFileSync(0,'utf8');process.stdout.write(process.argv[2]==='seal'?privateStringify(JSON.parse(input)):JSON.stringify(privateParse(input)));}
 catch{console.error('privacy_storage_failed');process.exitCode=1;}
}
// Large diagnostic archives use streaming encryption (no plaintext temporary file).
export async function encryptArchive(file,destination){
 const {pipeline}=await import('node:stream/promises');const {createHash}=await import('node:crypto');
 const header=Buffer.from('CS-PRIVATE-ARCHIVE-V1\n'),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(header);
 const tmp=destination+'.tmp';let handle;
 try{
  handle=fs.openSync(tmp,'wx',0o600);fs.writeSync(handle,header);fs.writeSync(handle,iv);fs.closeSync(handle);handle=null;
  await pipeline(fs.createReadStream(file),cipher,fs.createWriteStream(tmp,{flags:'a',mode:0o600}));fs.appendFileSync(tmp,cipher.getAuthTag());
  const total=fs.statSync(tmp).size,tag=Buffer.alloc(16),fd=fs.openSync(tmp,'r');fs.readSync(fd,tag,0,16,total-16);fs.closeSync(fd);
  const dec=createDecipheriv('aes-256-gcm',encryptionKey(),iv);dec.setAAD(header);dec.setAuthTag(tag);
  const verified=createHash('sha256'),original=createHash('sha256');
  await pipeline(fs.createReadStream(tmp,{start:header.length+12,end:total-17}),dec,verified);
  await pipeline(fs.createReadStream(file),original);
  if(verified.digest('hex')!==original.digest('hex'))throw Error('privacy_archive_source_changed');
  const sync=fs.openSync(tmp,'r');fs.fsyncSync(sync);fs.closeSync(sync);fs.renameSync(tmp,destination);
  return {bytes:total,verified:true};
 }catch{if(handle)fs.closeSync(handle);fs.rmSync(tmp,{force:true});throw Error('privacy_archive_failed');}
}
