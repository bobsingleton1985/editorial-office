import test from 'node:test';
import assert from 'node:assert/strict';
import {recentOwnerReply,replyDurationMs} from '../src/owner-reply-bubbles.js';
const reply={id:'phone',source:'phone',status:'answered',reply:'Сейчас отдохну.',reaction:'Облегчение',answeredAt:10000};
test('bubbles show actual recent phone words, not pending turns or older web dialogue',()=>{
 const p={ownerDialogue:[{...reply,id:'web',source:'web',answeredAt:11000},reply,{...reply,id:'pending',status:'waiting',answeredAt:12000}]};
 assert.equal(recentOwnerReply(p,12000).id,'phone');assert.equal(recentOwnerReply(p,56000),null);assert.equal(recentOwnerReply(p,1000),null);
 assert.equal(recentOwnerReply({ownerDialogue:[{...reply,answeredAt:undefined}]},12000),null);
});
test('long replies remain readable with a bounded lifetime rather than permanent stale bubbles',()=>{
 const long={...reply,reply:'а'.repeat(700),reaction:'б'.repeat(240)};
 assert.equal(replyDurationMs(reply),45000);assert.equal(replyDurationMs(long),84600);
 assert.equal(recentOwnerReply({ownerDialogue:[long]},90000).id,'phone');assert.equal(recentOwnerReply({ownerDialogue:[long]},96000),null);
});
