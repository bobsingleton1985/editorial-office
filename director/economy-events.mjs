import {addMemory} from './daily-memory.mjs';
// Financial episodes use the same memory read by Jev. Durable obligations live in the ledger.
import {observeFinancialFact} from './relationship-core.mjs';
export const DAY=86400000;
export function remember(st,id,event,now){
 const p=st.chars[id];if(!p)return;
 p.memory??=[];if(event.id&&p.memory.some(e=>e.id===event.id))return;
 addMemory(p,{...event,at:now,source:'money_ledger'});
}
export const observeFact=observeFinancialFact;
