// People talking to each other (invitations): a bubble over the speaker's head (the thing + the answer), the two look at each
// other, the answer is also given with the head — a nod for «yes», a shake for «no» and «not now».
// The world carries it per person: chars[id].talk = {at, to, icon, mark} (at: the director's time, ms; icon: smoke | coffee |
// whisky; mark: q | yes | no | later). Everything is a function of (now − at), so every viewer, a late one too, sees the same.
import * as THREE from 'three';
import { drawBubble } from './talk-icons.js';

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
  const tex = {}, bub = {}, st = {};
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
  const headPos = (ed) => { const h = ed.root.getObjectByName('head'); return h ? h.getWorldPosition(new THREE.Vector3()) : null; };
  const talkOf = (id) => { const t = chars()?.[id]?.talk; return valid(t) ? t : null; };

  // who he looks at now and how strongly (0..1), from his own talk and from talk addressed to him
  function lookWant(id, T) {
    let best = null, w = 0;
    const own = talkOf(id);
    if (own) { const u = (T - own.at) / 1000; const k = sm((u + LOOK_BEFORE) / 0.35) * (1 - sm((u - LOOK_AFTER) / 0.5)); if (k > w) { w = k; best = own.to; } }
    for (const [o, e] of Object.entries(chars() || {})) { if (o === id) continue; const t = valid(e?.talk) ? e.talk : null; if (!t || t.to !== id) continue;
      const u = (T - t.at) / 1000; const k = sm((u - 0.25) / 0.4) * (1 - sm((u - LOOK_AFTER) / 0.5)); if (k > w) { w = k; best = o; } }
    return { who: best, w };
  }
  // after the mixer: turn the neck and head (and the chest, when the hands are free) towards the other; nod or shake for the answer
  function post(id, B, holder, handsBusy, dt, walking) {
    const T = now(), s = st[id] || (st[id] = { w: 0, yaw: 0 });
    const L = lookWant(id, T), who = L.who, w = walking ? 0 : L.w, other = who && people()[who]?.ed;   // walking: eyes on the way
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
    let nod = 0, shake = 0; const own = talkOf(id);
    if (own && (own.mark === 'yes' || own.mark === 'no' || own.mark === 'later')) { const u = (T - own.at) / 1000 - 0.15;
      if (own.mark === 'yes' && u > 0 && u < NOD.T) nod = NOD.amp * Math.sin(Math.PI * NOD.n * u / NOD.T) ** 2;
      if (own.mark !== 'yes' && u > 0 && u < SHAKE.T) shake = SHAKE.amp * Math.sin(2 * Math.PI * SHAKE.n * u / SHAKE.T) * Math.sqrt(Math.sin(Math.PI * u / SHAKE.T)); }
    if (!yaw && !nod && !shake) return;
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
  return { post, update };
}
