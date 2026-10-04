import {DIMENSIONS,dimensionLabel,courtshipStatus} from './relationship-development.mjs';
import {INTENT_TEXT} from './conversation-policy.mjs';
import {relationshipFact} from './relationship-facts.mjs';
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
const time=at=>new Date(at).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
const fact=(e,name)=>e.summary||relationshipFact(e,name);
export function relationshipView(entry,names){
 const box=node('div','relationships');box.append(node('div','sub','Отношения с коллегами'));
 const relations=Object.entries(entry?.relationships||{});
 if(!relations.length)box.append(node('div','hint','Данные об отношениях ещё не получены.'));
 for(const [id,r]of relations){
  const row=node('div','rc'),name=names[id]||id;row.append(node('b',null,name));
  if(!r.dimensions){row.append(node('div','hint','Пять составляющих ещё не подключены к этой версии редакции.'));box.append(row);continue;}
  for(const [key,spec]of Object.entries(DIMENSIONS)){
   const d=r.dimensions[key];row.append(node('div',null,`${spec.name}: ${dimensionLabel(key,d.value)}.`));
   if(d.assessedAt)row.append(node('div','hint',`Осмыслено в ${time(d.assessedAt)}${d.migratedFrom?' · сохранена прежняя собственная оценка':''}.`));
  }
  const actor=Object.keys(names).find(key=>names[key]===entry.name);
  if(actor)row.append(node('div','hint',courtshipStatus(structuredClone(r),actor,id)));
  const history=node('details');history.dataset.relationshipSection=id;history.append(node('summary',null,'События и собственные оценки'));
  if(!r.dimensionDecisions?.length)history.append(node('div','hint','Собственных оценок пока нет. Событие и изменение чувств — разные вещи.'));
  for(const e of [...(r.dimensionDecisions||[])].reverse().slice(0,12)){
   history.append(node('div','hint',`${time(e.at)} · ${e.summary}`));
   for(const evidence of e.evidence)history.append(node('div','hint','Основание: '+fact(evidence,name)));
  }
  for(const e of (r.courtship?.history||[]).slice(-8))history.append(node('div','hint',`${time(e.at)} · ${names[e.actor]||e.actor}: ${e.statement} Ответ подтверждён исполнением адресного выражения; это не запись произнесённых слов.`));
  row.append(history);box.append(row);
 }
 const f=entry?.reflection;if(f)box.append(node('div','hint',`Осмысление ${time(f.at)}: ${({pending:'ожидается ответ Jev',applied:'собственная оценка сохранена',stale:'ситуация изменилась, оценка не применена',unavailable:'ответ не получен; оценка не придумана'})[f.status]||f.status}.`));
 if(entry?.social){const i=entry.social.intent;box.append(node('div','sub','Текущий разговор'),node('div',null,'Выбранная манера: '+(INTENT_TEXT[i?.intent]||'спокойно поговорить')));
  if(i?.courtship)box.append(node('div','hint',i.courtship.statement+(i.expressedAt?' · адресное выражение исполнено':' · ожидает исполнения; собеседник ещё не получил ответ')));
 }
 return box;
}
