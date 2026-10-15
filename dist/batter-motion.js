import { batBasis, clamp } from './physics.js';

// A fixed batting view shows the release hand and contact area together. Head
// movement stays small; torso and feet can move without dragging the aim around.
export const BATTING_VIEW = { eye: { x: 0.02, y: 1.72, z: 0.98 }, look: { x: 0, y: 0.64, z: -2.1 }, fov: 64 };
// Flow starts closer to the body. Its fixed input camera uses this neutral
// frame while the visible eye follows the actual crouch and forward lean.
export const DIRECT_BATTING_VIEW = { eye: { x: .02, y: 1.72, z: .75 }, look: { x: 0, y: .28, z: -2.1 }, fov: BATTING_VIEW.fov };

// Preserve at least 54 degrees horizontally on a portrait screen, so off-stump
// deliveries remain visible instead of being cropped by a narrow viewport.
export function battingFov(aspect) {
  return Math.max(BATTING_VIEW.fov, Math.atan(Math.tan(27 * Math.PI / 180) / Math.max(0.3, aspect)) * 360 / Math.PI);
}

// The direct bat controller and the visible hands use this same anatomy. Grip
// positions are measured along the existing bat handle; wrist offsets match
// the glove's cuff, including its mirrored left-hand geometry.
export const BATTER_RIG = Object.freeze({
  upperArm: .34, forearm: .29, shoulderWidth: .42, reach: .62,
  gripY: Object.freeze([.40, .51]), wrist: Object.freeze({ x: .034, y: 0, z: .105 }),
});
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = a => Math.hypot(a.x, a.y, a.z);
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const normalize = a => scale(a, 1 / Math.max(1e-10, length(a)));
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };

function directFrame(bat, hand) {
  const { u } = batBasis(bat), grip = add(bat, u, .455);
  // Body response comes from the actual handle location, never a stroke timer
  // or an inferred shot name. Both shoulders belong to one rigid torso frame.
  const shift = clamp((grip.x - .16 * hand) * .45, -.30, .30);
  const drop = clamp((grip.y - 1.20) * .65, -.33, .10);
  const depth = clamp((grip.z - .12) * .42, -.18, .10);
  const turn = clamp(Math.atan2(grip.x - .18 * hand, .65 - grip.z) * .50, -.65, .65);
  return { shift, drop, depth, turn, centre: { x: shift, y: 1.38 + drop, z: .60 + depth } };
}

export function directShoulders(bat, hand = 1) {
  const { centre, turn } = directFrame(bat, hand);
  return [1, -1].map(side => {
    const x = side * hand * BATTER_RIG.shoulderWidth / 2;
    return { x: centre.x + x * Math.cos(turn), y: centre.y, z: centre.z - x * Math.sin(turn) };
  });
}

function directElbow(shoulder, wrist, side) {
  const delta = subtract(wrist, shoulder), distance = length(delta), axis = normalize(delta);
  const { upperArm: upper, forearm: lower } = BATTER_RIG;
  const d = clamp(distance, Math.abs(upper - lower) + .001, upper + lower - .001);
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  let pole = scale(cross(UP, axis), side); pole.y -= .55;
  pole = add(pole, axis, -dot(pole, axis));
  pole = length(pole) > 1e-8 ? normalize(pole) : { x: side, y: 0, z: 0 };
  return { point: add(add(shoulder, axis, along), pole, height), distance };
}

// Pure shared glove/arm solve. The controller projects an unreachable BAT pose
// before publishing it; this function never moves an individual shoulder to
// disguise overreach. The scene consumes these exact wrists and glove axes.
export function directGripPoints(bat, hand = 1) {
  const { u, n, w } = batBasis(bat), back = scale(n, -1), shoulders = directShoulders(bat, hand);
  const centres = [], wrists = [], elbows = [], axes = [], distances = [];
  for (let i = 0; i < 2; i++) {
    const centre = add(bat, u, BATTER_RIG.gripY[i]), shoulder = shoulders[i];
    let toward = subtract(shoulder, centre), wrist, elbow, x, z, distance;
    for (let pass = 0; pass < 6; pass++) {
      // Keep wrist rotation on the back of the handle. Normalising the shoulder
      // projection alone has two opposite solutions when the handle points at
      // the shoulder, causing a 180-degree glove flip across a tiny movement.
      // This bounded, softened angle has no branch at that alignment.
      const twist = Math.atan2(dot(toward, w), Math.hypot(dot(toward, back), .08)) * .55;
      z = add(scale(back, Math.cos(twist)), w, Math.sin(twist));
      x = normalize(cross(u, z));
      wrist = add(add(centre, x, BATTER_RIG.wrist.x * hand), z, BATTER_RIG.wrist.z);
      const solved = directElbow(shoulder, wrist, (i === 0 ? 1 : -1) * hand);
      elbow = solved.point; distance = solved.distance; toward = subtract(elbow, centre);
    }
    centres.push(centre); wrists.push(wrist); elbows.push(elbow); axes.push({ x, y: u, z }); distances.push(distance);
  }
  const maxReach = Math.max(...distances), minReach = Math.min(...distances);
  return { centres, wrists, elbows, axes, shoulders, distances, maxReach,
    reachable: maxReach <= BATTER_RIG.reach + 1e-8 && minReach >= Math.abs(BATTER_RIG.upperArm - BATTER_RIG.forearm) + .001 };
}

export function directBatterMotion(bat, hand = 1) {
  const frame = directFrame(bat, hand), rig = directGripPoints(bat, hand);
  const forward = clamp(-frame.depth / .18, 0, 1), back = clamp(frame.depth / .10, 0, 1);
  return {
    ...rig, turn: frame.turn, forward, back,
    front: { x: -.17 * hand + frame.shift * .65, y: 0, z: .43 + frame.depth * .65 },
    rear: { x: .15 * hand + frame.shift * .40, y: 0, z: .76 + Math.max(0, frame.depth) * .4 },
    eye: { x: DIRECT_BATTING_VIEW.eye.x + frame.shift * .55, y: DIRECT_BATTING_VIEW.eye.y + frame.drop * .85, z: DIRECT_BATTING_VIEW.eye.z + frame.depth * .8 },
  };
}

export function batterMotion(bat, hand = 1) {
  if (bat.direct) return directBatterMotion(bat, hand);
  const forward = clamp(bat.weight || 0, 0, 1), back = clamp(-(bat.weight || 0), 0, 0.5);
  const shift = clamp((bat.x - 0.25 * hand) * 0.35, -0.3, 0.3);
  const turn = (bat.turn || 0) * 0.38 + bat.yaw * 0.1;
  const drop = -forward * 0.05 + clamp(bat.y - 0.65, -0.2, 0.7) * 0.12;
  const depth = -forward * 0.26 + back * 0.10;
  const shoulders = [1, -1].map(side => {
    const x = side * hand * 0.21;
    return { x: shift + x * Math.cos(turn), y: 1.38 + drop, z: 1.04 + depth - x * Math.sin(turn) };
  });
  return {
    shoulders, turn, forward, back,
    front: { x: -0.17 * hand + shift * 0.5, y: 0, z: 0.55 - forward * 0.26 + back * 0.04 },
    rear: { x: 0.15 * hand + shift * 0.3, y: 0, z: 0.80 + back * 0.16 },
    eye: { x: BATTING_VIEW.eye.x + shift * 0.04, y: BATTING_VIEW.eye.y - forward * 0.018, z: BATTING_VIEW.eye.z - forward * 0.035 },
  };
}
