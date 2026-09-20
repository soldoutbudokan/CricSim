import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { DEFAULTS, DT, createDelivery, stepDelivery, clamp } from '../dist/physics.js';
import { createBatControl, moveBatTarget, startStroke, releaseStroke, stepBat, strokeSnapshot, CONTACT_Z, BAT_LIMITS } from '../dist/bat-control.js';
import { describeShot, describeMiss, missDiagram, isControlled, isPlayingShot, missTitle } from '../dist/shot-feedback.js';
import { BATTING_VIEW, batterMotion, battingFov } from '../dist/batter-motion.js';

// A repeatable player: observes one seeded trajectory, aims once, and performs
// an open-loop swipe. The controller never receives the ball or its trajectory.
function play({ length = 'good', hand = 'right', intent = 'grounded', side = 0, miss = 0, inputHz = 240, duration = .3, lead = duration / 2 + .02, release = null } = {}) {
  const config = { ...DEFAULTS, length, hand, line: 'middle' };
  const probe = createDelivery(config, 42);
  while (probe.p.z < CONTACT_Z) stepDelivery(probe, config);
  const c = createBatControl(hand); c.intent = intent;
  moveBatTarget(c, probe.p.x + miss, probe.p.y + (side ? 0 : .035), { x: 0, y: 0 });
  const d = createDelivery(config, 42), swipeAt = probe.time - lead;
  let started = false, released = false, nextInput = 0, stroke = null;
  while (d.time < probe.time + .3) {
    if (!started && d.time >= swipeAt - .15) { startStroke(c); started = true; }
    if (started && !released && d.time >= nextInput) {
      const t = clamp((d.time - swipeAt) / duration, 0, 1);
      moveBatTarget(c, 0, 0, { x: side * t * BAT_LIMITS.travel, y: side ? 0 : t * BAT_LIMITS.travel });
      nextInput = d.time + 1 / inputHz - 1e-8;
    }
    if (release !== null && !released && started && d.time >= swipeAt + release) { releaseStroke(c); released = true; }
    const old = stepBat(c, DT), beforeZ = d.p.z;
    const events = stepDelivery(d, config, DT, c.pose, old);
    if (events.some(e => e.type === 'contact') || !stroke && beforeZ < CONTACT_Z && d.p.z >= CONTACT_Z) stroke = strokeSnapshot(c);
    if (d.hit) break;
  }
  d.stroke = stroke;
  return { d, c, stroke };
}

test('one aimed drive can meet yorkers, full, good and short balls in either stance', () => {
  for (const hand of ['left', 'right']) for (const length of ['yorker', 'full', 'good', 'short']) {
    const { d, stroke } = play({ hand, length });
    assert.ok(d.hit, hand + '/' + length);
    assert.equal(d.contact.edge, false, hand + '/' + length);
    // The blade's corners stay above the pitch, so a yorker is dug out with the toe.
    assert.ok(d.contact.quality > (length === 'yorker' ? .3 : .7), `${hand}/${length}: quality ${d.contact.quality.toFixed(2)} at progress ${stroke.progress.toFixed(2)}`);
  }
});

test('grounded and lofted intent produce distinct physical launches', () => {
  const ground = play().d, loft = play({ intent: 'lofted' }).d;
  assert.ok(ground.hit && loft.hit);
  assert.ok(loft.v.y > ground.v.y + 10);
  assert.ok(ground.v.z < -10 && loft.v.z < -10);
});

test('cuts and pulls meet the face and send the ball to the swiped side', () => {
  for (const hand of ['left', 'right']) for (const side of [-1, 1]) {
    const { d, c } = play({ hand, side, length: 'short' });
    assert.ok(d.hit); assert.equal(d.contact.edge, false);
    assert.ok(d.v.x * side > 10);
    assert.ok(Math.abs(c.pose.roll) > 1);
  }
});

test('an aimed miss stays a miss: shot shaping never seeks the ball', () => {
  const { d, stroke } = play({ miss: .6 });
  assert.equal(d.hit, false);
  assert.equal(describeShot(stroke).timing, 'Missed line');
});

test('a flick released after the swing commits still meets the ball; letting go first pulls out', () => {
  const flick = play({ release: .12 }), pulled = play({ release: .05 });
  assert.ok(flick.d.hit); assert.equal(flick.d.contact.edge, false); assert.ok(flick.d.contact.quality > .5);
  assert.equal(pulled.d.hit, false);
  assert.equal(describeShot(pulled.stroke).timing, 'Backed off');
  assert.equal(isControlled(pulled.d, 'Missed'), true, 'backing off before the swing commits is a leave');
  assert.equal(missTitle(pulled.d, 'Missed'), 'Left alone');
});

test('the same gesture remains playable at 30, 60 and 120 input updates per second', () => {
  const exits = [30, 60, 120].map(inputHz => {
    const { d } = play({ inputHz });
    assert.ok(d.hit, 'Input rate ' + inputHz); assert.equal(d.contact.edge, false);
    return d.exitSpeed;
  });
  assert.ok(Math.max(...exits) - Math.min(...exits) < 12, exits.join(', '));
});

test('a faster swipe transfers more speed on a similarly timed drive', () => {
  const fast = play({ duration: .22 }).d, slow = play({ duration: .5 }).d;
  assert.ok(fast.hit && slow.hit);
  assert.ok(fast.exitSpeed > slow.exitSpeed + 5);
});

test('timing feedback distinguishes leaves, late, early, backed-off, release and aim errors', () => {
  const stroke = { name: 'Drive', attempted: true, held: true, committed: true, phase: 'swing', progress: .5 };
  assert.equal(describeShot(null).timing, 'Left');
  assert.equal(describeShot(null, null, true).timing, 'Left');
  assert.notEqual(describeShot(null, null, true).detail, describeShot(null).detail, 'a leave that is bowled gets different advice');
  assert.equal(describeShot({ ...stroke, progress: .15 }).timing, 'Late');
  assert.equal(describeShot({ ...stroke, progress: .9 }).timing, 'Early');
  assert.equal(describeShot({ ...stroke, phase: 'recover' }).timing, 'Early');
  assert.equal(describeShot({ ...stroke, phase: 'recover', committed: false }).timing, 'Backed off');
  assert.equal(describeShot({ ...stroke, phase: 'load', committed: false }, null, true).timing, 'Backed off');
  assert.equal(describeShot({ ...stroke, phase: 'follow' }).timing, 'Missed line');
  assert.equal(describeShot(stroke).timing, 'Missed line');
  assert.equal(describeShot(stroke, { quality: .9, edge: false }).timing, 'Well timed');
  assert.equal(describeShot({ ...stroke, defending: true }, { quality: .5 }).timing, 'Soft hands');
  assert.equal(describeShot({ ...stroke, defending: true }).timing, 'Beaten');
  assert.equal(describeShot({ ...stroke, defending: true }, null, true).timing, 'Beaten');
});

test('leaves and released strokes count as control; a held shot that misses or a dismissal does not', () => {
  const swing = { attempted: true, held: true, committed: true, phase: 'swing', progress: .5 };
  const backedOff = { attempted: true, committed: false, phase: 'recover', progress: .1 };
  assert.equal(isControlled({ hit: true, stroke: swing }, 'Sweet spot'), true);
  assert.equal(isControlled({ hit: false, stroke: null }, 'Missed'), true);
  assert.equal(isControlled({ hit: false, stroke: { attempted: false } }, 'Missed'), true);
  assert.equal(isControlled({ hit: false, stroke: { attempted: true, defending: true } }, 'Missed'), false);
  assert.equal(isControlled({ hit: false, stroke: backedOff }, 'Missed'), true);
  assert.equal(isControlled({ hit: false, stroke: swing }, 'Missed'), false);
  assert.equal(isControlled({ hit: false, stroke: null }, 'Bowled'), false);
  assert.equal(isControlled({ hit: false, stroke: backedOff }, 'Bowled'), false);
  assert.equal(isControlled({ hit: false, stroke: { attempted: true, defending: true } }, 'Bowled'), false);
  assert.equal(isControlled(null, 'Missed'), false);
  assert.equal(missTitle({ stroke: null }, 'Missed'), 'Left alone');
  assert.equal(missTitle({ stroke: backedOff }, 'Missed'), 'Left alone');
  assert.equal(missTitle({ stroke: { attempted: true, defending: true } }, 'Missed'), 'Played & missed');
  assert.equal(missTitle({ stroke: swing }, 'Missed'), 'Played & missed');
  assert.equal(missTitle({ stroke: swing }, 'Bowled'), 'Bowled');
  const released = { ...swing, held: false };
  assert.equal(isControlled({ stroke: released }, 'Missed'), true);
  assert.equal(missTitle({ stroke: released }, 'Missed'), 'Left alone');
  for (const result of ['Bowled', 'LBW']) {
    assert.equal(isControlled({ stroke: released }, result), false);
    assert.equal(missTitle({ stroke: released }, result), result);
    assert.equal(isControlled({ hit: true, stroke: swing }, result), false, 'contact cannot override a dismissal');
  }
});

// A block aims once and stays there; it never swipes or commits like a drive.
function playBlock({ hand = 'right', rightClick = false, miss = 0, release = false, start = true } = {}) {
  const config = { ...DEFAULTS, hand, line: 'off', length: 'good' };
  const probe = createDelivery(config, 42);
  while (probe.p.z < CONTACT_Z) stepDelivery(probe, config);
  const c = createBatControl(hand);
  if (!rightClick) c.intent = 'defend';
  moveBatTarget(c, probe.p.x + miss, probe.p.y + .035);
  const d = createDelivery(config, 42);
  let started = false, released = false;
  while (!d.resolved && d.time < 3) {
    if (start && !started && d.time >= probe.time - .22) {
      startStroke(c, rightClick || c.intent === 'defend'); started = true;
    }
    if (release && started && !released && d.time >= probe.time - .1) {
      releaseStroke(c); released = true;
    }
    const old = stepBat(c, DT), beforeZ = d.p.z;
    const events = stepDelivery(d, config, DT, c.pose, old);
    if (events.some(e => e.type === 'contact') || !d.stroke && beforeZ < CONTACT_Z && d.p.z >= CONTACT_Z) d.stroke = strokeSnapshot(c);
    for (const event of events) if (event.type === 'result') d.result = event.result;
  }
  assert.ok(d.resolved);
  return { d, c };
}

test('a held block that misses is a played miss in Defend mode and right-click defence, in either stance', () => {
  for (const hand of ['left', 'right']) for (const rightClick of [false, true]) {
    const { d, c } = playBlock({ hand, rightClick, miss: .6 });
    assert.equal(d.hit, false);
    assert.equal(d.result, 'Missed');
    assert.equal(d.stroke.defending, true);
    assert.equal(d.stroke.held, false, 'defence uses a separate held flag');
    assert.equal(d.stroke.committed, false);
    assert.equal(isPlayingShot(d.stroke), true, 'the result card must show the miss diagram');
    assert.equal(missTitle(d, d.result), 'Played & missed');
    assert.equal(describeShot(d.stroke).timing, 'Beaten');
    assert.equal(isControlled(d, d.result), false);
    assert.ok(d.miss && describeMiss(d.miss));
    releaseStroke(c);
    assert.equal(missTitle(d, d.result), 'Played & missed', 'releasing after the ball cannot rewrite the block');
  }
});

test('releasing a block or selecting Defend without pressing remains a safe leave', () => {
  for (const rightClick of [false, true]) for (const options of [{ release: true }, { start: false }]) {
    const { d, c } = playBlock({ rightClick, ...options });
    assert.equal(d.hit, false);
    assert.equal(d.result, 'Missed');
    assert.equal(d.stroke.defending, false);
    assert.equal(isPlayingShot(d.stroke), false);
    assert.equal(missTitle(d, d.result), 'Left alone');
    assert.equal(isControlled(d, d.result), true);
    startStroke(c, true);
    assert.equal(missTitle(d, d.result), 'Left alone', 'pressing after the ball cannot rewrite the leave');
    assert.equal(isControlled(d, 'Bowled'), false);
    assert.equal(missTitle(d, 'Bowled'), 'Bowled');
  }
});

test('an aimed defensive block still makes contact and counts as control', () => {
  for (const hand of ['left', 'right']) for (const rightClick of [false, true]) {
    const { d } = playBlock({ hand, rightClick });
    assert.equal(d.hit, true);
    assert.equal(describeShot(d.stroke, d.contact).timing, 'Soft hands');
    assert.equal(isControlled(d, d.result), true);
  }
});

test('a released committed miss is a leave, but a flick that makes contact is still a shot', () => {
  const held = play({ miss: .6 });
  const backedOff = play({ miss: .6, release: .12 });
  assert.equal(held.d.hit, false);
  assert.equal(held.stroke.held, true);
  assert.equal(missTitle(held.d, 'Missed'), 'Played & missed');
  assert.equal(isControlled(held.d, 'Missed'), false);
  assert.equal(backedOff.d.hit, false);
  assert.equal(backedOff.stroke.committed, true);
  assert.equal(backedOff.stroke.held, false);
  assert.equal(missTitle(backedOff.d, 'Missed'), 'Left alone');
  assert.equal(isControlled(backedOff.d, 'Missed'), true);
  assert.equal(describeShot(backedOff.stroke).timing, 'Backed off');
  const flick = play({ release: .12 });
  assert.ok(flick.d.hit);
  assert.equal(flick.stroke.held, false);
  assert.equal(describeShot(flick.stroke, flick.d.contact).timing, 'Well timed');
});

test('input after the ball passes cannot rewrite a leave or miss', () => {
  const held = play({ miss: .6 });
  releaseStroke(held.c);
  assert.equal(held.c.held, false);
  assert.equal(missTitle(held.d, 'Missed'), 'Played & missed');
  const backedOff = play({ miss: .6, release: .12 });
  startStroke(backedOff.c);
  assert.equal(backedOff.c.held, true);
  assert.equal(missTitle(backedOff.d, 'Missed'), 'Left alone');
  const tapped = createBatControl();
  startStroke(tapped); releaseStroke(tapped); stepBat(tapped, DT);
  assert.equal(missTitle({ stroke: strokeSnapshot(tapped) }, 'Missed'), 'Left alone');
  assert.equal(missTitle({ stroke: strokeSnapshot(createBatControl()) }, 'Missed'), 'Left alone');
});

test('miss diagrams keep screen directions, blade rotation and distant balls inside the graphic', () => {
  for (const [x, y, direction] of [[.3, 0, 'right'], [-.3, 0, 'left'], [0, .5, 'above'], [0, -.5, 'below'], [.3, -.5, 'right / below']]) {
    const miss = { x, y, depth: 0, gap: .2 };
    assert.equal(describeMiss(miss, 1).direction, direction);
    assert.equal(describeMiss(miss, -1).direction, direction);
    const diagram = missDiagram(miss);
    if (x > 0) assert.ok(diagram.ball.x > diagram.nearest.x);
    if (y < 0) assert.ok(diagram.ball.y > diagram.nearest.y);
  }
  const rolled = { x: .3, y: 0, depth: 0, gap: .2, bat: { yaw: 0, loft: 0, roll: Math.PI / 2 } };
  assert.equal(describeMiss(rolled).direction, 'above');
  const cut = missDiagram(rolled);
  assert.ok(Math.abs(cut.handle[0].x - cut.handle[1].x) > 5);
  assert.ok(Math.abs(cut.handle[0].y - cut.handle[1].y) < 1e-8);
  for (const x of [-3, 0, 3]) for (const y of [-3, 0, 3]) {
    const diagram = missDiagram({ x, y, depth: .2, gap: 2 });
    for (const p of [...diagram.blade, ...diagram.handle, diagram.ball]) {
      assert.ok(p.x >= 0 && p.x <= 120 && p.y >= 0 && p.y <= 88);
    }
    assert.ok(diagram.ball.x - diagram.radius >= 0 && diagram.ball.x + diagram.radius <= 120);
    assert.ok(diagram.ball.y - diagram.radius >= 0 && diagram.ball.y + diagram.radius <= 88);
  }
});

test('a miss reports where the ball passed and how far from the blade it was', () => {
  const { d, stroke } = play({ miss: .6 });
  assert.equal(d.hit, false);
  assert.ok(d.miss && d.miss.gap > .3 && d.miss.gap < .7, JSON.stringify(d.miss));
  const text = describeMiss(d.miss, 1);
  assert.match(text.distance, /^\d+ cm$/);
  assert.match(text.where, /past the (outside|inside) edge/);
  assert.match(text.sentence, /^The ball passed .*\.$/);
  // A right-hander aiming 0.6 m to the off side sees the ball pass the inside edge; a left-hander the outside.
  assert.equal(describeMiss({ x: -.3, y: 0, depth: 0, gap: .2 }, 1).where, '25 cm past the inside edge');
  assert.equal(describeMiss({ x: -.3, y: 0, depth: 0, gap: .2 }, -1).where, '25 cm past the outside edge');
  assert.equal(describeMiss({ x: 0, y: -.4, depth: 0, gap: .05 }).where, '9 cm below the toe');
  assert.equal(describeMiss({ x: 0, y: 0, depth: .2, gap: .16 }).where, 'in front of the face before the blade arrived');
  assert.equal(describeMiss({ x: 0, y: 0, depth: 0, gap: 0 }).distance, 'a whisker');
  assert.equal(describeMiss(null), null);
  assert.ok(stroke);
});

test('front foot and back foot strokes move the body while keeping the head steady', () => {
  const front = batterMotion({ x: .4, y: .6, yaw: .2, weight: 1, turn: .6 });
  const back = batterMotion({ x: .4, y: 1.2, yaw: .2, weight: -.45, turn: .6 });
  assert.ok(front.front.z < back.front.z - .2);
  assert.ok(back.rear.z > front.rear.z);
  for (const pose of [front, back]) {
    assert.ok(Math.hypot(pose.eye.x - BATTING_VIEW.eye.x, pose.eye.y - BATTING_VIEW.eye.y, pose.eye.z - BATTING_VIEW.eye.z) < .05);
    assert.ok(pose.shoulders[0].z !== pose.shoulders[1].z);
  }
});

test('the batting camera includes release and contact across desktop and portrait aspects', () => {
  for (const aspect of [16 / 9, 4 / 3, 390 / 844]) {
    const camera = new THREE.PerspectiveCamera(battingFov(aspect), aspect, .035, 400);
    camera.position.copy(BATTING_VIEW.eye);
    camera.lookAt(BATTING_VIEW.look.x, BATTING_VIEW.look.y, BATTING_VIEW.look.z); camera.updateMatrixWorld();
    for (const point of [{ x: -.42, y: 2.18, z: -17.7 }, { x: 0, y: .35, z: CONTACT_Z }, { x: .6, y: .8, z: CONTACT_Z }]) {
      const p = new THREE.Vector3().copy(point).project(camera);
      assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1, JSON.stringify({ aspect, point, projection: p }));
    }
    // World -> screen -> world must preserve the chosen contact point.
    const aim = new THREE.Vector3(.25, .6, CONTACT_Z), screen = aim.clone().project(camera);
    const ray = new THREE.Raycaster(); ray.setFromCamera(screen, camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -CONTACT_Z), new THREE.Vector3());
    assert.ok(hit.distanceTo(aim) < 1e-8);
  }
});
