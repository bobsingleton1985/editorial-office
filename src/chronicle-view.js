import {dayStory} from './chronicle-story.mjs';
import {DIMENSIONS,dimensionLabel} from './relationship-development.mjs';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const clock=at=>at?new Date(at).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}):'время неизвестно';
const dateText=at=>at?new Date(at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'время неизвестно';
const answers={reciprocate:'ответил взаимным флиртом',friendly:'обозначил только дружеское общение',later:'отложил романтическое сближение',decline:'отказался от романтического сближения',accept:'согласился',defer:'отложил решение'};
const invitationAnswers={accept:'согласие',decline:'отказ',defer:'отсрочка'};
const flirtAnswers={reciprocate:'взаимный флирт',friendly:'только дружеское общение',later:'романтическое сближение отложено',decline:'отказ от романтического сближения'};
const reasons={self_leave:'участник решил уйти',partner_departure:'собеседник ушёл',executor_completed:'исполнитель подтвердил завершение',command_changed:'перешёл к другому действию',fatigue_sleep:'участник ушёл спать',participant_cancelled:'участник отменил договорённость',expired:'истёк срок ожидания',audience_not_seated:'зритель перестал участвовать',audience_observation_gap:'подтверждение участия зрителя прервалось',execution_not_fully_observed:'полное исполнение не подтверждено'};
const sources={confirmed_debt_forgiveness:'свидетельства одного прощения долга',jev:'собственное решение Jev',executor:'исполнитель сцены',confirmed_joint_participation:'подтверждённое совместное участие',confirmed_addressed_expression:'подтверждённое адресное выражение',addressed_renderer_expression:'подтверждённое адресное выражение исполнителя',matching_executor_observations:'свежие отчёты исполнителя для этой команды',money_ledger:'денежный учёт редакции',agreed_money_ledger:'денежный учёт согласованного действия',director_work_finished:'завершение задачи в состоянии редакции',performance_contract:'договорённость о выступлении',confirmed_performance_contract:'договорённость и подтверждённый исход выступления',debt_ledger:'история обязательств',independent_money_reply:'независимый ответ на денежное предложение',canonical_director:'состояние редакции'};
export const appraisalText=(key,d)=>!d||!Number.isFinite(d.value)?'нет данных':d.assessedAt||d.updatedAt||d.revision>0||d.migratedFrom?dimensionLabel(key,d.value):'оценка ещё не сформирована';
export const matchesPeople=(people,actor,partner)=>!actor&&!partner||(!actor||people.includes(actor))&&(!partner||people.includes(partner));
const cents=n=>Number.isFinite(n)?(n/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' USD':'сумма не записана';
export function eventSentence(e,names={}) {
  const f=e.facts||{},name=id=>names[id]||id||'Участник',who=e.people.map(name).join(' и ');
  switch(e.kind){
    case 'flirt':return `${name(f.actor)} → ${name(f.partner)}: выражен флирт. Взаимность этим не установлена.`;
    case 'flirt_response':return `${name(f.actor)} → ${name(f.partner)}: ответ на флирт — ${flirtAnswers[f.answer]||'смысл не записан'}.`;
    case 'relationship_changed':return `${name(f.actor)} → ${name(f.partner)}: ${DIMENSIONS[f.dimension]?.name||'отношение'} теперь — ${dimensionLabel(f.dimension,f.after)}.`;
    case 'dance_started':return `${who}: подтверждено исполнение танца. Совместный танец с другим участником не установлен.`;
    case 'dance_finished':return `${who}: танец ${f.reason==='executor_completed'?'завершён исполнителем':'прерван сменой действия'}.`;
    case 'conversation':return `${who}: состоялось общение, ${Number.isFinite(f.simulatedParticipatingSeconds)?Math.round(f.simulatedParticipatingSeconds)+' с участия по времени сцены':Number.isFinite(f.participatingSeconds)?Math.round(f.participatingSeconds)+' с реального участия; длительность по времени сцены не записана':'длительность участия не записана'}.`;
    case 'conversation_cancelled':return `${who}: договорённость об общении завершилась без подтверждённого участия.`;
    case 'invitation_answer':return `${name(f.actor)} → ${name(f.partner)}: приглашение к общению; ответ — ${invitationAnswers[f.answer]||'не записан'}.`;
    case 'work_completed':return `${who}: завершена редакционная задача «${f.title||'название не записано'}».`;
    case 'objection':return `${name(f.actor)} выразил адресное возражение ${name(f.partner)}. Причина не записана.`;
    case 'performance_offered':return `${who}: предложено выступление за ${cents(f.cents)}; это ещё не согласие и не исполнение.`;
    case 'performance_agreed':return `${who}: выступление согласовано за ${cents(f.cents)}; исполнение ещё не подтверждено.`;
    case 'performance_completed':return `${who}: выступление исполнено полностью и оплачено — ${cents(f.cents)}.`;
    case 'performance_cancelled':return `${who}: выступление отменено без оплаты.`;
    case 'money_offer_answer':return `${who}: ${f.answer==='accepted'?'принято':'отклонено или закрыто'} денежное предложение — ${cents(f.cents)}.`;
    case 'debt_extension':return `${who}: согласована отсрочка долга до ${dateText(f.after)}.`;
    case 'debt_forgiven':return `${who}: долг прощён${Number.isFinite(f.cents)?' — '+cents(f.cents):''}.`;
    case 'debt_repayment':return `${who}: зарегистрирован возврат долга${Number.isFinite(f.cents)?' — '+cents(f.cents):''}.`;
    default: {
      const label={money_gift:'подарок принят',money_loan:'заём выдан',money_repayment:'долг возвращён',money_loan_forgiven:'долг прощён',money_loan_overdue:'срок возврата долга прошёл; причина не установлена',money_work:'получен заработок за работу',money_performance:'оплачено выступление',money_treat_purchase:'оплачено угощение коллеги',money_drink_service:'оплачена доставка напитков'}[e.kind];
      return `${who}: ${label||'зарегистрировано событие'}${Number.isFinite(f.cents)?' — '+cents(f.cents):''}.`;
    }
  }
}
export function daySummary(counts) {
  const parts=[];
  const values=[['work_completed','Завершено редакционных задач'],['flirt','Подтверждено обращений с флиртом'],['flirt_response','Получено явных ответов на флирт'],['relationship_changed','Изменений в собственных оценках отношений'],['dance_started','Подтверждено начатых танцев'],['performance_completed','Завершено выступлений'],['conversation','Состоялось разговоров']];
  for(const [key,label]of values)if(counts[key])parts.push(`${label}: ${counts[key]}.`);
  const money=Object.entries(counts).filter(([k])=>k.startsWith('money_')).reduce((n,[,c])=>n+c,0),debts=Object.entries(counts).filter(([k])=>k.startsWith('debt_')).reduce((n,[,c])=>n+c,0);
  if(money)parts.push(`Денежных событий: ${money}.`);if(debts)parts.push(`Событий по долгам: ${debts}.`);
  if(counts.objection)parts.push(`Адресных возражений: ${counts.objection}.`);
  if(counts.invitation_answer)parts.push(`Ответов на приглашения: ${counts.invitation_answer}.`);
  if(counts.performance_cancelled||counts.conversation_cancelled)parts.push(`Отменённых договорённостей: ${(counts.performance_cancelled||0)+(counts.conversation_cancelled||0)}.`);
  const total=Object.values(counts).reduce((n,c)=>n+c,0);
  return parts.join(' ')||(total?`Зарегистрировано существенных событий: ${total}.`:'В выбранном разделе существенные события не зарегистрированы.');
}
export function createChronicle({relay,enabled=true,fetcher=fetch,ownerToken=null}) {
  if(!enabled||!relay)return null;
  const base=relay==='/'?'':relay.replace(/\/$/,'');
  const style=node('style');style.textContent=`
  #chronicle-button{position:fixed;right:70px;top:16px;z-index:6;height:44px;border-radius:10px}
  #chronicle{position:fixed;right:16px;top:70px;bottom:max(16px,env(safe-area-inset-bottom));width:min(460px,calc(100% - 32px));box-sizing:border-box;z-index:8;color:var(--ink,#f3e7d3);background:rgba(24,18,14,.97);border:1px solid var(--line,#594435);border-radius:12px;box-shadow:0 12px 40px #0008;overflow:auto;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overscroll-behavior:contain}
  #chronicle[hidden]{display:none}#chronicle.expanded{left:16px;width:auto}
  #chronicle header{position:sticky;top:0;background:#201812;z-index:1;padding:14px 16px;border-bottom:1px solid #594435}
  #chronicle h2{font:22px Georgia,serif;margin:0}#chronicle h3{font:18px Georgia,serif;margin:18px 0 8px}
  #chronicle .ch-head{display:flex;align-items:center;gap:8px}#chronicle .ch-head h2{flex:1}#chronicle button{font-size:13px;padding:7px 10px}
  #chronicle .ch-controls{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}#chronicle input,#chronicle select{font:inherit;min-width:0;background:#30251c;color:inherit;border:1px solid #73593f;border-radius:7px;padding:6px;box-sizing:border-box}#chronicle select{flex:1;max-width:100%}
  #chronicle .ch-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#chronicle .ch-filters select:first-child{grid-column:1 / -1;width:100%}
  #chronicle .ch-reference{margin:14px 0;border-top:1px solid #594435;padding:10px 0}#chronicle .ch-reference>summary,#chronicle .ch-pair>summary{cursor:pointer;color:#deac67}#chronicle .ch-body{padding:0 16px 18px}#chronicle p{margin:8px 0}#chronicle .ch-muted{color:#c5b49c;font-size:12px}#chronicle .ch-note{padding:10px;border-left:2px solid #deac67;background:#b9863612}
  #chronicle .ch-event{border-top:1px solid #594435;padding:12px 0}#chronicle .ch-event summary{cursor:pointer;list-style:none}#chronicle .ch-event summary:after{content:' Подробнее';color:#deac67;font-size:12px}#chronicle .ch-event[open] summary:after{content:' Свернуть'}
  #chronicle .ch-event time{display:block;color:#c5b49c;font-size:12px;margin-bottom:4px}#chronicle .ch-pair{border:1px solid #73593f;border-radius:8px;padding:12px;margin:10px 0}#chronicle .ch-pair strong{display:block;margin:8px 0}#chronicle button:focus-visible,#chronicle summary:focus-visible,#chronicle input:focus-visible,#chronicle select:focus-visible{outline:2px solid #e7b36c;outline-offset:2px}
  @media(max-width:600px){#chronicle{right:8px;top:68px;width:calc(100% - 16px)}#chronicle.expanded{left:8px}#chronicle-button{right:68px}}
  `;document.head.append(style);
  const trigger=node('button',null,'Хроника');trigger.id='chronicle-button';trigger.type='button';trigger.setAttribute('aria-controls','chronicle');trigger.setAttribute('aria-expanded','false');
  const panel=node('aside');panel.id='chronicle';panel.hidden=true;panel.setAttribute('aria-label','Хроника редакции');
  const header=node('header'),head=node('div','ch-head'),title=node('h2',null,'Хроника редакции'),expand=node('button',null,'Развернуть'),close=node('button',null,'Закрыть');
  head.append(title,expand,close);header.append(head);
  const dates=node('div','ch-controls'),date=node('input');date.type='date';date.value=day(Date.now());date.max=date.value;date.setAttribute('aria-label','Дата хроники');
  const selectDay=offset=>{date.value=new Date(Date.parse(day(Date.now())+'T12:00:00Z')-offset*86400000).toISOString().slice(0,10);refresh();};
  for(const [label,offset]of [['Сегодня',0],['Вчера',1],['Позавчера',2]]){const b=node('button',null,label);b.onclick=()=>selectDay(offset);dates.append(b);}dates.append(date);header.append(dates);
  const filters=node('div','ch-controls ch-filters'),category=node('select'),actor=node('select'),partner=node('select');
  category.setAttribute('aria-label','Раздел хроники');actor.setAttribute('aria-label','Персонаж');partner.setAttribute('aria-label','Второй участник пары');
  for(const [value,label]of [['all','Все существенное'],['work','Работа'],['social','Общение и отношения']]){const o=node('option',null,label);o.value=value;category.append(o);}
  actor.append(node('option',null,'Все персонажи'));actor.firstChild.value='';partner.append(node('option',null,'Любой партнёр'));partner.firstChild.value='';
  filters.append(category,actor,partner);header.append(filters);
  const status=node('p','ch-muted',''),body=node('div','ch-body');status.setAttribute('role','status');header.append(status);panel.append(header,body);document.body.append(trigger,panel);
  let controller=null,version=0,loadedEvents=[],next=null,loadedFor='';
  const namesFor =data=>data.names||data.state?.names||{};
  const options=(select,names,label)=>{const chosen=select.value;select.replaceChildren();const all=node('option',null,label);all.value='';select.append(all);for(const [id,name]of Object.entries(names)){const o=node('option',null,name);o.value=id;select.append(o);}select.value=chosen;};
  const showPair=(data,container)=>{
    if(!actor.value||!partner.value||actor.value===partner.value)return;
    const names=namesFor(data),box=node('details','ch-pair');box.dataset.event='pair';box.append(node('summary',null,'Отношения пары подробно'),node('p','ch-muted',`${data.stateAt?'Состояние на '+dateText(data.stateAt):'Сохранённого состояния отношений на выбранную дату нет'}. Внутренние оценки показаны владельцу; они не становятся известны собеседнику.`));
    for(const [a,b]of [[actor.value,partner.value],[partner.value,actor.value]]){
      box.append(node('strong',null,`${names[a]||a} → ${names[b]||b}`));
      const r=data.state?.relations?.[a]?.[b];
      if(!r){box.append(node('p','ch-muted','Нет данных об этом направлении отношений.'));continue;}
      for(const [key,spec]of Object.entries(DIMENSIONS)){
        const d=r.dimensions?.[key];box.append(node('div',null,`${spec.name}: ${appraisalText(key,d)}.`));
      }
      for(const [id,boundary]of Object.entries(r.boundaries||{}))box.append(node('p','ch-muted',`${names[id]||id}: ${answers[boundary.answer]||'обозначил границу'} (${dateText(boundary.at)}).`));
    }
    container.append(box);
  };
  const renderEvents=(events,names,container)=>{
    for(const e of events){
      const detail=node('details','ch-event');detail.dataset.event=e.id;const sm=node('summary'),time=node('time',null,clock(e.at));time.dateTime=new Date(e.at).toISOString();sm.append(time,node('span',null,eventSentence(e,names)));detail.append(sm);
      const f=e.facts||{};
      if(e.kind==='relationship_changed')detail.append(node('p','ch-muted',`Значение собственной оценки: ${f.before} → ${f.after}. Была ли прежняя оценка уже осмыслена, эта запись отдельно не сообщает.`));
      if(f.startedAt)detail.append(node('p','ch-muted','Начало подтверждённого участия: '+dateText(f.startedAt)+'.'));
      if(Number.isFinite(f.observedSeconds))detail.append(node('p',null,`Подтверждено наблюдениями исполнителя: ${Number.isFinite(f.observedSceneSeconds)?Math.round(f.observedSceneSeconds)+' с по времени сцены':'время сцены не записано'}, ${Math.round(f.observedSeconds)} с реального участия. Пропуски наблюдения не включены.`));
      if(Number.isFinite(f.participatingSeconds))detail.append(node('p',null,`Реальное подтверждённое участие: ${Math.round(f.participatingSeconds)} с. Время сцены: ${Number.isFinite(f.simulatedParticipatingSeconds)?Math.round(f.simulatedParticipatingSeconds)+' с':'не записано'}.`));
      if(f.reason)detail.append(node('p',null,'Завершение: '+(reasons[f.reason]||'причина записана исполнителем: '+f.reason)+'.'));
      for(const [id,r]of Object.entries(f.reasons||{}))detail.append(node('p',null,`${names[id]||id}: ${reasons[r.reason]||r.reason||'причина не записана'}.`));
      if(e.kind==='flirt_response'&&f.replyTo)detail.append(node('p','ch-muted','Ответ связан с конкретным предшествующим обращением.'));
      if(f.statement)detail.append(node('p','ch-muted',f.statement+' Это смысл подтверждённого адресного выражения, а не запись произнесённых слов.'));
      detail.append(node('p','ch-muted','Источник: '+(sources[e.source]||e.source||'не записан')+'.'));
      for(const x of f.evidence||[])detail.append(node('p','ch-muted','Основание: '+(x.summary||x.title||({'conversation_experienced':'подтверждённое совместное общение',flirt_address:'адресное выражение флирта',courtship_response:'явный ответ на флирт',attention_to_other:'подтверждённое обращение к другому человеку'})[x.kind]||'зарегистрированное событие')+'. Источник основания: '+(sources[x.source]||x.source||'не записан')+'.'));
      if(e.people.length===2){const b=node('button',null,'Открыть карточку пары');b.onclick=()=>{actor.value=e.people[0];partner.value=e.people[1];category.value='social';refresh();};detail.append(b);}
      container.append(detail);
    }
  };
  function render(data) {
    const opened=new Set([...body.querySelectorAll('details[open]')].map(d=>d.dataset.event)),names=namesFor(data);
    options(actor,names,'Все персонажи');options(partner,names,'Любой партнёр');body.replaceChildren();
    body.append(node('h3',null,'История дня'));
    for(const p of (data.story||dayStory(data.events,data.state,{names,date:data.date,stateDay:data.stateDay})).paragraphs)body.append(node('p',null,p.text));
    if(data.highlights?.length){const figures=node('details');figures.append(node('summary',null,'События дня в цифрах'),node('p','ch-muted',daySummary(data.counts)));body.append(figures);}

    const coverage=data.coverage;
    if(coverage.storageError)body.append(node('p','ch-note','Запись архива остановлена из-за ошибки хранения. Показаны ранее сохранённые события.'));
    body.append(node('p','ch-note',coverage.status==='no_data'?'За этот день нет данных непрерывного наблюдения архива. Сохранившиеся события могут быть показаны ниже. Отсутствие записей не означает, что редакция не работала.':coverage.first===coverage.last?`История неполная: сохранившееся состояние на ${clock(coverage.first)}. Это отдельный снимок, не полный журнал дня.`:`История дня неполная. Наблюдение архива: ${clock(coverage.first)}–${clock(coverage.last)}${coverage.gaps?' · есть пропуски':''}. Более старые сохранившиеся события включены отдельно.`));
    if(data.state?.undatedCount)body.append(node('p','ch-muted',`Есть сохранившиеся записи без полной даты: ${data.state.undatedCount}. Они не распределены по дням догадкой.`));
    showPair(data,body);
    const timeline=node('details','ch-reference');timeline.dataset.event='timeline';timeline.append(node('summary',null,'События и источники'));body.append(timeline);
    if(!loadedEvents.length)timeline.append(node('p','ch-muted',data.coverage.status==='no_data'?'Записей для выбранного дня и фильтров нет.':'Существенных событий по выбранным фильтрам не зарегистрировано.'));
    renderEvents(loadedEvents,names,timeline);
    if(next){const more=node('button',null,'Ещё события');more.onclick=()=>refresh(true);timeline.append(more);}
    const pending=node('details','ch-reference');pending.dataset.event='pending';pending.append(node('summary',null,'Что осталось незавершённым'));body.append(pending);
    if(data.stateDay!==data.date)pending.append(node('p','ch-muted','Снимка незавершённых дел за выбранный день нет.'));
    else {
      pending.append(node('p','ch-muted','Последний сохранённый снимок: '+dateText(data.stateAt)+'.'));
      let count=0;
      for(const t of data.state?.tasks||[]){if(category.value==='social'||!matchesPeople([t.actor],actor.value,partner.value))continue;count++;pending.append(node('p',null,`«${t.title}» — ${t.actor?names[t.actor]||t.actor:'ещё не взята в работу'}.`));}
      for(const d of data.state?.debts||[]){if(category.value==='social'||!matchesPeople([d.lender,d.borrower],actor.value,partner.value))continue;count++;pending.append(node('p',null,`${names[d.borrower]||d.borrower} должен ${names[d.lender]||d.lender}: ${cents(d.remaining)}. Срок: ${dateText(d.dueAt)}.`));}
      for(const o of data.state?.offers||[]){if(category.value==='social'||!matchesPeople([o.from,o.to],actor.value,partner.value))continue;count++;pending.append(node('p',null,`${names[o.from]||o.from} → ${names[o.to]||o.to}: предложение ${cents(o.cents)} ожидает ответа.`));}
      for(const c of data.state?.conversations||[]){if(category.value==='work'||!matchesPeople(c.people,actor.value,partner.value))continue;count++;pending.append(node('p',null,`${c.people.map(id=>names[id]||id).join(' и ')}: ${c.phase==='active'?'продолжают общение':'участие пока не подтверждено'}.`));}
      for(const p of data.state?.performances||[]){if(category.value==='work'||!matchesPeople([p.performer,p.payer],actor.value,partner.value))continue;count++;pending.append(node('p',null,`${names[p.performer]||p.performer} и ${names[p.payer]||p.payer}: ${p.status==='running'?'выступление ещё не завершено':p.status==='offered'?'предложение выступления ожидает ответа':'выступление согласовано, полного исполнения ещё нет'}.`));}
      if(!count)pending.append(node('p','ch-muted','Открытые задачи и договорённости в этом снимке не зарегистрированы.'));
    }
    for(const d of body.querySelectorAll('details'))if(opened.has(d.dataset.event))d.open=true;
  }
  async function refresh(more=false) {
    if(panel.hidden)return;
    controller?.abort();controller=new AbortController();const request=++version;
    const params=new URLSearchParams({date:date.value,category:category.value,actor:actor.value,partner:partner.value});const selection=params.toString();if(selection!==loadedFor){loadedEvents=[];next=null;body.replaceChildren();}if(more&&next)params.set('before',next);
    status.textContent='Чтение архива…';
    try {const r=await fetcher(base+'/chronicle?'+params,{cache:'no-store',signal:controller.signal,headers:ownerToken?{Authorization:'Bearer '+ownerToken}:{}});if(r.status===403){status.textContent='Хроника доступна только владельцу. Откройте редакцию через существующий вход владельца.';body.replaceChildren();return;}if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(request!==version)return;
      loadedFor=selection;loadedEvents=more?[...loadedEvents,...data.events]:data.events;next=data.next;render(data);status.textContent=`${data.total} событий по фильтрам · время Москвы`;
    }catch(e){if(request!==version||e.name==='AbortError')return;status.textContent='Архив сейчас недоступен. '+(loadedEvents.length?'Ниже — ранее загруженные записи.':'Попробуйте обновить.');if(!loadedEvents.length)body.replaceChildren();}
  }
  const toggle=open=>{panel.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open){const settings=document.getElementById('settings');if(settings&&!settings.hidden)document.getElementById('menu')?.click();refresh();close.focus();}else{controller?.abort();version++;trigger.focus();}};
  trigger.onclick=()=>toggle(panel.hidden);close.onclick=()=>toggle(false);expand.onclick=()=>{panel.classList.toggle('expanded');expand.textContent=panel.classList.contains('expanded')?'Свернуть':'Развернуть';};
  for(const el of [date,category,actor,partner])el.onchange=()=>refresh();
  addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();toggle(false);}});
  const timer=setInterval(()=>{if(!panel.hidden&&!document.hidden)refresh();},20000);
  return {refresh,open:()=>toggle(true),dispose:()=>{clearInterval(timer);controller?.abort();trigger.remove();panel.remove();style.remove();}};
}
