# Editorial — office (test)

A living 1950s newsroom with wooden characters. This is the test build of the office scene.

- `index.html`, `app.js` — the page (three.js 0.186 bundled with esbuild).
- `assets/office-v29c.glb` — the office from office-browser-v29-lights.blend: lite export (static meshes merged, city separate), then `gltf-transform webp --quality 85` and `gltf-transform meshopt --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 --quantization-volume mesh` (10.6 MB → 3.9 MB, same picture).
- `src/main.js` — page source. Rebuild: `npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=app.js` (needs `three@0.186.0`).
- `src/lighting.js` — lamps (spot lights with shadows), ambient and window light; `src/settings.js` — the ☰ settings panel (saved in the browser).
