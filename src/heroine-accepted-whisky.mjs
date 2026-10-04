import * as THREE from 'three';
// Reuse the accepted whisky executor and its shared prop set. HER-POUR stays separate.
export function attachAcceptedHeroineWhisky(extra,{clip,record,props,contacts}) {
 if(!props?.barReady||!clip||Math.abs(clip.duration-record.bar.D)>1e-5)throw Error('Accepted HER whisky: missing or mismatched input');
 let activeTime=null;
 const group=props.groups[0],glass=group.getObjectByName('WHISKY tumbler'),liquid=group.getObjectByName('WHISKY whisky');
 const originalGlass=record.arr(record.bar.props.tumblerserve.m),originalLiquid=record.arr(record.bar.props.whiskyinglass.m);
 function setBar(t){props.setBar(t);const f=Math.min(contacts.frames-1,Math.max(0,t*contacts.fps)),i=Math.floor(f),j=Math.min(contacts.frames-1,i+1),k=f-i;
  for(const [object,arr]of [[glass,contacts.glass],[liquid,contacts.liquid]])for(let n=0;n<16;n++)object.matrix.elements[n]=arr[i*16+n]+(arr[j*16+n]-arr[i*16+n])*k;
  group.updateMatrixWorld(true);activeTime=t;
 }
 // Another actor uses the original shared props; ensure its same-time call can restore our overlay too.
 const originalSet=props.setBar;
 props.setBar=t=>{originalSet(t);const f=Math.min(record.bar.n-1,Math.max(0,t*record.fps)),i=Math.floor(f),j=Math.min(record.bar.n-1,i+1),k=f-i;for(const [o,arr]of [[glass,originalGlass],[liquid,originalLiquid]])for(let n=0;n<16;n++)o.matrix.elements[n]=arr[i*16+n]+(arr[j*16+n]-arr[i*16+n])*k;group.updateMatrixWorld(true);};
 extra.shared={...extra.shared,whisky:{...props,setBar},whiskyRec:record};extra.whiskyBarClip=clip;extra.whiskyBarOnly=true;
 extra.whiskySipContact=B=>{
  if(activeTime===null||!glass.visible||!group.visible||!contacts.sipFrames[Math.min(contacts.frames-1,Math.max(0,Math.round(activeTime*contacts.fps)))])return false;
  B.head.updateWorldMatrix(true,false);glass.updateWorldMatrix(true,false);
  const mouth=new THREE.Vector3(.0005081957,-.05945908,.1225681657).applyMatrix4(B.head.matrixWorld),lip=new THREE.Vector3(...contacts.lip).applyMatrix4(glass.matrixWorld);
  return mouth.distanceTo(lip)<.004*(1/.644);
 };
 return {evidence:()=>({time:activeTime,glassMatrix:glass.matrixWorld.toArray(),glassVisible:glass.visible&&group.visible,phase:activeTime===null?'off':record.bar.phase.filter(x=>x[0]<=activeTime*30).at(-1)?.[1]})};
}
