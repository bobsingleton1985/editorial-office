import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './director-harness.mjs';
const source=new URL('../director/director.mjs',import.meta.url).pathname;
const oldRules={version:'approved-before',text:'Full approved session text'};
const nextRules={version:'approved-next',text:'Full approved next-session text'};
function savedHarness(){const initial=harness(source).state();initial.characterRulesPin=oldRules;return harness(source,initial);}
test('resuming after director restart retains session rules even when endpoint has a new version',async()=>{
 const h=savedHarness();h.setHandler(url=>url.endsWith('/api/character-rules')?nextRules:undefined);
 await h.run('pinCharacterRules({calls:237})');
 const snapshot=await h.run("snapshot('heroine',[{id:'continue',description:'fixture'}])");
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot.characterRules)),oldRules);
 assert.equal(h.requests.filter(r=>r.url.endsWith('/api/character-rules')).length,0);
 assert.deepEqual(h.state().characterRulesPin,oldRules);
});
test('new session adopts current approved version once and keeps it for subsequent requests',async()=>{
 const h=savedHarness();let endpoint=nextRules;h.setHandler(url=>url.endsWith('/api/character-rules')?endpoint:undefined);
 await h.run('pinCharacterRules({calls:0})');endpoint={version:'later',text:'Later file edit'};
 await h.run('pinCharacterRules({calls:1})');
 const snapshot=await h.run("snapshot('heroine',[{id:'continue',description:'fixture'}])");
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot.characterRules)),nextRules);
 assert.equal(h.requests.filter(r=>r.url.endsWith('/api/character-rules')).length,1);
 assert.deepEqual(h.state().characterRulesPin,nextRules);
});

test('new session with unavailable full rules blocks before any provider request',async()=>{
 const h=savedHarness();h.setHandler(url=>url.endsWith('/api/character-rules')?{}:undefined);
 await assert.rejects(h.run('pinCharacterRules({calls:0})'),/character_rules_unavailable/);
 assert.equal(h.requests.filter(r=>r.url.endsWith('/api/behavior-decide')).length,0);
});
