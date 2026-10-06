import {available,price} from './economy.mjs';

const live = v => ['pending','deferred','gathering','drinking'].includes(v.status);
const members = v => [v.from,v.to];
const name = (input,id) => input.names?.[id] || id;
const fresh = (cap,now) => Number.isFinite(cap?.at) && cap.at<=now && now-cap.at<3500;
const drinking = v => ['gathering','drinking'].includes(v.status);
export function ensureSharedDrinks(st) {st.economy.drinkInvitations ??= [];}
export function sharedDrinkFor(st,id) {return st.economy.drinkInvitations.find(v=>live(v)&&members(v).includes(id));}
function say(st,id,to,kind,mark,now){const p=st.chars[id];p.entry={...(p.entry||{}),talk:{at:now,to,icon:kind,mark}};}
function note(st,v,event,summary,now,extra={}) {
  for(const id of members(v)) {
    const p=st.chars[id],key=`${v.id}:${event}:${id}`;
    if(p.memory.some(e=>e.id===key))continue;
    p.memory.push({id:key,event,partner:id===v.from?v.to:v.from,drink:v.kind,payment:v.payment,summary,at:now,source:'shared_drinks',...extra});
    p.memory=p.memory.slice(-12);
  }
}
export function sharedDrinkContext(st,id) {
  // Keep current consent/obligations explicit, independent of bounded memory.
  return {sharedDrinks:st.economy.drinkInvitations.filter(v=>members(v).includes(id)&&live(v))};
}
export function sharedDrinkPlaces(st,id) {
  return st.economy.drinkInvitations.filter(drinking).flatMap(v=>members(v).filter(k=>k!==id).map(k=>v.plan[k].place));
}
function plan(st,from,to,kind,input) {
  if(!input.ready?.[from]||!input.ready?.[to])return null;
  for(const a of input.destinations?.[from]?.[kind]||[])for(const b of input.destinations?.[to]?.[kind]||[]) {
    if(a.place!==b.place)return {[from]:a,[to]:b};
  }
  return null;
}
function costs(st,from,to,kind,payment,sponsor=from) {
  const cents=price(st,kind);
  return {[from]:{payer:payment==='treat'?sponsor:from,cents},[to]:{payer:payment==='treat'?sponsor:to,cents}};
}
function affordable(st,entries) {
  const totals={};for(const x of Object.values(entries))totals[x.payer]=(totals[x.payer]||0)+x.cents;
  return Object.entries(totals).every(([id,cents])=>available(st,id)>=cents);
}
// Owner 2026-10-06: joint drinks use heroine service at the common table.
export function sharedDrinkActions(){return [];}
export function sharedDrinkReplyDue(st,id,now) {
  const v=sharedDrinkFor(st,id);return !!v&&v.to===id&&v.status==='pending'&&v.expiresAt>now&&v.considered!==true;
}
export function consideredSharedDrink(st,id) {
  const v=sharedDrinkFor(st,id);if(v?.to===id&&v.status==='pending')v.considered=true;
}
export function cancelSharedDrink(st,v,reason,now) {
  if(!v||!live(v))return false;
  for(const id of members(v)) {
    delete st.economy.reservations[`joint:${v.id}:${id}`];
    const t=st.economy.treats.find(t=>t.id===`${v.id}:treat`);
    if(t&&t.status==='available'){delete st.economy.reservations['credit:'+t.id];t.status='cancelled';}
  }
  v.status='cancelled';v.reason=reason;v.closedAt=now;v.lastObservation=null;
  note(st,v,'shared_drink_cancelled','Совместное питьё завершено: '+reason+'. Подход и согласие не считаются выпитым напитком.',now,{observedTogetherMs:v.observedTogetherMs||0});
  st.economy.revision++;return true;
}
export function chooseSharedDrink(st,id,action,now,source,input,dispatch) {
  if(!['jev','qwen'].includes(source)||!sharedDrinkActions(st,id,now,input).some(a=>a.id===action))return false;
  const [verb,arg]=action.split('@'),[key,kind,payment]=arg.split(':'),e=st.economy;
  if(verb==='drink_invite') {
    const v={id:`drink-${++e.next}`,from:id,to:key,kind,payment,sponsor:id,status:'pending',at:now,expiresAt:now+180000,consent:{[id]:{at:now,source,seq:st.chars[id].seq}},observedTogetherMs:0};
    e.drinkInvitations.push(v);say(st,id,key,kind,'q',now);e.revision++;
    note(st,v,'shared_drink_offered',`${name(input,id)} предложил ${name(input,key)} ${kind==='whisky'?'виски':'кофе'} вместе${payment==='treat'?' за свой счёт':''}. Ответа ещё нет.`,now);return true;
  }
  const v=e.drinkInvitations.find(v=>v.id===key);
  if(verb==='drink_cancel'){const active=v.status==='drinking',place=st.chars[id].place;const changed=cancelSharedDrink(st,v,'self_cancelled:'+id,now);if(active)dispatch(id,'wait@'+place);return changed;}
  if(verb==='drink_join') {
    [v.from,v.to]=[v.to,v.from];
    v.status='pending';v.considered=false;v.consent={[id]:{at:now,source,seq:st.chars[id].seq}};e.revision++;
    note(st,v,'shared_drink_renewed','Отложенное предложение выпить возобновлено; требуется новый ответ коллеги.',now);return true;
  }
  if(kind==='decline'){say(st,id,v.from,v.kind,'no',now);return cancelSharedDrink(st,v,'declined:'+id,now);}
  if(kind==='defer'){say(st,id,v.from,v.kind,'later',now);v.status='deferred';v.considered=true;e.revision++;note(st,v,'shared_drink_deferred','Коллега ответил «позже». Питьё и оплата не начались.',now);return true;}
  const selected=plan(st,v.from,v.to,v.kind,input);
  // A renewed treat retains the original payer, now the person answering.
  const charges=costs(st,v.from,v.to,v.kind,v.payment,v.sponsor);
  if(!selected||!affordable(st,charges))return false;
  say(st,id,v.from,v.kind,'yes',now);
  v.plan=selected;v.charges=charges;v.status='gathering';v.expiresAt=now+180000;v.consent[id]={at:now,source,seq:st.chars[id].seq};
  for(const actor of members(v))e.reservations[`joint:${v.id}:${actor}`]={actor,payer:charges[actor].payer,cents:charges[actor].cents,credit:true};
  for(const actor of members(v)) {
    if(dispatch(actor,'wait@'+selected[actor].place)===false){cancelSharedDrink(st,v,'approach_failed',now);return true;}
    selected[actor].seq=st.chars[actor].seq;
    if(st.chars[actor].place!==selected[actor].place){cancelSharedDrink(st,v,'approach_rejected',now);return true;}
  }
  note(st,v,'shared_drink_agreed','Оба согласились выпить; подходят к местам. Напитки ещё не выпиты, списания ещё нет.',now);e.revision++;return true;
}
export function sharedDrinkCommandChanged(st,id,action,now) {
  const v=sharedDrinkFor(st,id);if(v)cancelSharedDrink(st,v,'partner_changed_activity:'+id,now);
}
function atPlace(st,id,p,cap,now) {
  const a=cap?.actors?.[id];return fresh(cap,now)&&a?.loaded&&a.moneyWitness===1&&a.seq===st.chars[id].seq&&a.seq===p.seq&&a.activity===st.chars[id].activity&&st.chars[id].place===p.place&&['idle','seated'].includes(a.mode)&&
    (p.place.startsWith('desk')?a.seat===p.place:a.seat===null&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Math.hypot(a.x-p.x,a.z-p.z)<.35);
}
export function observeSharedDrinks(st,cap,now,dispatch){
 let changed=false;
 for(const v of st.economy.drinkInvitations.filter(live)){
  const actors=members(v).filter(id=>st.chars[id]?.entry?.sharedDrinkId===v.id);
  changed=cancelSharedDrink(st,v,'separate_tables_removed_by_owner',now)||changed;
  for(const id of actors)dispatch(id,'wait@'+st.chars[id].place);
 }
 return changed;
}
