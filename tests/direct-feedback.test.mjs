import test from 'node:test';
import assert from 'node:assert/strict';
import { describeShot, isSwing, isPlayingShot, isControlled, missTitle } from '../dist/shot-feedback.js';
import { createBatControl, moveBatTarget, restartFlow, setBatIntent, stepBat, strokeSnapshot } from '../dist/bat-control.js';
import { DT, batBasis } from '../dist/physics.js';

// Recorded physical state at the ball's arrival. Flow has no timed stroke,
// button requirement or commitment event, even when the blade makes contact.
const blade = (overrides = {}) => ({
  mode: 'flow', engaged: true, acquiring: false, active: true, exposed: true,
  moving: true, defending: false, batSpeed: 6, backlift: 0,
  attempted: false, held: false, committed: false, ...overrides,
});

test('a moving exposed Flow blade is a shot without a press or committed gesture', () => {
  const stroke = blade();
  assert.equal(isSwing(stroke), true);
  assert.equal(isPlayingShot(stroke), true);
  assert.equal(missTitle({ stroke }, 'Missed'), 'Played & missed');
  assert.equal(isControlled({ stroke }, 'Missed'), false);
  assert.equal(describeShot(stroke).timing, 'Missed');
  assert.equal(describeShot(stroke, { quality: .9, edge: false }).timing, 'Middle of the bat');
});

test('a stationary exposed blade blocks without requiring a button', () => {
  for (const defending of [false, true]) {
    const stroke = blade({ moving: false, batSpeed: 0, defending });
    assert.equal(isSwing(stroke), false);
    assert.equal(isPlayingShot(stroke), true);
    assert.equal(missTitle({ stroke }, 'Missed'), 'Played & missed');
    assert.equal(isControlled({ stroke }, 'Missed'), false);
    assert.equal(describeShot(stroke).timing, 'Beaten');
    assert.equal(describeShot(stroke, { quality: .9, edge: false }).timing, defending ? 'Soft hands' : 'Held bat');
    assert.equal(isControlled({ stroke, hit: true }, 'Bat contact'), true);
  }
});

test('withdrawing the Flow blade leaves even after earlier motion on the delivery', () => {
  const stroke = blade({ exposed: false, attempted: true, committed: true, held: true });
  assert.equal(isSwing(stroke), false);
  assert.equal(isPlayingShot(stroke), false);
  assert.equal(missTitle({ stroke }, 'Missed'), 'Left alone');
  assert.equal(isControlled({ stroke }, 'Missed'), true);
  assert.equal(describeShot(stroke).timing, 'Left');
  const bowled = describeShot(stroke, null, true);
  assert.equal(bowled.timing, 'Left');
  assert.notEqual(bowled.detail, describeShot(stroke).detail);
  for (const result of ['Bowled', 'LBW']) {
    assert.equal(missTitle({ stroke }, result), result);
    assert.equal(isControlled({ stroke }, result), false);
    assert.equal(isControlled({ stroke, hit: true }, result), false);
  }
});

test('lost input and a blade still acquiring position cannot count as played misses', () => {
  for (const state of [{ engaged: false }, { acquiring: true }, { active: false }]) {
    const stroke = blade({ ...state, attempted: true, defending: true });
    assert.equal(isPlayingShot(stroke), false);
    assert.equal(isSwing(stroke), false);
    assert.equal(describeShot(stroke).timing, 'Left');
    assert.equal(missTitle({ stroke }, 'Missed'), 'Left alone');
  }
});

test('Flow contact and miss advice uses the blade and geometry, never a scripted timing window', () => {
  const stroke = blade(), contact = { quality: .9, edge: false };
  for (const elapsed of [0, .02, .1, .4, 10]) {
    const oldTiming = { ...stroke, elapsed, idealContactTime: .1, progress: elapsed, phase: 'recover' };
    assert.deepEqual(describeShot(oldTiming, contact), describeShot(stroke, contact));
    assert.deepEqual(describeShot(oldTiming), describeShot(stroke));
  }
  assert.equal(describeShot(stroke, { quality: .5, edge: true }).timing, 'Edge');
  assert.equal(describeShot(stroke, { quality: .5, edge: false }).timing, 'Bat contact');
  assert.equal(describeShot(stroke, null, false, { x: .3, y: 0 }).timing, 'Wrong line');
  assert.equal(describeShot(stroke, null, false, { x: 0, y: .6 }).timing, 'Wrong height');
  assert.equal(describeShot(stroke, null, false, { x: .3, y: .6 }).timing, 'Wrong line & height');
});

test('actual contact remains contact even when a withdrawn blade catches an unusual delivery', () => {
  const stroke = blade({ exposed: false }), contact = { quality: .9, edge: false };
  assert.equal(describeShot(stroke, contact).timing, 'Middle of the bat');
  assert.equal(isControlled({ stroke, hit: true }, 'Bat contact'), true);
});

test('later hand movement cannot alter feedback recorded when the ball passed', () => {
  const live = blade(), stroke = { ...live }, delivery = { stroke };
  Object.assign(live, { exposed: false, moving: false, engaged: false });
  assert.equal(isPlayingShot(live), false);
  assert.equal(missTitle(delivery, 'Missed'), 'Played & missed');
  assert.equal(describeShot(stroke).timing, 'Missed');
  const left = { ...live };
  Object.assign(live, { exposed: true, moving: true, engaged: true });
  assert.equal(missTitle({ stroke: left }, 'Missed'), 'Left alone');
});

test('real continuous controller snapshots distinguish a held blade, soft grip and withdrawn bat', () => {
  const control = createBatControl('right', 'flow');
  moveBatTarget(control, 0, .8);
  for (let i = 0; i < 500; i++) stepBat(control, DT);
  const held = strokeSnapshot(control);
  assert.equal(held.moving, false);
  assert.equal(held.attempted, false);
  assert.equal(isPlayingShot(held), true, 'a physical stationary blade needs no attempted gesture');
  assert.equal(describeShot(held, { quality: .9, edge: false }).timing, 'Held bat');
  setBatIntent(control, 'defend'); stepBat(control, DT);
  const soft = strokeSnapshot(control);
  assert.equal(soft.defending, control.pose.defending);
  assert.equal(describeShot(soft, { quality: .9, edge: false }).timing, 'Soft hands');
  // Lift with a continuous hand path. Jumping the cursor from guard directly
  // overhead can brace the wrists while the physical blade is still low.
  for (let i = 1; i <= 120; i++) {
    moveBatTarget(control, 1.15 * i / 120, .8 + 1.5 * i / 120);
    stepBat(control, DT);
  }
  for (let i = 0; i < 500; i++) stepBat(control, DT);
  const withdrawn = strokeSnapshot(control);
  const { u, w } = batBasis(control.pose);
  assert.ok(control.pose.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y) > 1.65,
    'the physical blade clears the batting corridor');
  assert.equal(withdrawn.active, true, 'withdrawn blade stays physically present');
  assert.equal(isPlayingShot(withdrawn), false);
  assert.equal(describeShot(withdrawn).timing, 'Left');
  assert.equal(missTitle({ stroke: held }, 'Missed'), 'Played & missed', 'later withdrawal cannot rewrite a recorded block');
  restartFlow(control);
  assert.equal(isPlayingShot(strokeSnapshot(control)), false);
});
