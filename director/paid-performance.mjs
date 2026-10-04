import {satisfyFlirtPerformance} from './flirt-need.mjs';
import {observePerformanceCompleted} from './relationship-core.mjs';
import {available,settlePerformance} from './economy.mjs';
import {remember} from './economy-events.mjs';
import {BENCH,SPOTS} from './layout-v79.mjs';
export const PERFORMANCE_TERMS={version:3,transitionSeconds:.4,cents:300,currency:'USD',activities:['heroine_dance1','heroine_dance2']};
export function canPayForPerformance(st,payer){return st.economy.config.enabled&&payer!=='heroine'&&!!st.chars[payer]&&available(st,payer)>=PERFORMANCE_TERMS.cents;}
const ACTIVE=new Set(['offered','reserved','running']);
const sequence=first=>first==='heroine_dance1'?['heroine_dance1','heroine_pose1','heroine_dance2','heroine_love1']:['heroine_dance2','heroine_love1','heroine_dance1','heroine_pose1'];
const fresh=(caps,now)=>Number.isFinite(caps?.at)&&caps.at<=now&&now-caps.at<=3500;
const involved=(c,id)=>c.performer===id||c.payer===id;
const freshPair=(p,id,now)=>p?.phase==='active'&&p.seconds>0&&Number.isFinite(p.lastReport)&&p.lastReport<=now&&now-p.lastReport<=3500&&p.members.includes(id);
export function ensurePerformances(st){st.economy.performances??=[];st.economy.performanceTerms=structuredClone(PERFORMANCE_TERMS);}
export function committedPerformance(st,id){return st.economy.performances.find(c=>['reserved','running'].includes(c.status)&&involved(c,id));}
export function performancePlaces(st,id){return st.economy.performances.filter(c=>['reserved','running'].includes(c.status)).flatMap(c=>[...(id!==c.payer?['benchS']:[]),...(id!==c.performer?['tv3']:[])]);}
function playable(c,input){return input?.mode!=='drinks'&&input?.ready===true&&input.music===true&&input.places?.includes('tv3')&&(input.benches?.[c.payer]?.includes('benchS'))&&c.sequence.every(x=>Number.isFinite(input.durations?.[x.activity])&&Math.abs(input.durations[x.activity]-x.duration)<.001);}
const enoughMusic=(c,input)=>input.music===true&&(input.musicMs??Infinity)>=(c.duration*1000+(input.musicLeadMs??90000));
export function performanceReplyDue(st,id,now){return st.economy.performances.find(c=>c.status==='offered'&&c.to===id&&c.expiresAt>now&&c.consideredAt==null);}
export function consideredPerformanceReply(st,id,now){let changed=false;for(const c of st.economy.performances)if(c.status==='offered'&&c.to===id&&c.expiresAt>now&&c.consideredAt==null){c.consideredAt=now;changed=true;}return changed;}
function seated(st,c,caps,now){const p=st.chars[c.payer],a=caps?.actors?.[c.payer];return fresh(caps,now)&&p?.place===c.seat&&['rest_lounge','wait'].includes(p.activity)&&a?.loaded&&(a.seq===p.seq||p.entry?.action==='continue'&&Number.isInteger(a.seq)&&a.seq<p.seq)&&a.mode==='seated'&&a.seat===c.seat&&a.executing===true;}
function note(st,c,event,summary,now){for(const id of [c.payer,c.performer])remember(st,id,{id:`${c.id}:${event}:${id}`,event,partner:id===c.payer?c.performer:c.payer,summary},now);}
function danceBubble(st,id,to,mark,now){const p=st.chars[id];p.entry={...(p.entry||{}),talk:{at:now,to,icon:'dance',mark}};}
export function performanceContext(st,id){return {performanceTerms:st.economy.performanceTerms,performances:st.economy.performances.filter(c=>involved(c,id)).slice(-20)};}
export function performanceActions(st,id,pair,now,input){
 const e=st.economy;if(!e.config.enabled)return [];const out=[],other=freshPair(pair,id,now)?pair.members.find(x=>x!==id):null;
 if(other&&(id==='heroine'||other==='heroine')&&!e.performances.some(c=>ACTIVE.has(c.status)&&(involved(c,id)||involved(c,other)))&&input?.mode!=='drinks'&&input?.ready&&input.places?.length){
  const payer=id==='heroine'?other:id;
  for(const first of PERFORMANCE_TERMS.activities)if(input.benches?.[payer]?.includes('benchS')&&sequence(first).every(x=>Number.isFinite(input.durations?.[x])&&input.durations[x]>0)&&canPayForPerformance(st,payer))out.push({id:`money_performance_offer@${other}:${first}`,description:`Предложить целое выступление героини за 3 USD, порядок ${first.endsWith('1')?1:2}: два танца, игривая поза и жест любви. Другой участник решит самостоятельно. Музыка включится автоматически; зритель садится на лавку; героиня выступает перед телевизором лицом к нему. Оплата один раз после всего выступления; обычные танцы бесплатны. Интерес к флирту, собственное отношение к героине и недавняя взаимность могут мотивировать заказ; деньги, дела, отказы и недавний просмотр учитывай самостоятельно.`});
 }
 for(const c of e.performances.filter(c=>involved(c,id)&&ACTIVE.has(c.status))){
  out.push({id:`money_performance_cancel@${c.id}`,description:'Отменить выступление; 3 USD из резерва вернутся зрителю.'});
  if(c.status==='offered'&&c.to===id&&c.expiresAt>now){
   out.push({id:`money_performance_reply@${c.id}:decline`,description:'Отказаться от выступления за 3 USD.'});
   if(input?.mode!=='drinks'&&available(st,c.payer)>=c.cents)out.push({id:`money_performance_reply@${c.id}:accept`,description:`Согласиться ${id===c.payer?'оплатить целое выступление и смотреть его с лавки':'исполнить целое выступление для сидящего на лавке зрителя'} за 3 USD. Сумма резервируется до завершения. Исполнитель дождётся свободного места; музыка включится автоматически. Полностью просмотренное выступление удовлетворит интерес к флирту; решение учитывает твои чувства, бюджет и другие потребности.`});
  }
  if(c.status==='reserved'&&c.expiresAt>now&&playable(c,input)&&input.arrived?.[id]===true){
   if(id===c.payer&&!seated(st,c,input.capabilities,now))for(const seat of input.benches?.[id]||[])out.push({id:`money_performance_watch@${c.id}:${seat}`,description:`Сесть на ${seat} и смотреть согласованное выступление героини. Ты можешь уйти или отменить договорённость.`});
   if(id===c.performer&&seated(st,c,input.capabilities,now))for(const place of input.places)out.push({id:`money_performance_start@${c.id}:${place}`,description:`Начать выступление перед телевизором лицом к ${c.payer}, который уже сидит на ${c.seat}. 3 USD за все части вместе после полного исполнения.`});
  }
 }
 return out;
}
export function cancelPerformance(st,c,reason,now){if(!c||!ACTIVE.has(c.status))return false;delete st.economy.reservations['performance:'+c.id];c.status=reason==='declined'?'declined':'cancelled';c.reason=reason;c.closedAt=now;st.economy.revision++;note(st,c,'performance_cancelled',`Выступление завершено без оплаты: ${reason}.`,now);return true;}
export function choosePerformance(st,id,action,pair,now,source,input){
 if(source!=='jev'||!performanceActions(st,id,pair,now,input).some(a=>a.id===action))return false;
 const e=st.economy,[verb,arg]=action.split('@'),[key,value]=arg.split(':');
 if(verb==='money_performance_offer'){
  const clips=sequence(value).map(activity=>({activity,duration:input.durations[activity]}));
  const c={id:`performance-${++e.next}`,from:id,to:key,performer:'heroine',payer:id==='heroine'?key:id,activity:value,sequence:clips,transitionSeconds:PERFORMANCE_TERMS.transitionSeconds,duration:clips.reduce((n,x)=>n+x.duration,0)+PERFORMANCE_TERMS.transitionSeconds*(clips.length-1),cents:300,currency:'USD',status:'offered',at:now,expiresAt:now+120000,consent:{[id]:{at:now,source}}};e.performances.push(c);e.revision++;danceBubble(st,id,key,'q',now);note(st,c,'performance_offered','Предложено целое выступление за 3 USD; ответа ещё нет.',now);return true;
 }
 const c=e.performances.find(x=>x.id===key);
 if(verb==='money_performance_cancel')return cancelPerformance(st,c,'participant_cancelled',now);
 if(verb==='money_performance_reply'){
  if(value==='decline'){const cancelled=cancelPerformance(st,c,'declined',now);if(cancelled)danceBubble(st,id,c.from,'no',now);return cancelled;}if(available(st,c.payer)<c.cents)return false;
  e.reservations['performance:'+c.id]={payer:c.payer,actor:c.payer,cents:300,credit:true,performance:c.id};c.consent[id]={at:now,source};c.status='reserved';c.seat='benchS';c.place='tv3';c.acceptedAt=now;c.expiresAt=now+180000;e.revision++;
  danceBubble(st,id,c.from,'yes',now);note(st,c,'performance_agreed','Оба согласились на целое выступление за 3 USD. Зритель ещё должен сесть на лавку.',now);return true;
 }return false;
}
export function startPerformance(st,id,action,pair,now,source,input,dispatch){
 if(!performanceActions(st,id,pair,now,input).some(a=>a.id===action))return false;
 if(source!=='jev'&&source!=='performance_executor')return false;
 const [verb,arg]=action.split('@'),[key,place]=arg.split(':'),c=st.economy.performances.find(x=>x.id===key);
 if(source==='performance_executor'&&(!c.consent[c.payer]||!c.consent[c.performer]))return false;
 if(verb==='money_performance_watch'){
  if(dispatch('rest_lounge@'+place)===false)return false;const p=st.chars[id];if(p.place!==place||p.activity!=='rest_lounge')return false;c.seat=place;c.audienceSeq=p.seq;c.audienceDispatchedAt=now;st.economy.revision++;return true;
 }
 if(verb!=='money_performance_start')return false;
 if(dispatch(`${c.activity}@${place}`)===false)return false;
 const p=st.chars[id];if(p.activity!==c.activity||p.place!==place)return false;
 c.status='running';c.startedAt=now;c.lastAudienceAt=now;c.expiresAt=now+Math.max(300000,c.duration*1000+120000);c.seq=p.seq;c.place=place;
 const target=BENCH[c.seat.slice(5)],spot=SPOTS[place];
 p.entry.performance={id:c.id,activity:c.activity,sequence:c.sequence,transitionSeconds:c.transitionSeconds,duration:c.duration,face:{x:target.x,z:target.z},heading:Math.atan2(target.x-spot.x,target.z-spot.z)};
 p.activityUntil=p.busyUntil=Math.max(p.busyUntil,now+(c.duration+60)*1000);st.economy.revision++;note(st,c,'performance_started','Начат подход к площадке и выступление для сидящего зрителя; оплата ожидает полного исполнения.',now);return true;
}
export function observePerformances(st,caps,now){let changed=false;for(const c of st.economy.performances.filter(c=>c.status==='running')){
 const p=st.chars[c.performer],a=caps?.actors?.[c.performer];let reason=null;
 if(c.expiresAt<=now)reason='expired';
 else if(!p||p.seq!==c.seq||p.activity!==c.activity||p.entry?.performance?.id!==c.id)reason='command_changed';
 else if(!seated(st,c,caps,now))reason='audience_not_seated';
 else if(now-c.lastAudienceAt>3500)reason='audience_observation_gap';
 if(reason){changed=cancelPerformance(st,c,reason,now)||changed;continue;}c.lastAudienceAt=now;
 if(!fresh(caps,now)||!a?.loaded||a.seq!==c.seq||a.activity!==c.activity||a.moneyWitness!==1||a.executionEnd?.seq!==c.seq||a.executionEnd.outcome!=='completed')continue;
 const w=a.performanceWitness;
 if(a.executionEnd.replayed||w?.id!==c.id||w.complete!==true||w.activity!==c.activity||Math.abs(w.duration-c.duration)>.001||!(w.renderedMs>=c.duration*1000-80)||now-c.startedAt<c.duration*1000-80){changed=cancelPerformance(st,c,'execution_not_fully_observed',now)||changed;continue;}
 if(settlePerformance(st,c,now)){c.status='paid';c.closedAt=now;satisfyFlirtPerformance(st,c,now);observePerformanceCompleted(st,c,now);changed=true;note(st,c,'performance_paid','Выступление исполнено целиком. Зритель оплатил 3 USD героине.',now);}else changed=cancelPerformance(st,c,'reservation_unavailable',now)||changed;
 }return changed;}
export function tickPerformances(st,now){let changed=false;for(const c of st.economy.performances)if(ACTIVE.has(c.status)&&(c.expiresAt<=now||st.hostessMode==='drinks'&&c.status!=='running'))changed=cancelPerformance(st,c,c.expiresAt<=now?'expired':'mode_changed',now)||changed;return changed;}

// Mutual consent authorizes navigation and playback; renderer feedback gates the dance.
export function advancePerformances(st,now,input,dispatch,prepareMusic=()=>false){
 let changed=false;
 for(const c of st.economy.performances.filter(c=>c.status==='reserved')){
  if(c.expiresAt<=now)continue;
  if(!c.consent?.[c.payer]||!c.consent?.[c.performer])continue;
  if([c.payer,c.performer].some(id=>!st.chars[id]||st.chars[id].sleep||st.chars[id].sleepPending)){
   changed=cancelPerformance(st,c,'participant_sleep',now)||changed;continue;
  }
  const payer=st.chars[c.payer];
 if(c.audienceDispatchedAt!=null&&payer.seq!==c.audienceSeq){changed=cancelPerformance(st,c,'audience_command_changed',now)||changed;continue;}
  if(!fresh(input.capabilities,now)||!input.ready)continue;
  if(!enoughMusic(c,input)){if(prepareMusic(c.duration*1000+(input.musicLeadMs??90000))!==false)changed=true;continue;}
  if(!playable(c,input))continue;
  if(seated(st,c,input.capabilities,now)){
   changed=startPerformance(st,c.performer,`money_performance_start@${c.id}:tv3`,null,now,'performance_executor',input,a=>dispatch(c.performer,a))||changed;
  }else if(c.audienceDispatchedAt==null){
   changed=startPerformance(st,c.payer,`money_performance_watch@${c.id}:benchS`,null,now,'performance_executor',input,a=>dispatch(c.payer,a))||changed;
  }
 }
 return changed;
}
