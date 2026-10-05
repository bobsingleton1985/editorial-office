import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseOwnerCall,enqueueOwnerCall} from '../director/owner-calls.mjs';
import {harness} from './director-harness.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
test('addressed call dispatches to its recipient despite a different desk A occupant',()=>{
 const h=harness(source),previousActivity=h.state().chars.columnist.activity;
 h.run("applyDecision=(id,action)=>{st.chars[id].activity='phone';st.chars[id].entry={action};return true;}");
 assert.equal(h.run("startCall(Date.now(),'Проверка','reporter')"),true);
 const st=h.state();assert.equal(st.chars.reporter.activity,'phone');assert.equal(st.chars.columnist.activity,previousActivity);
 assert.equal(st.chars.reporter.pendingOwnerCall.text,'Проверка');assert.equal(st.chars.reporter.memory.length,0);assert.equal(st.chars.columnist.memory.length,0);
 assert.equal(st.ownerMsg,undefined);assert.equal(st.chars.reporter.entry.action,'phone@phoneA');
});
test('unavailable recipient or occupied phone never falls back to somebody else',()=>{
 for(const condition of ["st.chars.reporter.sleep={}","st.chars.reporter.sleepPending=true","st.chars.columnist.activity='phone'"]){
  const h=harness(source);h.run(condition);h.run('var dispatched=0;applyDecision=()=>{dispatched++;return true;}');
  assert.equal(h.run("startCall(Date.now(),'Проверка','reporter')"),false);assert.equal(h.run('dispatched'),0);
  h.run("delete st.chars.reporter.sleep;delete st.chars.reporter.sleepPending;st.chars.columnist.activity='work'");
  assert.equal(h.run("startCall(Date.now(),'Проверка','reporter')"),true);
 }
});
test('ordinary call still uses desk A, and renderer refusal leaves addressed call pending',()=>{
 const h=harness(source);h.run('var called;applyDecision=(id,action)=>{called={id,action};return true;}');
 assert.equal(h.run("startCall(Date.now(),'Проверка')"),true);assert.equal(h.run('called.id'),'columnist');assert.equal(h.run('called.action'),'phone@deskA');
 h.run('applyDecision=()=>false');assert.equal(h.run("startCall(Date.now(),'Проверка','reporter')"),false);
});
test('queue validates explicit recipient including null, heroine and unknown IDs',()=>{
 assert.deepEqual(parseOwnerCall({text:' Текст ',target:'Репортёру'}),{text:'Текст',target:'reporter'});
 assert.deepEqual(parseOwnerCall({text:'Текст'}),{text:'Текст',target:null});
 assert.equal(parseOwnerCall({text:'Текст',target:'героине'}).target,'heroine');
 for(const target of [null,'missing',''])assert.throws(()=>parseOwnerCall({text:'Текст',target}),/unsupported_call_recipient/);
});
test('CLI writes target and literal message to an isolated queue, rejects unsupported recipient',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'owner-call-'));
 try {
  fs.mkdirSync(path.join(dir,'director'));fs.mkdirSync(path.join(dir,'relay'));fs.copyFileSync(new URL('../relay/owner-dialogue-contract.mjs',import.meta.url),path.join(dir,'relay/owner-dialogue-contract.mjs'));for(const name of ['ring.sh','call.mjs','bonus.mjs'])fs.copyFileSync(new URL('../'+name,import.meta.url),path.join(dir,name));
  fs.copyFileSync(new URL('../director/owner-calls.mjs',import.meta.url),path.join(dir,'director/owner-calls.mjs'));
  const message='Поговорим: $5, `текст` и перенос\nстроки';
  const result=spawnSync('zsh',[path.join(dir,'ring.sh'),'--to','репортёру',message],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(result.stdout);assert.equal(receipt.target,'reporter');
  const files=fs.readdirSync(path.join(dir,'calls'));assert.equal(files.length,1);const value=JSON.parse(fs.readFileSync(path.join(dir,'calls',files[0])));assert.equal(value.text,message);assert.equal(value.target,'reporter');
  assert.notEqual(spawnSync('zsh',[path.join(dir,'ring.sh'),'--to','missing','Текст']).status,0);
  assert.equal(fs.readdirSync(path.join(dir,'calls')).length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});


test('structured phone commands retain exact authorization across queue and archival retries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'structured-phone-'));
 try{
  const value={text:'Передаю деньги',target:'reporter',command:{type:'money',cents:250}};
  enqueueOwnerCall(dir,value,'same');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'same.json'))).command.cents,250);
  fs.mkdirSync(path.join(dir,'done'));fs.renameSync(path.join(dir,'same.json'),path.join(dir,'done/same.json'));
  assert.equal(enqueueOwnerCall(dir,value,'same').replayed,true);
  assert.throws(()=>enqueueOwnerCall(dir,{...value,command:{type:'money',cents:251}},'same'),/conflict/);
  assert.throws(()=>parseOwnerCall({...value,text:'/конец'}),/invalid_dialogue_command/);
  assert.throws(()=>parseOwnerCall({text:value.text,command:value.command}),/invalid_dialogue_command/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
