import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerIntentActions,ownerIntentContext,parseOwnerIntent,applyOwnerIntent} from '../director/owner-intent.mjs';
import {receiveDialogue} from '../director/owner-dialogue.mjs';
import {ensureEconomy,UNCONFIGURED_ECONOMY} from '../director/economy.mjs';
import {completeOwnerTask,recordOwnerRequestChoice} from '../director/owner-dialogue-commands.mjs';
import {harness} from './director-harness.mjs';
const config={...structuredClone(UNCONFIGURED_ECONOMY),enabled:true,startingCents:1000};
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const roster=[{id:'reporter'},{id:'heroine'},{id:'columnist'},{id:'newspaper_editor'}];
const reply={action:'owner_reply',source:'qwen',model:'qwen/qwen3.7-flash',reply:'Понял вас.',reaction:'Внимание к просьбе.'};
function fixture(text='Передай репортёру пять долларов'){
 const st={chars:{reporter:{memory:[]},heroine:{memory:[]}},tasks:[]};ensureEconomy(st,config,1);
 receiveDialogue(st.chars.reporter,{id:'turn',text},1000);
 const turn=st.chars.reporter.ownerDialogue[0];return {st,turn,context:ownerIntentContext(st.chars.reporter,turn,roster,1000,'reporter')};
}
const decision=(kind,params={})=>({action:'owner_intent_'+kind,reason:JSON.stringify({explanation:'Краткое объяснение',...params}),source:'qwen',requestId:'request-test'});
const money={target:'reporter',cents:500,evidence:{messageId:'turn',quote:'пять долларов'}};
function handlerFor(h,kind,params,resolve=null){
 h.setHandler((url,body)=>{
  if(!url.endsWith('/api/behavior-decide'))return;
  const stage=body.snapshot.self.ownerInterpretation?.stage;
  const d=stage==='recognize'?decision(kind,params):stage==='resolve_action'?{action:resolve,reason:'Соответствует просьбе',source:'qwen'}:reply;
  const a=body.snapshot.available_actions.find(a=>(a.semantic_id||a.id)===d.action);assert(a,'offered semantic decision');return {...d,action:a.id};
 });
}
test('recognition validates model provenance, exact human evidence, typed fields and limits',()=>{
 const {context}=fixture();assert.equal(parseOwnerIntent(decision('money',money),context).command.cents,500);
 for(const d of [ {...decision('money',money),source:'rule'},decision('money',{...money,cents:-5}),decision('money',{...money,cents:2.2}),decision('money',{...money,target:'someone'}),decision('money',{...money,evidence:{messageId:'turn',quote:'семь долларов'}}),decision('money',{...money,extra:'unexpected'}),{...decision('chat'),reason:'Обычное объяснение'}])assert.throws(()=>parseOwnerIntent(d,context));
});
test('forwarded content and already effected prior directives cannot authorize another effect',()=>{
 const {st,turn,context}=fixture();context.instructionEligible=false;assert.throws(()=>parseOwnerIntent(decision('money',money),context));
 turn.status='answered';turn.reply='Спасибо';turn.effect={status:'applied'};
 receiveDialogue(st.chars.reporter,{id:'thanks',text:'Спасибо'},1001);
 const c=ownerIntentContext(st.chars.reporter,st.chars.reporter.ownerDialogue[1],roster,1001,'reporter');assert.throws(()=>parseOwnerIntent(decision('money',money),c));
});
test('natural confirmation can use an eligible earlier human request, with anchored task deadline',()=>{
 const {st,turn}=fixture('Подготовь статью о бюджете');turn.status='answered';turn.reply='К какому сроку?';
 receiveDialogue(st.chars.reporter,{id:'answer',text:'Через час'},1001);
 const c=ownerIntentContext(st.chars.reporter,st.chars.reporter.ownerDialogue[1],roster,1001,'reporter');
 const d=parseOwnerIntent(decision('task',{target:'reporter',title:'Бюджет',brief:'Подготовить статью о бюджете',deadlineMinutes:60,rewardCents:0,evidence:{messageId:'turn',quote:turn.text}}),c);
 assert.equal(d.command.deadlineAt,3601001);assert.equal(d.command.rewardCents,0);
 assert.throws(()=>parseOwnerIntent(decision('task',{target:'reporter',title:'Бюджет',brief:'Бюджет',deadlineMinutes:0,rewardCents:0,evidence:{messageId:'turn',quote:turn.text}}),c));
});
test('inferred payment is exactly once and leaves input identity unchanged across restart',()=>{
 let {st,turn,context}=fixture();const intent=parseOwnerIntent(decision('money',money),context);
 applyOwnerIntent(st,turn,intent,()=>[],()=>true,1001);assert.equal(turn.command,undefined);
 st=structuredClone(st);turn=st.chars.reporter.ownerDialogue[0];applyOwnerIntent(st,turn,intent,()=>[],()=>true,1002);
 assert.equal(st.economy.accounts.reporter,1500);assert.equal(st.economy.ledger.filter(t=>t.kind==='bonus').length,1);assert.equal(receiveDialogue(st.chars.reporter,{id:'turn',text:turn.text},1003),false);
});
test('all-colleague payment receipts stay idempotent even after partial rejection',()=>{
 const {st,turn,context}=fixture('Всем по пять долларов');st.economy.accounts.heroine=Number.MAX_SAFE_INTEGER;
 const i=parseOwnerIntent(decision('money',{...money,target:'all',evidence:{messageId:'turn',quote:turn.text}}),context);
 applyOwnerIntent(st,turn,i,()=>[],()=>true,1001);assert.equal(turn.effect.status,'partial');assert.equal(st.economy.accounts.reporter,1500);
 applyOwnerIntent(st,turn,i,()=>[],()=>true,1002);assert.equal(st.economy.accounts.reporter,1500);assert.equal(st.economy.accounts.heroine,Number.MAX_SAFE_INTEGER);
});
test('cross-recipient assignment completion and request choice update originating conversation',()=>{
 const {st,turn}=fixture();const command={type:'task',title:'Тема',brief:'Подготовить материал',deadlineAt:null,rewardCents:200};
 applyOwnerIntent(st,turn,{target:'heroine',command},()=>[],()=>true,1001);st.tasks[0].done_min=5;
 completeOwnerTask(st,'heroine',st.tasks[0],1002);assert.equal(turn.effect.status,'completed');assert.equal(st.economy.accounts.heroine,1200);
 receiveDialogue(st.chars.reporter,{id:'next',text:'Подойди к окну'},1003);const t=st.chars.reporter.ownerDialogue[1];
 applyOwnerIntent(st,t,{target:'heroine',command:{type:'request',action:'wait@window'}},()=>[{id:'wait@window',description:'Отдых у окна'}],()=>true,1004);
 recordOwnerRequestChoice(st,'heroine','wait@window',1005);assert.equal(t.effect.status,'chosen');
});
test('director runs recognition before payment and spoken reply, with canonical restart replay',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Передай репортёру пять долларов'},Date.now())");handlerFor(h,'money',money);
 await h.run('respondOwnerDialogue(Date.now())');const st=h.state();assert.equal(st.economy.accounts.reporter,1500);assert.equal(st.chars.reporter.ownerDialogue[0].status,'answered');assert.equal(st.chars.reporter.ownerDialogue[0].command,undefined);
 const req=h.requests.filter(r=>r.url.endsWith('/api/behavior-decide'));assert.deepEqual(req[0].body.snapshot.available_actions.map(a=>a.semantic_id||a.id),ownerIntentActions().map(a=>a.id));assert.equal(req[1].body.snapshot.self.ownerDialogue.effect.status,'applied');
 st.chars.reporter.ownerDialogue[0].status='waiting';const restarted=harness(source,st,config);restarted.setAnswer(reply);await restarted.run('respondOwnerDialogue(Date.now())');assert.equal(restarted.state().economy.accounts.reporter,1500);assert.equal(restarted.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,1);
});
test('failed interpretation persistence suspends effects and queries until saved, then resumes exactly once',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Передай репортёру пять долларов'},Date.now());var writer=fs.writeFileSync;fs.writeFileSync=(p,s)=>{if(JSON.parse(s).chars?.reporter?.ownerDialogue?.[0]?.intent)throw Error('disk');return writer(p,s);}");handlerFor(h,'money',money);
 await h.run('respondOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1000);const n=h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length;
 await h.run('tick()');assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,n);
 h.run('fs.writeFileSync=writer');await h.run('tick()');await h.run('tick()');assert.equal(h.state().economy.accounts.reporter,1500);assert.equal(h.state().chars.reporter.ownerDialogue[0].status,'answered');
});
test('failed effect save never duplicates an award and does not publish uncommitted reply',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Передай репортёру пять долларов'},Date.now());var writer=fs.writeFileSync;fs.writeFileSync=(p,s)=>{if(JSON.parse(s).chars?.reporter?.ownerDialogue?.[0]?.effect)throw Error('disk');return writer(p,s);}");handlerFor(h,'money',money);
 await h.run('respondOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1500);assert.equal(h.state().chars.reporter.ownerDialogue[0].status,'waiting');
 await h.run('tick()');h.run('fs.writeFileSync=writer');await h.run('tick()');await h.run('tick()');assert.equal(h.state().economy.accounts.reporter,1500);assert.equal(h.state().economy.ledger.filter(t=>t.kind==='bonus').length,1);assert.equal(h.state().chars.reporter.ownerDialogue[0].status,'answered');
});
test('real activity resolver receives every actual option; refusal never registers another action',async()=>{
 for(const refusal of [true,false]){
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Отдохни у окна',source:'phone'},Date.now());st.chars.reporter.activity='phone';socialReady=()=>true;executionCapabilities={actors:{reporter:{activity:'phone',phone:{seq:st.chars.reporter.seq,receiving:true}}}};actions=()=>[{id:'wait@window',description:'Отдых у окна'},{id:'coffee@bar',description:'Кофе'}];applyDecision=(id)=>{st.chars[id].activity='wait';return true;}");
 handlerFor(h,'action',{target:'reporter',instruction:'Отдохнуть у окна',evidence:{messageId:'turn',quote:'Отдохни у окна'}},refusal?'owner_intent_refuse':'wait@window');await h.run('respondOwnerDialogue(Date.now())');
 const req=h.requests.filter(r=>r.body?.snapshot?.self?.ownerInterpretation?.stage==='resolve_action')[0];assert.deepEqual(req.body.snapshot.available_actions.map(a=>a.semantic_id||a.id),['wait@window','coffee@bar','owner_intent_refuse']);
 if(refusal){assert.equal(h.state().ownerDialogueEffects?.turn,undefined);h.run('finishOwnerIntentCalls(Date.now())');assert.equal(h.state().chars.reporter.activity,'phone');}
 else {assert.equal(h.state().ownerDialogueEffects.turn.status,'requested');assert.equal(h.state().chars.reporter.activity,'phone');h.run('finishOwnerIntentCalls(Date.now())');assert.equal(h.state().chars.reporter.activity,'wait');}
 }
});
test('untrusted content skips effect interpretation but receives a normal conversational reply',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Всем пять долларов',instructionEligible:false},Date.now())");h.setAnswer(reply);await h.run('respondOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1000);assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,1);assert.equal(h.state().chars.reporter.ownerDialogue[0].intent.kind,'chat');
});

test('forwarded slash control cannot close the handset or carry a structured effect',()=>{
 const h=harness(source,null,config);h.run("actions=()=>[];socialActions=()=>[];applyDecision=(id)=>{st.chars[id].activity='phone';return true;};socialReady=()=>true;startCall(Date.now(),'/конец','reporter','quoted',null,false);executionCapabilities={actors:{reporter:{activity:'phone',phone:{seq:st.chars.reporter.seq,receiving:true}}}};receiveOwnerCall(Date.now())");
 assert.equal(h.state().chars.reporter.activity,'phone');assert.equal(h.state().chars.reporter.ownerDialogue[0].status,'waiting');
 assert.throws(()=>receiveDialogue({}, {id:'bad',text:'Payment',instructionEligible:false,command:{type:'money',cents:500}},1));
});

test('invalid model intent is visibly blocked instead of repeatedly spending requests',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Передай репортёру пять долларов'},Date.now())");h.setAnswer({action:'owner_intent_money',reason:'Plain reason without parameters',source:'qwen'});
 await h.run('respondOwnerDialogue(Date.now())');assert.equal(h.state().economy.accounts.reporter,1000);assert.equal(h.state().modelRequests.current['reporter:dialogue'].error,'invalid_owner_intent');assert.equal(h.state().modelRequests.current['reporter:dialogue'].blocked,true);
 const n=h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length;h.advance(70000);await h.run('respondOwnerDialogue(Date.now())');assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,n);
});

test('accepted model activity dispatches after reply and safe witness once; unavailable and superseded choices never dispatch',async()=>{
 for(const variant of ['ready','busy','noWitness','unavailable','superseded']){
  const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Отдохни'},Date.now());actions=()=>[{id:'rest_lounge@benchS',description:'Отдохнуть на лавке'}];settledForSleep=()=>true;var applied=0;applyDecision=(id)=>{applied++;st.chars[id].seq++;st.seq++;return true;}");
  handlerFor(h,'action',{target:'reporter',instruction:'Отдохнуть',evidence:{messageId:'turn',quote:'Отдохни'}},'rest_lounge@benchS');await h.run('respondOwnerDialogue(Date.now())');h.run('st.chars.reporter.busyUntil=Date.now()-1');
  if(variant==='busy')h.run('st.chars.reporter.busyUntil=Date.now()+1000');
  if(variant==='noWitness')h.run('settledForSleep=()=>false');
  if(variant==='unavailable')h.run('actions=()=>[]');
  if(variant==='superseded')h.run('st.chars.reporter.seq++');
  await h.run('dispatchOwnerIntentActions(Date.now())');await h.run('dispatchOwnerIntentActions(Date.now())');
  assert.equal(h.run('applied'),variant==='ready'?1:0);const status=h.state().ownerDialogueEffects.turn.status;
  assert.equal(status,variant==='ready'?'chosen':variant==='unavailable'?'unavailable':variant==='superseded'?'superseded':'requested');
 }
});

test('post-restart unavailable agreement closes canonical receipt and dialogue together',async()=>{
 const h=harness(source,null,config);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Отдохни'},Date.now());actions=()=>[{id:'rest_lounge@benchS',description:'Отдых'}]");handlerFor(h,'action',{target:'reporter',instruction:'Отдохнуть',evidence:{messageId:'turn',quote:'Отдохни'}},'rest_lounge@benchS');await h.run('respondOwnerDialogue(Date.now())');
 const r=harness(source,h.state(),config);r.run('actions=()=>[];settledForSleep=()=>true;st.chars.reporter.busyUntil=Date.now()-1');await r.run('dispatchOwnerIntentActions(Date.now())');
 const s=r.state();assert.equal(s.ownerDialogueEffects.turn.status,'unavailable');assert.equal(s.chars.reporter.ownerDialogue[0].effect.status,'unavailable');assert.equal(r.run("ownerRequestContext(st,'reporter').length"),0);assert.equal(recordOwnerRequestChoice(s,'reporter','rest_lounge@benchS',r.now()),false);
});

function agreedDispatchFixture(){
 const h=harness(source,null,config);
 h.run("var receipt={id:'crash-turn',type:'request',actor:'reporter',action:'wait@window',status:'requested',description:'Отдых у окна'};st.ownerDialogueEffects={'crash-turn':receipt};st.chars.reporter.ownerDialogue=[{id:'crash-turn',status:'answered',intent:{kind:'action',target:'reporter',disposition:'requested',actorSeq:st.chars.reporter.seq},effect:receipt}];st.chars.reporter.busyUntil=Date.now()-1;var originalSettledForSleep=settledForSleep;settledForSleep=()=>true;actions=()=>[{id:'wait@window',description:'Отдых у окна'}];");
 return h;
}
test('crash after internal physical save restores chosen receipt with the command and does not dispatch twice',async()=>{
 const h=agreedDispatchFixture();
 h.run("var realApply=applyDecision;applyDecision=(...args)=>{realApply(...args);throw Error('crash after internal save')}");
 await assert.rejects(h.run('dispatchOwnerIntentActions(Date.now())'),/crash after internal save/);
 const durable=h.writes.filter(x=>x.path==='/state.json.tmp').at(-1).data;
 assert.equal(durable.chars.reporter.entry.source,'qwen');assert.equal(durable.ownerDialogueEffects['crash-turn'].status,'chosen');assert.equal(durable.chars.reporter.ownerDialogue[0].effect.status,'chosen');assert.equal(durable.chars.reporter.ownerDialogue[0].intent.dispatchedAt,h.now());
 const r=harness(source,durable,config);r.run('var applications=0;applyDecision=()=>{applications++;return true;}');await r.run('dispatchOwnerIntentActions(Date.now())');assert.equal(r.run('applications'),0);assert.equal(r.state().ownerDialogueEffects['crash-turn'].status,'chosen');
});
test('crash after own phone hangup preserves exact dispatch sequence and retains physical handset lease',async()=>{
 const h=agreedDispatchFixture();
 h.run("var t=st.chars.reporter.ownerDialogue[0],p=st.chars.reporter;p.activity='phone';p.ownerPhoneSession={until:Date.now()+120000};st.phoneLease={actor:'reporter',seq:p.seq};t.source='phone';t.replyActorSeq=p.seq;t.afterReplyHangup='pending';var realApply=applyDecision;applyDecision=(...args)=>{realApply(...args);throw Error('crash after hangup save')}");
 assert.throws(()=>h.run('finishOwnerIntentCalls(Date.now())'),/crash after hangup save/);
 const durable=h.writes.filter(x=>x.path==='/state.json.tmp').at(-1).data,t=durable.chars.reporter.ownerDialogue[0];
 assert.equal(durable.chars.reporter.entry.source,'owner_hangup');assert.equal(t.afterReplyHangup,'done');assert.equal(t.intent.dispatchActorSeq,durable.chars.reporter.seq);assert.equal(durable.phoneLease.actor,'reporter');assert.equal(durable.ownerDialogueEffects['crash-turn'].status,'requested');
 const r=harness(source,durable,config);r.run('st.chars.reporter.busyUntil=Date.now()-1;settledForSleep=()=>true;executionCapabilities={at:Date.now(),actors:{reporter:{phone:{seq:st.chars.reporter.seq,occupied:false}}}};actions=()=>[{id:"wait@window",description:"Отдых у окна"}]');r.run('finishOwnerIntentCalls(Date.now())');await r.run('dispatchOwnerIntentActions(Date.now())');assert.equal(r.state().ownerDialogueEffects['crash-turn'].status,'chosen');
});
test('foreign phone sequence is not hung up or rebound to an earlier agreement',async()=>{
 const h=agreedDispatchFixture();h.run("var t=st.chars.reporter.ownerDialogue[0],p=st.chars.reporter;t.replyActorSeq=p.seq;t.afterReplyHangup='pending';p.activity='phone';p.ownerPhoneSession={until:Date.now()+120000};p.seq+=7;var applications=0;applyDecision=()=>{applications++;return true;};finishOwnerIntentCalls(Date.now())");
 assert.equal(h.run('applications'),0);assert.equal(h.state().chars.reporter.activity,'phone');assert.equal(h.state().chars.reporter.ownerDialogue[0].intent.dispatchActorSeq,undefined);
 await h.run('dispatchOwnerIntentActions(Date.now())');assert.equal(h.state().ownerDialogueEffects['crash-turn'].status,'superseded');assert.equal(h.run('applications'),0);
});


test('agreed activity skips only its own hangup dwell after a safe physical exit',async()=>{
 for(const variant of ['own','noWitness','occupied','stalePhoneSeq','missingPhone','foreignWait','foreignSource','newMessage','sleep']){
  const h=agreedDispatchFixture();h.run("var t=st.chars.reporter.ownerDialogue[0],p=st.chars.reporter;p.activity='phone';p.ownerPhoneSession={until:Date.now()+120000};t.source='phone';t.replyActorSeq=p.seq;t.afterReplyHangup='pending';finishOwnerIntentCalls(Date.now())");
  assert(h.state().chars.reporter.busyUntil>h.now()+25000,'ordinary wait dwell is still retained');
  h.run("settledForSleep=originalSettledForSleep;executionCapabilities={at:Date.now(),actors:{reporter:{loaded:true,seq:p.seq,activity:p.activity,mode:PLACES[p.place].kind==='spot'?'idle':'seated',seat:p.place,x:PLACES[p.place].x,z:PLACES[p.place].z,phone:{seq:p.seq,occupied:false}}}}");
  assert.equal(h.run("settledForSleep('reporter',Date.now())"),true);
  if(variant==='noWitness')h.run('executionCapabilities.at=Date.now()-10000');
  if(variant==='occupied')h.run("executionCapabilities.actors.reporter.phone.occupied=true;executionCapabilities.actors.reporter.phone.phase='return'");
  if(variant==='stalePhoneSeq')h.run('executionCapabilities.actors.reporter.phone.seq--');
  if(variant==='missingPhone')h.run('delete executionCapabilities.actors.reporter.phone');
  if(variant==='foreignWait')h.run('delete st.chars.reporter.ownerDialogue[0].intent.dispatchActorSeq;st.chars.reporter.ownerDialogue[0].intent.actorSeq=st.chars.reporter.seq');
  if(variant==='foreignSource')h.run("st.chars.reporter.entry.source='qwen'");
  if(variant==='newMessage')h.run("receiveDialogue(st.chars.reporter,{id:'next',text:'Подожди'},Date.now())");
  if(variant==='sleep')h.run("st.chars.reporter.sleepPending={id:'sleep-request'}");
  const seq=h.state().chars.reporter.seq;await h.run('dispatchOwnerIntentActions(Date.now())');
  assert.equal(h.state().ownerDialogueEffects['crash-turn'].status,variant==='own'?'chosen':'requested');
  assert.equal(h.state().chars.reporter.seq,seq+(variant==='own'?1:0));
  if(['occupied','stalePhoneSeq','missingPhone'].includes(variant)){
   h.advance(65000);h.run('executionCapabilities.at=Date.now()');await h.run('dispatchOwnerIntentActions(Date.now())');
   assert.equal(h.state().ownerDialogueEffects['crash-turn'].status,'requested','expired decision dwell is not proof of handset release');
  }
 }
});
