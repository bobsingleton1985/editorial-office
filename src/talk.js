// People talking to each other (invitations): a bubble over the speaker's head (the thing + the answer), the two look at each
// other, the answer is also given with the head — a nod for «yes», a shake for «no» and «not now».
// The world carries it per person: chars[id].talk = {at, to, icon, mark} (at: the director's time, ms; icon: smoke | coffee |
// whisky; mark: q | yes | no | later). Everything is a function of (now − at), so every viewer, a late one too, sees the same.
import * as THREE from 'three';
import { drawBubble } from './talk-icons.js';
import { resolveConversationAttention } from './conversation-attention.mjs';

const SHOW = 5, FADE = 0.25;                     // the bubble stays 5 s (2.8 s was too quick to read: owner 30.09), fading in and out
const LOOK_BEFORE = 0.4, LOOK_AFTER = 4.5;        // the speaker turns to the other a moment before he «speaks», both hold the look
const HEAD_MAX = THREE.MathUtils.degToRad(80), CHEST_MAX = THREE.MathUtils.degToRad(30);   // neck + head ≤ 80° (≤ 90° rule), the rest from the chest
const NOD = { T: 1.1, amp: THREE.MathUtils.degToRad(15), n: 2 }, SHAKE = { T: 1.3, amp: THREE.MathUtils.degToRad(20), n: 2.5 };
const UP = new THREE.Vector3(0, 1, 0);
const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function rotWorld(b, q) { const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()), wq = b.getWorldQuaternion(new THREE.Quaternion());
  b.quaternion.copy(pq.invert().multiply(q.clone().multiply(wq))); b.updateMatrixWorld(true); }
const valid = (t) => t && Number.isFinite(t.at) && typeof t.to === 'string' && typeof t.icon === 'string' && typeof t.mark === 'string';

export function createTalk({ scene, addDynamic, chars, people, now, show = () => true }) {
  const tex = {}, bub = {}, st = {}, poses = new Map(), staged = new Map();
  let frameChars=null,frameHeads=null,frameTime=null,lastTime=null;
  const readChars=()=>frameChars??chars();
  function reset(id) {
    const p=poses.get(id);
    if(p?.dirty){p.bones.forEach((b,i)=>b.quaternion.copy(p.clean[i]));p.dirty=false;}
    if(p)p.ready=false;
    staged.delete(id);
  }
  // Restore only our last writes, including bones not keyed by the next clip.
  function beginFrame() {
    for(const id of poses.keys())reset(id);
    staged.clear();frameChars=null;frameHeads=null;frameTime=null;
    const t=now();if(lastTime!==null && (t<lastTime || t-lastTime>2000))for(const id of Object.keys(st))delete st[id];lastTime=t;
  }
  function capture(id,B) {
    const bones=['spine_03','neck_01','head'].map(n=>B[n]).filter(Boolean);
    let p=poses.get(id);
    if(!p || p.bones.some((b,i)=>b!==bones[i]) || p.bones.length!==bones.length) {
      p={bones,clean:bones.map(b=>b.quaternion.clone()),dirty:false,ready:false};poses.set(id,p);
    }
    bones.forEach((b,i)=>p.clean[i].copy(b.quaternion));p.ready=true;
  }
  function stage(...args) {staged.set(args[0],args);}
  function flush() {
    // Both actors finish Mixer/contact/queue updates before roles and targets are read.
    frameChars=chars();frameTime=now();frameHeads=new Map();
    for(const p of Object.values(people()))if(p.ed){p.ed.holder.updateMatrixWorld(true);const h=p.ed.root.getObjectByName('head');if(h)frameHeads.set(p.ed,h.getWorldPosition(new THREE.Vector3()));}
    for(const args of staged.values())if(poses.get(args[0])?.ready)post(...args);
    staged.clear();frameChars=null;frameHeads=null;frameTime=null;
  }
  function texture(icon, mark) {
    const k = icon + '|' + mark; if (tex[k]) return tex[k];
    const t = new THREE.CanvasTexture(drawBubble(document.createElement('canvas'), icon, mark)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return (tex[k] = t);
  }
  function bubbleOf(id) {
    if (bub[id]) return bub[id];
    const m = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false });
    const s = new THREE.Sprite(m); s.center.set(0.47, 0); s.renderOrder = 50; s.visible = false; scene.add(s); addDynamic?.(s);
    return (bub[id] = s);
  }
  const headPos = (ed) => { if(!ed)return null;if(frameHeads?.has(ed))return frameHeads.get(ed).clone();ed.holder.updateMatrixWorld(true);const h = ed.root.getObjectByName('head'); return h ? h.getWorldPosition(new THREE.Vector3()) : null; };
  const talkOf = (id) => { const t = readChars()?.[id]?.talk; return valid(t) ? t : null; };

  // who he looks at now and how strongly (0..1), from his own talk and from talk addressed to him
  function lookWant(id, T) {
    let best = null, w = 0, listener = false;
    const attention=resolveConversationAttention(readChars(),people(),id,T);
    if(attention)return {who:attention.targetActor,w:attention.role==='listener'?1:0,listener:attention.role==='listener',dialogue:true,attention};
    // Only the explicit mutually ready pre-start posture addresses both actors.
    // Once participation has started, canonical alternating roles own the gaze.
    const pair=readChars()?.[id]?.social, partner=pair&&readChars()?.[pair.partner]?.social;
    const ownStatus=people()[id]?.ed?.conversationStatus?.(),otherStatus=people()[pair?.partner]?.ed?.conversationStatus?.();
    if(pair?.firstParticipation===null&&partner?.id===pair.id&&partner.partner===id&&ownStatus?.role==='waiting'&&otherStatus?.role==='waiting')
      return {who:pair.partner,w:1,listener:true,dialogue:true,attention:{conversationId:pair.id,role:'waiting',targetActor:pair.partner}};
    // Missing/mismatched turn data never produces the old symmetric social stare.
    const own = talkOf(id);
    if (own) { const u = (T - own.at) / 1000; const k = sm((u + LOOK_BEFORE) / 0.35) * (1 - sm((u - LOOK_AFTER) / 0.5)); if (k > w) { w = k; best = own.to; } }
    for (const [o, e] of Object.entries(readChars() || {})) { if (o === id) continue; const t = valid(e?.talk) ? e.talk : null; if (!t || t.to !== id) continue;
      const u = (T - t.at) / 1000; const k = sm((u - 0.25) / 0.4) * (1 - sm((u - LOOK_AFTER) / 0.5)); if (k > w) { w = k; best = o; } }
    return { who: best, w, listener, dialogue:false, attention:null };
  }
  // after the mixer: turn the neck and head (and the chest, when the hands are free) towards the other; nod or shake for the answer
  function post(id, B, holder, handsBusy, dt, walking, itemFocus = false) {
    const T = frameTime??now(), s = st[id] || (st[id] = { w: 0, yaw: 0, listenerWeight: 0, listenerTarget: null });
    if (itemFocus) { s.w = 0; s.listenerWeight = 0;s.listenerTarget=null;s.listenerConversation=null;s.attention={blocked:'itemFocus',at:T};return; }
    const L = lookWant(id, T), who = L.who, hadListener=s.listenerWeight>0, w = walking || L.dialogue || hadListener ? 0 : L.w, other = who && people()[who]?.ed;
    s.attention={...(L.attention||{}),at:T,blocked:walking?'moving':null};   // walking: eyes on the way
    let yawT = s.yaw;
    if (other && B.head) {
      const me = headPos(people()[id].ed), you = headPos(other); holder.updateMatrixWorld(true);
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
      if (me && you) yawT = Math.atan2(you.x - me.x, you.z - me.z) - Math.atan2(f.x, f.z);
      yawT = Math.atan2(Math.sin(yawT), Math.cos(yawT));
    }
    const k = Math.min(1, dt / 0.25); s.yaw += (yawT - s.yaw) * k;                       // the target moves (he walks): follow it smoothly
    s.w += Math.sign(w - s.w) * Math.min(Math.abs(w - s.w), dt / 0.35);
    let yaw = s.yaw * s.w;
    const lim = HEAD_MAX + (handsBusy ? 0 : CHEST_MAX); yaw = Math.max(-lim, Math.min(lim, yaw));
    const head = Math.max(-HEAD_MAX, Math.min(HEAD_MAX, yaw)), chest = yaw - head;
    // the answer with the head: from his own talk, 0.15 s after the bubble appears
    let nod = 0, shake = 0; const own = L.dialogue || hadListener ? null : talkOf(id);
    if (own && (own.mark === 'yes' || own.mark === 'no' || own.mark === 'later')) { const u = (T - own.at) / 1000 - 0.15;
      if (own.mark === 'yes' && u > 0 && u < NOD.T) nod = NOD.amp * Math.sin(Math.PI * NOD.n * u / NOD.T) ** 2;
      if (own.mark !== 'yes' && u > 0 && u < SHAKE.T) shake = SHAKE.amp * Math.sin(2 * Math.PI * SHAKE.n * u / SHAKE.T) * Math.sqrt(Math.sin(Math.PI * u / SHAKE.T)); }
    const conversation=readChars()?.[id]?.social?.id || null;
    const newTarget=!!L.listener && !!other && (s.listenerTarget!==who || s.listenerConversation!==conversation);
    if(newTarget && s.listenerWeight<=0.001){s.listenerTarget=who;s.listenerConversation=conversation;}
    const readyTarget=L.listener && other && s.listenerTarget===who && s.listenerConversation===conversation;
    s.listenerWeight += THREE.MathUtils.clamp((readyTarget && !walking ? 1 : 0) - s.listenerWeight, -dt/0.35, dt/0.35);
    const speaker=s.listenerTarget && people()[s.listenerTarget]?.ed;
    if(!speaker)s.listenerWeight=0;
    s.attention.weight=s.listenerWeight;s.attention.appliedTarget=s.listenerWeight>0?s.listenerTarget:null;
    if (s.listenerWeight > 0 && speaker && B.head) {
      const me=headPos(people()[id].ed), you=headPos(speaker);
      if(!me || !you){s.attention.blocked='headMissing';return;}
      const f=new THREE.Vector3(0,-1,0).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion()));
      const l=B.thigh_l?.getWorldPosition(new THREE.Vector3()), r=B.thigh_r?.getWorldPosition(new THREE.Vector3());
      const bf=l&&r?UP.clone().cross(r.sub(l).setY(0).normalize()):new THREE.Vector3(0,0,1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
      const a=Math.atan2(f.x,f.z), body=Math.atan2(bf.x,bf.z), target=Math.atan2(you.x-me.x,you.z-me.z);
      const relative=Math.atan2(Math.sin(target-body),Math.cos(target-body));
      const seated=people()[id]?.ed?.status?.().mode==='seated';
      const coneWeight=1-sm((Math.abs(relative)-THREE.MathUtils.degToRad(seated?105:60))/THREE.MathUtils.degToRad(20));
      if(coneWeight>0) {
        poses.get(id).dirty=true;
        const attentionWeight=s.listenerWeight*coneWeight;
        const chestYaw=seated&&B.spine_03?THREE.MathUtils.clamp(relative,-CHEST_MAX,CHEST_MAX)*attentionWeight:0;
        if(chestYaw)rotWorld(B.spine_03,new THREE.Quaternion().setFromAxisAngle(UP,chestYaw));
        const headFace=new THREE.Vector3(0,-1,0).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion()));
        const headAngle=Math.atan2(headFace.x,headFace.z);
        const boundedTarget=body+chestYaw+THREE.MathUtils.clamp(relative-chestYaw,-HEAD_MAX,HEAD_MAX);
        const delta=Math.atan2(Math.sin(boundedTarget-headAngle),Math.cos(boundedTarget-headAngle))*attentionWeight;
        const yq=new THREE.Quaternion().setFromAxisAngle(UP,delta);
        if(B.neck_01)rotWorld(B.neck_01,new THREE.Quaternion().slerp(yq,0.4));
        rotWorld(B.head,new THREE.Quaternion().slerp(yq,B.neck_01?0.6:1));
        const face=new THREE.Vector3(0,-1,0).applyQuaternion(B.head.getWorldQuaternion(new THREE.Quaternion()));
        const desiredPitch=Math.atan2(you.y-me.y,Math.hypot(you.x-me.x,you.z-me.z)), currentPitch=Math.atan2(face.y,Math.hypot(face.x,face.z));
        const mixedPosture=!!people()[id]?.ed?.status?.().seat!==!!people()[s.listenerTarget]?.ed?.status?.().seat;
        const pitchLimit=mixedPosture?.45:.2;
        const pitch=THREE.MathUtils.clamp(desiredPitch-currentPitch,-pitchLimit,pitchLimit)*attentionWeight;
        const right=UP.clone().cross(face.clone().setY(0).normalize());
        if(B.neck_01)rotWorld(B.neck_01,new THREE.Quaternion().setFromAxisAngle(right,-pitch*0.4));
        rotWorld(B.head,new THREE.Quaternion().setFromAxisAngle(right,-pitch*(B.neck_01?0.6:1)));
      }
      return;
    }
    if(s.listenerWeight<=0.001 && !L.listener){s.listenerTarget=null;s.listenerConversation=null;}
    if(L.dialogue || hadListener)return;
    if (!yaw && !nod && !shake) return;
    poses.get(id).dirty=true;
    const yq = (a) => new THREE.Quaternion().setFromAxisAngle(UP, a);
    if (chest && B.spine_03) rotWorld(B.spine_03, yq(chest));
    if (B.neck_01) rotWorld(B.neck_01, yq(0.4 * (head + shake)));
    if (B.head) { rotWorld(B.head, yq(0.6 * (head + shake)));
      if (nod) { const g = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion())).applyAxisAngle(UP, yaw).setY(0).normalize();
        const ax = new THREE.Vector3().crossVectors(UP, g).normalize();
        if (B.neck_01) rotWorld(B.neck_01, new THREE.Quaternion().setFromAxisAngle(ax, 0.35 * nod));
        rotWorld(B.head, new THREE.Quaternion().setFromAxisAngle(ax, 0.65 * nod)); } }
  }
  // the bubbles: over the head of whoever is «speaking», facing the camera, the same size on the screen wherever he stands
  function update(camH) {
    const T = now();
    for (const [id, p] of Object.entries(people())) {
      const t = talkOf(id), s = bubbleOf(id), ed = p.ed;
      const u = t ? (T - t.at) / 1000 : -1;
      if (!t || !ed || u < 0 || u > SHOW || !show()) { s.visible = false; continue; }   // the menu can switch the bubbles off (the heads still answer)
      const h = headPos(ed); if (!h) { s.visible = false; continue; }
      s.material.map !== texture(t.icon, t.mark) && (s.material.map = texture(t.icon, t.mark), s.material.needsUpdate = true);
      s.material.opacity = sm(u / FADE) * (1 - sm((u - SHOW + FADE) / FADE));
      s.position.set(h.x, h.y + 0.30, h.z);
      const H = 0.09 * (camH || 1); s.scale.set(H * 256 / 176, H, 1); s.visible = true;
    }
  }
  return {beginFrame,reset,capture,stage,flush,update,attentionStatus:id=>st[id]?.attention||null,wants:id=>{const L=lookWant(id,now());return L.dialogue || L.w>0.01 || (st[id]?.w||0)>0.001 || (st[id]?.listenerWeight||0)>0.001;}};
}
