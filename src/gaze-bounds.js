import * as THREE from 'three';

// Conservative CPU bounds for raycasting skinned occluders. Broad-phase only:
// Three.js still tests the posed triangles when a ray reaches a mesh.
// A skinned vertex is a convex combination of its influencing joint positions.
// Bound each joint's influenced vertices once in bind space, then union their
// posed boxes. Morph radii use absolute weights, including negative weights.
const cached = new WeakMap();
const p = new THREE.Vector3(), q = new THREE.Vector3();
const world = new THREE.Matrix4();
const box = new THREE.Box3(), jointBox = new THREE.Box3();
const frobenius = m => { const e=m.elements;return Math.hypot(e[0],e[1],e[2],e[4],e[5],e[6],e[8],e[9],e[10]); };
function build(mesh) {
  const g=mesh.geometry,pos=g.attributes.position,skin=g.attributes.skinIndex,weights=g.attributes.skinWeight;
  if(!pos||!skin||!weights||!mesh.skeleton)return null;
  const bones=mesh.skeleton.bones.length,jointBoxes=Array.from({length:bones},()=>new THREE.Box3()),used=new Uint8Array(bones),bindScale=new Float64Array(bones);
  const transforms=mesh.skeleton.boneInverses.map(inv=>new THREE.Matrix4().multiplyMatrices(inv,mesh.bindMatrix));
  for(let i=0;i<bones;i++)bindScale[i]=frobenius(transforms[i]);
  let weightError=0;
  for(let i=0;i<pos.count;i++){
    p.fromBufferAttribute(pos,i);let sum=0;
    for(let j=0;j<4;j++){
      const w=weights.getComponent(i,j),joint=skin.getComponent(i,j);sum+=w;
      if(w<0||!Number.isFinite(w))return null;
      if(!w)continue;if(!Number.isInteger(joint)||joint<0||joint>=bones)return null;
      q.copy(p).applyMatrix4(transforms[joint]);jointBoxes[joint].expandByPoint(q);used[joint]=1;
    }
    weightError=Math.max(weightError,Math.abs(sum-1));
    if(weightError>1e-5)return null;
  }
  const morphs=g.morphAttributes.position||[],morphRadii=[];
  for(const attr of morphs){let radius=0;for(let i=0;i<pos.count;i++){
    p.fromBufferAttribute(attr,i);if(!g.morphTargetsRelative)p.sub(q.fromBufferAttribute(pos,i));radius=Math.max(radius,p.length());
  }morphRadii.push(radius);}
  return {geometry:g,pos,skin,weights,posVersion:pos.version,skinVersion:skin.version,weightVersion:weights.version,
    skeleton:mesh.skeleton,bindMatrix:mesh.bindMatrix.clone(),inverseCopies:mesh.skeleton.boneInverses.map(m=>m.clone()),
    morphs:morphs.slice(),morphVersions:morphs.map(a=>a.version),relative:g.morphTargetsRelative,weightError,jointBoxes,used,bindScale,morphRadii};
}
function valid(c,mesh){const g=mesh.geometry;return c&&c.geometry===g&&c.pos===g.attributes.position&&c.skin===g.attributes.skinIndex&&c.weights===g.attributes.skinWeight&&c.posVersion===c.pos.version&&c.skinVersion===c.skin.version&&c.weightVersion===c.weights.version&&c.skeleton===mesh.skeleton&&c.bindMatrix.equals(mesh.bindMatrix)&&c.relative===g.morphTargetsRelative&&c.inverseCopies.length===mesh.skeleton.boneInverses.length&&c.inverseCopies.every((m,i)=>m.equals(mesh.skeleton.boneInverses[i]))&&c.morphs.length===(g.morphAttributes.position||[]).length&&c.morphs.every((a,i)=>a===(g.morphAttributes.position||[])[i]&&a.version===c.morphVersions[i]);}
export function updateGazeBounds(mesh) {
  let c=cached.get(mesh);if(!valid(c,mesh)){c=build(mesh);if(c)cached.set(mesh,c);}
  if(!c){mesh.computeBoundingSphere();return false;}
  let morph=0;for(let i=0;i<c.morphRadii.length;i++)morph+=Math.abs(mesh.morphTargetInfluences?.[i]||0)*c.morphRadii[i];
  box.makeEmpty();
  // Work in mesh local coordinates, just like SkinnedMesh.boundingSphere.
  for(let i=0;i<c.used.length;i++)if(c.used[i]){
    world.multiplyMatrices(mesh.bindMatrixInverse,mesh.skeleton.bones[i].matrixWorld);
    jointBox.copy(c.jointBoxes[i]).expandByScalar(morph*c.bindScale[i]).applyMatrix4(world);
    box.union(jointBox);
  }
  // If floating skin weights sum to s rather than exactly 1, the actual
  // vertex is s*u + (1-s)*bindInverseTranslation, for u in the convex box.
  // Include this term explicitly, even when large translations cancel.
  const t=mesh.bindMatrixInverse.elements,e=c.weightError;
  q.set(e*Math.max(Math.abs(box.min.x-t[12]),Math.abs(box.max.x-t[12])),
    e*Math.max(Math.abs(box.min.y-t[13]),Math.abs(box.max.y-t[13])),
    e*Math.max(Math.abs(box.min.z-t[14]),Math.abs(box.max.z-t[14])));
  box.min.sub(q);box.max.add(q);
  const margin=1e-4*(1+Math.max(box.min.length(),box.max.length()));
  box.expandByScalar(margin);
  mesh.boundingSphere??=new THREE.Sphere();box.getBoundingSphere(mesh.boundingSphere);
  return true;
}
