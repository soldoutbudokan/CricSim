import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL, DEFAULTS, DT, batContact, createDelivery, stepDelivery } from '../dist/physics.js';

const blade = { direct: true, active: true, x: 0, y: .8, z: 0, yaw: 0, loft: 0, roll: 0 };
test('direct blade catches either face and lateral entry while already at face depth', () => {
  const front = batContact({ x: 0, y: .8, z: -.2 }, { x: 0, y: .8, z: .2 }, blade);
  const back = batContact({ x: 0, y: .8, z: .2 }, { x: 0, y: .8, z: -.2 }, blade);
  const edge = batContact({ x: .2, y: .8, z: 0 }, { x: 0, y: .8, z: 0 }, blade);
  assert.ok(front && back && edge);
  assert.equal(front.normal.z, -1); assert.equal(back.normal.z, 1);
  assert.equal(edge.normal.x, 1); assert.equal(edge.edge, true);
  assert.ok(Math.abs(edge.t - (.2 - .054 - BALL.radius) / .2) < 1e-8);
});

test('direct blade has rounded sphere corners, finite size and no separating contact', () => {
  // Both expanded slabs overlap here, but the sphere misses the actual corner.
  assert.equal(batContact({ x: .083, y: 1.139, z: -.2 }, { x: .083, y: 1.139, z: .2 }, blade), null);
  assert.equal(batContact({ x: .2, y: .8, z: -.2 }, { x: .2, y: .8, z: .2 }, blade), null);
  assert.equal(batContact({ x: 0, y: .8, z: -.045 }, { x: 0, y: .8, z: -.2 }, blade), null);
  assert.equal(batContact({ x: 0, y: .8, z: -.1 }, { x: 0, y: .8, z: .1 }, { ...blade, x: .5 }), null);
});

function hit(bat = blade, previous = bat, { x = 0, y = .8, z = -.10, vx = 0, vy = 0, vz = 30 } = {}) {
  const ball = createDelivery(DEFAULTS, 42);
  ball.p = { x, y, z }; ball.v = { x: vx, y: vy, z: vz };
  const events = stepDelivery(ball, DEFAULTS, DT, bat, previous);
  return { ball, events };
}

test('held physical blade blocks, and actual bat translation changes the rebound', () => {
  const stationary = hit(), moving = hit({ ...blade, z: -.025 }, blade);
  assert.ok(stationary.ball.hit && moving.ball.hit);
  assert.ok(stationary.ball.v.z < 0);
  assert.ok(moving.ball.v.z < stationary.ball.v.z - 5, 'forward blade speed adds a real impulse');
  const asleep = hit({ ...blade, active: false });
  assert.equal(asleep.ball.hit, false);
});

test('rotation contributes contact-point speed without a scripted shot impulse', () => {
  const flat = hit(blade, blade, { y: .6 });
  const rotating = hit({ ...blade, loft: .10 }, blade, { y: .6 });
  assert.ok(flat.ball.hit && rotating.ball.hit);
  assert.ok(rotating.ball.v.z < flat.ball.v.z - 3, 'lower blade moving forwards adds rotational speed');
  assert.ok(Number.isFinite(rotating.ball.exitSpeed));
});

test('a moving edge can meet a near-stationary ball sideways without a face crossing', () => {
  const result = hit({ ...blade, x: .1 }, blade, { x: .13, z: 0, vz: 0 });
  assert.ok(result.ball.hit);
  assert.ok(result.ball.v.x > 10, 'the ball follows the actual edge normal and velocity');
});

test('a rotating grazing edge cannot pull a separating ball into a false hit', () => {
  // The local-frame chord crosses the rounded corner, but the actual contact
  // point is already separating at about .81 m/s. An impulse would pull the
  // ball towards the blade rather than repel an approaching ball.
  const old = { ...blade, x: .0871, y: .8, z: -.0241, yaw: -.3665, loft: -.3704, roll: -1.1881 };
  const bat = { ...old, x: .1248, y: .7886, z: -.0401, yaw: -.2891, loft: -.4702, roll: -1.2828 };
  const incoming = { x: .1086, y: .909, z: -.0696, vx: 2.0738, vy: .1364, vz: 38.5137 };
  const result = hit(bat, old, incoming), free = hit({ ...bat, active: false }, old, incoming);
  assert.equal(result.ball.hit, false);
  assert.equal(result.events.some(event => event.type === 'contact'), false);
  assert.deepEqual(result.ball.v, free.ball.v, 'a separating blade supplies no impulse');
  assert.deepEqual(result.ball.p, free.ball.p, 'a separating blade cannot teleport the ball');
});

test('a fast forward blade rebounds the ball from impact before finishing the step', () => {
  const bat = { ...blade, z: -20 * DT }, incoming = { z: -.10, vz: 40 };
  const result = hit(bat, blade, incoming), free = hit({ ...bat, active: false }, blade, incoming);
  assert.ok(result.ball.hit);
  assert.ok(result.ball.p.z < bat.z - .018 - BALL.radius, 'the rebound stays in front of the blade');
  const impactZ = incoming.z + (free.ball.p.z - incoming.z) * result.ball.contact.t;
  const endZ = impactZ + result.ball.v.z * DT * (1 - result.ball.contact.t);
  assert.ok(Math.abs(result.ball.p.z - endZ) < .001, 'the remaining time uses the post-impact velocity');
});

test('practice speed preserves the impulse of the same real-time hand motion', () => {
  for (const motion of [{ z: -.025 }, { loft: .08 }]) {
    const exits = [];
    for (const motionTimeScale of [1, .75, .5]) {
      const ball = createDelivery(DEFAULTS, 42), bat = { ...blade, ...motion, motionTimeScale };
      ball.p = { x: 0, y: .6, z: -.06 }; ball.v = { x: 0, y: 0, z: 30 };
      // Each endpoint pair is the same hand motion over one real-time tick.
      // Slow practice advances the ball through fewer simulation seconds.
      stepDelivery(ball, DEFAULTS, DT * motionTimeScale, bat, blade);
      assert.ok(ball.hit, `${JSON.stringify(motion)} at ${motionTimeScale}x makes contact`);
      exits.push(ball.v.z);
    }
    assert.ok(Math.max(...exits) - Math.min(...exits) < .05,
      `practice speed must not amplify the bat's impulse (${exits.join(', ')})`);
  }
});
