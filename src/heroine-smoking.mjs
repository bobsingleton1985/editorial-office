import * as THREE from 'three';
// HER skeleton only; keep the original shared prop geometry and lighting tracks.
export function attachHeroineSmoking(extra,bank,props){
 const key=n=>n.replace(/[^A-Za-z0-9]/g,'').toLowerCase(),own=new Set(['smpropcigarette','smproplighter','smproplighterflame']);
 const k=.959280767191607;
 const animations=bank.animations.map(c=>{const x=c.clone(),source=props.animations.find(a=>a.name===c.name);if(!source)throw Error('Missing smoking prop source '+c.name);
  for(const t of source.tracks)if(own.has(key(THREE.PropertyBinding.parseTrackName(t.name).nodeName))){const a=t.clone();if(a.name.endsWith('.position'))for(let i=0;i<a.values.length;i++)a.values[i]*=k;x.tracks.push(a);}return x;});
 const find=n=>{let out;props.scene.traverse(o=>{if(key(o.name)===n)out=o;});if(!out)throw Error('Missing smoking prop '+n);return out;};
 const mouth=find('smkmouth'),fwd=find('smkmouthfwd');mouth.position.set(.0005081957,-.05945908,.1225681657);fwd.position.copy(mouth.position).add(new THREE.Vector3(0,0,.03));
 extra.smoke={scene:props.scene,animations};extra.smokeProfile={standingIK:true,standOnly:true,bodyScale:k};
}
