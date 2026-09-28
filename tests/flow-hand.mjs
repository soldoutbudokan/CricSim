// A repeatable hand for Flow tests. Screen units follow the game: the shorter
// window side is 1.6 units, y up. The pointer's world point is a fixed linear
// map of the screen point around the aim, so a rest at screen (0,0) aims
// exactly at `aim`. Samples arrive at 120 Hz; the 240 Hz simulation steps every
// 1/60 s frame, as the game's loop does. The controller never sees the ball.
import { DEFAULTS, DT, createDelivery, stepDelivery } from '../dist/physics.js';
import { CONTACT_Z, STANDARD_STROKE, SWING_TRIGGERS, createBatControl, moveBatTarget, stepBat, setBatIntent, setBatTimeScale } from '../dist/bat-control.js';

export const RATE = 120, FRAME = 1 / 60, UP = { x: 0, y: 1 };

export function hand(control, aim = { x: .1, y: .8 }, { timeScale = 1 } = {}) {
  let t = 0, keys = new Set(), pos = { x: 0, y: 0 }, nextSample = 0, nextFrame = FRAME;
  setBatTimeScale(control, timeScale);
  const feed = (sx, sy) => { pos = { x: sx, y: sy }; moveBatTarget(control, aim.x + sx * 1.5, aim.y + sy * 1.5, { x: sx, y: sy }, t); };
  return {
    get time() { return t; }, get at() { return { ...pos }; },
    // Advance real time along a screen path (a function of real time).
    // `onStep` runs after every simulation step; `onFrame` runs before each frame's steps.
    // A `silent` move sends no samples at all, as a mouse that is not moving does.
    move(seconds, path, onStep = null, onFrame = null, silent = false) {
      const end = t + seconds;
      while (t < end - 1e-9) {
        t = Math.min(nextSample, nextFrame, end);
        if (t >= nextSample - 1e-9) { const p = path(t); if (silent) pos = { x: p.x, y: p.y }; else feed(p.x, p.y); nextSample += 1 / RATE; }
        if (t >= nextFrame - 1e-9) { onFrame?.(); for (let i = 0; i < Math.round(4 * timeScale); i++) { const old = stepBat(control, DT, keys); onStep?.(old); } nextFrame += FRAME; }
      }
    },
    // Hold still where the hand is, or at `at` (a teleport, which the game would reset).
    rest(seconds, at = pos, onStep, onFrame) { this.move(seconds, () => at, onStep, onFrame); },
    // Hold still without sending any samples: what a real still mouse does.
    still(seconds, onStep, onFrame) { const at = { ...pos }; this.move(seconds, () => at, onStep, onFrame, true); },
    // Push `length` units at `speed` units per real second along `direction` (a unit vector), then stop.
    push(direction, speed = 6, length = .45, onStep, onFrame) {
      const t0 = t, from = { ...pos };
      this.move(length / speed, tt => ({ x: from.x + direction.x * speed * (tt - t0), y: from.y + direction.y * speed * (tt - t0) }), onStep, onFrame);
      this.move(.02, () => ({ x: from.x + direction.x * length, y: from.y + direction.y * length }), onStep, onFrame);
    },
    setKeys(set) { keys = set; },
  };
}

// Counts strokes started on a control as its pose is stepped.
export function strokes(control) {
  let n = 0, was = false;
  return { count: () => n, step() { const swinging = control.committed && !control.cancelled && ['load', 'swing', 'follow'].includes(control.phase); if (swinging && !was) n++; was = swinging; } };
}

// The probe finds where a seeded delivery arrives; the live controller only
// ever receives the hand's aim and pushes.
const deliveries = new Map();
export function arrival({ hand: stance = 'right', length = 'good', line = 'middle', speed = 140 }) {
  const key = JSON.stringify({ stance, length, line, speed });
  if (!deliveries.has(key)) {
    const config = { ...DEFAULTS, hand: stance, length, line, speed }, probe = createDelivery(config, 42);
    while (probe.p.z < CONTACT_Z) stepDelivery(probe, config);
    deliveries.set(key, { config, probe });
  }
  return deliveries.get(key);
}

// Rest on the arrival point, then push so the stroke is noticed `error`
// seconds before or after the ideal moment. Returns the delivery, the control,
// the bat pose at contact and the ball's velocity leaving the bat (before any net).
export function play({ hand: stance = 'right', intent = 'grounded', length = 'good', line = 'middle', speed = 140, error = 0, direction = UP, pushSpeed = 6, aimX = 0, aimY = 0, timeScale = 1, trigger = 'normal' } = {}) {
  const { config, probe } = arrival({ hand: stance, length, line, speed });
  const c = createBatControl(stance, 'flow'); setBatIntent(c, intent); c.trigger = trigger;
  const h = hand(c, { x: probe.p.x + aimX, y: probe.p.y + .035 + aimY }, { timeScale });
  const d = createDelivery(config, 42);
  let contactPose = null, exit = null, started = null;
  const track = old => {
    if (started === null && c.committed) started = d.time;
    const events = stepDelivery(d, config, DT, c.pose, old);
    if (events.some(e => e.type === 'contact')) { contactPose = { ...c.pose, time: d.time }; exit = { ...d.v }; }
  };
  // Detection needs the trigger distance plus a sample; the hand starts that much earlier.
  const lead = SWING_TRIGGERS[trigger].distance / pushSpeed + 1 / RATE;
  const pushAt = (probe.time - STANDARD_STROKE.contactTime + error) / timeScale - lead;
  h.rest(1);
  h.rest(Math.max(0, pushAt), undefined, track);
  h.push(direction, pushSpeed, .45, track);
  h.rest(.6, undefined, track);
  return { d, c, probe, contactPose, exit, started, clean: d.hit && !d.contact.edge && d.contact.quality > .7 };
}
