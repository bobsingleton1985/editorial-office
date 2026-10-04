import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSmokeTimeline, smokeVisualCue, sampleSmokeStatus, createSmokeDisplayClock} from '../src/smoke-presentation.mjs';

const timeline = buildSmokeTimeline({sit:[['light',4],['flick',2]]},
  {light:{inhale:[[31,61]]},flick:{inhale:[],ash:[16,31]}},30,{sit:3});
const smoke = t => ({on:true,mode:'sit',W:1,cig:true,lit:true,fxTime:t,fxVersion:1,fxGeneration:1});
const frame = (at, end=at, alpha=0, extras={}) => ({epoch:'one',alpha,stale:false,
  a:{at,meta:{actors:{a:{status:{smoke:smoke(at/1000)},smokeFx:{version:1,time:at/1000,generation:1}}}}},
  b:{at:end,meta:{actors:{a:{status:{smoke:smoke(end/1000)},smokeFx:{version:1,time:end/1000,generation:1}}}}},...extras});

test('a late viewer derives an ongoing exhale without seeing the inhale edge',()=>{
  assert.equal(smokeVisualCue(timeline,smoke(1.5)).inhale,true);
  assert.equal(smokeVisualCue(timeline,smoke(2.8)).inhale,false);
  assert.ok(Math.abs(smokeVisualCue(timeline,smoke(2.8)).exhale-.8)<1e-12);
  assert.equal(smokeVisualCue(timeline,smoke(5)).exhale,-1);
  assert.equal(smokeVisualCue(timeline,{...smoke(2.8),cig:false}).exhale,-1);
  assert.equal(smokeVisualCue(timeline,{...smoke(2.8),on:false}).lit,false);
});
test('ash counters identify edges across clips and consecutive cigarettes',()=>{
  assert.equal(smokeVisualCue(timeline,smoke(4.49)).ash,0);
  assert.equal(smokeVisualCue(timeline,smoke(4.5)).ash,1);
  assert.equal(smokeVisualCue(timeline,smoke(5)).ash,2);
  assert.equal(smokeVisualCue(timeline,smoke(13.5)).ash,3);
});
test('cues use interpolated scene time; new smoking generations never interpolate',()=>{
  const f=frame(2000,2100,.5);
  assert.equal(sampleSmokeStatus(f,'a').fxTime,2.05);
  f.b.meta.actors.a.smokeFx={version:1,time:.1,generation:2};
  assert.equal(sampleSmokeStatus(f,'a').fxTime,2);
  f.alpha=1; assert.equal(sampleSmokeStatus(f,'a').fxTime,.1);
  f.a.meta.actors.a.smokeFx=undefined;f.alpha=0;
  assert.equal(sampleSmokeStatus(f,'a'),null);
});
test('presentation freezes on held frames and stale streams, resets after reconnect or hidden-tab gaps',()=>{
  const clock=createSmokeDisplayClock();
  assert.equal(clock(frame(1000)).reset,true);
  assert.equal(clock(frame(1050)).dt,.05);
  assert.equal(clock(frame(1050)).dt,0);
  assert.equal(clock(frame(1100,1100,0,{stale:true})).dt,0);
  assert.equal(clock(frame(1150)).reset,true);
  assert.equal(clock(frame(2000)).reset,true);
  assert.equal(clock(frame(2050)).dt,.05);
  assert.equal(clock(frame(2050,2050,0,{epoch:'two'})).reset,true);
});
