import * as THREE from 'three';
// Candidate adapter for the real native HER executor. The caller supplies the
// contact-v02 clip, accepted mug mesh, and its matching config as one version.
// Routing, economy and coffee need effects are intentionally not enabled here.
export function attachHeroineCoffee(extra,{clip,mug,config}) {
  const previous=extra.nativePropsFactory;
  const state={available:false,active:false,phase:'off',time:0,sipContact:false};
  extra.nativeClips=[...extra.nativeClips,{id:'HER-COFFEE-R',activity:'heroine_coffee',label:'пьёт кофе',seated:true,seatKinds:config.seatKinds||['bench'],clip}];
  extra.nativePropsFactory=args=>{
    const base=previous?.(args),group=new THREE.Group();group.name='HER props with coffee';args.scene.add(group);if(base?.group)group.add(base.group);
    const table=new THREE.Group();table.name='HER coffee table frame';group.add(table);
    const cup=mug.clone(true),grip=new THREE.Matrix4().fromArray(config.grip),rest=new THREE.Matrix4().fromArray(config.table),hand=args.B.hand_r;table.add(cup);cup.visible=false;
    state.available=!!hand;
    function post(id,t,F){base?.post(id,t,F);state.active=id==='HER-COFFEE-R';state.time=t;state.phase='off';state.sipContact=false;cup.visible=state.active;if(!state.active)return;
      table.position.set(F.x,0,F.z);table.rotation.y=F.th;table.scale.setScalar(args.S);table.updateMatrixWorld(true);
      const held=t>=config.grab&&t<=config.release;
      (held?hand:table).add(cup);(held?grip:rest).decompose(cup.position,cup.quaternion,cup.scale);
      cup.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(cup);state.cupBottom=bounds.min.y;state.cupCenter=bounds.getCenter(new THREE.Vector3()).toArray();state.phase=held?'held':t<config.grab?'on_table_before':'on_table_after';
      // This is geometric playback evidence, not an economy or autonomous choice.
      if(held&&t>=1.8&&t<=2.95){const head=args.B.head,mouth=new THREE.Vector3(.0005081957,-.05945908,.1225681657).applyMatrix4(head.matrixWorld),lip=new THREE.Vector3().fromArray(config.lip).applyMatrix4(cup.matrixWorld);state.sipContact=mouth.distanceTo(lip)<.004*args.S;}
    }
    return {group,post,audio:()=>base?.audio?.()||{},coffee:()=>({...state})};
  };
  return {extra,evidence:()=>({...state})};
}
