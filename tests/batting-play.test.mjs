import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { DEFAULTS, DT, createDelivery, stepDelivery, clamp } from '../dist/physics.js';
import { createBatControl, moveBatTarget, startStroke, stepBat, strokeSnapshot, CONTACT_Z, BAT_LIMITS } from '../dist/bat-control.js';
import { describeShot } from '../dist/shot-feedback.js';
import { BATTING_VIEW, batterMotion, battingFov } from '../dist/batter-motion.js';

// A repeatable player: observes one seeded trajectory, aims once, and performs
// an open-loop swipe. The controller never receives the ball or its trajectory.
function play({ length = 'good', hand = 'right', intent = 'grounded', side = 0, miss = 0, inputHz = 240, duration = .3, lead = duration / 2 + .06 } = {}) {
  const config = { ...DEFAULTS, length, hand, line: 'middle' };
  const probe = createDelivery(config, 42);
  while (probe.p.z < CONTACT_Z) stepDelivery(probe, config);
  const c = createBatControl(hand); c.intent = intent;
  moveBatTarget(c, probe.p.x + miss, probe.p.y + (side ? 0 : .035), { x: 0, y: 0 });
  const d = createDelivery(config, 42), swipeAt = probe.time - lead;
  let started = false, nextInput = 0, stroke = null;
  while (d.time < probe.time + .3) {
    if (!started && d.time >= swipeAt - .15) { startStroke(c); started = true; }
    if (started && d.time >= nextInput) {
      const t = clamp((d.time - swipeAt) / duration, 0, 1);
      moveBatTarget(c, 0, 0, { x: side * t * BAT_LIMITS.travel, y: side ? 0 : t * BAT_LIMITS.travel });
      nextInput = d.time + 1 / inputHz - 1e-8;
    }
    const old = stepBat(c, DT), beforeZ = d.p.z;
    const events = stepDelivery(d, config, DT, c.pose, old);
    if (events.some(e => e.type === 'contact') || !stroke && beforeZ < CONTACT_Z && d.p.z >= CONTACT_Z) stroke = strokeSnapshot(c);
    if (d.hit) break;
  }
  return { d, c, stroke };
}

test('one aimed drive can meet yorkers, full, good and short balls in either stance', () => {
  for (const hand of ['left', 'right']) for (const length of ['yorker', 'full', 'good', 'short']) {
    const { d } = play({ hand, length });
    assert.ok(d.hit, hand + '/' + length);
    assert.equal(d.contact.edge, false);
    assert.ok(d.contact.quality > (length === 'yorker' ? .4 : .7));
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

test('timing feedback distinguishes preparation, late, early, release and aim errors', () => {
  const stroke = { name: 'Drive', attempted: true, phase: 'swing', progress: .5 };
  assert.equal(describeShot(null).timing, 'No stroke');
  assert.equal(describeShot({ ...stroke, progress: .15 }).timing, 'Late');
  assert.equal(describeShot({ ...stroke, progress: .9 }).timing, 'Early');
  assert.equal(describeShot({ ...stroke, phase: 'recover' }).timing, 'Released early');
  assert.equal(describeShot(stroke).timing, 'Missed line');
  assert.equal(describeShot(stroke, { quality: .9, edge: false }).timing, 'Well timed');
  assert.equal(describeShot({ ...stroke, defending: true }, { quality: .5 }).timing, 'Soft hands');
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
