import test from 'node:test';
import assert from 'node:assert/strict';
import { SHORTCUTS, SHORTCUT_GROUPS, keyLabel, createShortcutState, serializeShortcutState, isShortcutEnabled, setShortcutEnabled, matchShortcut, cycleValue } from '../dist/shortcuts.js';

const press = (code, extra = {}) => ({ code, key: extra.key ?? '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

test('every shortcut has a unique id, a known group and keys that do not collide', () => {
  const ids = new Set(), keys = new Map();
  for (const shortcut of SHORTCUTS) {
    assert.ok(!ids.has(shortcut.id), 'duplicate id ' + shortcut.id); ids.add(shortcut.id);
    assert.ok(SHORTCUT_GROUPS.includes(shortcut.group), shortcut.id + ' group');
    assert.ok(shortcut.keys.length > 0 && shortcut.label);
    for (const key of shortcut.keys) { assert.ok(!keys.has(key), `${key} used by ${keys.get(key)} and ${shortcut.id}`); keys.set(key, shortcut.id); }
  }
  for (const group of SHORTCUT_GROUPS) assert.ok(SHORTCUTS.some(s => s.group === group), 'empty group ' + group);
});

test('keys match by physical code, punctuation by character, and browser chords are left alone', () => {
  const state = createShortcutState();
  assert.equal(matchShortcut(press('KeyB'), state)?.id, 'bowler');
  assert.equal(matchShortcut(press('Space'), state)?.id, 'bowl');
  assert.equal(matchShortcut(press('Escape'), state)?.id, 'pause');
  assert.equal(matchShortcut(press('BracketRight'), state)?.id, 'speedUp');
  assert.equal(matchShortcut(press('Slash', { key: '/' }), state)?.id, 'shortcuts');
  assert.equal(matchShortcut(press('Slash', { key: '?', shiftKey: true }), state)?.id, 'help');
  assert.equal(matchShortcut(press('KeyA'), state)?.held, true);
  assert.equal(matchShortcut(press('KeyB', { ctrlKey: true }), state), null);
  assert.equal(matchShortcut(press('KeyB', { metaKey: true }), state), null);
  assert.equal(matchShortcut(press('KeyB', { shiftKey: true }), state), null);
  assert.equal(matchShortcut(press('KeyZ'), state), null);
  assert.equal(matchShortcut(null, state), null);
});

test('a switched-off key stops matching without affecting the others, and the master switch stops them all', () => {
  const state = createShortcutState();
  setShortcutEnabled(state, 'bowler', false);
  assert.equal(matchShortcut(press('KeyB'), state), null);
  assert.equal(matchShortcut(press('KeyL'), state)?.id, 'length');
  assert.equal(isShortcutEnabled(state, 'bowler'), false);
  setShortcutEnabled(state, 'bowler', true);
  assert.equal(matchShortcut(press('KeyB'), state)?.id, 'bowler');
  state.all = false;
  assert.equal(matchShortcut(press('KeyB'), state), null);
  assert.equal(matchShortcut(press('Space'), state), null);
  assert.equal(isShortcutEnabled(state, 'length'), false);
});

test('saved state round-trips, ignores unknown ids and defaults new shortcuts to on', () => {
  const state = createShortcutState();
  setShortcutEnabled(state, 'fullscreen', false); setShortcutEnabled(state, 'ageUp', false); state.all = false;
  const saved = JSON.parse(JSON.stringify(serializeShortcutState(state)));
  const restored = createShortcutState(saved);
  assert.deepEqual([...restored.off].sort(), ['ageUp', 'fullscreen']);
  assert.equal(restored.all, false);
  const tolerant = createShortcutState({ all: 'yes', off: ['nonsense', 'bowler', 42] });
  assert.equal(tolerant.all, true);
  assert.deepEqual([...tolerant.off], ['bowler']);
  for (const bad of [null, undefined, 'text', 7, []]) assert.deepEqual(serializeShortcutState(createShortcutState(bad)), { all: true, off: [] });
});

test('key labels read as they appear on a keycap', () => {
  assert.equal(keyLabel('KeyB'), 'B');
  assert.equal(keyLabel('Digit2'), '2');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel('BracketLeft'), '[');
  assert.equal(keyLabel('Question'), '?');
  assert.equal(keyLabel('Slash'), '/');
});

test('cycling a setting wraps in both directions and recovers from an unknown value', () => {
  const values = ['good', 'full', 'yorker', 'short', 'mixed'];
  assert.equal(cycleValue(values, 'good'), 'full');
  assert.equal(cycleValue(values, 'mixed'), 'good');
  assert.equal(cycleValue(values, 'good', -1), 'mixed');
  assert.equal(cycleValue(values, 'nothing'), 'good');
});
