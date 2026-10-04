// Two fresh matching samples bound an observed work interval. First samples, reconnects,
// command/task changes and gaps earn nothing retroactively; samples never persist across restart.
const samples=new WeakMap();
export function workInterval(st,id,cap,now){
 let previous=samples.get(st);if(!previous){previous=new Map();samples.set(st,previous);}
 const p=st.chars[id],a=cap?.actors?.[id],task=st.tasks.find(t=>t.by===id),old=previous.get(id);
 const at=cap?.at;
 const valid=Number.isFinite(at)&&at<=now&&now-at<=3500&&a?.moneyWitness===1&&Number.isFinite(a.moneyWorkMs)&&a.loaded===true&&a.executing===true&&a.activity==='work'&&p.activity==='work'&&a.seq===p.seq&&!p.executionGate&&p.arriveAt<=at&&task;
 if(!valid){previous.delete(id);return 0;}
 if(old&&at<=old.at)return 0;
 previous.set(id,{at,seq:p.seq,task:task.id,ms:a.moneyWorkMs});
 return old&&old.seq===p.seq&&old.task===task.id&&at-old.at<=3500?Math.max(0,Math.min(2000,at-old.at,a.moneyWorkMs-old.ms)):0;
}

export function resetWorkWitness(st){samples.delete(st);}
