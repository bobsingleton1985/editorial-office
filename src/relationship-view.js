import {RELATION_TEXT,INTENT_TEXT} from './conversation-policy.mjs';
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
const SIGNAL={neutral_address:'спокойно обратился',friendly_address:'доброжелательно обратился',self_tension:'выразил собственное напряжение',directed_objection:'выразил адресное возражение'};
export function relationshipView(entry,names){
 const box=node('div','relationships');box.append(node('div','sub','Отношения с коллегами'));
 const relations=Object.entries(entry?.relationships||{});
 if(!relations.length)box.append(node('div','hint','Данные об отношениях ещё не получены.'));
 for(const [id,r]of relations){const row=node('div','rc'),name=names[id]||id;row.append(node('b',null,name+': '+(RELATION_TEXT[r.stance]||'нет данных')));
 const fact=r.basis?`${name} ${SIGNAL[r.basis.kind]||INTENT_TEXT[r.basis.intent]||'выразил свою манеру'} во время общения. Решение об отношении принято ${new Date(r.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}.`:'Пока отношение не менялось.';
 row.append(node('div','hint',fact));box.append(row);}
 if(entry?.social){const i=entry.social.intent;box.append(node('div','sub','Текущий разговор'),node('div',null,'Выбранная манера: '+(INTENT_TEXT[i?.intent]||'спокойно поговорить')+(!i?.revision?' · по умолчанию':i?.expressedAt?' · выражена собеседнику':' · ожидает выражения в своей очереди')));}
 return box;
}
