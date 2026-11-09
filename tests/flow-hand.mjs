// A repeatable hand for Flow tests. Screen units follow the game: the shorter
// window side is 1.6 units, y up. The pointer's world point is a fixed linear
// map of the screen point around the aim, so a rest at screen (0,0) aims
// exactly at `aim`. Samples arrive at 120 Hz; the 240 Hz simulation steps every
// 1/60 s frame, as the game's loop does. The controller never sees the ball.
import { DEFAULTS, DT, createDelivery, stepDelivery } from '../dist/physics.js';
import { CONTACT_Z, STANDARD_STROKE, createBatControl, moveBatTarget, stepBat, setBatIntent, setBatTimeScale } from '../dist/bat-control.js';

export const RATE = 120, FRAME = 1 / 60, UP = { x: 0, y: 1 };

export function hand(control, aim = { x: .1, y: .8 }, { timeScale = 1, rate = RATE } = {}) {
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
        if (t >= nextSample - 1e-9) { const p = path(t); if (silent) pos = { x: p.x, y: p.y }; else feed(p.x, p.y); nextSample += 1 / rate; }
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
    // A push the way a hand makes one: `length` units over `seconds`, setting off from
    // rest and easing to a stop (a minimum-jerk reach). Peak speed is 1.875 length / seconds.
    drive(direction, length = .4, seconds = .15, onStep, onFrame) {
      const t0 = t, from = { ...pos }, reach = u => u <= 0 ? 0 : u >= 1 ? length : length * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
      this.move(seconds + .02, tt => ({ x: from.x + direction.x * reach((tt - t0) / seconds), y: from.y + direction.y * reach((tt - t0) / seconds) }), onStep, onFrame);
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

// Rest on the arrival point, then start the push `error` seconds before or
// after the ideal moment. Returns the delivery, the control,
// the bat pose at contact and the ball's velocity leaving the bat (before any net).
export function play({ hand: stance = 'right', intent = 'grounded', length = 'good', line = 'middle', speed = 140, error = 0, direction = UP, pushSpeed = 6, aimX = 0, aimY = 0, timeScale = 1, trigger = 'normal', reach = null } = {}) {
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
  // The stroke is dated from the moment the hand sets off, so that is the moment to time.
  const pushAt = (probe.time - STANDARD_STROKE.contactTime + error) / timeScale;
  h.rest(1);
  h.rest(Math.max(0, pushAt), undefined, track);
  // `reach` is { length, seconds } for a push that accelerates like a hand; otherwise the push is at constant speed.
  if (reach) h.drive(direction, reach.length, reach.seconds, track); else h.push(direction, pushSpeed, .45, track);
  h.rest(.6, undefined, track);
  return { d, c, probe, contactPose, exit, started, clean: d.hit && !d.contact.edge && d.contact.quality > .7 };
}
