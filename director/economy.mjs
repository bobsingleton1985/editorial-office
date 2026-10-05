import {usesConsumption} from './consumption.mjs';
import {remember,DAY,observeFact} from './economy-events.mjs';
export const UNCONFIGURED_ECONOMY={enabled:false,currency:'USD',startingCents:0,workRewardCents:0,prices:{},offerAmounts:[],loanDays:3};
export function validateEconomy(config) {
  if(!config||!config.prices||Array.isArray(config.prices)||typeof config.prices!=='object'||!Array.isArray(config.offerAmounts)||typeof config.enabled!=='boolean'||config.currency!=='USD')throw Error('Invalid economy config');
  for(const n of [config.startingCents,config.workRewardCents,...Object.values(config.prices||{}),...(config.offerAmounts||[])])if(!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('Invalid cents');
  if(!Number.isInteger(config.loanDays)||config.loanDays<1||config.loanDays>365)throw Error('Invalid loan term');
  return config;
}
export function ensureEconomy(st,config=UNCONFIGURED_ECONOMY,now=Date.now()) {
  validateEconomy(config);
  st.economy??={version:1,revision:0,config:structuredClone(config),accounts:{},ledger:[],offers:[],debts:[],receipts:{},reservations:{},next:0};
  const e=st.economy;e.treats??=[];
  if(!e.config.enabled&&config.enabled&&!e.ledger.length)e.config=structuredClone(config);
  // Owner-authorized price migration, applied once; existing promises/reserves keep their price.
  if(config.prices.smoke===5&&config.prices.smoke_coffee===105&&!e.migrations?.['smoking-20261004-v01']){
    e.migrations??={};
    e.config.prices.smoke=5;e.config.prices.smoke_coffee=105;e.migrations['smoking-20261004-v01']={at:now};e.revision++;
  }
  // Configuration is pinned to the persisted world; changing prices requires an explicit migration.
  if(e.config.enabled)for(const id of Object.keys(st.chars))if(!Object.hasOwn(e.accounts,id)){
    e.accounts[id]=0;post(st,`opening:${id}`,null,id,e.config.startingCents,'opening',now);
  }
  return e;
}
function post(st,key,from,to,cents,kind,now,extra={}) {
  const e=st.economy;if(Object.hasOwn(e.receipts,key))return e.receipts[key];
  if(!Number.isSafeInteger(cents)||cents<0||from===to||from&&!Object.hasOwn(e.accounts,from)||to&&!Object.hasOwn(e.accounts,to))return false;
  if(from&&(!Number.isSafeInteger(e.accounts[from])||!Number.isSafeInteger(e.accounts[from]-cents))||to&&(!Number.isSafeInteger(e.accounts[to])||!Number.isSafeInteger(e.accounts[to]+cents)))return false;
  if(from&&available(st,from)<cents)return false;
  if(from)e.accounts[from]-=cents;if(to)e.accounts[to]+=cents;
  const tx={id:key,from,to,cents,kind,at:now,...extra};e.ledger.push(tx);e.receipts[key]=tx;e.revision++;
  for(const id of [from,to].filter(Boolean))remember(st,id,{id:`transaction:${key}:${id}`,event:'money_'+kind,partner:id===from?to:from,cents,summary:`${({bonus:'Премия от владельца',drink_service:'Доставка напитка',performance:'Оплата согласованного танца',opening:'Стартовый запас',work:'Заработок за выполненную работу',purchase:'Покупка',treat_purchase:'Угощение коллеги',gift:'Подарок',loan:'Заём',repayment:'Возврат долга'})[kind]||kind}: ${id===from?'−':'+'}${(cents/100).toFixed(2)} USD.`},now,{important:kind!=='purchase'});
  return tx;
}
export function available(st,id){const e=st.economy;return (e.accounts[id]||0)-Object.values(e.reservations).filter(r=>(r.payer||r.actor)===id).reduce((n,r)=>n+r.cents,0);}
const purchaseKind=activity=>activity==='heroine_coffee'?'coffee':activity;
export function price(st,activity){return st.economy?.config.enabled?(st.economy.config.prices[purchaseKind(activity)]??0):0;}
export function canAfford(st,id,activity,now=Date.now()) {return price(st,activity)<=available(st,id)||st.economy.treats.some(t=>t.to===id&&t.activity===purchaseKind(activity)&&t.status==='available'&&t.expiresAt>now);}
export function reservePurchase(st,id,activity,seq,now){
  const e=st.economy;let cents=price(st,activity);if(!cents)return true;
  const key=`${id}:${seq}`;if(e.receipts['purchase:'+key])return true;if(e.reservations[key])return e.reservations[key].activity===activity;
  const treat=e.treats.find(t=>t.to===id&&t.activity===purchaseKind(activity)&&t.status==='available'&&t.expiresAt>now);
  if(treat)cents=treat.cents;
  if(!treat&&available(st,id)<cents)return false;
  if(treat){delete e.reservations['credit:'+treat.id];treat.status='reserved';}
  e.reservations[`${id}:${seq}`]={actor:id,payer:treat?.from||id,treatId:treat?.id||null,activity,seq,cents,at:now};e.revision++;return true;
}
function releaseReservation(e,key,r,now){
  delete e.reservations[key];const t=e.treats.find(t=>t.id===r.treatId);
  if(t&&t.expiresAt>now){t.status='available';e.reservations['credit:'+t.id]={actor:t.from,payer:t.from,cents:t.cents,credit:true};}
  else if(t)t.status='expired';
  e.revision++;
}
export function cancelPurchases(st,id,now=Date.now()){const e=st.economy;for(const [k,r]of Object.entries(e.reservations))if(!r.credit&&r.actor===id)releaseReservation(e,k,r,now);}
export function confirmPurchases(st,capabilities,now){
  const e=st.economy;let changed=false;
  for(const [key,r] of Object.entries(e.reservations)){
    if(r.credit)continue;
    const p=st.chars[r.actor],a=capabilities?.actors?.[r.actor];
    if(!p||p.seq!==r.seq||p.activity!==r.activity){releaseReservation(e,key,r,now);changed=true;continue;}
    if(['smoke','smoke_coffee'].includes(r.activity)&&!(a?.smoking?.seq===r.seq&&a.smoking.cig===true))continue;
    if(usesConsumption(r.actor,r.activity)&&!(p.consumption?.seq===r.seq&&p.consumption.consumedMs>0))continue;
    if(!Number.isFinite(capabilities?.at)||capabilities.at>now||a?.moneyWitness!==1||!a?.loaded||(!a.executing&&!usesConsumption(r.actor,r.activity))||a.seq!==r.seq||a.activity!==r.activity||now-capabilities.at>3500)continue;
    delete e.reservations[key];
    if(post(st,'purchase:'+key,r.payer||r.actor,null,r.cents,r.treatId?'treat_purchase':'purchase',now,{activity:r.activity,beneficiary:r.actor})){
      changed=true;if(r.treatId){const t=e.treats.find(t=>t.id===r.treatId);t.status='used';t.usedAt=now;remember(st,r.actor,{id:'treat:'+key,event:'treated',partner:r.payer,summary:`${r.payer} оплатил твоё угощение: ${r.cents/100} USD.`},now,{important:true});observedMoney(st,r.payer,r.actor,'gift_accepted','treat:'+key,now);}
    }
  }return changed;
}
export function rewardWork(st,id,task,now){
  if(!st.economy.config.enabled||!(task.done_min>=task.need_min)||!(task.need_min>0))return false;
  return post(st,`work:${task.id}`,null,id,st.economy.config.workRewardCents,'work',now,{task:task.id});
}
export function moneyContext(st,id){
  const e=st.economy;return {enabled:e.config.enabled,currency:e.config.currency,balance:e.config.enabled?e.accounts[id]:null,available:e.config.enabled?available(st,id):null,
    treats:e.treats.filter(t=>t.from===id||t.to===id),prices:e.config.prices,workRewardCents:e.config.workRewardCents,
    transactions:e.ledger.filter(t=>t.from===id||t.to===id).slice(-40),offers:e.offers.filter(o=>(o.from===id||o.to===id)&&o.status==='pending'),debts:e.debts.filter(d=>d.lender===id||d.borrower===id)};
}
export function moneyActions(st,id,pair,now,names={}) {
  const e=st.economy;if(!e.config.enabled)return [];
  const out=[],other=pair?.phase==='active'&&pair.seconds>0&&Number.isFinite(pair.lastReport)&&now>=pair.lastReport&&now-pair.lastReport<=3500&&pair.members.includes(id)?pair.members.find(x=>x!==id):null;
  if(other){for(const [activity,cents] of Object.entries(e.config.prices))if(cents>0&&available(st,id)>=cents&&!e.offers.some(o=>o.kind==='treat'&&o.from===id&&o.to===other&&o.activity===activity&&o.status==='pending'))out.push({id:`money_treat@${other}:${activity}`,description:`Предложить оплатить ${names[other]||other} ${activity==='lunch'?'еду':activity==='whisky'?'напиток':activity}: ${cents/100} USD. Получатель сам решит, принять ли угощение и когда воспользоваться им.`});
  for(const cents of e.config.offerAmounts){
    if(cents>0&&available(st,id)>=cents&&!e.offers.some(o=>o.status==='pending'&&o.from===id&&o.to===other&&o.kind==='gift'))out.push({id:`money_offer@gift:${other}:${cents}`,description:`Предложить ${names[other]||other} подарок ${(cents/100).toFixed(2)} USD. Он самостоятельно примет или откажется; это не покупает его расположение.`});
    if(cents>0&&!e.offers.some(o=>o.status==='pending'&&o.from===id&&o.to===other&&o.kind==='loan'))out.push({id:`money_offer@loan:${other}:${cents}`,description:`Попросить у ${names[other]||other} взаймы ${(cents/100).toFixed(2)} USD на ${e.config.loanDays} календарных дней. Его баланс тебе неизвестен; он решит сам.`});
  }
  for(const o of e.offers.filter(o=>o.to===id&&o.from===other&&o.status==='pending'&&o.expiresAt>now))for(const answer of ['accept','decline']){
    if(o.kind==='extension'&&!e.debts.some(d=>d.id===o.debt&&d.revision===o.debtRevision&&d.remaining>0))continue;
    const payer=['gift','treat'].includes(o.kind)?o.from:id;
    if(answer==='accept'&&o.kind==='loan'&&available(st,id)<o.cents)continue;
    out.push({id:`money_reply@${o.id}:${answer}`,description:`${answer==='accept'?'Принять':'Отклонить'} ${o.kind==='gift'?'подарок':o.kind==='treat'?'угощение':o.kind==='extension'?'просьбу об отсрочке':'просьбу о займе'} от ${names[o.from]||o.from}: ${(o.cents/100).toFixed(2)} USD${o.kind==='loan'?`, вернуть через ${e.config.loanDays} дней`:o.kind==='extension'?`, новый срок ${new Date(o.proposedDueAt).toISOString()}`:''}.`});
  }}
  for(const d of e.debts.filter(d=>d.remaining>0)){
    if(d.borrower===id&&other===d.lender&&!e.offers.some(o=>o.kind==='extension'&&o.debt===d.id&&o.status==='pending'))out.push({id:`money_extend@${d.id}:${d.revision}`,description:`Попросить ${names[d.lender]||d.lender} отложить возврат долга на ${e.config.loanDays} дней после текущего срока или сегодняшнего дня. Он решит самостоятельно.`});
    if(d.lender===id&&other===d.borrower&&(!d.lastReminderAt||now-d.lastReminderAt>=DAY))out.push({id:`money_remind@${d.id}:${d.revision}`,description:`Напомнить ${names[d.borrower]||d.borrower} о долге ${d.remaining/100} USD и договорённом сроке. Не приписывать ему причины задержки.`});
    if(d.borrower===id&&available(st,id)>0)out.push({id:`money_repay@${d.id}:${d.revision}`,description:`Вернуть ${names[d.lender]||d.lender} ${Math.min(d.remaining,available(st,id))/100} USD долга. Осталось ${d.remaining/100} USD.`});
    if(d.lender===id)out.push({id:`money_forgive@${d.id}:${d.revision}`,description:`Добровольно простить ${names[d.borrower]||d.borrower} оставшиеся ${d.remaining/100} USD долга.`});
  }return out;
}
function observedMoney(st,from,to,kind,key,now){
  const id=kind==='loan_forgiven'?from:to,partner=kind==='loan_forgiven'?to:from;
  observeFact(st,id,partner,{id:key+':'+id,kind,actor:partner,observedAt:now,source:'agreed_money_ledger',summary:{gift_accepted:'Коллега сделал добровольный подарок, который ты принял.',loan_repaid:'Коллега вернул тебе долг.',loan_forgiven:'Коллега простил твой долг.',loan_overdue:'Наступил срок возврата, долг ещё не возвращён. Причина неизвестна.'}[kind]});
}
export function chooseMoney(st,id,action,pair,now,source){
  if(!['jev','qwen'].includes(source)||!moneyActions(st,id,pair,now).some(a=>a.id===action))return false;
  const e=st.economy,[verb,arg]=action.split('@'),parts=arg.split(':');
  if(verb==='money_offer'){
    const [kind,to,amount]=parts,o={id:`offer-${++e.next}`,kind,from:id,to,cents:+amount,at:now,expiresAt:now+DAY,status:'pending'};e.offers.push(o);
    for(const actor of [id,to])remember(st,actor,{id:o.id+':'+actor,event:'money_offer',partner:actor===id?to:id,summary:`${id} ${kind==='gift'?'предложил подарок':'попросил взаймы'} ${+amount/100} USD.`},now,{important:true});
  } else if(verb==='money_treat'){
    const [to,activity]=parts;e.offers.push({id:`offer-${++e.next}`,kind:'treat',from:id,to,activity,cents:e.config.prices[activity],at:now,expiresAt:now+DAY,status:'pending'});
  } else if(verb==='money_extend'){
    const d=e.debts.find(d=>d.id===parts[0]);e.offers.push({id:`offer-${++e.next}`,kind:'extension',from:id,to:d.lender,cents:d.remaining,debt:d.id,debtRevision:d.revision,proposedDueAt:Math.max(d.dueAt,now)+e.config.loanDays*DAY,at:now,expiresAt:now+DAY,status:'pending'});
  } else if(verb==='money_remind'){
    const d=e.debts.find(d=>d.id===parts[0]);d.lastReminderAt=now;
    for(const actor of [d.lender,d.borrower])remember(st,actor,{event:'debt_reminder',partner:actor===d.lender?d.borrower:d.lender,summary:`${d.lender} напомнил ${d.borrower} о долге ${d.remaining/100} USD.`},now,{important:true});
  } else if(verb==='money_reply'){
    const o=e.offers.find(o=>o.id===parts[0]);if(parts[1]==='decline'){o.status='declined';o.answeredAt=now;for(const actor of [o.from,o.to])remember(st,actor,{id:o.id+':declined:'+actor,event:'money_offer_declined',partner:actor===o.from?o.to:o.from,summary:`${o.to} отклонил ${o.kind==='gift'?'подарок':o.kind==='treat'?'угощение':o.kind==='extension'?'просьбу об отсрочке':'просьбу о займе'}. Причина не сообщена.`},now,{important:true});}
    else if(o.kind==='treat'){
      if(available(st,o.from)<o.cents)return false;
      e.treats.push({id:o.id,from:o.from,to:o.to,activity:o.activity,cents:o.cents,at:now,expiresAt:now+DAY,status:'available'});
      e.reservations['credit:'+o.id]={actor:o.from,payer:o.from,cents:o.cents,credit:true};o.status='accepted';o.answeredAt=now;
      for(const actor of [o.from,o.to])remember(st,actor,{id:o.id+':treat:'+actor,event:'treat_accepted',partner:actor===o.from?o.to:o.from,summary:`${o.to} принял предложение ${o.from} оплатить угощение. Покупка ещё не совершена.`},now,{important:true});
    } else if(o.kind==='extension'){
      const d=e.debts.find(d=>d.id===o.debt);if(!d||d.remaining<=0||d.revision!==o.debtRevision)return false;
      d.history??=[];d.history.push({event:'extension',before:d.dueAt,after:o.proposedDueAt,at:now,agreedBy:[o.from,o.to]});d.dueAt=o.proposedDueAt;d.revision++;d.overdueNotified=false;o.status='accepted';o.answeredAt=now;
      for(const actor of [o.from,o.to])remember(st,actor,{id:o.id+':extended:'+actor,event:'debt_extended',partner:actor===o.from?o.to:o.from,summary:`Согласована отсрочка возврата долга ${d.remaining/100} USD до ${new Date(d.dueAt).toISOString()}.`},now,{important:true});
    } else {const from=o.kind==='gift'?o.from:id,to=o.kind==='gift'?id:o.from;
      if(!post(st,o.id,from,to,o.cents,o.kind,now))return false;o.status='accepted';o.answeredAt=now;
      if(o.kind==='loan')e.debts.push({id:`debt-${o.id}`,lender:from,borrower:to,principal:o.cents,remaining:o.cents,at:now,dueAt:now+e.config.loanDays*DAY,revision:0,overdueNotified:false});
      else observedMoney(st,from,to,'gift_accepted',o.id,now);
    }
  } else {
    const d=e.debts.find(d=>d.id===parts[0]),cents=verb==='money_forgive'?d.remaining:Math.min(d.remaining,available(st,id));
    const key=`${verb}:${d.id}:${d.revision}`;
    if(verb==='money_repay'&&!post(st,key,id,d.lender,cents,'repayment',now,{debt:d.id}))return false;
    if(verb==='money_forgive')for(const actor of [d.lender,d.borrower])remember(st,actor,{id:key+':'+actor,event:'debt_forgiven',partner:actor===d.lender?d.borrower:d.lender,cents,summary:`Прощён долг ${cents/100} USD.`},now,{important:true});
    d.remaining-=cents;d.revision++;if(d.remaining===0){d.closedAt=now;observedMoney(st,d.borrower,d.lender,verb==='money_forgive'?'loan_forgiven':'loan_repaid',key,now);}
  }
  e.revision++;return true;
}
export function tickEconomy(st,now){
  const e=st.economy;
  for(const t of e.treats)if(t.status==='available'&&t.expiresAt<=now){t.status='expired';delete e.reservations['credit:'+t.id];e.revision++;}
  for(const o of e.offers)if(o.status==='pending'&&o.expiresAt<=now){o.status='expired';e.revision++;}
  for(const d of e.debts)if(d.remaining>0&&d.dueAt<=now&&!d.overdueNotified){d.overdueNotified=true;e.revision++;
    // Only the creditor can observe an overdue obligation of this borrower.
    observeFact(st,d.lender,d.borrower,{id:`overdue:${d.id}:${d.dueAt}`,kind:'loan_overdue',actor:d.borrower,observedAt:now,source:'agreed_money_ledger',summary:'Срок возврата прошёл, долг не возвращён. Причина неизвестна.'});
    for(const id of [d.lender,d.borrower])remember(st,id,{id:`overdue:${d.id}:${d.dueAt}:${id}`,event:'loan_overdue',summary:`Прошёл срок возврата ${d.remaining/100} USD.`},now,{important:true});
  }
}

export function canReplacePurchase(st,id,activity,now=Date.now()){
 const released=Object.values(st.economy.reservations).filter(r=>!r.credit&&r.actor===id&&(r.payer||r.actor)===id).reduce((n,r)=>n+r.cents,0);
 const restoredTreat=Object.values(st.economy.reservations).some(r=>r.actor===id&&r.activity===activity&&r.treatId&&st.economy.treats.some(t=>t.id===r.treatId&&t.expiresAt>now));
 return restoredTreat||canAfford(st,id,activity,now)||price(st,activity)<=available(st,id)+released;
}

// A performance reserve shares the same availability/ledger, but is never a purchase.
export function settlePerformance(st,c,now){
 const e=st.economy,key='performance:'+c.id,r=e.reservations[key];
 if(e.receipts[key])return e.receipts[key];
 if(c.status!=='running'||c.performer!=='heroine'||c.payer===c.performer||c.cents!==e.performanceTerms?.cents||!c.consent?.[c.payer]||!c.consent?.[c.performer]||!r||r.performance!==c.id||r.payer!==c.payer||r.cents!==c.cents||!r.credit)return false;
 delete e.reservations[key];
 const result=post(st,key,c.payer,c.performer,c.cents,'performance',now,{activity:c.activity,performance:c.id});
 if(!result)e.reservations[key]=r;
 return result;
}

export function settleService(st,s,id,now){
 const e=st.economy,key=`service:${s.id}:${id}`,r=e.reservations[key],g=s.guests[id];
 if(e.receipts[key])return e.receipts[key];
 if(s.status!=='running'||s.performer!=='heroine'||id==='heroine'||s.centsPerGuest!==100||!s.consent||g?.status!=='accepted'||!g.consent||!r||r.service!==s.id||r.payer!==id||r.cents!==100||!r.credit)return false;
 delete e.reservations[key];const result=post(st,key,id,'heroine',100,'drink_service',now,{service:s.id});if(!result)e.reservations[key]=r;return result;
}

// Only the trusted local owner queue calls this; it is not a Jev money action.
export function grantOwnerBonus(st,command,now){
 const e=st.economy;
 if(!command||command.type!=='owner_bonus'||command.version!==1||typeof command.id!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/).test(command.id))throw Error('invalid_command');
 if(!Number.isSafeInteger(command.cents)||command.cents<=0)throw Error('invalid_amount');
 if(typeof command.target!=='string'||!(/^[a-z][a-z0-9_]{0,30}$/).test(command.target))throw Error('invalid_target');
 const fingerprint=JSON.stringify([command.target,command.cents]);
 const old=e?.ownerBonusReceipts&&Object.hasOwn(e.ownerBonusReceipts,command.id)?e.ownerBonusReceipts[command.id]:null;
 if(old){if(old.fingerprint!==fingerprint)throw Error('command_id_conflict');return old;}
 if(!e?.config.enabled)throw Error('economy_disabled');
 const recipients=command.target==='all'?Object.keys(st.chars).sort():[command.target];
 if(!recipients.length||!Number.isSafeInteger(command.cents*recipients.length))throw Error('amount_overflow');
 // Validate the entire batch before the first posting; no partial all-staff award.
 for(const id of recipients){
  if(!Object.hasOwn(st.chars,id)||!Object.hasOwn(e.accounts,id))throw Error('unknown_recipient');
  if(!Number.isSafeInteger(e.accounts[id])||!Number.isSafeInteger(e.accounts[id]+command.cents))throw Error('balance_overflow');
  if(Object.hasOwn(e.receipts,`owner_bonus:${command.id}:${id}`))throw Error('incomplete_receipt');
 }
 for(const id of recipients)post(st,`owner_bonus:${command.id}:${id}`,null,id,command.cents,'bonus',now,{ownerCommand:command.id,funding:'owner'});
 const receipt={id:command.id,status:'applied',type:'owner_bonus',fingerprint,recipients,centsEach:command.cents,totalCents:command.cents*recipients.length,at:now};
 e.ownerBonusReceipts??={};e.ownerBonusReceipts[command.id]=receipt;
 return receipt;
}
