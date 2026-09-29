// What the people in the newsroom share: the desk chairs, the floor they walk on, the things on the desks (typewriters, mugs).
// Every character is a separate createEditor(); nothing here belongs to one of them. A chair is moved by whoever sits at that desk;
// a desk is cleared for coffee or lunch by whoever claimed it; the others walk around where a person stands or sits.
import * as THREE from 'three';
import { createNav } from './nav.js';
import { GRID } from './navgrid.js';
import { S, DESKS, SPOTS, RADIUS, chairBox, CHAIR_REST, CHAIR_NODE } from './layout.js';
import { createCoffee } from './coffee.js';

export function createShared({ scene, office, typewriters = null, phones = null, coffeeAddon = null, drinkLAddon = null }) {
  // ---------- desk chairs (office nodes)
  const chairs = {}; office.updateMatrixWorld(true);
  for (const [k, name] of Object.entries(CHAIR_NODE)) { const node = office.getObjectByName(name);
    if (node) chairs[k] = { node, rest: node.getWorldPosition(new THREE.Vector3()), dy: CHAIR_REST, plan: CHAIR_REST }; }
  function setChair(k, dy) { const c = chairs[k]; if (!c) return; c.dy = dy;
    const w = c.rest.clone(); w.z -= (dy - CHAIR_REST) * S; c.node.position.copy(c.node.parent.worldToLocal(w)); }
  let chairsSet = false;
  function initChairs(state) {                          // the first world a viewer gets: every chair where the director says
    if (chairsSet) return; chairsSet = true;
    for (const k of Object.keys(chairs)) { const v = state?.[k] ?? CHAIR_REST; setChair(k, v); chairs[k].plan = v; }
  }

  // ---------- walking: one floor, boxes for the chairs and for the places where the others are (from the world, the same for every viewer)
  const nav = createNav(GRID, RADIUS), stations = {};
  const boxOf = (place) => {                            // where a person stands or sits, as a box others walk around
    if (!place) return null;
    if (place.spot && SPOTS[place.spot]) { const p = SPOTS[place.spot], r = 0.22 * S; return [p.x - r, p.z - r, p.x + r, p.z + r]; }
    if (place.bench) { const p = place.bench, r = 0.2 * S; return [p.x - r, p.z - r, p.x + 0.55 * S, p.z + r]; }   // seated on the bench: the legs go towards the table (+x)
    return null;                                        // at a desk: his chair is already a box
  };
  function setStation(id, place) { stations[id] = boxOf(place); }
  function syncFor(id) {
    nav.setBoxes([...Object.keys(DESKS).map((k) => chairBox(k, chairs[k] ? chairs[k].plan : CHAIR_REST)),
      ...Object.entries(stations).filter(([k, b]) => k !== id && b).map(([, b]) => b)]);
  }

  // ---------- the things on the desks: a desk claimed for coffee, lunch or rest has its typewriter taken away; the mug shows instead
  let coffee = null;
  if (coffeeAddon) { try { coffee = createCoffee({ scene, addon: coffeeAddon, DESKS, S }); } catch (e) { console.warn('coffee unavailable:', e); } }
  const mugL = {}; let drinkL = null;                   // «курит и пьёт кофе»: a left-hand mug per desk, moved along the baked path
  if (drinkLAddon) {
    try { const dc = drinkLAddon.animations[0], nodeOf = (t) => THREE.PropertyBinding.parseTrackName(t.name).nodeName; let slot = null;
      drinkLAddon.scene.traverse((o) => { if (!slot && /^PROP.*mug.*slot.*L$/i.test(o.name)) slot = o; });
      const mugClip = new THREE.AnimationClip('drink_l_mug', dc.duration, dc.tracks.filter((t) => nodeOf(t) === slot.name));
      for (const [k, D] of Object.entries(DESKS)) {
        const g = new THREE.Group(); g.name = 'COFFEE L ' + k; g.matrixAutoUpdate = false; g.matrix.makeRotationY(D.th).setPosition(D.x, 0, D.z).multiply(new THREE.Matrix4().makeScale(S, S, S));
        const s = slot.clone(true); s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); g.add(s); g.visible = false; scene.add(g);
        const m = new THREE.AnimationMixer(s), a = m.clipAction(mugClip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.time = 0; m.update(0);
        mugL[k] = { g, m, a, t: 0, D: dc.duration }; }
      drinkL = { clip: dc, slotName: slot.name };
    } catch (e) { console.warn('coffee with a cigarette unavailable:', e); }
  }
  const claims = {};                                    // id → {desk, kind}
  const claim = (id, desk, kind) => { claims[id] = desk ? { desk, kind } : null; };
  function applyProps() {
    const by = {}; for (const c of Object.values(claims)) if (c) by[c.desk] = c.kind;
    if (typewriters) for (const [d, m] of Object.entries(typewriters.M)) { const v = !(d in by); if (m.g.visible !== v) m.g.visible = v; }
    if (coffee) for (const k of Object.keys(DESKS)) coffee.show(k, (!typewriters || k in by) && by[k] !== 'smoke_coffee' && by[k] !== 'rest_desk');   // the mug takes the typewriter's place
    for (const k in mugL) mugL[k].g.visible = by[k] === 'smoke_coffee';
  }

  // ---------- the phones: one set on the desks; a person rings or holds a handset only through his own view of them,
  // and a quiet person does not hang up another's call (the one who rings or holds it owns that phone until he lets go)
  const phoneOwner = {};
  function phonesFor(id) {
    if (!phones) return null;
    const mine = (k) => !phoneOwner[k] || phoneOwner[k] === id;
    return { ...phones,
      ring: (k, t) => { if (t >= 0) phoneOwner[k] = id; if (!mine(k)) return; phones.ring(k, t); if (t < 0 && phoneOwner[k] === id && !phoneOwner[k + ':hold']) delete phoneOwner[k]; },
      hold: (k, p, ...rest) => { if (p > 0) { phoneOwner[k] = id; phoneOwner[k + ':hold'] = id; } if (!mine(k)) return; phones.hold(k, p, ...rest); if (!(p > 0)) delete phoneOwner[k + ':hold']; } };
  }
  return { chairs, setChair, initChairs, phonesFor, nav, setStation, syncFor, coffee, mugL, drinkL, claim, applyProps, typewriters,
    groups: [...(coffee ? coffee.groups : []), ...Object.values(mugL).map((m) => m.g)] };
}
