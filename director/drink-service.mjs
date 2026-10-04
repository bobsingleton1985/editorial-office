import {available,settleService} from './economy.mjs';
import {remember} from './economy-events.mjs';
const active=s=>['inviting','reserved','running'].includes(s.status);
const fresh=(cap,now)=>Number.isFinite(cap?.at)&&cap.at<=now&&now-cap.at<=3500;
export function ensureServices(st){st.economy.services??=[];}
function seated(st,id,g,cap,now){const p=st.chars[id],a=cap?.actors?.[id];return fresh(cap,now)&&a?.loaded&&g.seq===p?.seq&&Number.isInteger(a.seq)&&a.seq>=g.originSeq&&a.seq<=g.seq&&p.place===g.seat&&a.seat===g.seat&&a.mode==='seated'&&a.executing===true&&['rest_lounge','wait'].includes(p.activity);}
function note(st,s,id,event,summary,now){remember(st,id,{id:`${s.id}:${event}:${id}`,event,partner:id==='heroine'?null:'heroine',summary},now);}
export function serviceContext(st,id){return {drinkServicePriceCents:100,services:st.economy.services.filter(s=>id==='heroine'||s.guests[id]).slice(-10)};}
export function serviceActions(st,id,now,input){
 if(!st.economy.config.enabled)return [];const out=[],e=st.economy,mode=st.hostessMode||'dance';
 if(id==='heroine'&&mode==='drinks'&&!st.trayDelivery&&input.ready&&!e.services.some(active))out.push({id:'money_drinks_offer@all',description:'Предложить всем коллегам напитки с обслуживанием: по 1 USD с каждого. Каждый независимо согласится или откажется; согласившийся сядет на свободную лавку. Затем ты сможешь налить и принести поднос. Оплата только за фактическую доставку.'});
 for(const s of e.services.filter(active)){
  const g=s.guests[id];if(id!=='heroine'&&!g)continue;
  if(id==='heroine'||['accepted','pending'].includes(g.status))out.push({id:`money_drinks_cancel@${s.id}`,description:id==='heroine'?'Отменить обслуживание и освободить все неоплаченные резервы.':'Отказаться от обслуживания; твой 1 USD из резерва вернётся.'});
  if(mode!=='drinks')continue;
  if(g?.status==='pending'&&s.status==='inviting'&&s.expiresAt>now){
   out.push({id:`money_drinks_reply@${s.id}:decline`,description:'Отказаться от напитка и обслуживания за 1 USD.'});
   if(input.ready&&available(st,id)>=100)for(const seat of input.benches?.[id]||[])out.push({id:`money_drinks_reply@${s.id}:accept:${seat}`,description:`Согласиться на напиток с доставкой за 1 USD и сесть на ${seat}. Сумма резервируется, пока героиня приносит поднос. Ты можешь уйти или отказаться.`});
  }
  if(id==='heroine'&&s.status==='reserved'&&input.ready&&input.stationFree&&Object.entries(s.guests).some(([,g])=>g.status==='accepted')&&Object.entries(s.guests).filter(([,g])=>g.status==='accepted').every(([id,g])=>seated(st,id,g,input.capabilities,now)))out.push({id:`money_drinks_start@${s.id}`,description:'Все согласившиеся гости уже сидят. Налить каждому напиток, взять поднос, отнести и поставить его на стол перед лавкой. Каждый обслуженный гость платит 1 USD после доставки.'});
 }return out;
}
function release(st,s,id,reason,now){const g=s.guests[id];if(!g||!['accepted','pending'].includes(g.status))return false;delete st.economy.reservations[`service:${s.id}:${id}`];g.status=reason==='declined'?'declined':'cancelled';g.reason=reason;g.closedAt=now;st.economy.revision++;note(st,s,id,'service_cancelled','Обслуживание завершено без оплаты: '+reason,now);return true;}
export function cancelService(st,s,reason,now){if(!s||!active(s))return false;for(const id of Object.keys(s.guests))release(st,s,id,reason,now);s.status='cancelled';s.reason=reason;s.closedAt=now;const command=st.chars.heroine?.entry?.service;if(command?.id===s.id)command.cancelled=true;st.economy.revision++;return true;}
export function chooseService(st,id,action,now,source,input,dispatch){
 if(source!=='jev'||!serviceActions(st,id,now,input).some(a=>a.id===action))return false;
 const [verb,arg]=action.split('@'),[key,value,seat]=arg.split(':'),e=st.economy;
 if(verb==='money_drinks_offer'){
  const s={id:`service-${++e.next}`,performer:'heroine',status:'inviting',at:now,expiresAt:now+180000,centsPerGuest:100,consent:{at:now,source},guests:Object.fromEntries(Object.keys(st.chars).filter(k=>k!=='heroine').map(k=>[k,{status:'pending'}]))};e.services.push(s);e.revision++;
  for(const k of Object.keys(st.chars))note(st,s,k,'service_offered','Героиня предложила напитки с доставкой по 1 USD каждому; решения гостей ещё нет.',now);return true;
 }
 const s=e.services.find(s=>s.id===key);
 if(verb==='money_drinks_cancel'){if(id==='heroine')return cancelService(st,s,'performer_cancelled',now);const changed=release(st,s,id,'guest_cancelled',now);resolveService(s,now);return changed;}
 if(verb==='money_drinks_reply'){
  if(value==='decline')release(st,s,id,'declined',now);
  else{if(available(st,id)<100||dispatch('rest_lounge@'+seat)===false)return false;const p=st.chars[id];if(p.activity!=='rest_lounge'||p.place!==seat)return false;
   e.reservations[`service:${s.id}:${id}`]={payer:id,actor:id,cents:100,credit:true,service:s.id};s.guests[id]={status:'accepted',seat,consent:{at:now,source},seq:p.seq,originSeq:p.seq};e.revision++;note(st,s,id,'service_agreed','Согласился на напиток с доставкой за 1 USD; идёт садиться на лавку. Доставки ещё нет.',now);
  }
  resolveService(s,now);return true;
 }
 if(verb==='money_drinks_start'){
  if(dispatch('heroine_serve@bar')===false)return false;const p=st.chars.heroine;if(p.activity!=='heroine_serve'||p.place!=='bar')return false;
  s.status='running';s.seq=p.seq;s.startedAt=now;s.expiresAt=now+300000;s.recipients=Object.entries(s.guests).filter(([,g])=>g.status==='accepted').map(([id,g])=>({id,seat:g.seat}));p.entry.service={id:s.id,recipients:s.recipients,durations:input.durations};e.revision++;return true;
 }return false;
}
export function observeServices(st,cap,now){let changed=false;
 for(const s of st.economy.services.filter(active)){
  for(const [id,g]of Object.entries(s.guests))if(g.status==='accepted'&&(st.chars[id]?.seq!==g.seq||st.chars[id]?.place!==g.seat||!['rest_lounge','wait'].includes(st.chars[id]?.activity)))changed=release(st,s,id,'guest_left',now)||changed;
  resolveService(s,now);if(s.status!=='running')continue;
  if(s.expiresAt<=now){changed=cancelService(st,s,'expired',now)||changed;continue;}
  const p=st.chars.heroine,a=cap?.actors?.heroine;
  if(p.seq!==s.seq||p.activity!=='heroine_serve'||p.entry?.service?.id!==s.id){changed=cancelService(st,s,'command_changed',now)||changed;continue;}
  for(const [id,g]of Object.entries(s.guests))if(g.status==='accepted'&&fresh(cap,now)&&Number.isInteger(cap.actors?.[id]?.seq)&&cap.actors[id].seq===g.seq&&!seated(st,id,g,cap,now))changed=release(st,s,id,'guest_left',now)||changed;
  if(!Object.values(s.guests).some(g=>g.status==='accepted')){changed=cancelService(st,s,'no_guests',now)||changed;continue;}
  if(!fresh(cap,now)||!a?.loaded||a.seq!==s.seq||a.activity!=='heroine_serve'||a.executionEnd?.seq!==s.seq||a.executionEnd?.outcome!=='completed'||a.executionEnd.replayed)continue;
  const w=a.serviceWitness;
  if(!w||w.version!==1||w.historyVerified!==true||w.seq!==s.seq||JSON.stringify(w.recipients)!==JSON.stringify(s.recipients)||w.id!==s.id||w.complete!==true||w.trayOnTable!==true||w.poured!==s.recipients.length){changed=cancelService(st,s,'delivery_not_observed',now)||changed;continue;}
  if(Object.entries(s.guests).some(([id,g])=>g.status==='accepted'&&!seated(st,id,g,cap,now)))continue;
  for(const {id}of s.recipients){const g=s.guests[id];if(g.status!=='accepted')continue;if(!seated(st,id,g,cap,now)||!settleService(st,s,id,now)){release(st,s,id,'delivery_unconfirmed',now);continue;}g.status='paid';g.closedAt=now;note(st,s,id,'service_paid','Напиток доставлен на подносе к лавке; оплачено 1 USD героине.',now);}
  s.status='completed';s.closedAt=now;eRevision(st);changed=true;
 }return changed;
}
const eRevision=st=>st.economy.revision++;
export function tickServices(st,now){let changed=false;for(const s of st.economy.services.filter(active)){
 if(s.expiresAt<=now){if(s.status==='inviting'&&Object.values(s.guests).some(g=>g.status==='accepted')){for(const id of Object.keys(s.guests))if(s.guests[id].status==='pending')release(st,s,id,'invitation_expired',now);s.status='reserved';s.expiresAt=now+180000;eRevision(st);changed=true;}else changed=cancelService(st,s,'expired',now)||changed;}
 else if(st.hostessMode!=='drinks'&&s.status!=='running')changed=cancelService(st,s,'mode_changed',now)||changed;
 }return changed;}

function resolveService(s,now){
 const pending=Object.values(s.guests).some(g=>g.status==='pending'),accepted=Object.values(s.guests).some(g=>g.status==='accepted');
 if(!pending&&!accepted){s.status='cancelled';s.reason='no_guests';s.closedAt=now;}
 else if(!pending&&s.status==='inviting')s.status='reserved';
}
export function serviceCommandChanged(st,id,action,now){
 for(const s of st.economy.services.filter(active)){
  const g=s.guests[id],p=st.chars[id];
  if(g?.status!=='accepted')continue;
  if(action==='continue'&&g.seq+1===p.seq&&p.place===g.seat&&['rest_lounge','wait'].includes(p.activity)){g.seq=p.seq;continue;}
  release(st,s,id,'guest_left',now);resolveService(s,now);
 }
}

// Explicit housekeeping after the whole group has physically left. No drinking
// animation, consumption or intoxication is inferred from delivery or cleanup.
export function clearDeliveredService(st,cap,places,now){
 const d=st.trayDelivery;if(!d||!fresh(cap,now)||st.chars.heroine.activity==='heroine_serve')return false;
 const actors=Object.keys(st.chars).map(id=>[id,cap.actors?.[id]]);
 if(actors.some(([id,a])=>!a?.loaded||a.seq!==st.chars[id].seq||!Number.isFinite(a.x)||!Number.isFinite(a.z)||(/^(bench[SMN]|diningChair)$/.test(a.seat||''))))return false;
 if(d.recipients.some(({id,seat})=>{const a=cap.actors[id],p=places[seat];return !a||!p||Math.hypot(a.x-p.x,a.z-p.z)<.8;}))return false;
 const s=st.economy.services.find(s=>s.id===d.id);if(s)s.clearedAt=now;
 remember(st,'heroine',{id:d.id+':cleared',event:'service_cleared',summary:'После ухода всех гостей поднос и бокалы автоматически убраны со стола. Это не подтверждает, что напитки были выпиты.'},now);
 st.trayDelivery=null;st.economy.revision++;return true;
}
