// Desk telephones of the 1950s (assets/phone-v02.glb, pack table frame, the sitter's left-hand front corner: the aisle side, he can answer standing) on desks A, B, C.
// A ringing phone rattles its handset on the cradle. While someone talks, the handset is taken off the cradle: its pose goes
// from the cradle to the ear (ear cup at the right ear, mouth cup towards the mouth), and a cord runs from the body to it.
import * as THREE from 'three';

const RING_ON = 2.0, RING_OFF = 4.0;                                  // US ring cadence: 2 s on, 4 s off

export function createPhones(scene, gltf, desks, S, sound = null) {   // sound: sound.js (the ring you hear)
  const M = {};
  for (const [k, D] of Object.entries(desks)) {
    const g = new THREE.Group(); g.name = 'PHONE ' + k; g.scale.setScalar(S); g.position.set(D.x, 0, D.z); g.rotation.y = D.th;
    const root = gltf.scene.clone(true); g.add(root); scene.add(g); g.updateMatrixWorld(true);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const find = (n) => { let r = null; root.traverse((o) => { if (!r && o.name.replace(/_/g, ' ') === n) r = o; }); return r; };
    const hs = find('PHONE | handset'), ear = find('PHONE | ear'), mouth = find('PHONE | mouth'), body = find('PHONE');
    const cord0 = find('PHONE | cord');
    // the handset lives in the scene while it moves (its world pose is set directly)
    const rest = hs.matrixWorld.clone();
    const holder = new THREE.Group(); holder.name = 'PHONE HANDSET ' + k; holder.matrixAutoUpdate = false; scene.add(holder);
    holder.matrix.copy(rest); holder.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(hs.matrixWorld).invert();
    for (const c of [...hs.children]) { const m = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld); holder.add(c); c.matrixAutoUpdate = true; m.decompose(c.position, c.quaternion, c.scale); }
    hs.visible = false;
    const earLocal = ear.position.clone(), mouthLocal = mouth.position.clone();
    // the cord: a coil lying behind the phone at rest, a hanging tube to the mouth end while the handset is up
    const cordMat = cord0 && cord0.isMesh ? cord0.material : new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3 });
    const cordStart = new THREE.Vector3(-0.07, 0.02, 0.04);              // where the coil meets the plinth (v02: Blender (−0.07, −0.04, 0.02) → glTF), body frame
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), cordMat); tube.userData.simulationGeometry=true; tube.visible = false; tube.castShadow = true; scene.add(tube);
    M[k] = { g, body, holder, rest, earLocal, mouthLocal, cord0, cordStart, tube, up: false };
  }
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  // ringing: the handset jumps a little on the cradle (t = seconds since the call came)
  function ring(k, t) {
    const m = M[k]; sound?.phone(k, m && !m.up ? t : -1, RING_ON, RING_ON + RING_OFF); if (!m || m.up) return;
    const on = t >= 0 && (t % (RING_ON + RING_OFF)) < RING_ON;
    m.holder.matrix.copy(m.rest);
    if (on) { const a = 0.012 * Math.sin(t * 2 * Math.PI * 18), b = 0.004 * Math.abs(Math.sin(t * 2 * Math.PI * 11));
      m.holder.matrix.multiply(new THREE.Matrix4().makeRotationZ(a)).multiply(new THREE.Matrix4().makeTranslation(0, b, 0)); }
    m.holder.updateMatrixWorld(true);
  }
  // handset between the cradle (p = 0) and the ear (p = 1); E, Mo: world ear and mouth points, R: world "outward" (the head's right)
  function hold(k, p, E, Mo, R) {
    const m = M[k]; if (!m) return;
    if (p <= 0) { m.up = false; m.holder.matrix.copy(m.rest); m.holder.updateMatrixWorld(true); m.tube.visible = false; if (m.cord0) m.cord0.visible = true; return; }
    m.up = true;
    const X = E.clone().sub(Mo).normalize(), Y = R.clone().addScaledVector(X, -R.dot(X)).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);   // the bar away from the cheek
    const sc = new THREE.Vector3(); m.rest.decompose(_v, _q, sc);
    const rot = new THREE.Matrix4().makeBasis(X, Y, Z), q1 = new THREE.Quaternion().setFromRotationMatrix(rot);
    const pos1 = E.clone().sub(m.earLocal.clone().multiply(sc).applyQuaternion(q1));
    const q = _q.clone().slerp(q1, p), pos = _v.clone().lerp(pos1, p);
    m.holder.matrix.compose(pos, q, sc); m.holder.updateMatrixWorld(true);
    // cord: from the back of the body, sagging, to the mouth end of the handset
    const a = m.cordStart.clone().applyMatrix4(m.body.matrixWorld), b = m.mouthLocal.clone().applyMatrix4(m.holder.matrixWorld);
    const low = Math.max(a.y, Math.min(a.y, b.y) - 0.18 * sc.x);         // it sags, but never below the desk it lies on
    const m1 = a.clone().lerp(b, 0.3).setY(low + 0.01 * sc.x), m2 = a.clone().lerp(b, 0.65); m2.y = low + (b.y - low) * 0.45;
    const curve = new THREE.CatmullRomCurve3([a, m1, m2, b]);
    m.tube.geometry.dispose(); m.tube.geometry = new THREE.TubeGeometry(curve, 28, 0.0055 * sc.x, 6, false); m.tube.visible = true;
    if (m.cord0) m.cord0.visible = false;
  }
  // where the hand should be to take the handset (world): the middle of the grip, a little above it
  function gripPoint(k) { const m = M[k]; return new THREE.Vector3(0, 0.02, 0).applyMatrix4(m.rest); }
  // the middle of the handset's bar where it is now (world): the palm holds it
  function grip(k) { const m = M[k]; return new THREE.Vector3(0, 0.034, 0).applyMatrix4(m.holder.matrixWorld); }   // the palm on the outer side of the bar
  // the bar's direction from the ear cup to the mouth cup (world): the knuckles lie along it
  // the handset's axes in the world: X towards the ear cup, Y the outer side (up on the cradle), Z = X × Y
  function frame(k) { const e = M[k].holder.matrixWorld.elements, v = (i) => new THREE.Vector3(e[i], e[i + 1], e[i + 2]).normalize(); return { X: v(0), Y: v(4), Z: v(8) }; }
  function axis(k) { const m = M[k], e = m.holder.matrixWorld.elements; return new THREE.Vector3(-e[0], -e[1], -e[2]).normalize(); }
  return { ring, hold, gripPoint, grip, axis, frame, groups: Object.values(M).flatMap((m) => [m.g, m.holder, m.tube]), M };
}
