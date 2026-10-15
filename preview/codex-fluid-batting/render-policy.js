// Rendering budgets are independent of the fixed 240 Hz cricket simulation.
// Keep these functions browser-free so pacing and adaptation can be tested.
export const GRAPHICS_MODES = Object.freeze(['auto', 'balanced', 'eco', 'high']);

const balanced = Object.freeze({
  id: 'balanced', fps: 60, maxPixelRatio: 1.25, maxPixels: 1_800_000,
  shadowMapSize: 1024, shadows: true, grassDensity: .6, details: true,
});
const eco = Object.freeze({
  id: 'eco', fps: 30, maxPixelRatio: 1, maxPixels: 1_000_000,
  shadowMapSize: 512, shadows: false, grassDensity: .3, details: false,
});
const high = Object.freeze({
  id: 'high', fps: 60, maxPixelRatio: 1.75, maxPixels: 3_000_000,
  shadowMapSize: 2048, shadows: true, grassDensity: 1, details: true,
});
const autoProfiles = Object.freeze([
  balanced,
  Object.freeze({ ...balanced, id: 'adaptive', maxPixelRatio: .95, maxPixels: 1_150_000 }),
  Object.freeze({ ...eco, maxPixelRatio: .95 }),
]);

export function normalizeGraphicsMode(value) {
  return GRAPHICS_MODES.includes(value) ? value : 'auto';
}

export function qualityProfile(mode = 'auto', autoLevel = 0) {
  switch (normalizeGraphicsMode(mode)) {
    case 'eco': return eco;
    case 'high': return high;
    case 'balanced': return balanced;
    default: return autoProfiles[Math.max(0, Math.min(autoProfiles.length - 1, Math.floor(autoLevel) || 0))];
  }
}

export function targetRenderFps({ phase, paused = false, hidden = false, mode = 'auto', autoLevel = 0 }) {
  if (hidden || paused) return 0;
  const fps = qualityProfile(mode, autoLevel).fps;
  return phase === 'intro' ? Math.min(fps, 20) : fps;
}

// Deadlines retain the fractional remainder on 120/144/165 Hz displays. A late
// frame draws once; there is no burst of catch-up GPU work after a stalled tab.
export function createFramePacer() {
  let deadline = null, previousFps = 0;
  return {
    reset() { deadline = null; previousFps = 0; },
    due(now, fps, force = false) {
      if (!Number.isFinite(now) || fps <= 0) { deadline = null; return force && Number.isFinite(now); }
      const interval = 1000 / fps;
      if (force || deadline === null || previousFps !== fps) {
        previousFps = fps; deadline = now + interval; return true;
      }
      if (now + .5 < deadline) return false;
      deadline = now - deadline > interval ? now + interval : deadline + interval;
      return true;
    },
  };
}

// Two bad two-second windows are required before reducing quality. A single
// shader compile, browser task, or tab switch must not lower the setting.
// Auto only moves down during a session to avoid repeated visual changes.
export function createAdaptiveQuality() {
  let level = 0, elapsed = 0, slowElapsed = 0, badWindows = 0, longFrames = 0;
  function resetSamples() { elapsed = slowElapsed = badWindows = longFrames = 0; }
  return {
    get level() { return level; },
    reset() { level = 0; resetSamples(); },
    sample(deltaMs, active = true) {
      if (!active || !Number.isFinite(deltaMs) || deltaMs <= 0) {
        resetSamples(); return false;
      }
      if (deltaMs > 250) {
        // Discard one browser/OS stall, but repeated very slow frames are real
        // overload. Bound their weight rather than ignoring a struggling GPU.
        longFrames++;
        if (longFrames === 1) { elapsed = slowElapsed = badWindows = 0; return false; }
        deltaMs = 250;
      } else longFrames = 0;
      if (level >= autoProfiles.length - 1) return false;
      elapsed += deltaMs;
      if (deltaMs > 24) slowElapsed += deltaMs;
      if (elapsed < 2000) return false;
      badWindows = slowElapsed / elapsed > .3 ? badWindows + 1 : 0;
      elapsed = slowElapsed = 0;
      if (badWindows < 2) return false;
      level++; resetSamples(); return true;
    },
  };
}
