# Editorial — office (test)

A living 1950s newsroom with wooden characters. This is the test build of the office scene.

- `index.html`, `app.js` — the page (three.js 0.186 bundled with esbuild).
- `assets/office-v29c.glb` — the office from office-browser-v29-lights.blend: lite export (static meshes merged, city separate), then `gltf-transform webp --quality 85` and `gltf-transform meshopt --quantize-position 16 --quantize-normal 12 --quantize-texcoord 14 --quantization-volume mesh` (10.6 MB → 3.9 MB, same picture).
- `src/main.js` — page source. Production `app.js` also includes deployed patches that are not all represented in these historical sources. Do not replace it with a full rebuild; see `docs/service-v46-20261006/README.md` for the bounded production graft and hashes.
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

## Owner dialogue and Telegram

Write ordinary language to a character through
[@NYeditorialbot](https://t.me/NYeditorialbot?start=editorial). Select a recipient;
there is no command-type or activity wizard. The main scene has no chat panel;
the character’s actual Telegram reply and declared reaction appear in a bubble
over that character for 45–90 seconds, depending on text length.
A gift can include an onward allocation, such as “I give you $10; pass $3 of it
to the reporter”: the reporter gets $3 from that gift and the recipient keeps
$7. Durable receipts prevent duplicate funding and forwarding.
The model distinguishes conversation, clarification, virtual USD gifts,
editorial assignments, activity requests and ending a phone call.

Examples: “Дай репортёру пять долларов”, “Подготовь статью о бюджете к вечеру”,
“Отдохни немного, если есть свободное место”. The character independently chooses
among real available actions or explains a refusal. Accepted activities wait for
a safe execution boundary; a verbal answer alone is not completion. Assignments
and rewards retain the existing work/economy witnesses and idempotent receipts.
Forwarded/quoted messages cannot authorize effects.

Telegram text rings the actual newsroom phone and the selected character answers
when physically ready. The existing visible-viewer rule still applies: keep a
newsroom tab visible for model replies. The bridge and director keep durable
message IDs so retries do not repeat payments or assignments.

## Accepted service v46 — 2026-10-06

Service for one to three workers uses the accepted v46 animation at one shared table. Invitations, independent answers, treating and the heroine’s optional self-funded drink are shown in bubbles. Guest drinks split $2 into $1.50 newsroom / $0.50 heroine. Separate-table joint drinking is retired. The actual relay and Mac director activation, source hashes and validation are recorded in `docs/service-v46-20261006/`.
