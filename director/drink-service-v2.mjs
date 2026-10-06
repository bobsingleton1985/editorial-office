import {available} from './economy.mjs';
import {remember} from './economy-events.mjs';

export const SERVICE_TERMS = Object.freeze({version:2,centsPerGuest:200,newsroomCents:150,heroineCents:50});
const live = s => ['inviting','reserved','running'].includes(s.status);
const key = (s,id) => `service:${s.id}:${id}`;
const name = (input,id) => input.names?.[id] || id;
const reserve = (st,s,id) => {
  const payer=s.payment==='treat'?s.initiator:id;
  st.economy.reservations[key(s,id)]={payer,actor:id,cents:200,credit:true,service:s.id};
};
function note(st,s,event,text,now) {
  for(const id of new Set(['heroine',s.initiator,...Object.keys(s.guests)]))
    remember(st,id,{id:`${s.id}:${event}:${id}`,event,service:s.id,summary:text},now);
}
function say(st,s,id,targets,kind,mark,now,input) {
  const p=st.chars[id],to=[...new Set(targets)].filter(k=>k!==id&&st.chars[k]);
  if(!to.length)return;
  p.entry={...(p.entry||{}),talk:{at:now,until:now+10000,to:to[0],targets:to,icon:'whisky',mark,
    service:{version:2,kind,count:kind==='reply'?1:Object.values(s.guests).filter(g=>!['declined','cancelled'].includes(g.status)).length,
      guestNames:Object.keys(s.guests).map(k=>name(input,k)),ownDrink:s.ownDrink===true,payment:s.payment,payer:s.payment==='treat'?s.initiator:null,speaker:id,payerName:s.payment==='treat'?name(input,s.initiator):null}}};
}
export function serviceReplyDue(st,id,now) {
  if(!st.economy?.config?.enabled)return false;
  return st.economy.services.some(s=>s.version===2&&s.status==='inviting'&&s.expiresAt>now&&
    (id==='heroine'&&!s.consent&&!s.performerDeferred||s.consent&&s.guests[id]?.status==='pending'));
}
export function resolveV2Service(s,now) {
  if(!live(s)||s.status==='running')return;
  const guests=Object.values(s.guests);
  if(!guests.some(g=>['pending','deferred','accepted'].includes(g.status))) {
    s.status='cancelled';s.reason='no_guests';s.closedAt=now;
  } else if(s.consent&&guests.every(g=>!['pending','deferred'].includes(g.status))&&guests.some(g=>g.status==='accepted'))s.status='reserved';
}
function subsets(ids) {
  return Array.from({length:(1<<ids.length)-1},(_,n)=>ids.filter((_,i)=>(n+1)&(1<<i))).filter(a=>a.length<=3);
}
export function v2ServiceActions(st,id,now,input,seated) {
  const out=[],e=st.economy,enabled=input.serviceVersion===2&&input.ready;
  if(!e.config.enabled)return out;
  for(const s of e.services.filter(s=>s.version===2&&live(s))) {
    const g=s.guests[id];
    if(id!=='heroine'&&id!==s.initiator&&!g)continue;
    if(id==='heroine'||id===s.initiator||['pending','deferred','accepted'].includes(g?.status))out.push({id:`money_drinks_cancel@${s.id}`,description:id==='heroine'||id===s.initiator?'Отменить заказ обслуживания. Все неоплаченные резервы освобождаются.':'Отказаться от своего бокала; неоплаченный резерв освобождается у его плательщика.'});
    if(s.expiresAt<=now)continue;
    if(!s.consent&&id==='heroine') {
      const text=`${name(input,s.initiator)} заказывает обслуживание для ${Object.keys(s.guests).map(k=>name(input,k)).join(', ')}. По 2 USD за бокал: 1.50 USD редакции, 0.50 USD тебе. `;
      out.push({id:`money_drinks_performer@${s.id}:decline`,description:text+'Отклонить заказ.'});
      if(!s.performerDeferred)out.push({id:`money_drinks_performer@${s.id}:defer`,description:text+'Отложить заказ; наливание и оплата не начинаются.'});
      if(enabled)out.push({id:`money_drinks_performer@${s.id}:accept`,description:text+'Принять заказ; каждый гость самостоятельно согласится и сядет за стол.'});
    }
    if(s.consent&&['pending','deferred'].includes(g?.status)&&s.status==='inviting') {
      const payer=s.payment==='treat'?s.initiator:id;
      const text=`Обслуживание: бокал виски за 2 USD. ${payer===id?'Ты платишь за свой бокал.':name(input,payer)+' угощает за свой счёт; долга нет.'} `;
      out.push({id:`money_drinks_reply@${s.id}:decline`,description:text+'Отказаться.'});
      if(g.status==='pending')out.push({id:`money_drinks_reply@${s.id}:defer`,description:text+'Ответить «позже», пока действует заказ; наливание ещё не начинается.'});
      const r=e.reservations[key(s,id)];
      if(input.serviceVersion===2&&input.guestReady?.[id]&&(r||available(st,payer)>=200))for(const seat of input.benches?.[id]||[])
        out.push({id:`money_drinks_reply@${s.id}:accept:${seat}`,description:text+`Согласиться и сесть на ${seat}. Деньги резервируются до подтверждённой доставки; можно уйти.`});
    }
    const accepted=Object.entries(s.guests).filter(([,g])=>g.status==='accepted');
    if(id==='heroine'&&enabled&&s.status==='reserved'&&input.stationFree&&accepted.length&&accepted.every(([k,g])=>seated(st,k,g,input.capabilities,now))){
      out.push({id:`money_drinks_start@${s.id}:serve_only`,description:'Обслужить согласившихся гостей: налить по бокалу виски, принести напитки и поставить на стол. По 2 USD за доставленный бокал: 1.50 USD редакции, 0.50 USD героине. Доставка не подтверждает питьё.'});
      if(available(st,'heroine')>=200)out.push({id:`money_drinks_start@${s.id}:own`,description:'Обслужить гостей и по собственному желанию выпить свой четвертый бокал за свой счет: резерв 2 USD, 1.50 USD редакции и 0.50 USD комиссии остаются тебе. Если не хочешь пить, выбери обслуживание без своего бокала.'});
    }
  }
  if(!enabled||st.trayDelivery||e.services.some(live))return out;
  const colleagues=Object.keys(st.chars).filter(k=>k!=='heroine');
  for(const guests of subsets(colleagues)) {
    if(id==='heroine') {
      if(guests.length!==1&&guests.length!==colleagues.length)continue;
      for(const payment of ['each','treat']) {
        if(payment==='treat'&&available(st,id)<200*guests.length)continue;
        out.push({id:`money_drinks_offer@${guests.join(',')}:${payment}`,description:`Предложить обслуживание ${guests.map(k=>name(input,k)).join(', ')}: ${payment==='treat'?`«я угощаю», ты оплачиваешь ${guests.length*2} USD за всех`:'по бокалу виски за 2 USD, каждый платит за себя'}. По 1.50 USD редакции и 0.50 USD тебе за доставленный бокал; каждый отвечает независимо, оплата после доставки.`});
      }
    } else if(guests.includes(id)&&input.guestReady?.[id])for(const payment of guests.length===1?['each']:['each','treat']) {
      const cents=200*(payment==='treat'?guests.length:1);
      if(available(st,id)<cents)continue;
      out.push({id:`money_drinks_order@${guests.join(',')}:${payment}`,description:`Заказать у героини обслуживание для ${guests.map(k=>name(input,k)).join(', ')}: ${payment==='treat'?`ты угощаешь всех за свой счёт, всего ${cents/100} USD`:'каждый платит за себя по 2 USD'}. По 1.50 USD редакции и 0.50 USD героине за бокал. Героиня и коллеги независимо решат, участвовать ли; резерв сейчас, оплата только после доставки.`});
    }
  }
  return out;
}
export function chooseV2Service(st,id,action,now,source,input,dispatch,seated,cancel) {
  if(!['jev','qwen'].includes(source)||!v2ServiceActions(st,id,now,input,seated).some(a=>a.id===action))return false;
  const [verb,arg]=action.split('@'),[token,answer,seat]=arg.split(':'),e=st.economy;
  if(verb==='money_drinks_order'||verb==='money_drinks_offer') {
    const guests=token.split(','),s={...SERVICE_TERMS,id:`service-${++e.next}`,initiator:id,performer:'heroine',payment:answer,status:'inviting',at:now,expiresAt:now+180000,orderConsent:{at:now,source},consent:id==='heroine'?{at:now,source}:null,guests:Object.fromEntries(guests.map(k=>[k,{status:'pending',payer:answer==='treat'?id:k}]))};
    e.services.push(s);
    for(const k of guests)if(answer==='treat'||k===id)reserve(st,s,k);
    say(st,s,id,id==='heroine'?guests:['heroine'],id==='heroine'?'offer':'order','q',now,input);
    e.revision++;note(st,s,'service_ordered',`${name(input,id)} ${id==='heroine'?'предложила':'заказал'} обслуживание для ${guests.map(k=>name(input,k)).join(', ')}. ${answer==='treat'?name(input,id)+' оплачивает все бокалы':'Каждый платит за себя'}. По 2 USD за бокал; доставки ещё нет.`,now);return true;
  }
  const s=e.services.find(s=>s.id===token&&s.version===2),g=s.guests[id];
  if(verb==='money_drinks_cancel'&&(id==='heroine'||id===s.initiator)){
    say(st,s,id,id==='heroine'?[s.initiator,...Object.keys(s.guests)]:['heroine'],'cancel','no',now,input);
    return cancel(st,s,'cancelled_by:'+id,now);
  }
  if(verb==='money_drinks_performer') {
    say(st,s,id,[s.initiator,...(answer==='accept'?Object.keys(s.guests):[])],'performer',answer==='accept'?'yes':answer==='defer'?'later':'no',now,input);
    if(answer==='decline')return cancel(st,s,'performer_declined',now);
    if(answer==='defer'){s.performerDeferred=true;note(st,s,'service_performer_deferred','Героиня отложила обслуживание. Наливание и оплата не начинались.',now);}
    else{s.consent={at:now,source};note(st,s,'service_performer_agreed','Героиня согласилась обслужить заказ. Требуется согласие и посадка гостей.',now);}
  } else if(verb==='money_drinks_cancel'||answer==='decline') {
    say(st,s,id,['heroine',s.initiator],'reply','no',now,input);
    delete e.reservations[key(s,id)];g.status='declined';g.closedAt=now;g.reason='guest_declined';
    note(st,s,'service_guest_declined:'+id,`${name(input,id)} отказался от своего бокала. Его неоплаченный резерв освобождён.`,now);
  } else if(answer==='defer') {
    say(st,s,id,['heroine',s.initiator],'reply','later',now,input);
    // A sponsor's explicit promise remains reserved until rejection or expiry.
    g.status='deferred';note(st,s,'service_guest_deferred:'+id,`${name(input,id)} отложил решение об обслуживании; доставки ещё нет.`,now);
  } else if(answer==='accept') {
    if(dispatch('rest_lounge@'+seat)===false)return false;
    const p=st.chars[id];if(p.activity!=='rest_lounge'||p.place!==seat)return false;
    if(!e.reservations[key(s,id)])reserve(st,s,id);
    Object.assign(g,{status:'accepted',seat,consent:{at:now,source},seq:p.seq,originSeq:p.seq});
    say(st,s,id,['heroine',s.initiator],'reply','yes',now,input);
    note(st,s,'service_guest_agreed:'+id,`${name(input,id)} согласился на бокал и идёт садиться. Плательщик: ${name(input,g.payer)}. Доставки и списания ещё нет.`,now);
  } else if(verb==='money_drinks_start') {
    if(dispatch('heroine_serve@bar')===false)return false;
    const p=st.chars.heroine;if(p.activity!=='heroine_serve'||p.place!=='bar')return false;
    s.ownDrink=answer==='own';if(s.ownDrink){s.ownGlass={status:'accepted',payer:'heroine',consent:{at:now,source}};st.economy.reservations[key(s,'heroine')]={payer:'heroine',actor:'heroine',cents:200,credit:true,service:s.id};}
    s.status='running';s.seq=p.seq;s.startedAt=now;s.expiresAt=now+300000;
    s.recipients=Object.entries(s.guests).filter(([,g])=>g.status==='accepted').map(([id,g])=>({id,seat:g.seat}));
    p.entry.service={id:s.id,version:2,ownDrink:s.ownDrink,recipients:s.recipients,durations:input.durations};
    say(st,s,'heroine',s.recipients.map(g=>g.id),'start','yes',now,input);
  } else return false;
  resolveV2Service(s,now);e.revision++;return true;
}
