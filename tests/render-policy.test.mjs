import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGraphicsMode, qualityProfile, targetRenderFps, createFramePacer, createAdaptiveQuality } from '../dist/render-policy.js';

test('saved graphics choices tolerate invalid values and have bounded GPU budgets', () => {
  for (const value of [null, undefined, '', 'ultra', {}, 2]) assert.equal(normalizeGraphicsMode(value), 'auto');
  for (const mode of ['auto', 'balanced', 'eco', 'high']) {
    assert.equal(normalizeGraphicsMode(mode), mode);
    const p = qualityProfile(mode);
    assert.ok(p.maxPixelRatio <= 1.75 && p.maxPixels <= 3_000_000);
    assert.ok(p.fps <= 60 && p.shadowMapSize <= 2048);
  }
  assert.equal(qualityProfile('eco').shadows, false);
  assert.equal(qualityProfile('eco').fps, 30);
  assert.ok(qualityProfile('eco').maxPixels < qualityProfile('balanced').maxPixels);
  assert.ok(qualityProfile('auto', 1).maxPixels < qualityProfile('auto', 0).maxPixels);
  assert.ok(qualityProfile('auto', 2).maxPixels <= qualityProfile('auto', 1).maxPixels);
  assert.equal(qualityProfile('auto', Infinity).id, 'eco');
});

test('menu, pause and hidden pages never inherit an active high-refresh frame budget', () => {
  assert.equal(targetRenderFps({ phase: 'flight', mode: 'high' }), 60);
  assert.equal(targetRenderFps({ phase: 'flight', mode: 'eco' }), 30);
  assert.equal(targetRenderFps({ phase: 'intro', mode: 'high' }), 20);
  assert.equal(targetRenderFps({ phase: 'flight', paused: true }), 0);
  assert.equal(targetRenderFps({ phase: 'intro', hidden: true }), 0);
  assert.equal(targetRenderFps({ phase: 'ready', autoLevel: 2 }), 30);
});

test('the pacer caps draws across common display refresh rates without halving 60 Hz', () => {
  for (const refresh of [60, 90, 120, 144, 165, 240]) {
    for (const target of [20, 30, 60]) {
      const pacer = createFramePacer(); let draws = 0;
      for (let i = 0; i < refresh * 10; i++) if (pacer.due(i * 1000 / refresh, target)) draws++;
      assert.ok(Math.abs(draws - target * 10) <= 1, `${refresh} Hz at ${target} fps drew ${draws}`);
    }
  }
});

test('paused draws require invalidation; tab stalls cannot produce a catch-up burst', () => {
  const pacer = createFramePacer();
  assert.equal(pacer.due(0, 60), true);
  assert.equal(pacer.due(5, 60), false);
  assert.equal(pacer.due(5000, 60), true);
  assert.equal(pacer.due(5001, 60), false);
  assert.equal(pacer.due(5010, 0), false);
  assert.equal(pacer.due(5011, 0, true), true);
  assert.equal(pacer.due(5012, 0), false);
  pacer.reset();
  assert.equal(pacer.due(6000, 60), true);
});

function feed(adaptive, delta, seconds, active = true) {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += delta) adaptive.sample(delta, active);
}

test('Auto requires sustained foreground overload and can reduce to a 30 fps budget', () => {
  const adaptive = createAdaptiveQuality();
  feed(adaptive, 1000 / 60, 10);
  assert.equal(adaptive.level, 0);
  adaptive.sample(180); // one slow browser task
  feed(adaptive, 1000 / 60, 5);
  assert.equal(adaptive.level, 0);
  feed(adaptive, 1000 / 30, 4.1);
  assert.equal(adaptive.level, 1);
  feed(adaptive, 1000 / 30, 4.1);
  assert.equal(adaptive.level, 2);
  assert.equal(qualityProfile('auto', adaptive.level).fps, 30);
  feed(adaptive, 1000 / 144, 20);
  assert.equal(adaptive.level, 2);
  adaptive.reset();
  assert.equal(adaptive.level, 0);
});

test('hidden, paused and startup gaps cannot contaminate Auto adaptation', () => {
  const adaptive = createAdaptiveQuality();
  feed(adaptive, 50, 10, false);
  adaptive.sample(10000);
  feed(adaptive, 1000 / 60, 5);
  assert.equal(adaptive.level, 0);
  feed(adaptive, 50, 2.1);
  adaptive.sample(50, false);
  feed(adaptive, 50, 2.1);
  assert.equal(adaptive.level, 0, 'background transition resets partially accumulated overload');
});

test('Auto still reduces quality when sustained overload exceeds 250 ms per frame', () => {
  const adaptive = createAdaptiveQuality();
  adaptive.sample(5000);
  feed(adaptive, 1000 / 60, 5);
  assert.equal(adaptive.level, 0, 'one OS stall does not lower quality');
  feed(adaptive, 300, 12);
  assert.equal(adaptive.level, 2, 'the slowest computers must still reach the lower power budget');
});
