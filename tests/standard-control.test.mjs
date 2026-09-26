import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, DT, createDelivery, stepDelivery, batBasis } from '../dist/physics.js';
import {
  BAT_LIMITS, CONTACT_Z, STANDARD_STROKE, createBatControl, moveBatTarget, startStroke,
  releaseStroke, stepBat, strokeSnapshot, resetBatControl, setBatIntent, setBatMode, contactPreview,
} from '../dist/bat-control.js';

const advance = (control, seconds) => { for (let i = 0; i < Math.ceil(seconds / DT); i++) stepBat(control, DT); };

// The probe establishes a repeatable external player's aim and press time. The
// live controller receives only that aim and click; never the ball or trajectory.
const deliveries = new Map();
function play({ hand = 'right', intent = 'grounded', length = 'good', line = 'middle', speed = 140, error = 0, aimX = 0, aimY = 0, held = false, cancelled = false } = {}) {
  const key = JSON.stringify({ hand, length, line, speed });
  if (!deliveries.has(key)) {
    const config = { ...DEFAULTS, hand, length, line, speed }, probe = createDelivery(config, 42);
    while (probe.p.z < CONTACT_Z) stepDelivery(probe, config);
    deliveries.set(key, { config, probe });
  }
  const { config, probe } = deliveries.get(key), c = createBatControl(hand, 'standard');
  setBatIntent(c, intent);
  moveBatTarget(c, probe.p.x + aimX, probe.p.y + .035 + aimY);
  const d = createDelivery(config, 42);
  let started = false;
  while (d.time < probe.time + .3) {
    if (!started && d.time >= probe.time - STANDARD_STROKE.contactTime + error) {
      startStroke(c); if (!held || cancelled) releaseStroke(c, cancelled); started = true;
    }
    const old = stepBat(c, DT);
    stepDelivery(d, config, DT, c.pose, old);
    if (d.hit || d.resolved) break;
  }
  return { d, c, clean: d.hit && !d.contact.edge && d.contact.quality > .7 };
}

test('a Standard tap starts one complete stroke with the same motion and power as a held click', () => {
  const tap = createBatControl('right', 'standard'), hold = createBatControl('right', 'standard');
  for (const c of [tap, hold]) { moveBatTarget(c, .1, .8); advance(c, .2); startStroke(c); }
  releaseStroke(tap);
  assert.ok(tap.committed && !tap.held);
  for (let i = 0; i < 100; i++) {
    stepBat(tap, DT); stepBat(hold, DT);
    assert.deepEqual(tap.pose, hold.pose, 'button duration cannot change bat motion');
  }
  for (const intent of ['grounded', 'lofted']) {
    const a = play({ intent }), b = play({ intent, held: true });
    assert.ok(a.clean && b.clean); assert.equal(a.d.exitSpeed, b.d.exitSpeed);
    assert.ok(a.d.exitSpeed > 90, 'an ordinary click has useful attacking power');
  }
});

test('Standard aim follows early corrections after a tap, then stays locked through the stroke', () => {
  const c = createBatControl('right', 'standard'); startStroke(c); releaseStroke(c);
  advance(c, .025); moveBatTarget(c, .4, .9, { x: 10, y: -10 });
  assert.deepEqual(c.target, { x: .4, y: .9 });
  advance(c, .045); assert.equal(c.aimLocked, true);
  moveBatTarget(c, -.7, .5, { x: -10, y: 10 });
  assert.deepEqual(c.target, { x: .4, y: .9 });
  assert.deepEqual(c.direction, { x: 0, y: 1 }, 'pointer speed does not choose direction or power');
  advance(c, STANDARD_STROKE.duration);
  moveBatTarget(c, -.7, .5);
  assert.deepEqual(c.target, { x: -.7, y: .5 }, 'free aiming resumes after the finish');
});

test('holding or repeated presses cannot restart Standard, and its finish and recovery cannot hit', () => {
  const c = createBatControl('right', 'standard'); startStroke(c); advance(c, .08);
  const time = c.strokeTime; startStroke(c); assert.equal(c.strokeTime, time);
  advance(c, STANDARD_STROKE.duration);
  assert.equal(c.pose.active, false); assert.equal(c.phase, 'recover');
  startStroke(c); assert.ok(c.strokeTime > STANDARD_STROKE.duration);
  for (let i = 0; i < 190; i++) {
    const old = stepBat(c, DT), d = createDelivery(DEFAULTS, 42);
    d.p = { x: c.pose.x, y: c.pose.y, z: c.pose.z - .08 }; d.v = { x: 0, y: 0, z: 40 };
    stepDelivery(d, DEFAULTS, DT, c.pose, old); assert.equal(d.hit, false);
  }
  assert.equal(c.phase, 'guard'); assert.equal(c.pose.active, false);
  releaseStroke(c); assert.notEqual(c.phase, 'follow', 'releasing a finished hold must not resurrect it');
  startStroke(c); assert.equal(c.strokeTime, 0); assert.equal(c.phase, 'load');
});

test('Standard snapshots retain the attack and elapsed time after release and completed recovery', () => {
  const c = createBatControl('right', 'standard'); startStroke(c); releaseStroke(c); advance(c, 1.1);
  const s = strokeSnapshot(c);
  assert.equal(s.mode, 'standard'); assert.equal(s.committed, true); assert.equal(s.attempted, true);
  assert.equal(s.held, false); assert.equal(s.active, false); assert.equal(s.cancelled, false);
  assert.ok(s.elapsed >= 1.1 - DT); assert.equal(s.idealContactTime, .1);
  resetBatControl(c); assert.equal(strokeSnapshot(c).attempted, false); assert.equal(c.strokeTime, 0);
});

test('explicit cancellation, mode changes and intent changes immediately disarm a Standard attack', () => {
  for (const cancel of [c => releaseStroke(c, true), c => setBatMode(c, 'manual'), c => setBatIntent(c, 'lofted')]) {
    const c = createBatControl('right', 'standard'); startStroke(c); advance(c, .08); cancel(c);
    assert.equal(c.pose.active, false); assert.equal(c.cancelled, true);
    for (let i = 0; i < 80; i++) { stepBat(c, DT); assert.equal(c.pose.active, false); }
  }
  assert.equal(play({ cancelled: true }).d.hit, false);
});

test('Standard still requires a click and defence still requires a hold', () => {
  for (const intent of ['grounded', 'lofted', 'defend']) {
    const c = createBatControl('right', 'standard'); setBatIntent(c, intent); moveBatTarget(c, .1, .7); advance(c, .5);
    assert.equal(c.pose.active, false); assert.equal(c.attempted, false);
    startStroke(c, true); advance(c, .1);
    assert.equal(c.pose.active, true); assert.equal(c.pose.defending, true); assert.equal(c.committed, false);
    moveBatTarget(c, -.1, .6); assert.deepEqual(c.target, { x: -.1, y: .6 });
    releaseStroke(c); assert.equal(c.pose.active, false); advance(c, .1); assert.equal(c.pose.active, false);
  }
});

test('the same ordinary Standard click hits all lengths in both stances without changing bat dimensions', () => {
  for (const hand of ['left', 'right']) for (const intent of ['grounded', 'lofted']) for (const length of ['yorker', 'full', 'good', 'short']) {
    const { d } = play({ hand, intent, length });
    assert.ok(d.hit, `${hand}/${intent}/${length}`); assert.equal(d.contact.edge, false);
    assert.ok(d.contact.quality > (length === 'yorker' ? .3 : .7), `${hand}/${intent}/${length}: ${d.contact.quality}`);
  }
  assert.equal(play({ aimX: .6 }).d.hit, false, 'an aimed line miss stays a miss');
  assert.equal(play({ aimY: .7 }).d.hit, false, 'an aimed height miss stays a miss');
});

test('Standard timing leaves a useful clean-contact window for both intents and still rewards the middle', () => {
  for (const intent of ['grounded', 'lofted']) {
    const samples = [];
    for (let ms = -150; ms <= 150; ms += 5) samples.push({ ms, ...play({ intent, error: ms / 1000 }) });
    const clean = samples.filter(s => s.clean);
    assert.ok(clean.length >= 20, `${intent}: at least 95ms of clean contact in a 5ms sweep`);
    const centre = samples.find(s => s.ms === 0), early = samples.find(s => s.ms === -80), late = samples.find(s => s.ms === 50);
    assert.ok(centre.d.contact.quality > early.d.contact.quality + .1);
    assert.ok(centre.d.contact.quality > late.d.contact.quality + .1);
    assert.equal(samples.at(-1).d.hit, false, 'a sufficiently late stroke still misses');
  }
});

test('Grounded and Lofted Standard strokes deliver distinct physical launches', () => {
  const grounded = play().d, lofted = play({ intent: 'lofted' }).d;
  assert.ok(grounded.v.z < -20 && lofted.v.z < -15);
  assert.ok(grounded.v.y < 1); assert.ok(lofted.v.y > grounded.v.y + 15);
});

test('Standard remains playable across bowling speed and line without trajectory-aware control', () => {
  for (const speed of [100, 120, 140, 160]) for (const line of ['off', 'middle', 'leg']) {
    for (const intent of ['grounded', 'lofted']) {
      const { d } = play({ speed, line, intent });
      assert.ok(d.hit, `${speed}/${line}/${intent}`); assert.equal(d.contact.edge, false);
      assert.ok(d.contact.quality > .7, `${speed}/${line}/${intent}: ${d.contact.quality}`);
    }
  }
});

test('mode changes and reset preserve preferences and renderer references', () => {
  const c = createBatControl('right', 'standard'), { pose, target } = c;
  setBatIntent(c, 'lofted'); resetBatControl(c, 'left');
  assert.equal(c.mode, 'standard'); assert.equal(c.intent, 'lofted'); assert.equal(c.pose, pose); assert.equal(c.target, target);
  setBatMode(c, 'invalid'); assert.equal(c.mode, 'standard');
  setBatMode(c, 'manual'); resetBatControl(c); assert.equal(c.mode, 'manual');
  startStroke(c); advance(c, .5); assert.equal(c.progress, 0, 'Manual retains its swipe-driven control');
});

test('Standard stroke and contact preview keep blade corners above the pitch with either hand and trim', () => {
  for (const hand of ['left', 'right']) for (const intent of ['grounded', 'lofted', 'defend']) {
    const c = createBatControl(hand, 'standard'); setBatIntent(c, intent); moveBatTarget(c, 0, BAT_LIMITS.minY);
    startStroke(c);
    for (let i = 0; i < 120; i++) {
      stepBat(c, DT, new Set(['s', 'q', 'a']));
      for (const p of [c.pose, contactPreview(c)]) {
        const { u, w } = batBasis(p);
        assert.ok(p.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y) >= .068 - 1e-10);
      }
    }
  }
});

test('Standard poses mirror with stance and respect the existing motion bounds', () => {
  const right = createBatControl('right', 'standard'), left = createBatControl('left', 'standard');
  for (const c of [right, left]) { moveBatTarget(c, .4 * c.hand, .8); startStroke(c); releaseStroke(c); }
  for (let i = 0; i < 120; i++) {
    for (const c of [right, left]) {
      const old = stepBat(c, DT); assert.ok(c.speed <= BAT_LIMITS.speed + 1e-8);
      for (const axis of ['yaw', 'loft', 'roll']) assert.ok(Math.abs(c.pose[axis] - old[axis]) / DT <= BAT_LIMITS.angularSpeed + 1e-8);
    }
    for (const axis of ['x', 'yaw', 'roll', 'turn']) assert.ok(Math.abs(right.pose[axis] + left.pose[axis]) < 1e-10, axis);
    for (const axis of ['y', 'z', 'loft', 'weight']) assert.ok(Math.abs(right.pose[axis] - left.pose[axis]) < 1e-10, axis);
  }
});
