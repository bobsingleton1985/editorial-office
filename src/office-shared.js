// What the people in the newsroom share: the desk chairs, the floor they walk on, the things on the desks (typewriters, mugs).
// Every character is a separate createEditor(); nothing here belongs to one of them. A chair is moved by whoever sits at that desk;
// a desk is cleared for coffee or lunch by whoever claimed it; the others walk around where a person stands or sits.
import * as THREE from 'three';
import { createNav } from './nav.js';
import { GRID } from './navgrid.js';
import { S, DESKS, CHAIR_KEYS, diningChairOccupiedBox, BENCH, SPOTS, RADIUS, chairBox, CHAIR_REST, CHAIR_NODE } from './layout.js';
import { createCoffee } from './coffee.js';
import { createWhiskyProps } from './whisky.js';

export function createShared({ scene, office, typewriters = null, phones = null, coffeeAddon = null, drinkLAddon = null, crowd = null, whisky = null }) {
  // ---------- desk chairs (office nodes)
  const chairs = {}; office.updateMatrixWorld(true);
  for (const [k, name] of Object.entries(CHAIR_NODE)) { const node = office.getObjectByName(name);
    if (node) chairs[k] = { node, rest: node.getWorldPosition(new THREE.Vector3()), restQ: node.getWorldQuaternion(new THREE.Quaternion()), dy: CHAIR_REST, plan: CHAIR_REST }; }
  function setChair(k, dy, dx = 0, yaw = 0) { const c = chairs[k]; if (!c) return; c.dy = dy;   // dx, yaw (degrees): the chair pushed aside and turned (feet on the desk)
    const w = c.rest.clone(); w.z -= (dy - CHAIR_REST) * S; w.x += dx * S; c.node.position.copy(c.node.parent.worldToLocal(w));
    if (yaw || c.turned) { c.turned = !!yaw; const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * Math.PI / 180).multiply(c.restQ);
      c.node.quaternion.copy(c.node.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q)); } }
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
    if(place.chair){const b=diningChairOccupiedBox();b.dining=true;return b;}
    if (place.bench) { const p = place.bench, r = 0.2 * S; return [p.x - r, p.z - r, p.x + 0.55 * S, p.z + r]; }   // seated on the bench: the legs go towards the table (+x)
    return null;                                        // at a desk: his chair is already a box
  };
  function setStation(id, place) { stations[id] = boxOf(place); }
  // Sample native seat paths against body and passage reservations. Keep the lease
  // through the chair tail or the complete retreat behind the bench.
  const nativeD = {},actors={};
  const registerActor=(id,read)=>{actors[id]=read;};
  function nativeClear(id, points, seat){
    const bench=seat?.startsWith('bench'),d=seat==='diningChair',others=Object.entries(stations).filter(([k,b])=>k!==id&&b);
    const boxes=d?others.map(([,b])=>b):others.filter(([,b])=>b.dining).map(([,b])=>b);
    for(const [k,b]of Object.entries(nativeD))if(k!==id&&(d||b.dining||bench&&b.bench))boxes.push(b);
    if(bench)for(const [k,read]of Object.entries(actors)){if(k===id)continue;const a=read();if(a&&!a.seat)boxes.push([a.x-RADIUS,a.z-RADIUS,a.x+RADIUS,a.z+RADIUS]);}
    return !points.some(p=>boxes.some(b=>p.x>b[0]-RADIUS&&p.x<b[2]+RADIUS&&p.z>b[1]-RADIUS&&p.z<b[3]+RADIUS));
  }
  function setNative(id,points,seat){if(!points){delete nativeD[id];return;}const b=[Math.min(...points.map(p=>p.x))-RADIUS,Math.min(...points.map(p=>p.z))-RADIUS,Math.max(...points.map(p=>p.x))+RADIUS,Math.max(...points.map(p=>p.z))+RADIUS];b.dining=seat==='diningChair';b.bench=seat?.startsWith('bench');nativeD[id]=b;}
  function benchRefuge(id,from){
    syncFor(id);const choices=[];
    for(const x of [BENCH.N.x-1.5,BENCH.N.x-2.2])for(const z of [BENCH.N.z,BENCH.M.z,BENCH.S.z]){
      const p={x,z,th:from.th};if(nav.blocked(x,z)||Math.hypot(x-from.x,z-from.z)<.3)continue;
      if(Object.entries(actors).some(([k,read])=>{const a=read();return k!==id&&a&&Math.hypot(x-a.x,z-a.z)<2*RADIUS+.1;}))continue;
      if(Object.entries(nativeD).some(([k,b])=>k!==id&&x>b[0]-RADIUS&&x<b[2]+RADIUS&&z>b[1]-RADIUS&&z<b[3]+RADIUS))continue;
      const pts=nav.path(from,p,.05);if(!pts)continue;
      const samples=[];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05));for(let j=0;j<=n;j++)samples.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});}
      if(nativeClear(id,samples,'bench-refuge'))choices.push({point:p,pts,samples,cost:nav.length(pts)});
    }
    return choices.sort((a,b)=>a.cost-b.cost)[0]||null;
  }
  function syncFor(id) {
    nav.setBoxes([...CHAIR_KEYS.map((k) => chairBox(k, chairs[k] ? chairs[k].plan : CHAIR_REST)),
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
        const s = slot.clone(true); s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const off = new THREE.Group(); off.add(s); g.add(off); g.visible = false; scene.add(g);      // off: the person's shift of the baked path (editor.js, mugOffset)
        const m = new THREE.AnimationMixer(s), a = m.clipAction(mugClip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); a.paused = true; a.time = 0; m.update(0);
        mugL[k] = { g, off, m, a, t: 0, D: dc.duration }; }
      drinkL = { clip: dc, slotName: slot.name, slot, mugClip };
    } catch (e) { console.warn('coffee with a cigarette unavailable:', e); }
  }
  let wprops = null;                                    // whisky alone (whisky.js): the bar's things and a glass and a bottle for every desk
  if (whisky) { try { wprops = createWhiskyProps({ scene, office, W: whisky, DESKS }); if (!wprops.barReady) console.warn('whisky: no BAR | root in the office'); } catch (e) { console.warn('whisky unavailable:', e); wprops = null; } }
  const claims = {};                                    // id → {desk, kind}
  const claim = (id, desk, kind) => { claims[id] = desk ? { desk, kind } : null; };
  function applyProps() {
    const by = {}; for (const c of Object.values(claims)) if (c) by[c.desk] = c.kind;
    if (typewriters) for (const [d, m] of Object.entries(typewriters.M)) { const v = !(d in by); if (m.g.visible !== v) m.g.visible = v; }
    if (coffee) for (const k of Object.keys(DESKS)) coffee.show(k, (!typewriters || k in by) && by[k] !== 'smoke_coffee' && by[k] !== 'rest_desk' && by[k] !== 'whisky');   // the mug takes the typewriter's place
    for (const k in mugL) mugL[k].g.visible = by[k] === 'smoke_coffee';
    if (wprops) for (const k of Object.keys(DESKS)) wprops.showDesk(k, by[k] === 'whisky');
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
  const jazz = {};                                      // listening at the TV: id → {g, off} — everybody's running plan, so nobody plays the loop another plays
  return { chairs, setChair, jazz, initChairs, phonesFor, nav, crowd, setStation, nativeClear, setNative, registerActor, benchRefuge, syncFor, coffee, mugL, drinkL, claim, applyProps, typewriters, whisky: wprops, whiskyRec: wprops ? whisky : null,
    groups: [...(coffee ? coffee.groups : []), ...Object.values(mugL).map((m) => m.g), ...(wprops ? wprops.groups : [])] };
}
