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
// Ball-to-ball pace spread in km/h (one standard deviation). Real bowlers vary a
// few km/h between deliveries; a mixed bag adds the occasional slower ball.
export const PACE_SPREADS = { none: 0, slight: 2, natural: 4, mixed: 7 };
export const DEFAULTS = { bowler: 'fast', arm: 'right', wicket: 'over', speed: 140, pitch: 'hard', length: 'good', line: 'off', weather: 'clear', wind: 0, age: 8, timeScale: 1, auto: false, guide: true, hand: 'right', audio: true, swipe: 'standard', speedSpread: 'none' };
const lengths = { yorker: -0.65, full: -2.1, good: -4.0, short: -7.0 };
const lines = { leg: -0.25, middle: 0, off: 0.30, wide: 0.70 };
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function airAcceleration(v, config, delivery) {
  const wind = config.wind / 3.6;
  const rx = v.x - wind, ry = v.y, rz = v.z;
  const speed = Math.hypot(rx, ry, rz);
  // Lumped drag and tunable side-force model. Coefficients need measured calibration.
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
export function createDelivery(config, seed = Date.now(), release = null) {
  const rng = random(seed), b = BOWLERS[config.bowler], arm = config.arm === 'left' ? -1 : 1;
  const length = config.length === 'mixed' ? Object.values(lengths)[Math.floor(rng() * 4)] : lengths[config.length];
  const hand = config.hand === 'left' ? -1 : 1;
  const targetLine = (config.line === 'mixed' ? (rng() - 0.35) * 1.0 : lines[config.line]) * hand;
  const delivery = { seed, swing: b.swing * arm, turn: b.turn * arm, spin: b.spin, seam: (rng() - 0.5) * b.seam, releaseY: b.turn ? 2.13 : 2.18, releaseZ: -17.7, speed: config.speed + (rng() - 0.5) * 3, length: length + (rng() - 0.5) * 0.22, targetLine, hit: false, bounces: 0, time: 0, resolved: false, seamNoise: rng(), bounceNoise: rng(), path: [] };
  if(release){delivery.releaseY=release.y;delivery.releaseZ=release.z;}
  const spread = PACE_SPREADS[config.speedSpread] ?? 0;
  if (spread > 0) {
    // Box-Muller from the same seeded stream, drawn after the other noise so
    // length, line and seam stay identical for a seed whatever the spread.
    // Clipped at 2.5 spreads: a natural variation never throws a wild ball.
    const u1 = Math.max(rng(), 1e-9), u2 = rng();
    const z = clamp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2), -2.5, 2.5);
    delivery.speed = Math.max(40, delivery.speed + z * spread);
  }
  const vz = delivery.speed / 3.6;
  const vy = initialVertical(vz, delivery.length, config, delivery);
  // Preserve the selected release speed after accounting for the downward angle.
  const adjustedZ = Math.sqrt(Math.max(16, vz * vz - vy * vy));
  const adjustedY = initialVertical(adjustedZ, delivery.length, config, delivery);
  // Without an animated hand, release from where the bowler's arm comes over:
  // beside the stumps over the wicket, on the far side of them around it.
  const releaseX = release?.x ?? (config.wicket === 'around' ? -0.45 : 0.55) * arm;
  const flightEstimate = -delivery.releaseZ / adjustedZ * 1.08;
  const vx = (targetLine - releaseX) / flightEstimate;
  delivery.p = { x: releaseX, y: delivery.releaseY, z: delivery.releaseZ };
  delivery.v = { x: vx, y: adjustedY, z: adjustedZ };
  delivery.speed = Math.hypot(vx, adjustedY, adjustedZ) * 3.6;
  delivery.path.push({ ...delivery.p, t: 0 });
  return delivery;
}
export function batBasis(bat) {
  const sy = Math.sin(bat.yaw), cy = Math.cos(bat.yaw), sl = Math.sin(bat.loft), cl = Math.cos(bat.loft);
  const w = { x: cy, y: 0, z: sy }, u = { x: -sy * sl, y: cl, z: cy * sl };
  const cr = Math.cos(bat.roll || 0), sr = Math.sin(bat.roll || 0);
  return { n: { x: sy * cl, y: sl, z: -cy * cl },
    w: { x:w.x*cr+u.x*sr,y:w.y*cr+u.y*sr,z:w.z*cr+u.z*sr },
    u: { x:u.x*cr-w.x*sr,y:u.y*cr-w.y*sr,z:u.z*cr-w.z*sr } };
}
const dot = (a, b) => a.x*b.x+a.y*b.y+a.z*b.z;
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
// Swept sphere against a moving, oriented finite bat face. No frame tunnelling.
export function batContact(from, to, bat, oldBat = bat) {
  if (bat.direct) return directBatContact(from, to, bat, oldBat);
  const { n, w, u } = batBasis(bat);
  const oldBasis=batBasis(oldBat);
  const oldRel = subtract(from, oldBat), rel = subtract(to, bat);
  const d0 = dot(oldRel,oldBasis.n), d1 = dot(rel,n), radius = BALL.radius + 0.018;
  if (d0 < -radius || d1 > radius || d1 >= d0) return null;
  const t = clamp((d0 - radius) / (d0 - d1), 0, 1);
  const x=dot(oldRel,oldBasis.w)+(dot(rel,w)-dot(oldRel,oldBasis.w))*t;
  const y=dot(oldRel,oldBasis.u)+(dot(rel,u)-dot(oldRel,oldBasis.u))*t;
  if (Math.abs(x) > 0.054+BALL.radius || Math.abs(y) > 0.31+BALL.radius) return null;
  return { x, y, t, normal: n, edge: Math.abs(x) > 0.047, quality: clamp(1-Math.abs(x)/0.11-Math.abs(y+0.035)/0.55,0.05,1) };
}

// Direct control can bring either face, an edge or the toe onto the ball. Sweep
// a sphere against the entire finite blade, not just a front-face crossing.
// At the 240 Hz physics step the endpoints are expressed in the moving blade's
// frame; between crossings of box planes the squared separation is quadratic.
// Solving those pieces catches lateral entry and rounded corners without
// enlarging the blade or depending on an attack/animation state.
function directBatContact(from, to, bat, oldBat) {
  const old = batBasis(oldBat), current = batBasis(bat);
  const a = subtract(from, oldBat), b = subtract(to, bat);
  const start = [dot(a, old.w), dot(a, old.u), dot(a, old.n)];
  const end = [dot(b, current.w), dot(b, current.u), dot(b, current.n)];
  const velocity = end.map((value, i) => value - start[i]);
  const half = [.054, .31, .018], cuts = [0, 1];
  for (let i = 0; i < 3; i++) if (Math.abs(velocity[i]) > 1e-12) {
    for (const side of [-1, 1]) {
      const t = (side * half[i] - start[i]) / velocity[i];
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  let time = null;
  for (let part = 1; part < cuts.length; part++) {
    const lo = cuts[part - 1], hi = cuts[part], mid = (lo + hi) / 2;
    let A = 0, B = 0, C = -(BALL.radius ** 2);
    for (let i = 0; i < 3; i++) {
      const q = start[i] + velocity[i] * mid;
      if (Math.abs(q) <= half[i]) continue;
      const offset = start[i] - Math.sign(q) * half[i];
      A += velocity[i] ** 2; B += 2 * velocity[i] * offset; C += offset ** 2;
    }
    if ((A * lo + B) * lo + C <= 1e-12) { time = lo; break; }
    if (A < 1e-18) continue;
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) continue;
    const root = (-B - Math.sqrt(discriminant)) / (2 * A);
    if (root >= lo - 1e-10 && root <= hi + 1e-10) { time = clamp(root, lo, hi); break; }
  }
  if (time === null) return null;
  const q = start.map((value, i) => value + velocity[i] * time);
  const point = q.map((value, i) => clamp(value, -half[i], half[i]));
  let normal = q.map((value, i) => value - point[i]);
  let length = Math.hypot(...normal);
  if (length < 1e-10) {
    // An already overlapping ball only responds when travelling farther into
    // its nearest surface. Do not manufacture a hit as it separates.
    const axis = half.map((value, i) => value - Math.abs(q[i])).reduce((best, value, i, values) => value < values[best] ? i : best, 0);
    normal = [0, 0, 0]; normal[axis] = Math.sign(q[axis]) || -Math.sign(velocity[axis]) || 1;
    length = 1; point[axis] = normal[axis] * half[axis];
  }
  normal = normal.map(value => value / length);
  if (normal.reduce((sum, value, i) => sum + value * velocity[i], 0) >= -1e-12) return null;
  const pose = {};
  for (const key of ['yaw', 'loft', 'roll']) pose[key] = (oldBat[key] || 0) + ((bat[key] || 0) - (oldBat[key] || 0)) * time;
  const basis = batBasis(pose), worldNormal = {};
  for (const axis of ['x', 'y', 'z']) worldNormal[axis] = basis.w[axis] * normal[0] + basis.u[axis] * normal[1] + basis.n[axis] * normal[2];
  const [x, y, depth] = point;
  return { x, y, depth, t: time, normal: worldNormal,
    edge: Math.abs(x) > .047 || Math.abs(normal[1]) > .5,
    quality: clamp(1 - Math.abs(x) / .11 - Math.abs(y + .035) / .55, .05, 1) };
}
// Closest approach over a physics step, using the same moving blade frame as
// contact detection. Sampling only the step's endpoint can overstate a near miss.
export function batMiss(from, to, bat, oldBat = bat) {
  const before = batBasis(oldBat), after = batBasis(bat);
  const a = subtract(from, oldBat), b = subtract(to, bat);
  const start = [dot(a, before.w), dot(a, before.u), dot(a, before.n)];
  const end = [dot(b, after.w), dot(b, after.u), dot(b, after.n)];
  const at = t => start.map((v, i) => v + (end[i] - v) * t);
  const distance = t => {
    const [x, y, depth] = at(t);
    return Math.hypot(Math.max(0, Math.abs(x) - .054), Math.max(0, Math.abs(y) - .31), Math.max(0, Math.abs(depth) - .018));
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const left = (2 * lo + hi) / 3, right = (lo + 2 * hi) / 3;
    if (distance(left) < distance(right)) hi = right; else lo = left;
  }
  const t = [0, (lo + hi) / 2, 1].reduce((best, candidate) => distance(candidate) < distance(best) ? candidate : best);
  const [x, y, depth] = at(t), pose = {};
  for (const axis of ['yaw', 'loft', 'roll']) pose[axis] = (oldBat[axis] || 0) + ((bat[axis] || 0) - (oldBat[axis] || 0)) * t;
  return { x, y, depth, gap: Math.max(0, distance(t) - BALL.radius), bat: pose };
}

export function stepDelivery(d, config, dt = DT, bat = null, oldBat = bat) {
  const events = [];
  const from = { ...d.p }, a = airAcceleration(d.v, config, d);
  d.v.x += a.x*dt; d.v.y += a.y*dt; d.v.z += a.z*dt;
  d.p.x += d.v.x*dt; d.p.y += d.v.y*dt; d.p.z += d.v.z*dt;
  d.time += dt;
  if (!d.hit && !d.resolved && bat && bat.active !== false) {
    const contact = batContact(from,d.p,bat,oldBat);
    if (contact) {
      const incoming = Math.hypot(d.v.x,d.v.y,d.v.z);
      const n = contact.normal;
      const currentBasis=batBasis(bat),previousBasis=batBasis(oldBat);
      const batVelocity={};
      for(const axis of ['x','y','z']){
        const now=bat[axis]+currentBasis.w[axis]*contact.x+currentBasis.u[axis]*contact.y+currentBasis.n[axis]*(contact.depth||0);
        const before=oldBat[axis]+previousBasis.w[axis]*contact.x+previousBasis.u[axis]*contact.y+previousBasis.n[axis]*(contact.depth||0);
        // Practice tempo slows the ball clock, not the player's hand. Direct
        // tracking advances in real seconds, so use real hand speed at impact
        // rather than granting extra shot power at half-speed practice.
        batVelocity[axis]=(now-before)/dt*(bat.direct ? bat.motionTimeScale ?? 1 : 1);
      }
      const relV = subtract(d.v,batVelocity), vn = dot(relV,n);
      // A rotating corner's linear sweep approximation can find a grazing
      // overlap while the actual surface is separating. Contact cannot pull
      // the ball back into the bat or count such a graze as a played shot.
      if (!bat.direct || vn < -1e-8) {
        const cor = bat.defending ? 0.13 : contact.edge ? 0.32 : 0.45+contact.quality*0.17;
        d.v.x -= (1+cor)*vn*n.x; d.v.y -= (1+cor)*vn*n.y; d.v.z -= (1+cor)*vn*n.z;
        if (contact.edge && !bat.direct) d.v.x += (contact.x>0?1:-1)*incoming*0.30;
        if (bat.direct) {
          // Finish the substep from the actual impact with the new velocity.
          // A fixed nudge of the pre-impact endpoint can otherwise put a fast
          // forward stroke's ball behind the blade for an entire frame.
          for (const axis of ['x', 'y', 'z']) d.p[axis] = from[axis] + (d.p[axis] - from[axis]) * contact.t
            + d.v[axis] * dt * (1 - contact.t) + n[axis] * .0001;
        } else {
          d.p.x += n.x*0.065; d.p.y += n.y*0.065; d.p.z += n.z*0.065;
        }
        d.hit = true; d.contact = contact; d.exitSpeed = Math.hypot(d.v.x,d.v.y,d.v.z)*3.6;
        d.contactTime=bat.direct ? d.time - dt * (1 - contact.t) : d.time;
        events.push({type:'contact',quality:contact.quality,edge:contact.edge,exitSpeed:d.exitSpeed});
      }
    }
  }
  // Nearest the ball came to the blade while it was in the batting zone: where
  // it passed in the bat's own frame, and the gap from the ball to the face.
  if (!d.hit && !d.resolved && bat && d.p.z > -1.6 && from.z < 1.18) {
    const miss = batMiss(from, d.p, bat, oldBat);
    if (!d.miss || miss.gap < d.miss.gap) d.miss = miss;
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
