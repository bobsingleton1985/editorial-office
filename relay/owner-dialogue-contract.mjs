export function normalizeDialogueCommand(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('invalid_dialogue_command');
 if(value.type==='money'){
  if(Object.keys(value).some(k=>!['type','cents'].includes(k))||!Number.isSafeInteger(value.cents)||value.cents<=0)throw Error('invalid_dialogue_command');
  return {type:'money',cents:value.cents};
 }
 if(value.type==='request'){
  if(Object.keys(value).some(k=>!['type','action'].includes(k))||typeof value.action!=='string'||!value.action||value.action.length>250)throw Error('invalid_dialogue_command');
  return {type:'request',action:value.action};
 }
 if(value.type==='task'){
  if(Object.keys(value).some(k=>!['type','title','brief','deadlineAt','rewardCents'].includes(k))||typeof value.title!=='string'||!value.title.trim()||value.title.length>160||typeof value.brief!=='string'||!value.brief.trim()||value.brief.length>500||!Number.isSafeInteger(value.rewardCents)||value.rewardCents<0||value.deadlineAt!=null&&(!Number.isSafeInteger(value.deadlineAt)||value.deadlineAt<=0))throw Error('invalid_dialogue_command');
  return {type:'task',title:value.title.trim(),brief:value.brief.trim(),deadlineAt:value.deadlineAt??null,rewardCents:value.rewardCents};
 }
 throw Error('invalid_dialogue_command');
}
export function dollarsToCents(value,{allowZero=false}={}){
 if(typeof value!=='string'||!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))throw Error('invalid_amount');
 const [whole,fraction='']=value.trim().replace(',','.').split('.');
 const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(cents<(allowZero?0n:1n)||cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid_amount');
 return Number(cents);
}
