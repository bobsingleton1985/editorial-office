import * as THREE from 'three';
export function heroineProps({B,scene,office,S},data,shared){
 const group=new THREE.Group();group.name='HER native props';group.visible=false;scene.add(group);
 const bottle=new THREE.Group();bottle.add(data.bottle.scene);data.bottle.scene.scale.setScalar(data.cfg.prop_scale);const cap=bottle.getObjectByName('Bottle_Cap');if(cap)cap.visible=false;group.add(bottle,data.glass.scene);data.glass.scene.scale.setScalar(data.cfg.prop_scale);data.glass.scene.position.set(-.12,data.cfg.table_height,.43*.9320998491663383);
 const c=data.cfg,grip=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(c.position),new THREE.Quaternion().fromArray(c.quaternion),new THREE.Vector3(1,1,1));let active=false;
 const support=[];office.traverse(o=>{if(o.isMesh&&(/^BAR_merged/.test(o.name)||/^BAR_.*tray/.test(o.name)))support.push(o);});office.updateMatrixWorld(true);
 let supportKey='',startP,endP;
 function onSurface(values){const p=new THREE.Vector3().fromArray(values),w=p.clone().applyMatrix4(group.matrixWorld);const ray=new THREE.Raycaster(new THREE.Vector3(w.x,4,w.z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObjects(support,false).find(h=>h.point.y>1&&h.point.y<2);if(!hit)throw Error('HER pour: no bar support surface');w.y=hit.point.y;return group.worldToLocal(w);}
 const sm=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 function post(id,t,F){const want=id==='HER-POUR';group.visible=want;if(active!==want){if(shared.whisky?.groups[0])shared.whisky.groups[0].visible=!want;active=want;}if(!want)return;
 group.position.set(F.x,0,F.z);group.rotation.y=F.th;group.scale.setScalar(S);group.updateMatrixWorld(true);
 const key=JSON.stringify(F);if(key!==supportKey){startP=onSurface(c.table_start.position);endP=onSurface(c.table_end.position);const glassP=onSurface([-.12,c.table_height,.43*.9320998491663383]);data.glass.scene.position.copy(glassP);supportKey=key;group.userData.support={start:startP.toArray(),end:endP.toArray(),glass:glassP.toArray()};}
 B.hand_r.updateWorldMatrix(true,false);
 const held=group.matrixWorld.clone().invert().multiply(B.hand_r.matrixWorld).multiply(grip),p=new THREE.Vector3(),q=new THREE.Quaternion(),scale=new THREE.Vector3();held.decompose(p,q,scale);const f=t*30+1;
 if(f<c.pickup_frames[1]){const w=sm((f-c.pickup_frames[0])/(c.pickup_frames[1]-c.pickup_frames[0]));p.lerpVectors(startP,p,w);q.copy(new THREE.Quaternion().fromArray(c.table_start.quaternion).slerp(q,w));}
 else if(f>c.release_frames[0]){const w=sm((f-c.release_frames[0])/(c.release_frames[1]-c.release_frames[0]));p.lerp(endP,w);q.slerp(new THREE.Quaternion().fromArray(c.table_end.quaternion),w);}
 bottle.position.copy(p);bottle.quaternion.copy(q);bottle.scale.copy(scale);group.updateMatrixWorld(true);
 }
 return {group,post};
}
