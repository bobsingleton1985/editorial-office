// One assignment per accepted command. Retry only explicit rate-limit refusals;
// an ambiguous network failure is never replayed as another assignment.
export function createNeedSender(send, pause=ms=>new Promise(r=>setTimeout(r,ms))) {
 const pending=new Map();let busy=false;
 async function drain() {
  if(busy)return;busy=true;
  try {while(pending.size) {
   const [key,item]=pending.entries().next().value;pending.delete(key);let accepted=false;
   try {for(let attempt=0;attempt<3;attempt++) {
    const response=await send(item.person,item.need,item.value);
    if(response.status!==429){accepted=response.ok;break;}
    if(attempt===2)break;
    await pause(350);
    if(pending.has(key))break; // the newer edit replaces this refused command
   }}catch{}finally{item.resolve(accepted);}
  }}finally{busy=false;}
 }
 return (person,need,value)=>new Promise(resolve=>{
  const key=person+':'+need;pending.get(key)?.resolve(false);
  pending.set(key,{person,need,value,resolve});void drain();
 });
}
