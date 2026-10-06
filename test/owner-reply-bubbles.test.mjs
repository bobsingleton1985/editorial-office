import test from 'node:test';
import assert from 'node:assert/strict';
import {recentOwnerReply,replyDurationMs,replyForBubble,createOwnerReplyBubbles} from '../src/owner-reply-bubbles.js';
const reply={id:'phone',source:'phone',status:'answered',reply:'Сейчас отдохну.',reaction:'Облегчение',answeredAt:10000};
const person=turns=>({activity:'phone',at:9000,ownerDialogue:turns});
test('active calls show actual recent phone words, not pending turns or web dialogue',()=>{
 const p=person([{...reply,id:'web',source:'web',answeredAt:11000},reply,{...reply,id:'pending',status:'waiting',answeredAt:12000}]);
 assert.equal(recentOwnerReply(p,12000).id,'phone');assert.equal(recentOwnerReply(p,56000),null);assert.equal(recentOwnerReply(p,1000),null);
 assert.equal(recentOwnerReply(person([{...reply,answeredAt:undefined}]),12000),null);
});
test('long replies remain readable during the call within the existing bounded lifetime',()=>{
 const long={...reply,reply:'а'.repeat(700),reaction:'б'.repeat(240)};
 assert.equal(replyDurationMs(reply),45000);assert.equal(replyDurationMs(long),84600);
 assert.equal(recentOwnerReply(person([long]),90000).id,'phone');assert.equal(recentOwnerReply(person([long]),96000),null);
});
test('the active-reply selector recognizes a finished call',()=>{
 for(const activity of ['wait','work','conversation',undefined])assert.equal(recentOwnerReply({...person([reply]),activity},10001),null);
 for(const status of ['closing','closed','cancelled'])assert.equal(recentOwnerReply(person([reply,{id:'hangup',source:'phone',status,at:10001}]),10002),null);
});
test('the next phone call cannot revive a previous answer, but its new reply is visible',()=>{
 const p={...person([reply]),at:11000};assert.equal(recentOwnerReply(p,12000),null);
 const fresh={...reply,id:'new',answeredAt:12000};p.ownerDialogue.push(fresh);assert.equal(recentOwnerReply(p,12001).id,'new');
});
test('the last answer remains for exactly five seconds, and updates do not extend the deadline',()=>{
 const state={reply:null,endedAt:null};assert.equal(replyForBubble(person([reply]),11000,state),reply);
 const ended={...person([reply]),activity:'wait',at:12000};
 assert.equal(replyForBubble(ended,12000,state),reply);
 assert.equal(replyForBubble({...ended,activity:'work',at:16000},16999,state),reply);
 assert.equal(replyForBubble(ended,17000,state),null);assert.equal(replyForBubble(ended,18000,state),null);
});
test('explicit hangup gets the same grace, while an expired or never-seen answer cannot reappear',()=>{
 const ended=person([reply,{id:'hangup',source:'phone',status:'closed',at:12000}]),state={};
 assert.equal(replyForBubble(ended,12000,state),null);
 replyForBubble(person([reply]),11000,state);assert.equal(replyForBubble(ended,12000,state),reply);
 assert.equal(replyForBubble(ended,17000,state),null);
 const expired={};replyForBubble(person([reply]),11000,expired);assert.equal(replyForBubble(person([reply]),56000,expired),null);
 assert.equal(replyForBubble({...ended,activity:'wait'},57000,expired),null);
});
test('a missed expiry update cannot resurrect an old answer, while an existing grace still gets all five seconds',()=>{
 const state={};replyForBubble(person([reply]),11000,state);
 assert.equal(replyForBubble({...person([reply]),activity:'wait'},56000,state),null);
 const grace={};replyForBubble(person([reply]),54000,grace);
 const ended={...person([reply]),activity:'wait'};
 assert.equal(replyForBubble(ended,54999,grace),reply);
 assert.equal(replyForBubble(ended,59998,grace),reply);
 assert.equal(replyForBubble(ended,59999,grace),null);
});
test('a new call clears the old grace and only its new reply may be shown',()=>{
 const state={};replyForBubble(person([reply]),11000,state);
 replyForBubble({...person([reply]),activity:'wait'},12000,state);
 assert.equal(replyForBubble({...person([reply]),at:13000},13001,state),null);
 const fresh={...reply,id:'new',answeredAt:14000};assert.equal(replyForBubble({...person([reply,fresh]),at:13000},14001,state),fresh);
});
test('the delivered overlay hides five seconds after the ending world update',async()=>{
 const saved=Object.fromEntries(['document','window','innerWidth','innerHeight'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const boxes=[];
 class Element{constructor(tag){this.tag=tag;this.style={setProperty(){}};this.dataset={};this.offsetWidth=200;this.offsetHeight=80;}append(...children){if(this.tag==='body')boxes.push(...children);}setAttribute(){}remove(){}}
 class Vector3{constructor(){this.x=0;this.y=0;this.z=0;}project(){return this;}}
 let overlay,clock=11000;
 try{
  globalThis.document={createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body')};
  globalThis.window={__SERVER_SIMULATION:true,__THREE:{Vector3}};globalThis.innerWidth=1000;globalThis.innerHeight=800;
  const ed={holder:{updateMatrixWorld(){}},root:{getObjectByName:()=>({getWorldPosition:v=>v})}};
  // The delivered module exports the same implementation and does not start in server mode.
  const delivered=await import('../owner-reply-bubbles.js');
  overlay=delivered.createOwnerReplyBubbles({now:()=>clock,people:()=>({columnist:{ed}}),camera:()=>({})});
  overlay.update({chars:{columnist:person([reply])}});const box=boxes.find(e=>e.className==='owner-phone-reply');assert.equal(box.hidden,false);
  overlay.update({chars:{columnist:{...person([reply]),activity:'wait'}}});assert.equal(box.hidden,false);
  clock=15999;overlay.update({chars:{columnist:{...person([reply]),activity:'work',at:15900}}});assert.equal(box.hidden,false);
  clock=16000;overlay.update({chars:{columnist:{...person([reply]),activity:'work',at:15950}}});assert.equal(box.hidden,true);
  overlay.update({chars:{columnist:{...person([reply]),at:16000}}});assert.equal(box.hidden,true);
 }finally{overlay?.destroy();for(const [k,d]of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
