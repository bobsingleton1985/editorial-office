import * as THREE from 'three';

// Early review: authored neck/head tracks from accepted IDLE-002 / IDLE-211.
// The selected excerpts are played at 1x. No look-at solver, mirroring, eye motion,
// chest rotation, body/root tracks, invented social facts or Jev calls.
export const GAZE_DEFAULTS = Object.freeze({
  enabled: true, intervalMin: 18, intervalMax: 34, eventGap: 9,
  distance: 5.5, passerDistance: 3.8, maxYaw: 40, angleTolerance: 12,
  responseChance: 0.24, responseDelay: 0.45, fade: 0.23,
});
const SOURCE = 'IDLE-002 | MCU_am_ArmsCrossedB_Idle_02_LookAround';
const SEATED_SOURCE = 'IDLE-211 | MCU_am_Stand_Idle_Waiting_04_LookAround';
const ASSET = 'assets/social-v01/emotions-quiet-v2-web.glb';
const TURNS = [
  { id: 'right', start: 0.4, end: 1.6666667, bearing: 26, mode: 'idle', animation: SOURCE },
  { id: 'left', start: 1.6666667, end: 3.6666667, bearing: -32, mode: 'idle', animation: SOURCE },
  { id: 'seated-right', start: 2.2666667, end: 3.4, bearing: 32, mode: 'seated', animation: SEATED_SOURCE },
  { id: 'seated-left', start: 1.1, end: 2.2666667, bearing: -20, mode: 'seated', animation: SEATED_SOURCE },
];
const DEG = 180 / Math.PI, UP = new THREE.Vector3(0, 1, 0);
const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x*x*(3-2*x); };
const hash = text => { let h = 2166136261; for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
const head = ed => ed?.root.getObjectByName('head');
const position = ed => { ed.holder.updateMatrixWorld(true); return head(ed)?.getWorldPosition(new THREE.Vector3()); };
function forward(ed) {
  const l = ed.root.getObjectByName('thigh_l'), r = ed.root.getObjectByName('thigh_r');
  if (l && r) { const axis = r.getWorldPosition(new THREE.Vector3()).sub(l.getWorldPosition(new THREE.Vector3())).setY(0);
    if (axis.lengthSq() > 1e-8) return UP.clone().cross(axis.normalize()).normalize(); }
  return new THREE.Vector3(0,0,1).applyQuaternion(ed.holder.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
}
export function createColleagueGaze({ people, now, office, params = {} }) {
  const config = { ...GAZE_DEFAULTS, ...params }, states = new Map(), players = new Map(), events = [];
  const occluders = []; office?.traverse(o => { if (o.isMesh) occluders.push(o); });
  const visible = o => { for(let p=o;p;p=p.parent)if(!p.visible)return false;return true; };
  const ray = new THREE.Raycaster(); let previous = null, observations = new Map();
  function state(id) { if (!states.has(id)) { const t = now()/1000;
    states.set(id, { next: t + 6 + hash(id+'first')*15, last: -Infinity, active: null, pending: null, serial: 0 }); }
    return states.get(id); }
  function log(e) { events.push(e); if (events.length > 200) events.shift(); }
  function geometry(id, other, turn) {
    const a=observations.get(id), b=observations.get(other); if(!a || !b || id===other) return null;
    const d=b.pos.clone().sub(a.pos), distance=d.length(), flat=Math.hypot(d.x,d.z);
    const yaw=wrap(Math.atan2(d.x,d.z)-Math.atan2(a.forward.x,a.forward.z))*DEG;
    if(distance<0.7 || distance>config.distance || Math.abs(yaw)>config.maxYaw || Math.abs(Math.atan2(d.y,flat)*DEG)>18) return null;
    const options=TURNS.filter(t=>t.mode===a.mode);if(!options.length)return null;
    const chosen=turn || options.reduce((best,t)=>Math.abs(t.bearing-yaw)<Math.abs(best.bearing-yaw)?t:best,options[0]);
    if(Math.abs(chosen.bearing-yaw)>config.angleTolerance) return null;
    ray.set(a.pos,d.normalize());ray.near=0.08;ray.far=distance-0.2;
    if(ray.intersectObjects(occluders,false).some(h=>visible(h.object) && h.distance<ray.far)) return null;
    for(const [third,p] of Object.entries(people())) { if(third===id || third===other || !p.ed)continue;
      p.ed.holder.updateMatrixWorld(true);p.ed.root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingSphere();}});
      if(ray.intersectObject(p.ed.root,true).some(h=>visible(h.object) && h.distance<ray.far))return null;
    }
    return {turn:chosen, yaw, distance};
  }
  function start(id, target, reason) {
    const s=state(id), obs=observations.get(id), g=geometry(id,target);
    if(!config.enabled || !obs?.free || !g || s.active || now()/1000-s.last<config.eventGap) return false;
    const t=now()/1000;s.active={target,turn:g.turn,at:t,reason,abortAt:null};s.last=t;s.serial++;
    s.next=t+config.intervalMin+hash(id+s.serial)*Math.max(0,config.intervalMax-config.intervalMin);
    log({at:t,id,target,reason,turn:g.turn.id,source:g.turn.animation,range:[g.turn.start,g.turn.end],speed:1,bearing:g.yaw});
    // A colleague may ignore it. Responses are delayed and never reply to replies.
    if(reason!=='reciprocal' && hash(id+target+s.serial+'response')<config.responseChance) {
      const other=state(target); if(!other.active && !other.pending) other.pending={target:id,at:t+config.responseDelay+hash(target+s.serial)*0.55,expires:t+1.6};
    }
    return true;
  }
  function beginFrame() {
    // Restore our own and the invitation layer's last bone edits before all mixers.
    for(const p of players.values()) p.restore();
    const t=now()/1000, elapsed=previous===null?0:t-previous;previous=t;
    if(elapsed<0 || elapsed>2) { for(const s of states.values()){s.active=null;s.pending=null;s.last=-Infinity;s.next=t+6;} }
    if(!config.enabled) for(const s of states.values()){s.active=null;s.pending=null;}
    const next=new Map();
    for(const [id,p] of Object.entries(people())) { if(!p.ed || !players.has(id)) continue;
      const pos=position(p.ed), old=observations.get(id), st=p.ed.status(), policy=players.get(id).policy(); if(!pos) continue;
      next.set(id,{pos,forward:forward(p.ed),mode:st.mode,activity:st.activity,free:policy.free,
        speed:elapsed>0&&old?pos.distanceTo(old.pos)/elapsed:0,
        changed:!!old && old.activity!==st.activity && ['dance','phone','conversation','work','jazz'].includes(st.activity),
        walkSince:st.mode==='walk'?(old?.mode==='walk'?old.walkSince:t):null});state(id);
    }
    observations=next;
    for(const [id,a] of observations) {
      const s=state(id);if(!config.enabled || !a.free || s.active) continue;
      if(s.pending && t>=s.pending.at) { const p=s.pending;s.pending=null;if(t<p.expires && state(p.target).active?.target===id) start(id,p.target,'reciprocal'); }
      if(s.active || t-s.last<config.eventGap) continue;
      const candidates=[...observations.keys()].filter(other=>geometry(id,other)).sort((x,y)=>geometry(id,x).distance-geometry(id,y).distance);
      for(const other of candidates) { const b=observations.get(other), g=geometry(id,other), old=players.get(id).seen.get(other);
        players.get(id).seen.set(other,g.distance);
        const passing=b.mode==='walk' && b.speed>0.12 && g.distance<config.passerDistance && (old===undefined || old>=config.passerDistance || (b.walkSince!==null && t-b.walkSince<0.35));
        if((passing && hash(id+other+Math.floor(t)+'pass')<0.7) || (b.changed && hash(id+other+Math.floor(t)+'change')<0.6)) {
          if(start(id,other,passing?'passer':'activity-change')) break; }
      }
      if(!s.active && t>=s.next) { s.next=t+config.intervalMin+hash(id+Math.floor(t))*Math.max(0,config.intervalMax-config.intervalMin);
        if(candidates.length) start(id,candidates[Math.floor(hash(id+Math.floor(t)+'colleague')*candidates.length)],'nearby'); }
    }
  }
  function attach(id, B, holder, social, policy) {
    if(!['columnist','reporter'].includes(id))return null;
    const boneNames=['neck_01','head'], bones=boneNames.map(n=>B[n]);
    if(bones.some(b=>!b))return null;
    const bank={};
    for(const animation of [SOURCE,SEATED_SOURCE]) {
    const clip=social?.assets?.[ASSET]?.animations.find(c=>c.name===animation);
    if(!clip){log({id,blocked:'accepted source missing',animation});return null;}
    const tracks=boneNames.map(n=>clip.tracks.find(t=>t.name.endsWith(n+'.quaternion')));
    if(tracks.some(t=>!t)) return null;
    const samplers=tracks.map(t=>t.createInterpolant(new Float32Array(4)));
    // Authored mask in the source's upright body frame. This preserves its
    // recorded head direction when the current spine leans over a typewriter.
    // No target-dependent steering: the colleague only selects a matching take.
    const sourceRoot=social.assets[ASSET].scene, original=[];
    sourceRoot.traverse(o=>original.push([o,o.position.clone(),o.quaternion.clone(),o.scale.clone()]));
    for(const tr of clip.tracks){const match=/^(.*)\.(quaternion|position|scale)$/.exec(tr.name);if(!match)continue;
      const node=sourceRoot.getObjectByName(match[1]);if(node)node[match[2]].fromArray(tr.createInterpolant().evaluate(0));}
    sourceRoot.updateMatrixWorld(true);
    const parentReference=sourceRoot.getObjectByName('neck_01').parent.getWorldQuaternion(new THREE.Quaternion());
    const left=sourceRoot.getObjectByName('thigh_l').getWorldPosition(new THREE.Vector3()),right=sourceRoot.getObjectByName('thigh_r').getWorldPosition(new THREE.Vector3());
    const sourceForward=UP.clone().cross(right.sub(left).setY(0).normalize()),sourceYaw=Math.atan2(sourceForward.x,sourceForward.z);
    original.forEach(([o,p,q,s])=>{o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);});sourceRoot.updateMatrixWorld(true);
    bank[animation]={samplers,parentReference,sourceYaw};
    }
    const saved=['spine_03',...boneNames].map(n=>B[n]).filter(Boolean), clean=saved.map(b=>b.quaternion.clone());let dirty=false;
    const player={policy,seen:new Map(),restore(){if(dirty){saved.forEach((b,i)=>b.quaternion.copy(clean[i]));dirty=false;}},
      capture(){saved.forEach((b,i)=>clean[i].copy(b.quaternion));dirty=true;},
      post(){
        const s=state(id), a=s.active, pol=policy();if(!config.enabled){s.active=null;s.pending=null;return;}if(!a)return;
        const t=now()/1000, u=t-a.at, duration=a.turn.end-a.turn.start;
        if(u>=duration || !pol.free) {s.active=null;return;}
        if(!geometry(id,a.target,a.turn)) a.abortAt??=t;
        const w=smooth(u/config.fade)*(1-smooth((u-duration+config.fade)/config.fade))*(a.abortAt===null?1:1-smooth((t-a.abortAt)/config.fade));
        if(w<=0){if(a.abortAt!==null)s.active=null;return;}
        const base=bones.map(b=>b.quaternion.clone()), baseWorld=bones.map(b=>b.getWorldQuaternion(new THREE.Quaternion()));
        const ed=people()[id]?.ed, bodyForward=ed&&forward(ed);
        const {samplers,parentReference,sourceYaw}=bank[a.turn.animation];
        const align=new THREE.Quaternion().setFromAxisAngle(UP,Math.atan2(bodyForward.x,bodyForward.z)-sourceYaw);
        const sourceQ=samplers.map(sp=>new THREE.Quaternion().fromArray(sp.evaluate(a.turn.start+u)).normalize());
        const neckWorld=align.clone().multiply(parentReference).multiply(sourceQ[0]);
        const headWorld=neckWorld.clone().multiply(sourceQ[1]);
        for(const [i,want] of [[0,neckWorld],[1,headWorld]]){
          const q=baseWorld[i].clone().slerp(want,w);
          bones[i].quaternion.copy(bones[i].parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)).normalize();
          bones[i].updateMatrixWorld(true);
        }
        holder.updateMatrixWorld(true);
        // Reject unsafe base-pose combinations; never distort the authored turn to fit.
        const f=new THREE.Vector3(0,-1,0).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion()));
        if(bodyForward && Math.abs(wrap(Math.atan2(f.x,f.z)-Math.atan2(bodyForward.x,bodyForward.z))*DEG)>config.maxYaw+1) {
          bones.forEach((b,i)=>b.quaternion.copy(base[i]));holder.updateMatrixWorld(true);s.active=null;log({at:t,id,blocked:'animated base exceeds safe final yaw'}); }
      }};
    players.set(id,player);return player;
  }
  return { config, reset:id=>{players.get(id)?.restore();const s=states.get(id);if(s){s.active=null;s.pending=null;}observations.delete(id);}, beginFrame, flush:()=>{for(const p of players.values())p.post();}, attach, request:start,
    status:()=>Object.fromEntries([...states].map(([id,s])=>[id,{target:s.active?.target||null,turn:s.active?.turn.id||null,reason:s.active?.reason||null,next:s.next}])),
    events:()=>events.slice(), source:{asset:ASSET,animations:[SOURCE,SEATED_SOURCE],turns:TURNS,mask:['neck_01.quaternion','head.quaternion'],speed:1},
  };
}
