import { batBasis, clamp } from './physics.js';
import { BATTER_RIG, DIRECT_BATTING_VIEW, directGripPoints } from './batter-motion.js';

// A rigid shaft with a damped mouse joint on the blade. The two particles are
// an internal rigid-body representation, not independently animated endpoints.
// Shoulder reach constrains the handle, so pulling the blade rotates the bat.
export const DIRECT_BAT = Object.freeze({
  toe: -.31, handle: .59, length: .90, frequency: 5, damping: .85,
  maxAcceleration: 180, maxSpeed: 15, iterations: 14, floor: .068,
  minX: -1.15, maxX: 1.15, minY: .28, maxY: 2.3,
  acquireTime: .075, acquireSpeed: .45, movingSpeed: .65,
});
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const length = a => Math.hypot(a.x, a.y, a.z);
const unit = a => mul(a, 1 / Math.max(length(a), 1e-10));
const zero = () => ({ x: 0, y: 0, z: 0 });
const move = (p, delta, amount = 1) => { for (const axis of ['x', 'y', 'z']) p[axis] += delta[axis] * amount; };
const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const unwrap = (angle, previous) => previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));

// This sheet supplies the depth that a two-dimensional mouse cannot specify.
// It slopes through the playing area and returns toward the shoulder overhead.
export function directSurfaceDepth(y) {
  return -.14 + .12 * (y - .85) + .18 * smooth((y - 1.55) / .65);
}

export function directTargetFromPlane(x, y) {
  x = clamp(x, DIRECT_BAT.minX, DIRECT_BAT.maxX); y = clamp(y, DIRECT_BAT.minY, DIRECT_BAT.maxY);
  const eye = DIRECT_BATTING_VIEW.eye, ray = { x: x - eye.x, y: y - eye.y, z: -.22 - eye.z };
  // Solve ray.z == sheet(ray.y). Keeping x/y on that ray preserves the mouse's
  // projection when the target moves away from the old flat contact plane.
  let lo = .05, hi = 2;
  for (let i = 0; i < 28; i++) {
    const at = (lo + hi) / 2, yy = eye.y + ray.y * at;
    if (eye.z + ray.z * at > directSurfaceDepth(yy)) lo = at; else hi = at;
  }
  return add(eye, ray, (lo + hi) / 2);
}

function endpoints(pose) {
  const { u } = batBasis(pose);
  return { toe: add(pose, u, DIRECT_BAT.toe), handle: add(pose, u, DIRECT_BAT.handle) };
}

export function createDirectBat(pose, hand = 1, initialize = false) {
  const direct = { ...endpoints(pose), toeVelocity: zero(), handleVelocity: zero(), target: { x: pose.x, y: pose.y, z: pose.z },
    engaged: false, acquiring: true, settled: 0, inputTime: null, input: null, speed: 0, backlift: 0, exposed: false, moving: false,
    appliedTrim: { yaw: 0, loft: 0, roll: 0 }, clock: 0, lastMotion: 0, heldAxis: null, holdTarget: null, braceStamp: -1,
    faceNormal: batBasis(pose).n, faceStep: .03 };
  if (initialize) { projectRig(direct, hand, direct.appliedTrim, 'grounded'); Object.assign(pose, shaftPose(direct, direct.appliedTrim, 'grounded')); }
  return direct;
}

export function disengageDirectBat(direct) {
  direct.engaged = false; direct.acquiring = true; direct.settled = 0;
  direct.toeVelocity = zero(); direct.handleVelocity = zero(); direct.speed = 0; direct.moving = false; direct.exposed = false;
  direct.input = null; direct.inputTime = null;
  direct.heldAxis = direct.holdTarget = null; direct.braceStamp = -1;
}

export function targetDirectBat(direct, x, y, time = NaN) {
  const target = directTargetFromPlane(x, y);
  if (length(sub(target, direct.target)) > .0001) direct.lastMotion = direct.clock;
  direct.target = target;
  if (!direct.engaged) { direct.engaged = true; direct.acquiring = true; direct.settled = 0; }
  direct.input = { x, y }; direct.inputTime = Number.isFinite(time) ? time : direct.inputTime;
}

function shaftPose(direct, trim, intent) {
  const u = unit(sub(direct.handle, direct.toe)), centre = add(direct.toe, u, -DIRECT_BAT.toe);
  // Keep the blade face toward the field while its shaft rotates freely. The
  // wrists allow a tilted/open face, but no hidden shot arc chooses its path.
  let preferred = sub({ x: 0, y: 0, z: -1 }, mul(u, -u.z));
  let n = sub(direct.faceNormal, mul(u, dot(direct.faceNormal, u)));
  if (length(n) < .001) n = preferred;
  if (length(n) < .001) n = sub({ x: 0, y: 1, z: 0 }, mul(u, u.y));
  n = unit(n);
  if (length(preferred) > .04) {
    preferred = unit(preferred);
    const turn = clamp(Math.atan2(dot(u, cross(n, preferred)), dot(n, preferred)), -direct.faceStep, direct.faceStep);
    n = add(mul(n, Math.cos(turn)), cross(u, n), Math.sin(turn));
  }
  const loft = Math.asin(clamp(n.y, -1, 1)), yaw = Math.atan2(n.x, -n.z);
  const neutral = batBasis({ yaw, loft, roll: 0 });
  const roll = Math.atan2(-dot(u, neutral.w), dot(u, neutral.u));
  return { ...centre, yaw: yaw + trim.yaw, loft: loft + trim.loft + (intent === 'lofted' ? .22 : 0), roll: roll + trim.roll,
    direct: true, weight: clamp((.03 - centre.z) * 2, -.5, 1), turn: clamp(centre.x * .25, -.4, .4) };
}

function constrainLength(direct) {
  const delta = sub(direct.handle, direct.toe), size = length(delta);
  const correction = mul(delta, (size - DIRECT_BAT.length) / Math.max(size, 1e-10) * .5);
  move(direct.toe, correction); move(direct.handle, correction, -1);
}

function moveGrip(direct, localY, correction) {
  const b = (localY - DIRECT_BAT.toe) / DIRECT_BAT.length, a = 1 - b, denominator = a * a + b * b;
  move(direct.toe, correction, a / denominator); move(direct.handle, correction, b / denominator);
}

function projectRig(direct, hand, trim, intent) {
  for (let iteration = 0; iteration < DIRECT_BAT.iterations; iteration++) {
    constrainLength(direct);
    const pose = shaftPose(direct, trim, intent), rig = directGripPoints(pose, hand);
    for (let i = 0; i < 2; i++) {
      const delta = sub(rig.wrists[i], rig.shoulders[i]), distance = length(delta);
      const desired = clamp(distance, Math.abs(BATTER_RIG.upperArm - BATTER_RIG.forearm) + .055, BATTER_RIG.reach - .004);
      if (distance !== desired) moveGrip(direct, BATTER_RIG.gripY[i], mul(delta, (desired - distance) / Math.max(distance, 1e-8) * .8));
    }
    const floorPose = shaftPose(direct, trim, intent), { u, w } = batBasis(floorPose);
    const bottom = floorPose.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y);
    if (bottom < DIRECT_BAT.floor) { direct.toe.y += DIRECT_BAT.floor - bottom; direct.handle.y += DIRECT_BAT.floor - bottom; }
  }
  constrainLength(direct);
}

export function stepDirectBat(direct, pose, dt, hand, trim, intent, defending = false) {
  const before = { ...pose }, oldEndpoints = endpoints(pose);
  if (!direct.engaged) {
    pose.direct = true; pose.active = false; pose.defending = false;
    return before;
  }
  direct.clock += dt; direct.faceStep = 5 * dt;
  if (!direct.acquiring && direct.clock - direct.lastMotion > .04 && direct.braceStamp !== direct.lastMotion) {
    // A sub-centimetre correction translates an already checked bat. Capturing
    // its tiny gravity deflection as a new wrist angle would accumulate drift.
    if (!direct.heldAxis || length(sub(direct.target, direct.holdTarget)) > .01) {
      direct.heldAxis = unit(sub(direct.handle, direct.toe)); direct.holdTarget = { ...direct.target };
    }
    direct.braceStamp = direct.lastMotion;
  }
  const brace = direct.heldAxis ? 1 - smooth((length(sub(direct.target, direct.holdTarget)) - .01) / .14) : 0;
  // Fine face controls and the Grounded/Lofted choice move the wrists. They
  // never teleport an already live collision shape or create a velocity spike.
  for (const axis of ['yaw', 'loft', 'roll']) {
    const desired = trim[axis] + (axis === 'loft' && intent === 'lofted' ? .22 : 0);
    direct.appliedTrim[axis] += clamp((desired - direct.appliedTrim[axis]) * (1 - Math.exp(-18 * dt)), -3 * dt, 3 * dt);
  }
  const appliedTrim = direct.appliedTrim;
  const oldToe = { ...direct.toe }, oldHandle = { ...direct.handle };
  const fraction = -DIRECT_BAT.toe / DIRECT_BAT.length, a = 1 - fraction, b = fraction, denominator = a * a + b * b;
  const anchor = add(direct.toe, sub(direct.handle, direct.toe), fraction);
  const velocity = add(mul(direct.toeVelocity, a), direct.handleVelocity, b);
  const omega = 2 * Math.PI * DIRECT_BAT.frequency;
  let force = add(mul(sub(direct.target, anchor), omega * omega), velocity, -2 * DIRECT_BAT.damping * omega);
  force = mul(force, Math.min(1, DIRECT_BAT.maxAcceleration / Math.max(length(force), 1e-8)));
  // Relaxed wrists favour hands near the torso. Their spring applies torque
  // around the controlled blade point, without pulling that point elsewhere.
  // Use the requested blade position so a lift pivots above the hands while
  // moving, rather than carrying the whole bat overhead before rotating.
  const gripFraction = (.455 - DIRECT_BAT.toe) / DIRECT_BAT.length, ga = 1 - gripFraction, gb = gripFraction;
  const grip = add(direct.toe, sub(direct.handle, direct.toe), gripFraction);
  const gripVelocity = add(mul(direct.toeVelocity, ga), direct.handleVelocity, gb);
  let restingGrip = {
    x: hand * .12 + (direct.target.x - hand * .12) * .5,
    y: clamp(1.12 + (direct.target.y - .8) * .3, .97, 1.5), z: direct.target.z + .025 };
  restingGrip = add(anchor, unit(sub(restingGrip, direct.target)), .455);
  if (brace) restingGrip = add(mul(restingGrip, 1 - brace), add(anchor, direct.heldAxis, .455), brace);
  const relaxedHz = 6;
  const handOmega = 2 * Math.PI * (relaxedHz * (1 - brace) + 5 * brace);
  const shaft = unit(sub(direct.handle, direct.toe));
  let handForce = add(mul(sub(restingGrip, grip), handOmega * handOmega), sub(gripVelocity, velocity), -2 * .9 * handOmega);
  handForce = sub(handForce, mul(shaft, dot(handForce, shaft)));
  for (const [point, v, weight] of [[direct.toe, direct.toeVelocity, a], [direct.handle, direct.handleVelocity, b]]) {
    move(v, force, dt * weight / denominator); v.y -= 9.81 * dt;
    move(v, handForce, dt * (point === direct.toe ? DIRECT_BAT.toe : DIRECT_BAT.handle) / .455);
    const drag = Math.exp(-dt * 2.5), speed = length(v), factor = Math.min(drag, DIRECT_BAT.maxSpeed / Math.max(speed, 1e-8));
    for (const axis of ['x', 'y', 'z']) v[axis] *= factor;
  }
  // Hands can check a bat anywhere. Damping the relative endpoint velocity
  // damps rotation without adding drag to the player's translating target.
  const centreVelocity = mul(add(direct.toeVelocity, direct.handleVelocity), .5);
  const angularDrag = Math.exp(-dt * (7 + 38 * brace));
  for (const v of [direct.toeVelocity, direct.handleVelocity]) for (const axis of ['x', 'y', 'z']) v[axis] = centreVelocity[axis] + (v[axis] - centreVelocity[axis]) * angularDrag;
  move(direct.toe, direct.toeVelocity, dt); move(direct.handle, direct.handleVelocity, dt);
  projectRig(direct, hand, appliedTrim, 'grounded');
  direct.toeVelocity = mul(sub(direct.toe, oldToe), 1 / dt); direct.handleVelocity = mul(sub(direct.handle, oldHandle), 1 / dt);
  const next = shaftPose(direct, appliedTrim, 'grounded');
  const alternative = { yaw: next.yaw + Math.PI, loft: Math.PI - next.loft, roll: next.roll + Math.PI };
  for (const axis of ['yaw', 'loft', 'roll']) { next[axis] = unwrap(next[axis], pose[axis]); alternative[axis] = unwrap(alternative[axis], pose[axis]); }
  const angularDistance = angles => ['yaw', 'loft', 'roll'].reduce((sum, axis) => sum + (angles[axis] - pose[axis]) ** 2, 0);
  if (angularDistance(alternative) < angularDistance(next)) Object.assign(next, alternative);
  // Transport the untrimmed face frame. Fine face controls remain a separate
  // smooth wrist offset, rather than feeding their value back each step.
  direct.faceNormal = batBasis(shaftPose(direct, { yaw: 0, loft: 0, roll: 0 }, 'grounded')).n;
  Object.assign(pose, next);
  const current = endpoints(pose);
  direct.speed = Math.max(length(sub(current.toe, oldEndpoints.toe)), length(sub(current.handle, oldEndpoints.handle))) / dt;
  if (direct.acquiring) {
    direct.settled = direct.speed < DIRECT_BAT.acquireSpeed ? direct.settled + dt : 0;
    if (direct.settled >= DIRECT_BAT.acquireTime) direct.acquiring = false;
  }
  const { u, w } = batBasis(pose), low = pose.y - .31 * Math.abs(u.y) - .054 * Math.abs(w.y);
  direct.backlift = clamp((low - .45) / 1.15, 0, 1);
  direct.exposed = low < 1.65 && pose.y + .31 * Math.abs(u.y) > .12 && Math.abs(pose.x) - .31 * Math.abs(u.x) - .054 * Math.abs(w.x) < .78 && pose.z < .38;
  direct.moving = direct.speed >= DIRECT_BAT.movingSpeed;
  pose.active = !direct.acquiring; pose.defending = defending || intent === 'defend';
  pose.progress = direct.backlift; pose.strokeTime = 0;
  const rig = directGripPoints(pose, hand); pose.grips = rig.centres; pose.shoulders = rig.shoulders;
  return before;
}
