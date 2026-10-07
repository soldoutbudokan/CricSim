import { batBasis, clamp } from './physics.js?v=178e0305181b1a37';

export const BAT_LIMITS = { x: 1.18, minY: 0.35, maxY: 1.65, travel: 0.52, speed: 20, angularSpeed: 28, rate: 9 };
export const CONTACT_Z = -0.22;
// The downswing commits at this point of the stroke. Before it the backlift
// follows the hand and can be pulled out of; after it the blade carries its own
// momentum through contact, the way a real bat does once the hands go.
export const COMMIT = 0.25;
export const SWIPE_LENGTHS = { short: 0.7, standard: 1, long: 1.35 };
// Standard input separates the player's decisions (aim, timing and intent)
// from the physical motion. These times never depend on pointer speed or a ball.
export const STANDARD_STROKE = Object.freeze({ contactTime: 0.10, aimLockTime: 0.065, duration: 0.32, activeFrom: 0.045, activeUntil: 0.22 });
// Flow input needs no click. The pointer aims while it moves slowly; a decisive
// push up the screen starts the same complete, repeatable stroke as a Standard
// click. Speeds are screen units per real second (the shorter window side is
// 1.6 units), so slow-motion practice does not change what counts as a push.
export const SWING_TRIGGERS = Object.freeze({
  light: Object.freeze({ speed: 2.0, distance: 0.06 }),
  normal: Object.freeze({ speed: 2.6, distance: 0.08 }),
  firm: Object.freeze({ speed: 3.4, distance: 0.11 }),
});
export const FLOW = Object.freeze({
  restSpeed: 0.9, window: 0.024, memory: 0.25, anchorMemory: 0.15, onsetMemory: 0.06, gap: 0.08,
  // A push must point within 60 degrees of straight up; sideways and downward moves only aim.
  cone: 0.5, backdate: 0.03, jumpSpeed: 30,
  // A pointer that reappears this far away after a silence is a new hand, not a push.
  jumpDistance: 0.3,
  // An upward move this fast and far that stays short of the trigger earns a "push harder" hint.
  hintSpeed: 1.2, hintDistance: 0.04, hintTime: 1.0,
});
const LOCK_DISTANCE = 0.06, TRACK_TIME = 0.025, ACCEL = 360, CARRY_DECAY = 0.11, COMPLETE_RATE = 2.5, FOLLOW_RATE = 3.5, LIFT_TIME = 0.09;
const MODES = ['flow', 'standard', 'manual'];
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const curve = (a, b, start, end, t) => (2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*start+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*end;

export function createBatControl(hand = 'right', mode = 'manual') {
  const sign = hand === 'left' ? -1 : 1, x = sign * 0.25;
  return {
    hand: sign, intent: 'grounded', phase: 'guard', swipe: 1, mode: MODES.includes(mode) ? mode : 'manual', trigger: 'normal', timeScale: 1,
    pose: { x, y: 0.48, z: 0.06, yaw: 0, loft: -0.24, roll: -sign * 0.18,
      defending: false, active: false, progress: 0, strokeTime: 0, weight: 0, turn: 0 },
    target: { x, y: 0.48 }, pointer: { x, y: 0.48 }, origin: { x, y: 0.48 },
    trim: { yaw: 0, loft: 0, roll: 0 },
    direction: { x: 0, y: 1 }, directionLocked: false,
    held: false, defending: false, attempted: false, committed: false, cancelled: false,
    travel: 0, progress: 0, velocity: 0, carry: 0, lift: 0,
    speed: 0, releaseTime: 0, strokeTime: 0, aimLocked: false,
    // Flow: recent pointer samples, the last one that was at rest, and whether
    // the next push may swing. The clock is the controller's own simulated time.
    clock: 0, samples: [], rest: null, armed: false, pointerSpeed: 0, softPushAt: -Infinity, restartClock: 0,
  };
}

// Keep pose/target references stable for the renderer and game loop.
export function resetBatControl(control, hand = control.hand < 0 ? 'left' : 'right') {
  const fresh = createBatControl(hand, control.mode), { pose, target, intent, swipe, trigger, timeScale } = control;
  Object.assign(pose, fresh.pose); Object.assign(target, fresh.target);
  Object.assign(control, fresh, { pose, target, intent, swipe, trigger, timeScale });
}

export function resetBatTrim(control) { control.trim.yaw = control.trim.loft = control.trim.roll = 0; }

// How far the hand travels for a full stroke, as a multiple of the standard swipe.
export function setSwipeLength(control, factor) {
  if (Number.isFinite(factor)) control.swipe = clamp(factor, 0.4, 2.5);
}

// A new touch, a pointer coming back onto the canvas or a resize starts a fresh
// hand: the distance from wherever it last was is not a push, and the hand must
// be seen resting (a slow sample, or a silence) before it may swing.
export function restartFlow(control) {
  control.samples.length = 0; control.restartClock = control.clock;
  disarmFlow(control);
}

// A cancelled stroke (the next ball, a pause, a change of intent) forgets
// nothing about where the hand is: the last sample stays as the place a still
// mouse is resting, so the silence before the next push still counts.
function disarmFlow(control) {
  control.samples.splice(0, Math.max(0, control.samples.length - 1));
  control.rest = null; control.armed = false; control.pointerSpeed = 0; control.softPushAt = -Infinity;
}

// How decisive a push must be before Flow swings.
export function setSwingTrigger(control, trigger) {
  if (Object.hasOwn(SWING_TRIGGERS, trigger)) control.trigger = trigger;
}

// Simulation seconds per real second, so a push can be dated in stroke time.
export function setBatTimeScale(control, scale) {
  if (Number.isFinite(scale) && scale > 0) control.timeScale = scale;
}

export function setBatMode(control, mode) {
  if (!MODES.includes(mode) || mode === control.mode) return;
  releaseStroke(control, true);
  control.mode = mode;
}

export function setBatIntent(control, intent) {
  if (!['grounded', 'lofted', 'defend'].includes(intent)) return;
  releaseStroke(control, true);
  control.intent = intent;
}

export function startStroke(control, defend = control.intent === 'defend') {
  // A held button or repeated pointer-down cannot restart an automatic attack.
  if (timed(control) && (control.held || timedSwinging(control))) return;
  // Flow does not need a click, but one still plays the same stroke. A click
  // that lands in the middle of a push swings at the point the hand rested on;
  // a click during a sideways correction swings where the outline is.
  if (control.mode === 'flow' && !defend) {
    const { rest } = control, last = control.samples.at(-1);
    if (rest && last && last.t - rest.t <= FLOW.anchorMemory && control.pointerSpeed >= FLOW.restSpeed) {
      const dx = last.x - rest.x, dy = last.y - rest.y;
      if (dy >= FLOW.cone * Math.hypot(dx, dy)) { control.target.x = rest.wx; control.target.y = rest.wy; }
    }
    control.armed = false; control.rest = null;
  }
  control.held = !defend; control.defending = defend; control.attempted = true;
  control.cancelled = false; control.strokeTime = 0; control.aimLocked = false;
  control.phase = defend ? 'defend' : 'load';
  control.origin = { ...control.pointer };
  control.direction = { x: 0, y: 1 }; control.directionLocked = false; control.committed = timed(control) && !defend;
  control.travel = control.progress = control.velocity = control.carry = control.lift = control.releaseTime = 0;
}

// World coordinates aim the shot. A separate screen-space point makes swipe length
// independent of camera motion, aim height, clamping, and device aspect ratio.
// `time` is the pointer event's real timestamp in seconds. Flow reads pointer
// speed from it; the other modes ignore it.
export function moveBatTarget(control, x, y, pointer = { x, y }, time = NaN) {
  if (![x, y, pointer.x, pointer.y].every(Number.isFinite)) return;
  control.pointer = { ...pointer };
  if (control.mode === 'flow') { moveFlow(control, x, y, pointer, time); return; }
  if (control.mode === 'standard') {
    // Releasing a tap does not turn an in-flight swing back into free aiming.
    if (timedSwinging(control) && control.aimLocked) return;
    control.target.x = clamp(x, -BAT_LIMITS.x, BAT_LIMITS.x);
    control.target.y = clamp(y, BAT_LIMITS.minY, BAT_LIMITS.maxY);
    return;
  }
  if (!control.held) {
    control.target.x = clamp(x, -BAT_LIMITS.x, BAT_LIMITS.x);
    control.target.y = clamp(y, BAT_LIMITS.minY, BAT_LIMITS.maxY);
    return;
  }
  const dx = pointer.x - control.origin.x, dy = pointer.y - control.origin.y;
  const distance = Math.hypot(dx, dy);
  // The stroke's direction is read from the whole backlift, not its first few
  // pixels, and freezes when the downswing commits. A hand that curls a little
  // on its way up still plays the drive it meant to.
  if (!control.directionLocked && distance > LOCK_DISTANCE) control.direction = { x: dx / distance, y: dy / distance };
  // Displacement along the chosen stroke, not accumulated travel: jitter and
  // circular scribbling cannot charge a shot. Reversing an uncommitted swipe retracts it.
  const along = distance > LOCK_DISTANCE || control.directionLocked ? dx * control.direction.x + dy * control.direction.y : 0;
  control.travel = clamp(along, 0, BAT_LIMITS.travel * control.swipe);
}

export function releaseStroke(control, cancel = false) {
  if (timed(control)) {
    const swinging = timedSwinging(control), wasDefending = control.defending;
    control.held = control.defending = false;
    if (cancel) {
      control.cancelled = true; control.phase = 'recover'; control.releaseTime = 0;
      control.pose.active = false; control.velocity = control.carry = 0;
      // A pause, blur, panel or the next ball: the stroke is off, the hand stays where it is.
      disarmFlow(control);
    } else if (swinging) control.phase = 'follow';
    else if (wasDefending) { control.phase = 'recover'; control.releaseTime = 0; control.pose.active = false; }
    control.pose.defending = false;
    return;
  }
  if (cancel) control.cancelled = true;
  if (!control.held && !control.defending) {
    if (cancel) { control.phase = 'recover'; control.releaseTime = 0; control.pose.active = false; }
    return;
  }
  control.held = control.defending = false; control.releaseTime = 0;
  if (!cancel && control.committed && control.progress < 1) {
    // A committed stroke finishes on its own after the hands let go.
    control.phase = 'follow';
    control.velocity = Math.max(control.velocity, control.carry, FOLLOW_RATE);
  } else {
    // Letting go before the swing commits pulls out of the shot; a cancelled
    // or finished stroke cannot create a hit on its way back to guard.
    control.phase = 'recover'; control.pose.active = false; control.velocity = control.carry = 0;
  }
  control.pose.defending = false;
  control.travel = 0;
}

export function shotName(control) {
  if (control.defending || control.intent === 'defend') return 'Soft defence';
  const across = Math.abs(control.direction.x) > 0.7;
  const name = across ? control.target.y < 0.65 ? 'Sweep' : control.direction.x * control.hand > 0 ? 'Cut' : 'Pull'
    : control.target.y > 1.05 ? 'Back-foot punch' : Math.abs(control.direction.x) > 0.35 ? 'Angled drive' : 'Straight drive';
  return control.intent === 'lofted' ? 'Lofted ' + name.toLowerCase() : name;
}

export function strokeSnapshot(control) {
  return { name: shotName(control), progress: control.pose.progress, phase: control.phase,
    attempted: control.attempted, held: control.held, defending: control.defending, committed: control.committed, active: control.pose.active,
    mode: control.mode, cancelled: control.cancelled, elapsed: control.pose.strokeTime, idealContactTime: STANDARD_STROKE.contactTime };
}

// Standard and Flow play the same fixed-timing stroke; only what starts it differs.
const timed = control => control.mode === 'standard' || control.mode === 'flow';
const timedSwinging = control => timed(control) && control.committed && !control.cancelled && ['load', 'swing', 'follow'].includes(control.phase);

// Flow: every pointer sample is kept for a moment. Slow movement aims; the last
// slow sample is where the hand rested. A push up the screen (fast enough, far
// enough) starts one stroke at that rest point. The tail of the push cannot
// swing again: the hand must come to rest first.
function moveFlow(control, x, y, pointer, time) {
  const { samples } = control, last = samples.at(-1);
  let t = Number.isFinite(time) ? time : control.clock;
  if (last && t < last.t) t = last.t;
  // A still mouse sends nothing. An event after a silence means the hand rested
  // where the last sample was, and only then began to move. That first event
  // cannot be a push by itself: the samples after it, with real intervals, decide.
  const afterGap = Boolean(last) && t - last.t >= FLOW.gap;
  if (afterGap) {
    if (Math.hypot(pointer.x - last.x, pointer.y - last.y) > FLOW.jumpDistance) { restartFlow(control); control.restartClock = -Infinity; }
    else { const still = { ...last, t: t - FLOW.window, s: control.clock }; samples.length = 0; samples.push(still); control.rest = still; control.armed = true; }
  }
  const sample = { x: pointer.x, y: pointer.y, wx: clamp(x, -BAT_LIMITS.x, BAT_LIMITS.x), wy: clamp(y, BAT_LIMITS.minY, BAT_LIMITS.maxY), t, s: control.clock };
  samples.push(sample);
  while (samples.length > 1 && samples[0].t < t - FLOW.memory) samples.shift();
  // Speed over the newest samples spanning at least the measuring window, so a
  // 60 Hz pointer and a 1 kHz coalesced stream read the same push.
  let ref = null;
  for (let i = samples.length - 2; i >= 0; i--) { ref = samples[i]; if (t - ref.t >= FLOW.window) break; }
  let speed = ref && t > ref.t && !afterGap ? Math.hypot(sample.x - ref.x, sample.y - ref.y) / (t - ref.t) : 0;
  // A teleport (a finger put down elsewhere, a pointer back from off-canvas) is
  // not a hand movement: forget the history and wait to see the hand resting.
  if (speed > FLOW.jumpSpeed) { samples.splice(0, samples.length - 1); ref = null; speed = 0; control.armed = false; }
  control.pointerSpeed = speed;
  // A measured slow movement is a rest and arms the next push. A lone first
  // sample says nothing about the hand, unless it comes after a silence that
  // followed a restart: then the hand has been still since.
  if (speed < FLOW.restSpeed && !afterGap) {
    control.rest = sample;
    if (ref || (!last && control.clock - control.restartClock >= FLOW.gap)) control.armed = true;
  }
  // A stroke in flight keeps its contact point; a block follows the hand onto the line.
  if (timedSwinging(control)) return;
  control.target.x = sample.wx; control.target.y = sample.wy;
  // With Defend chosen a push only aims: a block is held, never pushed.
  if (control.defending || control.intent === 'defend' || !control.armed || afterGap || speed < FLOW.hintSpeed) return;
  // The aim is where the hand rested before it pushed, not where the push was
  // noticed. A hand that never rested (tracking the ball) anchors a moment back.
  const anchor = control.rest && t - control.rest.t <= FLOW.anchorMemory ? control.rest
    : samples.find(s => t - s.t <= FLOW.onsetMemory) || samples[0];
  const dx = sample.x - anchor.x, dy = sample.y - anchor.y, distance = Math.hypot(dx, dy);
  if (dy < FLOW.cone * distance) return;
  const trigger = SWING_TRIGGERS[control.trigger] || SWING_TRIGGERS.normal;
  if (speed < trigger.speed || distance < trigger.distance) {
    // An upward move that is not quite a push: the HUD can say so.
    if (distance >= FLOW.hintDistance) control.softPushAt = control.clock;
    return;
  }
  control.armed = false; control.rest = null; control.softPushAt = -Infinity;
  beginFlowStroke(control, anchor, clamp((t - anchor.t) * control.timeScale, 0, FLOW.backdate));
}

function beginFlowStroke(control, anchor, backdate) {
  control.held = control.defending = false; control.attempted = true; control.cancelled = false;
  // The stroke is dated from the push, not from its detection, so the bat is
  // where the hand expects it. Nothing else about the motion depends on the hand.
  control.strokeTime = backdate; control.aimLocked = true; control.phase = 'swing';
  control.origin = { x: anchor.x, y: anchor.y };
  control.target.x = anchor.wx; control.target.y = anchor.wy;
  control.direction = { x: 0, y: 1 }; control.directionLocked = true; control.committed = true;
  control.travel = control.progress = control.velocity = control.carry = control.lift = control.releaseTime = 0;
}

// The preview uses the same finite blade, orientation and floor constraint as
// the stroke. It receives no trajectory information and never seeks the ball.
export function contactPreview(control) {
  const defending = control.defending || control.intent === 'defend';
  const pose = defending ? { ...guardPose(control), z: CONTACT_Z, loft: -0.04, roll: -control.hand * 0.04 }
    : timed(control) ? standardPose(control, STANDARD_STROKE.contactTime) : strokePose(control, 0.5);
  for (const axis of ['yaw', 'loft', 'roll']) pose[axis] = clamp(pose[axis] + control.trim[axis], axis === 'roll' ? -2 : -1.2, axis === 'roll' ? 2 : 1.2);
  const { u, w } = batBasis(pose);
  pose.y = Math.max(pose.y, 0.068 + 0.31 * Math.abs(u.y) + 0.054 * Math.abs(w.y));
  return pose;
}

function standardPose(control, time) {
  const { target, hand, intent } = control;
  const load = smooth(time / 0.06), finish = smooth((time - 0.18) / 0.14);
  const contactLoft = intent === 'lofted' ? 0.32 : -0.08;
  // The blade stays on its chosen line with a stable face through contact.
  // Forward travel supplies real bat speed; no extra power or collision area is
  // added in the physics engine. The late finish then lifts into the follow-through.
  const z = time < 0.035 ? curve(0.06, 0.17, 0, 0, time / 0.035)
    : time <= 0.18 ? 0.17 - (time - 0.035) * 6 : mix(-0.70, -0.43, finish);
  return {
    x: target.x - hand * 0.09 * (1 - load) + hand * 0.19 * finish,
    y: target.y + 0.16 * (1 - load) + 0.48 * finish,
    z,
    yaw: mix(-hand * 0.1, 0, load) + hand * 0.20 * finish,
    loft: mix(-0.80, contactLoft, load) + (0.95 - contactLoft) * finish,
    roll: mix(-hand * 0.30, -hand * 0.04, load) + hand * 0.50 * finish,
    weight: load * (target.y < 0.9 ? 1 : -0.45), turn: 0,
  };
}

function advanceStandardStroke(control, dt) {
  if (control.attempted && control.committed && !control.cancelled) control.strokeTime += dt;
  if (!timedSwinging(control)) return;
  const time = Math.min(STANDARD_STROKE.duration, control.strokeTime);
  const flow = control.mode === 'flow';
  control.aimLocked = flow || time >= STANDARD_STROKE.aimLockTime;
  control.directionLocked = control.aimLocked;
  control.progress = time <= STANDARD_STROKE.contactTime ? time / STANDARD_STROKE.contactTime * 0.5
    : 0.5 + (time - STANDARD_STROKE.contactTime) / (STANDARD_STROKE.duration - STANDARD_STROKE.contactTime) * 0.5;
  control.lift = 1;
  control.phase = flow ? time < STANDARD_STROKE.activeUntil ? 'swing' : 'follow'
    : control.held ? time < STANDARD_STROKE.aimLockTime ? 'load' : 'swing' : 'follow';
  if (time >= STANDARD_STROKE.duration) {
    control.phase = 'recover'; control.releaseTime = 0; control.pose.active = false;
    control.velocity = control.carry = 0;
  }
}

function guardPose(control) {
  return { x: control.target.x, y: control.target.y, z: control.defending ? CONTACT_Z : 0.06,
    yaw: 0, loft: control.defending ? -0.04 : -0.24, roll: -control.hand * (control.defending ? 0.04 : 0.18), weight: control.defending ? 0.28 : 0, turn: 0 };
}

function strokePose(control, progress) {
  const { target: a, direction: d, hand, intent } = control;
  const across = smooth((Math.abs(d.x) - 0.4) / 0.45);
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

// The stroke's progress is the one smooth state everything else reads: the blade,
// the stroke meter, timing feedback and the collision model all agree on where
// the swing is. Its velocity is bounded and its acceleration is bounded, so a
// staircase of pointer events can never show up as a stutter in the bat.
function advanceStroke(control, dt) {
  if (timed(control)) { advanceStandardStroke(control, dt); return; }
  const limit = BAT_LIMITS.travel * control.swipe;
  let v = control.velocity;
  if (control.held) {
    const desired = clamp(control.travel / limit, 0, 1);
    const wanted = clamp((desired - control.progress) / TRACK_TIME, -BAT_LIMITS.rate, BAT_LIMITS.rate);
    v += clamp(wanted - v, -ACCEL * dt, ACCEL * dt);
  } else if (control.phase !== 'follow') return;
  control.lift = Math.min(1, control.lift + dt / LIFT_TIME);
  if (control.committed) {
    // Momentum: the blade keeps the pace the hands gave it, easing off rather
    // than stopping dead when the pointer stalls, and never travels backwards.
    control.carry = Math.max(v, control.carry * Math.exp(-dt / CARRY_DECAY));
    v = Math.max(v, control.carry, control.held ? COMPLETE_RATE : FOLLOW_RATE);
  }
  control.progress = clamp(control.progress + v * dt, 0, 1);
  if (!control.committed && control.progress >= COMMIT) { control.committed = true; control.directionLocked = true; control.carry = Math.max(v, 0); }
  if (control.progress >= 1) { v = 0; control.carry = 0; }
  control.velocity = v;
  if (control.held) control.phase = control.committed ? 'swing' : 'load';
  else if (control.progress >= 1) { control.phase = 'recover'; control.releaseTime = 0; control.pose.active = false; }
}

export function stepBat(control, dt, keys = new Set()) {
  const p = control.pose, before = { ...p };
  if (!Number.isFinite(dt) || dt <= 0) return before;
  control.clock += dt;
  const direction = (a, b) => Number(keys.has(a)) - Number(keys.has(b));
  const trim = control.trim;
  trim.yaw = clamp(trim.yaw + direction('d', 'a') * dt * 0.95, -0.95, 0.95);
  trim.loft = clamp(trim.loft + direction('w', 's') * dt * 0.7, -0.45, 0.75);
  trim.roll = clamp(trim.roll + direction('e', 'q') * dt * 1.5, -1.5, 1.5);
  advanceStroke(control, dt);
  const swinging = timed(control) ? timedSwinging(control) : control.held || control.phase === 'follow';
  let goal;
  if (swinging) {
    // The backlift rises over a few frames after the press rather than snapping.
    const guard = guardPose(control), stroke = timed(control) ? standardPose(control, control.strokeTime) : strokePose(control, control.progress), lift = smooth(control.lift);
    goal = {}; for (const key of Object.keys(stroke)) goal[key] = mix(guard[key], stroke[key], lift);
  } else {
    goal = guardPose(control);
    if (control.phase === 'recover') {
      control.releaseTime += dt; control.progress *= Math.exp(-dt * 9);
      if (control.releaseTime > 0.65) { control.phase = 'guard'; control.progress = 0; }
    }
  }
  const blend = 1 - Math.exp(-(control.phase === 'recover' ? 10 : swinging ? 90 : 30) * dt);
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
  p.progress = control.progress; p.strokeTime = control.strokeTime; p.defending = control.defending;
  p.active = control.defending || (swinging && (timed(control)
    ? control.strokeTime >= STANDARD_STROKE.activeFrom && control.strokeTime <= STANDARD_STROKE.activeUntil : control.progress > 0.08));
  control.speed = Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) / dt;
  return before;
}
