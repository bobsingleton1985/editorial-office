import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {ensureEconomy,available} from '../director/economy.mjs';
import * as drinks from '../director/shared-drinks.mjs';

// Separate-table joint drinking is retired (README "Accepted service v46": "Separate-table joint
// drinking is retired"; director/shared-drinks.mjs:43 "Owner 2026-10-06: joint drinks use heroine
// service at the common table"). New invitations are no longer offered or accepted; only cleanup of
// invitations saved by an older director remains.
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const config={enabled:true,currency:'USD',startingCents:1000,workRewardCents:300,prices:{whisky:100,coffee:100},offerAmounts:[],loanDays:3};
function director(){
  const h=harness(source,null,config,1,100000);
  h.run(`st.invite=null;for(const [id,p]of Object.entries(st.chars)){p.activity='wait';p.place=PEOPLE[id].home;p.arriveAt=Date.now()-1000;p.busyUntil=Date.now()-1;p.sleep=null;p.sleepPending=null;delete p.executionGate;}st.chars.heroine.place='bar';`);
  h.run(`executionCapabilities={at:Date.now(),actors:Object.fromEntries(Object.entries(st.chars).map(([id,p])=>[id,{loaded:true,seq:p.seq,activity:p.activity,moneyWitness:1,mode:p.place.startsWith('desk')?'seated':'idle',seat:p.place.startsWith('desk')?p.place:null,x:PLACES[p.place].x,z:PLACES[p.place].z,executing:false,consumptionAvailable:id==='heroine'?['whisky','heroine_coffee']:[]}]))};`);
  return h;
}
// A gathering invitation as persisted by the retired implementation: both drinks reserved,
// sponsor's treat credit held, actors dispatched under the invitation.
function legacy(status='gathering'){
  const st={chars:{a:{seq:2,place:'deskA',activity:'wait',memory:[],entry:{sharedDrinkId:'drink-1'}},b:{seq:2,place:'deskB',activity:'wait',memory:[],entry:{sharedDrinkId:'drink-1'}},c:{seq:1,place:'deskC',activity:'wait',memory:[]}}};
  ensureEconomy(st,config,1000);drinks.ensureSharedDrinks(st);const e=st.economy;
  const v={id:'drink-1',from:'a',to:'b',kind:'whisky',payment:'treat',sponsor:'a',status,at:1000,expiresAt:181000,consent:{a:{at:1000,source:'qwen',seq:1},b:{at:1100,source:'qwen',seq:1}},observedTogetherMs:0,
    plan:{a:{place:'deskA',action:'whisky@deskA',seq:2},b:{place:'deskB',action:'whisky@deskB',seq:2}},charges:{a:{payer:'a',cents:100},b:{payer:'a',cents:100}}};
  e.drinkInvitations.push(v);
  for(const actor of ['a','b'])e.reservations[`joint:${v.id}:${actor}`]={actor,payer:'a',cents:100,credit:true};
  e.treats.push({id:'drink-1:treat',from:'a',to:'b',activity:'whisky',status:'available',expiresAt:181000});e.reservations['credit:drink-1:treat']={actor:'a',payer:'a',cents:100};
  e.reservations.unrelated={actor:'c',payer:'c',cents:100};
  return {st,v};
}

test('retired joint drinking is never offered and a drink_invite decision is rejected without effects',()=>{
  const h=director();
  for(const id of ['columnist','reporter','newspaper_editor','heroine']){
    const ids=JSON.parse(h.run(`JSON.stringify(actions('${id}').map(a=>a.id))`));
    assert(!ids.some(a=>a.startsWith('drink_')),id+' still sees a joint-drink option');
  }
  assert.deepEqual(drinks.sharedDrinkActions(h.state(),'reporter',Date.now(),{ready:{reporter:true,columnist:true}}),[]);
  const before=h.state(),seq=before.chars.reporter.seq;
  assert.equal(h.run(`applyDecision('reporter','drink_invite@columnist:whisky:treat','qwen',.8)`),false);
  const after=h.state();
  assert.deepEqual(after.economy.drinkInvitations,[]);assert.deepEqual(after.economy.reservations,before.economy.reservations);assert.deepEqual(after.economy.accounts,before.economy.accounts);
  assert.equal(after.chars.reporter.seq,seq);assert.equal(after.chars.columnist.seq,before.chars.columnist.seq);
});

test('cancelling a legacy invitation releases its joint and treat-credit reservations exactly once',()=>{
  const {st,v}=legacy(),aBefore=available(st,'a'),ledger=st.economy.ledger.length;
  assert.equal(drinks.cancelSharedDrink(st,v,'self_cancelled:b',2000),true);
  assert.equal(v.status,'cancelled');assert.equal(v.reason,'self_cancelled:b');assert.equal(v.closedAt,2000);
  assert.deepEqual(Object.keys(st.economy.reservations),['unrelated']);assert.equal(available(st,'a'),aBefore+300);
  assert.equal(st.economy.treats[0].status,'cancelled');assert.equal(st.economy.ledger.length,ledger);
  for(const id of ['a','b'])assert.equal(st.chars[id].memory.filter(m=>m.event==='shared_drink_cancelled').length,1);
  assert.equal(drinks.sharedDrinkFor(st,'a'),undefined);
  assert.equal(drinks.cancelSharedDrink(st,v,'again',3000),false);assert.equal(v.reason,'self_cancelled:b');
  assert.equal(st.chars.a.memory.filter(m=>m.event==='shared_drink_cancelled').length,1);
});

test('observation cancels every live legacy invitation and returns only its own dispatched actors to a safe wait',()=>{
  for(const status of ['pending','deferred','gathering','drinking']){
    const {st,v}=legacy(status),ledger=st.economy.ledger.length,done={...structuredClone(v),id:'drink-0',status:'cancelled'};st.economy.drinkInvitations.unshift(done);
    if(status==='pending'||status==='deferred')delete st.chars.b.entry.sharedDrinkId;
    const dispatched=[];
    assert.equal(drinks.observeSharedDrinks(st,null,2000,(id,action)=>{dispatched.push([id,action]);return true;}),true,status);
    assert.equal(v.status,'cancelled');assert.equal(v.reason,'separate_tables_removed_by_owner');assert.equal(done.status,'cancelled');
    assert.deepEqual(dispatched,status==='pending'||status==='deferred'?[['a','wait@deskA']]:[['a','wait@deskA'],['b','wait@deskB']]);
    assert.deepEqual(Object.keys(st.economy.reservations),['unrelated']);assert.equal(st.economy.ledger.length,ledger);
    assert.equal(drinks.observeSharedDrinks(st,null,3000,()=>assert.fail('replayed cleanup')),false);
  }
});

test('director startup with a saved legacy invitation cleans it up on observation and never debits',async()=>{
  const h=director();
  h.run(`st.chars.reporter.entry={...st.chars.reporter.entry,sharedDrinkId:'drink-9'};st.economy.drinkInvitations.push({id:'drink-9',from:'reporter',to:'columnist',kind:'whisky',payment:'each',sponsor:'reporter',status:'gathering',at:Date.now(),expiresAt:Date.now()+180000,consent:{},observedTogetherMs:0,plan:{reporter:{place:st.chars.reporter.place},columnist:{place:st.chars.columnist.place}},charges:{reporter:{payer:'reporter',cents:100},columnist:{payer:'columnist',cents:100}}});st.economy.reservations['joint:drink-9:reporter']={actor:'reporter',payer:'reporter',cents:100,credit:true};st.economy.reservations['joint:drink-9:columnist']={actor:'columnist',payer:'columnist',cents:100,credit:true};`);
  const accounts=h.state().economy.accounts,seq=h.state().chars.reporter.seq;
  h.run(`observeSharedDrinks(st,executionCapabilities,Date.now(),(id,a)=>applyDecision(id,a,'shared_drink_executor',null,null,false,false,false,true))`);
  const s=h.state(),v=s.economy.drinkInvitations.find(v=>v.id==='drink-9');
  assert.equal(v.status,'cancelled');assert.equal(v.reason,'separate_tables_removed_by_owner');
  assert(!Object.keys(s.economy.reservations).some(k=>k.startsWith('joint:drink-9')));assert.deepEqual(s.economy.accounts,accounts);
  assert.equal(s.chars.reporter.activity,'wait');assert.equal(s.chars.reporter.seq,seq+1);assert.equal(s.chars.columnist.activity,'wait');
});
