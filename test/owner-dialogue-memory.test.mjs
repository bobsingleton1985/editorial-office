import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {conversationContext} from '../director/owner-dialogue-context.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const answered=(id,text,reply,at,extra={})=>({id,text,reply,reaction:'спокойно',source:'phone',confidential:true,at,status:'answered',...extra});
test('a new phone conversation remembers what was said before the line closed',()=>{
 const p={ownerDialogue:[
  answered('a1','Меня зовут Андрей.','Приятно познакомиться, Андрей.',1),
  answered('a2','Завтра принесу вино.','Буду ждать.',2,{conversationClosedAt:3}),
  {id:'b1',text:'Как меня зовут?',source:'phone',confidential:true,at:10,status:'waiting'}]};
 const c=conversationContext(p,p.ownerDialogue[2]);
 assert.deepEqual(c.history,[]);
 assert.deepEqual(c.continuity.previousConversations.exchanges.map(e=>e.owner),['Меня зовут Андрей.','Завтра принесу вино.']);
 assert.ok(c.continuity.previousConversations.exchanges.every(e=>e.instructionEligible===false));
});
test('earlier conversations stay bounded, private and per scene',()=>{
 const turns=[];
 for(let i=0;i<10;i++)turns.push(answered('old'+i,'Реплика '+i+' '+'x'.repeat(900),'Ответ '+i,i));
 turns.at(-1).conversationClosedAt=20;
 turns.push(answered('site','Открытая реплика','Ответ',21,{source:'site',confidential:false}));
 turns.push(answered('other','Другая сцена','Ответ',22,{scene:'garden'}));
 turns.push(answered('forgot','Забытое','Ответ',23,{memoryForgotten:true}));
 turns.push({id:'now',text:'Продолжим',source:'phone',confidential:true,at:30,status:'waiting'});
 const previous=conversationContext({ownerDialogue:turns},turns.at(-1)).continuity.previousConversations.exchanges;
 assert.ok(previous.length>0&&previous.length<=6);
 assert.equal(previous.at(-1).id,'old9');
 assert.ok(new TextEncoder().encode(JSON.stringify(previous)).length<=6000);
 assert.ok(previous.every(e=>e.id.startsWith('old')));
});
test('decision rows no longer push finished conversations out of memory',async()=>{
 const h=harness(source);h.run('reflectRelationships=async()=>false');
 h.run("st.chars.columnist.memory.push({event:'conversation_finished',conversationId:'conversation-1',partner:'reporter',endedAt:Date.now()})");
 for(let i=0;i<15;i++)h.run(`applyDecision('columnist','wait@window','qwen')`);
 const p=h.state().chars.columnist;
 assert.ok(p.memory.some(m=>m.event==='conversation_finished'));
 assert.equal(p.decisionLog.length,12);
 const restored=harness(source,{...h.state(),chars:{...h.state().chars,columnist:{...p,memory:[...p.memory,{action:'wait@window',at:'10:00',fatigue_before:1,source:'qwen'}],decisionLog:[]}}});
 const q=restored.state().chars.columnist;
 assert.equal(q.memory.some(m=>Object.hasOwn(m,'fatigue_before')),false);
 assert.equal(q.decisionLog.at(-1).at,'10:00');
});
