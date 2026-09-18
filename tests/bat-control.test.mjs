import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatControl,startStroke,moveBatTarget,releaseStroke,stepBat,BAT_LIMITS,CONTACT_Z,COMMIT,shotName,resetBatControl,setBatIntent,resetBatTrim,setSwipeLength,SWIPE_LENGTHS } from '../dist/bat-control.js';
import { DEFAULTS,DT,createDelivery,stepDelivery,batContact,batBasis } from '../dist/physics.js';

test('clicking alone does not trigger a timed forward swing',()=>{
  const c=createBatControl();startStroke(c);
  for(let i=0;i<240;i++)stepBat(c,DT);
  assert.equal(c.travel,0);assert.ok(c.pose.z>0);
});

test('a committed swipe carries through the anchored contact point and releases into recovery',()=>{
  const c=createBatControl();const anchor={...c.target};startStroke(c);moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.5);
  let crossed=false;
  for(let i=0;i<120;i++){const old=stepBat(c,DT);if(old.z>CONTACT_Z&&c.pose.z<=CONTACT_Z)crossed=true;}
  assert.deepEqual(c.target,anchor);
  assert.ok(crossed,'the blade passes through the aimed point');
  assert.ok(c.committed&&c.progress>=1,'a half-length swipe past the commit point completes the stroke');
  const held=c.pose.z;for(let i=0;i<120;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-held)<.005,'the finish must not return on an automatic timer');
  releaseStroke(c);assert.equal(c.pose.active,false);
  for(let i=0;i<300;i++)stepBat(c,DT);
  assert.ok(Math.abs(c.pose.z-.06)<.001);assert.equal(c.phase,'guard');assert.equal(c.progress,0);
});

test('before the commit point the backlift follows the hand both ways; after it the blade never retracts',()=>{
  const c=createBatControl();startStroke(c);
  moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.15);for(let i=0;i<40;i++)stepBat(c,DT);
  assert.ok(c.progress>.1&&c.progress<COMMIT&&!c.committed);
  moveBatTarget(c,.25,.48);for(let i=0;i<40;i++)stepBat(c,DT);
  assert.ok(c.progress<.02,'an uncommitted swipe pulled back retracts');
  moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.4);
  let last=0;for(let i=0;i<30;i++){stepBat(c,DT);assert.ok(c.progress>=last);last=c.progress;}
  assert.ok(c.committed);
  moveBatTarget(c,.25,.48);
  for(let i=0;i<60;i++){stepBat(c,DT);assert.ok(c.progress>=last,'committed strokes do not run backwards');last=c.progress;}
  assert.ok(c.progress>=1);
});

test('the stroke direction is read from the whole backlift, so a curling hand still drives straight',()=>{
  const c=createBatControl();moveBatTarget(c,.25,.48,{x:0,y:0});startStroke(c);
  // Early sideways curl, then a long upward pull: the first few pixels must not choose a sweep.
  moveBatTarget(c,0,0,{x:.06,y:.02});moveBatTarget(c,0,0,{x:.07,y:.06});moveBatTarget(c,0,0,{x:.05,y:.2});moveBatTarget(c,0,0,{x:.03,y:.4});
  assert.equal(shotName(c),'Straight drive');
  for(let i=0;i<40;i++)stepBat(c,DT);
  assert.ok(c.directionLocked);
  moveBatTarget(c,0,0,{x:.5,y:.45});
  assert.equal(shotName(c),'Straight drive','direction freezes at commit');
});

test('progress velocity and acceleration stay bounded under a 30 Hz pointer staircase',()=>{
  const c=createBatControl();startStroke(c);let previous=0,previousV=0;
  for(let i=0;i<120;i++){
    if(i%8===0)moveBatTarget(c,.25,.48+BAT_LIMITS.travel*Math.min(i/60,1));
    stepBat(c,DT);const v=(c.progress-previous)/DT;
    assert.ok(v<=BAT_LIMITS.rate+1e-9&&v>=-BAT_LIMITS.rate-1e-9);
    if(i>0&&v>previousV)assert.ok(v-previousV<=(360+1e-6)*DT,'acceleration '+(v-previousV)/DT);
    previous=c.progress;previousV=v;
  }
  assert.ok(c.progress>=1);
});

test('the swipe-length setting scales how far the hand travels before a stroke commits',()=>{
  // The same slow, short hand movement: on a short swipe it commits and completes;
  // on a long swipe it is still backlift, so letting go pulls out of the shot.
  const gesture=factor=>{
    const c=createBatControl();setSwipeLength(c,factor);moveBatTarget(c,.25,.48,{x:0,y:0});startStroke(c);
    for(let i=0;i<48;i++){moveBatTarget(c,0,0,{x:0,y:.15*Math.min(i/40,1)});stepBat(c,DT);}
    for(let i=0;i<60;i++)stepBat(c,DT);
    return c;
  };
  const short=gesture(SWIPE_LENGTHS.short),long=gesture(SWIPE_LENGTHS.long);
  assert.ok(Math.abs(short.travel-.15)<1e-9&&Math.abs(long.travel-.15)<1e-9);
  assert.ok(short.committed&&short.progress>=1,'short swipe: '+short.progress);
  assert.ok(!long.committed&&long.progress<COMMIT,'long swipe: '+long.progress);
  releaseStroke(long);assert.equal(long.phase,'recover');
  resetBatControl(long,'left');assert.equal(long.swipe,SWIPE_LENGTHS.long,'the setting survives a reset');
  setSwipeLength(long,NaN);assert.equal(long.swipe,SWIPE_LENGTHS.long);
  setSwipeLength(long,99);assert.ok(long.swipe<=2.5);
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

test('cancelled strokes, an early let-go and the return to guard cannot hit an incoming ball',()=>{
  const cannotHit=c=>{for(let i=0;i<160;i++){
    const old=stepBat(c,DT);const d=createDelivery(DEFAULTS,42);d.p={x:c.pose.x,y:c.pose.y,z:c.pose.z-.08};d.v={x:0,y:0,z:40};
    stepDelivery(d,DEFAULTS,DT,c.pose,old);assert.equal(d.hit,false);
  }};
  // Cancelled mid-swing (pause, blur, intent change).
  let c=createBatControl();startStroke(c);moveBatTarget(c,.25,1.0);for(let i=0;i<24;i++)stepBat(c,DT);
  releaseStroke(c,true);assert.equal(c.phase,'recover');cannotHit(c);
  // Let go before the downswing commits: the shot is pulled out of.
  c=createBatControl();startStroke(c);moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.12);for(let i=0;i<24;i++)stepBat(c,DT);
  assert.ok(!c.committed);releaseStroke(c);assert.equal(c.phase,'recover');cannotHit(c);
  // A completed stroke returning to guard.
  c=createBatControl();startStroke(c);moveBatTarget(c,.25,1.0);for(let i=0;i<80;i++)stepBat(c,DT);
  assert.ok(c.progress>=1);releaseStroke(c);assert.equal(c.phase,'recover');cannotHit(c);
});

test('a committed stroke released mid-swing follows through with the blade live',()=>{
  const c=createBatControl();startStroke(c);moveBatTarget(c,.25,.48+BAT_LIMITS.travel*.4);
  while(!c.committed)stepBat(c,DT);
  releaseStroke(c);assert.equal(c.phase,'follow');assert.equal(c.held,false);
  let hit=false;
  for(let i=0;i<60&&!hit;i++){
    const old=stepBat(c,DT);
    if(c.pose.active&&old.z>CONTACT_Z+.05&&c.pose.z<CONTACT_Z+.05){const d=createDelivery(DEFAULTS,42);d.p={x:c.pose.x,y:c.pose.y,z:c.pose.z-.06};d.v={x:0,y:0,z:40};stepDelivery(d,DEFAULTS,DT,c.pose,old);hit=d.hit;}
  }
  assert.ok(hit,'the follow-through can still meet the ball');
  for(let i=0;i<300;i++)stepBat(c,DT);
  assert.equal(c.phase,'guard');assert.equal(c.pose.active,false);
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
