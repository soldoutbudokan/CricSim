import { clamp } from './physics.js';

// A fixed batting view shows the release hand and contact area together. Head
// movement stays small; torso and feet can move without dragging the aim around.
export const BATTING_VIEW = { eye: { x: 0.02, y: 1.72, z: 0.98 }, look: { x: 0, y: 0.64, z: -2.1 }, fov: 64 };

// Preserve at least 54 degrees horizontally on a portrait screen, so off-stump
// deliveries remain visible instead of being cropped by a narrow viewport.
export function battingFov(aspect) {
  return Math.max(BATTING_VIEW.fov, Math.atan(Math.tan(27 * Math.PI / 180) / Math.max(0.3, aspect)) * 360 / Math.PI);
}

export function batterMotion(bat, hand = 1) {
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
