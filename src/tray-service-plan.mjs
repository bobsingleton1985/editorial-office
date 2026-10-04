// Shared, measured station registration. Actor motion remains at native scale/time.
export const TRAY_SERVICE = Object.freeze({version:1,priceCents:100,
  pour:{x:2.705,z:4.650,th:0},
  pick:{x:2.485079,z:4.389804,th:0},
  table:{x:.45,z:2.1,th:-Math.PI/2},
  glassSpacing:.1*1.5537539445117445,
});
export function trayPlan(recipients,durations){
  if(!Array.isArray(recipients)||recipients.length<1||recipients.length>3||new Set(recipients.map(x=>x.id)).size!==recipients.length)throw Error('Invalid service recipients');
  for(const n of ['HER-POUR','HER-TRAY-PICK','HER-TRAY-PUT'])if(!(durations[n]>0&&durations[n]<30))throw Error('Missing tray motion: '+n);
  const steps=[];
  recipients.forEach((guest,index)=>steps.push(
    {kind:'walk',point:{...TRAY_SERVICE.pour,x:TRAY_SERVICE.pour.x-index*TRAY_SERVICE.glassSpacing},label:'подходит к бокалу'},
    {kind:'clip',clip:'HER-POUR',duration:durations['HER-POUR'],guest:guest.id,index,label:'наливает напиток'}));
  steps.push({kind:'walk',point:TRAY_SERVICE.pick,label:'подходит к подносу'},
    {kind:'clip',clip:'HER-TRAY-PICK',duration:durations['HER-TRAY-PICK'],label:'берёт поднос'},
    {kind:'walk',point:TRAY_SERVICE.table,carrying:true,label:'несёт напитки к лавке'},
    {kind:'clip',clip:'HER-TRAY-PUT',duration:durations['HER-TRAY-PUT'],label:'ставит поднос с напитками'},
    {kind:'done',label:'поднос доставлен'});
  return steps;
}
