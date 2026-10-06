// Shared bubble metadata describes actual decisions, never inferred consent.
export function serviceBubbleLines(t) {
  const s=t?.service;
  if(s?.version!==2||!Number.isInteger(s.count)||s.count<1||s.count>3||!['each','treat'].includes(s.payment))return null;
  let title={order:'Заказ',offer:'Выпьем?',performer:'Обслуживание',reply:'Напиток',start:'Подаю',cancel:'Отмена'}[s.kind];
  if(!title)return null;
  if(s.kind==='reply')title={yes:'Согласен',no:'Отказываюсь',later:'Позже'}[t.mark]||title;
  if(s.kind==='performer')title={yes:'Обслужу',no:'Не обслужу',later:'Позже'}[t.mark]||title;
  const payment=s.payment==='each'?(s.kind==='reply'?'За свой счёт':'Каждый за себя'):
    s.payer===s.speaker&&t.mark!=='no'&&t.mark!=='later'?'Я угощаю':`Угощение: ${typeof s.payerName==='string'?s.payerName.slice(0,30):'инициатор'}`;
  const lines=[`${title} · ${s.count} ${s.count===1?'бокал':'бокала'}`,payment];
  if(['offer','order'].includes(s.kind)&&Array.isArray(s.guestNames)&&s.guestNames.length)lines.push(...(s.count===3?['Всем троим']:s.guestNames.map(n=>`Для: ${String(n).slice(0,24)}`)));
  if(s.kind==='start')lines.push(s.ownDrink?'Себе — за свой счёт':'Я не пью');
  return lines;
}
export function talkBubbleScale(camH,pixelHeight,imageHeight,service=false) {
  const pixels=Number.isFinite(pixelHeight)&&pixelHeight>0?pixelHeight:900;
  const ratio=service?Math.max(1,200/(.09*pixels*256/176)):1;
  const height=.09*(camH||1)*(imageHeight/176)*ratio;
  return {width:height*256/imageHeight,height};
}
export function talkRecipients(t) {
  if(!t)return [];
  const ids=Array.isArray(t.targets)?t.targets:[t.to];
  return [...new Set(ids.filter(id=>typeof id==='string'&&id))].slice(0,4);
}
export function talkAddresses(t,id) {return talkRecipients(t).includes(id);}
export function talkTarget(t,now) {
  const ids=talkRecipients(t);if(!ids.length)return null;
  return ids[Math.floor(Math.max(0,now-t.at)/1500)%ids.length];
}
