import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrowd, STEP} from '../src/crowd.js';

const grid={x0:-5,y0:-5,cell:1,w:10,h:10,bits:Buffer.alloc(13).toString('base64')};
const point=(x,z=0)=>({x,z});

test('a completed walk followed by standing starts a fresh episode after a long idle',async()=>{
  const crowd=await createCrowd(grid,[],.2);
  const first=crowd.start('one',100,point(0),point(1),1);
  for(let t=100;t<115;t+=STEP)crowd.pose('one',t);
  assert.equal(first.done,true);
  // The last metre and turn are completed by editor.js, which records stand
  // after the last crowd pose; that leaves the completed episode dirty.
  crowd.stand('one',point(1.1),115);
  crowd.stand('seated',null,115);
  const resumedAt=100+12*3600;
  crowd.start('one',resumedAt,point(1.1),point(-1),1);
  const pose=crowd.pose('one',resumedAt+STEP);
  assert.equal(crowd.debug().tBase,resumedAt);
  assert.ok(Math.abs(crowd.debug().t-(resumedAt+STEP))<1e-6);
  assert.ok(pose.x>1,'resume preserves the actual standing position');
  assert.equal(crowd.debug().people.find(p=>p.id==='seated').stand,null);
});

test('an unfinished overlapping walk retains the shared episode',async()=>{
  const crowd=await createCrowd(grid,[],.2);
  const first=crowd.start('one',100,point(-2),point(2),1);
  crowd.pose('one',100+STEP);
  assert.notEqual(first.done,true);
  crowd.stand('two',point(0,2),100+STEP);
  crowd.start('two',100+2*STEP,point(0,2),point(0,-2),1);
  assert.equal(crowd.debug().tBase,100);
  assert.equal(crowd.debug().people.find(p=>p.id==='one').reqs.length,1);
});

test('a late command keeps future standing events and replays the shared episode',async()=>{
  const crowd=await createCrowd(grid,[],.2);
  const first=crowd.start('one',100,point(0),point(1),1);
  for(let t=100;t<115;t+=STEP)crowd.pose('one',t);
  assert.equal(first.done,true);
  crowd.stand('one',point(1),115);
  crowd.start('two',110,point(0,2),point(0,-2),1);
  assert.equal(crowd.debug().tBase,100);
  assert.equal(crowd.debug().people.find(p=>p.id==='one').reqs.length,2);
});
