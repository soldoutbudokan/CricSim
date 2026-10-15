// Continuous hand in world x/y on the input plane. Event rate, real hand time
// and simulated ball time are independent; a still mouse sends no events.
import { moveBatTarget, stepBat, setBatTimeScale } from '../dist/bat-control.js';
export function hand(control, initial = { x: .25, y: .8 }, { timeScale = 1, sampleRate = 120 } = {}) {
  let time = 0, point = { ...initial }, nextSample = 0, nextStep = 1 / 240, keys = new Set();
  setBatTimeScale(control, timeScale);
  return {
    get time() { return time; }, get at() { return { ...point }; },
    move(seconds, path, onStep = null, silent = false) {
      const end = time + seconds;
      while (time < end - 1e-9) {
        time = Math.min(nextSample, nextStep, end);
        if (time >= nextSample - 1e-9) {
          point = { ...path(time) };
          if (!silent) moveBatTarget(control, point.x, point.y, point, time);
          nextSample += 1 / sampleRate;
        }
        if (time >= nextStep - 1e-9) { const old = stepBat(control, timeScale / 240, keys); onStep?.(old); nextStep += 1 / 240; }
      }
    },
    rest(seconds, onStep) { const at = { ...point }; this.move(seconds, () => at, onStep); },
    still(seconds, onStep) { const at = { ...point }; this.move(seconds, () => at, onStep, true); },
    to(target, seconds, onStep) {
      const from = { ...point }, start = time;
      this.move(seconds, t => { const f = Math.min(1, (t - start) / seconds); return { x: from.x + (target.x - from.x) * f, y: from.y + (target.y - from.y) * f }; }, onStep);
    },
    setKeys(value) { keys = value; },
  };
}
