// Short narrative from recorded facts only. No model call, invented dialogue or causal inference.
const declensions={heroine:['Героиня','героине','героиню','героини','героиней'],reporter:['Репортёр','репортёру','репортёра','репортёра','репортёром'],columnist:['Колумнист','колумнисту','колумниста','колумниста','колумнистом'],newspaper_editor:['Редактор','редактору','редактора','редактора','редактором']};
const plural=(n,one,few,many)=>n%10===1&&n%100!==11?one:n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?few:many;
const assessed=d=>d&&Number.isFinite(d.value)&&(d.assessedAt||d.updatedAt||d.revision>0||d.migratedFrom);
export function dayStory(events=[],state=null,options={}){
 const names=options.names||state?.names||{},name=(id,form=0)=>declensions[id]&&names[id]===declensions[id][0]?declensions[id][form]:form?'«'+(names[id]||id||'участник')+'»':names[id]||id||'Участник';
 const past=(id,male,female)=>id==='heroine'?female:male;
 const groups=new Map(),blocks=[];
 const add=(at,text,source)=>blocks.push({at,from:Math.min(...source.map(e=>e.at)),text,eventIds:source.map(e=>e.id)});
 const chronological=[...events].sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 const group=(key,e)=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);};
 for(const e of chronological){
  if(e.kind==='work_completed')group('work',e);
  else if(e.kind==='relationship_changed')group('relation:'+e.facts.actor+':'+e.facts.partner,e);
  else if(e.kind==='conversation')group('conversation:'+e.people.join(','),e);
  else if(e.kind.startsWith('dance_'))group('dance:'+e.facts.actor+':'+(e.facts.episodeId||e.facts.startedAt||e.id),e);
  else if(e.kind.startsWith('performance_'))group('performance:'+e.people.join(','),e);
  else if(e.kind.startsWith('money_')||e.kind.startsWith('debt_'))group('money',e);
  else if(e.kind==='flirt'){
   group('flirt',e);
  }else if(e.kind==='flirt_response')group('flirt_response',e);
  else if(e.kind==='invitation_answer')group('invitation:'+e.people.join(','),e);
  else if(e.kind==='objection')add(e.at,`${name(e.facts.actor)} ${past(e.facts.actor,'возразил','возразила')} ${name(e.facts.partner,1)}. Причина в записи не указана.`,[e]);
 }
 const relationship=(a,b,key,v)=>{
  const to=name(b,1),withName=name(b,4),gen=name(b,3),acc=name(b,2);
  const text={romance:{0:`не испытывает романтического интереса к ${to}`,1:`испытывает романтический интерес к ${to}`,2:`чувствует влюблённость в ${acc}`,3:`чувствует сильную влюблённость в ${acc}`},sympathy:{'-2':`предпочитает избегать общества ${gen}`,'-1':`неохотно общается с ${withName}`,0:`относится к ${to} нейтрально`,1:`охотно проводит время с ${withName}`,2:`чувствует сильную привязанность к ${to}`},professional:{'-2':`не доверяет профессиональным умениям ${gen}`,'-1':`сомневается в профессиональных умениях ${gen}`,0:`пока не имеет профессиональной оценки ${gen}`,1:`уважает профессиональные умения ${gen}`,2:`высоко ценит профессиональные умения ${gen}`},personal:{'-2':`больше не испытывает уважения к ${to}`,'-1':`испытывает разочарование в ${withName}`,0:`ещё присматривается к ${to}`,1:`уважает ${acc} как человека`,2:`глубоко уважает ${acc} как человека`},jealousy:{0:`не отмечает ревности к ${to}`,1:`испытывает беспокойство в отношениях с ${withName}`,2:`ревнует ${acc}`,3:`сильно ревнует ${acc}`}};
  return text[key]?.[v];
 };
 for(const [key,list]of groups){
  const last=list.at(-1),at=last.at;
  if(key==='work'){
   const actors=[...new Set(list.map(e=>e.facts.actor))].map(id=>name(id));
   const titles=[...new Set(list.map(e=>e.facts.title).filter(Boolean))].slice(-2);
   add(at,`${actors.join(' и ')} ${actors.length===1?past(list[0].facts.actor,'подготовил','подготовила'):'подготовили'} ${list.length} ${plural(list.length,'материал','материала','материалов')}${titles.length?' — в том числе «'+titles.join('» и «')+'»':''}.`,list);
  }else if(key.startsWith('relation:')){
   const {actor,partner}=last.facts,latest=new Map(list.map(e=>[e.facts.dimension,e]));
   const phrases=['sympathy','romance','professional','personal','jealousy'].map(d=>latest.has(d)?relationship(actor,partner,d,latest.get(d).facts.after):null).filter(Boolean);
   if(!phrases.length)continue;
   let text=`${name(actor)} ${phrases.slice(0,2).join(' и ')}.`;
   if(latest.get('romance')?.facts.after>0){
    const reverse=state?.relations?.[partner]?.[actor]?.dimensions?.romance;
    text+=assessed(reverse)&&options.stateDay===options.date&&reverse.value===0?` К последнему снимку ${name(partner)} романтического интереса к ${name(actor,1)} не отмечает.`:' Ответные чувства этими записями не подтверждены.';
   }
   add(at,text,list);
  }else if(key.startsWith('conversation:')){
   const who=last.people.map(id=>name(id)).join(' и '),n=list.length;
   add(at,`${who} ${n===1?'пообщались':n===2?'дважды пообщались':`пообщались ${n} ${plural(n,'раз','раза','раз')}`}.${list.some(e=>Object.values(e.facts.reasons||{}).some(r=>r.reason==='self_leave'))?' В одном из эпизодов участник сам решил закончить общение.':''}`,list);
  }else if(key.startsWith('dance:')){
   const actor=last.facts.actor,complete=list.some(e=>e.kind==='dance_finished'&&e.facts.reason==='executor_completed');
   add(at,`${name(actor)} ${past(actor,'танцевал','танцевала')}.${complete?' Завершение танца подтвердил исполнитель сцены.':last.kind==='dance_finished'?' Танец закончился при переходе к другому занятию.':' Окончание танца пока не записано.'}`,list);
  }else if(key.startsWith('performance:')){
   const who=last.people.map(id=>name(id)).join(' и '),paid=list.filter(e=>e.kind==='performance_completed'),cancelled=list.filter(e=>e.kind==='performance_cancelled'),agreed=list.some(e=>e.kind==='performance_agreed'),offered=list.some(e=>e.kind==='performance_offered');
   let text=agreed?`${who} договорились о выступлении.`:offered?`Для пары «${who}» появилось предложение выступления.`:'';
   if(paid.length)text+=` ${paid.length} ${plural(paid.length,'выступление было исполнено','выступления были исполнены','выступлений были исполнены')} и оплачено.`;
   if(cancelled.length)text+=` ${cancelled.length===1?'Выступление закончилось':'Выступления закончились'} отменой без оплаты.`;
   if(!paid.length&&!cancelled.length)text+=' Полное исполнение ещё не подтверждено.';text=text.trim();if(!agreed&&!offered)text=`Для пары «${who}»: ${text}`;
   add(at,text,list);
  }else if(key==='flirt')for(const e of list){
   const f=e.facts,reply=chronological.find(x=>x.kind==='flirt_response'&&f.flirtId&&x.facts.replyTo===f.flirtId);
   const answer=reply?.facts.answer,tail={reciprocate:'В ответ последовал взаимный флирт.',friendly:'Ответ обозначил дружеское общение без романтического сближения.',later:'В ответ сближение отложили.',decline:'В ответ последовал отказ от романтического сближения.'}[answer];
   add(reply?.at||e.at,`${name(f.actor)} ${past(f.actor,'проявил','проявила')} флирт по отношению к ${name(f.partner,1)}. ${tail||'Связанный явный ответ в этих записях не найден.'}`,reply?[e,reply]:[e]);
  }else if(key==='flirt_response')for(const e of list){
   if(chronological.some(x=>x.kind==='flirt'&&x.facts.flirtId===e.facts.replyTo))continue;
   const f=e.facts,tail={reciprocate:`${past(f.actor,'ответил','ответила')} взаимным флиртом`,friendly:'обозначает только дружеское общение',later:'откладывает романтическое сближение',decline:'отказывается от романтического сближения'}[f.answer];
   if(tail)add(e.at,`${name(f.actor)} ${tail} в ответ на обращение ${name(f.partner,3)}.`,[e]);
  }else if(key==='money'){
   const wage=list.filter(e=>e.kind==='money_work').reduce((sum,e)=>sum+(e.facts.cents||0),0),other=list.filter(e=>e.kind!=='money_work');
   let text=wage?`За выполненную работу начислено ${(wage/100).toLocaleString('ru-RU')} USD.`:'';
   const bonuses=other.filter(e=>e.kind==='money_bonus');
   for(const e of bonuses)text+=` Владелец начислил премию ${(e.facts.cents/100).toLocaleString('ru-RU')} USD для ${name(e.facts.to,3)}.`;
   const forgiven=other.filter(e=>e.kind==='debt_forgiven'),loans=other.filter(e=>e.kind==='money_loan'),gifts=other.filter(e=>e.kind==='money_gift'),overdue=other.filter(e=>e.kind==='money_loan_overdue');
   if(gifts.length)text+=gifts.length===1?' Был принят добровольный подарок.':' Были приняты добровольные подарки.';if(loans.length)text+=' Между коллегами появились обязательства по займам.';if(forgiven.length)text+=' Сохранились и прощённые долги.';if(overdue.length)text+=' У некоторых долгов прошёл срок возврата; причина задержки неизвестна.';
   if(!text.trim()&&other.length)text='В денежной истории редакции сохранились сделки и ответы на предложения; подробности — в событиях ниже.';
   if(text)add(at,text.trim(),list);
  }else if(key.startsWith('invitation:')&&!groups.has('conversation:'+last.people.join(','))){
   const f=last.facts,answer={accept:'согласие',decline:'отказ',defer:'отсрочка'}[f.answer];
   if(answer)add(at,`Для ${last.people.map(id=>'«'+name(id)+'»').join(' и ')} сохранился ответ на приглашение к общению — ${answer}. Состоявшееся общение этим ответом не установлено.`,list);
  }
 }
 const included=(b,test)=>b.eventIds.some(id=>events.some(e=>e.id===id&&test(e)));
 const priority=b=>included(b,e=>e.kind==='flirt'||e.kind==='flirt_response'||e.kind==='relationship_changed'&&e.facts.dimension==='romance')?0:included(b,e=>e.kind.startsWith('dance_'))?1:included(b,e=>e.kind==='relationship_changed')?2:included(b,e=>e.kind==='conversation')?3:4;
 const overview=blocks.filter(b=>included(b,e=>e.kind==='work_completed'||e.kind.startsWith('money_')||e.kind.startsWith('debt_'))).sort((a,b)=>a.from-b.from).slice(0,2);
 const narrative=blocks.filter(b=>!overview.includes(b)).sort((a,b)=>priority(a)-priority(b)||b.at-a.at).slice(0,5-overview.length).sort((a,b)=>a.from-b.from);
 const paragraphs=[];
 if(overview.length)paragraphs.push({text:overview.map(b=>b.text).join(' '),eventIds:overview.flatMap(b=>b.eventIds)});
 if(narrative.length)paragraphs.push({text:narrative.map((b,i)=>i&&b.from>narrative[i-1].at?(i===1?'Позже ':'Затем ')+b.text:b.text).join(' '),eventIds:narrative.flatMap(b=>b.eventIds)});
 if(!paragraphs.length)paragraphs.push({text:'Для этого дня и выбранных участников сохранившихся событий пока недостаточно, чтобы рассказать историю.',eventIds:[]});
 return {paragraphs,source:'recorded_facts',complete:false};
}
