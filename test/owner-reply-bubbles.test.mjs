import test from 'node:test';
import assert from 'node:assert/strict';
import {recentOwnerReply,replyDurationMs,createOwnerReplyBubbles} from '../src/owner-reply-bubbles.js';
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
test('ending a call clears even a just-answered or long reply',()=>{
 for(const activity of ['wait','work','conversation',undefined])assert.equal(recentOwnerReply({...person([reply]),activity},10001),null);
 for(const status of ['closing','closed','cancelled'])assert.equal(recentOwnerReply(person([reply,{id:'hangup',source:'phone',status,at:10001}]),10002),null);
});
test('the next phone call cannot revive a previous answer, but its new reply is visible',()=>{
 const p={...person([reply]),at:11000};assert.equal(recentOwnerReply(p,12000),null);
 const fresh={...reply,id:'new',answeredAt:12000};p.ownerDialogue.push(fresh);assert.equal(recentOwnerReply(p,12001).id,'new');
});
test('the visible overlay hides immediately on the ending world update',async()=>{
 const saved=Object.fromEntries(['document','window','innerWidth','innerHeight'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const boxes=[];
 class Element{constructor(tag){this.tag=tag;this.style={setProperty(){}};this.dataset={};this.offsetWidth=200;this.offsetHeight=80;}append(...children){if(this.tag==='body')boxes.push(...children);}setAttribute(){}remove(){}}
 class Vector3{constructor(){this.x=0;this.y=0;this.z=0;}project(){return this;}}
 let overlay;
 try{
  globalThis.document={createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body')};
  globalThis.window={__SERVER_SIMULATION:true,__THREE:{Vector3}};globalThis.innerWidth=1000;globalThis.innerHeight=800;
  const ed={holder:{updateMatrixWorld(){}},root:{getObjectByName:()=>({getWorldPosition:v=>v})}};
  // The delivered module exports the same implementation and does not start in server mode.
  const delivered=await import('../owner-reply-bubbles.js');
  overlay=delivered.createOwnerReplyBubbles({now:()=>11000,people:()=>({columnist:{ed}}),camera:()=>({})});
  overlay.update({chars:{columnist:person([reply])}});const box=boxes.find(e=>e.className==='owner-phone-reply');assert.equal(box.hidden,false);
  overlay.update({chars:{columnist:{...person([reply]),activity:'wait'}}});assert.equal(box.hidden,true);
  overlay.update({chars:{columnist:{...person([reply]),at:12000}}});assert.equal(box.hidden,true);
 }finally{overlay?.destroy();for(const [k,d]of Object.entries(saved)){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});
