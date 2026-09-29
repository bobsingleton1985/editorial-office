// Neon sign across the street: a vertical "HOTEL" blade on the nearest facade, seen through the west windows.
// At night it burns red with a soft halo and now and then buzzes; its light falls into the room through the blinds
// (the light itself lives in lighting.js and stays steady, so the cached room picture on TVs is not redrawn).
// By day the tubes are off and only the painted board is seen. Prop text is English.
import * as THREE from 'three';

export const NEON = { x: -5.99, y: 1.52, z: -0.4, h: 1.05, w: 0.38, light: [-5.9, 3.3, -0.4], text: 'HOTEL', color: '#ff2f45', core: '#ffe2e4' };

function letters(draw, W, H, text) {
  const n = text.length, step = H / (n + 0.6);
  for (let i = 0; i < n; i++) draw(text[i], W / 2, step * (i + 0.8) + step * 0.05, step);
}
function canvas(W, H, paint) { const c = document.createElement('canvas'); c.width = W; c.height = H; paint(c.getContext('2d'), W, H); return c; }
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

export function createNeon() {
  const W = 128, H = 512, { text } = NEON;
  const font = (s) => `700 ${Math.round(s * 0.78)}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  // board: dark enamel with a thin border and the unlit tubes (seen by day)
  const board = canvas(W, H, (g) => {
    g.fillStyle = '#231a18'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#6d5a4c'; g.lineWidth = 4; g.strokeRect(5, 5, W - 10, H - 10);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    letters((ch, x, y, s) => { g.font = font(s); g.strokeStyle = '#a58b86'; g.lineWidth = 5; g.strokeText(ch, x, y); }, W, H, text);
  });
  // glowing tubes: black everywhere except the lit glass (used as emissive map)
  const glow = canvas(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    letters((ch, x, y, s) => {
      g.font = font(s);
      g.shadowColor = NEON.color; g.shadowBlur = 14; g.strokeStyle = NEON.color; g.lineWidth = 7; g.strokeText(ch, x, y);
      g.shadowBlur = 0; g.strokeStyle = NEON.core; g.lineWidth = 2.5; g.strokeText(ch, x, y);
    }, W, H, text);
    g.shadowColor = NEON.color; g.shadowBlur = 10; g.strokeStyle = NEON.color; g.lineWidth = 3; g.strokeRect(9, 9, W - 18, H - 18);
  });
  // halo: the red haze around the sign (additive, larger than the board)
  const halo = canvas(128, 256, (g) => {
    const r = g.createRadialGradient(64, 128, 8, 64, 128, 120);
    r.addColorStop(0, 'rgba(255,60,75,0.55)'); r.addColorStop(0.45, 'rgba(255,40,60,0.22)'); r.addColorStop(1, 'rgba(255,30,50,0)');
    g.setTransform(1, 0, 0, 2, 0, -128); g.fillStyle = r; g.fillRect(0, 64, 128, 128);
  });

  const group = new THREE.Group(); group.name = 'NEON SIGN';
  const { x, y, z, h, w } = NEON, facadeX = -6.25;
  const mat = new THREE.MeshStandardMaterial({ map: tex(board), emissiveMap: tex(glow), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, metalness: 0.2 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x2a211d, roughness: 0.7, metalness: 0.3 });
  // blade: faces look north and south, the long side runs from the facade toward the office
  const blade = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), [edge, edge, edge, edge, mat, mat]);
  blade.position.set(x, y, z); group.add(blade);
  const reach = (x - w / 2) - facadeX;                             // gap between the wall and the blade
  if (reach > 0.005) for (const dy of [-h * 0.38, h * 0.38]) {     // two iron brackets into the wall
    const arm = new THREE.Mesh(new THREE.BoxGeometry(reach, 0.025, 0.025), edge);
    arm.position.set(facadeX + reach / 2, y + dy, z); group.add(arm);
  }
  const haloMat = new THREE.MeshBasicMaterial({ map: tex(halo), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w * 3.2, h * 1.5), haloMat);
    p.position.set(x, y, z + side * 0.05); if (side < 0) p.rotation.y = Math.PI; group.add(p);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w * 3.4, h * 1.6), haloMat);   // red wash on the facade behind
  back.position.set(facadeX + 0.01, y, z); back.rotation.y = Math.PI / 2; group.add(back);
  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  let level = 0, flick = 1, buzzT = 8 + Math.random() * 10, buzz = 0, t = 0;
  return {
    group,
    // how bright the tubes are for the weather: night 1, dull days less, sunny day almost off
    set(sky) { level = { night: 1, rain: 0.55, cloudy: 0.3, snow: 0.3, sun: 0.08 }[sky] ?? 1; },
    update(dt) {
      t += dt; buzzT -= dt;
      if (buzzT <= 0 && buzz <= 0) { buzz = 0.3 + Math.random() * 0.6; buzzT = 8 + Math.random() * 14; }
      if (buzz > 0) { buzz -= dt; flick = Math.sin(t * 61) > 0.1 ? 1 : 0.15; } else flick = 0.97 + 0.03 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
      const k = level * flick;
      mat.emissiveIntensity = 1.6 * k; haloMat.opacity = level >= 0.5 ? k : k * 0.4;
    },
  };
}
