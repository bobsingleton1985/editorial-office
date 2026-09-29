// What is outside the windows: evening (the city lights up, as modelled) or day with the weather — sun, clouds, rain, snow.
// Day facades are the modelled ones repainted by day (assets/city-day); the sky is painted here; rain and snow fall
// between the windows and the city (drawn every frame, so they live on the cache's moving layer).
import * as THREE from 'three';

export const SKIES = ['night', 'sun', 'cloudy', 'rain', 'snow'];
const DAY = {                     // facade self-light, colours of the dark city parts by day, snow on roofs/street
  sun: { k: 1.15, haze: 0.06, veil: [0.9, 0.93, 1.0], parts: 1.05 },
  cloudy: { k: 0.72, haze: 0.42, veil: [0.7, 0.73, 0.77], parts: 0.72 },
  rain: { k: 0.4, haze: 0.66, veil: [0.4, 0.45, 0.51], parts: 0.45 },
  snow: { k: 0.85, haze: 0.58, veil: [0.9, 0.92, 0.95], parts: 0.9, snow: true },
};
const PART = { 'CITY roof tar': 0x5a5754, 'CITY cornice stone': 0xb5aa98, 'CITY water tower wood': 0x7a5a40, 'CITY steel dark': 0x4a4b4e, 'CITY street': 0x5c5c5e };
const SNOWY = new Set(['CITY roof tar', 'CITY cornice stone', 'CITY street', 'CITY water tower wood']);

function skyTexture(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  const stops = {
    sun: ['#3f78c4', '#78a9dc', '#b9d4ea', '#dfe8ea'],
    cloudy: ['#8f99a4', '#aeb6be', '#c7ccd0', '#d6d8d8'],
    rain: ['#5d666f', '#737c85', '#8a9198', '#9a9fa3'],
    snow: ['#a9b1ba', '#c3c9cf', '#d8dcdf', '#e4e6e7'],
  }[kind];
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  stops.forEach((s, i) => grd.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  if (kind !== 'sun') {                                        // soft cloud banks
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * c.width, y = rnd() * c.height * 0.8, r = 14 + rnd() * 34;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const a = kind === 'cloudy' ? 0.22 : kind === 'rain' ? 0.18 : 0.2, v = kind === 'rain' ? 70 : 235;
      rg.addColorStop(0, `rgba(${v},${v},${v + 4},${a})`); rg.addColorStop(1, `rgba(${v},${v},${v + 4},0)`);
      g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  } else {                                                     // a few thin fair-weather clouds
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, y, w] of [[20, 120, 60], [70, 190, 44], [10, 260, 50]]) { g.beginPath(); g.ellipse(x + w / 2, y, w / 2, 5, 0, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// falling rain streaks or snow flakes in a box between the west windows and the city (three.js coords)
function precipitation(kind) {
  const snow = kind === 'snow', N = snow ? 3200 : 2600;
  const X0 = -9.5, X1 = -5.75, Z0 = -6.5, Z1 = 6.5, H = 9;           // right behind the west windows (Blender y −6.5…6.5)
  const per = snow ? 1 : 2, pos = new Float32Array(N * per * 3), seed = new Float32Array(N * per), end = new Float32Array(N * per);
  let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const x = X0 + rnd() * (X1 - X0), z = Z0 + rnd() * (Z1 - Z0), y = rnd() * H, sd = rnd();
    for (let j = 0; j < per; j++) { const k = i * per + j; pos.set([x, y, z], k * 3); seed[k] = sd; end[k] = j; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uH: { value: H }, uPx: { value: 1 } },
    vertexShader: `attribute float seed; attribute float end; uniform float uTime, uH, uPx; varying float vA;
      void main() {
        vec3 p = position;
        ${snow
    ? `float fall = 0.55 + seed * 0.35;
        p.y = mod(p.y - uTime * fall, uH);
        p.x += sin(uTime * 0.7 + seed * 40.0) * 0.35; p.z += cos(uTime * 0.5 + seed * 25.0) * 0.35;
        gl_PointSize = (3.5 + seed * 3.5) * uPx;`
    : `float fall = 9.0 + seed * 4.0;
        p.y = mod(p.y - uTime * fall, uH);
        p.y -= end * 0.7; p.z += end * 0.1;`}
        vA = smoothstep(0.0, 1.2, p.y) * (1.0 - smoothstep(uH - 1.0, uH, p.y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `varying float vA;
      void main() {
        ${snow ? 'vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(0.96, 0.97, 1.0, 0.85 * vA);'
    : 'gl_FragColor = vec4(0.82, 0.87, 0.93, 0.55 * vA);'}
      }`,
  });
  const o = snow ? new THREE.Points(geo, mat) : new THREE.LineSegments(geo, mat);
  o.frustumCulled = false; o.name = 'WEATHER_' + kind; o.renderOrder = 2;
  return o;
}

export function createWeather(scene, office, r) {
  const facades = [], parts = [], orig = new Map();
  let sky = null, onReady = null, onDynamic = null;
  office.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (orig.has(m)) continue;
      const f = m.name.match(/^CITY facade (\d) e([\d.]+)/);
      if (f) { facades.push({ m, i: +f[1], e: +f[2] }); }
      else if (PART[m.name] !== undefined) parts.push(m);
      else if (m.name === 'CITY sky gradient') sky = m;
      else continue;
      orig.set(m, { map: m.map, emissiveMap: m.emissiveMap, emissive: m.emissive.clone(), color: m.color.clone(), env: m.envMapIntensity ?? 1 });
    }
  });
  const loader = new THREE.TextureLoader(), dayTex = [];
  for (let i = 0; i < 4; i++) {
    dayTex[i] = loader.load(`assets/city-day/facade_${i}.webp`, () => {
      if (pending && dayTex.every((t) => t.image)) { const [k, o] = pending; pending = null; apply(k, o); }   // day facades arrived
      onReady && onReady();
    });
    dayTex[i].flipY = false; dayTex[i].colorSpace = THREE.SRGBColorSpace;
    dayTex[i].wrapS = dayTex[i].wrapT = THREE.RepeatWrapping;
  }
  const skies = {}, falls = { rain: null, snow: null };
  const group = new THREE.Group(); group.name = 'WEATHER'; scene.add(group);
  let current = null, active = null, pending = null;

  // kind: the sky and light of the city; opts.fall: 'rain' | 'snow' | null (also at night); opts.ground: snow lies on roofs and street
  function apply(kind, opts = {}) {
    if (!SKIES.includes(kind)) kind = 'night';
    if (DAY[kind] && !dayTex.every((t) => t.image)) { pending = [kind, opts]; return false; }   // day facades still loading: keep the city as it is, not black walls
    pending = null;
    const d = DAY[kind];
    const fall = opts.fall !== undefined ? opts.fall : kind === 'rain' || kind === 'snow' ? kind : null;
    const ground = !!d && (opts.ground !== undefined ? opts.ground : !!d.snow);
    const key = `${kind}|${fall}|${ground}`;
    if (key === current) return false;
    current = key;
    for (const { m, i, e } of facades) {
      const o = orig.get(m);
      if (!d) { m.map = o.map; m.emissiveMap = o.emissiveMap; m.emissive.copy(o.emissive); m.color.copy(o.color); m.envMapIntensity = o.env; }
      else {
        m.color.setScalar(0); m.envMapIntensity = 0;
        const t = dayTex[i]; const src = o.map;
        if (src) { t.repeat.copy(src.repeat); t.offset.copy(src.offset); }
        m.map = t; m.emissiveMap = t;
        const k = d.k * (0.8 + 0.2 * e), h = Math.min(0.8, d.haze * (1.4 - e * 0.6));   // farther planes (lower e) sink deeper into the haze
        m.emissive.setRGB(k * (1 - h) + h * d.veil[0], k * (1 - h) + h * d.veil[1], k * (1 - h) + h * d.veil[2]);
      }
      m.needsUpdate = true;
    }
    for (const m of parts) {
      const o = orig.get(m);
      if (!d) { m.emissive.copy(o.emissive); m.color.copy(o.color); m.envMapIntensity = o.env; continue; }
      m.color.setScalar(0); m.envMapIntensity = 0;
      const c = new THREE.Color(ground && SNOWY.has(m.name) ? 0xdfe4ea : PART[m.name]);
      m.emissive.copy(c.multiplyScalar(d.parts));
    }
    if (sky) {
      const o = orig.get(sky);
      if (!d) { sky.emissiveMap = o.emissiveMap; sky.emissive.copy(o.emissive); }
      else { skies[kind] ||= skyTexture(kind); sky.emissiveMap = skies[kind]; sky.emissive.setScalar(1); }
      sky.needsUpdate = true;
    }
    if (active) active.visible = false;
    active = null;
    if (fall === 'rain' || fall === 'snow') {
      if (!falls[fall]) { falls[fall] = precipitation(fall); group.add(falls[fall]); if (onDynamic) onDynamic(falls[fall]); }
      active = falls[fall]; active.visible = true;
    }
    return true;
  }
  function update(dt) {
    if (!active) return;
    const u = active.material.uniforms; u.uTime.value += dt; u.uPx.value = r.getPixelRatio();
  }
  return {
    apply, update, group,
    get sky() { return current && current.split('|')[0]; },
    set onReady(f) { onReady = f; },
    set onDynamic(f) { onDynamic = f; },
  };
}
