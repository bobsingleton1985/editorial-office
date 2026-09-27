# Editorial — office (test)

A living 1950s newsroom with wooden characters. This is the test build of the office scene.

- `index.html`, `app.js` — the page (three.js 0.186 bundled with esbuild).
- `assets/office-v27.glb` — the office, exported from office-browser-v27-lamp.blend (lite, merged static meshes).
- `src/main.js` — page source. Rebuild: `npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=app.js` (needs `three@0.186.0`).
