import * as THREE from 'three';
import {heroineProps} from './heroine-props.js';
import {createHeroineLunch} from './heroine-lunch.js';
export const HEROINE_SCALE=1/(.959280767191607/1.5537539445117445);
export async function prepareHeroine(load,shared,id,assetBase='',overrides={}){
  const H=assetBase+'heroine/';const navNames=['sit_idle',...['L02a','L03a','R02a'].flatMap(t=>['desk_sit_'+t,'desk_stand_'+t]),...['L01','L02','R01','R02'].flatMap(t=>['booth_sit_'+t,'booth_stand_'+t])];
  const model=await load(H+'heroine-v15-head15.glb');
  const named=async(path,name)=>{const c=(await load(path)).animations[0].clone();c.name=name;return c;};
  const animations=await Promise.all([named(H+'clip-MX-WALK.glb','walk'),named(H+'clip-SEAT-001.glb','stand_idle'),...navNames.map(n=>named(n==='sit_idle'&&overrides.sitIdle?overrides.sitIdle:assetBase+'heroine-nav/clip-'+n+'.glb',n))]);
  const [fork,soup,stir,plate,forkProp,knifeProp,food]=await Promise.all([named(H+'clip-HER-FORK02-owner-v03.glb','fork'),named(H+'clip-HER-SOUP-owner-v02.glb','soup'),named(H+'clip-HER-STIR-owner-v02.glb','stir'),load(H+'plate-food-owner-v03a.glb'),load(H+'fork-owner-v03.glb'),load(H+'knife-owner-v03.glb'),load(H+'key-props-food.glb')]);
  const mixer=new THREE.AnimationMixer(model.scene);const a=mixer.clipAction(fork).play();mixer.update(0);model.scene.updateMatrixWorld(true);
  const utensils=[['l',forkProp],['r',knifeProp]].map(([side,g])=>{g.scene.updateMatrixWorld(true);return {side,object:g.scene,local:model.scene.getObjectByName('hand_'+side).matrixWorld.clone().invert().multiply(g.scene.matrixWorld),dish:'sandwich'};});a.stop();
  const manifest=await(await fetch(H+'manifest.json')).json(),e=manifest.entries.find(x=>x.id==='HER-SOUP'),k=e.pelvis_height_scale;
  const spoon=new THREE.Group();spoon.add(food.scene.getObjectByName('P_spoon').clone(true));spoon.children[0].scale.multiplyScalar(k);const sf=spoon.getObjectByName('P_spoonful');if(sf)sf.visible=false;
  const sa=mixer.clipAction(soup).play();mixer.update(0);model.scene.updateMatrixWorld(true);
  const point=n=>model.scene.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  spoon.position.copy(point('index_01_r').add(point('middle_01_r')).add(point('thumb_02_r')).multiplyScalar(1/3));
  const forward=new THREE.Vector3(.006,.80,.41).multiplyScalar(k).sub(spoon.position).normalize(),normal=new THREE.Vector3(0,-1,0);normal.addScaledVector(forward,-normal.dot(forward)).normalize();const across=new THREE.Vector3().crossVectors(forward,normal).normalize();normal.crossVectors(across,forward).normalize();spoon.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,forward,normal));spoon.updateMatrixWorld(true);
  utensils.push({side:'r',object:spoon,dish:'soup',local:model.scene.getObjectByName('hand_r').matrixWorld.clone().invert().multiply(spoon.matrixWorld)});sa.stop();
  const part=n=>{const p=food.scene.getObjectByName(n).clone(true);p.position.multiplyScalar(k);p.scale.multiplyScalar(k);return p;};
  const ids=['HER-POUR','HER-DANCE1','HER-DANCE2','MX-DANCE','IDLE-081','IDLE-082','MX-SHRUG','MX-NOD','BAR-025','BAR-029','HER-POSE1','HER-LOVE1','XS-LAUGH','XS-JOY','HER-SEDUCTIVE','SEAT-018'];
  const nativeClips=await Promise.all(ids.map(async id=>{const entry=manifest.entries.find(e=>e.id===id);return {id,activity:'heroine_'+id.replace(/^HER-/,'').toLowerCase().replace(/[^a-z0-9]/g,'_'),label:entry.label,seated:!!entry.seated,clip:await named(H+entry.glb,id)};}));
  const [bottle,glass,cfg]=await Promise.all([load(H+'key-props-bottle.glb'),load(H+'key-props-glass.glb'),fetch(H+'pour-grip-v04.json').then(r=>r.json())]);
  return {gltf:{scene:model.scene,animations},extra:{id,home:'benchN',actorScale:HEROINE_SCALE,shared:{...shared,coffee:null,drinkL:null,whisky:null,whiskyRec:null},lunch:{clips:{fork,soup,stir},plate:plate.scene,bowl:part('P_bowl'),soup:part('P_soup0'),utensils},nativeClips,nativePropsFactory:args=>heroineProps(args,{bottle,glass,cfg},shared),lunchFactory:createHeroineLunch,lunchDishes:['soup','sandwich'],drunk:false}};
}
