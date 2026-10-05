import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrowd, STEP} from '../src/crowd.js';
const grid={x0:-5,y0:-5,cell:.1,w:100,h:100,bits:Buffer.alloc(1250).toString('base64')};
const point=(x,z=0)=>({x,z});
async function blocked(){
 const c=await createCrowd(grid,[],.3);
 for (const z of [-.6,0,.6]) c.stand('blocker'+z,point(0,z));
 const req=c.start('walker',0,point(-2),point(2),1);
 return {c,req};
}
test('blocked walker changes route after five seconds and keeps the destination',async()=>{
 const {c,req}=await blocked();let low=0,replan=null,minDistance=Infinity;
 for(let i=1;i<=900;i++){
  const t=i*STEP,p=c.pose('walker',t);
  minDistance=Math.min(minDistance,...[-.6,0,.6].map(z=>Math.hypot(p.x,p.z-z)));
  low=Math.hypot(p.vx,p.vz)<.05?low+STEP:0;
  const e=c.debug().log.find(x=>x.kind==='blocked_replan');
  if(e&&!replan){replan=e;assert.ok(Math.abs(low-5)<=STEP+1e-5,`blocked for ${low}`);}
  if(!replan)assert.ok(low<5+STEP);
  if(req.done)break;
 }
 assert.ok(replan,'reroute happened');assert.equal(replan.found,true);
 assert.deepEqual(replan.to,req.to);assert.ok(replan.waypoints.some(p=>Math.abs(p.z)>.5),'path goes around the body');
 assert.equal(req.done,true);assert.equal(req.stalled,false);
 assert.ok(minDistance>.55,`no crossing blocker: ${minDistance}`);
});
test('late viewer and different stepping reproduce the same detour',async()=>{
 const a=await blocked(),b=await blocked();
 for(let i=1;i<=600;i++)a.c.pose('walker',i*STEP);
 b.c.pose('walker',20);
 assert.deepEqual(a.c.debug().log,b.c.debug().log);
 const p=a.c.pose('walker',20),q=b.c.pose('walker',20);
 assert.ok(Math.hypot(p.x-q.x,p.z-q.z)<1e-5);
});
test('closed corridor retries every five seconds without finishing or crossing bodies',async()=>{
 const c=await createCrowd(grid,[[-5,.8,5,5],[-5,-5,5,-.8]],.3);
 c.stand('blocker',point(0));
 const req=c.start('walker',0,point(-2),point(2),1);
 for(let i=1;i<=900;i++)c.pose('walker',i*STEP);
 const events=c.debug().log.filter(x=>x.kind==='blocked_replan');
 assert.ok(events.length>=2);assert.ok(events.every(e=>!e.found));
 for(let i=1;i<events.length;i++)assert.ok(Math.abs(events[i].t-events[i-1].t-5)<.04);
 assert.notEqual(req.done,true);assert.ok(c.pose('walker',30).x<0);
 assert.ok(c.start('blocker',30,point(0),point(4),1));
 for(let i=901;i<=1350;i++)c.pose('walker',i*STEP);
 assert.equal(req.done,true);assert.equal(req.stalled,false);assert.ok(req.doneT>=30);
});
test('normal movement does not trigger a reroute',async()=>{
 const c=await createCrowd(grid,[],.3);
 const req=c.start('walker',0,point(-4),point(4),.5);
 for(let i=1;i<=900;i++)c.pose('walker',i*STEP);
 assert.equal(req.done,true);assert.deepEqual(c.debug().log.filter(x=>x.kind==='blocked_replan'),[]);
});
test('late walk request replays a detour with the same physical result',async()=>{
 const A=await blocked(),B=await blocked();
 A.c.start('blocker0.6',10,point(0,.6),point(0,3),1);
 for(let i=1;i<=600;i++)A.c.pose('walker',i*STEP);
 for(let i=1;i<=600;i++)B.c.pose('walker',i*STEP);
 B.c.start('blocker0.6',10,point(0,.6),point(0,3),1);
 const p=A.c.pose('walker',20),q=B.c.pose('walker',20);
 for(const key of ['x','z','vx','vz','done','stalled'])assert.equal(p[key],q[key],key);
});
