const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const stamp=at=>Number.isFinite(at)?new Date(at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'время неизвестно';
const person=(id,names)=>names[id]||id||'редакция';
const dollars=n=>Number.isFinite(n)?`${(n/100).toFixed(2)} $`:'—';
const meaning={performance:'Оплата согласованного танца',opening:'Стартовый запас',work:'Оплата выполненной работы',purchase:'Покупка',treat_purchase:'Оплата угощения',gift:'Подарок',loan:'Заём',repayment:'Возврат долга'};
function section(key,title){const d=el('details',undefined,'money-fold'),summary=el('summary',title);d.dataset.moneySection=key;summary.dataset.moneyFocus=key;d.append(summary);return d;}
export function moneyOverview(list,focus,onSelect){
  const box=el('div',undefined,'money-overview');
  for(const [id,entry] of list){
    const b=el('button',undefined,'money-person'),f=entry.finances;b.type='button';b.dataset.moneyPerson=id;b.dataset.moneyFocus=`person:${id}`;b.setAttribute('aria-pressed',String(id===focus));
    b.append(el('span',entry.name||id,'money-name'),el('strong',f?.enabled?dollars(f.balance):'—','money-balance'),el('span',f?.enabled?`Доступно ${dollars(f.available)}`:'Учёт не подключён','money-available'));
    b.addEventListener('click',()=>onSelect(id));box.append(b);
  }
  if(!list.length)box.append(el('p','Денежный учёт появится после подключения к редакции.','hint'));
  return box;
}
export function moneyPanel(entry,names){
  const box=el('div',undefined,'money-detail'),f=entry?.finances;
  if(!entry)return box;
  box.append(el('h3',entry.name||'Деньги персонажа','sub'));
  if(!f?.enabled){box.append(el('p','Денежный учёт подготовлен. Стартовые суммы и тарифы ещё не установлены.','hint'));return box;}
  const balances=el('div',undefined,'money-balance-row');
  for(const [title,value] of [['Баланс',f.balance],['Доступно',f.available]]){const stat=el('div');stat.append(el('span',title),el('strong',dollars(value)));balances.append(stat);}
  box.append(balances);
  if(f.livelihood){const l=f.livelihood;box.append(el('p',l.earningRole==='paid_performance'?'Заработок: только согласованное платное выступление. Обычные танцы бесплатны.':'Заработок: завершение редакционных заданий.'));box.append(el('p',l.mealAffordable?'На еду хватает денег или доступно принятое угощение.':`На еду не хватает ${dollars(l.mealShortfallCents)}. Это учитывается при выборе заработка.`));}
  const wallet=f.livelihood?.wallet;if(wallet?.enabled){box.append(el('p',`Зарезервировано: ${dollars(wallet.reservedCents)}. Собственные долги: ${dollars(wallet.ownDebtCents)}; к возврату в ближайшие сутки: ${dollars(wallet.dueWithinDayCents)}.`));if(wallet.foodAndDueDebtGapCents>0)box.append(el('p',`На еду и ближайшие долги вместе не хватает ${dollars(wallet.foodAndDueDebtGapCents)}. Перед покупками, подарками и развлечениями персонаж учитывает будущий остаток.`));}

  const rates=section('rates','Заработок и цены');
  if(f.canWork!==false)rates.append(el('p',`За завершённое редакционное задание: ${dollars(f.workRewardCents)}.`));
  const titles={lunch:'Еда',whisky:'Виски',coffee:'Кофе',smoke:'Сигарета',smoke_coffee:'Кофе с сигаретой'},prices=Object.entries(f.prices||{});
  if(prices.length)rates.append(el('p',prices.map(([a,n])=>`${titles[a]||a}: ${dollars(n)}`).join(' · ')));
  if(f.performanceTerms)rates.append(el('p',`Согласованное выступление: ${dollars(f.performanceTerms.cents)} после полного исполнения. Обычные танцы бесплатны.`));
  box.append(rates);
  const debts=f.debts||[],offers=f.offers||[],treats=f.treats||[],performances=f.performances||[],count=debts.length+offers.length+treats.length+performances.length;
  if(count){
    const commitments=section('commitments',`Долги и договорённости · ${count}`);
    for(const c of performances)commitments.append(el('p',`${person(c.payer,names)} → ${person(c.performer,names)}: танец за ${dollars(c.cents)}. ${({offered:'Ожидает независимого согласия',reserved:'Средства зарезервированы, ждёт начала',running:'Выступление начато, оплата ожидает завершения',paid:'Исполнено и оплачено',declined:'Предложение отклонено',cancelled:'Отменено без оплаты'})[c.status]||c.status}.`));
    for(const d of debts)commitments.append(el('p',`Долг: ${person(d.borrower,names)} → ${person(d.lender,names)}: ${dollars(d.remaining)}. Срок: ${stamp(d.dueAt)}${d.closedAt?' · закрыт':d.overdueNotified?' · срок прошёл':''}.`));
    for(const o of offers){const action=o.kind==='gift'?'предлагает подарок':o.kind==='treat'?'предлагает угощение':o.kind==='extension'?'просит отсрочку':'просит взаймы',link=o.kind==='gift'||o.kind==='treat'?'для':'у';commitments.append(el('p',`${person(o.from,names)} ${action} ${link} ${person(o.to,names)}: ${dollars(o.cents)}. Ожидает решения.`));}
    for(const t of treats)commitments.append(el('p',`${person(t.from,names)} угощает ${person(t.to,names)}: ${dollars(t.cents)}. ${({available:'Можно воспользоваться',reserved:'Ожидает исполнения',used:'Угощение оплачено',expired:'Предложение истекло'})[t.status]||t.status}.`));
    box.append(commitments);
  }
  const transactions=f.transactions||[],history=section('history',`История операций · ${transactions.length}`);
  for(const t of [...transactions].reverse())history.append(el('p',`${stamp(t.at)} · ${meaning[t.kind]||t.kind}: ${dollars(t.cents)}. ${person(t.from,names)} → ${person(t.to,names)}.`,'hint'));
  if(!transactions.length)history.append(el('p','Операций пока нет.','hint'));
  box.append(history);
  return box;
}
