import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {harness} from './director-harness.mjs';
import {receiveDialogue,dialogueContext,answerDialogue} from '../director/owner-dialogue.mjs';
import {OwnerDialogueInbox} from '../relay/owner-dialogue-inbox.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
test('site dialogue persists receipt before ack and answers through production request without physical change',async()=>{
 const h=harness(source),before=h.state().chars.reporter.entry;
 let delivered=false;h.setHandler((url)=>{if(url.endsWith('/director/dialogue'))return {items:delivered?[]:[{id:'dialogue_fixture',person:'reporter',text:'Кто я для тебя?',source:'site',at:h.now()}]};if(url.endsWith('/director/dialogue/ack')){assert.equal(h.writes.at(-1).data.chars.reporter.ownerDialogue[0].text,'Кто я для тебя?');delivered=true;return {ok:true};}});
 h.setAnswer({action:'owner_reply',reason:'Ответ владельцу',reply:'Вы владелец газеты, в которой я работаю.',reaction:'Рад вашему вниманию.',source:'qwen',model:'qwen/qwen3.7-flash'});
 await h.run('tick()');const p=h.state().chars.reporter,t=p.ownerDialogue[0];assert.equal(t.status,'answered');assert.equal(t.reply,'Вы владелец газеты, в которой я работаю.');assert.deepEqual(p.entry,before);
 const req=h.requests.find(r=>r.url.endsWith('/api/behavior-decide'));assert.equal(req.body.snapshot.self.ownerDialogue.owner.role,'владелец газеты');assert.equal(req.body.snapshot.self.ownerDialogue.message.text,'Кто я для тебя?');assert.equal(t.requestId,req.body.snapshot.requestId);
 h.advance(100);await h.run('tick()');assert.equal(h.state().chars.reporter.ownerDialogue.length,1);
});
test('second turn carries actual preceding reply; recipients and failures remain separate',async()=>{
 const h=harness(source);h.run("receiveDialogue(st.chars.reporter,{id:'one',text:'Я Александр.',source:'site'},Date.now())");
 h.setAnswer({action:'owner_reply',reply:'Здравствуйте, Александр.',reaction:'Рад знакомству.',source:'qwen',model:'qwen/qwen3.7-flash'});await h.run('respondOwnerDialogue(Date.now())');
 h.run("receiveDialogue(st.chars.reporter,{id:'two',text:'Как меня зовут?',source:'site'},Date.now())");h.setAnswer(new Error('openrouter_http_429'));await h.run('respondOwnerDialogue(Date.now())');
 assert.equal(h.state().chars.reporter.ownerDialogue[1].status,'waiting');assert.equal(h.state().chars.columnist.ownerDialogue,undefined);
 const req=h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).at(-1);assert.equal(req.body.snapshot.self.ownerDialogue.history[0].reply,'Здравствуйте, Александр.');assert.equal(h.state().modelRequests.current['reporter:dialogue'].status,'error');
});
test('all phone recipients wait for matching physical handset receipt, and archive retries do not duplicate replies',()=>{
 const h=harness(source);h.queueCall('phone-test.json',{target:'reporter',text:'Позвоните мне после работы.'});h.run("applyDecision=(id)=>{const p=st.chars[id];p.activity='phone';p.seq++;return true;};ownerCalls(Date.now())");
 assert.equal(h.state().chars.reporter.ownerDialogue,undefined);assert.equal(h.archived.length,0);
 h.run("executionCapabilities={at:Date.now(),actors:{reporter:{loaded:true,seq:st.chars.reporter.seq,activity:'phone',phone:{seq:st.chars.reporter.seq,receiving:true}}}};socialReady=()=>true");h.failArchive(true);h.run('receiveOwnerCall(Date.now())');assert.equal(h.state().chars.reporter.ownerDialogue.length,1);
 h.failArchive(false);h.run('receiveOwnerCall(Date.now())');assert.equal(h.state().chars.reporter.ownerDialogue.length,1);assert.equal(h.archived.length,1);
});
test('durable inbox validates addresses, restart delivery and id conflicts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dialogue-'));try{const file=path.join(dir,'inbox.json'),q=new OwnerDialogueInbox(file),b={id:'request-fixture',person:'reporter',text:'Тест'};q.enqueue(b,1);assert.equal(new OwnerDialogueInbox(file).pending().length,1);assert.equal(q.enqueue(b,2).replayed,true);assert.throws(()=>q.enqueue({...b,text:'Другой'},3),/conflict/);assert.throws(()=>q.enqueue({...b,id:'bad',person:'missing'},3),/invalid/);q.ack(b.id);const r=new OwnerDialogueInbox(file);assert.equal(r.pending().length,0);assert.equal(r.enqueue(b,4).status,'received');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('dialogue rejects fabricated/invalid responses and uses a context projection without deleting canonical turns',()=>{
 const p={};receiveDialogue(p,{id:'one',text:'Тест'},1);assert.equal(answerDialogue(p,'one',{action:'owner_reply',source:'rule',reply:'Ответ',reaction:'Реакция'},2),false);
 for(let i=2;i<20;i++){answerDialogue(p,p.ownerDialogue.at(-1).id,{action:'owner_reply',source:'qwen',reply:'Ответ',reaction:'Реакция'},i);receiveDialogue(p,{id:'turn_'+i,text:'Тест'},i);}assert.equal(dialogueContext(p,p.ownerDialogue.at(-1)).history.length,12);assert.equal(p.ownerDialogue.length,19);
});
test('failed answer persistence blocks publication and model repetition until saving succeeds',async()=>{
 const h=harness(source);h.run("receiveDialogue(st.chars.reporter,{id:'turn',text:'Привет'},Date.now())");h.setAnswer({action:'owner_reply',reply:'Здравствуйте.',reaction:'Рад звонку.',source:'qwen',model:'qwen/qwen3.7-flash'});
 h.run("var originalWriter=fs.writeFileSync;fs.writeFileSync=()=>{throw Error('fixture write failure');}");await h.run('respondOwnerDialogue(Date.now())');assert(h.requests.filter(x=>x.url.endsWith('/director/world')).every(x=>x.body.chars.reporter.ownerDialogue[0].status==='waiting'));const sentBefore=h.requests.filter(x=>x.url.endsWith('/director/world')).length;const modelBefore=h.requests.filter(x=>x.url.endsWith('/api/behavior-decide')).length;
 await h.run('tick()');h.run('st.chars.columnist.fatigue=100');await h.run('collectParticipation({viewers:1,execution:true})');await h.run("relay('/director/world',composeWorld(Date.now()))");assert.equal(h.requests.filter(x=>x.url.endsWith('/director/world')).length,sentBefore);assert.equal(h.requests.filter(x=>x.url.endsWith('/api/behavior-decide')).length,modelBefore);
 h.run('fs.writeFileSync=originalWriter');await h.run('tick()');assert.equal(h.requests.filter(x=>x.url.endsWith('/director/world')).length,sentBefore+1);assert.equal(h.writes.at(-1).data.chars.reporter.ownerDialogue[0].status,'answered');
});
test('identical external IDs in phone and site cannot collide',async()=>{
 const h=harness(source);h.setHandler(url=>url.endsWith('/director/dialogue')?{items:[{id:'shared_id',person:'reporter',text:'Сайт',source:'site'}]}:undefined);await h.run('pollOwnerDialogue(Date.now())');
 h.queueCall('shared_id.json',{target:'reporter',text:'Звонок'});h.run("applyDecision=(id)=>{const p=st.chars[id];p.activity='phone';p.seq++;return true;};ownerCalls(Date.now());executionCapabilities={actors:{reporter:{activity:'phone',phone:{seq:st.chars.reporter.seq,receiving:true}}}};socialReady=()=>true;receiveOwnerCall(Date.now())");
 assert.deepEqual(h.state().chars.reporter.ownerDialogue.map(t=>t.id),['web_shared_id','ph_shared_id']);assert.equal(h.archived.length,1);
});
