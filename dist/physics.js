// SI units throughout. +z runs from the bowler towards the batter.
export const DT = 1 / 240;
export const BALL = { radius: 0.036, mass: 0.156 };
const GROUND = 0.032;
export const PITCHES = {
  hard: { name: 'Hard & true', restitution: 0.73, friction: 0.10, seam: 0.34, turn: 0.44, color: '#b4a078', detail: 'Carry · consistent bounce' },
  green: { name: 'Green top', restitution: 0.68, friction: 0.14, seam: 1.00, turn: 0.34, color: '#8d9360', detail: 'Live seam · extra movement' },
  dry: { name: 'Dry & worn', restitution: 0.61, friction: 0.23, seam: 0.45, turn: 1.00, color: '#b7a07b', detail: 'Grip · variable bounce' },
  soft: { name: 'Soft & damp', restitution: 0.47, friction: 0.27, seam: 0.56, turn: 0.58, color: '#8c785a', detail: 'Low carry · slower surface' },
};
export const BOWLERS = {
  fast: { name: 'Fast pace', short: 'PACE', speed: 140, min: 120, max: 160, swing: 0.015, spin: 12, turn: 0, seam: 0.65, description: 'Hit the deck. Read the bounce.' },
  outswing: { name: 'Outswing', short: 'SWING', speed: 126, min: 100, max: 145, swing: 0.17, spin: 10, turn: 0, seam: 0.30, description: 'Moves away from a right-hander.' },
  inswing: { name: 'Inswing', short: 'SWING', speed: 128, min: 100, max: 145, swing: -0.17, spin: 10, turn: 0, seam: 0.30, description: 'Curves back into a right-hander.' },
  offspin: { name: 'Off spin', short: 'SPIN', speed: 82, min: 60, max: 105, swing: 0.03, spin: 135, turn: -1, seam: 0.04, description: 'Dips in flight. Turns into a right-hander.' },
  legspin: { name: 'Leg spin', short: 'SPIN', speed: 78, min: 55, max: 100, swing: -0.04, spin: 160, turn: 1, seam: 0.04, description: 'Drift, dip and turn away.' },
};
export const DEFAULTS = { bowler: 'fast', arm: 'right', speed: 140, pitch: 'hard', length: 'good', line: 'off', weather: 'clear', wind: 0, age: 8, timeScale: 1, auto: false, guide: true, hand: 'right', audio: true };
const lengths = { yorker: -0.65, full: -2.1, good: -4.0, short: -7.0 };
const lines = { leg: -0.25, middle: 0, off: 0.30, wide: 0.70 };
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function airAcceleration(v, config, delivery) {
  const wind = config.wind / 3.6;
  const rx = v.x - wind, ry = v.y, rz = v.z;
  const speed = Math.hypot(rx, ry, rz);
  // Lumped drag and calibrated side-force model, not CFD.
  const rho = config.weather === 'overcast' ? 1.24 : config.weather === 'evening' ? 1.23 : 1.19;
  const k = 0.5 * rho * Math.PI * BALL.radius ** 2 / BALL.mass;
  const drag = k * (0.45 + config.age * 0.0011) * speed;
  const ageFactor = Math.max(0.20, 1 - config.age / 65);
  const swing = delivery.hit ? 0 : delivery.swing * ageFactor * k * speed * Math.abs(rz);
  const magnus = delivery.hit ? 0 : delivery.spin * 0.00055 * speed;
  return { x: -drag * rx + swing + delivery.turn * magnus * 0.18, y: -9.81 - drag * ry - magnus, z: -drag * rz };
}
function initialVertical(vz, targetZ, config, delivery) {
  // Solve the release angle against the same drag model used in flight.
  let lo = -25, hi = 12;
  for (let i = 0; i < 22; i++) {
    const vy = (lo + hi) / 2;
    const p = { y: delivery.releaseY, z: delivery.releaseZ };
    let previousY=p.y,previousZ=p.z;
    const v = { x: 0, y: vy, z: vz };
    while (p.z < targetZ && p.y > -20) {
      previousY=p.y;previousZ=p.z;
      const a = airAcceleration(v, config, delivery);
      v.x += a.x * DT; v.y += a.y * DT; v.z += a.z * DT;
      p.y += v.y * DT; p.z += v.z * DT;
    }
    const targetY=previousY+(p.y-previousY)*(targetZ-previousZ)/(p.z-previousZ);
    if (targetY > BALL.radius+GROUND) hi = vy; else lo = vy;
  }
  return (hi + lo) / 2;
}
export function createDelivery(config, seed = Date.now()) {
  const rng = random(seed), b = BOWLERS[config.bowler], arm = config.arm === 'left' ? -1 : 1;
  const length = config.length === 'mixed' ? Object.values(lengths)[Math.floor(rng() * 4)] : lengths[config.length];
  const hand = config.hand === 'left' ? -1 : 1;
  const targetLine = (config.line === 'mixed' ? (rng() - 0.35) * 1.0 : lines[config.line]) * hand;
  const delivery = { seed, swing: b.swing * arm, turn: b.turn * arm, spin: b.spin, seam: (rng() - 0.5) * b.seam, releaseY: b.turn ? 2.13 : 2.18, releaseZ: -17.7, speed: config.speed + (rng() - 0.5) * 3, length: length + (rng() - 0.5) * 0.22, targetLine, hit: false, bounces: 0, time: 0, resolved: false, seamNoise: rng(), bounceNoise: rng(), path: [] };
  const vz = delivery.speed / 3.6;
  const vy = initialVertical(vz, delivery.length, config, delivery);
  // Preserve the selected release speed after accounting for the downward angle.
  const adjustedZ = Math.sqrt(Math.max(16, vz * vz - vy * vy));
  const adjustedY = initialVertical(adjustedZ, delivery.length, config, delivery);
  const releaseX = -0.42 * arm;
  const flightEstimate = 17.7 / adjustedZ * 1.08;
  const vx = (targetLine - releaseX) / flightEstimate;
  delivery.p = { x: releaseX, y: delivery.releaseY, z: delivery.releaseZ };
  delivery.v = { x: vx, y: adjustedY, z: adjustedZ };
  delivery.speed = Math.hypot(vx, adjustedY, adjustedZ) * 3.6;
  delivery.path.push({ ...delivery.p, t: 0 });
  return delivery;
}
export function batBasis(bat) {
  const sy = Math.sin(bat.yaw), cy = Math.cos(bat.yaw), sl = Math.sin(bat.loft), cl = Math.cos(bat.loft);
  return { n: { x: sy * cl, y: sl, z: -cy * cl }, w: { x: cy, y: 0, z: sy }, u: { x: -sy * sl, y: cl, z: cy * sl } };
}
const dot = (a, b) => a.x*b.x+a.y*b.y+a.z*b.z;
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
// Swept sphere against a moving, oriented finite bat face. No frame tunnelling.
export function batContact(from, to, bat, oldBat = bat) {
  const { n, w, u } = batBasis(bat);
  const oldRel = subtract(from, oldBat), rel = subtract(to, bat);
  const d0 = dot(oldRel,n), d1 = dot(rel,n), radius = BALL.radius + 0.018;
  if (d0 < -radius || d1 > radius || d1 >= d0) return null;
  const t = clamp((d0 - radius) / (d0 - d1), 0, 1);
  const contact = { x: oldRel.x+(rel.x-oldRel.x)*t, y: oldRel.y+(rel.y-oldRel.y)*t, z: oldRel.z+(rel.z-oldRel.z)*t };
  const x = dot(contact,w), y = dot(contact,u);
  if (Math.abs(x) > 0.054+BALL.radius || Math.abs(y) > 0.31+BALL.radius) return null;
  return { x, y, t, normal: n, edge: Math.abs(x) > 0.047, quality: clamp(1-Math.abs(x)/0.11-Math.abs(y+0.035)/0.55,0.05,1) };
}
export function stepDelivery(d, config, dt = DT, bat = null, oldBat = bat) {
  const events = [];
  const from = { ...d.p }, a = airAcceleration(d.v, config, d);
  d.v.x += a.x*dt; d.v.y += a.y*dt; d.v.z += a.z*dt;
  d.p.x += d.v.x*dt; d.p.y += d.v.y*dt; d.p.z += d.v.z*dt;
  d.time += dt;
  if (!d.hit && bat) {
    const contact = batContact(from,d.p,bat,oldBat);
    if (contact) {
      const incoming = Math.hypot(d.v.x,d.v.y,d.v.z);
      const n = contact.normal;
      const batVelocity = { x: (bat.x-oldBat.x)/dt, y: (bat.y-oldBat.y)/dt, z: (bat.z-oldBat.z)/dt };
      const relV = subtract(d.v,batVelocity), vn = dot(relV,n);
      const cor = contact.edge ? 0.32 : 0.45+contact.quality*0.17;
      d.v.x -= (1+cor)*vn*n.x; d.v.y -= (1+cor)*vn*n.y; d.v.z -= (1+cor)*vn*n.z;
      if (contact.edge) d.v.x += (contact.x>0?1:-1)*incoming*0.30;
      d.p.x += n.x*0.065; d.p.y += n.y*0.065; d.p.z += n.z*0.065;
      d.hit = true; d.contact = contact; d.exitSpeed = Math.hypot(d.v.x,d.v.y,d.v.z)*3.6;
      d.contactTime=d.time;
      events.push({type:'contact',quality:contact.quality,edge:contact.edge,exitSpeed:d.exitSpeed});
    }
  }
  if (d.p.y <= BALL.radius+GROUND && d.v.y < 0) {
    const impactSpeed=-d.v.y;
    const pitch = PITCHES[config.pitch], onPitch = Math.abs(d.p.x) < 1.525 && d.p.z > -20 && d.p.z < 3;
    const variation = config.pitch === 'dry' ? (d.bounceNoise-0.5)*0.14 : (d.bounceNoise-0.5)*0.025;
    d.p.y = BALL.radius+GROUND;
    d.v.y = -d.v.y*(onPitch ? pitch.restitution+variation : 0.38);
    d.v.z *= 1-(onPitch ? pitch.friction : 0.30);
    d.v.x *= 1-pitch.friction;
    if (!d.hit && d.bounces === 0) {
      d.v.x += d.turn * d.spin * 0.018 * pitch.turn + d.seam * pitch.seam * Math.abs(d.v.z) * 0.095;
      d.bounce = { ...d.p };
    }
    d.bounces++;
    events.push({type:'bounce',impactSpeed,...d.p});
  }
  if (!d.resolved && d.p.z >= 1.18 && from.z < 1.18) {
    const t = (1.18-from.z)/(d.p.z-from.z);
    const x = from.x+(d.p.x-from.x)*t, y=from.y+(d.p.y-from.y)*t;
    const bowled = Math.abs(x) < 0.1143+BALL.radius && y < 0.711+BALL.radius;
    d.resolved = true;
    events.push({type:'result',result:bowled ? 'Bowled' : d.hit ? 'Contact' : 'Missed',x,y});
    if (bowled) { d.v.z *= -0.25; d.v.x += 1.2; d.v.y += 1; }
  }
  if (d.hit && !d.resolved && d.time-d.contactTime > 0.22) {
    const outside=d.contact.x*(config.hand==='left'?-1:1)>0;
    d.resolved = true; events.push({type:'result',result:d.contact.edge?(outside?'Outside edge':'Inside edge'):d.contact.quality>0.7?'Sweet spot':'Bat contact'});
  }
  // Nets absorb momentum; practice continues regardless of the outcome.
  if (Math.abs(d.p.x) > 2.87) { d.p.x=Math.sign(d.p.x)*2.87; d.v.x*=-0.12; d.v.z*=0.5; events.push({type:'net'}); }
  if (d.p.z < -23.7 || d.p.z > 3.2) {d.p.z=clamp(d.p.z,-23.7,3.2);d.v.z*=-0.10;d.v.x*=0.5;events.push({type:'net'});}
  if (d.p.y>5.75) {d.p.y=5.75;d.v.y*=-0.15;events.push({type:'net'});}
  if (d.path.length===0 || d.time-d.path.at(-1).t>=1/60) d.path.push({...d.p,t:d.time});
  return events;
}
