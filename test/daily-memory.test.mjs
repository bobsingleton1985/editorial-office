import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MEMORY_LIMITS as L,MemoryArchive,bindMemory,addMemory,memoryBatch,memoryDue,beginMemoryAttempt,applyMemorySelection,memoryContext,memoryBytes} from '../director/daily-memory.mjs';
import {compactSnapshot} from '../director/compact-snapshot.mjs';
import {harness} from './director-harness.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
function actor(){const archived=[];const p={memory:[],money:{balance:100},boundaries:['no flirting']};bindMemory(p,'reporter',{append:(actor,row)=>archived.push(structuredClone(row))},0);return {p,archived};}
test('100000 noisy decisions cannot grow history or displace a meaningful event',()=>{
 const {p,archived}=actor();addMemory(p,{event:'work_finished',title:'Important old work'},1);
 for(let i=0;i<100000;i++)addMemory(p,{action:'continue',at:i,fatigue_before:30,source:'qwen'},i+2);
 assert.equal(archived.length,1);assert.equal(p.memory[0].title,'Important old work');assert.equal(p.dailyMemory.sequence,1);
});
test('all semantic events archive; bounded diverse input, recent events, replacements over 30 days',()=>{
 const {p,archived}=actor();addMemory(p,{event:'owner_boundary',answer:'decline',text:'Do not flirt'},1);
 for(let i=0;i<3000;i++)addMemory(p,{event:'invitation',answer:'accept',partner:'columnist',at:i},i+2);
 assert.equal(archived.length,3001);assert.ok(p.dailyMemory.candidates.some(x=>x.event==='owner_boundary'));
 let now=L.intervalMs;const money=structuredClone(p.money),boundaries=structuredClone(p.boundaries);
 for(let day=1;day<=30;day++){
  assert.ok(memoryDue(p,now));const batch=memoryBatch(p);assert.ok(memoryBytes(batch.candidates)<=L.candidateBytes);
  assert.ok(batch.candidates.length<=L.candidateRecords);const chosen=batch.previous[0]||batch.candidates[0];
  beginMemoryAttempt(p,now);applyMemorySelection(p,batch,{selected_ids:[chosen.memoryId]},now);
  assert.equal(p.dailyMemory.summary.length,1);assert.ok(memoryBytes(p.dailyMemory.summary)<=L.summaryBytes);
  assert.ok(memoryBytes(p.memory)<=L.recentBytes);assert.ok(p.memory.length<=L.recentRecords);
  assert.ok(!memoryDue(p,now));addMemory(p,{event:'conversation_finished',partner:'columnist',endedAt:now},now+1);now+=L.intervalMs;
 }
 assert.deepEqual(p.money,money);assert.deepEqual(p.boundaries,boundaries);
 const context=compactSnapshot({self:{id:'reporter',character:'fixture',needs:{hunger:25},...memoryContext(p)},available_actions:[]});
 assert.ok(memoryBytes(context.self.memory)<=L.summaryBytes+L.recentBytes);
 assert.ok(Object.keys(context.self).indexOf('memory')<Object.keys(context.self).indexOf('needs'));
});
test('replace without losing incoming events; reject unknown duplicate and oversized choices',()=>{
 const {p}=actor();addMemory(p,{event:'one'},1);const batch=memoryBatch(p);addMemory(p,{event:'two'},2);
 assert.throws(()=>applyMemorySelection(p,batch,{selected_ids:['mem-'+ '0'.repeat(24)]},3),/unknown/);
 assert.throws(()=>applyMemorySelection(p,batch,{selected_ids:[batch.candidates[0].memoryId,batch.candidates[0].memoryId]},3),/invalid/);
 applyMemorySelection(p,batch,{selected_ids:[batch.candidates[0].memoryId]},3);
 assert.equal(p.dailyMemory.candidates.length,1);assert.equal(p.dailyMemory.candidates[0].event,'two');
 const newer=memoryBatch(p);applyMemorySelection(p,newer,{selected_ids:[]},4);assert.equal(p.dailyMemory.summary.length,0);
 const large=actor().p;addMemory(large,{event:'large',text:'x'.repeat(5000)},1);const b=memoryBatch(large);
 assert.throws(()=>applyMemorySelection(large,b,{selected_ids:[b.candidates[0].memoryId]},3),/limit/);
});
test('archive is durable and idempotent; failed migration preserves original memory',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-memory-test-'));
 try{const p={memory:[{event:'old',at:'23:59'}]},archive=new MemoryArchive(dir);bindMemory(p,'reporter',archive,1);
 const row=p.memory[0];archive.append('reporter',row);assert.equal(fs.readdirSync(dir+'/reporter').filter(x=>x.endsWith('.json')).length,1);
 assert.throws(()=>archive.append('reporter',{...row,event:'different'}),/conflict/);
 const original={memory:[{event:'old',text:'preserve'}]},copy=structuredClone(original);
 bindMemory(original,'reporter',{append(){throw Error('disk failed');}},1);assert.equal(original.dailyMemory.outbox[0].text,copy.memory[0].text);assert.equal(original.memory[0].text,copy.memory[0].text);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
function dueHarness(){const h=harness(source);h.run("addMemory(st.chars.reporter,{event:'work_finished',title:'Daily memory fixture'},Date.now());st.chars.reporter.dailyMemory.createdAt=Date.now()-86400000;");return h;}
test('director uses dedicated request and shared session, preserves physical state and daily throttle on restart',async()=>{
 const h=dueHarness(),before=h.state().chars.reporter;
 h.setHandler((url,body)=>{if(url.endsWith('/api/memory-consolidate'))return {revision:body.snapshot.revision,selected_ids:[body.snapshot.memoryMaintenance.candidates[0].memoryId],source:'qwen'};});
 assert.equal(await h.run('consolidateDailyMemory(Date.now())'),true);
 const after=h.state().chars.reporter;for(const key of ['place','activity','seq','fatigue','needs','relationships'])assert.deepEqual(after[key],before[key]);
 assert.equal(after.dailyMemory.status,'ok');assert.equal(after.dailyMemory.summary.length,1);
 assert.equal(h.requests.filter(x=>x.url.endsWith('/api/memory-consolidate')).length,1);
 assert.equal(await h.run('consolidateDailyMemory(Date.now())'),false);
 const restarted=harness(source,h.state());assert.equal(await restarted.run('consolidateDailyMemory(Date.now())'),false);
});
test('no viewers at either gate prevent paid request; provider failure preserves old memory and waits a day',async()=>{
 for(const gate of [1,2,3]){const h=dueHarness();let seen=0;
 h.setHandler(url=>{if(url.endsWith('/director/status'))return {viewers:++seen>=gate?0:1};});
 await h.run('consolidateDailyMemory(Date.now())');assert.equal(h.requests.filter(x=>x.url.endsWith('/api/memory-consolidate')).length,0);assert.equal(h.state().chars.reporter.dailyMemory.lastAttemptAt,null);
 }
 const h=dueHarness(),before=h.state().chars.reporter.dailyMemory;
 h.setHandler(url=>{if(url.endsWith('/api/memory-consolidate'))throw Error('openrouter_connection_failed');});
 await h.run('consolidateDailyMemory(Date.now())');const m=h.state().chars.reporter.dailyMemory;
 assert.deepEqual(m.summary,before.summary);assert.deepEqual(m.candidates,before.candidates);assert.equal(m.status,'error');
 h.advance(60001);assert.equal(await h.run('consolidateDailyMemory(Date.now())'),false);
 const restarted=harness(source,h.state());assert.equal(await restarted.run('consolidateDailyMemory(Date.now())'),false);
});
test('director rejects invalid source, keeps incoming event during pending provider response',async()=>{
 const h=dueHarness();h.setHandler((url,body)=>{if(url.endsWith('/api/memory-consolidate')){h.run("addMemory(st.chars.reporter,{event:'conversation_finished',partner:'columnist'},Date.now());");return {revision:body.snapshot.revision,selected_ids:[body.snapshot.memoryMaintenance.candidates[0].memoryId]};}});
 await h.run('consolidateDailyMemory(Date.now())');assert.equal(h.state().chars.reporter.dailyMemory.candidates[0].event,'conversation_finished');
});

test('archive failure cannot split all-staff bonus; outbox survives restart and flushes without charging twice',async()=>{
 const {ensureEconomy,grantOwnerBonus}=await import('../director/economy.mjs');
 const {memoryArchiveReady}=await import('../director/daily-memory.mjs');
 const st={chars:{columnist:{memory:[]},reporter:{memory:[]}}};let failing=false;const archive=[];
 const store={append(actor,row){if(failing)throw Error('disk full');archive.push({actor,row});}};
 for(const [id,p]of Object.entries(st.chars))bindMemory(p,id,store,0);
 ensureEconomy(st,{enabled:true,currency:'USD',startingCents:100,workRewardCents:0,prices:{},offerAmounts:[],loanDays:3},0);
 failing=true;const command={version:1,type:'owner_bonus',id:'daily-memory-fixture',target:'all',cents:50};
 const receipt=grantOwnerBonus(st,command,1);assert.equal(receipt.status,'applied');assert.deepEqual(st.economy.accounts,{columnist:150,reporter:150});
 for(const p of Object.values(st.chars)){assert.equal(p.dailyMemory.outbox.length,1);assert.equal(memoryArchiveReady(p),false);assert.equal(p.memory.at(-1).event,'money_bonus');}
 const resumed=structuredClone(st);failing=false;
 for(const [id,p]of Object.entries(resumed.chars))bindMemory(p,id,store,2);
 assert.equal(grantOwnerBonus(resumed,command,3).status,'applied');assert.deepEqual(resumed.economy.accounts,{columnist:150,reporter:150});
 assert.equal(archive.filter(x=>x.row.event==='money_bonus').length,2);assert.ok(Object.values(resumed.chars).every(p=>p.dailyMemory.outbox.length===0));
});
test('restart clears pending status and recovers archived facts after an older checkpoint',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'memory-recovery-'));
 try{const store=new MemoryArchive(dir),p={memory:[]};bindMemory(p,'reporter',store,0);addMemory(p,{event:'one'},1);const checkpoint=structuredClone(p);
 addMemory(p,{event:'two'},2);beginMemoryAttempt(checkpoint,L.intervalMs);bindMemory(checkpoint,'reporter',store,L.intervalMs+1);
 assert.equal(checkpoint.dailyMemory.status,'interrupted');assert.equal(checkpoint.dailyMemory.lastAttemptAt,L.intervalMs);assert.equal(memoryDue(checkpoint,L.intervalMs+1),false);
 assert.deepEqual(checkpoint.dailyMemory.candidates.map(x=>x.event),['one','two']);assert.equal(checkpoint.dailyMemory.sequence,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('all snapshot history remains ordered across selected/recent boundary',()=>{
 const {p}=actor();addMemory(p,{event:'first'},1);addMemory(p,{event:'second'},2);const b=memoryBatch(p);
 applyMemorySelection(p,b,{selected_ids:[b.candidates[1].memoryId]},3);
 const c=memoryContext(p);assert.deepEqual(c.memory.map(x=>x.memorySequence),[1,2]);
 for(let i=3;i<=15;i++)addMemory(p,{event:'new',at:i},i);
 const later=memoryContext(p);assert.deepEqual(later.memory.map(x=>x.memorySequence),[2,...Array.from({length:12},(_,i)=>i+4)]);
});

test('selected large fact survives a gap in the recent byte window',()=>{
 const {p}=actor();addMemory(p,{event:'small'},1);addMemory(p,{event:'important',text:'x'.repeat(3400)},2);const b=memoryBatch(p);applyMemorySelection(p,b,{selected_ids:[b.candidates[1].memoryId]},3);addMemory(p,{event:'new',text:'y'.repeat(3400)},4);assert.deepEqual(p.memory.map(r=>r.memorySequence),[1,3]);assert.deepEqual(memoryContext(p).memory.map(r=>r.memorySequence),[1,2,3]);assert.ok(memoryBytes(memoryContext(p).memory)<=8000);
});

test('memory request status explains the operation without claiming physical action',async()=>{
 const {requestStatusText}=await import('../src/model-status.mjs');const text=requestStatusText({actor:'reporter',kind:'memory',status:'error',error:'memory_invalid_selection',failedAt:0,retryAt:86400000,blocked:false},1);assert.match(text,/обновление памяти/);assert.match(text,/Предыдущая память сохранена/);assert.doesNotMatch(text,/выбор действия/);
});

test('daily context error recovers after next-attempt crash with matching history; physical guard stays blocked',async()=>{
 const {requestStarted,requestFailed,recoverInterruptedRequests,requestAllowed}=await import('../director/model-requests.mjs');
 const st={chars:{reporter:{dailyMemory:{lastAttemptAt:1}}}};requestStarted(st,'reporter','memory','day1',1);requestFailed(st,'reporter','memory','day1',Error('qwen_context_estimate_limit'),2);
 assert.deepEqual(st.modelRequests.history.at(-1),st.modelRequests.current['reporter:memory']);assert.equal(requestAllowed(st,'reporter','memory',L.intervalMs+1),true);
 st.chars.reporter.dailyMemory.lastAttemptAt=L.intervalMs+1;requestStarted(st,'reporter','memory','day2',L.intervalMs+1);recoverInterruptedRequests(st,L.intervalMs+2);
 assert.equal(requestAllowed(st,'reporter','memory',2*L.intervalMs+1),true);assert.deepEqual(st.modelRequests.history.at(-1),st.modelRequests.current['reporter:memory']);
 requestFailed(st,'reporter','physical','physical1',Error('qwen_context_estimate_limit'),2);assert.equal(st.modelRequests.current['reporter:physical'].blocked,true);
});

test('daily transport bounds unrelated relationship history without dropping current facts or source batch',async()=>{
 const h=dueHarness();h.run("st.chars.reporter.relationships.columnist.dimensionDecisions=Array.from({length:10000},(_,i)=>({id:'old-'+i,at:i,summary:'Old supporting history '.repeat(10)}));");let sent;
 h.setHandler((url,body)=>{if(url.endsWith('/api/memory-consolidate')){sent=body.snapshot;return {revision:sent.revision,selected_ids:[]};}});await h.run('consolidateDailyMemory(Date.now())');
 assert.ok(sent);assert.ok(memoryBytes(sent)<65000);assert.ok(sent.self.relationships.columnist.dimensionDecisions.length<=6);assert.equal(sent.memoryMaintenance.candidates[0].event,'work_finished');assert.equal(sent.self.needs.hunger,0);
});
