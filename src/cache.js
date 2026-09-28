// Static picture cache for weak devices. The room does not move, so it is drawn once (colour + depth) into a texture
// and redrawn only when the camera, the lights or the window size change. Every frame the page just copies that
// picture back, restores its depth, and draws the few moving things on top: the character, chairs, clock hands,
// fan, turntable, teletype, TV screen. Moving things live on layer 1; lights see every layer.
import * as THREE from 'three';

const DYN = 1;
export function createStaticCache(r, scene, cam) {
  let rt = null, dirty = true, on = false;
  const half = r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float');
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: null }, tDepth: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv;
      void main() {
        gl_FragColor = texture2D(tColor, vUv);
        gl_FragDepth = texture2D(tDepth, vUv).r;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; quadScene.add(quad);

  function target(w, h) {
    const t = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 0,
      depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
    if (!half) t.texture.colorSpace = THREE.SRGBColorSpace;           // 8-bit: keep the darks from banding
    return t;
  }
  function addDynamic(root) {
    root.traverse((o) => o.layers.set(DYN));
    dirty = true;
  }
  function lightsEverywhere() { scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); }); }

  function render() {
    if (!on) { cam.layers.enableAll(); r.render(scene, cam); return; }
    const w = r.domElement.width, h = r.domElement.height;
    if (!w || !h) return;                                             // hidden or minimised window: nothing to draw into
    if (!rt || rt.width !== w || rt.height !== h) { rt?.dispose(); rt = target(w, h); dirty = true; }
    if (dirty) { cam.layers.set(0); r.setRenderTarget(rt); r.render(scene, cam); r.setRenderTarget(null); dirty = false; }
    mat.uniforms.tColor.value = rt.texture; mat.uniforms.tDepth.value = rt.depthTexture;
    r.render(quadScene, quadCam);                                     // clears, then the room's colour and depth
    const ac = r.autoClear, bg = scene.background;
    r.autoClear = false; scene.background = null; cam.layers.set(DYN);
    r.render(scene, cam);                                             // only the moving things
    r.autoClear = ac; scene.background = bg; cam.layers.enableAll();
  }
  return {
    render, addDynamic, lightsEverywhere,
    markDirty: () => { dirty = true; },
    set enabled(v) { if (v !== on) { on = v; dirty = true; if (!v) { rt?.dispose(); rt = null; } } },
    get enabled() { return on; },
  };
}
