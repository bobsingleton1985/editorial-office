import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {OwnerDialogueInbox} from '../relay/owner-dialogue-inbox.mjs';

// Execute the deployed route, including its real inbox, without starting the
// simulation worker or sending a model request.
const source=fs.readFileSync(new URL('../relay/deployed-dialogue/relay.mjs',import.meta.url),'utf8');
const start=source.indexOf("  if(url.pathname==='/settings/dialogue'){");
const end=source.indexOf("  if(url.pathname==='/settings/model-retry'){",start);
assert(start>=0&&end>start);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const route=new AsyncFunction('req','res','url','OPEN','OWNER','same','json','ipOf','lastChange','readBody','ownerDialogueInbox',source.slice(start,end));
const owner='owner-access-fixture-0000000000';
const valid={id:'access-fixture',person:'reporter',text:'Проверка доступа'};

async function exercise({open,authorization,body=valid}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dialogue-access-'));
 try{
  const inbox=new OwnerDialogueInbox(path.join(dir,'inbox.json'));
  const result=await route({method:'POST',headers:authorization?{authorization}:{}},{},new URL('http://fixture/settings/dialogue'),open,owner,(a,b)=>a===b,(_res,status,data)=>({status,data}),()=> 'fixture-ip',new Map(),async()=>body,inbox);
  const saved=new OwnerDialogueInbox(path.join(dir,'inbox.json')).pending();
  return {result,saved};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('existing open newsroom accepts a dialogue without separate owner credentials',async()=>{
 const {result,saved}=await exercise({open:true});
 assert.equal(result.status,202);assert.equal(result.data.id,valid.id);assert.equal(saved.length,1);assert.equal(saved[0].text,valid.text);
});
test('closed newsroom rejects dialogue without credentials before writing the inbox',async()=>{
 const {result,saved}=await exercise({open:false});
 assert.equal(result.status,403);assert.equal(saved.length,0);
});
test('closed newsroom rejects an incorrect owner credential',async()=>{
 const {result,saved}=await exercise({open:false,authorization:'Bearer incorrect-fixture-token'});
 assert.equal(result.status,403);assert.equal(saved.length,0);
});
test('closed newsroom accepts its existing valid owner access',async()=>{
 const {result,saved}=await exercise({open:false,authorization:'Bearer '+owner});
 assert.equal(result.status,202);assert.equal(saved.length,1);
});
test('open access retains recipient and message validation',async()=>{
 const {result,saved}=await exercise({open:true,body:{...valid,person:'missing'}});
 assert.equal(result.status,400);assert.equal(saved.length,0);
});
