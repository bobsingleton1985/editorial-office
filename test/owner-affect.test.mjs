import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {parseDeclaredEmotion,samplePhoneEmotion} from '../owner-phone-performance.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;

test('fear and respect survive director persistence and world publication as distinct affects',async()=>{
 for(const [label,emotion] of [['Страх','fear'],['Уважение','respect']]){
  const h=harness(source);
  h.run("receiveDialogue(st.chars.heroine,{id:'affect',text:'Ответьте мне.',source:'site'},Date.now())");
  h.setAnswer({action:'owner_reply',reply:'Мне важно сохранить вашу поддержку.',reaction:label+': Мне важно ваше решение.',source:'qwen',model:'qwen/qwen3.7-flash'});
  await h.run('respondOwnerDialogue(Date.now())');
  const turn=h.state().chars.heroine.ownerDialogue[0];
  assert.equal(turn.status,'answered');assert.equal(turn.emotion,emotion);
  assert.equal(turn.emotionLabel,label);assert.equal(turn.emotionStatus,'recognized');
  const saved=h.writes.findLast(w=>w.data.chars?.heroine?.ownerDialogue?.[0]?.status==='answered');
  assert.equal(saved.data.chars.heroine.ownerDialogue[0].emotion,emotion);
  const published=h.requests.findLast(r=>r.url.endsWith('/director/world'));
  assert.equal(published.body.chars.heroine.ownerDialogue[0].emotion,emotion);
 }
});

test('unrecognized affect remains observable without becoming calm or retrying a valid spoken reply',async()=>{
 const h=harness(source);
 h.run("receiveDialogue(st.chars.heroine,{id:'unknown',text:'Привет',source:'site'},Date.now())");
 h.setAnswer({action:'owner_reply',reply:'Здравствуйте.',reaction:'Тревога: Не уверена, чего ждать.',source:'qwen',model:'qwen/qwen3.7-flash'});
 await h.run('respondOwnerDialogue(Date.now())');
 const turn=h.state().chars.heroine.ownerDialogue[0];
 assert.equal(turn.status,'answered');assert.equal(turn.emotion,null);
 assert.equal(turn.emotionLabel,'Тревога');assert.equal(turn.emotionStatus,'unrecognized');
 assert.equal(turn.reaction,'Тревога: Не уверена, чего ждать.');
 const requests=h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length;
 await h.run('respondOwnerDialogue(Date.now())');
 assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,requests);
 assert.equal(parseDeclaredEmotion('Спокойствие: Всё хорошо.'),'neutral');
 assert.equal(parseDeclaredEmotion(''),null);
});

test('semantic fear has no fabricated gesture and old neutral misclassification cannot select a different affect',()=>{
 const args={id:'heroine',bones:{},gestures:{},ch:{activity:'phone',clk:10,g:{phone:true,t0:0,segs:[]}},command:{seq:5},turn:{id:'fear',replyActorSeq:5,status:'answered',emotion:'neutral',reaction:'Страх: Боюсь увольнения.',reply:'Прошу вас, давайте обсудим это.',answeredAt:10000},now:11000};
 assert.equal(parseDeclaredEmotion(args.turn.reaction),'fear');
 assert.equal(samplePhoneEmotion(args),null);
 args.turn.reaction='Неизвестно: Реакция';args.turn.emotion='anger';
 const trap={get(){throw Error('must not sample guessed anger');}};
 args.gestures=new Proxy({},trap);
 assert.equal(samplePhoneEmotion(args),null);
});
