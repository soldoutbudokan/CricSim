import test from 'node:test';
import assert from 'node:assert/strict';
import { DT, batBasis } from '../dist/physics.js';
import {
  BAT_LIMITS, CONTACT_Z, STANDARD_STROKE, SWING_TRIGGERS, FLOW, createBatControl, moveBatTarget, startStroke,
  releaseStroke, stepBat, strokeSnapshot, resetBatControl, setBatIntent, setBatMode, setSwingTrigger, restartFlow, contactPreview, shotName,
} from '../dist/bat-control.js';
import { describeShot, isSwing, isPlayingShot, isControlled, missTitle } from '../dist/shot-feedback.js';

import { RATE, FRAME, UP, hand, strokes, play } from './flow-hand.mjs';

test('a decisive push starts one complete stroke without any press, then returns to guard', () => {
  const c = createBatControl('right', 'flow'), h = hand(c), count = strokes(c);
  h.rest(.5, undefined, count.step);
  assert.equal(c.attempted, false); assert.equal(c.phase, 'guard');
  let crossings = 0, lastZ = c.pose.z;
  h.push(UP, 6, .45, () => { count.step(); if (lastZ > CONTACT_Z && c.pose.z <= CONTACT_Z) crossings++; lastZ = c.pose.z; });
  assert.ok(c.attempted && c.committed && !c.held, 'the push committed an attack with no button');
  h.rest(1.2, { x: 0, y: .45 }, () => { count.step(); if (lastZ > CONTACT_Z && c.pose.z <= CONTACT_Z) crossings++; lastZ = c.pose.z; });
  assert.equal(count.count(), 1); assert.equal(crossings, 1, 'the blade passes through the contact plane once');
  assert.equal(c.phase, 'guard'); assert.equal(c.pose.active, false); assert.equal(c.armed, true);
});

test('a vertical push plays the Standard stroke: same motion, same power', () => {
  const flow = createBatControl('right', 'flow'), standard = createBatControl('right', 'standard');
  const h = hand(flow, { x: .1, y: .8 }); moveBatTarget(standard, .1, .8);
  h.rest(1.5); for (let i = 0; i < 360; i++) stepBat(standard, DT);
  for (const axis of ['x', 'y', 'z', 'yaw', 'loft', 'roll']) assert.ok(Math.abs(flow.pose[axis] - standard.pose[axis]) < 1e-6, axis);
  // The Standard click happens at the frame where the push is noticed, with the
  // same (back-dated) stroke time; from there both bats step in lockstep.
  let synced = false, steps = 0;
  const sync = () => { if (flow.committed && !synced) { synced = true; assert.ok(flow.strokeTime <= FLOW.backdate + 1e-9); assert.deepEqual(flow.target, standard.target, 'the aim is the rest point'); startStroke(standard); releaseStroke(standard); standard.strokeTime = flow.strokeTime; } };
  const compare = () => {
    // Once the stroke is over, free aiming resumes from where the hand is, so only the stroke itself is compared.
    if (!synced || flow.phase === 'recover') return; stepBat(standard, DT); steps++;
    for (const axis of ['x', 'y', 'z', 'yaw', 'loft', 'roll', 'weight', 'turn']) assert.ok(Math.abs(flow.pose[axis] - standard.pose[axis]) < 1e-6, `${axis} at step ${steps}`);
    assert.equal(flow.pose.active, standard.pose.active); assert.equal(flow.progress, standard.progress);
  };
  h.push(UP, 6, .12, compare, sync); h.rest(.5, undefined, compare, sync);
  assert.ok(synced && steps >= 70, `compared ${steps} steps`); assert.deepEqual(flow.direction, UP);
  for (const intent of ['grounded', 'lofted']) {
    const { d, clean } = play({ intent });
    assert.ok(clean, intent); assert.ok(d.exitSpeed > 90, `${intent}: an ordinary push has useful attacking power (${d.exitSpeed})`);
  }
});

test('slow aiming and quick small corrections never swing', () => {
  const c = createBatControl('right', 'flow'), h = hand(c);
  // Sweep the whole crease slowly, both ways, with the aim following the hand.
  h.move(3, t => ({ x: .6 * Math.sin(t * 1.5), y: .25 * Math.sin(t * .9) }));
  assert.equal(c.attempted, false); assert.equal(c.phase, 'guard');
  assert.ok(Math.abs(c.target.x - (.1 + .6 * Math.sin(3 * 1.5) * 1.5)) < 1e-9, 'the aim follows the hand at once');
  // Quick height corrections shorter than the trigger distance, at the trigger speed.
  for (let i = 0; i < 6; i++) { const dir = i % 2 ? -1 : 1; h.push({ x: 0, y: dir }, 3, .05); h.rest(.15); }
  // A brisk but not decisive upward move, and a fast crease-wide one.
  h.push(UP, 2, .4); h.rest(.3); h.push({ x: 1, y: 0 }, 7, .6); h.rest(.3);
  assert.equal(c.attempted, false); assert.equal(c.phase, 'guard');
});

test('the aim is where the hand rested before the push, and stays locked until the stroke is over', () => {
  const c = createBatControl('right', 'flow'), h = hand(c, { x: .3, y: .7 });
  h.rest(.4);
  h.push(UP, 8, .5);
  assert.deepEqual(c.target, { x: .3, y: .7 }, 'the aim is the rest point, not where the push was noticed');
  assert.deepEqual(c.origin, { x: 0, y: 0 });
  h.move(.15, () => ({ x: .3, y: .5 }));
  assert.deepEqual(c.target, { x: .3, y: .7 }, 'a moving hand cannot move a stroke in flight');
  h.rest(1.2, { x: .3, y: .5 });
  assert.equal(c.phase, 'guard');
  assert.deepEqual(c.target, { x: .3 + .45, y: .7 + .75 }, 'free aiming resumes after the finish');
});

test('the tail of a push cannot swing again; the hand must rest first', () => {
  const c = createBatControl('right', 'flow'), h = hand(c), count = strokes(c);
  h.rest(.4, undefined, count.step);
  // A long push that keeps going well after the stroke has started and finished.
  h.move(.6, t => ({ x: 0, y: 7 * t }), count.step);
  assert.equal(count.count(), 1);
  h.rest(.9, { x: 0, y: 4.2 }, count.step);
  assert.equal(count.count(), 1);
  h.push(UP, 6, .3, count.step); h.rest(.9, { x: 0, y: 4.5 }, count.step);
  assert.equal(count.count(), 2, 'a new push after a rest swings again');
});

test('a click still plays the stroke in Flow, at the rest point when it lands mid-push; blocks stay held', () => {
  const flow = createBatControl('right', 'flow'), standard = createBatControl('right', 'standard');
  const h = hand(flow, { x: .1, y: .8 }); moveBatTarget(standard, .1, .8);
  h.rest(1.5); for (let i = 0; i < 360; i++) stepBat(standard, DT);
  for (const c of [flow, standard]) { startStroke(c); releaseStroke(c); }
  assert.ok(flow.committed && !flow.held && flow.armed === false);
  for (let i = 0; i < 76; i++) {
    stepBat(flow, DT); stepBat(standard, DT);
    for (const axis of ['x', 'y', 'z', 'yaw', 'loft', 'roll']) assert.ok(Math.abs(flow.pose[axis] - standard.pose[axis]) < 1e-6, `${axis} at step ${i}`);
    assert.equal(flow.pose.active, standard.pose.active);
  }
  h.rest(1.2, { x: 0, y: 0 });
  // A gentle push (not a swing yet) with a click in the middle of it aims where the hand rested.
  h.move(.06, t => ({ x: 0, y: 1.5 * (t - h.time) }));
  const t0 = h.time; h.move(.05, t => ({ x: 0, y: 1.5 * (t - t0) }));
  assert.ok(flow.pointerSpeed >= FLOW.restSpeed && !['swing', 'follow'].includes(flow.phase), `speed ${flow.pointerSpeed} phase ${flow.phase}`);
  startStroke(flow); releaseStroke(flow);
  // The synthetic push has no run-up, so its first samples read as slow; a real hand accelerates and drifts less.
  assert.ok(Math.abs(flow.target.x - .1) < 1e-9 && Math.abs(flow.target.y - .8) < .05, `the click swings near the rest point, not at the moving pointer (${flow.target.y})`);
  h.rest(1.2);
  const c = createBatControl('right', 'flow'), hb = hand(c);
  hb.rest(.3);
  for (const via of ['button', 'intent']) {
    if (via === 'intent') setBatIntent(c, 'defend');
    startStroke(c, via === 'button' ? true : undefined); hb.rest(.1);
    assert.equal(c.defending, true); assert.equal(c.pose.active, true); assert.equal(c.committed, false);
    hb.move(.2, () => ({ x: .2, y: -.1 }));
    assert.deepEqual(c.target, { x: .1 + .3, y: .8 - .15 }, 'a block moves onto the line');
    hb.push(UP, 8, .5); assert.equal(c.committed, false, 'a fast hand cannot turn a block into a swing');
    releaseStroke(c); hb.rest(.05); assert.equal(c.pose.active, false); assert.equal(c.defending, false);
    hb.rest(.8);
  }
  setBatIntent(c, 'grounded');
  hb.rest(.3); hb.push(UP, 6, .3); assert.equal(c.committed, true, 'attacking resumes');
});

test('only a push within sixty degrees of straight up swings; sideways and downward moves aim', () => {
  const swings = direction => { const c = createBatControl('right', 'flow'), h = hand(c); h.rest(.3); h.push(direction, 6, .4); return c.committed; };
  assert.equal(swings(UP), true); assert.equal(swings({ x: .7071, y: .7071 }), true); assert.equal(swings({ x: -.7071, y: .7071 }), true);
  assert.equal(swings({ x: 1, y: 0 }), false); assert.equal(swings({ x: -1, y: 0 }), false);
  assert.equal(swings({ x: .9, y: .436 }), false, 'past the cone'); assert.equal(swings({ x: 0, y: -1 }), false); assert.equal(swings({ x: .5, y: -.866 }), false);
  const c = createBatControl('right', 'flow'), h = hand(c); h.rest(.3);
  // A fast crease-wide line correction, then the drive it set up.
  h.push({ x: 1, y: 0 }, 7, .6); h.rest(.1); h.push({ x: -1, y: 0 }, 7, .6); h.rest(.1);
  assert.equal(c.attempted, false); assert.equal(c.phase, 'guard');
  assert.ok(Math.abs(c.target.x - .1) < 1e-9, 'the aim followed the correction');
  h.push(UP, 6, .3); assert.equal(c.committed, true);
});

test('a still mouse sends nothing: the hand rests through a silence and the push is anchored where it stopped', () => {
  const c = createBatControl('right', 'flow'), h = hand(c, { x: .3, y: .7 }), count = strokes(c);
  h.move(.4, t => ({ x: .5 * t, y: 0 }), count.step);
  h.still(.3, count.step);
  assert.equal(count.count(), 0);
  let dated = null;
  h.push(UP, 6, .45, count.step, () => { if (c.committed && dated === null) dated = c.strokeTime; });
  assert.equal(count.count(), 1, 'a push after a silence swings');
  assert.ok(Math.abs(c.target.x - (.3 + .2 * 1.5)) < 1e-9 && Math.abs(c.target.y - .7) < 1e-9, `the aim is exactly where the hand went quiet (${c.target.x}, ${c.target.y})`);
  assert.ok(dated > 0 && dated <= FLOW.backdate + 1e-9, `the stroke is dated a little before the first sample of the push (${dated})`);
  h.still(.3, count.step); h.push(UP, 6, .45, count.step); h.still(.9, count.step);
  assert.equal(count.count(), 2, 'a second push after a silence swings again without any slow samples in between');
  // A hand that arrives after a silence and keeps moving fast is a push, not a teleport.
  const d = createBatControl('right', 'flow'), hd = hand(d, { x: 0, y: .8 }), countD = strokes(d);
  hd.rest(.3, undefined, countD.step); hd.still(.5, countD.step);
  const t0 = hd.time; hd.move(.03, t => ({ x: 0, y: 6 * (t - t0) }), countD.step);
  assert.equal(countD.count(), 1);
});

test('after a restart the hand must be seen resting before it may swing', () => {
  const c = createBatControl('right', 'flow'), h = hand(c);
  // A pointer arriving on the canvas at speed, straight up, is not a push.
  restartFlow(c); assert.equal(c.armed, false);
  h.move(.1, t => ({ x: 0, y: 6 * t }));
  assert.equal(c.committed, false);
  h.rest(.1); h.push(UP, 6, .4); assert.equal(c.committed, true, 'once it has rested it may swing');
  // A new touch that swipes at once, without holding, does not swing; holding first does.
  const d = createBatControl('right', 'flow'), hd = hand(d);
  hd.rest(.3); restartFlow(d); hd.push(UP, 6, .4); assert.equal(d.committed, false);
  hd.still(.2); hd.push(UP, 6, .4); assert.equal(d.committed, true);
});

test('an upward move that is not quite a push leaves a hint, which a real push clears', () => {
  const c = createBatControl('right', 'flow'), h = hand(c);
  h.rest(.3); assert.equal(c.softPushAt, -Infinity);
  h.push(UP, 1.6, .12); assert.ok(Number.isFinite(c.softPushAt) && c.softPushAt <= c.clock); assert.equal(c.committed, false);
  const hinted = c.softPushAt; h.rest(.3); assert.equal(c.softPushAt, hinted, 'the hint outlives the move');
  h.push({ x: 1, y: 0 }, 1.6, .12); assert.equal(c.softPushAt, hinted, 'sideways moves do not hint');
  h.rest(.3); h.push(UP, 6, .4); assert.equal(c.committed, true); assert.equal(c.softPushAt, -Infinity);
});

test('the swing trigger setting orders how decisive a push must be', () => {
  const swings = (trigger, speed, length) => { const c = createBatControl('right', 'flow'); setSwingTrigger(c, trigger); const h = hand(c); h.rest(.3); h.push({ x: 0, y: 1 }, speed, length); return c.committed; };
  assert.equal(swings('light', 2.3, .3), true); assert.equal(swings('normal', 2.3, .3), false); assert.equal(swings('firm', 2.3, .3), false);
  assert.equal(swings('normal', 3, .3), true); assert.equal(swings('firm', 3, .3), false); assert.equal(swings('firm', 4.5, .3), true);
  assert.equal(swings('normal', 6, .05), false, 'a fast but tiny move is not a push');
  const c = createBatControl('right', 'flow'); setSwingTrigger(c, 'nonsense'); assert.equal(c.trigger, 'normal');
  setSwingTrigger(c, 'firm'); resetBatControl(c, 'left'); assert.equal(c.trigger, 'firm'); assert.equal(c.mode, 'flow');
});

test('Flow keeps the Standard timing window and still rewards the middle', () => {
  for (const intent of ['grounded', 'lofted']) {
    const samples = [];
    for (let ms = -150; ms <= 150; ms += 5) samples.push({ ms, ...play({ intent, error: ms / 1000 }) });
    const clean = samples.filter(s => s.clean);
    assert.ok(clean.length >= 20, `${intent}: at least 95ms of clean contact in a 5ms sweep (${clean.length})`);
    // The best moment sits within a frame or two of the ideal; quality falls away either side of it.
    const quality = s => s.d.contact?.quality ?? 0, best = samples.reduce((a, b) => quality(b) > quality(a) ? b : a);
    assert.ok(Math.abs(best.ms) <= 60, `${intent}: best push at ${best.ms} ms`);
    const early = samples.find(s => s.ms === best.ms - 80), late = samples.find(s => s.ms === best.ms + 50);
    assert.ok(quality(best) > quality(early) + .1, `${intent}: ${quality(best)} vs early ${quality(early)}`);
    assert.ok(quality(best) > quality(late) + .05, `${intent}: ${quality(best)} vs late ${quality(late)}`);
    assert.equal(samples.at(-1).d.hit, false, 'a sufficiently late push still misses');
  }
  assert.equal(play({ aimX: .6 }).d.hit, false, 'an aimed line miss stays a miss');
  assert.equal(play({ aimY: .7 }).d.hit, false, 'an aimed height miss stays a miss');
});

test('the same push hits every length, speed and line in both stances', () => {
  for (const stance of ['left', 'right']) for (const intent of ['grounded', 'lofted']) for (const length of ['yorker', 'full', 'good', 'short']) {
    const { d } = play({ hand: stance, intent, length });
    assert.ok(d.hit, `${stance}/${intent}/${length}`); assert.equal(d.contact.edge, false);
    assert.ok(d.contact.quality > (length === 'yorker' ? .25 : .7), `${stance}/${intent}/${length}: ${d.contact.quality}`);
  }
  for (const speed of [100, 120, 140, 160]) for (const line of ['off', 'middle', 'leg']) {
    const { d } = play({ speed, line });
    assert.ok(d.hit, `${speed}/${line}`); assert.ok(d.contact.quality > .7, `${speed}/${line}: ${d.contact.quality}`);
  }
});

test('the push is read in real time, so slow-motion practice needs the same hand movement', () => {
  for (const timeScale of [1, .5]) {
    const c = createBatControl('right', 'flow'), h = hand(c, undefined, { timeScale }), count = strokes(c);
    h.rest(.4, undefined, count.step);
    h.push({ x: 1, y: 0 }, 2.5, .6, count.step); h.rest(.3, { x: .6, y: 0 }, count.step);
    assert.equal(count.count(), 0, `${timeScale}x: a brisk re-aim is not a push`);
    h.push(UP, 6, .45, count.step); h.rest(1.5, { x: .6, y: .45 }, count.step);
    assert.equal(count.count(), 1, `${timeScale}x: one push, one stroke`);
    const { clean } = play({ timeScale });
    assert.ok(clean, `${timeScale}x: the push still meets the ball cleanly`);
    const d = createBatControl('right', 'flow'), hd = hand(d, undefined, { timeScale }); hd.rest(.3);
    let dated = null; hd.push(UP, 6, .3, null, () => { if (d.committed && dated === null) dated = d.strokeTime; });
    assert.ok(dated !== null && dated <= FLOW.backdate * timeScale + 1e-9, `${timeScale}x: the push is dated in stroke time (${dated})`);
  }
});

test('cancellation, mode and intent changes disarm a Flow stroke and forget the hand', () => {
  for (const cancel of [c => releaseStroke(c, true), c => setBatMode(c, 'standard'), c => setBatIntent(c, 'lofted')]) {
    const c = createBatControl('right', 'flow'), h = hand(c); h.rest(.3); h.push(UP, 6, .2);
    assert.equal(c.committed, true); cancel(c);
    assert.equal(c.pose.active, false); assert.equal(c.cancelled, true); assert.equal(c.samples.length, 0);
    for (let i = 0; i < 80; i++) { stepBat(c, DT); assert.equal(c.pose.active, false); }
  }
  // A pause in the middle of a push: the resumed hand's first samples cannot read as a push.
  const c = createBatControl('right', 'flow'), h = hand(c); h.rest(.3);
  h.move(.012, t => ({ x: 0, y: 6 * (t - .3) })); assert.equal(c.committed, false);
  releaseStroke(c, true);
  h.move(.02, () => ({ x: .5, y: .5 }), null); h.rest(.3, { x: .5, y: .5 });
  assert.equal(c.attempted, false);
});

test('Flow poses mirror with stance, respect the motion bounds and keep the blade above the pitch', () => {
  for (const direction of [UP, { x: .6, y: .8 }]) {
    const right = createBatControl('right', 'flow'), left = createBatControl('left', 'flow');
    const hands = [hand(right, { x: .4, y: .8 }), hand(left, { x: -.4, y: .8 })];
    for (const h of hands) h.rest(.5);
    hands[0].push(direction, 6, .1); hands[1].push({ x: -direction.x, y: direction.y }, 6, .1);
    assert.ok(right.committed && left.committed);
    for (let i = 0; i < 120; i++) {
      for (const c of [right, left]) {
        const old = stepBat(c, DT); assert.ok(c.speed <= BAT_LIMITS.speed + 1e-8);
        for (const axis of ['yaw', 'loft', 'roll']) assert.ok(Math.abs(c.pose[axis] - old[axis]) / DT <= BAT_LIMITS.angularSpeed + 1e-8);
      }
      for (const axis of ['x', 'yaw', 'roll', 'turn']) assert.ok(Math.abs(right.pose[axis] + left.pose[axis]) < 1e-10, axis);
      for (const axis of ['y', 'z', 'loft', 'weight']) assert.ok(Math.abs(right.pose[axis] - left.pose[axis]) < 1e-10, axis);
    }
  }
  for (const stance of ['left', 'right']) for (const direction of [UP, { x: .5, y: .866 }]) {
    const c = createBatControl(stance, 'flow'), h = hand(c, { x: 0, y: BAT_LIMITS.minY }); h.setKeys(new Set(['s', 'q', 'a']));
    h.rest(.3); h.push(direction, 6, .3, () => {
      for (const p of [c.pose, contactPreview(c)]) { const { u, w } = batBasis(p); assert.ok(p.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y) >= .068 - 1e-10); }
    });
  }
});

test('feedback treats a Flow push like a Standard click', () => {
  const c = createBatControl('right', 'flow'), h = hand(c); h.rest(.3); h.push(UP, 6, .3);
  h.move(1.1, () => ({ x: 0, y: .3 }));
  const s = strokeSnapshot(c);
  assert.equal(s.mode, 'flow'); assert.equal(s.committed, true); assert.equal(s.held, false); assert.equal(s.attempted, true);
  assert.equal(isSwing(s), true); assert.equal(isPlayingShot(s), true);
  assert.equal(missTitle({ stroke: s }, 'Missed'), 'Played & missed'); assert.equal(isControlled({ stroke: s }, 'Missed'), false);
  assert.equal(describeShot(s).timing, 'Early'); assert.match(describeShot(s).detail, /Push a little later/);
  assert.equal(describeShot({ ...s, elapsed: .02 }).timing, 'Late'); assert.match(describeShot({ ...s, elapsed: .02 }).detail, /Push a little sooner/);
  assert.equal(describeShot({ ...s, elapsed: .1 }, { quality: .9, edge: false }).timing, 'Well timed');
  const standard = describeShot({ ...s, mode: 'standard' }); assert.match(standard.detail, /Click or tap/);
});
