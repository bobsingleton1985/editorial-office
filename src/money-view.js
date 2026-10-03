const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const stamp=at=>Number.isFinite(at)?new Date(at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'время неизвестно';
const person=(id,names)=>names[id]||id||'редакция';
const dollars=n=>`${((n||0)/100).toFixed(2)} $`;
const meaning={performance:'Оплата согласованного танца',opening:'Стартовый запас',work:'Оплата выполненной работы',purchase:'Покупка',treat_purchase:'Оплата угощения',gift:'Подарок',loan:'Заём',repayment:'Возврат долга'};
function section(key,title){const d=el('details');d.dataset.lifeSection=key;d.append(el('summary',title));return d;}
export function moneyPanel(entry,names){
  const box=section('money','Деньги'),f=entry?.finances;
  if(!f?.enabled){box.append(el('p','Денежный учёт подготовлен. Стартовые суммы и тарифы ещё не установлены.'));return box;}
  box.append(el('p',`Баланс: ${dollars(f.balance)}. Доступно: ${dollars(f.available)}.`));
  box.append(el('p',f.canWork===false?'Редакционный заработок этому персонажу пока недоступен.':`За завершённое редакционное задание: ${dollars(f.workRewardCents)}.`));
  const titles={lunch:'Еда',whisky:'Виски',coffee:'Кофе',smoke_coffee:'Кофе с сигаретой (оплата кофе)'};
  box.append(el('p',Object.entries(f.prices).map(([a,n])=>`${titles[a]||a}: ${dollars(n)}`).join(' · ')));
  if(f.performanceTerms)box.append(el('p',`Согласованное выступление: ${dollars(f.performanceTerms.cents)} после полного исполнения. Обычные танцы бесплатны.`));
  for(const c of f.performances||[])box.append(el('p',`${person(c.payer,names)} → ${person(c.performer,names)}: танец за ${dollars(c.cents)}. ${({offered:'Ожидает независимого согласия',reserved:'Средства зарезервированы, ждёт начала',running:'Выступление начато, оплата ожидает завершения',paid:'Исполнено и оплачено',declined:'Предложение отклонено',cancelled:'Отменено без оплаты'})[c.status]||c.status}.`));
  for(const d of f.debts)box.append(el('p',`Долг: ${person(d.borrower,names)} → ${person(d.lender,names)}: ${dollars(d.remaining)}. Срок: ${stamp(d.dueAt)}${d.closedAt?' · закрыт':d.overdueNotified?' · срок прошёл':''}.`));
  for(const o of f.offers)box.append(el('p',`${person(o.from,names)} ${o.kind==='gift'?'предлагает подарок':o.kind==='treat'?'предлагает угощение':o.kind==='extension'?'просит отсрочку':'просит взаймы'} у ${person(o.to,names)}: ${dollars(o.cents)}. Ожидает решения.`));
  for(const t of f.treats||[])box.append(el('p',`${person(t.from,names)} угощает ${person(t.to,names)}: ${dollars(t.cents)}. ${({available:'Можно воспользоваться',reserved:'Ожидает исполнения',used:'Угощение оплачено',expired:'Предложение истекло'})[t.status]||t.status}.`));
  for(const t of [...f.transactions].reverse())box.append(el('p',`${stamp(t.at)} · ${meaning[t.kind]||t.kind}: ${dollars(t.cents)}. ${person(t.from,names)} → ${person(t.to,names)}.`,'hint'));
  return box;
}
