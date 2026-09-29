// Sunlight in the air: soft shafts through the window openings and between the slats, and dust glinting in them.
// No real volumetrics (too heavy for a TV): a box over the room is ray-marched in a few steps, and every sample asks
// "does the sun reach this point through a window gap?" using the same slat numbers as the blinds. The box is still,
// so on weak devices it lives in the cached room picture; only the dust is drawn every frame.
import * as THREE from 'three';
import { BLINDS as B, bottomOf } from './blinds.js';

const ROOM = { min: new THREE.Vector3(-5.28, 0, -5.98), max: new THREE.Vector3(5.28, 4.7, 5.98) };
const LIT = `
uniform vec3 uSun; uniform float uBx, uTop, uSill, uWinTop, uSpacing, uHalf, uBottom, uStackTop, uK, uAng;
uniform vec2 uWin0, uWin1, uWin2;
float lit(vec3 p, bool soft) {          // 1 if the sun reaches p through a window gap (soft: slats as an average veil)
  if (p.x <= uBx) return 0.0;
  vec3 q = p - uSun * ((p.x - uBx) / uSun.x);          // where this sunray crossed the blinds plane
  bool w = (q.z > uWin0.x && q.z < uWin0.y) || (q.z > uWin1.x && q.z < uWin1.y) || (q.z > uWin2.x && q.z < uWin2.y);
  if (!w || q.y < uSill || q.y > uWinTop) return 0.0;
  if (q.y < uBottom) return 1.0;                        // below the blinds: open window
  if (q.y < uStackTop || q.y > uTop) return 0.0;        // bottom rail with stacked slats, headrail
  float den = cos(uAng) * uSun.y - sin(uAng) * uSun.x;
  if (soft) return clamp(1.0 - 2.0 * uHalf * abs(den) / abs(uSun.x) / uSpacing, 0.0, 1.0);   // share of light between the slats
  float c = floor((uTop - q.y) / uSpacing - 0.5);
  for (int j = -1; j <= 1; j++) {
    float i = c + float(j);
    if (i < 0.0 || i >= uK) continue;
    float d = q.y - (uTop - (i + 1.0) * uSpacing);
    if (abs(-d * uSun.x / den) <= uHalf) return 0.0;   // this slat is in the way
  }
  return 1.0;
}`;

export function createSunbeams(sunDir) {
  const uniforms = {
    uSun: { value: sunDir.clone().normalize() }, uBx: { value: B.x }, uTop: { value: B.top }, uSill: { value: B.sill }, uWinTop: { value: B.winTop },
    uSpacing: { value: B.spacing }, uHalf: { value: B.slat / 2 }, uBottom: { value: 0 }, uStackTop: { value: 0 }, uK: { value: 0 }, uAng: { value: 0 },
    uWin0: { value: new THREE.Vector2(...B.windows[0]) }, uWin1: { value: new THREE.Vector2(...B.windows[1]) }, uWin2: { value: new THREE.Vector2(...B.windows[2]) },
    uMin: { value: ROOM.min }, uMax: { value: ROOM.max }, uDensity: { value: 0.05 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
    uTime: { value: 0 }, uPx: { value: 1 }, uDust: { value: 1 },
  };
  // ---------- shafts: ray-march the room box from the face the camera sees
  const size = new THREE.Vector3().subVectors(ROOM.max, ROOM.min), mid = new THREE.Vector3().addVectors(ROOM.min, ROOM.max).multiplyScalar(0.5);
  const beams = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `${LIT}
      uniform vec3 uMin, uMax, uColor; uniform float uDensity; varying vec3 vW;
      void main() {
        vec3 dir = isOrthographic ? -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : normalize(vW - cameraPosition);
        vec3 inv = 1.0 / dir, a = (uMin - vW) * inv, b = (uMax - vW) * inv, tm = max(a, b);
        float tEnd = max(0.0, min(min(tm.x, tm.y), tm.z));
        float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float acc = 0.0, dt = tEnd / 40.0;
        for (int i = 0; i < 40; i++) {
          vec3 p = vW + dir * ((float(i) + jit) * dt);
          acc += lit(p, true) * exp(-0.22 * (p.x - uBx)) * smoothstep(0.0, 0.6, p.y);
        }
        gl_FragColor = vec4(uColor * acc * dt * uDensity, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  beams.position.copy(mid); beams.name = 'SUNBEAMS'; beams.renderOrder = 3; beams.frustumCulled = false;

  // ---------- dust: points scattered where a sunray could be, twinkling only where the sun reaches right now
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  let s = 5; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = uniforms.uSun.value;
  for (let i = 0; i < N; i++) {
    const [z0, z1] = B.windows[Math.floor(rnd() * 3)];
    const q = new THREE.Vector3(B.x, B.sill + rnd() * (B.winTop - B.sill), z0 + rnd() * (z1 - z0));
    const maxS = q.y / -d.y;                                        // until the ray reaches the floor
    const p = q.addScaledVector(d, (0.05 + 0.95 * Math.pow(rnd(), 1.4)) * maxS);
    pos.set([p.x, p.y, p.z], i * 3); seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const dust = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${LIT}
      attribute float seed; uniform float uTime, uPx; varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.11 + seed * 31.0), sin(uTime * 0.07 + seed * 17.0) * 0.8, cos(uTime * 0.09 + seed * 23.0)) * 0.12;
        vA = lit(p, false) * (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + seed) + seed * 50.0), 3.0)) * exp(-0.12 * (p.x - uBx));
        gl_PointSize = (1.1 + seed * 1.4) * uPx;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uDust; varying float vA;
      void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard;
        gl_FragColor = vec4(uColor * vA * uDust * 0.55 * (1.0 - r * 4.0), 1.0); }`,
  }));
  dust.name = 'SUN DUST'; dust.frustumCulled = false; dust.renderOrder = 4;

  const group = new THREE.Group(); group.add(beams, dust); group.visible = false;
  function setBlinds(st) {                   // mirror blinds.js: which slats hang, where the stack ends
    const bottom = bottomOf(st.down), L = B.top - bottom - 0.022, n = Math.ceil((B.top - B.sill) / B.spacing);
    let k = Math.min(n, Math.floor(L / B.spacing));
    while (k > 0 && (n - k) * 0.0065 + k * B.spacing > L) k--;
    uniforms.uBottom.value = bottom; uniforms.uStackTop.value = bottom + 0.022 + (n - k) * 0.0065; uniforms.uK.value = k;
    uniforms.uAng.value = st.tilt * B.maxTilt;
  }
  return {
    group, beams, dust, setBlinds,
    set(on, beamsK = 1) { group.visible = on && beamsK > 0; uniforms.uDensity.value = 0.03 * beamsK; uniforms.uDust.value = Math.min(1.5, beamsK); },
    update(dt, px) { uniforms.uTime.value += dt; uniforms.uPx.value = px; },
  };
}
