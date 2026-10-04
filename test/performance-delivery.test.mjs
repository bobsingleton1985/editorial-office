import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {createTvSchedule} from '../src/tv-schedule.js';
import {finalContextGuardReady} from '../director/relationship-context.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const config={enabled:true,currency:'USD',startingCents:1000,workRewardCents:0,prices:{},offerAmounts:[],loanDays:3};
test('preserves activated v5 guard compatibility with the same enforced reserve and limits',()=>{
 const s={model:'typesafe/jev-1.13',jev_context_guard:{version:'jev-context-v5',ready:true,enforced:true,mode:'estimated',strict:false,exact_token_count:false,measurement:'local_lexical_estimate_v1',safety_reserve_percent:20,admission_context_limit:25600,admission_request_limit:51200,state_and_longest_question_limit:32000,request_limit:64000,target:20000,counter_available:true}};
 assert.equal(finalContextGuardReady(s),true);
 for(const patch of [{safety_reserve_percent:0},{admission_context_limit:32000},{enforced:false},{version:'unknown'}])assert.equal(finalContextGuardReady({...s,jev_context_guard:{...s.jev_context_guard,...patch}}),false);
 assert.equal(finalContextGuardReady({...s,jev_context_guard:{...s.jev_context_guard,version:'jev-context-v4',target:24000}}),true);
});
function setup(){
 const h=harness(source,null,config,1,Date.UTC(2026,9,4,12));
 h.run(`cityUtc=0;st.tvMusic=null;
 var hp=beginConversation(st,'heroine','reporter',{heroine:'window2',reporter:'window'},Date.now(),'test');
 hp.phase='active';hp.seconds=5;hp.lastReport=Date.now();
 for(const id of hp.members){st.chars[id].activity='conversation';st.chars[id].place=hp.places[id];}
 executionCapabilities={at:Date.now(),styles:[],actors:Object.fromEntries(hp.members.map(id=>[id,{seq:st.chars[id].seq,loaded:true,mode:'idle',x:PLACES[st.chars[id].place].x,z:PLACES[st.chars[id].place].z,profiles:['stand','bench-left'],moneyWitness:1,performanceDurations:{heroine_dance1:38,heroine_dance2:37,heroine_pose1:16,heroine_love1:20}}]))};`);
 return h;
}
const offer=h=>assert.equal(h.run("applyDecision('heroine','money_performance_offer@reporter:heroine_dance1','jev',1)"),true);
const accept=h=>assert.equal(h.run("applyDecision('reporter','money_performance_reply@performance-1:accept','jev',1)"),true);
const advance=h=>h.run("advancePerformances(st,Date.now(),performanceInput(Date.now()),(id,a)=>applyDecision(id,a,'performance_executor',null,null,true),ms=>ensureDanceMusic(Date.now(),ms))");
test('dance proposals and independent replies reach the public world without replaying commands',()=>{
 for(const answer of ['accept','decline']){
  const h=setup(),before=h.state().chars.heroine;offer(h);
  let st=h.state();assert.deepEqual(st.world.chars.heroine.talk,{at:h.now(),to:'reporter',icon:'dance',mark:'q'});
  assert.equal(st.chars.heroine.seq,before.seq);
  const receiver=st.chars.reporter;h.advance(1000);
  assert.equal(h.run(`applyDecision('reporter','money_performance_reply@performance-1:${answer}','jev',1)`),true);
  st=h.state();assert.deepEqual(st.world.chars.reporter.talk,{at:h.now(),to:'heroine',icon:'dance',mark:answer==='accept'?'yes':'no'});
  assert.equal(st.chars.reporter.seq,receiver.seq);
  assert.deepEqual({...st.chars.reporter.entry,talk:undefined},{...receiver.entry,talk:undefined});
 }
 const h=setup();offer(h);h.run('st.economy.accounts.reporter=299');
 const before=h.state().chars.reporter.entry;
 assert.equal(h.run("applyDecision('reporter','money_performance_reply@performance-1:accept','jev',1)"),false);
 assert.deepEqual(h.state().chars.reporter.entry,before);
});
function autoStart(h){
 offer(h);accept(h);advance(h);advance(h);
 assert.equal(h.state().chars.reporter.activity,'rest_lounge');
 const seq=h.state().chars.reporter.seq;advance(h);assert.equal(h.state().chars.reporter.seq,seq);
 assert.equal(h.state().economy.performances[0].status,'reserved');
 h.run("executionCapabilities.at=Date.now();Object.assign(executionCapabilities.actors.reporter,{seq:st.chars.reporter.seq,mode:'seated',seat:'benchS',activity:'rest_lounge',executing:true})");
 advance(h);assert.equal(h.state().economy.performances[0].status,'running');
 h.run("Object.assign(executionCapabilities.actors.heroine,{seq:st.chars.heroine.seq,activity:st.chars.heroine.activity})");
}
test('silence does not hide ordinary dance or paid offer; selected dance tunes the actual TV schedule',()=>{
 const h=setup();assert.equal(h.run('musicOn(Date.now())'),false);
 assert(h.run("actions('reporter').some(a=>a.id.startsWith('dance@'))"));
 assert(h.run("actions('heroine').some(a=>a.id.startsWith('heroine_dance1@'))"));
 assert(h.run("actions('heroine').some(a=>a.id.startsWith('money_performance_offer@'))"));
 assert.equal(h.run("applyDecision('reporter','dance@tv2','jev',1)"),undefined);
 const st=h.state();assert.equal(st.tvMusic.source,'automatic_dance');assert.equal(st.tvMusic.from,h.now());
 assert(st.tvMusic.until>=st.chars.reporter.busyUntil+30000);
 const video={readyState:1,currentTime:0};let shown=null;
 const schedule=createTvSchedule({switchTo:t=>{shown=t;},testcard:{}},()=>({userData:{video}}),{now:()=>h.now(),cityHour:()=>12});
 schedule.tune(st.world.tv);schedule.update();assert.equal(schedule.current,'jazz');assert(shown);
});
test('delivered proposal remains answerable after conversation, music and capability expiry',()=>{
 const h=setup();offer(h);h.advance(4000);
 h.run("finishConversation(st,'heroine','self_leave','jev',Date.now());executionCapabilities=null;st.tvMusic=null");
 assert(h.run("actions('reporter').some(a=>a.id==='money_performance_reply@performance-1:accept')"));
 accept(h);assert.equal(h.state().economy.performances[0].status,'reserved');
 advance(h);assert.equal(h.state().chars.reporter.activity,'wait');
 assert.equal(h.state().economy.ledger.filter(x=>x.kind==='performance').length,0);
});
test('heroine can independently accept a delivered order with stale renderer feedback',()=>{
 const h=setup();assert.equal(h.run("applyDecision('reporter','money_performance_offer@heroine:heroine_dance2','jev',1)"),true);
 h.advance(4000);h.run("finishConversation(st,'reporter','self_leave','jev',Date.now());executionCapabilities=null;st.chars.heroine.busyUntil=Date.now()");
 assert(h.run("actions('heroine').some(a=>a.id==='money_performance_reply@performance-1:accept')"));
 assert.equal(h.run("applyDecision('heroine','money_performance_reply@performance-1:accept','jev',1)"),true);
 advance(h);assert.equal(h.state().economy.performances[0].status,'reserved');assert.equal(h.state().economy.accounts.heroine,1000);
});
test('early quote consideration preserves in-flight sequence and origin instead of replaying movement',()=>{
 const h=setup();offer(h);h.run("var p=st.chars.reporter;p.place='phoneA';p.activity='phone';p.arriveAt=Date.now()+40000;p.entry={from:{spot:'window'},cmd:{spot:'phoneA'},at:Date.now()};executionCapabilities.actors.reporter.mode='walk'");
 const before=h.state().chars.reporter;
 const ids=h.run("actions('reporter').map(a=>a.id)");
 assert(ids.includes('continue'));assert(ids.includes('money_performance_reply@performance-1:decline'));assert(ids.includes('money_performance_reply@performance-1:accept'));
 assert(ids.every(a=>a==='continue'||a.startsWith('money_performance_reply@')||a.startsWith('money_performance_cancel@')));
 assert.equal(h.run("applyDecision('reporter','continue','jev',1)"),true);
 const after=h.state().chars.reporter;assert.equal(after.seq,before.seq);assert.deepEqual(after.entry,before.entry);assert.equal(after.arriveAt,before.arriveAt);
});
test('acceptance validates current budget, expiry, mode and actor even with unrelated economy revision',()=>{
 const h=setup();offer(h);h.run("var expected=decisionContext('reporter');st.economy.revision++");
 assert.equal(h.run("applyDecision('reporter','money_performance_reply@performance-1:accept','jev',1,expected)"),true);
 for(const mutation of ["st.economy.accounts.reporter=299", "st.economy.performances[0].expiresAt=Date.now()", "st.hostessMode='drinks'", "st.chars.reporter.seq++"]){
  const blocked=setup();offer(blocked);blocked.run("var expected=decisionContext('reporter');"+mutation);
  assert.equal(blocked.run("applyDecision('reporter','money_performance_reply@performance-1:accept','jev',1,expected)"),false);
  assert.equal(blocked.state().economy.performances[0].status,'offered');
 }
});
test('consent during movement waits for each actor to physically arrive before replacing its command',()=>{
 for(const moving of ['reporter','heroine']){
  const h=setup();offer(h);accept(h);
  h.run(`finishConversation(st,${JSON.stringify(moving)},'self_leave','jev',Date.now());var p=st.chars[${JSON.stringify(moving)}];p.place='phoneA';p.entry={from:{spot:'window'},cmd:{spot:'phoneA'},at:Date.now()};executionCapabilities.actors[${JSON.stringify(moving)}].mode='walk'`);
  const before=h.state().chars[moving];advance(h);advance(h);
  if(moving==='heroine'){
   h.run("Object.assign(executionCapabilities.actors.reporter,{seq:st.chars.reporter.seq,mode:'seated',seat:'benchS',activity:'rest_lounge',executing:true})");advance(h);
  }
  assert.equal(h.state().chars[moving].seq,before.seq);assert.deepEqual(h.state().chars[moving].entry,before.entry);
  h.run(`Object.assign(executionCapabilities.actors[${JSON.stringify(moving)}],{mode:'idle',x:PLACES.phoneA.x,z:PLACES.phoneA.z})`);
  advance(h);assert(h.state().chars[moving].seq>before.seq);
 }
});
test('received quote prompts one independent decision while busy, keeping decline and other choices',async()=>{
 const h=setup();offer(h);
 h.run("st.chars.reporter.needs.hunger=100;st.reflection={lastAttemptAt:Date.now(),lastCompletedAt:Date.now(),actorAttempts:{},yieldPhysical:true};st.executionBoot='test'");
 h.setHandler(async url=>url.endsWith('/director/status')?{viewers:1,seq:h.state().seq,boot:'test',execution:true,nudge:0}:undefined);
 h.setAnswer({action:'continue',confidence:1});await h.run('tick()');
 const request=h.requests.find(x=>x.url.endsWith('/api/behavior-decide'));
 assert(request);assert.equal(request.body.snapshot.self.id,'reporter');
 const options=request.body.snapshot.available_actions.map(x=>x.semantic_id||x.id);
 assert(options.includes('continue'));assert(options.includes('money_performance_reply@performance-1:accept'));assert(options.includes('money_performance_reply@performance-1:decline'));
 assert.equal(h.state().economy.performances[0].status,'offered');assert.equal(h.state().economy.performances[0].consideredAt,h.now());
 assert.equal(h.run("performanceReplyDue(st,'reporter',Date.now())"),undefined);
});
test('a failed request neither consumes the quote prompt nor invents consent',async()=>{
 const h=setup();offer(h);h.run("st.reflection={lastAttemptAt:Date.now(),lastCompletedAt:Date.now(),actorAttempts:{},yieldPhysical:true};st.executionBoot='test'");
 h.setHandler(async url=>url.endsWith('/director/status')?{viewers:1,seq:h.state().seq,boot:'test',execution:true,nudge:0}:undefined);
 h.setAnswer(new Error('test transport failure'));await h.run('tick()');
 const c=h.state().economy.performances[0];assert.equal(c.consideredAt,undefined);assert.equal(c.consent.reporter,undefined);assert.equal(c.status,'offered');
});
test('mutual consent starts automatic music, waits for seating, executes and pays exactly once',()=>{
 const h=setup();autoStart(h);assert.equal(h.state().tvMusic.source,'automatic_dance');
 assert.equal(h.state().chars.heroine.entry.source,'performance_executor');assert.equal(h.state().economy.accounts.heroine,1000);
 for(let i=0;i<113;i++){h.advance(1000);h.run('executionCapabilities.at=Date.now();observePerformances(st,executionCapabilities,Date.now())');}
 h.run("var c=st.economy.performances[0];Object.assign(executionCapabilities.actors.heroine,{executionEnd:{seq:c.seq,outcome:'completed'},performanceWitness:{id:c.id,activity:c.activity,duration:c.duration,complete:true,renderedMs:c.duration*1000}});observePerformances(st,executionCapabilities,Date.now());observePerformances(st,executionCapabilities,Date.now())");
 assert.equal(h.state().economy.accounts.heroine,1300);assert.equal(h.state().economy.accounts.reporter,700);assert.equal(h.state().economy.performances[0].status,'paid');
 assert.equal(h.state().economy.ledger.filter(x=>x.kind==='performance').length,1);
});
test('absent consent, stale receipts and cancelled contracts never start; incomplete or replayed witness never pays',()=>{
 const h=setup();offer(h);advance(h);assert.equal(h.state().tvMusic,null);assert.equal(h.state().chars.reporter.activity,'conversation');
 accept(h);h.advance(4000);advance(h);assert.equal(h.state().tvMusic,null);
 h.run("cancelPerformance(st,st.economy.performances[0],'participant_cancelled',Date.now());executionCapabilities.at=Date.now()");advance(h);assert.equal(h.state().economy.performances[0].status,'cancelled');
 for(const mutation of ['delete a.performanceWitness','a.performanceWitness.renderedMs=1000','a.executionEnd.replayed=true']){
  const bad=setup();autoStart(bad);
  for(let i=0;i<113;i++){bad.advance(1000);bad.run('executionCapabilities.at=Date.now();observePerformances(st,executionCapabilities,Date.now())');}
  bad.run("var c=st.economy.performances[0],a=executionCapabilities.actors.heroine;Object.assign(a,{executionEnd:{seq:c.seq,outcome:'completed'},performanceWitness:{id:c.id,activity:c.activity,duration:c.duration,complete:true,renderedMs:c.duration*1000}});"+mutation+";observePerformances(st,executionCapabilities,Date.now())");
  assert.equal(bad.state().economy.accounts.heroine,1000);assert.equal(bad.state().economy.ledger.filter(x=>x.kind==='performance').length,0);
 }
});
