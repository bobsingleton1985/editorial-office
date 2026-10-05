import {available,price} from './economy.mjs';
import {PERFORMANCE_TERMS,canPayForPerformance} from './paid-performance.mjs';
export function livelihoodContext(st,id,actions,now){
 const e=st.economy,p=st.chars[id],enabled=e.config.enabled,money=enabled?available(st,id):null,cost=price(st,'lunch'),ids=actions.map(a=>a.id);
 const wallet=walletContext(st,id,actions,now);
 const isHeroine=id==='heroine',drinks=isHeroine&&st.hostessMode==='drinks',contracts=(e.performances||[]).filter(c=>c.performer===id&&['offered','reserved','running'].includes(c.status));
 return {wallet,enabled,hunger:p.needs.hunger,availableCents:money,mealPriceCents:cost,mealAffordable:!enabled||wallet.mealCashNeededCents<=money,mealShortfallCents:enabled?Math.max(0,wallet.mealCashNeededCents-money):0,
  earningRole:drinks?'drink_service':isHeroine?'paid_performance':'editorial_work',earningCents:drinks?100:isHeroine?PERFORMANCE_TERMS.cents:e.config.workRewardCents,
  activeEarning:drinks?(e.services||[]).filter(s=>['inviting','reserved','running'].includes(s.status)).map(s=>({id:s.id,status:s.status,centsPerGuest:100})):contracts.map(c=>({id:c.id,status:c.status,cents:c.cents})),
  availableEarningSteps:ids.filter(a=>isEarningStep(id,a,p,st)),
  ...(isHeroine&&!drinks&&enabled?{potentialCustomers:Object.keys(st.chars).filter(other=>other!==id).map(other=>({id:other,canAffordPerformance:canPayForPerformance(st,other)}))}:{}),
  explanation:drinks?'Сейчас выбран режим без танцев. Предложи всем доставку напитков по 1 USD, дождись независимых ответов и посадки согласившихся гостей. Доход появляется только после доставки подноса; ушедшие и отказавшиеся не платят. Готовый поднос остаётся на столе до ухода гостей, затем убирается автоматически.':isHeroine?'Заработок — только согласованное платное выступление. Для заработка выбирай флирт и предложение танца только с potentialCustomers.canAffordPerformance=true: сейчас у него есть свободные 3 USD после резервов. Деньги могут измениться; согласие независимо. Оплата только после полного подтверждённого исполнения. Разговор, флирт и обычные танцы бесплатны; подарок, заём и угощение не заработок.':'Ты зарабатываешь за завершённую редакционную задачу. Работа доступна только со своей незавершённой задачей или свободным сообщением в очереди; если их нет, оплачиваемой работы сейчас нет. Начало работы и ожидание не приносят оплату.',
  planning:'Сопоставляй wallet (деньги после резервов, цены/остатки, долги/сроки) с голодом и характером. Нехватка на еду/долги мотивирует заработок. Покупки/подарки/займы/заказ уменьшают деньги; будущий доход/обещания не деньги. Решение свободное с учётом сна, усталости и согласия.',
  romanceIndependent:'Заказ, подарок и голод не означают романтического согласия. Флирт может привлечь клиента без тёплых отношений; ответ и оплата независимы.'};
}
function earningPartner(st,id,action){
 const [verb,arg]=action.split('@');
 if(verb==='social_invite')return arg;
 if(verb==='social_join')return st?.social?.deferred?.[arg]?.from;
 if(verb==='social_intent')return Object.values(st?.social?.pairs||{}).find(pair=>pair.phase==='active'&&pair.members.includes(id))?.members.find(other=>other!==id);
 if(verb==='money_performance_offer')return arg?.split(':')[0];
 return null;
}
export function isEarningStep(id,action,p,st){
 if(id==='heroine'&&/^social_(invite|join)@|^social_intent@flirt$|^money_performance_offer@/.test(action)){
  if(!st||st.hostessMode==='drinks')return false;
  return canPayForPerformance(st,earningPartner(st,id,action));
 }

 if(id==='heroine')return (/^social_(invite|join)@|^social_intent@flirt$|^money_(?:performance|drinks)_(offer|start)@/.test(action)||/^money_performance_reply@.*:accept$/.test(action))||action==='continue'&&!!p.entry?.performance&&/^heroine_dance[12]$/.test(p.activity);
 return !!st?.tasks?.some(t=>t.by===id||!t.by)&&(/^work_variant@/.test(action)||action==='continue'&&p.activity==='work');
}
export function explainEarningActions(st,id,actions,now){
 const context=livelihoodContext(st,id,actions,now);if(!context.enabled)return actions;
 return actions.map(a=>{
  const spending=context.wallet.spendingChoices.find(x=>x.action===a.id);
  let note=isEarningStep(id,a.id,st.chars[id],st)?` Финансовый смысл: ${id==='heroine'?(a.id==='social_intent@flirt'?'попытка заинтересовать собеседника; флирт бесплатен, заказ и взаимность не гарантированы':'шаг к согласованному заказу; оплата только после исполнения'):'шаг к завершению оплачиваемой редакционной задачи'}. На еду не хватает ${context.mealShortfallCents/100} USD; на еду и долги ближайших суток — ${context.wallet.foodAndDueDebtGapCents/100} USD.`:'';
  if(id==='heroine'&&/^social_(invite|join)@|^social_intent@flirt$/.test(a.id)&&!isEarningStep(id,a.id,st.chars[id],st)&&st.hostessMode!=='drinks')note+=' Собеседник сейчас не может оплатить выступление; это личное общение, а не шаг к заработку.';
  if(spending)note+=` Собственный расход при исполнении/согласии: ${spending.ownCostCents/100} USD; доступный остаток после него ${spending.remainingCents/100} USD.${spending.foodAndDueDebtGapAfterCents>0?' После этого на еду и ближайшие долги не хватит '+spending.foodAndDueDebtGapAfterCents/100+' USD.':''}`;
  return note?{...a,description:a.description+note}:a;
 });
}

const DAY=86400000;
function acceptedMeal(st,id,now){return st.economy.treats.some(t=>t.to===id&&t.activity==='lunch'&&t.status==='available'&&t.expiresAt>now);}
function mealReservation(st,id){
 const p=st.chars[id];
 return Object.values(st.economy.reservations).find(r=>!r.credit&&r.actor===id&&r.activity==='lunch'&&r.seq===p.seq&&p.activity==='lunch'&&r.cents===price(st,'lunch'));
}
function expense(st,id,action,now){
 const e=st.economy,[verb,arg='']=action.split('@'),[key,value,amount]=arg.split(':');
 let cents=0,releasesPurchase=false,mealProvided=false;
 if(Object.hasOwn(e.config.prices,verb)){
  releasesPurchase=true;mealProvided=verb==='lunch';
  const sponsored=e.treats.some(t=>t.to===id&&t.activity===verb&&t.status==='available'&&t.expiresAt>now)||Object.values(e.reservations).some(r=>r.actor===id&&r.activity===verb&&r.treatId&&e.treats.some(t=>t.id===r.treatId&&t.expiresAt>now));
  cents=sponsored?0:price(st,verb);
 }else if(verb==='money_offer'&&key==='gift')cents=Number(amount);
 else if(verb==='money_treat')cents=price(st,value);
 else if(verb==='money_reply'&&value==='accept'){
  const o=e.offers.find(o=>o.id===key&&o.to===id&&o.status==='pending');
  if(o?.kind==='loan')cents=o.cents;
 }else if(verb==='money_performance_offer'&&id!=='heroine')cents=PERFORMANCE_TERMS.cents;
 else if(verb==='money_performance_reply'&&value==='accept'){
  const c=(e.performances||[]).find(c=>c.id===key&&c.payer===id&&c.status==='offered');if(c)cents=c.cents;
 }else if(verb==='money_drinks_reply'&&value==='accept'){
  const s=(e.services||[]).find(s=>s.id===key&&s.guests[id]?.status==='pending');if(s)cents=100;
 }else if(verb==='money_repay'){
  const d=e.debts.find(d=>d.id===key&&d.borrower===id&&d.remaining>0);if(d)cents=Math.min(d.remaining,available(st,id));
 }
 if(!Number.isSafeInteger(cents)||cents<0||(!cents&&!mealProvided))return null;
 const released=releasesPurchase?Object.values(e.reservations).filter(r=>!r.credit&&r.actor===id&&(r.payer||r.actor)===id).reduce((sum,r)=>sum+r.cents,0):0;
 return {action,ownCostCents:cents,releasedPurchaseCents:released,remainingCents:available(st,id)+released-cents,replacesPurchase:releasesPurchase,mealProvided,repayingDebt:verb==='money_repay'?key:null};
}
export function walletContext(st,id,actions,now){
 const e=st.economy;
 if(!e.config.enabled)return {enabled:false};
 const money=available(st,id),debts=e.debts.filter(d=>d.borrower===id&&d.remaining>0),near=debts.filter(d=>d.dueAt<=now+DAY),due=near.reduce((n,d)=>n+d.remaining,0),mealReserve=mealReservation(st,id),meal=acceptedMeal(st,id,now)||mealReserve?0:price(st,'lunch');
 const spendingChoices=actions.map(a=>expense(st,id,a.id,now)).filter(Boolean).map(x=>{
  const repaidNearDebt=near.some(d=>d.id===x.repayingDebt)?x.ownCostCents:0;
  let mealAfter=meal;
  if(x.replacesPurchase&&mealReserve&&!x.mealProvided){
   const restoredTreat=mealReserve.treatId&&e.treats.some(t=>t.id===mealReserve.treatId&&t.expiresAt>now);
   mealAfter=acceptedMeal(st,id,now)||restoredTreat?0:price(st,'lunch');
  }
  return {...x,foodAndDueDebtGapAfterCents:Math.max(0,(x.mealProvided?0:mealAfter)+due-repaidNearDebt-x.remainingCents)};
 });
 return {enabled:true,balanceCents:e.accounts[id],availableCents:money,reservedCents:e.accounts[id]-money,
  ownDebtCents:debts.reduce((n,d)=>n+d.remaining,0),dueWithinDayCents:due,overdueCents:debts.filter(d=>d.dueAt<=now).reduce((n,d)=>n+d.remaining,0),
  receivableCents:e.debts.filter(d=>d.lender===id&&d.remaining>0).reduce((n,d)=>n+d.remaining,0),
  currentMealReserved:!!mealReserve,mealCashNeededCents:meal,foodAndDueDebtGapCents:Math.max(0,meal+due-money),spendingChoices,
  note:'Расчёт последствий возможного выбора, не новая блокировка средств. Долги тебе и будущий заработок не входят в доступные деньги. Чужой кошелёк неизвестен.'};
}
