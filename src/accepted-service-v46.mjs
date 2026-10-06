import * as T from 'three';
import {SERVICE_V46} from './service-v46-contract.mjs';
export {SERVICE_V46,SERVICE_SEATS} from './service-v46-contract.mjs';
export function createAcceptedServiceAssets(motions,props,bindings){
 const clips=Object.fromEntries(motions.animations.map(c=>[c.name,c]));
 for(const id of ['heroine','columnist','newspaper_editor','reporter','props'])if(!clips[id]||Math.abs(clips[id].duration-SERVICE_V46.duration)>.001)throw Error('Accepted service motion missing: '+id);
 if(!bindings)throw Error('Accepted service bindings missing');return {clips,props,bindings};
}
export function createAcceptedServicePlayer(root,holder,id,assets){
 const bases=[];root.traverse(o=>{if(!o.isBone&&!o.isMesh)bases.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]);});
 const source=assets.clips[id],targets=new Map();root.traverse(o=>{if(o.isBone)targets.set(id+'__'+o.name,o);});targets.set(id+'_holder',holder);
 const poseNodes=[];root.traverse(o=>{if(!o.isMesh)poseNodes.push(o);});let cleanPose=null;const restorePose=()=>{if(!cleanPose)return;for(const [o,p,q,s]of cleanPose){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);}cleanPose=null;};
 const skins=[];root.traverse(o=>{if(o.isSkinnedMesh&&assets.bindings[id]?.[o.name]){const inv=assets.bindings[id][o.name];skins.push({s:o.skeleton,original:o.skeleton.boneInverses.map(m=>m.clone()),accepted:o.skeleton.bones.map(b=>new T.Matrix4().fromArray(inv[b.name]))});}});let active=false;
 const bind=clip=>clip.tracks.map(t=>{const [n,p]=t.name.split('.'),o=targets.get(n);if(!o)throw Error('Service bone unavailable: '+n);return {o,p,read:t.createInterpolant()};});
 const tracks=bind(source),without=id==='heroine'&&assets.clips.heroine_without_self?bind(assets.clips.heroine_without_self):null;
 // Apply every channel each frame. A second AnimationMixer skips unchanged
 // channels, allowing the ordinary seated mixer to overwrite held source poses.
 const binding=on=>{if(on===active)return;for(const k of skins)k.s.boneInverses=on?k.accepted:k.original;active=on;};
 return {restorePose,get active(){return active;},binding,release(){restorePose();if(!active)return;for(const k of skins)k.s.boneInverses=k.original;active=false;},sample(t,ownDrink=true,blend=1){if(!cleanPose)cleanPose=poseNodes.map(o=>[o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]);if(!active){for(const k of skins)k.s.boneInverses=k.accepted;active=true;}for(const [o,p,q,s]of bases){o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);}const at=Math.min(source.duration,Math.max(0,t));for(const {o,p,read}of !ownDrink&&without?without:tracks)o[p].fromArray(read.evaluate(at));if(blend<1&&cleanPose)for(const [o,p,q,s]of cleanPose){o.position.lerp(p,1-blend);o.quaternion.slerp(q,1-blend);o.scale.lerp(s,1-blend);}holder.updateMatrixWorld(true);}};
}
export function createAcceptedServiceProps(scene,office,assets){
 const group=new T.Group();group.name='Accepted service v46';scene.add(group);group.visible=false;
 const objects=Array.from({length:9},(_,i)=>assets.props.scene.getObjectByName('service_prop_'+i)?.clone(true));if(objects.some(o=>!o))throw Error('Accepted service props missing');
 for(const o of objects)group.add(o);const mixer=new T.AnimationMixer(group),clip=assets.clips.props,action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();action.paused=true;let hidden=[];
 const samples=clip.tracks.map(track=>{const [n,p]=track.name.split('.');return {o:objects.find(o=>o.name===n),p,read:track.createInterpolant()};});
 const tablePose=clip.tracks.map(track=>{const [n,p]=track.name.split('.');return {n,p,value:Array.from(track.createInterpolant().evaluate((SERVICE_V46.deliveredFrame-SERVICE_V46.firstFrame)/30))};});
 return {group,sample(t,recipients,ownDrink=false,activeRecipients=recipients){group.visible=true;if(!hidden.length)office.traverse(o=>{if(/^BAR_.*(tray|tumblers_tray)/.test(o.name)){hidden.push([o,o.visible]);o.visible=false;}});action.time=Math.min(clip.duration,Math.max(0,t));mixer.update(0);for(const {o,p,read}of samples)o[p].fromArray(read.evaluate(action.time));const slots=g=>({benchN:1,benchM:2,benchS:3})[g.seat],present=new Set(recipients.map(slots)),active=new Set(activeRecipients.map(slots));objects.forEach((o,i)=>{o.visible=i===0||(i>=7&&ownDrink)||i<7&&present.has(Math.ceil(i/2));if(i>0&&i<7&&!active.has(Math.ceil(i/2))&&t>=(SERVICE_V46.deliveredFrame-SERVICE_V46.firstFrame)/30){for(const v of tablePose)if(v.n===o.name)o[v.p].fromArray(v.value);}});group.updateMatrixWorld(true);},blendFrom(from,alpha){for(const o of objects){const m=from.get(o.name);if(!m)continue;const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();m.decompose(p,q,s);o.position.lerp(p,1-alpha);o.quaternion.slerp(q,1-alpha);o.scale.lerp(s,1-alpha);}group.updateMatrixWorld(true);},restore(){group.visible=false;for(const [o,v]of hidden)o.visible=v;hidden=[];}};
}
