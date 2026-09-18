// Every keyboard shortcut in one table. The game maps each `action` to a
// function; the shortcuts sidebar renders this table and lets the player turn
// any entry off. Matching uses physical key codes so the layout does not matter,
// except for the two punctuation keys that are read by their character.
export const SHORTCUT_GROUPS = ['Play', 'Fine adjustment', 'The bowler', 'Surface & conditions', 'Practice tools', 'Interface'];

export const SHORTCUTS = [
  { id: 'bowl', group: 'Play', keys: ['Space'], label: 'Take guard · bowl the next ball' },
  { id: 'grounded', group: 'Play', keys: ['Digit1'], label: 'Grounded shot' },
  { id: 'lofted', group: 'Play', keys: ['Digit2'], label: 'Lofted shot' },
  { id: 'defend', group: 'Play', keys: ['Digit3'], label: 'Defend' },
  { id: 'pause', group: 'Play', keys: ['KeyP', 'Escape'], label: 'Pause · resume' },
  { id: 'trim', group: 'Fine adjustment', keys: ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE'], label: 'Face · loft · roll (hold)', held: true },
  { id: 'trimClear', group: 'Fine adjustment', keys: ['KeyC'], label: 'Clear fine adjustments' },
  { id: 'bowler', group: 'The bowler', keys: ['KeyB'], label: 'Bowling style' },
  { id: 'arm', group: 'The bowler', keys: ['KeyH'], label: 'Bowling arm' },
  { id: 'hand', group: 'The bowler', keys: ['KeyY'], label: 'Your stance' },
  { id: 'speedDown', group: 'The bowler', keys: ['BracketLeft'], label: 'Release speed −5 km/h', repeat: true },
  { id: 'speedUp', group: 'The bowler', keys: ['BracketRight'], label: 'Release speed +5 km/h', repeat: true },
  { id: 'length', group: 'The bowler', keys: ['KeyL'], label: 'Length' },
  { id: 'line', group: 'The bowler', keys: ['KeyK'], label: 'Line' },
  { id: 'pitch', group: 'Surface & conditions', keys: ['KeyU'], label: 'Surface' },
  { id: 'weather', group: 'Surface & conditions', keys: ['KeyO'], label: 'Sky & light' },
  { id: 'windDown', group: 'Surface & conditions', keys: ['Minus'], label: 'Crosswind −5 km/h', repeat: true },
  { id: 'windUp', group: 'Surface & conditions', keys: ['Equal'], label: 'Crosswind +5 km/h', repeat: true },
  { id: 'ageDown', group: 'Surface & conditions', keys: ['Comma'], label: 'Ball age −10 overs', repeat: true },
  { id: 'ageUp', group: 'Surface & conditions', keys: ['Period'], label: 'Ball age +10 overs', repeat: true },
  { id: 'timeScale', group: 'Practice tools', keys: ['KeyT'], label: 'Simulation speed' },
  { id: 'swipe', group: 'Practice tools', keys: ['KeyV'], label: 'Swipe length' },
  { id: 'guide', group: 'Practice tools', keys: ['KeyG'], label: 'Bat guide & ball trail' },
  { id: 'auto', group: 'Practice tools', keys: ['KeyX'], label: 'Continuous deliveries' },
  { id: 'sound', group: 'Interface', keys: ['KeyM'], label: 'Sound' },
  { id: 'fullscreen', group: 'Interface', keys: ['KeyF'], label: 'Fullscreen' },
  { id: 'conditions', group: 'Interface', keys: ['KeyN'], label: 'Conditions drawer' },
  { id: 'shortcuts', group: 'Interface', keys: ['Slash'], label: 'This shortcuts list', character: '/' },
  { id: 'help', group: 'Interface', keys: ['Question'], label: 'How to play', character: '?' },
];

const KEY_LABELS = { Space: 'Space', Escape: 'Esc', BracketLeft: '[', BracketRight: ']', Minus: '−', Equal: '=', Comma: ',', Period: '.', Slash: '/', Question: '?' };
export function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

// Saved as the list of switched-off ids plus the master switch, so a shortcut
// added in a later version starts switched on.
export function createShortcutState(saved = null) {
  const state = { all: true, off: new Set() };
  if (saved && typeof saved === 'object') {
    if (saved.all === false) state.all = false;
    if (Array.isArray(saved.off)) for (const id of saved.off) if (SHORTCUTS.some(s => s.id === id)) state.off.add(id);
  }
  return state;
}
export function serializeShortcutState(state) { return { all: state.all, off: [...state.off] }; }
export function isShortcutEnabled(state, id) { return state.all && !state.off.has(id); }
export function setShortcutEnabled(state, id, enabled) { if (enabled) state.off.delete(id); else state.off.add(id); }

// Modifier chords belong to the browser. Shift is only meaningful for '?'.
export function matchShortcut(event, state) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null;
  for (const shortcut of SHORTCUTS) {
    const hit = shortcut.character ? event.key === shortcut.character : !event.shiftKey && shortcut.keys.includes(event.code);
    if (!hit) continue;
    return isShortcutEnabled(state, shortcut.id) ? shortcut : null;
  }
  return null;
}

// Step through a select's values, wrapping at the end.
export function cycleValue(values, current, step = 1) {
  const index = values.indexOf(current);
  return values[((index < 0 ? 0 : index + step) % values.length + values.length) % values.length];
}
