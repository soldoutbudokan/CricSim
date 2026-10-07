import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import { DEFAULTS, DT, createDelivery, stepDelivery } from '../dist/physics.js';
import { createBatControl, moveBatTarget, startStroke, stepBat } from '../dist/bat-control.js';
import { qualityProfile } from '../dist/render-policy.js';
import { bladeGeometry } from '../dist/equipment.js';

// Execute the shipped scene and its modelling code. Only browser/GPU boundaries
// are replaced: all meshes, materials, matrices and geometry are real Three.js.
// This checks CPU-side construction and animation, not GLSL compilation or pixels.
async function bootScene() {
  assert.equal(typeof vm.SourceTextModule, 'function', 'run with --experimental-vm-modules');
  const requested = [], idle = [], resized = [], errors = [];
  const rect = { width: 1280, height: 720 };
  const canvas = { width: 1, height: 1, get clientWidth() { return rect.width; }, get clientHeight() { return rect.height; }, parentElement: { getBoundingClientRect: () => rect } };
  const makeCanvas = () => {
    const surface = { width: 300, height: 150 };
    const context = { canvas: surface };
    for (const method of ['arc', 'beginPath', 'bezierCurveTo', 'clearRect', 'closePath', 'drawImage', 'ellipse', 'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform', 'stroke', 'strokeRect', 'translate']) context[method] = () => {};
    context.createLinearGradient = context.createRadialGradient = () => ({ addColorStop() {} });
    context.createImageData = context.getImageData = (x, y, w = x, h = y) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    context.measureText = text => ({ width: text.length * 8 });
    surface.getContext = type => { assert.equal(type, '2d'); return context; };
    return surface;
  };
  class Renderer {
    constructor() {
      this.shadowMap = {};
      this.capabilities = { getMaxAnisotropy: () => 8 };
      this.info = { render: { calls: 0, triangles: 0 }, reset() { this.render.calls = this.render.triangles = 0; } };
    }
    setPixelRatio(value) { assert.ok(Number.isFinite(value) && value > 0); this.ratio = value; }
    getPixelRatio() { return this.ratio; }
    setSize(width, height) { canvas.width = Math.floor(width * this.ratio); canvas.height = Math.floor(height * this.ratio); }
    setViewport(...values) { assert.ok(values.every(Number.isFinite)); }
    setScissor(...values) { assert.ok(values.every(Number.isFinite)); }
    setScissorTest() {}
    getContext() { return { COLOR_BUFFER_BIT: 0x4000, colorMask() {}, clear() {} }; }
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const budget = sceneBudget(scene);
      this.info.render.calls = budget.draws;
      this.info.render.triangles = budget.triangles;
    }
  }
  class TextureLoader {
    async loadAsync(url) { assert.match(url, /^\.\/assets\//); requested.push(url); return new THREE.Texture(); }
  }
  const context = vm.createContext({
    document: { createElement(tag) { assert.equal(tag, 'canvas'); return makeCanvas(); } },
    window: { devicePixelRatio: 2, requestIdleCallback: callback => idle.push(callback) },
    ResizeObserver: class { constructor(callback) { resized.push(callback); } observe() {} },
    console: { ...console, error: (...args) => errors.push(args.join(' ')) },
    setTimeout: callback => idle.push(callback), clearTimeout() {},
  });
  const modules = new Map();
  async function load(url) {
    if (modules.has(url)) return modules.get(url);
    let mod;
    if (url.endsWith('/vendor/three.module.js') || url.endsWith('/vendor/HDRLoader.js')) {
      const exports = url.endsWith('/vendor/HDRLoader.js') ? { HDRLoader: TextureLoader } : { ...THREE, TextureLoader, WebGLRenderer: Renderer };
      mod = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
      }, { context, identifier: url });
    } else {
      mod = new vm.SourceTextModule(await fs.readFile(fileURLToPath(url), 'utf8'), { context, identifier: url });
    }
    modules.set(url, mod);
    await mod.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
    return mod;
  }
  const entry = await load(new URL('../dist/scene.js', import.meta.url).href);
  await entry.evaluate();
  const messages = [];
  const view = await entry.namespace.createScene(canvas, message => messages.push(message), qualityProfile('balanced'));
  while (idle.length) idle.shift()();
  assert.equal(requested.length, 9, 'all local ground and HDR assets requested');
  assert.equal(new Set(requested).size, 9, 'assets requested once');
  assert.ok(messages.length >= 9, 'scene reports asset-loading progress');
  assert.deepEqual(errors, [], 'scene construction reports no errors');
  return { view, canvas, rect, resized, errors };
}

function sceneBudget(scene) {
  let draws = 0, triangles = 0;
  scene.traverseVisible(object => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some(material => material.visible)) return;
    const geometry = object.geometry;
    const elements = geometry.index?.count ?? geometry.attributes.position.count;
    const count = Math.min(elements - geometry.drawRange.start, geometry.drawRange.count);
    if (count <= 0 || (object.isInstancedMesh && object.count === 0)) return;
    draws += Array.isArray(object.material) ? geometry.groups.length : 1;
    triangles += count / 3 * (object.isInstancedMesh ? object.count : 1);
  });
  return { draws, triangles: Math.ceil(triangles) };
}

function checkGeometry(geometry, label) {
  const position = geometry.attributes.position;
  assert.ok(position?.count > 0, `${label}: has vertices`);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert.equal(attribute.count, position.count, `${label}: ${name} vertex count`);
    assert.ok(attribute.array.every(Number.isFinite), `${label}: finite ${name}`);
  }
  if (geometry.index) {
    assert.ok(geometry.index.array.every(index => Number.isInteger(index) && index >= 0 && index < position.count), `${label}: valid vertex indices`);
  }
  const normal = geometry.attributes.normal;
  if (normal) for (let i = 0; i < normal.count; i++) {
    const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    // Three's LatheGeometry leaves its final profile-ring normals unnormalised;
    // the shader normalises them. Authored/merged surfaces should have unit ones.
    assert.ok(geometry.type === 'LatheGeometry' || length < 1e-6 || Math.abs(length - 1) < .025, `${label} ${geometry.name || geometry.type}: unit normal at ${i} (${length})`);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  for (const vector of [geometry.boundingBox.min, geometry.boundingBox.max, geometry.boundingSphere.center]) assert.ok(vector.toArray().every(Number.isFinite), `${label}: finite bounds`);
  assert.ok(Number.isFinite(geometry.boundingSphere.radius), `${label}: finite radius`);
}

function checkScene(scene, checked = new Set()) {
  scene.updateMatrixWorld(true);
  scene.traverse(object => {
    const label = object.name || `${object.type} ${object.id}`;
    assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${label}: finite world matrix`);
    if (object.isInstancedMesh) {
      assert.ok(Number.isInteger(object.count) && object.count >= 0 && object.count <= object.instanceMatrix.count, `${label}: valid instance count`);
      assert.ok(object.instanceMatrix.array.every(Number.isFinite), `${label}: finite instance transforms`);
      if (object.instanceColor) assert.ok(object.instanceColor.array.every(Number.isFinite), `${label}: finite instance colours`);
    }
    if (object.geometry && !checked.has(object.geometry)) { checkGeometry(object.geometry, label); checked.add(object.geometry); }
  });
  return checked;
}

function signedVolume(geometry) {
  const p = geometry.attributes.position, index = geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
  let volume = 0;
  for (let i = 0, count = index?.count ?? p.count; i < count; i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    volume += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return volume;
}

test('authored blade preserves the collision footprint and has an outward-facing striking surface', () => {
  const geometry = bladeGeometry();
  checkGeometry(geometry, 'blade');
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - .108) < 1e-6, 'blade remains 108 mm wide');
  assert.ok(Math.abs(size.y - .62) < 1e-6, 'blade remains 620 mm long');
  assert.ok(signedVolume(geometry) > 0, 'blade winding encloses a positive volume');
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const x of [-.05, 0, .05]) for (const y of [-.2, 0, .2]) {
    ray.set(new THREE.Vector3(x, y, -1), new THREE.Vector3(0, 0, 1));
    const [hit] = ray.intersectObject(mesh);
    assert.ok(hit, `front-culling ray hits the striking face at (${x}, ${y})`);
    assert.ok(Math.abs(hit.point.z + .012) < 1e-6, 'striking face stays on the collision-aligned plane');
    assert.ok(hit.face.normal.z < -.999, 'striking face points toward the delivery');
  }
  ray.set(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  const [back] = ray.intersectObject(mesh);
  assert.ok(back && back.point.z > .02 && back.face.normal.z > .5, 'raised spine also faces outward');
  geometry.dispose(); mesh.material.dispose();
});

test('real scene builds finite geometry and preserves mirrored glove winding within a practical mesh budget', async t => {
  const { view } = await bootScene();
  const geometries = checkScene(view.scene);
  assert.ok(geometries.size > 30, 'validation covers the complete environment and player models');
  const meshes = new Map();
  view.scene.traverse(object => { if (object.isMesh) meshes.set(object, object.geometry); });
  view.setEnvironment({ ...DEFAULTS, hand: 'left' });
  checkScene(view.scene, geometries);
  let mirrored = 0;
  for (const [mesh, right] of meshes) {
    if (mesh.geometry === right) continue;
    mirrored++;
    const left = mesh.geometry, rv = signedVolume(right), lv = signedVolume(left);
    assert.ok(rv > 0 && lv > 0, 'both hand variants keep outward triangle winding');
    assert.ok(Math.abs(rv - lv) < rv * 1e-5, 'mirroring preserves enclosed volume');
    const a = right.boundingBox, b = left.boundingBox;
    assert.ok(Math.abs(a.min.x + b.max.x) < 1e-6 && Math.abs(a.max.x + b.min.x) < 1e-6, 'hand variants mirror their x bounds');
  }
  assert.equal(mirrored, 2, 'both gloves swap to authored left-hand geometry');
  view.setQuality(qualityProfile('high')); view.render();
  const high = sceneBudget(view.scene);
  // Conservative submission counts before frustum culling; shadows and sprite
  // passes are not included. These are regression budgets, not measured GPU work.
  assert.ok(high.draws < 200, `mesh submission budget: ${high.draws}`);
  assert.ok(high.triangles < 250_000, `instanced triangle budget: ${high.triangles}`);
  view.setQuality(qualityProfile('eco')); view.render();
  const eco = sceneBudget(view.scene);
  assert.ok(eco.triangles < high.triangles, 'Eco reduces geometry submitted through grass instancing');
  assert.ok(eco.draws <= high.draws, 'Eco does not add draw submissions');
  t.diagnostic(JSON.stringify({ uniqueGeometries: geometries.size, meshSubmissions: { high, eco } }));
});

test('real scene handles all environments, handed batting, delivery effects, resize and quality changes', async () => {
  const { view, canvas, rect, resized, errors } = await bootScene();
  const { scene, camera } = view;
  const known = checkScene(scene);
  for (const hand of ['right', 'left']) for (const weather of ['clear', 'overcast', 'evening']) for (const pitch of ['hard', 'green', 'dry', 'soft']) {
    view.setEnvironment({ ...DEFAULTS, hand, weather, pitch, age: weather === 'evening' ? 80 : 0, wind: -20 });
    assert.ok(scene.background?.isTexture && scene.environment?.isTexture);
    assert.ok(scene.backgroundRotation.toArray().slice(0, 3).every(Number.isFinite));
    checkScene(scene, known);
  }
  for (const mode of ['eco', 'high', 'balanced']) {
    const quality = qualityProfile(mode);
    view.setQuality(quality);
    const info = view.getPerformanceInfo();
    assert.equal(info.quality, mode); assert.equal(info.shadows, quality.shadows);
    assert.equal(info.shadowSize, quality.shadowMapSize);
    assert.ok(info.pixelRatio <= quality.maxPixelRatio && canvas.width * canvas.height <= quality.maxPixels);
  }
  for (const [width, height] of [[390, 844], [1920, 1080]]) {
    rect.width = width; rect.height = height; resized.forEach(callback => callback());
    assert.equal(camera.aspect, width / height);
    assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
    const aim = view.pointerWorld(0, 0);
    assert.ok(aim?.toArray().every(Number.isFinite), 'camera still intersects the contact plane');
    assert.ok(Object.values(view.project(aim)).every(Number.isFinite));
  }
  view.setMenuFrame({ x: 80, y: 40, width: 1000, height: 700 }); view.render();
  view.setMenuFrame(null); view.render();
  for (const hand of ['right', 'left']) {
    const config = { ...DEFAULTS, hand, arm: hand };
    view.setEnvironment(config);
    const control = createBatControl(hand, 'standard');
    moveBatTarget(control, hand === 'left' ? -.5 : .5, .9); startStroke(control);
    for (let i = 0; i < 120; i++) {
      stepBat(control, DT); view.updateGaze(null, DT, false); view.updateBat(control.pose);
      view.animateBowler('runup', i / 120 * 2.2, config);
      if (i % 30 === 0) checkScene(scene, known);
    }
    view.animateBowler('runup', 2.2, config);
    const release = view.getReleasePosition();
    assert.ok(Object.values(release).every(Number.isFinite));
    const delivery = createDelivery(config, 4812, release);
    for (let i = 0; i < 300 && !delivery.resolved; i++) {
      stepDelivery(delivery, config, DT);
      view.updateBall(delivery, true); view.updateGaze(delivery, DT, false);
      view.animateBowler('flight', delivery.time, config);
      if (i % 30 === 0) { view.render(); checkScene(scene, new Set()); }
    }
    assert.ok(delivery.bounce, 'seeded delivery exercises bounce marks and dust');
    const hit = { ...delivery, hit: true, resolved: false, time: delivery.time + DT, exitSpeed: 90, contact: { x: hand === 'left' ? -.2 : .2, edge: false, quality: .9 } };
    view.updateBall(hit, true); view.updateGaze(hit, DT, false);
    view.hitWicket();
    for (let i = 0; i < 30; i++) view.updateGaze(hit, 1 / 60, false);
    view.render(); checkScene(scene, new Set());
    view.resetWicket(); view.updateBall(null, false); view.updateGaze(null, DT, true);
  }
  checkScene(scene, new Set());
  assert.deepEqual(errors, []);
});
