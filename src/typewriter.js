// Typing, moved as is from the approved page «Редактор в офисе» (editor2A v13): the compact flat typewriter (office v03),
// a letter on every fingertip strike of clip "type", the carriage shifts so the current column stands at the print point,
// words wrap, a full sheet starts a new one. The machines stay on the desks; an activity that needs the desk takes its machine away (clear).
// typewriter-v01.glb is the same machine moved into the pack's table frame (metres, chair at the origin), so each desk
// gets a copy placed like the seated character: desk frame × S.
// Paper feed (owner 30.09: "бумага должна постепенно вылезать из машинки"): a fresh sheet stands in the machine with only its top
// above the platen; every new line rolls it up by one line, so the line being typed is always at the platen. What is still
// inside the machine is cut off by a plane just below the platen top (renderer.localClippingEnabled).
import * as THREE from 'three';

const U = 1.5538;                                                  // office v03 units per metre (the approved page's scale)
const TEXT = 'Вечерний выпуск. В редакции тихо, только стучит машинка. Сегодня в номере: новости города, погода на выходные и письма читателей. Редактор проверяет каждую строку и ставит точку. ';
const PAPER = { w: 0.428, h: 0.301 };                               // office v03 units, as on the approved page
const COLS = 34, MARGIN = 0.04, CHARW = (PAPER.w - 2 * MARGIN) / COLS, LINEH = 0.018, TOP = 0.035, ROWS = Math.floor((PAPER.h - TOP - 0.02) / LINEH);
const PX = 2400;
const CARRIAGE = /carriage rail|paper|platen|\| text$/;

export function createTypewriters(scene, gltf, desks, S) {
  const M = {};
  for (const [k, D] of Object.entries(desks)) {
    const g = new THREE.Group(); g.name = 'TYPEWRITER ' + k; g.scale.setScalar(S); g.position.set(D.x, 0, D.z); g.rotation.y = D.th;
    const root = gltf.scene.clone(true); g.add(root); scene.add(g); g.updateMatrixWorld(true);
    const car = new THREE.Group(); car.name = 'carriage ' + k; root.add(car);
    const parts = []; root.traverse((o) => { if (o.isMesh && CARRIAGE.test(o.name.replace(/_/g, ' '))) parts.push(o); });
    let sheet = null, paper = null;
    for (const o of parts) { car.attach(o); if (/text$/.test(o.name)) sheet = o; if (/\| paper$/.test(o.name.replace(/_/g, ' '))) paper = o; }
    const feed = new THREE.Group(); feed.name = 'paper feed ' + k; car.add(feed);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const canvas = document.createElement('canvas'); canvas.width = Math.round(PAPER.w * PX); canvas.height = Math.round(PAPER.h * PX);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.flipY = false;
    if (sheet) { sheet.material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); sheet.castShadow = false; }
    // the sheet's top edge and the platen top (machine metres, root frame): the typed line stands just above the platen
    const top = (o) => new THREE.Box3().setFromObject(o).max.y, rootY = (y) => root.worldToLocal(new THREE.Vector3(0, y, 0)).y;
    let platen = null; root.traverse((o) => { if (!platen && o.isMesh && /platen roller$/.test(o.name.replace(/_/g, ' '))) platen = o; });
    const sheetTop = sheet ? rootY(top(sheet)) : 0, platenTop = platen ? rootY(top(platen)) : 0;
    const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (sheet && paper && platen) {
      clip.constant = -root.localToWorld(new THREE.Vector3(0, platenTop - 0.012, 0)).y;          // world: keep what is above the platen's upper part
      paper.material = paper.material.clone(); for (const o of [sheet, paper]) { feed.attach(o); o.material.clippingPlanes = [clip]; }
    }
    // along the carriage (local X, metres) the sheet's left edge — the typist's left — is +X, letters go towards -X
    const bx = new THREE.Box3().setFromObject(sheet || root), a = root.worldToLocal(bx.min.clone()), b = root.worldToLocal(bx.max.clone());
    const left = Math.max(a.x, b.x), right = Math.min(a.x, b.x);
    M[k] = { g, car, feed, canvas, ctx: canvas.getContext('2d'), tex, left, printX: (left + right) / 2, col: 0, row: 0, idx: 0,
      feedAt: (row) => (sheet && paper && platen ? platenTop + 0.004 - sheetTop + (TOP + row * LINEH) / U : 0), feedY: 0 };
    newSheet(M[k]);
  }
  function placeCarriage(m) {                                       // current column at the print point (centre of the paper)
    const colX = m.left - (MARGIN + (m.col + 0.5) * CHARW) / U;
    m.car.position.x = m.printX - colX;
  }
  function newSheet(m) { m.ctx.clearRect(0, 0, m.canvas.width, m.canvas.height); m.col = 0; m.row = 0; m.tex.needsUpdate = true; placeCarriage(m);
    m.feedY = m.feed.position.y = m.feedAt(0); }                 // a fresh sheet: only its top shows above the platen
  function update(dt) {                                             // the line feed: a quick roll up to the current line (about 0.15 s)
    for (const m of Object.values(M)) { const t = m.feedAt(m.row), y = m.feed.position.y; if (Math.abs(t - y) < 1e-5) continue;
      m.feed.position.y = y + (t - y) * Math.min(1, dt * 20); } }
  function key(k) {                                                 // typeChar() of the approved page
    const m = M[k]; if (!m) return;
    const ch = TEXT[m.idx % TEXT.length]; m.idx++;
    if (m.col >= COLS || (ch === ' ' && m.col === 0)) { if (m.col >= COLS) { m.col = 0; m.row++; } if (ch === ' ') return placeCarriage(m); }
    if (m.row >= ROWS) newSheet(m);
    const c = m.ctx;
    c.font = `${Math.round(CHARW * PX * 1.62)}px "Courier New", Courier, monospace`;
    c.fillStyle = 'rgba(28,24,22,0.9)'; c.textBaseline = 'alphabetic';
    c.fillText(ch, (MARGIN + m.col * CHARW) * PX, (TOP + m.row * LINEH) * PX);
    m.tex.needsUpdate = true;
    m.col++;
    if (ch === ' ') { const next = TEXT.slice(m.idx % TEXT.length).split(' ')[0].length; if (m.col + next > COLS) { m.col = 0; m.row++; } }
    placeCarriage(m);
  }
  function clear(k) { for (const [d, m] of Object.entries(M)) m.g.visible = d !== k; }
  return { key, clear, update, groups: Object.values(M).map((m) => m.g), M };
}
