import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {onAir} from '../src/tv-schedule.js';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const setup=()=>{const h=harness(source,null,undefined,1,Date.UTC(2026,9,4,12));h.run('cityUtc=0');return h;};
const musicInvite=h=>h.run("st.chars.heroine.activity='invite';st.invite={n:1,from:'heroine',to:'reporter',kind:'music'};");
const gate=h=>h.run("var p=st.chars.reporter;p.place='benchN';p.activity='lunch';p.seq=7;p.arriveAt=Date.now();p.executionGate={seq:7,expectedStart:Date.now()};executionCapabilities={at:Date.now(),actors:{reporter:{loaded:true,seq:7,activity:p.activity,mode:'seated',seat:'benchN',executing:false}}};");
test('invitation caption describes its purpose and heroine case',()=>{
 const h=setup();h.run("st.invite={from:'reporter',to:'heroine',kind:'social'}");
 assert.equal(h.run("labelOf('reporter','invite','deskB')"),'предлагает героине поговорить');
 h.run("st.invite.kind='music'");assert.match(h.run("labelOf('reporter','invite','deskB')"),/включить музыку/);
});
test('unanswered invitation restores the prior command without suppressing future invitations',()=>{
 const h=setup();h.run("st.chars.heroine.beforeSocialInvite={activity:'wait',activityUntil:Date.now()+30000,busyUntil:Date.now()+30000,entry:{from:{spot:'window'},cmd:null,at:Date.now(),activity:'wait'}};st.chars.heroine.activity='invite';st.invite={from:'heroine',to:'reporter',kind:'social'};closeInvite(st.invite,'no_answer',Date.now())");
 const st=h.state();assert.equal(st.invite,null);assert.equal(st.chars.heroine.activity,'wait');assert.deepEqual(st.chars.heroine.entry.from,{spot:'window'});
 assert.equal(st.inviteCool['heroine>reporter'],undefined);assert.equal(st.chars.heroine.memory.at(-1).event,'invitation_unanswered');
});
test('watchdog preserves sequence and origin during walking, turns and seat transitions',()=>{
 for(const mode of ['walk','turn','trans']){
  const h=setup();gate(h);h.run(`executionCapabilities.actors.reporter.mode=${JSON.stringify(mode)};p.entry={from:{spot:'window'},cmd:{seat:'benchN'}};p.executionGate.seenAt=Date.now()-50000`);
  const before=h.state().chars.reporter;
  assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
  assert.equal(h.run("abortExecution('reporter',p,'page_not_executing',Date.now())"),false);
  const after=h.state().chars.reporter;assert.equal(after.seq,before.seq);assert.deepEqual(after.entry,before.entry);assert.equal(after.activity,'lunch');
 }
});
test('stationary failure requires continuous fresh receipts and correct seat, with no action cooldown',()=>{
 const h=setup();gate(h);
 assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
 for(let i=0;i<23;i++){h.advance(2000);h.run('executionCapabilities.at=Date.now()');h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())');}
 assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),true);
 assert.equal(h.run("abortExecution('reporter',p,'page_not_executing',Date.now())"),true);
 assert.equal(h.state().chars.reporter.activity,'wait');assert.equal(h.state().failedUntil,undefined);
 const wrong=setup();gate(wrong);wrong.run("executionCapabilities.actors.reporter.seat='benchS'");assert.equal(wrong.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
});
test('missing receipts and a long observation gap restart the failure interval',()=>{
 const h=setup();gate(h);h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())');h.advance(50000);
 assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
 h.run('executionCapabilities.at=Date.now()');assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
 h.advance(50000);h.run('executionCapabilities.at=Date.now()');assert.equal(h.run('gateStuck(p,executionCapabilities.actors.reporter,Date.now())'),false);
});
test('stationary abort releases an unspent reservation without changing money or ledger',()=>{
 const h=setup();gate(h);h.run("st.economy.reservations['reporter:7']={actor:'reporter',activity:'lunch',seq:7,cents:500};");
 const before=h.state().economy;
 assert.equal(h.run("abortExecution('reporter',p,'page_not_executing',Date.now())"),true);
 const after=h.state().economy;assert.equal(after.reservations['reporter:7'],undefined);
 assert.deepEqual(after.accounts,before.accounts);assert.deepEqual(after.ledger,before.ledger);
});
test('changed music precondition records real acceptance and separate execution cancellation',async()=>{
 const h=setup();musicInvite(h);h.run("askJev=async()=>({action:'accept:invitation-1'});canTurnKnob=()=>false;");
 await h.run('answerMusicInvite(Date.now())');const st=h.state();
 for(const id of ['heroine','reporter']){assert.equal(st.chars[id].memory.at(-2).answer,'согласился');assert.equal(st.chars[id].memory.at(-1).event,'music_request_cancelled');}
 assert.equal(st.inviteCool['heroine>reporter'],undefined);assert.equal(st.chars.reporter.activity,'work');
});
test('music request dispatches one actual agreed command, without a new invitation prohibition',async()=>{
 const h=setup();musicInvite(h);h.run("askJev=async()=>({action:'accept:invitation-1'});canTurnKnob=()=>true;");
 await h.run('answerMusicInvite(Date.now())');const st=h.state();
 assert.equal(st.invite,null);assert.equal(st.chars.reporter.activity,'tvmusic');assert.equal(st.chars.reporter.entry.cmd.spot,'tvKnob');
 assert.equal(st.chars.reporter.memory.find(x=>x.event==='music_requested').answer,'согласился');assert.equal(st.inviteCool['heroine>reporter'],undefined);
 for(const id of ['heroine','reporter'])assert.equal(st.chars[id].memory.some(x=>x.event==='music_request_cancelled'),false);
});
test('an invalid model answer creates neither acceptance nor refusal',async()=>{
 const h=setup();musicInvite(h);h.run("askJev=async()=>({action:'invented'});");await h.run('answerMusicInvite(Date.now())');
 assert.equal(h.state().invite.closeReason,'invalid_model_answer');assert.equal(h.state().chars.reporter.memory.length,0);
 h.run("closeInvite(st.invite,st.invite.closeReason,Date.now())");assert.equal(h.state().chars.reporter.memory.at(-1).reason,'invalid_model_answer');
});
test('requesting music may end a conversation but never restores its finished pair',async()=>{
 for(const answer of ['decline','unanswered']){
  const h=setup();h.run("st.chars.heroine.place='tv3';st.chars.heroine.activity='conversation';st.chars.columnist.place='tv4';st.chars.columnist.activity='conversation';beginConversation(st,'heroine','columnist',{heroine:'tv3',columnist:'tv4'},Date.now(),'test');executionCapabilities={at:Date.now(),actors:Object.fromEntries(Object.entries(st.chars).map(([id,p])=>[id,{loaded:true,seq:p.seq,mode:PLACES[p.place].kind==='spot'?'idle':'seated',seat:p.place,x:PLACES[p.place].x,z:PLACES[p.place].z}]))};actions=()=>[{id:'music_ask@reporter',description:'Просьба'}];");
  assert.notEqual(h.run("pairOf(st,'heroine')"),null);
  h.run("applyDecision('heroine','music_ask@reporter','jev',1)");
  assert.equal(h.run("pairOf(st,'heroine')"),null);
  if(answer==='unanswered')h.run("closeInvite(st.invite,'no_answer',Date.now())");
  else {h.run("askJev=async()=>({action:'decline:invitation-'+st.invite.n})");await h.run('answerMusicInvite(Date.now())');}
  assert.equal(h.state().chars.heroine.activity,'wait');assert.equal(h.run("pairOf(st,'heroine')"),null);
  assert.equal(h.state().chars.heroine.entry.activity,'wait');
 }
});
test('an accepted reply does not overwrite a recipient command changed during the request',async()=>{
 const h=setup();musicInvite(h);h.run("askJev=async()=>{st.chars.reporter.seq++;st.chars.reporter.activity='rest_desk';return {action:'accept:invitation-1'}};canTurnKnob=()=>true;");
 await h.run('answerMusicInvite(Date.now())');const st=h.state();assert.equal(st.chars.reporter.activity,'rest_desk');
 assert.equal(st.chars.reporter.memory.at(-2).answer,'согласился');assert.equal(st.chars.reporter.memory.at(-1).event,'music_request_cancelled');
});
test('director matches viewer day/night music slots including their final thirty seconds',()=>{
 const h=setup();
 for(const cityUtc of [0,10800,-14400])for(let minute=0;minute<1440;minute++)for(const sec of [0,31,59]){
  const now=Date.UTC(2026,9,4)+minute*60000+sec*1000;
  h.advance(now-h.now());h.run(`cityUtc=${cityUtc};st.tvMusic=null`);
  const expected=onAir(now,{cityHour:new Date(now+cityUtc*1000).getUTCHours(),night:'jazz'}).ch==='jazz';
  assert.equal(h.run('musicOn(Date.now())'),expected);
 }
});
test('scheduled manual tune stays pending until its from time',()=>{
 const h=setup();h.run('st.tvMusic={at:Date.now(),from:Date.now()+40000,until:Date.now()+600000};executionCapabilities=null');
 assert.equal(h.run('musicOn(Date.now())'),false);assert.equal(h.run('musicPending(Date.now())'),true);
 h.advance(41000);assert.equal(h.run('musicOn(Date.now())'),true);assert.equal(h.run('musicPending(Date.now())'),false);
});
