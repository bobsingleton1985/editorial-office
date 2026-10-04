# Editorial — office (test)

A living 1950s newsroom with wooden characters. This is the test build of the office scene.

- `index.html`, `app.js` — the page (three.js 0.186 bundled with esbuild).
- `assets/office-v29c.glb` — the office from office-browser-v29-lights.blend: lite export (static meshes merged, city separate), then `gltf-transform webp --quality 85` and `gltf-transform meshopt --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 --quantization-volume mesh` (10.6 MB → 3.9 MB, same picture).
- `src/main.js` — page source. Rebuild: `npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=app.js` (needs `three@0.186.0`).
- `src/lighting.js` — lamps (spot lights with shadows), ambient and window light; `src/settings.js` — the ☰ settings panel (saved in the browser).

## Director

`director/` contains the current Mac director and its behavior, economy, memory,
relationship and chronicle modules. `registry/chains-v01.json` is its action
registry; `src/teletype-reading-data.js` supplies shared placement data.
The director runs in Node.js 22 or newer and needs no npm dependencies.

Run `npm run director` from this checkout. The launcher selects the checked-in
registry, removing the dependency on a particular user's home directory.
Configure the relay address in local `relay-url.txt` and its authorization token
in local `.director-token` (restrict this file to its owner). `RELAY_URL` and
`DIRECTOR_TOKEN` environment variables can also be supplied by a service manager.
Never put actual tokens into commands, documentation or Git.

The director calls the existing Jev pilot at `http://127.0.0.1:8765` (override with
`JEV_URL`) and sends world updates to the separately deployed relay. GitHub Pages
serves the browser client; it does not execute the director. The Jev pilot and
relay are external services and are not included in this directory.

`REGISTRY_FILE`, `STATE_FILE`, `ECONOMY_CONFIG_FILE`, `DAILY_LIMIT`, `FAST` and
`JEV_TRACE_DIR` retain their existing meanings. Without `STATE_FILE`, state and
the chronicle are written beside `director.mjs`; these files, credentials,
incoming calls and logs are ignored by Git. An empty checkout starts a fresh
world; resuming an existing world requires its private state and chronicle.

The current service deployment remains at `../editorial-live/`. This addition
does not switch or restart it. Future director changes must be committed here
together with all affected modules, registry/configuration and shared browser
data; keep the deployed code synchronized with the reviewed repository version.

Run `npm test` for the isolated director contract checks. They execute the real
director functions with fake time, storage and network; they do not call Jev or
modify a running scene. Music uses the viewer's shared scheduled-channel function;
it is not an audio or physical knob receipt. Execution timeout applies only after
a fresh stationary arrival, leaving navigation and agreed joint processes under
their existing execution protocols.
