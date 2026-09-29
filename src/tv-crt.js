// tv-crt.js — экран ТВ «кинескоп 50-х» для офиса (three.js ≥ 0.160)
// Использование на странице офиса:
//   import { createTvScreen, loadVideoTexture } from './tv-crt.js';
//   const screen = gltf.scene.getObjectByProperty('name', ...) // узел «ENV | ROOM | TV v14 crt face»
//   const tv = createTvScreen(screen, { flipY: false });       // из GLB — flipY: false
//   const anchor = loadVideoTexture(['tv/tv-anchor-v01.webm', 'tv/tv-anchor-v01.mp4'], { flipY: false });
//   tv.switchTo(anchor);          // переключить канал (со «снегом»)
//   tv.switchTo(tv.testcard);     // вернуть испытательную таблицу из GLB
//   в цикле: tv.update(dt);
import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */`
uniform sampler2D map;
uniform float time;
uniform float snow;        // 0..1 — «снег» при переключении
uniform float brightness;  // общая яркость экрана
uniform float flicker;     // мерцание, задаёт JS (±0.05)
uniform float mono;        // 1 — чёрно-белое
uniform float warp;        // бочка кинескопа
uniform float lines;       // строк развёртки
uniform float scan;        // сила строк 0..1
uniform float decode;      // 1 — видео в sRGB: three не декодирует его сам (как DECODE_VIDEO_TEXTURE)
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 c = vUv - 0.5;
  vec2 uv = 0.5 + c * (1.0 + warp * dot(c, c));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // при переключении строки «рвутся» и картинка подпрыгивает
  float row = floor(uv.y * lines);
  uv.x += (hash(vec2(row, floor(time * 30.0))) - 0.5) * 0.04 * snow;
  uv.y = fract(uv.y + snow * 0.15 * sin(time * 40.0));

  vec4 tx = texture2D(map, uv);
  vec3 col = decode > 0.5 ? sRGBTransferEOTF(tx).rgb : tx.rgb;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), mono);
  col *= vec3(0.93, 0.98, 1.05);                     // холодноватый люминофор

  float s = 0.5 + 0.5 * cos(uv.y * lines * 6.28318);  // строки развёртки
  col *= mix(1.0, 0.7 + 0.3 * s, scan);

  float band = abs(fract(uv.y + time * 0.07) - 0.5);  // медленная бегущая полоса
  col *= 1.0 + 0.07 * (1.0 - smoothstep(0.0, 0.07, band));

  float n = hash(uv * vec2(320.0, 240.0) + fract(time * 7.0) * 91.0);
  col += (n - 0.5) * 0.045;                           // зерно
  col = mix(col, vec3(n * 0.9), snow);                // снег

  float v = smoothstep(0.78, 0.25, length(c * vec2(1.0, 1.15)));
  col *= mix(0.5, 1.0, v);                            // виньетка

  col *= brightness * (1.0 + flicker);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function loadVideoTexture(urls, { flipY = true } = {}) {
  const video = document.createElement('video');
  video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = 'anonymous';
  video.setAttribute('playsinline', '');
  for (const u of [].concat(urls)) {
    const s = document.createElement('source');
    s.src = u; s.type = u.includes('webm') ? 'video/webm' : 'video/mp4';
    video.appendChild(s);
  }
  video.play().catch(() => {}); // muted — автозапуск разрешён
  const tex = new THREE.VideoTexture(video);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = flipY;
  tex.userData.video = video;
  return tex;
}

export function createTvScreen(mesh, opts = {}) {
  const old = mesh.material;
  const testcard = opts.initial || (old && (old.emissiveMap || old.map)) || null;
  const uniforms = {
    map: { value: testcard },
    time: { value: 0 },
    snow: { value: 0 },
    brightness: { value: opts.brightness ?? 1.0 },
    flicker: { value: 0 },
    mono: { value: opts.mono ?? 1.0 },
    warp: { value: opts.warp ?? 0.12 },
    lines: { value: opts.lines ?? 240 },
    scan: { value: opts.scan ?? 0.6 },
    decode: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, toneMapped: true });
  material.name = 'TV | CRT shader';
  mesh.material = material;
  const setMap = (tex) => {
    uniforms.map.value = tex;
    uniforms.decode.value = tex && tex.isVideoTexture && tex.colorSpace === THREE.SRGBColorSpace ? 1 : 0;
  };
  setMap(testcard);

  let t = 0, flickT = 0, pending = null, snowT = 0;
  const SNOW = opts.snowSec ?? 0.45;

  return {
    material, uniforms, testcard,
    // переключение канала: снег, в середине — смена картинки
    switchTo(tex) {
      if (!tex) return;
      const v = tex.userData && tex.userData.video;
      if (v) { v.currentTime = 0; v.play().catch(() => {}); }
      pending = tex; snowT = SNOW;
    },
    setImmediate(tex) { setMap(tex); },
    update(dt) {
      t += dt; uniforms.time.value = t;
      flickT -= dt;
      if (flickT <= 0) { flickT = 1 / (8 + Math.random() * 4); uniforms.flicker.value = (Math.random() * 2 - 1) * 0.05; }
      if (snowT > 0) {
        snowT -= dt;
        const k = Math.max(snowT, 0) / SNOW;             // 1 → 0
        uniforms.snow.value = Math.min(1, Math.sin(k * Math.PI) * 1.4);
        if (pending && k < 0.5) { setMap(pending); pending = null; }
      } else uniforms.snow.value = 0;
    },
  };
}
