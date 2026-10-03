// Coffee at the desks — the approved grip from «Редактор в офисе» (editor2A v20: handle grip, mug centred on the mouth),
// clip MC Seated SitChairTable_Idle_06_DrinkR with the mug path baked in the pack's table frame.
// Every desk has its own mug; it stands where the clip picks it up, which is where the typewriter stands, so the mug is shown
// while that desk is cleared for coffee (the typewriter taken away) — drinking moves it along the baked path,
// the body clip is played by the editor over the seated idle. Mug variants from the props sheet: A cream faceted, B green enamel, D two-tone.
import * as THREE from 'three';

export const SIP = { wait: 2, rest: 9, fade: 0.5 };                 // first sip after sitting down, pause between sips, body blend (s)
const MUG_OF = { A: 'SM_Prop_MugCoffee', B: 'SM_Prop_Mug_B_enamel', C: 'SM_Prop_Mug_D_twotone' };
const key = (s) => s.replace(/[^A-Za-z0-9]/g, '').toLowerCase();

export function createCoffee({ scene, addon, DESKS, S }) {
  const clip = addon.animations.find((c) => c.name === 'drink_r');
  let slot = null; addon.scene.traverse((o) => { if (!slot && key(o.name) === 'propmugslot') slot = o; });
  if (!clip || !slot) throw new Error('coffee add-on: no drink_r clip or mug slot');
  const nodeOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName;
  const bodyClip = new THREE.AnimationClip('drink_r', clip.duration, clip.tracks.filter((t) => nodeOf(t) !== slot.name));
  const mugClip = new THREE.AnimationClip('drink_r_mug', clip.duration, clip.tracks.filter((t) => nodeOf(t) === slot.name));
  const mugs = {}; slot.children.forEach((c) => { mugs[key(c.name)] = c; });
  const desks = {}, groups = [];
  for (const [k, D] of Object.entries(DESKS)) {
    const mesh = mugs[key(MUG_OF[k] || MUG_OF.A)] || slot.children[0]; if (!mesh) continue;
    const g = new THREE.Group(); g.name = 'COFFEE ' + k; g.matrixAutoUpdate = false;             // the pack's table frame at this desk
    g.matrix.makeRotationY(D.th).setPosition(D.x, 0, D.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
    const s = new THREE.Group(); s.name = slot.name; const m = mesh.clone(true);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    s.add(m); g.add(s); scene.add(g); groups.push(g);
    const mixer = new THREE.AnimationMixer(s), a = mixer.clipAction(mugClip);
    a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.time = 0; mixer.update(0); g.updateMatrixWorld(true);
    desks[k] = { a, mixer, t: 0 };
  }
  // the mug of desk k at time t of the clip (0 = standing on the desk)
  function set(k, t) { const d = desks[k]; if (!d || Math.abs(d.t - t) < 1e-6) return; d.t = t; d.a.time = Math.min(t, clip.duration); d.mixer.update(0); }
  const show = (k, v) => { const g = groups.find((x) => x.name === 'COFFEE ' + k); if (g && g.visible !== v) g.visible = v; };
  const restPoints=Object.fromEntries(Object.entries(desks).map(([k,d])=>{const g=groups.find(g=>g.name==='COFFEE '+k);return [k,g.children[0].position.clone()];}));
  const lift=k=>{const g=groups.find(g=>g.name==='COFFEE '+k);return g?.visible?g.children[0].position.distanceTo(restPoints[k]):null;};
  return { bodyClip, duration: clip.duration, groups, set, show, lift };
}
