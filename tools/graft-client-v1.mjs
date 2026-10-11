#!/usr/bin/env node
// Narrow graft of the client fixes (PR "Client sources") onto an already published bundle.
// The production app.js carries deployed patches that are not all in src/, so it must not be
// rebuilt; this applies only the listed changes and refuses to write unless each one matches once.
//   node tools/graft-client-v1.mjs app.js [owner-dialogue-ui.js] [chronicle.js]
// Writes <file>.grafted next to each input and prints before/after SHA-256.
import fs from 'node:fs';
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fail = (m) => { console.error('graft refused:', m); process.exit(1); };
function once(src, re, name) {
  const all = [...src.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
  if (all.length !== 1) fail(`${name}: expected 1 match, found ${all.length}`);
  return all[0];
}
const splice = (s, at, len, text) => s.slice(0, at) + text + s.slice(at + len);
// index just after the bracket that closes the one opening at `open`
function closeOf(s, open) {
  const pairs = { '(': ')', '[': ']', '{': '}' }; const stack = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'" || c === '`') { const q = c; for (i++; i < s.length && s[i] !== q; i++) if (s[i] === '\\') i++; continue; }
    if (pairs[c]) stack.push(pairs[c]); else if (c === ')' || c === ']' || c === '}') { if (stack.pop() !== c) fail('unbalanced at ' + i); if (!stack.length) return i + 1; }
  }
  fail('unterminated bracket');
}

function graftApp(s) {
  const applied = [];
  // 1. owner key only for our relay or same origin
  {
    const r = once(s, /(\w+)="https:\/\/135-106-229-50\.sslip\.io",\w+=[^,]+,(\w+)=\(\w+=>\w+==="\/"\?"\/":/, 'relay vars');
    const [, def, relay] = r;
    const t = once(s, /(\w+)=\1\|\|localStorage\.getItem\("editorial\.owner"\)\}catch\{\}/, 'owner token');
    s = splice(s, t.index + t[0].length, 0, `${relay}!==${def}&&${relay}!=="/"&&(${t[1]}=null);`);
    applied.push('owner-key-relay-gate');
  }
  // 2. lamp shadows ~30 Hz while someone moves
  {
    const r = once(s, /\((\w+)\|\|!(\w+)&&\((\w+)\|\|(\w+)>\.2\)\)&&\((\w+)\.shadowMap\.needsUpdate=!0/, 'shadow refresh');
    const [m, p, frozen, moving, acc, rr] = r;
    s = splice(s, r.index, m.length, `(${p}||!${frozen}&&(${moving}?${acc}>=1/30:${acc}>.2))&&(${rr}.shadowMap.needsUpdate=!0`);
    applied.push('shadow-30hz');
  }
  // 3. presence heartbeat only from visible tabs
  {
    const r = once(s, /window\.addEventListener\("pagehide",\(\)=>(\w+)\(!1\)\),setInterval\(\(\)=>\1\(\),2e3\)/, 'presence heartbeat');
    s = splice(s, r.index, r[0].length, `window.addEventListener("pagehide",()=>${r[1]}(!1)),setInterval(()=>{document.visibilityState==="visible"&&${r[1]}()},2e3)`);
    applied.push('presence-visible-only');
  }
  // 4. auto quality waits for the characters
  {
    // published 2026-10-11 bundles load actors through settleActorLoads() (sequential on phones)
    const lp = once(s, /(?:Promise\.allSettled\(\w+\.map\(\(\[\w+,\w+\]\)=>\w+\(\w+,\w+\)\)\)|settleActorLoads\(\w+,\w+,\$?\w+\))\.then\(\(\)=>\{(\w+)=!1/, 'loading flag')[1];
    const r = once(s, /\.tick\((\w+),window\.__ready\)/, 'quality tick');
    s = splice(s, r.index, r[0].length, `.tick(${r[1]},window.__ready&&!${lp})`);
    applied.push('quality-after-characters');
  }
  // 5. download watchdog stops on failure too
  {
    const w = once(s, /,(\w+)=setInterval\(\(\)=>\{performance\.now\(\)-\w+>12e3&&/, 'download watchdog');
    const dog = w[1];
    const loop = s.indexOf('for(;;){', w.index); if (loop < 0) fail('watchdog loop');
    const end = closeOf(s, loop + 7);
    const tail = `clearInterval(${dog});`;
    if (s.slice(end, end + tail.length) !== tail) fail('watchdog clear not after loop');
    s = s.slice(0, loop) + 'try{' + s.slice(loop, end) + `}finally{clearInterval(${dog})}` + s.slice(end + tail.length);
    applied.push('watchdog-finally');
  }
  // 6. heroine add-ons download together with her body
  {
    // 2026-10-11 bundles share this branch with the maid: if((n==="heroine"||n==="maid")){
    const head = once(s, /if\((?:\w+==="heroine"|\(\w+==="heroine"\|\|\w+==="maid"\))\)\{let (\w+)=await /, 'heroine branch');
    const blockStart = head.index + head[0].length - ('let ' + head[1] + '=await ').length;
    const tv = s.indexOf('.extra.tvswitch=await ', blockStart); if (tv < 0) fail('tv switch');
    const tvEnd = s.indexOf(';', tv);
    let seg = s.slice(blockStart, tvEnd);
    const bases = [];
    for (const [dir] of [['heroine-consumption-20261004-v01/'], ['tray-service-v01/'], ['heroine-phone-20261004-v01/']]) {
      const m = once(seg, new RegExp('(,|let )(\\w+)=(\\w+)\\+"assets/' + dir.replace(/[.]/g, '\\.') + '"(,|;)'), 'base ' + dir);
      bases.push(`${m[2]}=${m[3]}+"assets/${dir}"`);
      // `let d=…,[p]=await` → `let [p]=await`;  `…),s=…,[r]=await` → `…),[r]=await`
      seg = splice(seg, m.index, m[0].length, m[1] === 'let ' ? 'let ' : ',');
    }
    const promises = [];
    let at = seg.indexOf('=await Promise.all(');
    while (at >= 0) {
      const open = at + '=await Promise.all'.length;
      const end = closeOf(seg, open);
      const name = '__h' + promises.length;
      promises.push(`${name}=Promise.all${seg.slice(open, end)}`);
      seg = seg.slice(0, at) + '=await ' + name + seg.slice(end);
      at = seg.indexOf('=await Promise.all(', at);
    }
    if (promises.length !== 4) fail('heroine add-on groups: ' + promises.length);
    const tvAt = seg.indexOf('.extra.tvswitch=await ');
    const tvExpr = seg.slice(tvAt + '.extra.tvswitch=await '.length);
    promises.push(`__h4=${tvExpr}`);
    seg = seg.slice(0, tvAt) + '.extra.tvswitch=await __h4';
    const pre = `let ${bases.join(',')},${promises.join(',')};[__h0,__h1,__h2,__h3,__h4].forEach(p=>p.catch(()=>{}));`;
    s = s.slice(0, blockStart) + pre + seg + s.slice(tvEnd);
    applied.push('heroine-parallel');
  }
  return { s, applied };
}
function graftDialogue(s) {
  const r = once(s, /(\w+)=(\w+)\.get\("relay"\)\?\?"https:\/\/135-106-229-50\.sslip\.io";/, 'dialogue relay');
  const t = once(s, /token:\(\)=>\{try\{return localStorage\.getItem\("editorial\.owner"\)\}catch\{return null\}\}/, 'dialogue token');
  s = splice(s, t.index, t[0].length, `token:()=>{if(${r[1]}!=="https://135-106-229-50.sslip.io"&&${r[1]}!=="/")return null;try{return localStorage.getItem("editorial.owner")}catch{return null}}`);
  return { s, applied: ['dialogue-owner-key-gate'] };
}
function graftChronicle(s) {
  const r = once(s, /(\w+)\(\{ownerToken:(\w+),relay:(\w+)\.get\("relay"\)\?\?"https:\/\/135-106-229-50\.sslip\.io"\}\)/, 'chronicle entry');
  const [m, create, tok, q] = r;
  s = splice(s, r.index, m.length, `${create}({ownerToken:(${q}.get("relay")??"/")==="/"||${q}.get("relay")?.replace(/\\/$/,"")==="https://135-106-229-50.sslip.io"?${tok}:null,relay:${q}.get("relay")??"https://135-106-229-50.sslip.io"})`);
  return { s, applied: ['chronicle-owner-key-gate'] };
}

const kinds = { 'app.js': graftApp, 'owner-dialogue-ui.js': graftDialogue, 'chronicle.js': graftChronicle };
const files = process.argv.slice(2);
if (!files.length) fail('usage: graft-client-v1.mjs app.js [owner-dialogue-ui.js] [chronicle.js]');
for (const file of files) {
  const kind = kinds[file.split('/').pop()]; if (!kind) fail('unknown file ' + file);
  const before = fs.readFileSync(file, 'utf8');
  const { s, applied } = kind(before);
  fs.writeFileSync(file + '.grafted', s);
  console.log(JSON.stringify({ file, beforeSHA: sha(before), afterSHA: sha(s), byteDelta: s.length - before.length, applied }));
}
