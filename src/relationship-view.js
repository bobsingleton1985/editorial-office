import {RELATION_TEXT,INTENT_TEXT} from './conversation-policy.mjs';
import {relationshipFact} from './relationship-facts.mjs';
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
const time=at=>new Date(at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
export function relationshipView(entry,names){
 const box=node('div','relationships');box.append(node('div','sub','Отношения с коллегами'));
 const relations=Object.entries(entry?.relationships||{});
 if(!relations.length)box.append(node('div','hint','Данные об отношениях ещё не получены.'));
 for(const [id,r]of relations){const row=node('div','rc'),name=names[id]||id;row.append(node('b',null,name+': '+(RELATION_TEXT[r.stance]||'нет данных')));
 const fact=r.basis?relationshipFact(r.basis,name)+` Отношение изменилось в ${time(r.updatedAt)}.`:'Пока отношение не менялось.';
 row.append(node('div','hint',fact));
 if(r.lastAppraisal)row.append(node('div','hint',`Последняя собственная оценка (${time(r.lastAppraisal.at)}): ${r.lastAppraisal.assessment}`));
 const pending=(r.observations||[]).filter(e=>!e.appraisedAt&&e.id!==r.basis?.id&&!r.lastAppraisal?.consideredEventIds?.includes(e.id));
 if(pending.length)row.append(node('div','hint',`Новые наблюдения для оценки: ${pending.length}. ${relationshipFact(pending.at(-1),name)}`));
 if(r.decisions?.length){const history=node('details');history.append(node('summary',null,'История собственных оценок'));
  for(const e of r.decisions.slice(-6).reverse())history.append(node('div','hint',`${time(e.at)} · ${RELATION_TEXT[e.before]} → ${RELATION_TEXT[e.after]}. ${e.assessment||'Выбрана оценка отношения.'} Основание: ${relationshipFact(e.basis,name)}`));row.append(history);}
 box.append(row);}
 if(entry?.social){const i=entry.social.intent;box.append(node('div','sub','Текущий разговор'),node('div',null,'Выбранная манера: '+(INTENT_TEXT[i?.intent]||'спокойно поговорить')+(!i?.revision?' · по умолчанию':i?.expressedAt?' · выражена собеседнику':' · ожидает выражения в своей очереди')));}
 return box;
}
