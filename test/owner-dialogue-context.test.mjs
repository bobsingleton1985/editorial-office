import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationContext,DIALOGUE_SOURCE_BYTES} from '../director/owner-dialogue-context.mjs';
import {dialogueContext} from '../director/owner-dialogue.mjs';
import {ownerIntentContext,parseOwnerIntent} from '../director/owner-intent.mjs';
import {harness} from './director-harness.mjs';
import {fitRelationshipRequest} from '../director/relationship-context.mjs';
const row=i=>({id:'turn_'+i,source:'phone',status:'answered',at:i,text:'Question '+i,reply:'Answer '+i,reaction:'Спокойствие: ответ'});
const snapshot=dialogue=>({scope:'behavior-two-v01',self:{id:'heroine',ownerDialogue:dialogue,relationships:{},memory:[]},available_actions:[{id:'owner_reply',description:'Reply'}]});
test('original topic and all preceding turns of the reported four-step exchange survive byte pressure',()=>{
 const texts=['Если бы репортер пригласил тебя на свидание, ты бы пошла?','и все же. прости. но это важно','все о чем я спрашиваю влияет на работу','то есть вы мне отказываете?'];
 const p={ownerDialogue:texts.map((text,i)=>({...row(i),text,status:i===3?'waiting':'answered'}))};
 const saved=structuredClone(p),d=dialogueContext(p,p.ownerDialogue[3]);
 const s=snapshot(d);s.self.memory=Array.from({length:100},(_,i)=>({event:'old_fact',i,text:'x'.repeat(500)}));
 const fitted=fitRelationshipRequest(s,JSON.stringify(snapshot(d)).length+1200);
 assert.deepEqual(fitted.self.ownerDialogue.history.map(r=>r.owner),texts.slice(0,3));
 assert.equal(fitted.self.ownerDialogue.continuity.firstMessage.text,texts[0]);
 assert.equal(Object.keys(fitted.self.ownerDialogue).at(-1),'message');assert.ok(fitted.self.memory.length<100);assert.deepEqual(p,saved);
});
test('10000 prior turns keep six chronological exchanges and bounded literal earlier sources',()=>{
 const p={ownerDialogue:Array.from({length:10000},(_,i)=>row(i))},t={...row(10000),status:'waiting'};p.ownerDialogue.push(t);
 const d=conversationContext(p,t);
 assert.deepEqual(d.history.map(r=>r.id),Array.from({length:6},(_,i)=>'turn_'+(9994+i)));
 assert.equal(d.continuity.firstMessage.id,'turn_0');assert.equal(d.continuity.earlierExchanges.length,4);
 assert.ok(Buffer.byteLength(JSON.stringify(d))<=DIALOGUE_SOURCE_BYTES);assert.equal(p.ownerDialogue.length,10001);
});
test('hangup and separate sources do not leak the prior call into a new conversation',()=>{
 const p={ownerDialogue:[row(0),{id:'end',source:'phone',status:'closed',control:{type:'owner_hangup'}},{...row(1),source:'site'},row(2),{...row(3),status:'waiting'}]};
 const d=conversationContext(p,p.ownerDialogue.at(-1));assert.equal(d.continuity.firstMessage.id,'turn_2');assert.deepEqual(d.history.map(r=>r.id),['turn_2']);
});
test('recognition and spoken reply receive the same bounded conversation and eligibility',()=>{
 const p={ownerDialogue:[{...row(0),effect:{type:'money',status:'applied',cents:500}},row(1),{...row(2),status:'waiting'}]},t=p.ownerDialogue.at(-1);
 const spoken=dialogueContext(p,t),intent=ownerIntentContext(p,t,[{id:'heroine'}],3,'heroine');
 assert.deepEqual(intent.history,spoken.history);assert.deepEqual(intent.continuity,spoken.continuity);
 assert.equal(intent.history[0].instructionEligible,false);assert.equal(Object.keys(intent).at(-1),'message');
});
test('mandatory conversation is never reduced to one turn even if the intermediate core does not fit',()=>{
 const p={ownerDialogue:[row(0),row(1),{...row(2),status:'waiting'}]},s=snapshot(dialogueContext(p,p.ownerDialogue.at(-1)));
 assert.throws(()=>fitRelationshipRequest(s,1),/relationship_request_core_exceeds_budget/);
 assert.equal(s.self.ownerDialogue.history.length,2);
});

test('natural hangup and an executed phone exit start a fresh conversation',()=>{
 for(const boundary of [{afterReplyHangup:'done'},{conversationClosedAt:10}]){
  const p={ownerDialogue:[{...row(0),...boundary},{...row(1),status:'waiting'}]};
  const d=conversationContext(p,p.ownerDialogue[1]);assert.equal(d.continuity.firstMessage.id,'turn_1');assert.deepEqual(d.history,[]);
 }
});

test('eligible initial and older source evidence works, forwarded or already effected sources cannot authorize money',()=>{
 for(const initial of [true,false])for(const blocked of [false,'forwarded','effect']){
  const rows=Array.from({length:12},(_,i)=>row(i)),i=initial?0:4;
  rows[i].text='Передаю героине пять долларов';
  if(blocked==='forwarded')rows[i].instructionEligible=false;
  if(blocked==='effect')rows[i].effect={type:'money',status:'applied'};
  const t={...row(12),status:'waiting',text:'Да, ту премию'};const p={ownerDialogue:[...rows,t]};
  const c=ownerIntentContext(p,t,[{id:'heroine'}],13,'heroine');
  const d={source:'qwen',action:'owner_intent_money',reason:JSON.stringify({explanation:'Подтверждение',target:'heroine',cents:500,evidence:{messageId:rows[i].id,quote:rows[i].text}})};
  if(blocked)assert.throws(()=>parseOwnerIntent(d,c),/invalid_owner_intent/);
  else assert.equal(parseOwnerIntent(d,c).command.cents,500);
 }
});
test('production physical phone exit persists the conversation boundary without resetting dialogue',()=>{
 const h=harness(new URL('../director/director.mjs',import.meta.url).pathname);
 h.run("st.chars.reporter.activity='phone';st.chars.reporter.ownerPhoneSession={until:Date.now()+1000};receiveDialogue(st.chars.reporter,{id:'before_exit',text:'Привет',source:'phone'},Date.now());applyDecision('reporter','wait@deskB','owner_hangup')");
 const t=h.state().chars.reporter.ownerDialogue[0];assert.equal(t.conversationClosedAt,h.now());
 assert(h.writes.some(w=>JSON.parse(JSON.stringify(w.data)).chars?.reporter?.ownerDialogue?.[0]?.conversationClosedAt===h.now()));
});
