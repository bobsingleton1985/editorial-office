// Replace only render data on existing nodes. Bone identity, mixer bindings,
// simulation schema, facial controls, shoes and held props remain intact.
function meshes(root,role){
 let group;
 root.traverse(o=>{const n=o.name.replace(/[^a-z0-9]/gi,'').toLowerCase();if(!group&&n.startsWith('her'+role))group=o;});
 if(!group)throw Error('Не найден '+role);
 const result=[];group.traverse(o=>{if(o.isSkinnedMesh)result.push(o);});
 if(!result.length)throw Error('Нет частей '+role);return result;
}
function compatible(a,b){
 const x=a.skeleton,y=b.skeleton;
 if(x.bones.length!==y.bones.length||x.bones.some((bone,i)=>bone.name!==y.bones[i].name))throw Error('Несовместимый скелет платья');
 for(let i=0;i<x.bones.length;i++)if(x.boneInverses[i].elements.some((n,k)=>Math.abs(n-y.boneInverses[i].elements[k])>1e-4))throw Error('Несовместимая исходная поза платья');
 if(a.bindMatrix.elements.some((n,k)=>Math.abs(n-b.bindMatrix.elements[k])>1e-4))throw Error('Несовместимая привязка платья');
 if(a.geometry.attributes.skinIndex.count!==a.geometry.attributes.position.count||b.geometry.attributes.skinIndex.count!==b.geometry.attributes.position.count)throw Error('Повреждённая привязка');
}
export function createWardrobeMesh(root,load){
 const targets=[...meshes(root,'body'),...meshes(root,'dress')];
 const original=targets.map(o=>({geometry:o.geometry,material:o.material}));
 const cache=new Map();let selected='red',wanted='red',generation=0,error=null,busy=false;
 async function prepare(id){
  if(id==='red')return original;
  if(!cache.has(id))cache.set(id,load(id).then(g=>{
   const sources=[...meshes(g.scene,'body'),...meshes(g.scene,'dress')];
   if(sources.length!==targets.length)throw Error('Несовместимые части платья');
   sources.forEach((o,i)=>compatible(targets[i],o));
   return sources.map(o=>({geometry:o.geometry,material:o.material}));
  }).catch(e=>{cache.delete(id);throw e;}));
  return cache.get(id);
 }
 return {
  async select(id){
   if(wanted===id&&(busy||selected===id&&!error))return;
   wanted=id;const token=++generation;busy=true;error=null;
   try{const parts=await prepare(id);if(token!==generation)return;
    targets.forEach((o,i)=>{o.geometry=parts[i].geometry;o.material=parts[i].material;});selected=id;
   }catch(e){if(token===generation)error=e.message;}
   finally{if(token===generation)busy=false;}
  },
  status:()=>({selected,wanted,busy,error,parts:targets.length}),
 };
}
