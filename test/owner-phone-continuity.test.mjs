import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {phonePlan,wrapUp,sample} from '../src/gestures.js';
import {maintainPhone,parseDeclaredEmotion,PHONE_EMOTION_CLIPS,phoneBone,samplePhoneEmotion} from '../owner-phone-performance.mjs';
import {HER_SOCIAL_CATALOG} from '../director/heroine-social-catalog.mjs';
import fs from 'node:fs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
function ready(h){h.run("executionCapabilities={at:Date.now(),actors:{reporter:{loaded:true,seq:st.chars.reporter.seq,activity:'phone',phone:{seq:st.chars.reporter.seq,ready:true,occupied:true,phase:'talk',receiving:true}}}};");}
function received(){const h=harness(source);h.run("startCall(Date.now(),'Привет','reporter','first');");ready(h);h.run("receiveOwnerCall(Date.now());st.chars.reporter.ownerDialogue[0].status='answered'");return h;}
test('new turns after a long unseen pause keep handset seq and earlier conversation',()=>{
 const h=received(),seq=h.state().chars.reporter.seq;h.advance(3600000);ready(h);
 for(let i=0;i<3;i++){assert.equal(h.run(`startCall(Date.now(),'Фраза ${i}','reporter','next${i}')`),true);h.run('receiveOwnerCall(Date.now())');}
 const p=h.state().chars.reporter;assert.equal(p.seq,seq);assert.equal(p.activity,'phone');assert.equal(p.ownerDialogue.length,4);assert.equal(p.ownerDialogue[0].status,'answered');
});
test('new text advances failed interpretation, same id cannot; successful effects remain for idempotent retry',()=>{
 const h=received();h.run("st.chars.reporter.ownerDialogue[0].status='waiting';requestFailed(st,'reporter','dialogue','bad',new Error('invalid_owner_intent'),Date.now())");
 assert.equal(h.run("advanceFailedOwnerDialogue(st,'reporter','ph_first',Date.now())"),false);
 assert.equal(h.run("advanceFailedOwnerDialogue(st,'reporter','ph_new',Date.now())"),true);
 assert.equal(h.state().chars.reporter.ownerDialogue[0].status,'failed');assert.equal(h.state().chars.reporter.ownerDialogue[0].failure,'invalid_owner_intent');assert.equal(h.run("requestAllowed(st,'reporter','dialogue',Date.now())"),true);
 const x=received();x.run("st.chars.reporter.ownerDialogue[0].status='waiting';st.chars.reporter.ownerDialogue[0].effect={status:'applied',cents:300};requestFailed(st,'reporter','dialogue','bad',new Error('invalid_owner_intent'),Date.now());advanceFailedOwnerDialogue(st,'reporter','ph_new',Date.now())");assert.equal(x.state().chars.reporter.ownerDialogue[0].status,'waiting');assert.equal(x.state().chars.reporter.ownerDialogue[0].effect.cents,300);assert.equal(x.state().modelRequests.current['reporter:dialogue'].status,'retry_requested');
});
test('phone plan continues for hours with bounded segments; explicit wrap still returns handset',()=>{
 for(const kind of ['desk','stand']){const duration=n=>n==='chair_to_tbl'?1.73:5,ch={activity:'phone',clk:0,g:phonePlan(kind,0,duration)};
  for(let t=0;t<7200;t+=.5){ch.clk=t;maintainPhone(ch,duration);const stop=ch.g.segs.find(s=>/phone_stop$/.test(s.n));assert(t<stop.s);if(t>5)assert(Object.keys(sample(ch.g,t).w).some(n=>/phone_0[123]$/.test(n)));assert(ch.g.segs.length<270);}
  ch.activity='wait';const before=ch.g.T;assert.equal(maintainPhone(ch,duration),false);ch.g={...wrapUp(ch.g,ch.clk),wrapped:true};assert(ch.g.T<before);assert(ch.g.segs.some(s=>/phone_stop$/.test(s.n)));}
});
test('emotion labels come from model declaration; selected assets exist and are approved for their actor',()=>{
 assert.equal(parseDeclaredEmotion('Раздражение: не нравится тон'),'irritation');assert.equal(parseDeclaredEmotion('Владелец просит флирт'),'neutral');assert.equal(phoneBone('hand_l'),false);assert.equal(phoneBone('pelvis'),false);assert.equal(phoneBone('spine_02'),false);assert.equal(phoneBone('head'),true);assert.equal(phoneBone('upperarm_r'),true);
 const motus=JSON.parse(fs.readFileSync(new URL('../src/social-catalog.json',import.meta.url)));for(const [kind,map]of Object.entries(PHONE_EMOTION_CLIPS))for(const id of Object.values(map))assert((kind==='heroine'?HER_SOCIAL_CATALOG:motus).entries.some(e=>e.id===id&&e.available),id);
});
test('phone emotion only modifies allowed quaternion tracks, and respects answer seq/time and hangup',()=>{
 const q=()=>({value:0,clone(){return q();},fromArray(a){this.value=a[0];return this;},normalize(){return this;},slerp(other,w){this.value=other.value*w;}});
 const bones={head:{quaternion:q()},hand_l:{quaternion:q()},pelvis:{quaternion:q()},upperarm_r:{quaternion:q()}},track=name=>({name:name+'.quaternion',createInterpolant:()=>({evaluate:()=>[1,0,0,0]})});
 const args={id:'reporter',bones,gestures:{social_mixamo_gap_mxg_annoyed_shake:{clip:{duration:4,tracks:Object.keys(bones).map(track)}}},ch:{activity:'phone',clk:10,g:{phone:true,t0:0,segs:[{n:'phone_start',s:0,d:5}]}},command:{seq:5},turn:{id:'turn',replyActorSeq:5,status:'answered',reaction:'Раздражение: хватит',reply:'Оставьте меня в покое.',answeredAt:10000},now:11000};
 assert.equal(samplePhoneEmotion(args).tracks,2);assert.equal(bones.hand_l.quaternion.value,0);assert.equal(bones.pelvis.quaternion.value,0);assert(bones.head.quaternion.value>0);args.command.seq=6;assert.equal(samplePhoneEmotion(args),null);args.command.seq=5;args.ch.g.wrapped=true;assert.equal(samplePhoneEmotion(args),null);
});

test('large clock jump continues talking without a fresh pickup or finite tail',()=>{
 const ch={activity:'phone',clk:86400,g:phonePlan('stand',0,()=>5)};assert.equal(maintainPhone(ch,()=>5),true);assert(ch.g.T>ch.clk+60);assert(ch.g.segs.length<30);assert(Object.keys(sample(ch.g,ch.clk).w).some(n=>/phone_0[123]$/.test(n)));
});
test('duplicate answered delivery cannot advance unrelated failed waiting turn',()=>{
 const h=received();h.run("receiveDialogue(st.chars.reporter,{id:'ph_failed',text:'Новая фраза',source:'phone'},Date.now());requestFailed(st,'reporter','dialogue','bad',new Error('invalid_owner_intent'),Date.now());startCall(Date.now(),'Привет','reporter','first');receiveOwnerCall(Date.now())");assert.equal(h.state().chars.reporter.ownerDialogue[1].status,'waiting');assert.equal(h.state().modelRequests.current['reporter:dialogue'].blocked,true);
});
