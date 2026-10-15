import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createBowler, bowlerLine, runupPosition, LINE } from '../dist/bowler.js';
import { BOWLERS, DEFAULTS, createDelivery, stepDelivery } from '../dist/physics.js';
const rig = createBowler({ ballMaterial: new THREE.MeshStandardMaterial() });
const point = new THREE.Vector3();
const pose = (phase, t, arm = 'right', bowler = 'fast', wicket = 'over') => {
  rig.animate(phase, t, { arm, bowler, wicket }); rig.group.updateMatrixWorld(true);
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

test('planted shoe tread meets the raised pitch surface', () => {
  const vertex = new THREE.Vector3();
  for (const arm of ['right', 'left']) for (const t of [1.97, 2.2, 2.53]) {
    pose(t <= 2.2 ? 'runup' : 'flight', t <= 2.2 ? t : t - 2.2, arm);
    const foot = rig.legs.find(l => l.side === (arm === 'right' ? 1 : -1)).foot;
    const positions = foot.geometry.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(foot.matrixWorld);
      lowest = Math.min(lowest, vertex.y);
    }
    assert.ok(Math.abs(lowest - .03) < .00001, `${arm} shoe floats or clips the pitch at ${t}: ${lowest}`);
  }
});

test('shoe upper, midsole and outsole remain joined across their width', () => {
  // Cast through the solid layers, including their outer edges where a stack
  // of elliptical sections used to leave centimetre-wide gaps. Count entries
  // and exits so harmless overlapping shells remain valid.
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const shoe = new THREE.Mesh(rig.legs[0].foot.geometry, material);
  shoe.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(0, 1, 0);
  for (const x of [-.05, -.04, -.02, 0, .02, .04, .05]) for (const z of [-.06, 0, .1]) {
    ray.set(new THREE.Vector3(x, -1, z), direction);
    let depth = 0, previous;
    for (const hit of ray.intersectObject(shoe)) {
      // The lower 65 mm includes the joined sole/upper, below the laces and
      // separately applied toe cap. A gap here is visible daylight, not trim.
      if (previous !== undefined && hit.point.y < -.07 && depth === 0) {
        assert.ok(hit.point.y - previous < .0002, `shoe gap at (${x}, ${z}): ${previous} to ${hit.point.y}`);
      }
      depth += hit.face.normal.y < 0 ? 1 : -1;
      previous = hit.point.y;
    }
  }
  material.dispose();
});

test('the articulated model stays within its small draw-call and geometry budget', () => {
  let meshes = 0, triangles = 0;
  rig.group.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.index.count / 3; } });
  assert.ok(meshes <= 14, `${meshes} model draw calls`);
  assert.ok(triangles < 10000, `${triangles} triangles`);
});

// Every vertex of every part, in world space, for the pose just set.
function worldVertices(callback) {
  const vertex = new THREE.Vector3();
  rig.group.traverse(o => {
    if (!o.isMesh) return;
    const positions = o.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) callback(vertex.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld), o.name);
  });
}

test('over and around the wicket mirror the line on either side of the stumps, for both arms', () => {
  assert.equal(bowlerLine({ arm: 'right', wicket: 'over' }), LINE.over);
  assert.equal(bowlerLine({ arm: 'left', wicket: 'over' }), -LINE.over);
  assert.equal(bowlerLine({ arm: 'right', wicket: 'around' }), -LINE.around);
  assert.equal(bowlerLine({ arm: 'left', wicket: 'around' }), LINE.around);
  assert.equal(bowlerLine({ arm: 'right' }), LINE.over, 'over the wicket unless told otherwise');
  for (const bowler of ['fast', 'offspin']) {
    pose('runup', 2.2, 'right', bowler, 'over'); const over = rig.heldBall.getWorldPosition(point).clone();
    pose('runup', 2.2, 'right', bowler, 'around'); const around = rig.heldBall.getWorldPosition(point).clone();
    assert.ok(over.x > .15 && over.x < .8, `right-arm over releases beside the stumps on the off side: ${over.x}`);
    assert.ok(around.x < -.15 && around.x > -.8, `right-arm around releases on the leg side: ${around.x}`);
    assert.ok(Math.abs(over.y - around.y) < 1e-9 && Math.abs(over.z - around.z) < 1e-9, 'only the line changes');
    pose('runup', 2.2, 'left', bowler, 'over'); const leftOver = rig.heldBall.getWorldPosition(point).clone();
    assert.ok(Math.abs(leftOver.x + over.x) < 1e-9, 'left-arm over mirrors right-arm over');
    const start = runupPosition({ arm: 'right', bowler, wicket: 'over' }, 0), release = runupPosition({ arm: 'right', bowler, wicket: 'over' }, 2.2);
    assert.equal(start.x, LINE.over); assert.ok(start.z > -23.7 && start.z < release.z && release.z < -17.7, `run-up from ${start.z} to ${release.z}`);
  }
});

test('no part of the bowler passes through the stumps at his end, over or around the wicket, either arm', () => {
  // The three stumps and bails at z = -18.9, with a margin round them.
  const inside = v => Math.abs(v.x) < .16 && v.y < .8 && Math.abs(v.z + 18.9) < .07;
  for (const arm of ['right', 'left']) for (const wicket of ['over', 'around']) for (const bowler of ['fast', 'legspin']) {
    for (let t = 0; t <= 4.4; t += .02) {
      pose(t <= 2.2 ? 'runup' : 'flight', t <= 2.2 ? t : t - 2.2, arm, bowler, wicket);
      worldVertices((v, name) => assert.ok(!inside(v), `${arm}-arm ${wicket} (${bowler}): ${name} inside the stumps at t=${t.toFixed(2)} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`));
    }
  }
});

test('the front foot lands with its heel behind the popping crease and the ball leaves from beyond the stumps', () => {
  for (const arm of ['right', 'left']) for (const wicket of ['over', 'around']) for (const t of [2.0, 2.2, 2.4]) {
    pose(t <= 2.2 ? 'runup' : 'flight', t <= 2.2 ? t : t - 2.2, arm, 'fast', wicket);
    const front = rig.legs.find(l => l.side === (arm === 'right' ? 1 : -1)).foot;
    let heel = Infinity, toe = -Infinity;
    const vertex = new THREE.Vector3(), positions = front.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) { vertex.fromBufferAttribute(positions, i).applyMatrix4(front.matrixWorld); heel = Math.min(heel, vertex.z); toe = Math.max(toe, vertex.z); }
    assert.ok(heel < -17.705 - .05, `${arm}/${wicket}: heel at ${heel.toFixed(3)} is not behind the popping crease at -17.705`);
    assert.ok(toe > -17.9, `${arm}/${wicket}: the foot lands up to the line, not well short of it (${toe.toFixed(3)})`);
  }
  // The hand comes over at or just ahead of the front foot, well past the stumps.
  pose('runup', 2.2); const release = rig.heldBall.getWorldPosition(point).clone(), ankle = rig.legs.find(l => l.side === 1).foot.getWorldPosition(point);
  assert.ok(release.z > -18.6 && Math.abs(release.z - ankle.z) < .25, `released over the front foot: hand ${release.z}, ankle ${ankle.z}`);
});
