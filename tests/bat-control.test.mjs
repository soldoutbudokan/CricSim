import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatControl,startStroke,moveBatTarget,releaseStroke,stepBat,BAT_LIMITS } from '../dist/bat-control.js';
import { DEFAULTS,DT,createDelivery,stepDelivery,batContact,batBasis } from '../dist/physics.js';

test('clicking alone does not trigger a timed forward swing',()=>{
  const c=createBatControl();startStroke(c);
  for(let i=0;i<240;i++)stepBat(c,DT);
  assert.equal(c.travel,0);assert.ok(c.pose.z>0);
});

test('mouse travel drives the stroke and release resets it',()=>{
  const c=createBatControl();startStroke(c);moveBatTarget(c,.25,.70);
  for(let i=0;i<120;i++)stepBat(c,DT);
  assert.ok(c.pose.z<-.3);
  const held=c.pose.z;for(let i=0;i<120;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-held)<.005,'the stroke must not return on an automatic timer');
  releaseStroke(c);for(let i=0;i<120;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z+.12)<.001);
});

test('large pointer jumps cannot produce unbounded forward bat velocity',()=>{
  const c=createBatControl();startStroke(c);moveBatTarget(c,1.18,1.6);
  const old=stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-old.z)/DT<=BAT_LIMITS.speed+.001);
});

test('a soft-handed block absorbs more speed than a firm face',()=>{
  const bounce=defending=>{const d=createDelivery(DEFAULTS,42);d.p={x:0,y:.5,z:-.07};d.v={x:0,y:0,z:40};const bat={x:0,y:.5,z:0,yaw:0,loft:0,roll:0,defending};stepDelivery(d,DEFAULTS,DT,bat,bat);assert.ok(d.hit);return d.exitSpeed;};
  assert.ok(bounce(true)<bounce(false)*.4);
});

test('rolling the blade changes the contact area for a cross-bat shot',()=>{
  const vertical={x:0,y:.5,z:0,yaw:0,loft:0,roll:0};
  const from={x:.22,y:.5,z:-.2},to={x:.22,y:.5,z:.2};
  assert.equal(batContact(from,to,vertical),null);
  assert.ok(batContact(from,to,{...vertical,roll:Math.PI/2}));
});

test('combined face, loft and roll retain an orthonormal collision basis',()=>{
  const {n,w,u}=batBasis({yaw:.65,loft:.54,roll:1.2});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  for(const v of [n,w,u])assert.ok(Math.abs(dot(v,v)-1)<1e-12);
  for(const [a,b] of [[n,w],[n,u],[w,u]])assert.ok(Math.abs(dot(a,b))<1e-12);
});

test('delivery begins at the animated hand and preserves its intended length',()=>{
  const origin={x:.42,y:2.19,z:-17.735};const c={...DEFAULTS,arm:'left'};
  const d=createDelivery(c,11,origin);assert.deepEqual(d.p,origin);
  while(!d.bounce&&d.time<3)stepDelivery(d,c);
  assert.ok(Math.abs(d.bounce.z-d.length)<.22);
});
