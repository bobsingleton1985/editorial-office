import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {processOwnerGiftRepairs} from '../director/owner-gift-repairs.mjs';
import {applyOwnerIntent} from '../director/owner-intent.mjs';
import {ensureEconomy,UNCONFIGURED_ECONOMY} from '../director/economy.mjs';
const config={...UNCONFIGURED_ECONOMY,enabled:true,startingCents:1000};
function fixture(funded=true){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gift-repair-')),turn={id:'original',text:'Дарю тебе10,3 из них репортёру',status:'answered',source:'phone',reply:'Спасибо'};
 const st={chars:{heroine:{memory:[],ownerDialogue:[turn]},reporter:{memory:[]}},tasks:[]};ensureEconomy(st,config,1);if(funded)applyOwnerIntent(st,turn,{target:'heroine',command:{type:'money',cents:1000}},()=>[],()=>true,2);
 const job={version:1,type:'owner_gift_repair',id:'repair',turnId:turn.id,expectedText:turn.text,target:'heroine',cents:1000,forward:[{target:'reporter',cents:300}]};fs.writeFileSync(path.join(dir,'repair.json'),JSON.stringify(job));return {st,turn,dir,job};
}
test('repair waits for durable checkpoint and resumes without double credit or forwarding',()=>{
 const {st,turn,dir}=fixture();try{
  assert.throws(()=>processOwnerGiftRepairs(st,dir,3,()=>false),/repair_checkpoint_failed/);assert(!fs.existsSync(path.join(dir,'receipts/repair.json')));assert.equal(st.economy.accounts.heroine,1700);assert.equal(st.economy.accounts.reporter,1300);
  const restored=JSON.parse(JSON.stringify(st));processOwnerGiftRepairs(restored,dir,4,()=>true);assert.equal(restored.economy.ledger.filter(t=>t.kind==='bonus').length,1);assert.equal(restored.economy.ledger.filter(t=>t.kind==='gift').length,1);assert.equal(restored.chars.heroine.ownerDialogue[0].reply,'Спасибо');assert.equal(processOwnerGiftRepairs(restored,dir,5,()=>true),null);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('repair cannot change the original message or amount that was already funded',()=>{
 for(const mutate of [j=>j.expectedText='другое распоряжение',j=>j.cents=1100]){
  const {st,dir,job}=fixture();try{mutate(job);fs.writeFileSync(path.join(dir,'repair.json'),JSON.stringify(job));const before=structuredClone(st.economy),r=processOwnerGiftRepairs(st,dir,3,()=>true);assert.equal(r.status,'rejected');assert.deepEqual(st.economy,before);}finally{fs.rmSync(dir,{recursive:true});}
 }
});

test('a repair cannot fund an ordinary answered conversation with no prior money receipt',()=>{
 const {st,dir}=fixture(false);try{const before=structuredClone(st.economy),r=processOwnerGiftRepairs(st,dir,3,()=>true);assert.equal(r.status,'rejected');assert.equal(r.error,'missing_funded_gift');assert.deepEqual(st.economy,before);}finally{fs.rmSync(dir,{recursive:true});}
});

test('rejected split receipt and missing funding indexes cannot be reconciled or mint a new gross gift',()=>{
 for(const variant of ['rejected','missingFunding']){
  const {st,dir,job}=fixture();try{
   if(variant==='rejected'){st.ownerDialogueEffects.original.status='rejected';st.ownerDialogueEffects.original.fingerprint=JSON.stringify(['heroine',{type:'money',cents:1000},[{target:'reporter',cents:300}]]);}
   else{delete st.economy.ownerBonusReceipts;delete st.economy.receipts[st.ownerDialogueEffects.original.ledgerIds[0]];}
   const before=structuredClone(st.economy),r=processOwnerGiftRepairs(st,dir,3,()=>true);assert.equal(r.status,'rejected');assert.equal(r.error,'missing_funded_gift');assert.deepEqual(st.economy,before);
  }finally{fs.rmSync(dir,{recursive:true});}
 }
});
