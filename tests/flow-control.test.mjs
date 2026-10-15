import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, DEFAULTS, batBasis, createDelivery, stepDelivery } from '../dist/physics.js';
import { createBatControl, moveBatTarget, stepBat, restartFlow, startStroke, releaseStroke, setBatIntent, setBatMode, resetBatTrim, strokeSnapshot, contactPreview } from '../dist/bat-control.js';
import { DIRECT_BAT, directTargetFromPlane, directSurfaceDepth } from '../dist/direct-bat.js';
import { BATTER_RIG, DIRECT_BATTING_VIEW, directGripPoints } from '../dist/batter-motion.js';
import { hand } from './flow-hand.mjs';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angular = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const setup = (point = { x: .25, y: .8 }, options) => { const c = createBatControl('right', 'flow'), h = hand(c, point, options); h.rest(1.5); return { c, h }; };

test('Flow owns a continuously physical blade; clicking never launches an animation', () => {
  const { c, h } = setup();
  assert.equal(c.engaged, true); assert.equal(c.acquiring, false); assert.equal(c.pose.active, true); assert.equal(c.pose.direct, true);
  const pose = { ...c.pose }; startStroke(c); releaseStroke(c); assert.deepEqual(c.pose, pose);
  h.still(1); assert.ok(distance(c.pose, pose) < .003); assert.ok(c.speed < .03);
  assert.equal(c.phase, 'direct'); assert.equal(c.committed, false);
  assert.deepEqual(contactPreview(c), c.pose, 'outline is the current physical blade');
});

test('half-backlift holds a full second, then lowers, lifts again, swings and checks', () => {
  const { c, h } = setup();
  h.to({ x: .35, y: 1.7 }, .3); h.still(.4); const held = { ...c.pose };
  h.still(1); assert.ok(distance(c.pose, held) < .006); assert.ok(angular(c.pose.roll, held.roll) < .04);
  h.to({ x: .25, y: 1.15 }, .3); h.still(.3); const lower = c.pose.y; assert.ok(lower < held.y - .25);
  h.to({ x: .35, y: 1.7 }, .3); h.still(.3); assert.ok(c.pose.y > lower + .25);
  h.to({ x: .1, y: .5 }, .2); h.still(.4); const checked = { ...c.pose };
  h.still(1); assert.ok(distance(c.pose, checked) < .008); assert.ok(angular(c.pose.roll, checked.roll) < .06);
  assert.equal(c.pose.active, true); assert.equal(c.committed, false); assert.equal(c.pose.strokeTime, 0);
  assert.ok(c.pose.y < lower - .4, 'no automatic follow-through or guard return');
});

test('the hand reverses the bat after traversing the hitting area', () => {
  const { c, h } = setup({ x: .2, y: 1.7 });
  h.to({ x: .2, y: .55 }, .2); const low = c.pose.y;
  h.to({ x: .2, y: 1.6 }, .2); h.still(.15); assert.ok(c.pose.y > low + .5);
  assert.equal(c.committed, false); assert.equal(c.pose.strokeTime, 0);
});

test('lifting the blade makes a visible backlift above reachable hands in both stances', () => {
  for (const stance of ['right', 'left']) {
    const c = createBatControl(stance, 'flow'), h = hand(c, { x: c.hand * .25, y: .8 });
    h.rest(1.5); h.to({ x: c.hand * .35, y: 1.7 }, .25);
    assert.ok(batBasis(c.pose).u.y < -.7, 'blade pivots above the grip during the lift');
    h.still(.5);
    const rig = directGripPoints(c.pose, c.hand);
    assert.ok(c.pose.y > 1.6); assert.ok(rig.centres.every(p => p.y < 1.5 && p.y > 1));
    assert.ok(rig.reachable); assert.ok(c.speed < .02);
  }
});

test('new input acquires safely and losing input freezes the held bat', () => {
  const c = createBatControl('right', 'flow'), h = hand(c, { x: -.5, y: 1.7 });
  h.rest(.02); assert.equal(c.acquiring, true); assert.equal(c.pose.active, false);
  h.rest(1.5); assert.equal(c.pose.active, true);
  restartFlow(c); const frozen = { ...c.pose }; h.still(1);
  assert.deepEqual(c.pose, { ...frozen, active: false, defending: false });
  h.to({ x: .3, y: .6 }, .03); assert.equal(c.pose.active, false);
  h.rest(1.5); assert.equal(c.pose.active, true);
  releaseStroke(c, true); assert.equal(c.engaged, false); assert.equal(c.pose.active, false);
});

test('real hand response is identical at all practice speeds', () => {
  const captures = [];
  for (const timeScale of [1, .75, .5]) {
    const { c, h } = setup(undefined, { timeScale }), poses = [];
    h.to({ x: .4, y: 1.7 }, .3); poses.push({ ...c.pose }); h.still(.2); poses.push({ ...c.pose });
    h.to({ x: -.2, y: .55 }, .3); poses.push({ ...c.pose });
    assert.equal(c.pose.motionTimeScale, timeScale); captures.push(poses);
  }
  for (const poses of captures) for (let i = 0; i < poses.length; i++) {
    assert.ok(distance(captures[0][i], poses[i]) < 1e-9);
    for (const axis of ['yaw', 'loft', 'roll']) assert.ok(angular(captures[0][i][axis], poses[i][axis]) < 1e-9);
  }
});

test('30 through 1000 Hz pointer streams reach the same held blade point', () => {
  const poses = [];
  for (const sampleRate of [30, 60, 120, 240, 1000]) {
    const { c, h } = setup(undefined, { sampleRate }); h.to({ x: .4, y: 1.7 }, .3); h.to({ x: -.2, y: .65 }, .3); h.still(1);
    assert.equal(c.pose.active, true); poses.push({ ...c.pose });
  }
  for (const pose of poses) assert.ok(distance(poses[0], pose) < .025);
});

test('rigid blade, both hand reaches, floor and rotation remain bounded through repeated cycles', () => {
  for (const stance of ['right', 'left']) {
    const c = createBatControl(stance, 'flow'), h = hand(c); h.rest(1.5); let maxSpeed = 0;
    h.move(2, t => ({ x: .8 * Math.sin(t * 5), y: 1.2 + .8 * Math.sin(t * 7) }), old => {
      const rig = directGripPoints(c.pose, c.hand), { u, w } = batBasis(c.pose);
      assert.ok(rig.maxReach <= BATTER_RIG.reach + .001, `reach ${rig.maxReach}`);
      assert.ok(c.pose.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y) >= DIRECT_BAT.floor - .001);
      assert.ok(Math.abs(Math.hypot(u.x, u.y, u.z) - 1) < 1e-9);
      maxSpeed = Math.max(maxSpeed, c.speed);
      for (const axis of ['yaw', 'loft', 'roll']) assert.ok(Math.abs(c.pose[axis] - old[axis]) < .6, 'unwrapped angles');
    });
    assert.ok(maxSpeed < 25, `speed ${maxSpeed}`);
  }
});

test('the two stances mirror their physical movement', () => {
  const right = createBatControl('right', 'flow'), left = createBatControl('left', 'flow');
  const hr = hand(right, { x: .25, y: .8 }), hl = hand(left, { x: -.25, y: .8 }); hr.rest(1.5); hl.rest(1.5);
  for (const point of [{ x: .35, y: 1.7 }, { x: -.3, y: .6 }, { x: .25, y: .8 }]) {
    hr.to(point, .3); hl.to({ x: -point.x, y: point.y }, .3); hr.still(.5); hl.still(.5);
    assert.ok(Math.abs(right.pose.x + left.pose.x) < .025); assert.ok(Math.abs(right.pose.y - left.pose.y) < .025); assert.ok(Math.abs(right.pose.z - left.pose.z) < .025);
  }
});

test('curved surface depth preserves pointer projection without delivery information', () => {
  const eye = DIRECT_BATTING_VIEW.eye;
  for (const x of [-.8, 0, .8]) for (const y of [.35, .8, 1.3, 2.1]) {
    const p = directTargetFromPlane(x, y), k = (-.22 - eye.z) / (p.z - eye.z);
    assert.ok(Math.abs(eye.x + (p.x - eye.x) * k - x) < 1e-8); assert.ok(Math.abs(eye.y + (p.y - eye.y) * k - y) < 1e-8);
    assert.ok(Math.abs(p.z - directSurfaceDepth(p.y)) < 1e-7);
  }
});

test('intent and fine face controls remain continuous on an engaged blade', () => {
  const { c, h } = setup(), old = { ...c.pose }; setBatIntent(c, 'lofted'); stepBat(c, DT);
  assert.equal(c.engaged, true); assert.ok(angular(c.pose.loft, old.loft) < .04);
  h.setKeys(new Set(['a', 'w', 'e'])); h.still(.3); h.setKeys(new Set()); const trimmed = { ...c.pose }; resetBatTrim(c); stepBat(c, DT);
  for (const axis of ['yaw', 'loft', 'roll']) assert.ok(angular(c.pose[axis], trimmed[axis]) < .06);
  h.still(1); assert.ok(directGripPoints(c.pose, c.hand).maxReach <= BATTER_RIG.reach + .001);
  setBatIntent(c, 'defend'); h.still(.1); assert.equal(c.pose.defending, true);
  setBatIntent(c, 'grounded'); startStroke(c, true); h.still(.1); assert.equal(c.pose.defending, true);
  releaseStroke(c); h.still(.1); assert.equal(c.pose.defending, false); assert.equal(c.pose.active, true);
});

test('a held physical guard meets the ball and a withdrawn held blade leaves', () => {
  const play = point => { const { c } = setup(point), d = createDelivery(DEFAULTS, 42);
    for (let i = 0; i < 500 && !d.resolved; i++) { const old = stepBat(c, DT); stepDelivery(d, DEFAULTS, DT, c.pose, old); } return { c, d }; };
  const guard = play({ x: .4, y: .6 }), leave = play({ x: .1, y: 2.3 });
  assert.equal(guard.d.hit, true, 'contact requires neither click nor swing event');
  assert.equal(leave.d.hit, false); assert.equal(leave.c.exposed, false); assert.equal(leave.c.pose.active, true); assert.equal(strokeSnapshot(leave.c).moving, false);
});

test('changing modes restores Standard and Manual ownership', () => {
  const { c } = setup(); setBatMode(c, 'standard'); assert.equal(c.pose.direct, false); assert.equal(c.engaged, false);
  moveBatTarget(c, 0, .8); stepBat(c, DT); assert.equal(c.pose.active, false); startStroke(c); for (let i = 0; i < 28; i++) stepBat(c, DT); assert.equal(c.committed, true);
  setBatMode(c, 'manual'); assert.equal(c.mode, 'manual'); assert.equal(c.pose.direct, false);
});

test('a checked backlift brakes promptly, and a tiny correction cannot release a hidden finish', () => {
  const { c, h } = setup(); h.to({ x: .35, y: 1.7 }, .25);
  const stopped = batBasis(c.pose).u; let maximum = 0;
  h.still(.6, () => { const u = batBasis(c.pose).u; maximum = Math.max(maximum, Math.acos(Math.max(-1, Math.min(1, stopped.x * u.x + stopped.y * u.y + stopped.z * u.z)))); });
  assert.ok(maximum < .36, `only a small physical settling rotation remains: ${maximum}rad`);
  assert.ok(c.speed < .04); h.still(.8);
  const held = { ...c.pose }; moveBatTarget(c, .3502, 1.7);
  for (let i = 0; i < 240; i++) stepBat(c, DT);
  assert.ok(distance(c.pose, held) < .0015, 'a0.2mm correction stays a small correction');
  h.to({ x: .1, y: .6 }, .25); assert.ok(c.pose.y < held.y - .5, 'a larger movement resumes control immediately');
});

test('the face frame stays continuous when the shaft crosses a front-facing singularity', () => {
  const { c, h } = setup({ x: .12, y: .45 }); let maximum = 0;
  const inspect = old => { const a = batBasis(old).n, b = batBasis(c.pose).n; maximum = Math.max(maximum, Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)))); };
  h.to({ x: .12, y: 2.3 }, 1, inspect); h.to({ x: .12, y: .45 }, 1, inspect);
  assert.ok(maximum < .08, `no instantaneous face flip: ${maximum}rad per240Hz tick`);
});
