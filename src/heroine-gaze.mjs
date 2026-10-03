// Native HER53 transfer of the same authored waiting look used for seated men.
// Scene is a detached rest hierarchy; no live actor is sampled or modified.
import * as THREE from 'three';
export function createHeroineGazeProfile(model, repertoireBank) {
  const clip=repertoireBank.animations.find(c=>c.name==='HR-IDLE-211');
  if(!clip)throw Error('HER gaze source missing: HR-IDLE-211');
  const scene=model.clone(true);scene.updateMatrixWorld(true);
  const left=scene.getObjectByName('thigh_l').getWorldPosition(new THREE.Vector3());
  const right=scene.getObjectByName('thigh_r').getWorldPosition(new THREE.Vector3());
  const forward=new THREE.Vector3(0,1,0).cross(right.sub(left).setY(0).normalize());
  const faceAxis=forward.applyQuaternion(scene.getObjectByName('head').getWorldQuaternion(new THREE.Quaternion()).invert()).toArray();
  return {source:{scene,animations:[clip]},faceAxis,turns:
    ['idle','seated'].flatMap(mode=>[
      {id:mode+'-her-right',start:2.2666667,end:3.4,bearing:32,mode,animation:clip.name},
      {id:mode+'-her-left',start:1.1,end:2.2666667,bearing:-20,mode,animation:clip.name},
    ])};
}
