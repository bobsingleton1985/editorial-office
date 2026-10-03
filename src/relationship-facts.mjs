// Public facts, not inferred thoughts. Shared by Jev choices and the owner's view.
export const RELATION_EVIDENCE = Object.freeze({
  neutral_address: { positive:false }, friendly_address: { positive:true },
  self_tension: { positive:false }, directed_objection: { positive:false, guarded:true },
  conversation_experienced: { positive:true }, work_completed: { positive:true },
});
export function relationshipFact(e, name='Коллега') {
  if(!e)return 'Основание не записано.';
  if(e.kind==='conversation_experienced')return `${name}: состоялось взаимное адресованное общение (${Math.round(e.participatingSeconds)} с подтверждённого участия). Тема и мысли собеседника неизвестны.`;
  if(e.kind==='work_completed')return `${name} завершил редакционную задачу «${e.title}». Это событие работы редакции; помощь лично тебе не установлена.`;
  const text={neutral_address:'спокойно обратился к тебе',friendly_address:'доброжелательно обратился к тебе',self_tension:'выразил собственное напряжение',directed_objection:'выразил адресное возражение'}[e.kind];
  return text?`${name} ${text}.`:'Наблюдение не распознано.';
}
export function appraisalMeaning(stance,before,e) {
  if(stance===before)return 'Сохранить прежнее отношение, учитывая это наблюдение.';
  if(stance==='neutral')return 'Пересмотреть отношение как нейтральное; не приписывать коллеге неизвестные намерения.';
  if(stance==='guarded')return 'Стать настороженнее после наблюдавшегося адресного возражения.';
  if(e.kind==='work_completed')return 'Доброжелательнее отнестись к коллеге, оценив его завершённую работу для редакции.';
  if(e.kind==='conversation_experienced')return 'Доброжелательнее отнестись к коллеге, оценив состоявшееся взаимное общение.';
  return 'Доброжелательнее отнестись к коллеге после его выраженного доброжелательного обращения.';
}
