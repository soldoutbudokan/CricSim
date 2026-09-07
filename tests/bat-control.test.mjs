import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatControl,startStroke,moveBatTarget,releaseStroke,stepBat,BAT_LIMITS,CONTACT_Z,shotName,resetBatControl,setBatIntent,resetBatTrim } from '../dist/bat-control.js';
import { DEFAULTS,DT,createDelivery,stepDelivery,batContact,batBasis } from '../dist/physics.js';

test('clicking alone does not trigger a timed forward swing',()=>{
  const c=createBatControl();startStroke(c);
  for(let i=0;i<240;i++)stepBat(c,DT);
  assert.equal(c.travel,0);assert.ok(c.pose.z>0);
});

test('swipe moves through the anchored contact point and releases into recovery',()=>{
  const c=createBatControl();const anchor={...c.target};startStroke(c);moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.5);
  for(let i=0;i<120;i++)stepBat(c,DT);
  assert.deepEqual(c.target,anchor);
  assert.ok(Math.abs(c.pose.z-CONTACT_Z)<.001);
  const held=c.pose.z;for(let i=0;i<120;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-held)<.005,'the stroke must not return on an automatic timer');
  const before={...c.pose};releaseStroke(c);assert.equal(c.pose.z,before.z);assert.equal(c.pose.active,false);
  for(let i=0;i<300;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-.06)<.001);assert.equal(c.phase,'guard');
});

test('small jitter and repeated reversals cannot charge a stroke',()=>{
  const c=createBatControl();startStroke(c);
  for(let i=0;i<100;i++){moveBatTarget(c,.25+(i%2?-.01:.01),.48);stepBat(c,DT);}
  assert.equal(c.travel,0);assert.equal(c.pose.active,false);
  for(let i=0;i<30;i++){moveBatTarget(c,.25,.60);moveBatTarget(c,.25,.48);}
  assert.equal(c.travel,0);
});

test('screen-space swipes work even when the aimed point is at a world limit',()=>{
  const c=createBatControl();moveBatTarget(c,BAT_LIMITS.x,BAT_LIMITS.maxY,{x:0,y:0});startStroke(c);
  moveBatTarget(c,BAT_LIMITS.x,BAT_LIMITS.maxY,{x:.26,y:0});
  assert.equal(c.travel,.26);assert.deepEqual(c.target,{x:BAT_LIMITS.x,y:BAT_LIMITS.maxY});
});

test('sideways swipes choose cuts, pulls and sweeps and roll the blade',()=>{
  for(const hand of ['left','right'])for(const side of [-1,1])for(const y of [.45,1.1]){
    const c=createBatControl(hand);moveBatTarget(c,0,y,{x:0,y:0});startStroke(c);moveBatTarget(c,0,y,{x:side*.26,y:0});
    for(let i=0;i<160;i++)stepBat(c,DT);
    assert.ok(c.pose.roll*side>1.2);
    assert.equal(shotName(c),y<.65?'Sweep':side*c.hand>0?'Cut':'Pull');
  }
});

test('left and right handed strokes mirror their physical poses',()=>{
  const right=createBatControl('right'),left=createBatControl('left');
  for(const c of [right,left]){moveBatTarget(c,.4*c.hand,.8,{x:0,y:0});startStroke(c);}
  for(let i=0;i<200;i++){
    const t=Math.min(i/100,1);
    for(const c of [right,left]){moveBatTarget(c,0,0,{x:.45*t*c.hand,y:.2*t});stepBat(c,DT);}
    for(const key of ['x','yaw','roll','turn'])assert.ok(Math.abs(right.pose[key]+left.pose[key])<1e-10,key);
    for(const key of ['y','z','loft','weight'])assert.ok(Math.abs(right.pose[key]-left.pose[key])<1e-10,key);
  }
});

test('the blade carries forward velocity through the contact portion of a swipe',()=>{
  const c=createBatControl();startStroke(c);let samples=0;
  for(let i=0;i<100;i++){
    moveBatTarget(c,.25,.48+BAT_LIMITS.travel*Math.min(i/72,1));const old=stepBat(c,DT);
    if(c.progress>.47&&c.progress<.61){assert.ok((old.z-c.pose.z)/DT>1.5);samples++;}
  }
  assert.ok(samples>3);
});

test('cancelled preparation and recovery cannot hit an incoming ball',()=>{
  for(const cancel of [true,false]){
    const c=createBatControl();startStroke(c);moveBatTarget(c,.25,1.0);for(let i=0;i<24;i++)stepBat(c,DT);
    releaseStroke(c,cancel);
    for(let i=0;i<160;i++){
      const old=stepBat(c,DT);const d=createDelivery(DEFAULTS,42);d.p={x:c.pose.x,y:c.pose.y,z:c.pose.z-.08};d.v={x:0,y:0,z:40};
      stepDelivery(d,DEFAULTS,DT,c.pose,old);assert.equal(d.hit,false);
    }
  }
});

test('intent changes, reset and invalid input leave a usable controller',()=>{
  const c=createBatControl(),pose=c.pose,target=c.target;startStroke(c);setBatIntent(c,'defend');startStroke(c);stepBat(c,DT);
  assert.ok(c.pose.defending&&c.pose.active);
  resetBatControl(c,'left');assert.equal(c.pose,pose);assert.equal(c.target,target);assert.equal(c.hand,-1);assert.equal(c.intent,'defend');assert.equal(c.attempted,false);
  stepBat(c,DT,new Set(['e','w','d']));assert.ok(c.trim.roll>0);resetBatTrim(c);assert.deepEqual(c.trim,{yaw:0,loft:0,roll:0});
  const before={...c.pose};stepBat(c,0);stepBat(c,NaN);moveBatTarget(c,Infinity,NaN);assert.deepEqual(c.pose,before);
});

test('all blade corners stay above the pitch while orienting low shots',()=>{
  for(const hand of ['right','left'])for(const keys of [new Set(),new Set(['s','q','a']),new Set(['w','e','d'])]){
    const c=createBatControl(hand);moveBatTarget(c,0,.35);startStroke(c);
    for(let i=0;i<400;i++){
      moveBatTarget(c,Math.sin(i/40),.35+Math.cos(i/40)*.5);stepBat(c,DT,keys);const {u,w}=batBasis(c.pose);
      assert.ok(c.pose.y-.31*Math.abs(u.y)-.054*Math.abs(w.y)>=.068-1e-10);
    }
  }
});

test('large input changes limit total translation and all angular speeds',()=>{
  const c=createBatControl();let max=0;
  for(let i=0;i<300;i++){
    if(i%60===0){releaseStroke(c);moveBatTarget(c,i%120?-1.18:1.18,i%120?.35:1.65);startStroke(c);}
    moveBatTarget(c,5,-5);const old=stepBat(c,DT,new Set(['q','s']));max=Math.max(max,c.speed);
    for(const axis of ['yaw','loft','roll'])assert.ok(Math.abs(c.pose[axis]-old[axis])/DT<=BAT_LIMITS.angularSpeed+1e-8);
  }
  assert.ok(max<=BAT_LIMITS.speed+1e-8,'speed '+max);
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
