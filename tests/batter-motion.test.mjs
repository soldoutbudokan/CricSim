import assert from 'node:assert/strict';
import test from 'node:test';
import { BATTER_RIG, batterMotion, directGripPoints, directShoulders } from '../dist/batter-motion.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const mirror = p => ({ ...p, x: -p.x, yaw: -p.yaw, roll: -p.roll });
const pose = { x: .12, y: .86, z: -.16, yaw: .15, loft: .42, roll: -.10, direct: true };
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`);

test('direct body motion follows the physical bat and ignores stroke progress', () => {
  const a = batterMotion({ ...pose, weight: 0, turn: 0, progress: 0 });
  const b = batterMotion({ ...pose, weight: 1, turn: 1, progress: 1 });
  assert.deepEqual(a, b);
  const moved = batterMotion({ ...pose, x: .35, y: .55, z: -.23 });
  assert.notDeepEqual(a.shoulders, moved.shoulders);
  for (const rig of [a, moved]) {
    near(distance(...rig.shoulders), BATTER_RIG.shoulderWidth, 'one rigid shoulder frame');
    near(rig.shoulders[0].y, rig.shoulders[1].y, 'both shoulders share torso crouch');
    near(distance(...rig.centres), .11, 'hands stay at their two handle grips');
  }
});

test('reachable direct poses preserve both arm lengths and exact glove cuffs', () => {
  for (const hand of [1, -1]) for (const y of [.75, .86, 1.0]) {
    const p = { ...pose, y, x: pose.x * hand, yaw: pose.yaw * hand, roll: pose.roll * hand };
    const rig = directGripPoints(p, hand);
    assert.ok(rig.reachable, `anatomical test pose is reachable at ${y}`);
    for (let i = 0; i < 2; i++) {
      near(distance(rig.shoulders[i], rig.elbows[i]), BATTER_RIG.upperArm, 'upper arm');
      near(distance(rig.elbows[i], rig.wrists[i]), BATTER_RIG.forearm, 'forearm');
      const { x, y: up, z } = rig.axes[i], centre = rig.centres[i];
      const cuff = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, centre[axis] + x[axis] * BATTER_RIG.wrist.x * hand + z[axis] * BATTER_RIG.wrist.z]));
      near(distance(cuff, rig.wrists[i]), 0, 'glove cuff meets arm');
      for (const v of [x, up, z]) near(Math.hypot(v.x, v.y, v.z), 1, 'unit glove axis');
      near(x.x * z.x + x.y * z.y + x.z * z.z, 0, 'orthogonal glove axes');
    }
  }
});

test('direct reach and joints mirror with batting handedness', () => {
  for (const x of [-.35, 0, .35]) {
    const p = { ...pose, x }, right = directGripPoints(p, 1), left = directGripPoints(mirror(p), -1);
    near(right.maxReach, left.maxReach, 'mirrored reach');
    for (const key of ['shoulders', 'centres', 'wrists', 'elbows']) for (let i = 0; i < 2; i++) {
      near(right[key][i].x, -left[key][i].x, `${key} x`);
      near(right[key][i].y, left[key][i].y, `${key} y`);
      near(right[key][i].z, left[key][i].z, `${key} z`);
    }
  }
});

test('unreachable targets are reported instead of moving shoulders independently', () => {
  const far = { ...pose, x: 2 }, rig = directGripPoints(far);
  assert.equal(rig.reachable, false);
  assert.ok(rig.maxReach > BATTER_RIG.reach);
  assert.deepEqual(rig.shoulders, directShoulders(far));
  near(distance(...rig.shoulders), BATTER_RIG.shoulderWidth, 'unreachable target preserves torso width');
  assert.ok(Math.abs((rig.shoulders[0].x + rig.shoulders[1].x) / 2) <= .30);
});

test('a handle passing the shoulder direction does not flip a glove around the grip', () => {
  // Adjacent physical poses from an overhead-to-sideways path. An unconstrained
  // shoulder projection switched between opposite cuff axes here and moved the
  // top wrist 21 cm while the bat itself moved about 1 cm.
  const before = directGripPoints({ x: .276, y: 1.294, z: -.087, yaw: -1.226, loft: -.256, roll: 7.945 });
  const after = directGripPoints({ x: .265, y: 1.301, z: -.085, yaw: -1.232, loft: -.303, roll: 7.959 });
  for (let i = 0; i < 2; i++) {
    assert.ok(distance(before.wrists[i], after.wrists[i]) < .025, 'wrist follows the small bat displacement');
    const a = before.axes[i].z, b = after.axes[i].z;
    assert.ok(a.x * b.x + a.y * b.y + a.z * b.z > .98, 'cuff orientation stays continuous');
  }
});

test('direct eye stays near the rigid shoulder frame through crouch and side reach', () => {
  for (const hand of [-1, 1]) for (const x of [-1.1, 0, 1.1]) for (const y of [.3, .8, 1.8]) for (const z of [-.35, .1, .4]) {
    const motion = batterMotion({ ...pose, x, y, z }, hand);
    const centre = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, (motion.shoulders[0][axis] + motion.shoulders[1][axis]) / 2]));
    assert.ok(distance(motion.eye, centre) < .47, 'eye follows the torso instead of leaving metre-long invisible shoulders');
  }
});
