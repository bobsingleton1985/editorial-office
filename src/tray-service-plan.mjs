import {SERVICE_V46} from './service-v46-contract.mjs';
// Shared, measured station registration. Actor motion remains at native scale/time.
export const TRAY_SERVICE = Object.freeze({version:1,priceCents:100,
  pour:{x:2.705,z:4.650,th:0},
  pick:{x:2.485079,z:4.389804,th:0},
  table:{x:.45,z:2.1,th:-Math.PI/2},
  glassSpacing:.1*1.5537539445117445,
});
export function trayPlan(recipients,durations,version=1,ownDrink=false){
  if(!Array.isArray(recipients)||recipients.length<1||recipients.length>3||new Set(recipients.map(x=>x.id)).size!==recipients.length)throw Error('Invalid service recipients');
  for(const n of ['HER-POUR','HER-TRAY-PICK','HER-TRAY-PUT'])if(!(durations[n]>0&&durations[n]<30))throw Error('Missing tray motion: '+n);
  const steps=[];
  [...recipients,...(ownDrink?[{id:'heroine'}]:[])].forEach((guest,index)=>steps.push(
    {kind:'walk',point:{...TRAY_SERVICE.pour,x:TRAY_SERVICE.pour.x-({benchN:0,benchM:1,benchS:2}[guest.seat]??(guest.id==='heroine'?3:index))*TRAY_SERVICE.glassSpacing},label:'подходит к бокалу'},
    {kind:'clip',clip:'HER-POUR',duration:durations['HER-POUR'],guest:guest.id,index,label:'наливает напиток'}));
  steps.push({kind:'walk',point:TRAY_SERVICE.pick,label:'подходит к подносу'},
    {kind:'clip',clip:'HER-TRAY-PICK',duration:durations['HER-TRAY-PICK'],label:'берёт поднос'},
    {kind:'walk',point:version===2?SERVICE_V46.start:TRAY_SERVICE.table,carrying:true,label:'несёт напитки к лавке'},
    ...(version===2?[{kind:'clip',clip:'HER-SERVICE-ENTRY',duration:SERVICE_V46.entrySeconds,label:'готовится поставить поднос'}]:[]),
    {kind:'clip',clip:version===2?'HER-SERVICE-V46':'HER-TRAY-PUT',duration:version===2?SERVICE_V46.duration:durations['HER-TRAY-PUT'],label:'ставит поднос с напитками'},
    {kind:'done',label:'поднос доставлен'});
  return steps;
}
