// Venetian blinds on the three west windows, built on the page so they can be raised, lowered and tilted.
// The modelled blinds are hidden. down: 0 = raised to the top, 1 = lowered to the sill; tilt: 0 = slats flat (open), 1 = closed.
// The same numbers drive the sunbeams (sunbeams.js), so light in the air matches the stripes the sun shadow draws.
import * as THREE from 'three';

export const BLINDS = {
  x: -5.13,                                   // plane of the slats (three.js x), just inside the west wall
  top: 4.58, sill: 1.34, winTop: 4.61,        // underside of the headrail, sill, top of the window opening
  spacing: 0.07, slat: 0.075, thick: 0.004,   // slat pitch, slat depth, slat thickness
  windows: [[-4.4, -1.2], [-0.9, 1.9], [2.2, 5.0]],   // z ranges of the openings
  maxTilt: 1.35,                              // radians at tilt = 1 (slats overlap: closed)
};
const B = BLINDS, N = Math.ceil((B.top - B.sill) / B.spacing), STACK = 0.0065, RAIL = 0.022;
export const bottomOf = (down) => B.top - Math.min(1, Math.max(0, down)) * (B.top - B.sill);

export function createBlinds(office) {
  let enamel = null;
  office.traverse((o) => {
    if (!o.isMesh) return;
    const m = [].concat(o.material).find((mt) => mt.name === 'OFFICE | blind enamel');
    if (m) { enamel = m; o.visible = false; }         // the modelled blinds: replaced by these
  });
  const mat = enamel || new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.6 });
  const cord = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.9 });
  const group = new THREE.Group(); group.name = 'BLINDS (page)';
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const slats = [], rails = [], cords = [];
  for (const [z0, z1] of B.windows) {
    const w = z1 - z0 - 0.02, zc = (z0 + z1) / 2;
    const head = new THREE.Mesh(box(0.07, 0.05, w + 0.02), mat); head.position.set(B.x, B.top + 0.025, zc); group.add(head);
    const s = new THREE.InstancedMesh(box(B.slat, B.thick, w), mat, N); s.userData.zc = zc; slats.push(s); group.add(s);
    const r = new THREE.Mesh(box(0.06, RAIL, w), mat); r.userData.zc = zc; rails.push(r); group.add(r);
    const c = new THREE.InstancedMesh(box(0.003, 1, 0.012), cord, 4);           // ladder tapes: front and back, two per blind
    c.userData.z = [z0 + 0.33, z1 - 0.33]; cords.push(c); group.add(c);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Z = new THREE.Vector3(0, 0, 1);
  let state = { down: 0.63, tilt: 0 };
  function set(v) {
    state = { down: Math.min(1, Math.max(0, +v.down)), tilt: Math.min(1, Math.max(0, +v.tilt)) };
    const bottom = bottomOf(state.down), a = state.tilt * B.maxTilt;
    const L = B.top - bottom - RAIL;
    let k = Math.min(N, Math.floor(L / B.spacing));                  // slats hanging at full pitch; the rest stack on the bottom rail
    while (k > 0 && (N - k) * STACK + k * B.spacing > L) k--;
    for (let wi = 0; wi < slats.length; wi++) {
      const s = slats[wi], zc = s.userData.zc;
      for (let i = 0; i < N; i++) {
        if (i < k) { P.set(B.x, B.top - (i + 1) * B.spacing, zc); Q.setFromAxisAngle(Z, a); }
        else { P.set(B.x, bottom + RAIL + (N - 1 - i) * STACK + STACK / 2, zc); Q.identity(); }
        s.setMatrixAt(i, M.compose(P, Q, S));
      }
      s.instanceMatrix.needsUpdate = true; s.computeBoundingSphere();
      rails[wi].position.set(B.x, bottom + RAIL / 2, zc);
      const c = cords[wi], h = B.top - bottom, zs = c.userData.z; let j = 0;
      for (const z of zs) for (const side of [-1, 1]) {
        P.set(B.x + side * B.slat / 2 * Math.cos(a) * 0.98, bottom + h / 2, z); S.set(1, h, 1);
        c.setMatrixAt(j++, M.compose(P, Q.identity(), S)); S.set(1, 1, 1);
      }
      c.instanceMatrix.needsUpdate = true; c.computeBoundingSphere();
    }
    return state;
  }
  set(state);
  return { group, set, get state() { return state; } };
}
