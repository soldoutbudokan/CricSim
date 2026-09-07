import { batBasis, clamp } from './physics.js';

export const BAT_LIMITS = { x: 1.18, minY: 0.35, maxY: 1.65, travel: 0.52, speed: 12, angularSpeed: 10 };
export const CONTACT_Z = -0.22;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const curve = (a, b, start, end, t) => (2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*start+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*end;

export function createBatControl(hand = 'right') {
  const sign = hand === 'left' ? -1 : 1, x = sign * 0.25;
  return {
    hand: sign, intent: 'grounded', phase: 'guard',
    pose: { x, y: 0.48, z: 0.06, yaw: 0, loft: -0.24, roll: -sign * 0.18,
      defending: false, active: false, progress: 0, weight: 0, turn: 0 },
    target: { x, y: 0.48 }, pointer: { x, y: 0.48 }, origin: { x, y: 0.48 },
    trim: { yaw: 0, loft: 0, roll: 0 },
    direction: { x: 0, y: 1 }, directionLocked: false,
    held: false, defending: false, attempted: false, travel: 0, progress: 0,
    speed: 0, releaseTime: 0, followFrom: 0,
  };
}

// Keep pose/target references stable for the renderer and game loop.
export function resetBatControl(control, hand = control.hand < 0 ? 'left' : 'right') {
  const fresh = createBatControl(hand), { pose, target, intent } = control;
  Object.assign(pose, fresh.pose); Object.assign(target, fresh.target);
  Object.assign(control, fresh, { pose, target, intent });
}

export function resetBatTrim(control) { control.trim.yaw = control.trim.loft = control.trim.roll = 0; }

export function setBatIntent(control, intent) {
  if (!['grounded', 'lofted', 'defend'].includes(intent)) return;
  releaseStroke(control, true);
  control.intent = intent;
}

export function startStroke(control, defend = control.intent === 'defend') {
  control.held = !defend; control.defending = defend; control.attempted = true;
  control.phase = defend ? 'defend' : 'load';
  control.origin = { ...control.pointer };
  control.direction = { x: 0, y: 1 }; control.directionLocked = false;
  control.travel = control.progress = control.releaseTime = 0;
}

// World coordinates aim the shot. A separate screen-space point makes swipe length
// independent of camera motion, aim height, clamping, and device aspect ratio.
export function moveBatTarget(control, x, y, pointer = { x, y }) {
  if (![x, y, pointer.x, pointer.y].every(Number.isFinite)) return;
  control.pointer = { ...pointer };
  if (!control.held) {
    control.target.x = clamp(x, -BAT_LIMITS.x, BAT_LIMITS.x);
    control.target.y = clamp(y, BAT_LIMITS.minY, BAT_LIMITS.maxY);
    return;
  }
  const dx = pointer.x - control.origin.x, dy = pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  if (!control.directionLocked && distance > 0.045) {
    control.direction = { x: dx / distance, y: dy / distance };
    control.directionLocked = true;
  }
  if (control.directionLocked) {
    // Displacement along the chosen stroke, not accumulated travel: jitter and
    // circular scribbling cannot charge a shot. Reversing the swipe retracts it.
    control.travel = clamp(dx * control.direction.x + dy * control.direction.y, 0, BAT_LIMITS.travel);
  }
}

export function releaseStroke(control, cancel = false) {
  if (!control.held && !control.defending) {
    if (cancel) { control.phase = 'recover'; control.releaseTime = 0; control.pose.active = false; }
    return;
  }
  control.held = control.defending = false;
  control.followFrom = control.progress; control.releaseTime = 0;
  control.phase = !cancel && control.progress >= 0.42 ? 'follow' : 'recover';
  // The visual follow-through cannot create a hit after the player lets go.
  control.pose.active = false; control.pose.defending = false;
  control.travel = 0;
}

export function shotName(control) {
  if (control.defending || control.intent === 'defend') return 'Soft defence';
  const across = Math.abs(control.direction.x) > 0.6;
  const name = across ? control.target.y < 0.65 ? 'Sweep' : control.direction.x * control.hand > 0 ? 'Cut' : 'Pull'
    : control.target.y > 1.05 ? 'Back-foot punch' : Math.abs(control.direction.x) > 0.22 ? 'Angled drive' : 'Straight drive';
  return control.intent === 'lofted' ? 'Lofted ' + name.toLowerCase() : name;
}

export function strokeSnapshot(control) {
  return { name: shotName(control), progress: control.pose.progress, phase: control.phase,
    attempted: control.attempted, defending: control.defending, active: control.pose.active };
}

function strokePose(control, progress) {
  const { target: a, direction: d, hand, intent } = control;
  const across = smooth((Math.abs(d.x) - 0.25) / 0.6);
  const side = Math.sign(d.x) || hand;
  const contactRoll = mix(-hand * 0.06, side * 1.25, across);
  const contactLoft = intent === 'lofted' ? 0.32 : -0.08;
  const contactYaw = d.x * 0.65;
  const before = progress <= 0.5;
  const segment = before ? progress * 2 : (progress - 0.5) * 2, t = smooth(segment);
  const acrossSpeed = side * (0.14 + across * 0.18);
  const driveHeight = before ? mix(0.25, 0, t) : mix(0, 0.44, t);
  // A horizontal blade has little vertical margin. Keep cuts/pulls level through
  // contact, then lift into the finish; don't scoop them up into a top edge.
  const acrossHeight = progress < 0.5 ? 0.20 * (1 - smooth(progress / 0.3)) : 0.28 * smooth((progress - 0.7) / 0.3);
  // The toe describes an arc: raised outside the hands, down through the contact
  // point, then across/up. Wrist rotation, foot placement and blade share a pose.
  return {
    x: a.x + (before ? curve(-side * (0.10 + across * 0.18), 0, 0, acrossSpeed, segment) : curve(0, side * (0.13 + across * 0.18), acrossSpeed, 0, segment)),
    y: a.y + mix(driveHeight, acrossHeight, across),
    // Shared nonzero tangents carry bat speed THROUGH contact, rather than
    // easing to a stop at the middle as two independent animations would.
    z: before ? curve(0.30, CONTACT_Z, 0, -0.45, segment) : curve(CONTACT_Z, -0.38, -0.45, 0, segment),
    yaw: before ? mix(-hand * 0.12, contactYaw, t) : mix(contactYaw, contactYaw + side * 0.20, t),
    loft: before ? curve(-0.90, contactLoft, 0, 0.9, segment) : curve(contactLoft, 0.95, 0.9, 0, segment),
    roll: before ? mix(-hand * 0.38, contactRoll, t) : mix(contactRoll, contactRoll + side * 0.55, t),
    weight: smooth(progress * 2) * (a.y < 0.9 ? 1 : -0.45),
    turn: side * across * smooth(progress),
  };
}

export function stepBat(control, dt, keys = new Set()) {
  const p = control.pose, before = { ...p };
  if (!Number.isFinite(dt) || dt <= 0) return before;
  const direction = (a, b) => Number(keys.has(a)) - Number(keys.has(b));
  const trim = control.trim;
  trim.yaw = clamp(trim.yaw + direction('d', 'a') * dt * 0.95, -0.95, 0.95);
  trim.loft = clamp(trim.loft + direction('w', 's') * dt * 0.7, -0.45, 0.75);
  trim.roll = clamp(trim.roll + direction('e', 'q') * dt * 1.5, -1.5, 1.5);
  if (control.held) {
    const desiredProgress = control.travel / BAT_LIMITS.travel;
    control.progress += clamp((desiredProgress - control.progress) * (1 - Math.exp(-42 * dt)), -6 * dt, 6 * dt);
    control.phase = control.progress < 0.08 ? 'load' : 'swing';
  } else if (control.phase === 'follow') {
    control.releaseTime += dt;
    control.progress = mix(control.followFrom, 1, smooth(control.releaseTime / 0.22));
    if (control.releaseTime >= 0.3) control.phase = 'recover';
  }
  let goal;
  if (control.held || control.phase === 'follow') goal = strokePose(control, control.progress);
  else {
    goal = { x: control.target.x, y: control.target.y, z: control.defending ? CONTACT_Z : 0.06,
      yaw: 0, loft: control.defending ? -0.04 : -0.24, roll: -control.hand * (control.defending ? 0.04 : 0.18), weight: control.defending ? 0.28 : 0, turn: 0 };
    if (control.phase === 'recover') {
      control.releaseTime += dt;
      if (control.releaseTime > 0.65) { control.phase = 'guard'; control.progress = 0; }
    }
  }
  const blend = 1 - Math.exp(-(control.phase === 'recover' ? 10 : control.held ? 38 : 30) * dt);
  for (const axis of ['yaw', 'loft', 'roll']) {
    const value = clamp(goal[axis] + trim[axis], axis === 'roll' ? -2 : -1.2, axis === 'roll' ? 2 : 1.2);
    p[axis] += clamp((value - p[axis]) * blend, -BAT_LIMITS.angularSpeed * dt, BAT_LIMITS.angularSpeed * dt);
  }
  // Account for both toe and blade corners, including combined face/roll trim.
  const basis = batBasis(p), floor = 0.068 + 0.31 * Math.abs(basis.u.y) + 0.054 * Math.abs(basis.w.y);
  goal.y = Math.max(floor, goal.y);
  const dx = (goal.x - p.x) * blend, dy = (goal.y - p.y) * blend, dz = (goal.z - p.z) * blend;
  const scale = Math.min(1, BAT_LIMITS.speed * dt / (Math.hypot(dx, dy, dz) || 1));
  p.x += dx * scale; p.y += dy * scale; p.z += dz * scale;
  p.y = Math.max(floor, p.y);
  p.weight = mix(p.weight, goal.weight, blend); p.turn = mix(p.turn, goal.turn, blend);
  p.progress = control.progress; p.defending = control.defending;
  p.active = control.defending || (control.held && control.progress > 0.08);
  control.speed = Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) / dt;
  return before;
}
