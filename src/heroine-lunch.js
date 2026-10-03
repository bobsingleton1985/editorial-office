import * as THREE from 'three';
// Play the accepted HER tracks and attachments without the colleagues' IK or time warp.
export function createHeroineLunch({ B, addon, strip, seatBase, S, clipsOut }) {
  const group=new THREE.Group(); group.name='HER accepted meal';group.visible=false;
  const {clips,plate,bowl,soup,utensils}=addon;
  const dur={};for(const [n,c] of Object.entries(clips)){const sc=strip('HER_'+n,c,seatBase);clipsOut[n]=sc.clip;dur[n]=sc.clip.duration;}
  group.add(plate,bowl,soup);
  for(const p of utensils){B['hand_'+p.side].add(p.object);p.object.matrix.copy(p.local).decompose(p.object.position,p.object.quaternion,p.object.scale);p.object.visible=false;}
  let meal=null;
  const timeline=dish=>{let t=1.5;return (dish==='soup'?['stir','soup','soup','soup']:['fork','fork','fork']).map(n=>{const e={n,t,d:dur[n]};t+=e.d;return e;});};
  function setFrame(F){group.position.set(F.x,0,F.z);group.rotation.y=F.th;group.scale.setScalar(S);group.updateMatrixWorld(true);}
  function begin(dish,F,seat){if(!['soup','sandwich'].includes(dish))throw Error('Unsupported HER meal '+dish);meal={dish,seat,tl:timeline(dish)};setFrame(F);group.visible=true;plate.visible=dish==='sandwich';bowl.visible=soup.visible=dish==='soup';for(const p of utensils)p.object.visible=p.dish===dish;}
  function end(){meal=null;group.visible=false;for(const p of utensils)p.object.visible=false;}
  function mix(t){if(!meal||t<1.5)return [{n:null,i:-1,lt:0,w:1}];const L=meal.tl;let i=L.findIndex(e=>t<e.t+e.d);if(i<0){const e=L.at(-1),w=Math.min(1,(t-e.t-e.d)/.3);return [{n:e.n,i:L.length-1,lt:e.d-1e-6,w:1-w},{n:null,i:-1,lt:0,w}];}const e=L[i],lt=t-e.t,k=Math.min(1,lt/.3);return [{n:e.n,i,lt,w:k},{n:i?L[i-1].n:null,i:i-1,lt:i?L[i-1].d-1e-4:0,w:1-k}];}
  const duration=dish=>{const l=timeline(dish),e=l.at(-1);return e.t+e.d+.3;};
  return {autoComplete:true,group,dur,clips:clipsOut,begin,end,mix,setFrame,post(){},probeGrab(){},done:t=>!meal||t>=duration(meal.dish),active:()=>!!meal,dish:()=>meal?.dish||null,seat:()=>meal?.seat||null,mealDuration:duration};
}
