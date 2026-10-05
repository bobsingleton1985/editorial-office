import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {init,NavMeshQuery,Crowd} from '@recast-navigation/core';
import {generateSoloNavMesh} from '@recast-navigation/generators';
import {createCrowd,STEP} from '../src/crowd.js';
const file=new URL('../app.js',import.meta.url);
const text=fs.readFileSync(file,'utf8'),a=text.indexOf('var T4='),b=text.indexOf('var jV=',a);
const delivered=new Function('i4','mC','cE','v4',text.slice(a,b)+';return T4;')(init,NavMeshQuery,Crowd,generateSoloNavMesh);
const G={x0:-5,y0:-5,cell:.1,w:100,h:100,bits:Buffer.alloc(1250).toString('base64')};
test('actual delivered crowd function matches source on blocked routing',async()=>{
 const A=await createCrowd(G,[],.3),B=await delivered(G,[],.3);
 for(const c of [A,B]){for(const z of [-.6,0,.6])c.stand('b'+z,{x:0,z});c.start('w',0,{x:-2,z:0},{x:2,z:0},1);}
 for(let i=1;i<=600;i++){
  const p=A.pose('w',i*STEP),q=B.pose('w',i*STEP);
  for(const key of ['x','z','vx','vz','done','stalled'])assert.equal(p[key],q[key],key);
 }
 assert.deepEqual(A.debug().log,B.debug().log);
 assert.equal(B.debug().log.find(x=>x.kind==='blocked_replan')?.found,true);
});
