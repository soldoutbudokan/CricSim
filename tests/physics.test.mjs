import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, BOWLERS, PITCHES, PACE_SPREADS, DT, createDelivery, stepDelivery, batContact } from '../dist/physics.js';
function simulate(config,seed=42,until=1.18){const d=createDelivery({...DEFAULTS,...config},seed),events=[];for(let i=0;i<2400&&d.p.z<until;i++)events.push(...stepDelivery(d,{...DEFAULTS,...config}));return{d,events};}
test('all bowler/pitch/length combinations reach the crease with finite coordinates',()=>{for(const bowler of Object.keys(BOWLERS))for(const pitch of Object.keys(PITCHES))for(const length of ['yorker','full','good','short']){const {d,events}=simulate({bowler,pitch,length,speed:BOWLERS[bowler].speed});assert.ok(events.some(e=>e.type==='result'),`${bowler}/${pitch}/${length} never reached wicket`);for(const k of ['x','y','z'])assert.ok(Number.isFinite(d.p[k]));assert.ok(d.bounces>=1);}});
test('release speed stays within 3 km/h of configured speed',()=>{for(const bowler of Object.keys(BOWLERS))for(const speed of [BOWLERS[bowler].min,BOWLERS[bowler].max])for(const length of ['short','good','yorker']){const d=createDelivery({...DEFAULTS,bowler,speed,length},42);assert.ok(Math.abs(d.speed-speed)<3,`${bowler}/${length}: ${d.speed} vs ${speed}`);}});
test('the configured length determines the first bounce',()=>{for(const length of ['yorker','full','good','short']){const c={...DEFAULTS,length};const d=createDelivery(c,123);while(!d.bounce&&d.time<3)stepDelivery(d,c);assert.ok(Math.abs(d.bounce.z-d.length)<.22,`${length}: ${d.bounce.z} vs ${d.length}`);}});
test('a hard pitch carries higher than a damp pitch',()=>{const hard=simulate({pitch:'hard'},19,.2),soft=simulate({pitch:'soft'},19,.2);assert.ok(hard.d.p.y>soft.d.p.y+.1);});
test('leg spin and off spin turn in opposite directions',()=>{const off=simulate({bowler:'offspin',pitch:'dry',speed:80}),leg=simulate({bowler:'legspin',pitch:'dry',speed:80});assert.ok(off.d.v.x<0);assert.ok(leg.d.v.x>0);});
test('opposite swing styles separate in flight',()=>{const out=simulate({bowler:'outswing',speed:125},42,-5),inside=simulate({bowler:'inswing',speed:125},42,-5);assert.ok(out.d.p.x>inside.d.p.x+.1);});
test('bat collision catches a ball that crosses the face in one step',()=>{const bat={x:0,y:.5,z:0,yaw:0,loft:0};assert.ok(batContact({x:0,y:.5,z:-.2},{x:0,y:.5,z:.2},bat));assert.equal(batContact({x:.20,y:.5,z:-.2},{x:.20,y:.5,z:.2},bat),null);});
test('a moving bat can intercept the ball and generates physical rebound',()=>{const c={...DEFAULTS};const d=createDelivery(c,42);d.p={x:0,y:.5,z:-.07};d.v={x:0,y:0,z:40};const bat={x:0,y:.5,z:0,yaw:0,loft:0};const ev=stepDelivery(d,c,DT,bat,bat);assert.ok(ev.some(e=>e.type==='contact'));assert.ok(d.v.z<0);assert.ok(d.exitSpeed>0);});
test('bowled and missed have distinct outcomes at the stumps',()=>{for(const [x,result] of [[0,'Bowled'],[.5,'Missed']]){const d=createDelivery(DEFAULTS);d.p={x,y:.3,z:1.1};d.v={x:0,y:0,z:30};const events=stepDelivery(d,DEFAULTS);assert.equal(events.find(e=>e.type==='result')?.result,result);}});
test('a fixed seed produces identical deliveries and trajectories',()=>{const a=simulate({}),b=simulate({});assert.deepEqual(a.d,b.d);});

test('pace variation draws a clipped bell curve around the release speed and changes nothing else about a seed',()=>{
  const speeds=[];
  for(let seed=1;seed<=400;seed++){
    const steady=createDelivery({...DEFAULTS,speedSpread:'none'},seed),varied=createDelivery({...DEFAULTS,speedSpread:'natural'},seed);
    assert.ok(Math.abs(steady.speed-140)<=1.5+.5,'consistent pace stays within the old jitter: '+steady.speed);
    for(const key of ['length','targetLine','seam','seamNoise','bounceNoise'])assert.equal(varied[key],steady[key],key);
    assert.ok(Math.abs(varied.speed-140)<=2.5*PACE_SPREADS.natural+2,'clipped: '+varied.speed);
    speeds.push(varied.speed);
  }
  const mean=speeds.reduce((a,b)=>a+b)/speeds.length,sd=Math.sqrt(speeds.reduce((a,b)=>a+(b-mean)**2,0)/speeds.length);
  assert.ok(Math.abs(mean-140)<1,'mean '+mean);
  assert.ok(sd>2.8&&sd<5.4,'spread '+sd);
  assert.ok(new Set(speeds.map(s=>Math.round(s))).size>12,'a real distribution, not a few steps');
  assert.deepEqual(createDelivery({...DEFAULTS,speedSpread:'mixed'},7),createDelivery({...DEFAULTS,speedSpread:'mixed'},7));
});
test('a ball that passes the bat records the nearest it came, in the blade frame',()=>{
  const c={...DEFAULTS,line:'middle'};const d=createDelivery(c,42);
  const bat={x:.6,y:.5,z:.06,yaw:0,loft:0,roll:0,active:false};
  while(!d.resolved&&d.time<3)stepDelivery(d,c,DT,bat,bat);
  assert.equal(d.hit,false);assert.ok(d.miss);
  assert.ok(d.miss.x<-.4&&d.miss.x>-.8,'passed on the inside of a bat held 0.6 m to the off: '+d.miss.x);
  assert.ok(Math.abs(d.miss.depth)<.05,'the nearest point is as it crosses the face plane: '+d.miss.depth);
  assert.ok(Math.abs(d.miss.gap-(Math.abs(d.miss.x)-.054-.036))<.02);
  const struck=createDelivery(c,42);const live={x:0,y:.5,z:-.07,yaw:0,loft:0,roll:0};struck.p={x:0,y:.5,z:-.2};struck.v={x:0,y:0,z:40};
  stepDelivery(struck,c,DT,live,live);assert.ok(struck.hit);
});
