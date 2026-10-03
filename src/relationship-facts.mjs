// Public facts, not inferred thoughts. Shared by Jev choices and the owner's view.
export const RELATION_EVIDENCE = Object.freeze({
  gift_accepted:{positive:true},loan_repaid:{positive:true},loan_forgiven:{positive:true},loan_overdue:{positive:false},
  flirt_address:{positive:false}, neutral_address: { positive:false }, friendly_address: { positive:true },
  self_tension: { positive:false }, directed_objection: { positive:false, guarded:true },
  conversation_experienced: { positive:true }, work_completed: { positive:true },
});
export function relationshipFact(e, name='Коллега') {
  if(!e)return 'Основание не записано.';
  if(e.kind==='conversation_experienced')return `${name}: состоялось взаимное адресованное общение (${Math.round(e.participatingSeconds)} с подтверждённого участия). Тема и мысли собеседника неизвестны.`;
  if(e.kind==='work_completed')return `${name} завершил редакционную задачу «${e.title}». Это событие работы редакции; помощь лично тебе не установлена.`;
  const text={gift_accepted:'сделал добровольный подарок, который ты принял; это не обязывает к симпатии',loan_repaid:'вернул тебе долг',loan_forgiven:'простил твой долг',loan_overdue:'ещё не вернул долг к согласованному сроку; причина неизвестна',flirt_address:'выразил собственный интерес флиртом; взаимный интерес этим не подтверждён',neutral_address:'спокойно обратился к тебе',friendly_address:'доброжелательно обратился к тебе',self_tension:'выразил собственное напряжение',directed_objection:'выразил адресное возражение'}[e.kind];
  return text?`${name} ${text}.`:'Наблюдение не распознано.';
}
export function appraisalMeaning(stance,before,e) {
  if(stance===before)return 'Сохранить прежнее отношение, учитывая это наблюдение.';
  if(stance==='neutral')return 'Пересмотреть отношение как нейтральное; не приписывать коллеге неизвестные намерения.';
  if(stance==='guarded')return 'Стать настороженнее после наблюдавшегося адресного возражения.';
  if(['gift_accepted','loan_repaid','loan_forgiven'].includes(e.kind))return 'Самостоятельно оценить финансовый поступок коллеги доброжелательнее; подарок не обязывает менять отношение.';
  if(e.kind==='work_completed')return 'Доброжелательнее отнестись к коллеге, оценив его завершённую работу для редакции.';
  if(e.kind==='conversation_experienced')return 'Доброжелательнее отнестись к коллеге, оценив состоявшееся взаимное общение.';
  return 'Доброжелательнее отнестись к коллеге после его выраженного доброжелательного обращения.';
}
