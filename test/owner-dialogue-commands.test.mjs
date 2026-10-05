import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureEconomy,UNCONFIGURED_ECONOMY,rewardWork} from '../director/economy.mjs';
import {receiveDialogue} from '../director/owner-dialogue.mjs';
import {applyDialogueCommand,completeOwnerTask,ownerTaskContext,ownerRequestContext,recordOwnerRequestChoice,publicOwnerCommands} from '../director/owner-dialogue-commands.mjs';
import {OwnerDialogueInbox} from '../relay/owner-dialogue-inbox.mjs';
import {dollarsToCents} from '../relay/owner-dialogue-contract.mjs';
import {harness} from './director-harness.mjs';
import {fitRelationshipRequest,repeatedDeclinedPerformanceIds,takeContextProjection} from '../director/relationship-context.mjs';
import {compactDialogueOptions,compactPerformanceMetadata} from '../director/dialogue-options.mjs';
const config={...structuredClone(UNCONFIGURED_ECONOMY),enabled:true,startingCents:1000,workRewardCents:300};
const source=new URL('../director/director.mjs',import.meta.url).pathname;
function fixture(){const st={chars:{reporter:{memory:[]},heroine:{memory:[]}},tasks:[]};ensureEconomy(st,config,1);return st;}
function turn(st,id,command,text='Технический тест'){receiveDialogue(st.chars.reporter,{id,command,text},2);return st.chars.reporter.ownerDialogue.at(-1);}
const task={type:'task',title:'Проверить цены на кофе',brief:'Проверить цены и подготовить редакционный материал.',deadlineAt:100000,rewardCents:500};

test('explicit payment credits canonical wallet once across delivery and state restart',()=>{
 let st=fixture(),t=turn(st,'web_payment',{type:'money',cents:250});
 applyDialogueCommand(st,'reporter',t,3);assert.equal(st.economy.accounts.reporter,1250);assert.equal(t.effect.status,'applied');
 st=JSON.parse(JSON.stringify(st));t=st.chars.reporter.ownerDialogue[0];applyDialogueCommand(st,'reporter',t,4);
 assert.equal(st.economy.accounts.reporter,1250);assert.equal(st.economy.ledger.filter(x=>x.kind==='bonus').length,1);
});
test('quoted or conversational money never authorizes a credit; changed repeat conflicts',()=>{
 const st=fixture(),t=turn(st,'web_quote',null,'Например, дать тебе 5 долларов?');
 assert.equal(applyDialogueCommand(st,'reporter',t,3),null);assert.equal(st.economy.accounts.reporter,1000);
 assert.throws(()=>receiveDialogue(st.chars.reporter,{id:t.id,text:t.text,command:{type:'money',cents:500}},4),/conflict/);
});
test('assignment queues real work; only confirmed completion pays the extra reward once',()=>{
 const st=fixture(),t=turn(st,'web_task',task);applyDialogueCommand(st,'reporter',t,3,{canWork:true});
 assert.equal(st.tasks.length,1);assert.equal(st.tasks[0].by,'reporter');assert.equal(st.economy.accounts.reporter,1000);
 const assigned=st.tasks[0];assert.equal(completeOwnerTask(st,'reporter',assigned,10),false);
 assigned.done_min=assigned.need_min;completeOwnerTask(st,'reporter',assigned,100001);
 assert.equal(st.economy.accounts.reporter,1500);assert.equal(t.effect.status,'completed');assert.equal(t.effect.late,true);
 assert.equal(completeOwnerTask(st,'reporter',assigned,100002),false);assert.equal(st.economy.accounts.reporter,1500);
});
test('unsupported editorial role and past deadline produce honest rejected receipts',()=>{
 const st=fixture();receiveDialogue(st.chars.heroine,{id:'web_unsupported',text:'Поручение',command:task},2);
 assert.equal(applyDialogueCommand(st,'heroine',st.chars.heroine.ownerDialogue[0],3).error,'editorial_work_unsupported');
 const t=turn(st,'web_past',task);assert.equal(applyDialogueCommand(st,'reporter',t,100001,{canWork:true}).error,'deadline_in_past');assert.equal(st.tasks.length,0);
});
test('inbox stores structured command and rejects changed amount or invalid command on retry',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dialogue-command-'));
 try{const file=path.join(dir,'inbox.json'),q=new OwnerDialogueInbox(file),b={id:'payment',person:'reporter',text:'Передаю деньги',command:{type:'money',cents:500}};
 q.enqueue(b,1);assert.equal(new OwnerDialogueInbox(file).pending()[0].command.cents,500);
 assert.throws(()=>q.enqueue({...b,command:{type:'money',cents:600}},2),/conflict/);
 assert.throws(()=>q.enqueue({...b,id:'bad',command:{type:'money',cents:-1}},2),/invalid/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('amount parser preserves cents and rejects ambiguous, excessive and nonpositive sums',()=>{
 assert.equal(dollarsToCents('5,25'),525);assert.equal(dollarsToCents('0',{allowZero:true}),0);
 for(const s of ['0','-1','1.234','100 долларов','1e3','9007199254740992'])assert.throws(()=>dollarsToCents(s));
});
test('director saves a payment before ack, sends changed wallet and real physical options to reply',async()=>{
 const h=harness(source,null,config);let delivered=false;
 h.setHandler(url=>url.endsWith('/director/dialogue')?{items:delivered?[]:[{id:'payment',person:'reporter',text:'Передаю 5 USD',command:{type:'money',cents:500}}]}:url.endsWith('/director/dialogue/ack')?(assert.equal(h.writes.findLast(w=>w.path==='/state.json.tmp').data.economy.accounts.reporter,1500),delivered=true,{ok:true}):undefined);
 h.setAnswer({action:'owner_reply',reason:'Ответ владельцу',reply:'Спасибо.',reaction:'Рад',source:'qwen',model:'qwen/qwen3.7-flash'});
 await h.run('tick()');const req=h.requests.find(r=>r.url.endsWith('/api/behavior-decide'));
 assert.equal(req.body.snapshot.self.finances.balance,1500);assert.equal(req.body.snapshot.self.ownerDialogue.effect.status,'applied');
 const offered=req.body.snapshot.self.ownerDialogue.physicalOptions;assert((Array.isArray(offered)?offered.map(a=>a.id):offered.context_table.rows.map(a=>a[0])).some(id=>id!=='owner_reply'));
 assert.deepEqual(req.body.snapshot.available_actions.map(a=>a.id),['owner_reply']);
});
test('failed payment save blocks ack, world publication and model calls until persisted',async()=>{
 const h=harness(source,null,config);h.setHandler(url=>url.endsWith('/director/dialogue')?{items:[{id:'save-fail',person:'reporter',text:'Передаю деньги',command:{type:'money',cents:500}}]}:undefined);
 h.run("var originalWriter=fs.writeFileSync;fs.writeFileSync=()=>{throw Error('fixture failure');}");
 await h.run('pollOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1500);
 await h.run('tick()');await h.run('collectParticipation({viewers:1,execution:true})');await h.run("relay('/director/world',composeWorld(Date.now()))");
 assert.equal(h.requests.filter(r=>r.url.endsWith('/director/dialogue/ack')||r.url.endsWith('/director/world')||r.url.endsWith('/api/behavior-decide')).length,0);
 h.run('fs.writeFileSync=originalWriter');await h.run('tick()');await h.run('pollOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1500);
 assert(h.requests.some(r=>r.url.endsWith('/director/dialogue/ack')));
});
test('director completion integrates owner receipt and premium with witnessed work_finished',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'web_task',text:'Поручение',command:{type:'task',title:'Тема владельца',brief:'Проверить факты',deadlineAt:null,rewardCents:500}},Date.now());applyDialogueCommand(st,'reporter',st.chars.reporter.ownerDialogue[0],Date.now(),{canWork:true});st.chars.reporter.activity='work';st.chars.reporter.arriveAt=Date.now()-1;st.tasks[0].done_min=4.99;");
 await h.run('updatePersonNeeds(\'reporter\',Date.now(),1200)');const s=h.state();
 assert.equal(s.tasks.length,0);assert.equal(s.economy.accounts.reporter,1800);assert.equal(s.chars.reporter.ownerDialogue[0].effect.status,'completed');assert.equal(ownerTaskContext(s,'reporter',h.now()).length,0);
 assert.equal(h.writes.findLast(w=>w.path==='/state.json.tmp').data.economy.accounts.reporter,1800);
});
test('requests retain actual options across restart and never force physical state',()=>{
 let st=fixture();const t=turn(st,'web_request',{type:'request',action:'coffee@bar'});
 applyDialogueCommand(st,'reporter',t,3,{physicalOptions:[{id:'coffee@bar',description:'Выпить кофе у бара'}]});
 assert.equal(t.effect.status,'requested');assert.equal(st.chars.reporter.activity,undefined);
 st=JSON.parse(JSON.stringify(st));assert.equal(ownerRequestContext(st,'reporter')[0].action,'coffee@bar');
 assert.equal(recordOwnerRequestChoice(st,'heroine','coffee@bar',4),false);
 assert.equal(recordOwnerRequestChoice(st,'reporter','wait@deskA',4),false);
 assert.equal(ownerRequestContext(st,'reporter').length,1);
 assert.equal(recordOwnerRequestChoice(st,'reporter','coffee@bar',5),true);
 assert.equal(st.chars.reporter.ownerDialogue[0].effect.status,'chosen');
 assert.equal(ownerRequestContext(st,'reporter').length,0);
 assert.equal(recordOwnerRequestChoice(st,'reporter','coffee@bar',6),false);
});
test('unavailable request is rejected without execution and public options match production actions',()=>{
 const st=fixture(),t=turn(st,'web_unavailable',{type:'request',action:'invented@place'});
 assert.equal(applyDialogueCommand(st,'reporter',t,3,{physicalOptions:[]}).error,'requested_action_unavailable');
 assert.equal(ownerRequestContext(st,'reporter').length,0);
 const h=harness(source,null,config);const result=h.run('composeWorld(Date.now())');
 for(const id of Object.keys(result.chars))assert.deepEqual(result.chars[id].ownerActions,h.run(`actions('${id}')`));
});
test('completion persistence failure blocks new decisions and publishing until real premium is durable',async()=>{
 const h=harness(source,null,config);
 h.run("receiveDialogue(st.chars.reporter,{id:'web_task',text:'Поручение',command:{type:'task',title:'Тема',brief:'Проверить факты',deadlineAt:null,rewardCents:500}},Date.now());applyDialogueCommand(st,'reporter',st.chars.reporter.ownerDialogue[0],Date.now(),{canWork:true});st.chars.reporter.activity='work';st.chars.reporter.arriveAt=Date.now()-1;st.tasks[0].done_min=4.99;var originalWriter=fs.writeFileSync;fs.writeFileSync=()=>{throw Error('fixture failure');}");
 await h.run("updatePersonNeeds('reporter',Date.now(),1200)");await h.run('tick()');await h.run("relay('/director/world',st.world)");
 assert.equal(h.requests.filter(r=>r.url.endsWith('/director/world')||r.url.endsWith('/api/behavior-decide')).length,0);
 assert.equal(h.state().economy.accounts.reporter,1800);
 h.run('fs.writeFileSync=originalWriter');await h.run('tick()');
 assert.equal(h.writes.findLast(w=>w.path==='/state.json.tmp').data.economy.accounts.reporter,1800);assert.equal(h.state().tasks.length,0);
});
test('later chat does not hide canonical assignment results from command projection',()=>{
 const st=fixture(),t=turn(st,'web_task',task);applyDialogueCommand(st,'reporter',t,3,{canWork:true});
 st.tasks[0].done_min=5;completeOwnerTask(st,'reporter',st.tasks[0],4);
 for(let i=0;i<31;i++)turn(st,'web_chat_'+i,null,'Разговор');
 const result=publicOwnerCommands(st,'reporter');assert.equal(result.length,1);assert.equal(result[0].status,'completed');assert.equal(result[0].fingerprint,undefined);
});
test('ordinary work cannot corrupt integer cents after a near-limit owner payment',()=>{
 const st=fixture(),t=turn(st,'web_large',{type:'money',cents:Number.MAX_SAFE_INTEGER-1000});
 applyDialogueCommand(st,'reporter',t,3);assert.equal(st.economy.accounts.reporter,Number.MAX_SAFE_INTEGER);
 assert.equal(rewardWork(st,'reporter',{id:'limit',done_min:5,need_min:5},4),false);
 assert.equal(st.economy.accounts.reporter,Number.MAX_SAFE_INTEGER);assert.equal(st.economy.receipts['work:limit'],undefined);
});

test('old assignment completion returns to public receipts after many subsequent commands',()=>{
 const st=fixture(),t=turn(st,'web_task',task);applyDialogueCommand(st,'reporter',t,3,{canWork:true});
 for(let i=0;i<31;i++){const payment=turn(st,'web_pay_'+i,{type:'money',cents:100});applyDialogueCommand(st,'reporter',payment,5+i);}
 st.tasks[0].done_min=5;completeOwnerTask(st,'reporter',st.tasks[0],1000);
 const result=publicOwnerCommands(st,'reporter');assert.equal(result.length,30);assert.equal(result.at(-1).id,t.id);assert.equal(result.at(-1).status,'completed');
});
test('budget trims old supporting dialogue without deleting canonical turns or current obligations',()=>{
 const history=Array.from({length:10},(_,i)=>({id:'turn-'+i,reply:'x'.repeat(500)}));
 const original={self:{relationships:{},ownerDialogueHistory:history,ownerTasks:[{id:'task'}],ownerRequests:[{id:'request'}]},available_actions:[{id:'continue',description:'Real option'}]};
 const out=fitRelationshipRequest(original,1600);assert.equal(history.length,10);assert.equal(out.self.ownerDialogueHistory.length,2);
 assert.deepEqual(out.self.ownerTasks,original.self.ownerTasks);assert.deepEqual(out.self.ownerRequests,original.self.ownerRequests);assert.deepEqual(out.available_actions,original.available_actions);
 assert.deepEqual(out.self.contextProjection.omittedDialogueIds,history.slice(0,8).map(t=>t.id));
});
test('physical options compress losslessly while preserving all IDs and the current owner message',()=>{
 const d={message:{text:'Что ты можешь?'},physicalOptions:Array.from({length:20},(_,i)=>({id:'option-'+i,description:'Выполнить действие '+i+'. Только после независимого согласия собеседника и подтверждённого физического исполнения в редакции.'}))};
 const result=compactDialogueOptions(d);assert(result.optionText);assert.deepEqual(result.message,d.message);
 const rows=result.physicalOptions.context_table.rows;assert.deepEqual(rows.map(a=>a[0]),d.physicalOptions.map(a=>a.id));
 rows.forEach((a,i)=>assert.equal(a[1].replace(/@(P\d+);/g,(_,key)=>result.optionText[key]),d.physicalOptions[i].description));
 assert.equal(d.optionText,undefined);assert.deepEqual(compactDialogueOptions({...d,physicalOptions:[{id:'collision',description:'@P1; must remain literal'}]}).physicalOptions,[{id:'collision',description:'@P1; must remain literal'}]);
});

test('shared performance metadata reconstructs exact contracts and preserves status for history selection',()=>{
 const sequence=Array.from({length:8},(_,i)=>({action:'dance-'+i,duration:10}));
 const original={performances:Array.from({length:10},(_,i)=>({id:'contract-'+i,status:i===9?'offered':'paid',cents:300,sequence,consent:{independent:true}}))};
 const out=compactPerformanceMetadata(original);assert(out.performanceMetadata);
 const decode=value=>typeof value==='string'&&/^@S\d+;$/.test(value)?out.performanceMetadata[value.slice(1,-1)]:value;
 const rows=out.performances.map(r=>({...r,sequence:decode(r.sequence),consent:decode(r.consent)}));assert.deepEqual(rows,original.performances);assert.equal(original.performanceMetadata,undefined);
});


test('only old completed identical refusals are projected; live contracts and ID dependencies remain',()=>{
 const declined=(id,extra={})=>({id,status:'declined',closedAt:10,from:'heroine',to:'reporter',performer:'heroine',payer:'reporter',activity:'dance',reason:'busy',...extra});
 const rows=[declined('old'),declined('referenced'),declined('different',{reason:'no'}),declined('unclosed',{closedAt:null}),declined('live',{status:'offered'}),declined('latest'),declined('dependent',{to:'columnist',previousId:'old'})];
 const input={self:{memory:[{evidenceId:'referenced'}],finances:{performances:rows}}};
 assert.deepEqual([...repeatedDeclinedPerformanceIds(input)],[]);
 delete rows.at(-1).previousId;
 assert.deepEqual([...repeatedDeclinedPerformanceIds(input)],['old']);
 const projected={self:{contextProjection:{reason:'bounded_transport_history',maxStateBytes:65000,omittedRecords:1,omittedPerformanceIds:['old']},memory:input.self.memory}};
 const audit=takeContextProjection(projected);assert.deepEqual(audit.omittedPerformanceIds,['old']);assert.equal(projected.self.contextProjection,undefined);assert.equal(input.self.finances.performances.length,7);
 const extension={self:{contextProjection:{reason:'unknown',fact:true}}};assert.equal(takeContextProjection(extension),null);assert.equal(extension.self.contextProjection.fact,true);
});


test('phone payment waits for physical receipt and canonical save before replies, archive or model use',async()=>{
 const h=harness(source,null,config);
 h.run("applyDecision=(id)=>{st.chars[id].activity='phone';return true;};startCall(Date.now(),'Передаю 2.50 USD','reporter','bot-payment',{type:'money',cents:250})");
 assert.equal(h.state().economy.accounts.reporter,1000);
 h.run("executionCapabilities={at:Date.now(),actors:{reporter:{loaded:true,seq:st.chars.reporter.seq,activity:'phone',phone:{seq:st.chars.reporter.seq,receiving:true}}}};var phoneWriter=fs.writeFileSync;fs.writeFileSync=()=>{throw Error('disk')};receiveOwnerCall(Date.now())");
 assert.equal(h.state().economy.accounts.reporter,1250);assert.equal(h.run('dialogueSavePending'),true);
 await h.run('tick()');assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,0);
 h.run('fs.writeFileSync=phoneWriter');await h.run('tick()');assert.equal(h.run('dialogueSavePending'),false);
 h.run('receiveOwnerCall(Date.now())');assert.equal(h.state().economy.accounts.reporter,1250);
 assert.equal(h.state().chars.reporter.ownerDialogue[0].effect.status,'applied');
});
