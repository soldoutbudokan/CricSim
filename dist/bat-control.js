import { clamp } from './physics.js';

export const BAT_LIMITS = { x: 1.18, minY: 0.35, maxY: 1.65, travel: 0.86, speed: 15 };

export function createBatControl(hand = 'right') {
  const x = hand === 'left' ? -0.25 : 0.25;
  return {
    pose: { x, y: 0.44, z: -0.12, yaw: 0, loft: 0, roll: 0, defending: false },
    target: { x, y: 0.44 },
    held: false, defending: false, travel: 0, speed: 0,
  };
}

export function startStroke(control, defend = false) {
  control.held = !defend;
  control.defending = defend;
  control.travel = 0;
}

export function moveBatTarget(control, x, y) {
  const nx = clamp(x, -BAT_LIMITS.x, BAT_LIMITS.x);
  const ny = clamp(y, BAT_LIMITS.minY, BAT_LIMITS.maxY);
  const distance = Math.hypot(nx - control.target.x, ny - control.target.y);
  control.target.x = nx;
  control.target.y = ny;
  // Stroke depth comes from actual mouse travel, never a timed click animation.
  if (control.held && !control.defending) {
    control.travel = clamp(control.travel + distance * 1.9, 0, BAT_LIMITS.travel);
  }
}

export function releaseStroke(control) {
  control.held = false;
  control.defending = false;
  control.travel = 0;
}

export function stepBat(control, dt, keys = new Set()) {
  const p = control.pose, before = { ...p };
  const direction = (a,b) => Number(keys.has(a)) - Number(keys.has(b));
  p.yaw = clamp(p.yaw + direction('d','a') * dt * 0.95, -0.95, 0.95);
  p.loft = clamp(p.loft + direction('w','s') * dt * 0.7, -0.12, 0.85);
  p.roll = clamp(p.roll + direction('e','q') * dt * 1.5, -1.5, 1.5);
  p.defending = control.defending;
  const blend = 1 - Math.exp(-55 * dt);
  p.x += (control.target.x - p.x) * blend;
  // Prevent the toe passing through the pitch as the blade is tilted.
  const floor = 0.068 + 0.31 * Math.abs(Math.cos(p.roll) * Math.cos(p.loft));
  p.y += (Math.max(floor, control.target.y) - p.y) * blend;
  const z = control.defending ? -0.20 : control.held ? 0.10 - control.travel : -0.12;
  p.z += clamp((z - p.z) * blend, -BAT_LIMITS.speed * dt, BAT_LIMITS.speed * dt);
  control.speed = Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z) / dt;
  return before;
}
