#!/usr/bin/env node
// Narrow graft on top of graft-client-v1: move the Recast/WASM module out of app.js into
// recast-v1.js (imported only when the local crowd starts; viewers never load it), and expose
// the app's GLTF loader so wardrobe-ui.js no longer bundles its own copy of three.js.
//   node tools/graft-client-v2-split.mjs app.js
// Writes app.js.grafted and recast-v1.js next to the input and prints SHA-256.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fail = (m) => { console.error('graft refused:', m); process.exit(1); };
const count = (s, t) => s.split(t).length - 1;

const file = process.argv[2] || fail('usage: graft-client-v2-split.mjs app.js');
let s = fs.readFileSync(file, 'utf8');
const before = s;

// 1. Recast module wrapper (esbuild lazy ESM shim) -> separate ES module
const pre = 'var t4={};FH(t4,{default:()=>LV});var FV,NV,LV,A4=i6(()=>{';
if (count(s, pre) !== 1) fail('recast wrapper');
const a = s.indexOf(pre);
let depth = 0, i = a + pre.length - 1;
for (; i < s.length; i++) { if (s[i] === '{') depth++; else if (s[i] === '}' && --depth === 0) break; }
if (s.slice(i, i + 3) !== '});') fail('recast wrapper end');
const body = s.slice(a + pre.length, i);
if (!body.startsWith('FV={},NV=(async function') || !body.endsWith('),LV=NV')) fail('recast body shape');
const recast = 'const FV={};export default ' + body.slice('FV={},NV='.length, -',LV=NV'.length) + ';\n';
s = s.slice(0, a) + s.slice(i + 3);
const use = '(await Promise.resolve().then(()=>(A4(),t4))).default';
if (count(s, use) !== 1) fail('recast import site');
s = s.replace(use, '(await import("./recast-v1.js")).default');
if (/\b(A4|t4|LV|NV|FV)\b/.test(s.replace(/"[^"\n]*"/g, ''))) {
  // the minified names must be gone from app.js; anything left means a second user
  for (const id of ['A4', 't4', 'LV', 'NV', 'FV']) if (new RegExp('[^\\w$."]' + id + '[^\\w$"]').test(s)) fail('leftover reference ' + id);
}

// 2. shared GLTF loader for wardrobe-ui.js
const ld = 'var yo=n=>eo(n).catch(()=>null),to=()=>new CC().setMeshoptDecoder(NQ);';
if (count(s, ld) !== 1) fail('gltf loader');
s = s.replace(ld, ld + 'window.__editorialLoadGLB=n=>to().loadAsync(n);');

fs.writeFileSync(file + '.grafted', s);
const out = path.join(path.dirname(file), 'recast-v1.js');
fs.writeFileSync(out, recast);
console.log(JSON.stringify({ file, beforeSHA: sha(before), afterSHA: sha(s), bytes: [before.length, s.length], recast: { file: out, sha: sha(recast), bytes: recast.length }, applied: ['recast-lazy-file', 'shared-gltf-loader'] }));
