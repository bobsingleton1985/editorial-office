import * as THREE from 'three';

// A renderer-only, explicit read_wire action. It uses the live paper mesh and the
// unchanged native stand_idle. There is no hand pose, prop attachment or social gaze.
export { TTY_READ_SPOT } from './teletype-reading-data.js';
const UP = new THREE.Vector3(0, 1, 0), FACE = new THREE.Vector3(0, -1, 0);
const clamp = THREE.MathUtils.clamp;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = t => { t=clamp(t,0,1); return t*t*(3-2*t); };
function rotWorld(b, q) {
  if (!b) return;
  const parent = b.parent.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(parent.invert().multiply(q.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()))));
  b.updateMatrixWorld(true);
}

export function createTeletypeReading({ office, bones: B, holder }) {
  let paper = null;
  office.traverse(o => {
    if (o.isMesh && /TTY.*paper.feed/i.test(o.name.replaceAll('_',' ')) && [].concat(o.material).some(m=>m.name==='TTY v24 paper')) paper=o;
  });
  const affected = [B.neck_01, B.head].filter(Boolean), clean = affected.map(b=>b.quaternion.clone());
  let dirty=false, weight=0, report={available:false,active:false,ready:false,reason:'paper_missing'};
  // Exact upper front surface of office-v31c's paper mesh, in normalized GLB
  // vertex coordinates. Pairing real vertices keeps every scan on the paper.
  const rows=[];
  if(paper?.geometry?.attributes.position) {
    const p=paper.geometry.attributes.position, byY=new Map();
    for(let i=0;i<p.count;i++) {
      const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i));
      if(v.y<0.55 || v.y>0.9 || v.z<-.38 || v.z>-.25)continue;
      const key=v.y.toFixed(5),row=byY.get(key)||{left:v.clone(),right:v.clone()};
      if(v.x<row.left.x)row.left.copy(v);if(v.x>row.right.x)row.right.copy(v);byY.set(key,row);
    }
    rows.push(...[...byY.values()].filter(r=>r.right.x-r.left.x>.3).sort((a,b)=>b.left.y-a.left.y));
  }
  const available=!!paper&&!!B.head&&rows.length>=4;
  function restore() { if(dirty)affected.forEach((b,i)=>b.quaternion.copy(clean[i]));dirty=false; }
  function reset() { restore();weight=0;report={available,active:false,ready:false,reason:'reset'}; }
  function update(dt, { requested, permitted, elapsed }) {
    report={available,active:false,ready:false,reason:!available?'paper_or_rig_missing':!requested?'not_requested':!permitted?'not_in_reading_pose':'acquiring_paper'};
    weight=clamp(weight+(requested&&permitted&&available?dt:-dt)/0.65,0,1);
    // A command change or route never keeps the old reading pose alive.
    if(!requested||!permitted||!available){weight=0;return report;}
    holder.updateMatrixWorld(true);paper.updateWorldMatrix(true,false);
    affected.forEach((b,i)=>clean[i].copy(b.quaternion));
    const lineSeconds=3.8, clock=Math.max(0,elapsed), line=Math.floor(clock/lineSeconds)%rows.length;
    const phase=(clock%lineSeconds)/lineSeconds;
    const current=rows[line], next=rows[(line+1)%rows.length];
    const target=current.left.clone().lerp(current.right,.14+.72*smooth(phase/.86));
    // Slow scan across a printed line, then a brief return to the next line.
    if(phase>.86)target.lerp(next.left.clone().lerp(next.right,.14),smooth((phase-.86)/.14));
    paper.localToWorld(target);
    const head=B.head.getWorldPosition(new THREE.Vector3()), desired=target.clone().sub(head).normalize();
    const bf=new THREE.Vector3(0,0,1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
    const relative=wrap(Math.atan2(desired.x,desired.z)-Math.atan2(bf.x,bf.z));
    const front=target.clone().sub(holder.position);
    if(Math.abs(relative)>.55 || front.length()>3.2){weight=0;report.reason='paper_outside_reading_cone';return report;}
    dirty=true;
    let face=FACE.clone().applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const yaw=wrap(Math.atan2(desired.x,desired.z)-Math.atan2(face.x,face.z))*weight;
    if(B.neck_01)rotWorld(B.neck_01,new THREE.Quaternion().setFromAxisAngle(UP,yaw*.4));
    rotWorld(B.head,new THREE.Quaternion().setFromAxisAngle(UP,yaw*(B.neck_01 ? .6 : 1)));
    face=FACE.clone().applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const pitch=clamp(Math.atan2(desired.y,Math.hypot(desired.x,desired.z))-Math.atan2(face.y,Math.hypot(face.x,face.z)),-.8,.8)*weight;
    const right=UP.clone().cross(face.clone().setY(0).normalize());
    if(B.neck_01)rotWorld(B.neck_01,new THREE.Quaternion().setFromAxisAngle(right,-pitch*.4));
    rotWorld(B.head,new THREE.Quaternion().setFromAxisAngle(right,-pitch*(B.neck_01 ? .6 : 1)));
    const actualHead=B.head.getWorldPosition(new THREE.Vector3());
    face=FACE.clone().applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const error=face.angleTo(target.clone().sub(actualHead).normalize());
    const ready=weight>.98&&error<.08;
    report={available,active:ready,ready,reason:ready?'following_paper':'acquiring_paper',line,target:target.toArray(),angularError:error,weight,source:'explicit_read_wire',paper:paper.name};
    return report;
  }
  return { restore,reset,update,status:()=>({...report}),get available(){return available;} };
}
