import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createBowler } from '../dist/bowler.js';
import { BOWLERS, DEFAULTS, createDelivery, stepDelivery } from '../dist/physics.js';
const rig = createBowler({ ballMaterial: new THREE.MeshStandardMaterial() });
const point = new THREE.Vector3();
const pose = (phase, t, arm = 'right', bowler = 'fast') => {
  rig.animate(phase, t, { arm, bowler }); rig.group.updateMatrixWorld(true);
  const transforms = [];
  rig.group.traverse(o => { if (o.isMesh) transforms.push(...o.matrixWorld.elements); });
  return transforms;
};
const release = (arm, bowler) => { pose('runup', 2.2, arm, bowler); return rig.heldBall.getWorldPosition(point).clone(); };

test('the release pose is identical on both sides of the physics handoff', () => {
  for (const arm of ['right', 'left']) for (const bowler of Object.keys(BOWLERS)) {
    assert.deepEqual(pose('runup', 2.2, arm, bowler), pose('flight', 0, arm, bowler));
    const r = release(arm, bowler), l = release(arm === 'right' ? 'left' : 'right', bowler);
    assert.ok(Math.abs(r.x + l.x) < 1e-10); assert.ok(Math.abs(r.y - l.y) < 1e-10); assert.ok(Math.abs(r.z - l.z) < 1e-10);
    assert.ok(r.y > 1.95 && r.y < 2.3, `anatomical release height ${r.y}`);
    const config = { ...DEFAULTS, bowler, arm }, d = createDelivery(config, 42, r);
    assert.deepEqual(d.p, { x: r.x, y: r.y, z: r.z });
    while (!d.bounce && d.time < 3) stepDelivery(d, config);
    assert.ok(Math.abs(d.bounce.z - d.length) < .22, `${arm}/${bowler} length shifted after moving the hand`);
  }
});

test('delivery transitions stay continuous and valid when animation frames are skipped', () => {
  for (const arm of ['right', 'left']) for (const bowler of ['fast', 'offspin']) {
    let previous = pose('runup', 0, arm, bowler);
    assert.deepEqual(previous, pose('ready', 0, arm, bowler));
    for (let i = 1; i <= 4400; i++) {
      const t = i / 1000, next = pose(t <= 2.2 ? 'runup' : 'flight', t <= 2.2 ? t : t - 2.2, arm, bowler);
      for (let j = 0; j < next.length; j++) {
        assert.ok(Number.isFinite(next[j]), `${arm}/${bowler} invalid transform at ${t}`);
        assert.ok(Math.abs(next[j] - previous[j]) < .09, `${arm}/${bowler} snapped at ${t}`);
      }
      previous = next;
    }
    const direct = pose('flight', .39, arm, bowler); pose('ready', 0, arm, bowler);
    assert.deepEqual(pose('flight', .39, arm, bowler), direct);
  }
});

test('support feet plant on the pitch instead of sliding through the delivery', () => {
  for (const arm of ['right', 'left']) {
    let planted;
    for (let t = 1.97; t < 2.54; t += .025) {
      pose(t <= 2.2 ? 'runup' : 'flight', t <= 2.2 ? t : t - 2.2, arm);
      const front = rig.legs.find(l => l.side === (arm === 'right' ? 1 : -1));
      const foot = front.foot.getWorldPosition(point).clone();
      assert.ok(Math.abs(foot.y - .165) < .001, `foot left ground at ${t}: ${foot.y}`);
      if (planted) assert.ok(foot.distanceTo(planted) < .001, `planted foot drift at ${t}`);
      planted = foot;
      for (const leg of rig.legs) {
        assert.ok(Math.abs(leg.upper.position.distanceTo(leg.lower.position) - .455) < 1e-9);
        assert.ok(Math.abs(leg.lower.position.distanceTo(leg.foot.position) - .445) < 1e-9);
      }
    }
  }
});

test('the articulated model stays within its small draw-call and geometry budget', () => {
  let meshes = 0, triangles = 0;
  rig.group.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.index.count / 3; } });
  assert.ok(meshes <= 14, `${meshes} model draw calls`);
  assert.ok(triangles < 10000, `${triangles} triangles`);
});
