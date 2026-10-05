import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {createExecutionFeedback} from '../relay/execution-feedback.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
export function phoneHarness(){
 const h=harness(source,null,undefined,1,Date.UTC(2026,9,4,12));
 h.run("executionCapabilities={at:Date.now(),styles:[],actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,activity:st.chars.heroine.activity,phone:{ready:true,seq:st.chars.heroine.seq,occupied:false,phase:'idle',receiving:false}}}};");
 return h;
}
test('addressed heroine dispatch uses the real director; memory waits for receipt',()=>{
 const h=phoneHarness();assert.notEqual(h.run("startCall(Date.now(),'Текст','heroine')"),false);
 const p=h.state().chars.heroine;
 assert.equal(p.activity,'phone');assert.equal(p.entry.cmd.spot,'phoneA');assert.equal(p.memory.filter(e=>e.event==='phone_call').length,0);
 assert.equal(h.state().ownerMsg,undefined);assert.equal(p.pendingOwnerCall.seq,p.seq);
});
test('ordinary calls exclude heroine even when she is nearest to the phone',()=>{
 const h=phoneHarness();h.run("st.chars.heroine.place='deskA';st.chars.columnist.place='deskC';st.chars.reporter.place='benchN';st.chars.newspaper_editor.place='deskB'");
 h.run("startCall(Date.now(),'Текст')");assert.notEqual(h.state().chars.heroine.activity,'phone');
});
test('missing/stale readiness, sleep, tray service and paid commitment keep addressed call waiting',()=>{
 for(const condition of ["executionCapabilities=null","executionCapabilities.at-=3500","executionCapabilities.actors.heroine.seq--","executionCapabilities.actors.heroine.phone.ready=false","st.chars.heroine.sleep={}","st.chars.heroine.sleepPending={}","st.chars.heroine.activity='heroine_serve'","committedPerformance=()=>true"]){
  const h=phoneHarness();h.run(condition);assert.equal(h.run("startCall(Date.now(),'Текст','heroine')"),false,condition);
  assert.equal(h.state().chars.heroine.pendingOwnerCall,undefined);assert.equal(h.state().ownerMsg,undefined);
 }
});
test('new calls wait until the previous handset is returned, even under a later actor command',()=>{
 const h=phoneHarness();h.run("executionCapabilities.actors.heroine.phone.occupied=true;executionCapabilities.actors.heroine.phone.phase='return'");
 assert.equal(h.run("startCall(Date.now(),'Текст','reporter')"),false);
 h.run('executionCapabilities.actors.heroine.phone.occupied=false');assert.notEqual(h.run("startCall(Date.now(),'Текст','reporter')"),false);
});
test('handset lease survives a command change and missing/stale occupancy reports',()=>{
 const h=phoneHarness();h.run("startCall(Date.now(),'Текст','heroine');st.chars.heroine.activity='wait';st.chars.heroine.seq++");
 for(const report of ['null',"{at:Date.now(),actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,phone:null}}}","{at:Date.now()-3500,actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,phone:{seq:st.chars.heroine.seq,occupied:false}}}}", "{at:Date.now(),actors:{heroine:{loaded:true,seq:st.chars.heroine.seq-1,phone:{seq:st.chars.heroine.seq-1,occupied:false}}}}"]){
  h.run('executionCapabilities='+report);assert.equal(h.run("startCall(Date.now(),'Следующий','reporter')"),false);
 }
 h.run("executionCapabilities={at:Date.now(),actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,phone:{seq:st.chars.heroine.seq,occupied:false}}}}");
 assert.notEqual(h.run("startCall(Date.now(),'Следующий','reporter')"),false);
 assert.equal(h.state().phoneLease.actor,'reporter');
});
test('only fresh matching physical receipt records message once and gives ten seconds of talk',()=>{
 const h=phoneHarness();h.run("startCall(Date.now(),'Текст','heroine')");
 const receipt="executionCapabilities={at:Date.now(),actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,activity:'phone',phone:{seq:st.chars.heroine.seq,ready:true,occupied:true,phase:'talk',receiving:true}}}}";
 for(const bad of ["executionCapabilities.at-=3500","executionCapabilities.actors.heroine.seq--","executionCapabilities.actors.heroine.phone.seq--","executionCapabilities.actors.heroine.phone.receiving=false","executionCapabilities.actors.heroine.activity='wait'"]){
  h.run(receipt);h.run(bad);assert.equal(h.run('receiveOwnerCall(Date.now())'),false);assert.equal(h.state().chars.heroine.memory.filter(e=>e.event==='phone_call').length,0);
 }
 h.run(receipt);assert.equal(h.run('receiveOwnerCall(Date.now())'),true);assert.equal(h.run('receiveOwnerCall(Date.now())'),false);
 assert.equal(h.state().chars.heroine.memory.filter(e=>e.event==='phone_call').length,1);assert.equal(h.state().ownerMsg.by,'Героиня');assert.equal(h.state().chars.heroine.busyUntil,h.now()+10000);
});
test('queue remains until physical receipt, interrupted approach retries without losing text',()=>{
 const h=phoneHarness();h.queueCall('01.json',{text:'Текст',target:'heroine'});h.run('ownerCalls(Date.now())');
 assert.equal(h.calls.size,1);assert.equal(h.archived.length,0);assert.equal(h.state().chars.heroine.pendingOwnerCall.queueFile,'01.json');
 h.run("st.chars.heroine.activity='wait';st.chars.heroine.seq++;receiveOwnerCall(Date.now());executionCapabilities.actors.heroine.seq=st.chars.heroine.seq;executionCapabilities.actors.heroine.phone={seq:st.chars.heroine.seq,ready:true,phase:'idle',occupied:false,receiving:false};ownerCalls(Date.now())");
 assert.equal(h.calls.size,1);assert.equal(h.state().chars.heroine.activity,'phone');
 h.run("executionCapabilities={at:Date.now(),actors:{heroine:{loaded:true,seq:st.chars.heroine.seq,activity:'phone',phone:{seq:st.chars.heroine.seq,receiving:true}}}}");
 h.failArchive(true);h.run('receiveOwnerCall(Date.now())');assert.equal(h.state().chars.heroine.memory.filter(e=>e.event==='phone_call').length,1);assert.equal(h.calls.size,1);
 h.failArchive(false);h.run('receiveOwnerCall(Date.now())');assert.equal(h.state().chars.heroine.memory.filter(e=>e.event==='phone_call').length,1);assert.equal(h.calls.size,0);assert.equal(h.archived.length,1);
});
test('production sanitizer admits matching talk receipt and rejects stale or inconsistent witnesses',()=>{
 const feedback=createExecutionFeedback(),v={},viewers=new Set([v]);const {lease}=feedback.connect(v,1000);
 const e={seq:3,activity:'phone'},world={chars:{heroine:e}};
 const raw={loaded:true,seq:3,activity:'phone',phone:{seq:3,ready:true,occupied:true,phase:'talk',receiving:true}};
 const send=a=>{assert.equal(feedback.accept({lease,pairs:[],capabilities:{styles:[],actors:{heroine:a}}},viewers,world,2000),true);return feedback.capabilities(2000).actors.heroine.phone;};
 assert.equal(send(raw).receiving,true);
 for(const change of [{seq:2},{loaded:false},{phone:{...raw.phone,seq:2}},{phone:{...raw.phone,phase:'other'}}])assert.equal(send({...raw,...change}),null);
 for(const change of [{activity:'wait'},{phone:{...raw.phone,phase:'return'}},{phone:{...raw.phone,occupied:false}},{phone:{...raw.phone,ready:false}}])assert.equal(send({...raw,...change}).receiving,false);
 world.chars.heroine.activity='wait';assert.equal(send(raw).receiving,false);
});
