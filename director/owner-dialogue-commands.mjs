import {createHash} from 'node:crypto';
import {normalizeDialogueCommand} from '../relay/owner-dialogue-contract.mjs';
import {grantOwnerBonus} from './economy.mjs';
import {remember} from './economy-events.mjs';
const key=id=>createHash('sha256').update(id).digest('hex').slice(0,40);
// Accept normalized explicit commands or validated model interpretations of human instructions.
// Spoken replies and quotations never reach this effect boundary.
export function applyDialogueCommand(st,actor,turn,now,{canWork=false,physicalOptions=[]}={}){
 if(!turn.command)return null;
 const command=normalizeDialogueCommand(turn.command),fingerprint=JSON.stringify([actor,command]);
 const receipts=st.ownerDialogueEffects??={},old=receipts[turn.id];
 if(old){if(old.fingerprint!==fingerprint)throw Error('dialogue_id_conflict');turn.effect=old;return old;}
 let receipt;
 try{
  if(command.type==='money'){
   const award=grantOwnerBonus(st,{version:1,type:'owner_bonus',id:'dialogue_'+key(turn.id),target:actor,cents:command.cents},now);
   receipt={type:'money',status:'applied',cents:command.cents,ledgerIds:award.recipients.map(id=>`owner_bonus:${award.id}:${id}`),summary:`Передано ${(command.cents/100).toFixed(2)} USD от владельца.`};
  }else if(command.type==='request'){
   const option=physicalOptions.find(a=>a.id===command.action);if(!option)throw Error('requested_action_unavailable');
   receipt={type:'request',status:'requested',action:command.action,description:option.description,summary:'Просьба передана: '+option.description+' Герой сам решит, выполнять ли её и когда.'};
   remember(st,actor,{id:'owner-request:'+turn.id,event:'owner_action_requested',owner:'владелец газеты',action:command.action,summary:receipt.summary},now);
  }else{
   if(!canWork)throw Error('editorial_work_unsupported');
   if(command.deadlineAt!=null&&command.deadlineAt<=now)throw Error('deadline_in_past');
   if(st.tasks.filter(t=>t.ownerDialogueId&&t.by===actor).length>=10)throw Error('owner_task_queue_full');
   const id='owner-task-'+key(turn.id);
   st.tasks.push({id,title:command.title,brief:command.brief,by:actor,arrived:new Date(now).toISOString(),need_min:5,done_min:0,ownerDialogueId:turn.id,deadlineAt:command.deadlineAt,ownerRewardCents:command.rewardCents});
   receipt={type:'task',status:'assigned',taskId:id,title:command.title,brief:command.brief,deadlineAt:command.deadlineAt,rewardCents:command.rewardCents,summary:`Поручение «${command.title}» добавлено в очередь. Дополнительная премия за завершение: ${(command.rewardCents/100).toFixed(2)} USD.`};
   remember(st,actor,{id:'owner-task:'+id,event:'owner_task_assigned',task:id,owner:'владелец газеты',summary:receipt.summary},now);
  }
 }catch(e){receipt={type:command.type,status:'rejected',error:e.message,summary:({requested_action_unavailable:'Просьба не зарегистрирована: действие сейчас недоступно. Можно обсудить другую возможность.',editorial_work_unsupported:'Этот персонаж пока не умеет выполнять редакционные задания.',deadline_in_past:'Задание не добавлено: срок уже прошёл.',owner_task_queue_full:'Задание не добавлено: в очереди уже десять поручений.',economy_disabled:'Передача денег недоступна: экономика выключена.',balance_overflow:'Передача денег отклонена: превышен допустимый баланс.'})[e.message]||'Команда не выполнена.'};}
 receipt={...receipt,id:turn.id,actor,at:now,fingerprint};receipts[turn.id]=receipt;turn.effect=receipt;
 return receipt;
}
export function completeOwnerTask(st,actor,task,now){
 if(!task.ownerDialogueId||!(task.done_min>=task.need_min))return false;
 const receipt=st.ownerDialogueEffects?.[task.ownerDialogueId];
 if(!receipt||receipt.status==='completed')return false;
 let rewardError=null;
 if(task.ownerRewardCents>0){try{grantOwnerBonus(st,{version:1,type:'owner_bonus',id:'task_reward_'+key(task.ownerDialogueId),target:actor,cents:task.ownerRewardCents},now);}catch(e){rewardError=e.message;}}
 Object.assign(receipt,{status:'completed',completedAt:now,late:task.deadlineAt!=null&&now>task.deadlineAt,summary:`Поручение «${task.title}» завершено${task.deadlineAt!=null&&now>task.deadlineAt?' после срока':''}. ${rewardError?'Дополнительная премия не начислена: '+rewardError:('Дополнительная премия: '+(task.ownerRewardCents/100).toFixed(2)+' USD.')}`,rewardStatus:rewardError?'failed':'settled',rewardError});
 const turn=Object.values(st.chars).flatMap(p=>p.ownerDialogue||[]).find(t=>t.id===task.ownerDialogueId);if(turn)turn.effect=receipt;
 remember(st,actor,{id:'owner-task-completed:'+task.id,event:'owner_task_completed',task:task.id,owner:'владелец газеты',summary:receipt.summary},now);
 return true;
}
export function ownerTaskContext(st,actor,now){return st.tasks.filter(t=>t.by===actor&&t.ownerDialogueId).map(t=>({id:t.id,title:t.title,brief:t.brief,progressMinutes:t.done_min,requiredMinutes:t.need_min,deadlineAt:t.deadlineAt,overdue:t.deadlineAt!=null&&now>t.deadlineAt,rewardCents:t.ownerRewardCents,status:'assigned',completion:'Only witnessed work and the work_finished event complete this assignment; dialogue does not.'}));}

export function ownerRequestContext(st,actor){return Object.values(st.ownerDialogueEffects||{}).filter(r=>r.actor===actor&&r.type==='request'&&r.status==='requested').slice(-10).map(r=>({id:r.id,action:r.action,description:r.description,at:r.at,status:r.status,note:'This is a request from the human owner. Decide independently using actual available actions and present constraints; do not invent execution or an unavailable option.'}));}
export function recordOwnerRequestChoice(st,actor,action,now){let changed=false;for(const receipt of Object.values(st.ownerDialogueEffects||{})){if(receipt.actor!==actor||receipt.type!=='request'||receipt.status!=='requested'||receipt.action!==action)continue;Object.assign(receipt,{status:'chosen',chosenAt:now,summary:'Герой выбрал запрошенное действие: '+receipt.description+' Выбор не означает завершение исполнения.'});const t=Object.values(st.chars).flatMap(p=>p.ownerDialogue||[]).find(t=>t.id===receipt.id);if(t)t.effect=receipt;changed=true;}return changed;}

export function publicOwnerCommands(st,actor){return Object.values(st.ownerDialogueEffects||{}).filter(r=>r.actor===actor).sort((a,b)=>(a.completedAt??a.chosenAt??a.at)-(b.completedAt??b.chosenAt??b.at)).slice(-30).map(({fingerprint,...receipt})=>structuredClone(receipt));}
