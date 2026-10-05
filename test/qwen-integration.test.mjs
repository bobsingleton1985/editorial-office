import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {finalContextGuardReady} from '../director/relationship-context.mjs';
import {requestStarted,requestFailed,requestAllowed,retryModelRequest,recoverInterruptedRequests} from '../director/model-requests.mjs';
import {requestStatusText} from '../src/model-status.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
test('local and provider Qwen context failures stay blocked until explicit retry',()=>{
 for(const error of ['qwen_context_estimate_limit','qwen_context_provider_limit']){
  const st={};requestStarted(st,'reporter','action','fixture-id',100);
  const failure=requestFailed(st,'reporter','action','fixture-id',new Error(error),200);
  assert.equal(failure.error,error);assert.equal(failure.blocked,true);assert.equal(failure.retryAt,null);
  assert.equal(requestAllowed(st,'reporter','action',1000000),false);
  assert.match(requestStatusText(failure),/Автоповтор остановлен/);
  assert.doesNotMatch(requestStatusText(failure),/Не удалось получить ответ модели/);
  assert.equal(retryModelRequest(st,'reporter','action','stale-id',300),false);
  assert.equal(requestAllowed(st,'reporter','action',1000000),false);
  assert.equal(retryModelRequest(st,'reporter','action','fixture-id',300),true);
  assert.equal(requestAllowed(st,'reporter','action',300),true);
  requestStarted(st,'reporter','action','new-id',400);
  assert.equal(recoverInterruptedRequests(st,500),true);
  assert.equal(requestAllowed(st,'reporter','action',1000000),false);
 }
});
test('Qwen physical choice reaches actual director command with distinct provenance',async()=>{
 const h=harness(source);h.run('reflectRelationships=async()=>false;st.chars.columnist.busyUntil=Date.now()');
 h.setAnswer({action:'wait@window',reason:'fixture',source:'qwen',model:'qwen/qwen3.8-27b:free'});
 await h.run('tick()');const p=h.state().chars.columnist;
 assert.equal(p.place,'window');assert.equal(p.entry.source,'qwen');assert.equal(p.memory.at(-1).source,'qwen');assert.equal(p.entry.confidence,null);
});
test('Qwen invitation refusal keeps independent reply provenance',async()=>{
 const h=harness(source);h.run("st.chars.heroine.activity='invite';st.invite={n:1,from:'heroine',to:'reporter',kind:'music'};askJev=async()=>({action:'decline:invitation-1',source:'qwen'});canTurnKnob=()=>true;");
 await h.run('answerMusicInvite(Date.now())');assert.equal(h.state().chars.reporter.memory.at(-1).source,'qwen');
});
test('Qwen has independent financial choice rights; fallback rule has none',()=>{
 const config={enabled:true,currency:'USD',startingCents:1000,workRewardCents:0,prices:{},offerAmounts:[100],loanDays:3};
 const h=harness(source,null,config);h.run("var pair={phase:'active',members:['reporter','columnist'],seconds:1,lastReport:Date.now()};var option=moneyActions(st,'reporter',pair,Date.now()).find(a=>a.id.startsWith('money_offer@gift')); ");
 assert(h.run('!!option'));assert.equal(h.run("chooseMoney(st,'reporter',option.id,pair,Date.now(),'rule')"),false);
 assert.equal(h.run("chooseMoney(st,'reporter',option.id,pair,Date.now(),'qwen')"),true);assert.equal(h.state().economy.offers.length,1);
});
test('intermediate context admission trusts only exact Qwen guard profile',()=>{
 const g={version:'newsroom-qwen-chat-v1',ready:true,enforced:true,mode:'estimated',strict:false,exact_token_count:false,measurement:'local_lexical_estimate_v1',safety_reserve_percent:20,admission_context_limit:25600,admission_request_limit:51200,state_and_longest_question_limit:32000,request_limit:64000,target:20000,counter_available:true};
 assert.equal(finalContextGuardReady({model:'qwen/qwen3.8-27b:free',jev_context_guard:g}),true);
 assert.equal(finalContextGuardReady({model:'qwen/other',jev_context_guard:g}),false);
 assert.equal(finalContextGuardReady({model:'qwen/qwen3.8-27b:free',jev_context_guard:{...g,enforced:false}}),false);
});

test('provider 429 pauses requests for every actor and preserves visible reason',()=>{
 const st={};requestStarted(st,'heroine','physical','fixture-429',100);
 const error=requestFailed(st,'heroine','physical','fixture-429',new Error('openrouter_http_429'),200);
 assert.equal(error.error,'openrouter_http_429');assert.equal(error.retryAt,60200);
 assert.match(requestStatusText(error,200),/ограничил частоту/);
 assert.equal(requestAllowed(st,'heroine','physical',6000),false);
 assert.equal(requestAllowed(st,'reporter','reflection',6000),false);
 assert.equal(retryModelRequest(st,'heroine','physical','fixture-429',6000),true);
 assert.equal(requestAllowed(st,'heroine','physical',6000),false);
 assert.equal(requestAllowed(st,'reporter','reflection',6000),false);
 assert.equal(requestAllowed(st,'heroine','physical',60200),true);
 assert.equal(requestAllowed(st,'reporter','reflection',60200),true);
});
