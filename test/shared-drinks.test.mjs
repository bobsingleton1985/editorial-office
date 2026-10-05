import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
import {ensureEconomy,confirmPurchases,available} from '../director/economy.mjs';
import * as drinks from '../director/shared-drinks.mjs';

const source=new URL('../director/director.mjs',import.meta.url).pathname;
const config={enabled:true,currency:'USD',startingCents:1000,workRewardCents:300,prices:{whisky:100,coffee:100},offerAmounts:[],loanDays:3};
function fixture(){
  const st={chars:{a:{seq:1,place:'deskA',activity:'wait',memory:[]},b:{seq:1,place:'deskB',activity:'wait',memory:[]}}};
  ensureEconomy(st,config,1000);drinks.ensureSharedDrinks(st);
  const input={ready:{a:true,b:true},destinations:{a:{whisky:[{place:'deskA',action:'whisky@deskA'}]},b:{whisky:[{place:'deskB',action:'whisky@deskB'}]}},names:{a:'А',b:'Б'}};
  const dispatch=(id,action)=>{const p=st.chars[id];p.seq++;[p.activity,p.place]=action.split('@');if(p.activity==='whisky'){
    // Production reservation function is exercised through the director tests below.
  }return true;};
  const choose=(id,action,now=1000)=>drinks.chooseSharedDrink(st,id,action,now,'qwen',input,dispatch);
  const caps=(at=1000,executing=false)=>({at,actors:Object.fromEntries(Object.entries(st.chars).map(([id,p])=>[id,{loaded:true,seq:p.seq,activity:p.activity,mode:'seated',seat:p.place,executing,moneyWitness:1}]))});
  return {st,input,dispatch,choose,caps};
}
function director(){
  const h=harness(source,null,config,1,100000);
  h.run(`st.invite=null;for(const [id,p]of Object.entries(st.chars)){p.activity='wait';p.place=PEOPLE[id].home;p.arriveAt=Date.now()-1000;p.busyUntil=Date.now()+180000;p.sleep=null;p.sleepPending=null;delete p.executionGate;}st.chars.heroine.place='bar';`);
  refresh(h);return h;
}
function refresh(h,executing=false){h.run(`executionCapabilities={at:Date.now(),actors:Object.fromEntries(Object.entries(st.chars).map(([id,p])=>[id,{loaded:true,seq:p.seq,activity:p.activity,moneyWitness:1,mode:p.place.startsWith('desk')?'seated':'idle',seat:p.place.startsWith('desk')?p.place:null,x:PLACES[p.place].x,z:PLACES[p.place].z,executing:${executing},consumptionAvailable:id==='heroine'?['whisky','heroine_coffee']:[]}]))};`);}
const options=(h,id)=>JSON.parse(h.run(`JSON.stringify(actions('${id}'))`));
const apply=(h,id,action)=>h.run(`applyDecision('${id}','${action}','qwen',.8)`);

test('invitation does not move or debit; reply may independently refuse or defer',()=>{
  for(const answer of ['decline','defer']){
    const f=fixture(),before=structuredClone(f.st.economy.accounts);assert(f.choose('a','drink_invite@b:whisky:treat'));
    assert.equal(f.st.chars.a.seq,1);assert.equal(f.st.chars.b.seq,1);assert.deepEqual(f.st.economy.accounts,before);
    const v=f.st.economy.drinkInvitations[0];assert(f.choose('b',`drink_reply@${v.id}:${answer}`));
    assert.equal(v.status,answer==='decline'?'cancelled':'deferred');assert.deepEqual(f.st.economy.accounts,before);assert.deepEqual(f.st.economy.reservations,{});
  }
});
test('private recipient balance never hides the original invitation; self-paid acceptance needs own funds',()=>{
  const f=fixture();f.st.economy.accounts.b=0;
  assert(drinks.sharedDrinkActions(f.st,'a',1000,f.input).some(a=>a.id==='drink_invite@b:whisky:each'));
  assert(f.choose('a','drink_invite@b:whisky:each'));const v=f.st.economy.drinkInvitations[0];
  assert(!drinks.sharedDrinkActions(f.st,'b',1000,f.input).some(a=>a.id.endsWith(':accept')));
});
test('accepted treat reserves both drinks without debt or payment, expires without loss',()=>{
  const f=fixture();f.st.economy.accounts.b=0;assert(f.choose('a','drink_invite@b:whisky:treat'));
  const v=f.st.economy.drinkInvitations[0];assert(f.choose('b',`drink_reply@${v.id}:accept`));
  assert.equal(v.status,'gathering');assert.equal(available(f.st,'a'),800);assert.equal(f.st.economy.accounts.a,1000);assert.equal(f.st.economy.debts.length,0);
  drinks.observeSharedDrinks(f.st,null,v.expiresAt+1,f.dispatch);assert.equal(v.status,'cancelled');assert.equal(available(f.st,'a'),1000);
});
test('deferred treat asks original inviter again, keeping original sponsor',()=>{
  const f=fixture();f.st.economy.accounts.b=0;assert(f.choose('a','drink_invite@b:whisky:treat'));
  const v=f.st.economy.drinkInvitations[0];assert(f.choose('b',`drink_reply@${v.id}:defer`));assert(f.choose('b',`drink_join@${v.id}`));
  assert.equal(v.to,'a');assert.equal(v.sponsor,'a');assert(f.choose('a',`drink_reply@${v.id}:accept`));
  assert.equal(v.charges.a.payer,'a');assert.equal(v.charges.b.payer,'a');
});
test('gathering rejects stale/future/mismatched/unarrived reports and does not start one person early',()=>{
  for(const change of [c=>c.at=-4000,c=>c.at=2000,c=>c.actors.a.seq--,c=>c.actors.b.mode='walk',c=>c.actors.b.seat='deskC']){
    const f=fixture();f.choose('a','drink_invite@b:whisky:treat');const v=f.st.economy.drinkInvitations[0];f.choose('b',`drink_reply@${v.id}:accept`);
    const cap=f.caps(1000);change(cap);drinks.observeSharedDrinks(f.st,cap,1000,f.dispatch);assert.equal(v.status,'gathering');assert.equal(f.st.chars.a.activity,'wait');assert.equal(f.st.chars.b.activity,'wait');
  }
});
test('director exposes targeted choices to all four actors and hides them without fresh payment support',()=>{
  const h=director();for(const id of ['columnist','reporter','newspaper_editor','heroine'])assert(options(h,id).some(a=>a.id.startsWith('drink_invite@')));
  h.run('executionCapabilities.at=Date.now()+1');assert(!options(h,'reporter').some(a=>a.id.startsWith('drink_invite@')));
  refresh(h);h.run('executionCapabilities.actors.reporter.moneyWitness=0');assert(!options(h,'reporter').some(a=>a.id.startsWith('drink_invite@')));
});
test('full director treat path: consent -> approach -> receipts -> one debit per actually executing drink',async()=>{
  const h=director();h.run('st.economy.accounts.reporter=0');assert.notEqual(apply(h,'columnist','drink_invite@reporter:whisky:treat'),false);
  let v=h.state().economy.drinkInvitations[0];assert.notEqual(apply(h,'reporter',`drink_reply@${v.id}:accept`),false);
  v=h.state().economy.drinkInvitations[0];assert.equal(v.status,'gathering');assert.equal(h.state().economy.accounts.columnist,1000);
  refresh(h);h.run("observeSharedDrinks(st,executionCapabilities,Date.now(),(id,a)=>applyDecision(id,a,'shared_drink_executor',null,null,false,false,false,true))");
  v=h.state().economy.drinkInvitations[0];assert.equal(v.status,'drinking');assert.equal(h.state().chars.reporter.activity,'whisky');
  refresh(h,false);h.run('confirmPurchases(st,executionCapabilities,Date.now())');assert.equal(h.state().economy.accounts.columnist,1000);
  refresh(h,true);h.run('confirmPurchases(st,executionCapabilities,Date.now());observeSharedDrinks(st,executionCapabilities,Date.now(),()=>false)');
  assert.equal(h.state().economy.accounts.columnist,800);assert.equal(h.state().economy.accounts.reporter,0);assert.equal(h.state().economy.debts.length,0);
  h.advance(1000);refresh(h,true);h.run('observeSharedDrinks(st,executionCapabilities,Date.now(),()=>false)');
  refresh(h,false);h.run('confirmPurchases(st,executionCapabilities,Date.now());observeSharedDrinks(st,executionCapabilities,Date.now(),()=>false)');
  v=h.state().economy.drinkInvitations[0];assert.equal(v.status,'completed');assert.equal(v.observedTogetherMs,1000);assert.equal(h.state().economy.accounts.columnist,800);
  const request=JSON.stringify(await h.run("snapshot('reporter',actions('reporter'))"));assert(request.includes('shared_drink_finished'));
});
test('heroine completion may advance her sequence while companion finishes; replayed observations cannot add time',()=>{
  const f=fixture();f.choose('a','drink_invite@b:whisky:each');const v=f.st.economy.drinkInvitations[0];f.choose('b',`drink_reply@${v.id}:accept`);
  drinks.observeSharedDrinks(f.st,f.caps(),1000,f.dispatch);
  let c=f.caps(1500,true);drinks.observeSharedDrinks(f.st,c,1500,f.dispatch);drinks.observeSharedDrinks(f.st,c,1500,f.dispatch);assert.equal(v.observedTogetherMs,0);
  f.st.economy.receipts[`purchase:a:${v.plan.a.seq}`]={};c=f.caps(2000,true);c.actors.a.executing=false;drinks.observeSharedDrinks(f.st,c,2000,f.dispatch);assert(v.plan.a.done);
  f.st.chars.a.seq++;f.st.chars.a.activity='wait';f.st.economy.receipts[`purchase:b:${v.plan.b.seq}`]={};c=f.caps(2500,false);drinks.observeSharedDrinks(f.st,c,2500,f.dispatch);assert.equal(v.status,'completed');
});
test('continue during a pending invitation does not replay work and bounds next model request',()=>{
  const h=director();apply(h,'columnist','drink_invite@reporter:whisky:each');h.run('st.chars.reporter.busyUntil=Date.now()-1');const seq=h.state().chars.reporter.seq;
  apply(h,'reporter','continue');assert.equal(h.state().chars.reporter.seq,seq);assert(h.state().chars.reporter.busyUntil>h.now());assert.equal(h.state().economy.drinkInvitations[0].considered,true);
});
test('cancel while approaching releases reserves and changes cancelling actor to a safe wait',()=>{
  const h=director();apply(h,'columnist','drink_invite@reporter:whisky:treat');const v=h.state().economy.drinkInvitations[0];apply(h,'reporter',`drink_reply@${v.id}:accept`);
  apply(h,'reporter',`drink_cancel@${v.id}`);assert.equal(h.state().economy.drinkInvitations[0].status,'cancelled');assert.deepEqual(h.state().economy.reservations,{});assert.equal(h.state().economy.accounts.columnist,1000);
});

test('joint payer is explicit even with an older third-party treat and exact sponsor balance',()=>{
  const h=director();h.run(`st.economy.accounts.columnist=200;st.economy.treats.push({id:'older',from:'newspaper_editor',to:'reporter',activity:'whisky',cents:100,status:'available',expiresAt:Date.now()+86400000});st.economy.reservations['credit:older']={actor:'newspaper_editor',payer:'newspaper_editor',cents:100,credit:true};`);
  apply(h,'columnist','drink_invite@reporter:whisky:treat');const v=h.state().economy.drinkInvitations[0];assert(v);apply(h,'reporter',`drink_reply@${v.id}:accept`);
  refresh(h);h.run("observeSharedDrinks(st,executionCapabilities,Date.now(),(id,a)=>applyDecision(id,a,'shared_drink_executor',null,null,false,false,false,true))");
  assert.equal(h.state().economy.drinkInvitations[0].status,'drinking');
  for(const r of Object.values(h.state().economy.reservations).filter(r=>r.jointId))assert.equal(r.payer,'columnist');
  refresh(h,true);h.run('confirmPurchases(st,executionCapabilities,Date.now())');assert.equal(h.state().economy.accounts.columnist,0);assert.equal(h.state().economy.accounts.newspaper_editor,1000);assert.equal(h.state().economy.treats[0].status,'available');
});
test('nested agreed dispatch never saves an intermediate mismatched plan',()=>{
  const h=director();apply(h,'columnist','drink_invite@reporter:whisky:each');const v=h.state().economy.drinkInvitations[0];apply(h,'reporter',`drink_reply@${v.id}:accept`);
  for(const w of h.writes){const v=w.data.economy?.drinkInvitations?.[0];if(v?.status==='gathering')for(const id of [v.from,v.to])assert.equal(v.plan[id].seq,w.data.chars[id].seq);}
});
test('cancelling an unobserved drink stops only the cancelling command; partner keeps agreed payment',()=>{
  const h=director();apply(h,'columnist','drink_invite@reporter:whisky:treat');const v=h.state().economy.drinkInvitations[0];apply(h,'reporter',`drink_reply@${v.id}:accept`);refresh(h);
  h.run("observeSharedDrinks(st,executionCapabilities,Date.now(),(id,a)=>applyDecision(id,a,'shared_drink_executor',null,null,false,false,false,true))");
  apply(h,'reporter',`drink_cancel@${v.id}`);assert.equal(h.state().chars.reporter.activity,'wait');assert.equal(h.state().chars.columnist.activity,'whisky');
  assert.equal(Object.values(h.state().economy.reservations).filter(r=>r.jointId).length,1);refresh(h,true);h.run('confirmPurchases(st,executionCapabilities,Date.now())');assert.equal(h.state().economy.accounts.columnist,900);
});
test('lost heroine drinking capability cancels before either paid drink starts',()=>{
  const h=director();apply(h,'columnist','drink_invite@heroine:whisky:treat');const v=h.state().economy.drinkInvitations[0];apply(h,'heroine',`drink_reply@${v.id}:accept`);refresh(h);
  h.run(`executionCapabilities.actors.heroine.consumptionAvailable=[];observeSharedDrinks(st,executionCapabilities,Date.now(),(id,a)=>applyDecision(id,a,'shared_drink_executor',null,null,false,false,false,true),sharedDrinkInput(Date.now()))`);
  assert.equal(h.state().economy.drinkInvitations[0].status,'cancelled');assert.equal(h.state().chars.columnist.activity,'wait');assert.equal(h.state().chars.heroine.activity,'wait');assert.equal(h.state().economy.accounts.columnist,1000);assert.deepEqual(h.state().economy.reservations,{});
});
