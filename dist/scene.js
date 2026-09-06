// CricSim scene: procedural textures, merged/instanced geometry, first-person batter rig.
// Every texture in here is generated on a canvas at load time; the only files loaded are
// the CC0 Poly Haven ground maps and HDR skies. No per-frame allocations in hot paths.
import * as THREE from './vendor/three.module.js';
import { HDRLoader } from './vendor/HDRLoader.js';
import { batBasis, random } from './physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
// Module-scope scratch objects: the hot paths below never allocate.
const _v = Array.from({ length: 14 }, () => new THREE.Vector3());
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c1 = new THREE.Color();
const _identity = new THREE.Matrix4();

// ---------------------------------------------------------------- build-time helpers
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
// Places a y-axis-aligned geometry (capsule, cylinder) between two points without stretching it.
function betweenMat(a, b, s = 1) {
  const d = new THREE.Vector3().subVectors(b, a), q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(.5), q, new THREE.Vector3(s, 1, s));
}
// Bakes several geometries (with per-part matrix, colour and uv scale) into one indexed geometry.
function mergeGeometries(parts) {
  let vertexCount = 0, indexCount = 0, hasColor = false;
  for (const p of parts) { vertexCount += p.g.attributes.position.count; indexCount += p.g.index ? p.g.index.count : p.g.attributes.position.count; if (p.c) hasColor = true; }
  const position = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3), uv = new Float32Array(vertexCount * 2);
  const color = hasColor ? new Float32Array(vertexCount * 3) : null, index = new Uint32Array(indexCount);
  const n3 = new THREE.Matrix3(), v = new THREE.Vector3(), col = new THREE.Color();
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, m = p.m || _identity, flip = m.determinant() < 0; n3.getNormalMatrix(m);
    const pos = g.attributes.position, nor = g.attributes.normal, uvs = g.attributes.uv, count = pos.count;
    const us = p.uv ? p.uv[0] : 1, vs = p.uv ? p.uv[1] : 1;
    if (color) col.set(p.c || '#ffffff');
    for (let k = 0; k < count; k++) {
      const o = (vo + k) * 3;
      v.fromBufferAttribute(pos, k).applyMatrix4(m); position[o] = v.x; position[o + 1] = v.y; position[o + 2] = v.z;
      if (nor) v.fromBufferAttribute(nor, k).applyMatrix3(n3).normalize(); else v.set(0, 1, 0);
      normal[o] = v.x; normal[o + 1] = v.y; normal[o + 2] = v.z;
      if (uvs) { uv[(vo + k) * 2] = uvs.getX(k) * us; uv[(vo + k) * 2 + 1] = uvs.getY(k) * vs; }
      if (color) { color[o] = col.r; color[o + 1] = col.g; color[o + 2] = col.b; }
    }
    const tri = (a, b, c) => { index[io++] = vo + a; if (flip) { index[io++] = vo + c; index[io++] = vo + b; } else { index[io++] = vo + b; index[io++] = vo + c; } };
    if (g.index) for (let k = 0; k < g.index.count; k += 3) tri(g.index.getX(k), g.index.getX(k + 1), g.index.getX(k + 2));
    else for (let k = 0; k < count; k += 3) tri(k, k + 1, k + 2);
    vo += count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (color) geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Bat blade lofted from 28 stations x 19-point cross-sections: flat face, square edges, a
// rounded spine rising to the sweet spot, rounded toe and narrowing shoulders with a splice.
function bladeGeometry() {
  const zFace = -0.012, N = 28, rings = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), y = -0.31 + t * 0.62;
    let hw = 0.054;
    if (y < -0.255) { const k = (y + 0.255) / 0.055; hw = Math.max(0.011, 0.054 * Math.sqrt(Math.max(0, 1 - k * k))); }
    else if (y > 0.225) { const k = (y - 0.225) / 0.085; hw = 0.054 - 0.026 * k * k; }
    const spine = y < -0.05 ? lerp(0.026, 0.042, smooth((y + 0.31) / 0.26)) : y < 0.03 ? 0.042 : lerp(0.042, 0.016, smooth((y - 0.03) / 0.28));
    const edge = Math.min(0.02, spine - 0.004), zEdge = zFace + edge, zSpine = zFace + spine, pts = [];
    const push = (x, z, u) => pts.push([x, y, z, u, t]);
    push(-hw, zFace, 0.25 - hw / 0.054 * 0.23); push(hw, zFace, 0.25 + hw / 0.054 * 0.23);
    push(hw, zFace, 0.49); push(hw, zEdge, 0.49);
    for (let j = 0; j <= 12; j++) { const s = 1 - j / 6, x = s * hw; push(x, zEdge + (zSpine - zEdge) * Math.pow(1 - Math.abs(s), 1.35), 0.75 + x / 0.054 * 0.23); }
    push(-hw, zEdge, 0.01); push(-hw, zFace, 0.01);
    rings.push(pts);
  }
  const P = rings[0].length, positions = [], uvs = [], index = [];
  for (const pts of rings) for (const [x, y, z, u, v] of pts) { positions.push(x, y, z); uvs.push(u, v); }
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < P - 1; j++) {
    if (j === 1 || j === 3 || j === 16) continue; // seams between duplicated corner vertices keep the edges crisp
    const a = i * P + j, b = a + 1, c = a + P + 1, d = a + P;
    index.push(a, c, b, a, d, c);
  }
  const cap = (ring, up) => {
    const base = positions.length / 3; let cx = 0, cz = 0; for (const p of ring) { cx += p[0]; cz += p[2]; }
    positions.push(cx / ring.length, ring[0][1], cz / ring.length); uvs.push(0.25, up ? 1 : 0);
    for (const [x, y, z, u, v] of ring) { positions.push(x, y, z); uvs.push(u, v); }
    for (let j = 0; j < ring.length; j++) { const a = base + 1 + j, b = base + 1 + (j + 1) % ring.length; if (up) index.push(base, b, a); else index.push(base, a, b); }
  };
  cap(rings[0], false); cap(rings[N - 1], true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index); geo.computeVertexNormals();
  return geo;
}

// A batting glove wrapped around a vertical handle at the origin: padded back on +x, four
// three-segment fingers curling round the front, thumb across the near side, flared cuff on +z.
function gloveGeometry(thumbUp, mirror) {
  const cream = '#efe9d6', green = '#1f3a2c', parts = [];
  const M = mirror ? new THREE.Matrix4().makeScale(-1, 1, 1) : _identity;
  const add = (g, m, c) => parts.push({ g, m: new THREE.Matrix4().multiplyMatrices(M, m), c });
  add(new THREE.SphereGeometry(1, 14, 10), mat4(0.044, 0, 0.012, 0, 0, 0, 0.023, 0.05, 0.044), cream);
  add(new THREE.SphereGeometry(1, 10, 8), mat4(0.058, 0, -0.008, 0, 0, 0, 0.012, 0.044, 0.02), cream); // knuckle ridge
  const rc = 0.031, a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let k = 0; k < 4; k++) {
    const yk = (k - 1.5) * 0.02, rf = 0.0135 - Math.abs(k - 1.5) * 0.0009;
    for (let s = 0; s < 3; s++) {
      const t0 = 0.35 + s * 0.78, t1 = t0 + 0.78;
      a.set(rc * Math.cos(t0), yk, -rc * Math.sin(t0)); b.set(rc * Math.cos(t1), yk, -rc * Math.sin(t1));
      add(new THREE.CapsuleGeometry(rf, a.distanceTo(b) - rf * .5, 3, 8), betweenMat(a, b), s === 2 ? green : cream);
    }
  }
  const ty = thumbUp ? 1 : -1;
  a.set(0.036, ty * 0.03, 0.03); b.set(-0.014, ty * 0.05, 0.024);
  add(new THREE.CapsuleGeometry(0.0125, 0.04, 3, 8), betweenMat(a, b), cream);
  add(new THREE.CylinderGeometry(0.05, 0.044, 0.05, 14, 1, false), mat4(0.034, 0, 0.078, Math.PI / 2), green);
  add(new THREE.TorusGeometry(0.046, 0.009, 6, 18), mat4(0.034, 0, 0.055, 0, 0, 0), cream); // padded wrist roll
  add(new THREE.BoxGeometry(0.028, 0.012, 0.006), mat4(0.082, 0, 0.078), cream); // strap tab
  return mergeGeometries(parts);
}

export async function createScene(canvas, onProgress = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const loader = new THREE.TextureLoader(), hdrLoader = new HDRLoader();
  let loaded = 0;
  const track = promise => promise.then(asset => { onProgress(`Loading the ground and light · ${++loaded}/9`); return asset; });
  const loadedAssets = await Promise.all([
    track(loader.loadAsync('./assets/sparse_grass_diff_1k.jpg')),
    track(loader.loadAsync('./assets/sparse_grass_nor_gl_1k.jpg')),
    track(loader.loadAsync('./assets/sparse_grass_rough_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_diff_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_nor_gl_1k.jpg')),
    track(loader.loadAsync('./assets/dirt_rough_1k.jpg')),
    track(hdrLoader.loadAsync('./assets/noon_grass_1k.hdr')),
    track(hdrLoader.loadAsync('./assets/lythwood_field_1k.hdr')),
    track(hdrLoader.loadAsync('./assets/evening_field_1k.hdr')),
  ]);
  onProgress('Weaving the nets…');
  const [turfColor, turfNormal, turfRoughness, earthColor, earthNormal, earthRoughness, daylight, overcastLight, eveningLight] = loadedAssets;
  for (const tex of [turfColor, earthColor]) tex.colorSpace = THREE.SRGBColorSpace;
  for (const tex of loadedAssets.slice(0, 6)) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = Math.min(16, maxAniso); }
  for (const hdr of [daylight, overcastLight, eveningLight]) hdr.mapping = THREE.EquirectangularReflectionMapping;
  // Azimuth of the photographed sun in each HDR (measured offline from the brightest texel).
  const HDR_SUN_AZIMUTH = { clear: -71.2, overcast: 133.4, evening: 37.8 };

  const rng = random(478293);
  const scene = new THREE.Scene();
  scene.background = daylight; scene.environment = daylight; scene.environmentIntensity = .5; scene.backgroundIntensity = 1;
  scene.fog = new THREE.Fog('#cdd9e2', 45, 260);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.035, 400);
  const cameraBase = new THREE.Vector3(0.02, 1.72, 0.98); camera.position.copy(cameraBase); camera.lookAt(0, .5, -12);
  const ambient = new THREE.HemisphereLight('#d7e6f5', '#4f5d36', .32); scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff4de', 4.2); sun.position.set(-24, 30, -6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.target.position.set(0, 0, -10); scene.add(sun, sun.target);
  const spots = [];
  for (const x of [-16, 16]) { const s = new THREE.SpotLight('#dfe8ff', 0, 70, .55, .6, 0); s.position.set(x, 13.5, 9); s.target.position.set(0, 0, -8); scene.add(s, s.target); spots.push(s); }

  // ---------------------------------------------------------------- texture helpers
  const texOf = (c, { srgb = false, repeat = null, clampEdge = false, aniso = 8 } = {}) => {
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(aniso, maxAniso); if (repeat) t.repeat.set(repeat[0], repeat[1]); return t;
  };
  // Colour from one canvas, coverage from another: transparent texels keep the surface colour
  // so mipmaps and bilinear edges never bleed black (no dark halos on nets, tufts or trees).
  function maskedTexture(colorCanvas, maskCanvas, opts = {}) {
    const w = colorCanvas.width, h = colorCanvas.height;
    const col = colorCanvas.getContext('2d').getImageData(0, 0, w, h).data, msk = maskCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h * 4; i += 4) { data[i] = col[i]; data[i + 1] = col[i + 1]; data[i + 2] = col[i + 2]; data[i + 3] = msk[i + 3]; }
    const t = new THREE.DataTexture(data, w, h); t.flipY = true; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = opts.clampEdge ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.anisotropy = Math.min(opts.aniso ?? 16, maxAniso); t.needsUpdate = true;
    return t;
  }
  function radialTexture(size, stops) {
    const c = makeCanvas(size, size), x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) g.addColorStop(o, col); x.fillStyle = g; x.fillRect(0, 0, size, size);
    return texOf(c, { srgb: true, clampEdge: true });
  }
  const noiseOn = (x, w, h, n, rgba, size = 1) => { for (let i = 0; i < n; i++) { x.fillStyle = rgba(); x.fillRect(rng() * w, rng() * h, size + rng() * size, size + rng() * size); } };

  // Net: one knotted 45 mm cell. Twine on the left and top edges, knot blobs at the corners.
  function netTexture() {
    const draw = (x, colored) => {
      const cord = (w, style, off = 0) => { x.strokeStyle = style; x.lineWidth = w; x.lineCap = 'round'; for (const [ax, ay, bx, by] of [[4 + off, -6, 4 + off, 134], [-6, 4 + off, 134, 4 + off]]) { x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); } };
      if (colored) { cord(8, '#12261a'); cord(6, '#2f5a3e'); cord(1.6, '#4d7d5a', -1.6); x.strokeStyle = '#1a3424'; x.lineWidth = 1.2; for (let i = -4; i < 134; i += 7) { x.beginPath(); x.moveTo(1, i); x.lineTo(7, i + 4); x.stroke(); x.beginPath(); x.moveTo(i, 1); x.lineTo(i + 4, 7); x.stroke(); } }
      else cord(7.5, '#ffffff');
      for (const [kx, ky] of [[4, 4], [4, 132], [132, 4], [132, 132]]) { x.fillStyle = colored ? '#254a33' : '#ffffff'; x.beginPath(); x.ellipse(kx, ky, 6.5, 6.5, 0, 0, TAU); x.fill(); if (colored) { x.fillStyle = '#3d6c4b'; x.beginPath(); x.ellipse(kx - 1.5, ky - 1.5, 2.5, 2.5, 0, 0, TAU); x.fill(); } }
    };
    const col = makeCanvas(128, 128), msk = makeCanvas(128, 128); const cx = col.getContext('2d'); cx.fillStyle = '#26492f'; cx.fillRect(0, 0, 128, 128); draw(cx, true); draw(msk.getContext('2d'), false);
    return maskedTexture(col, msk);
  }
  function skirtTexture() {
    const c = makeCanvas(256, 64), x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, '#1b3d2c'); g.addColorStop(.12, '#224a36'); g.addColorStop(1, '#152e21'); x.fillStyle = g; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#2a5a41'; x.fillRect(0, 0, 256, 4); x.fillStyle = '#0f2218'; x.fillRect(0, 4, 256, 1.5);
    noiseOn(x, 256, 64, 900, () => `rgba(${120 + rng() * 60},${130 + rng() * 40},${100 + rng() * 40},${.04 + rng() * .08})`, 1.5);
    for (let i = 0; i < 14; i++) { x.strokeStyle = `rgba(160,170,140,${.05 + rng() * .1})`; x.lineWidth = .8 + rng() * 2; x.beginPath(); const y = 8 + rng() * 54; x.moveTo(rng() * 256, y); x.lineTo(rng() * 256, y + (rng() - .5) * 8); x.stroke(); }
    return texOf(c, { srgb: true });
  }
  // Grass tuft: 13 tapered blades fanning from the base; colour on one canvas, coverage on another.
  function tuftTexture() {
    const blades = []; for (let i = 0; i < 13; i++) blades.push({ x0: 128 + (rng() - .5) * 70, lean: (rng() - .5) * 190, h: 150 + rng() * 100, w: 9 + rng() * 9, tone: rng() });
    const draw = (x, colored) => { for (const b of blades) {
      const cx = b.x0 + b.lean * .55, top = 256 - b.h;
      if (colored) { const g = x.createLinearGradient(0, 256, 0, top); g.addColorStop(0, `rgb(${52 + b.tone * 20},${78 + b.tone * 20},${34})`); g.addColorStop(.7, `rgb(${96 + b.tone * 35},${138 + b.tone * 30},${58 + b.tone * 10})`); g.addColorStop(1, `rgb(${150 + b.tone * 40},${178 + b.tone * 30},${92})`); x.fillStyle = g; } else x.fillStyle = '#fff';
      x.beginPath(); x.moveTo(b.x0 - b.w / 2, 258); x.quadraticCurveTo(cx - b.w * .2, 256 - b.h * .55, b.x0 + b.lean, top); x.quadraticCurveTo(cx + b.w * .2, 256 - b.h * .55, b.x0 + b.w / 2, 258); x.closePath(); x.fill(); } };
    const col = makeCanvas(256, 256), msk = makeCanvas(256, 256); const cx = col.getContext('2d'); cx.fillStyle = '#5d7a3a'; cx.fillRect(0, 0, 256, 256); draw(cx, true); draw(msk.getContext('2d'), false);
    return maskedTexture(col, msk, { clampEdge: true });
  }
  // Large-scale lawn mottle x mowing stripes, sampled by world position in the lawn shader.
  function mottleTexture() {
    const c = makeCanvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const r = 20 + rng() * 60, px = rng() * 256, py = rng() * 256; const gg = x.createRadialGradient(px, py, 0, px, py, r); const dark = rng() < .55; gg.addColorStop(0, dark ? `rgba(120,120,120,${.25 + rng() * .3})` : `rgba(255,255,255,${.2 + rng() * .3})`); gg.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = gg; x.fillRect(px - r, py - r, r * 2, r * 2); }
    for (let i = 0; i < 25; i++) { x.fillStyle = i % 2 ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.05)'; x.fillRect(i * 10.24, 0, 10.24, 256); }
    x.fillStyle = 'rgba(0,0,0,0.07)'; for (let i = 0; i < 25; i++) x.fillRect(i * 10.24 - 1, 0, 2, 256);
    const t = texOf(c); return t;
  }
  // Pitch wear layer blended over the dirt map: straw tint, roller lines, worn good-length band,
  // spike scuffs at both creases, bowler footmarks, plus cracks / grass / damp per pitch type.
  const pitchTextures = new Map();
  function pitchTexture(kind) {
    if (pitchTextures.has(kind)) return pitchTextures.get(kind);
    const c = makeCanvas(1024, 1024), x = c.getContext('2d');
    const py = z => 1024 * (z + 21) / 24, px = xx => 512 + xx * 1024 / 3.05;
    x.fillStyle = kind === 'soft' ? 'rgba(110,96,74,0.55)' : kind === 'dry' ? 'rgba(184,164,124,0.5)' : kind === 'green' ? 'rgba(150,148,104,0.45)' : 'rgba(172,152,110,0.5)'; x.fillRect(0, 0, 1024, 1024);
    if (kind === 'green') { x.globalAlpha = .38; for (let ty = 0; ty < 1024; ty += 85) for (let tx = 0; tx < 1024; tx += 671) x.drawImage(turfColor.image, tx, ty, 671, 85); x.globalAlpha = 1; }
    for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.025)'; x.fillRect(i * 100.7, 0, 100.7, 1024); }
    const soft = (cx, cy, rx, ry, rot, col, a) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0)); x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(rx, ry); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore(); };
    soft(px(0), py(-4.8), 380, 130, 0, 'rgba(112,92,60,A)', .22); soft(px(0.15), py(-16.4), 170, 60, 0, 'rgba(112,92,60,A)', .14);
    for (let i = 0; i < 46; i++) soft(px((rng() - .5) * 1.3), py(0.55 + (rng() - .5) * 2.4), 10 + rng() * 22, 4 + rng() * 8, rng() * 3, 'rgba(96,78,48,A)', .18 + rng() * .2);
    for (let i = 0; i < 30; i++) soft(px((rng() - .5) * 1.1), py(-17.2 + (rng() - .5) * 2.2), 8 + rng() * 18, 3 + rng() * 6, rng() * 3, 'rgba(96,78,48,A)', .16 + rng() * .18);
    for (let i = 0; i < 9; i++) { const side = i % 2 ? 1 : -1; soft(px(side * (0.25 + rng() * .3) + .35), py(-16.2 + i * .22 + rng() * .1), 22 + rng() * 10, 7 + rng() * 3, .3, 'rgba(90,72,44,A)', .28); }
    if (kind === 'dry') { x.strokeStyle = 'rgba(107,90,60,0.4)'; x.lineWidth = 1; for (let i = 0; i < 70; i++) { let cx = rng() * 1024, cy = rng() * 1024; x.beginPath(); x.moveTo(cx, cy); for (let j = 0; j < 8; j++) { cx += (rng() - .5) * 26; cy += (rng() - .3) * 20; x.lineTo(cx, cy); } x.stroke(); } }
    if (kind === 'soft') noiseOn(x, 1024, 1024, 2200, () => `rgba(70,62,44,${.05 + rng() * .1})`, 2);
    const t = texOf(c, { srgb: true, clampEdge: true, aniso: 16 }); pitchTextures.set(kind, t); return t;
  }
  function chalkTexture() {
    const col = makeCanvas(128, 16), msk = makeCanvas(128, 16); const cx = col.getContext('2d'), mx = msk.getContext('2d'); cx.fillStyle = '#f4f1e4'; cx.fillRect(0, 0, 128, 16);
    noiseOn(cx, 128, 16, 140, () => `rgba(190,182,160,${.1 + rng() * .25})`, 1); mx.fillStyle = '#fff';
    for (let i = 0; i < 128; i++) { const top = 3 + (rng() - .5) * 2.4, bottom = 13 + (rng() - .5) * 2.4; if (rng() < .04) continue; mx.fillRect(i, top, 1, bottom - top); }
    return maskedTexture(col, msk);
  }
  // Willow: left half = face (grain, sticker, ball marks, toe guard), right half = back (spine stain).
  function willowTextures() {
    const c = makeCanvas(512, 1024), x = c.getContext('2d'), b = makeCanvas(512, 1024), bx = b.getContext('2d');
    x.fillStyle = '#e8d5ae'; x.fillRect(0, 0, 512, 1024); bx.fillStyle = '#808080'; bx.fillRect(0, 0, 512, 1024);
    const g = x.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, 'rgba(255,240,210,0.18)'); g.addColorStop(.5, 'rgba(160,120,70,0.10)'); g.addColorStop(1, 'rgba(255,240,210,0.18)'); x.fillStyle = g; x.fillRect(0, 0, 512, 1024);
    for (let half = 0; half < 2; half++) for (let i = 0; i < 15; i++) {
      let gx = half * 256 + 10 + i * 16.5 + rng() * 6; const w = .5 + rng() * 1.1, a = .12 + rng() * .18;
      x.strokeStyle = `rgba(120,88,48,${a})`; x.lineWidth = w; bx.strokeStyle = `rgba(60,60,60,${a * 1.5})`; bx.lineWidth = w;
      x.beginPath(); bx.beginPath(); x.moveTo(gx, 0); bx.moveTo(gx, 0); for (let y = 0; y <= 1024; y += 64) { gx += (rng() - .5) * 4; x.lineTo(gx, y); bx.lineTo(gx, y); } x.stroke(); bx.stroke();
    }
    for (let i = 0; i < 30; i++) { const sx = rng() * 512, sy = rng() * 1024; x.fillStyle = `rgba(90,60,30,${.12 + rng() * .2})`; x.fillRect(sx, sy, 1 + rng() * 2, 4 + rng() * 26); }
    // Ball marks near the sweet spot on the face and a darker stain along the spine.
    for (let i = 0; i < 6; i++) { const cy = 1024 - (0.31 - 0.10 + (rng() - .5) * .2) / .62 * 1024, cx = 128 + (rng() - .5) * 90; x.fillStyle = `rgba(150,60,40,${.08 + rng() * .1})`; x.beginPath(); x.ellipse(cx, cy, 12 + rng() * 16, 9 + rng() * 10, rng() * 3, 0, TAU); x.fill(); }
    const sg = x.createLinearGradient(256, 0, 512, 0); sg.addColorStop(0, 'rgba(120,80,40,0)'); sg.addColorStop(.5, 'rgba(120,80,40,0.16)'); sg.addColorStop(1, 'rgba(120,80,40,0)'); x.fillStyle = sg; x.fillRect(256, 0, 256, 1024);
    // Splice V at the shoulders (both sides) and the rubber toe guard.
    for (const ox of [0, 256]) { x.fillStyle = 'rgba(110,78,40,0.35)'; x.beginPath(); x.moveTo(ox + 82, 0); x.lineTo(ox + 174, 0); x.lineTo(ox + 128, 150); x.closePath(); x.fill(); x.strokeStyle = 'rgba(60,40,20,0.5)'; x.lineWidth = 1.5; x.stroke(); }
    x.fillStyle = '#2b2a28'; x.fillRect(0, 1024 - 25, 512, 25); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(0, 1024 - 25, 512, 3); bx.fillStyle = '#606060'; bx.fillRect(0, 1024 - 25, 512, 25);
    // Face sticker: 75 x 190 mm rounded rectangle with a cream block.
    const sy0 = 1024 - (0.31 + 0.22) / .62 * 1024, sy1 = 1024 - (0.31 + 0.03) / .62 * 1024, sx0 = 128 - 0.0375 / 0.108 * 256, sw = 0.075 / 0.108 * 256;
    x.fillStyle = '#1d2b25'; x.beginPath(); x.roundRect(sx0, sy0, sw, sy1 - sy0, 10); x.fill();
    x.fillStyle = '#efe8d2'; x.fillRect(sx0 + 12, sy0 + 26, sw - 24, 60); x.fillStyle = '#c9f26b'; x.fillRect(sx0 + 12, sy0 + 92, sw - 24, 6);
    x.fillStyle = '#1d2b25'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.fillText('CRIC', 128, sy0 + 56); x.fillText('SIM', 128, sy0 + 80);
    x.fillStyle = '#efe8d2'; x.font = '600 12px sans-serif'; x.fillText('ENGLISH WILLOW', 128, sy1 - 22); x.fillText('GRADE 1', 128, sy1 - 8);
    return { map: texOf(c, { srgb: true, clampEdge: true, aniso: 16 }), bump: texOf(b, { clampEdge: true }) };
  }
  function gripTextures() {
    const c = makeCanvas(128, 512), x = c.getContext('2d'), b = makeCanvas(128, 512), bx = b.getContext('2d');
    x.fillStyle = '#1e3a2d'; x.fillRect(0, 0, 128, 512); bx.fillStyle = '#707070'; bx.fillRect(0, 0, 128, 512);
    for (let y = 0; y < 512; y += 8) { x.fillStyle = '#284a39'; x.fillRect(0, y, 128, 3.5); x.fillStyle = '#12261c'; x.fillRect(0, y + 3.5, 128, 1); bx.fillStyle = '#b0b0b0'; bx.fillRect(0, y, 128, 3); bx.fillStyle = '#404040'; bx.fillRect(0, y + 3.5, 128, 1.5); }
    for (const band of [96, 232, 368]) { x.fillStyle = 'rgba(180,210,150,0.32)'; x.fillRect(0, band, 128, 36); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, band + 40, 128, 4); }
    for (let i = 0; i < 12; i++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.moveTo(i * 11, 0); x.lineTo(i * 11 + 5, 0); x.lineTo(i * 11 + 16, 512); x.lineTo(i * 11 + 11, 512); x.closePath(); x.globalAlpha = .18; x.fill(); x.globalAlpha = 1; }
    return { map: texOf(c, { srgb: true, repeat: [2, 1] }), bump: texOf(b, { repeat: [2, 1] }) };
  }
  function quiltBump() {
    const c = makeCanvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const g = x.createRadialGradient(i * 32 + 16, j * 32 + 16, 0, i * 32 + 16, j * 32 + 16, 18); g.addColorStop(0, '#b8b8b8'); g.addColorStop(1, '#707070'); x.fillStyle = g; x.fillRect(i * 32, j * 32, 32, 32); }
    x.strokeStyle = '#505050'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 128); x.moveTo(0, i * 32); x.lineTo(128, i * 32); x.stroke(); }
    return texOf(c, { repeat: [3, 3] });
  }
  function knitBump() {
    const c = makeCanvas(64, 64), x = c.getContext('2d'); x.fillStyle = '#909090'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#606060'; x.lineWidth = 1.2;
    for (let y = 0; y < 64; y += 6) for (let i = 0; i < 64; i += 6) { x.beginPath(); x.moveTo(i, y); x.lineTo(i + 3, y + 4); x.lineTo(i + 6, y); x.stroke(); }
    return texOf(c, { repeat: [10, 10] });
  }
  function leatherBump() {
    const c = makeCanvas(256, 256), x = c.getContext('2d'); x.fillStyle = '#909090'; x.fillRect(0, 0, 256, 256);
    noiseOn(x, 256, 256, 6000, () => `rgba(${rng() < .5 ? 60 : 200},${rng() < .5 ? 60 : 200},${rng() < .5 ? 60 : 200},${.15 + rng() * .25})`, 1);
    return texOf(c, { repeat: [3, 2] });
  }
  function slatTextures() {
    const c = makeCanvas(64, 256), x = c.getContext('2d'), b = makeCanvas(64, 256), bx = b.getContext('2d');
    for (let i = 0; i < 4; i++) { const y = i * 64; const g = x.createLinearGradient(0, y, 0, y + 56); g.addColorStop(0, '#f4f5ef'); g.addColorStop(1, '#dfe2d8'); x.fillStyle = g; x.fillRect(0, y, 64, 56); x.fillStyle = '#9ea39a'; x.fillRect(0, y + 56, 64, 8); const gb = bx.createLinearGradient(0, y, 0, y + 56); gb.addColorStop(0, '#c0c0c0'); gb.addColorStop(1, '#a0a0a0'); bx.fillStyle = gb; bx.fillRect(0, y, 64, 56); bx.fillStyle = '#404040'; bx.fillRect(0, y + 56, 64, 8); }
    return { map: texOf(c, { srgb: true, repeat: [1, 14.7] }), bump: texOf(b, { repeat: [1, 14.7] }) };
  }
  function weatherboardBump() {
    const c = makeCanvas(64, 256), x = c.getContext('2d'); for (let i = 0; i < 16; i++) { const y = i * 16, g = x.createLinearGradient(0, y, 0, y + 16); g.addColorStop(0, '#a8a8a8'); g.addColorStop(.85, '#8a8a8a'); g.addColorStop(1, '#404040'); x.fillStyle = g; x.fillRect(0, y, 64, 16); }
    return texOf(c);
  }
  function stumpTexture() {
    const c = makeCanvas(32, 256), x = c.getContext('2d'); x.fillStyle = '#e9d8a8'; x.fillRect(0, 0, 32, 256);
    for (let i = 0; i < 6; i++) { x.strokeStyle = `rgba(150,120,70,${.15 + rng() * .2})`; x.lineWidth = .8; x.beginPath(); x.moveTo(i * 5 + 2, 0); x.lineTo(i * 5 + 2 + (rng() - .5) * 3, 256); x.stroke(); }
    x.fillStyle = '#1f3a2c'; x.fillRect(0, 0, 32, 14); x.fillStyle = '#6a6f6a'; x.fillRect(0, 245, 32, 11);
    return texOf(c, { srgb: true, clampEdge: true });
  }
  function clockTexture() {
    const c = makeCanvas(128, 128), x = c.getContext('2d'); x.fillStyle = '#2a3330'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#f2f1e6'; x.beginPath(); x.arc(64, 64, 56, 0, TAU); x.fill();
    x.strokeStyle = '#2a3330'; x.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; x.beginPath(); x.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); x.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52); x.stroke(); }
    x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + 28, 64 - 14); x.stroke(); x.beginPath(); x.moveTo(64, 64); x.lineTo(64 - 6, 64 - 38); x.stroke();
    return texOf(c, { srgb: true, clampEdge: true });
  }
  // ---------------------------------------------------------------- lawn
  const mottle = mottleTexture();
  for (const tex of [turfColor, turfNormal, turfRoughness]) tex.repeat.set(100, 100);
  const groundMat = new THREE.MeshStandardMaterial({ map: turfColor, normalMap: turfNormal, normalScale: new THREE.Vector2(.45, .45), roughnessMap: turfRoughness, color: '#a9bf80', roughness: 1 });
  groundMat.onBeforeCompile = shader => {
    shader.uniforms.mottleMap = { value: mottle };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vMottle;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMottle = (modelMatrix * vec4(transformed, 1.0)).xz * 0.0166;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D mottleMap;\nvarying vec2 vMottle;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(mottleMap, vMottle).r * 1.08;');
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ---------------------------------------------------------------- pitch strips, chalk
  for (const tex of [earthColor, earthNormal, earthRoughness]) tex.repeat.set(1.525, 12);
  const wearUniform = { value: pitchTexture('hard') };
  const pitchMat = new THREE.MeshPhysicalMaterial({ map: earthColor, normalMap: earthNormal, normalScale: new THREE.Vector2(.12, .12), roughnessMap: earthRoughness, color: '#a3946e', roughness: 1, clearcoat: 0, clearcoatRoughness: .5 });
  pitchMat.onBeforeCompile = shader => {
    shader.uniforms.wearMap = wearUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWear;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvWear = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D wearMap;\nvarying vec2 vWear;').replace('#include <map_fragment>', '#include <map_fragment>\nvec4 wearTexel = texture2D(wearMap, vWear);\ndiffuseColor.rgb = mix(diffuseColor.rgb, wearTexel.rgb, wearTexel.a);');
  };
  const PITCH_TOP = 0.03;
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 24), pitchMat); pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, PITCH_TOP, -9); pitch.receiveShadow = true; scene.add(pitch);
  const strips = [{ g: new THREE.BoxGeometry(3.05, PITCH_TOP, 24), m: mat4(0, PITCH_TOP / 2 - .003, -9) }];
  const sideMat = new THREE.MeshStandardMaterial({ map: earthColor, normalMap: earthNormal, normalScale: new THREE.Vector2(.1, .1), roughnessMap: earthRoughness, color: '#9f9574', roughness: 1 });
  for (const x of [-6.4, 6.4]) strips.push({ g: new THREE.PlaneGeometry(3.05, 25), m: mat4(x, PITCH_TOP - .005, -9, -Math.PI / 2), uv: [1.525, 12.5] });
  strips[0].uv = [1, 1]; // the edge box keeps the plain tint
  const sideStrips = new THREE.Mesh(mergeGeometries(strips), sideMat); sideStrips.receiveShadow = true; scene.add(sideStrips);
  const chalkMat = new THREE.MeshStandardMaterial({ map: chalkTexture(), color: '#ffffff', roughness: .95, alphaTest: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const chalkParts = [];
  const chalkLine = (x, z, w, d, ry) => chalkParts.push({ g: new THREE.PlaneGeometry(w, d), m: mat4(x, PITCH_TOP + .004, z, -Math.PI / 2, 0, ry), uv: [w / .8, 1] });
  for (const x of [0, -6.4, 6.4]) { for (const z of [0, -17.68]) chalkLine(x, z, 3.7, .045, 0); for (const z of [1.22, -18.9]) { chalkLine(x, z, 2.64, .04, 0); for (const side of [-1, 1]) chalkLine(x + side * 1.32, z + (z < 0 ? .4 : -.4), 2.8, .04, Math.PI / 2); } }
  const chalk = new THREE.Mesh(mergeGeometries(chalkParts), chalkMat); scene.add(chalk);

  // ---------------------------------------------------------------- nets
  const netMat = new THREE.MeshStandardMaterial({ map: netTexture(), color: '#ffffff', roughness: .85, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const windUniform = { value: 0 }, timeUniform = { value: 0 };
  netMat.onBeforeCompile = shader => {
    shader.uniforms.uWind = windUniform; shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * uWind * uv.y * sin(uTime * 1.9 + position.x * 0.45 + position.y * 0.7);');
  };
  const netPanel = (w, h, segsW, segsH, sag) => {
    const g = new THREE.PlaneGeometry(w, h, segsW, segsH), pos = g.attributes.position, uvs = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); const s = sag(x / w + .5, y / h + .5); pos.setXYZ(i, x + s[0], y + s[1], s[2]); uvs.setXY(i, uvs.getX(i) * w / .045, uvs.getY(i) * h / .045); }
    g.computeVertexNormals(); return g;
  };
  const bayFrac = (u, len, bay) => { const b = u * len / bay; return b - Math.floor(b); };
  const netMeshes = [];
  const addNet = (geo, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(geo, netMat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); scene.add(m); netMeshes.push(m); return m; };
  const sideGeo = netPanel(28, 5.8, 28, 6, (u, v) => [0, -0.07 * Math.sin(Math.PI * bayFrac(u, 28, 7)) * v, 0]);
  for (const x of [-9.6, -3.1, 3.1, 9.6]) addNet(sideGeo, x, 2.9, -10, Math.PI / 2);
  const endGeo = netPanel(19.2, 5.8, 20, 6, (u, v) => { const xx = (u - .5) * 19.2; const f = xx < -3.1 ? (xx + 9.6) / 6.5 : xx < 3.1 ? (xx + 3.1) / 6.2 : (xx - 3.1) / 6.5; return [0, -0.07 * Math.sin(Math.PI * f) * v, 0]; });
  addNet(endGeo, 0, 2.9, -24, 0); addNet(endGeo, 0, 2.9, 3.6, 0);
  const roofGeo = netPanel(19.2, 28, 20, 28, (u, v) => { const xx = (u - .5) * 19.2; const f = xx < -3.1 ? (xx + 9.6) / 6.5 : xx < 3.1 ? (xx + 3.1) / 6.2 : (xx - 3.1) / 6.5; return [0, 0, 0.14 * Math.sin(Math.PI * f) * Math.sin(Math.PI * bayFrac(v, 28, 7))]; });
  const roofNet = addNet(roofGeo, 0, 5.8, -10, 0, Math.PI / 2); void roofNet;
  const skirtMat = new THREE.MeshStandardMaterial({ map: skirtTexture(), roughness: .72, side: THREE.DoubleSide });
  const skirtParts = [];
  for (const x of [-9.6, -3.1, 3.1, 9.6]) skirtParts.push({ g: new THREE.PlaneGeometry(28, 1.0), m: mat4(x + Math.sign(x) * .012, .5, -10, 0, Math.PI / 2), uv: [14, 1] });
  skirtParts.push({ g: new THREE.PlaneGeometry(19.2, 1.0), m: mat4(0, .5, -24.02), uv: [9.6, 1] });
  const skirt = new THREE.Mesh(mergeGeometries(skirtParts), skirtMat); scene.add(skirt);
  const steelMat = new THREE.MeshStandardMaterial({ color: '#8d968f', metalness: .85, roughness: .38 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .046, 5.9, 10), steelMat, 20); posts.castShadow = true; posts.receiveShadow = true;
  const dummy = new THREE.Object3D(); let n = 0;
  for (const x of [-9.6, -3.1, 3.1, 9.6]) for (let z = -24; z <= 4; z += 7) { dummy.position.set(x, 2.95, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); posts.setMatrixAt(n++, dummy.matrix); }
  scene.add(posts);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .06, .06), steelMat, 31); bars.castShadow = true; n = 0;
  for (const x of [-9.6, -3.1, 3.1, 9.6]) for (let z = -24; z < 4; z += 7) { dummy.position.set(x, 5.82, z + 3.5); dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.set(7, 1, 1); dummy.updateMatrix(); bars.setMatrixAt(n++, dummy.matrix); }
  for (let z = -24; z <= 4; z += 7) for (const [x0, x1] of [[-9.6, -3.1], [-3.1, 3.1], [3.1, 9.6]]) { dummy.position.set((x0 + x1) / 2, 5.82, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(x1 - x0, 1, 1); dummy.updateMatrix(); bars.setMatrixAt(n++, dummy.matrix); }
  scene.add(bars);

  // ---------------------------------------------------------------- grass tufts
  const tuftGeo = mergeGeometries([{ g: new THREE.PlaneGeometry(.4, .28, 1, 3), m: mat4(0, .14, 0) }, { g: new THREE.PlaneGeometry(.4, .28, 1, 3), m: mat4(0, .14, 0, 0, Math.PI / 2) }]);
  const tuftMat = new THREE.MeshStandardMaterial({ map: tuftTexture(), roughness: 1, side: THREE.DoubleSide, alphaTest: .42 });
  tuftMat.onBeforeCompile = shader => {
    shader.uniforms.uWind = windUniform; shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += (0.02 + uWind * 0.6) * uv.y * uv.y * sin(uTime * 1.7 + instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.35);');
  };
  const TUFTS = 2600, tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFTS); tufts.receiveShadow = true;
  const lanes = [-6.4, 0, 6.4], nearStrip = x => lanes.some(l => Math.abs(x - l) < 1.85);
  n = 0;
  while (n < TUFTS) {
    let cx, cz;
    if (rng() < .6) { const lane = lanes[Math.floor(rng() * 3)], side = rng() < .5 ? -1 : 1; cx = lane + side * (1.9 + rng() * 1.3); cz = -25 + rng() * 29; } else { cx = (rng() - .5) * 56; cz = -38 + rng() * 48; }
    for (let k = 0; k < 6 && n < TUFTS; k++) {
      const x = cx + (rng() - .5) * 2.2, z = cz + (rng() - .5) * 2.2; if (nearStrip(x) && z > -22 && z < 4) continue; if (Math.abs(x) < 2.5 && z > 2) continue;
      dummy.position.set(x, 0, z); dummy.rotation.set(0, rng() * TAU, 0); const s = .6 + rng() * .7; dummy.scale.set(s, s * (.8 + rng() * .4), s); dummy.updateMatrix(); tufts.setMatrixAt(n, dummy.matrix);
      tufts.setColorAt(n, _c1.set('#5f7b39').lerp(_c1.clone().set('#8ba14e'), rng())); n++;
    }
  }
  scene.add(tufts);

  // ---------------------------------------------------------------- surroundings
  const creamMat = new THREE.MeshStandardMaterial({ color: '#ece8da', roughness: .85, bumpMap: weatherboardBump(), bumpScale: .012 });
  const slateMat = new THREE.MeshStandardMaterial({ color: '#3f4a44', roughness: .78 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#8a7658', roughness: .9 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#8fa7a0', roughness: .12, metalness: .1, envMapIntensity: 1.2 });
  const cream = [], slate = [], deck = [], glass = [];
  const roofPitch = Math.atan2(1.41, 3.5);
  const building = (cx, cz, w, h, d, roofY) => {
    const bump = [w / 2.4, h / 2.4];
    cream.push({ g: new THREE.PlaneGeometry(w, h), m: mat4(cx, h / 2, cz + d / 2), uv: bump }, { g: new THREE.PlaneGeometry(w, h), m: mat4(cx, h / 2, cz - d / 2, 0, Math.PI), uv: bump });
    cream.push({ g: new THREE.PlaneGeometry(d, h), m: mat4(cx + w / 2, h / 2, cz, 0, Math.PI / 2), uv: [d / 2.4, h / 2.4] }, { g: new THREE.PlaneGeometry(d, h), m: mat4(cx - w / 2, h / 2, cz, 0, -Math.PI / 2), uv: [d / 2.4, h / 2.4] });
    const rise = d / 2 * Math.tan(roofPitch), slab = d / 2 / Math.cos(roofPitch) + .5;
    slate.push({ g: new THREE.BoxGeometry(w + .8, .12, slab), m: mat4(cx, h + rise / 2 - .02, cz + d / 4 + .1, roofPitch) }, { g: new THREE.BoxGeometry(w + .8, .12, slab), m: mat4(cx, h + rise / 2 - .02, cz - d / 4 - .1, -roofPitch) });
    slate.push({ g: new THREE.BoxGeometry(w + .9, .14, .16), m: mat4(cx, h + rise, cz) });
    for (const sx of [-1, 1]) { const gable = new THREE.Shape(); gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.closePath(); cream.push({ g: new THREE.ShapeGeometry(gable), m: mat4(cx + sx * w / 2, h, cz, 0, sx * Math.PI / 2), uv: [d / 2.4, rise / 2.4] }); }
    void roofY;
  };
  // Pavilion: 19 x 7 m, veranda with six posts, glazed windows, a clock on the gable.
  building(24, -37, 19, 3.6, 7, 3.6);
  deck.push({ g: new THREE.BoxGeometry(19.4, .28, 2.4), m: mat4(24, .3, -32.4) }, { g: new THREE.BoxGeometry(3, .16, .8), m: mat4(24, .1, -30.9) });
  for (let i = 0; i < 6; i++) { const x = 15.2 + i * 3.52; cream.push({ g: new THREE.CylinderGeometry(.07, .07, 3.1, 8), m: mat4(x, 1.95, -31.35) }); }
  slate.push({ g: new THREE.BoxGeometry(19.6, .1, 2.9), m: mat4(24, 3.55, -32.2, .2) });
  cream.push({ g: new THREE.BoxGeometry(19.4, .06, .06), m: mat4(24, 1.35, -31.3) }); for (let i = 0; i < 40; i++) cream.push({ g: new THREE.BoxGeometry(.04, .95, .04), m: mat4(14.6 + i * .485, .9, -31.3) });
  for (let i = 0; i < 6; i++) { const x = 16.4 + i * 2.9; glass.push({ g: new THREE.PlaneGeometry(1.7, 1.5), m: mat4(x, 2.0, -33.47) }); cream.push({ g: new THREE.BoxGeometry(1.9, .08, .08), m: mat4(x, 2.8, -33.45) }, { g: new THREE.BoxGeometry(1.9, .08, .08), m: mat4(x, 1.2, -33.45) }, { g: new THREE.BoxGeometry(.08, 1.6, .08), m: mat4(x - .9, 2, -33.45) }, { g: new THREE.BoxGeometry(.08, 1.6, .08), m: mat4(x + .9, 2, -33.45) }, { g: new THREE.BoxGeometry(.05, 1.5, .06), m: mat4(x, 2, -33.46) }); }
  slate.push({ g: new THREE.BoxGeometry(1.0, 2.2, .1), m: mat4(24, 1.1, -33.44) });
  const clockFace = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: .6 })); clockFace.position.set(14.44, 4.2, -37); clockFace.rotation.y = -Math.PI / 2; scene.add(clockFace);
  // Groundsman's shed on the other side for balance.
  building(-21, -35, 6, 2.8, 4, 2.8);
  slate.push({ g: new THREE.BoxGeometry(.9, 1.9, .1), m: mat4(-21, .95, -32.95) });
  // Benches beside the lanes and a hedge behind the pavilion.
  for (const x of [-13.5, 13.5]) { for (let i = 0; i < 3; i++) deck.push({ g: new THREE.BoxGeometry(2.6, .05, .1), m: mat4(x, .48, -13.15 + i * .12) }); for (let j = 0; j < 2; j++) deck.push({ g: new THREE.BoxGeometry(2.6, .1, .05), m: mat4(x, .72 + j * .13, -13.32 - j * .035, -.25) }); for (const s of [-1, 1]) slate.push({ g: new THREE.BoxGeometry(.06, .46, .5), m: mat4(x + s * 1.2, .23, -13.05) }, { g: new THREE.BoxGeometry(.06, .45, .05), m: mat4(x + s * 1.2, .7, -13.3, -.25) }); }
  const hedge = new THREE.Mesh(new THREE.BoxGeometry(40, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: '#2f4a2a', roughness: 1, bumpMap: leatherBump(), bumpScale: .05 })); hedge.position.set(20, .8, -42.5); scene.add(hedge);
  const addMerged = (parts, material, shadow = true) => { if (!parts.length) return null; const m = new THREE.Mesh(mergeGeometries(parts), material); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
  addMerged(cream, creamMat); addMerged(slate, slateMat); addMerged(deck, deckMat); addMerged(glass, glassMat, false);
  // Sight screen: slatted 7 x 4 m board on a steel A-frame with wheels, behind the back net.
  const slats = slatTextures();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshStandardMaterial({ map: slats.map, bumpMap: slats.bump, bumpScale: .02, color: '#ffffff', roughness: .7 })); screen.position.set(0, 2.25, -26.5); screen.castShadow = true; screen.receiveShadow = true; scene.add(screen);
  const frame = [{ g: new THREE.PlaneGeometry(7, 4), m: mat4(0, 2.25, -26.55, 0, Math.PI) }];
  for (const x of [-3.3, 3.3]) { frame.push({ g: new THREE.BoxGeometry(.1, 4.3, .1), m: mat4(x, 2.3, -26.65, -.2) }, { g: new THREE.BoxGeometry(.1, 4.3, .1), m: mat4(x, 2.3, -27.1, .2) }, { g: new THREE.BoxGeometry(.08, .08, 1.8), m: mat4(x, .3, -26.9) }); for (const z of [-26.1, -27.7]) frame.push({ g: new THREE.CylinderGeometry(.2, .2, .1, 12), m: mat4(x, .2, z, 0, 0, Math.PI / 2) }); }
  addMerged(frame, new THREE.MeshStandardMaterial({ color: '#3a4441', metalness: .5, roughness: .5 }));
  // Floodlights: tapered poles with 2 x 3 lamp arrays; lamps glow after dark.
  const lampMat = new THREE.MeshStandardMaterial({ color: '#cfd6d2', roughness: .4, emissive: '#fff1c8', emissiveIntensity: 0 });
  const lightPositions = [[-13, -30], [13, -30], [-16, 9], [16, 9]], poles = [];
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .35, .25), lampMat, 24); n = 0;
  for (const [x, z] of lightPositions) { poles.push({ g: new THREE.CylinderGeometry(.06, .13, 14, 10), m: mat4(x, 7, z) }, { g: new THREE.BoxGeometry(1.9, .12, .2), m: mat4(x, 13.4, z) }, { g: new THREE.BoxGeometry(1.9, .12, .2), m: mat4(x, 13.9, z) }); for (let i = 0; i < 6; i++) { dummy.position.set(x - .6 + (i % 3) * .6, 13.4 + Math.floor(i / 3) * .5, z + (z < 0 ? .2 : -.2)); dummy.rotation.set(z < 0 ? .5 : -.5, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); lamps.setMatrixAt(n++, dummy.matrix); } }
  scene.add(lamps); addMerged(poles, steelMat);
  const glowTex = radialTexture(128, [[0, 'rgba(255,240,200,1)'], [.25, 'rgba(255,225,170,0.5)'], [1, 'rgba(255,220,160,0)']]);
  const glows = lightPositions.map(([x, z]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.position.set(x, 13.7, z); s.scale.setScalar(4); scene.add(s); return s; });
  // Perimeter fence; the photographed HDR tree line stays as the horizon.
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#d9d5c6', roughness: .85 });
  const fencePosts = new THREE.InstancedMesh(new THREE.BoxGeometry(.11, 1.2, .11), fenceMat, 40), rails = []; n = 0;
  for (let i = 0; i < 40; i++) { const a0 = -Math.PI * (.12 + i / 40 * .76), a1 = -Math.PI * (.12 + (i + 1) / 40 * .76); dummy.position.set(Math.cos(a0) * 46, .6, Math.sin(a0) * 46); dummy.rotation.set(0, -a0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); fencePosts.setMatrixAt(n++, dummy.matrix); const p0 = new THREE.Vector3(Math.cos(a0) * 46, 0, Math.sin(a0) * 46), p1 = new THREE.Vector3(Math.cos(a1) * 46, 0, Math.sin(a1) * 46); for (const y of [.55, 1.05]) { p0.y = p1.y = y; rails.push({ g: new THREE.BoxGeometry(.06, .1, p0.distanceTo(p1)), m: new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p1.clone().sub(p0).normalize()), new THREE.Vector3(1, 1, 1)) }); } }
  scene.add(fencePosts); addMerged(rails, fenceMat, false);

  // ---------------------------------------------------------------- wickets
  const stumpMat = new THREE.MeshStandardMaterial({ map: stumpTexture(), roughness: .6 }), bailMat = new THREE.MeshStandardMaterial({ color: '#d9c48f', roughness: .65 });
  const stumpGeo = new THREE.CylinderGeometry(.0175, .019, .711, 12), bailGeo = new THREE.CylinderGeometry(.011, .011, .10, 8);
  const otherStumps = new THREE.InstancedMesh(stumpGeo, stumpMat, 9), otherBails = new THREE.InstancedMesh(bailGeo, bailMat, 6); otherStumps.castShadow = true; n = 0; let nb = 0;
  for (const [x, z] of [[0, -18.9], [-6.4, -18.9], [6.4, -18.9]]) { for (const dx of [-.095, 0, .095]) { dummy.position.set(x + dx, .04 + .3555, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); otherStumps.setMatrixAt(n++, dummy.matrix); } for (const dx of [-.0475, .0475]) { dummy.position.set(x + dx, .04 + .716, z); dummy.rotation.set(0, 0, Math.PI / 2); dummy.updateMatrix(); otherBails.setMatrixAt(nb++, dummy.matrix); } }
  scene.add(otherStumps, otherBails);
  const wicket = new THREE.Group(); wicket.position.set(0, .04, 1.22); scene.add(wicket);
  const outerStumps = new THREE.Mesh(mergeGeometries([{ g: stumpGeo, m: mat4(-.095, .3555, 0) }, { g: stumpGeo, m: mat4(.095, .3555, 0) }]), stumpMat); outerStumps.castShadow = true; wicket.add(outerStumps);
  const middleStump = new THREE.Mesh(stumpGeo, stumpMat); middleStump.position.y = .3555; middleStump.castShadow = true; const middlePivot = new THREE.Group(); middlePivot.add(middleStump); wicket.add(middlePivot);
  const bails = [-.0475, .0475].map(dx => { const b = new THREE.Mesh(bailGeo, bailMat); b.position.set(dx, .716, 0); b.rotation.z = Math.PI / 2; wicket.add(b); return b; });
  const bailVel = [new THREE.Vector3(), new THREE.Vector3()], bailSpin = [new THREE.Vector3(), new THREE.Vector3()];
  let wicketHit = false, wicketTime = 0;
  function resetWicket() { wicketHit = false; wicketTime = 0; middlePivot.rotation.set(0, 0, 0); bails.forEach((b, i) => { b.position.set(i ? .0475 : -.0475, .716, 0); b.rotation.set(0, 0, Math.PI / 2); }); }
  function hitWicket() { if (wicketHit) return; wicketHit = true; wicketTime = 0; bailVel[0].set(-1.3, 2.6, 1.1); bailVel[1].set(1.1, 2.3, .8); bailSpin[0].set(9, 4, 12); bailSpin[1].set(-7, 6, 9); }
  function animateWicket(dt) {
    if (!wicketHit) return; wicketTime += dt;
    middlePivot.rotation.x = 1.1 * smooth(wicketTime / .35) + .12 * Math.sin(Math.min(wicketTime, .6) * 8) * Math.max(0, 1 - wicketTime / .6);
    for (let i = 0; i < 2; i++) { const b = bails[i], v = bailVel[i]; if (b.position.y <= .012 && wicketTime > .3) continue; v.y -= 9.81 * dt; b.position.addScaledVector(v, dt); b.rotation.x += bailSpin[i].x * dt; b.rotation.y += bailSpin[i].y * dt; if (b.position.y < .012) { b.position.y = .012; v.y *= -.3; v.x *= .6; v.z *= .6; bailSpin[i].multiplyScalar(.4); } }
  }

  // ---------------------------------------------------------------- bowler
  const bowler = new THREE.Group(); scene.add(bowler);
  const hips = new THREE.Group(); hips.position.y = .96; bowler.add(hips);
  const body = new THREE.Group(); body.position.y = .96; bowler.add(body);
  const shirt = new THREE.MeshStandardMaterial({ color: '#22403a', roughness: .9 }), trousers = new THREE.MeshStandardMaterial({ color: '#efeada', roughness: .95 }), skin = new THREE.MeshStandardMaterial({ color: '#9a6445', roughness: .84 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#e2e4d7', roughness: .7 }), sole = new THREE.MeshStandardMaterial({ color: '#4b6a53' }), hair = new THREE.MeshStandardMaterial({ color: '#302920' }), capMat = new THREE.MeshStandardMaterial({ color: '#17281f', roughness: .9 });
  const addPart = (geo, material, x, y, z, parent, shadow = true) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = shadow; parent.add(m); return m; };
  const torso = addPart(lathe([[.15, 0], [.156, .07], [.145, .2], [.17, .37], [.2, .46], [.17, .51]], 24), shirt, 0, -.02, 0, body); torso.scale.z = .72;
  const shoulders = addPart(new THREE.SphereGeometry(.21, 16, 12), shirt, 0, .46, 0, body); shoulders.scale.set(1, .38, .65);
  addPart(new THREE.CylinderGeometry(.06, .073, .12, 10), skin, 0, .57, 0, body);
  const head = addPart(new THREE.SphereGeometry(.116, 16, 12), skin, 0, .74, 0, body); head.scale.set(.84, 1.17, .92);
  const hairMesh = addPart(new THREE.SphereGeometry(.117, 12, 10), hair, 0, .8, -.015, body); hairMesh.scale.set(.88, .72, .9);
  addPart(new THREE.CylinderGeometry(.1, .105, .09, 12), capMat, 0, .84, 0, body); const brim = addPart(new THREE.CircleGeometry(.115, 12, -Math.PI / 2, Math.PI), capMat, 0, .80, .04, body, false); brim.rotation.x = -Math.PI / 2 + .15; brim.material.side = THREE.DoubleSide;
  addPart(new THREE.SphereGeometry(.021, 8, 6), skin, 0, .735, .104, body, false);
  const limbs = [];
  function limb(x, y, isArm, parent) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); parent.add(pivot);
    addPart(new THREE.CylinderGeometry(isArm ? .062 : .09, isArm ? .052 : .072, isArm ? .28 : .41, 10), isArm ? shirt : trousers, 0, isArm ? -.12 : -.2, 0, pivot);
    const lower = new THREE.Group(); lower.position.y = isArm ? -.27 : -.41; pivot.add(lower);
    addPart(new THREE.SphereGeometry(isArm ? .05 : .07, 10, 8), isArm ? skin : trousers, 0, 0, 0, lower);
    addPart(new THREE.CylinderGeometry(isArm ? .05 : .068, isArm ? .034 : .05, isArm ? .29 : .42, 10), isArm ? skin : trousers, 0, isArm ? -.14 : -.2, 0, lower);
    if (isArm) { const hand = addPart(new THREE.SphereGeometry(.047, 10, 8), skin, 0, -.3, 0, lower); hand.scale.set(.7, 1.15, .7); } else { addPart(new THREE.BoxGeometry(.12, .08, .25), shoe, 0, -.43, .05, lower); addPart(new THREE.BoxGeometry(.123, .021, .255), sole, 0, -.473, .05, lower, false); }
    limbs.push({ pivot, lower }); return { pivot, lower };
  }
  const rightArm = limb(-.225, .47, true, body), leftArm = limb(.225, .47, true, body), rightLeg = limb(-.105, 0, false, hips), leftLeg = limb(.105, 0, false, hips);
  const ballMat = new THREE.MeshPhysicalMaterial({ color: '#a3131f', roughness: .35, clearcoat: 1, clearcoatRoughness: .12, bumpMap: leatherBump(), bumpScale: .0006 });
  const heldBall = addPart(new THREE.SphereGeometry(.036, 14, 10), ballMat, 0, -.31, .035, rightArm.lower);
  const setLimb = (l, upper, low, z = 0) => { l.pivot.rotation.x = upper; l.pivot.rotation.z = z; l.lower.rotation.x = low; };
  let idleClock = 0;
  function animateBowler(phase, t, c) {
    const arm = c.arm === 'left' ? -1 : 1, spin = c.bowler.includes('spin');
    const bowling = arm > 0 ? rightArm : leftArm, other = arm > 0 ? leftArm : rightArm, front = arm > 0 ? leftLeg : rightLeg, back = arm > 0 ? rightLeg : leftLeg;
    if (heldBall.parent !== bowling.lower) bowling.lower.add(heldBall);
    heldBall.visible = phase === 'runup' || phase === 'intro' || phase === 'ready'; heldBall.position.set(0, -.31, .035);
    let z = -17.7, y = 0, lean = 0, twist = 0, sway = 0;
    if (phase === 'runup') {
      const z0 = spin ? -21.6 : -23.4, zb = -18.9;
      if (t < 1.45) {
        const s = t / 1.45, p = spin ? s : s * s * (3 - 2 * s) * .35 + s * .65; z = z0 + (zb - z0) * p;
        const stride = Math.sin(t * (spin ? 11 : 16)) * (spin ? .5 : .7), bob = Math.abs(Math.cos(t * (spin ? 11 : 16))); y = bob * (spin ? .02 : .04) * Math.min(1, t * 2); lean = (spin ? .06 : .16) * Math.min(1, t * 1.5);
        setLimb(back, stride, Math.max(0, -stride) * .9); setLimb(front, -stride, Math.max(0, stride) * .9);
        setLimb(bowling, -stride * .7, -.6); setLimb(other, stride * .7, -.6);
      } else if (t < 1.62) {
        const u = (t - 1.45) / .17; z = zb + .6 * u; y = .15 * Math.sin(Math.PI * u); twist = 1.05 * smooth(u); lean = .05;
        setLimb(back, .3, .9); setLimb(front, -.6, 1.2); setLimb(bowling, .3 + .3 * u, -.9); setLimb(other, -.9, -1.1, 0);
      } else if (t < 1.85) {
        const u = (t - 1.62) / .23; z = -18.3 + .3 * u; twist = 1.1; lean = -.16 * u;
        setLimb(back, .15, .55 - .3 * u); setLimb(front, lerp(-.6, .55, smooth(u)), lerp(1.2, .1, u)); setLimb(bowling, lerp(.6, 1.0, u), -.2); setLimb(other, lerp(-.9, -2.6, smooth(u)), -.3, 0);
      } else {
        const u = smooth((t - 1.85) / .35); z = -18 + .3 * u; twist = 1.1 * (1 - u); lean = lerp(-.16, .25, u); y = (spin ? .13 : .18) * u;
        setLimb(back, lerp(.15, -.55, u), .25 * (1 - u)); setLimb(front, lerp(.55, .35, u), 0); setLimb(bowling, lerp(1.0, -Math.PI, u), 0); setLimb(other, lerp(-2.6, -.4, u), -.3, 0);
      }
    } else if (phase === 'flight' || phase === 'result') {
      const p = Math.min(t / .5, 1), k = 1 - Math.exp(-t * 2.2); z = -17.7 + 3.2 * k; y = (spin ? .13 : .18) * Math.max(0, 1 - t / .22); lean = .25 * Math.max(0, 1 - t / .8) + .08 * Math.min(1, t / .8);
      const stride = Math.sin(t * 9) * .55 * Math.exp(-t * .9); setLimb(back, -.55 * (1 - p) + stride * p, Math.max(0, -stride) * .8); setLimb(front, .35 * (1 - p) - stride * p, Math.max(0, stride) * .8);
      setLimb(bowling, -Math.PI - p * 2.6 + stride * .3 * p, -.2 * p); setLimb(other, lerp(-.4, .3, p) + stride * .4 * p, -.4, 0);
    } else {
      // Idle at the top of the mark: weight shift, ball flipped in the bowling hand.
      const ic = idleClock; sway = .025 * Math.sin(ic * 1.9); lean = .03 + .02 * Math.sin(ic * .9);
      setLimb(back, .05, .1); setLimb(front, -.05, .12); setLimb(bowling, -.25 + .08 * Math.sin(ic * 1.3), -1.2); setLimb(other, -.35, -1.7, arm * .8);
      const flip = Math.max(0, Math.sin(ic * 1.4)); heldBall.position.set(0, -.31 + flip * flip * .18, .035 + flip * .05);
    }
    bowler.position.set(-.195 * arm + sway, y, z); body.rotation.set(lean, twist * arm, 0); hips.rotation.y = twist * arm * .45;
    heldBall.rotation.y = idleClock * 2;
  }

  // ---------------------------------------------------------------- ball, trail, markers
  const ballGroup = new THREE.Group(); ballGroup.scale.setScalar(1.2); scene.add(ballGroup); ballGroup.visible = false;
  const ball = addPart(new THREE.SphereGeometry(.036, 24, 18), ballMat, 0, 0, 0, ballGroup);
  const seamMat = new THREE.MeshStandardMaterial({ color: '#f1e5cf', roughness: .7 }), grooveMat = new THREE.MeshStandardMaterial({ color: '#5a0d14', roughness: .5 });
  for (const off of [-.0038, .0038]) { const s = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(.036 ** 2 - off ** 2) + .0004, .0009, 5, 64), seamMat); s.position.z = off; ballGroup.add(s); }
  const groove = new THREE.Mesh(new THREE.TorusGeometry(.0362, .0012, 4, 64), grooveMat); ballGroup.add(groove);
  const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(64, [[0, 'rgba(255,236,200,1)'], [.35, 'rgba(255,220,170,0.45)'], [1, 'rgba(255,210,150,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55 })); scene.add(ballGlow); ballGlow.visible = false;
  const shadowTex = radialTexture(64, [[0, 'rgba(10,20,12,1)'], [.5, 'rgba(10,20,12,0.55)'], [1, 'rgba(10,20,12,0)']]);
  const ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(.24, .24), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: .32, depthWrite: false })); ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow); ballShadow.visible = false;
  const TRAIL = 45, trailPos = new Float32Array(TRAIL * 2 * 3), trailFade = new Float32Array(TRAIL * 2), trailIndex = [];
  for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; trailIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  for (let i = 0; i < TRAIL; i++) { const f = i / (TRAIL - 1); trailFade[i * 2] = f; trailFade[i * 2 + 1] = f; }
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('aFade', new THREE.BufferAttribute(trailFade, 1)); trailGeo.setIndex(trailIndex); trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color('#fff2c6') } }, vertexShader: 'attribute float aFade;varying float vFade;void main(){vFade=aFade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'uniform vec3 uColor;varying float vFade;void main(){gl_FragColor=vec4(uColor*vFade*0.75,vFade*0.75);}', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const trail = new THREE.Mesh(trailGeo, trailMat); trail.frustumCulled = false; scene.add(trail); trail.visible = false;
  const bounceTex = radialTexture(128, [[0, 'rgba(230,252,175,0.9)'], [.55, 'rgba(230,252,175,0.35)'], [1, 'rgba(230,252,175,0)']]);
  const bounceMarker = new THREE.Mesh(new THREE.PlaneGeometry(.26, .26), new THREE.MeshBasicMaterial({ map: bounceTex, transparent: true, opacity: .85, depthWrite: false })); bounceMarker.rotation.x = -Math.PI / 2; bounceMarker.visible = false; scene.add(bounceMarker);
  const MARKS = 40, marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(.09, .09), new THREE.MeshBasicMaterial({ map: radialTexture(64, [[0, 'rgba(122,104,66,0.5)'], [.6, 'rgba(122,104,66,0.25)'], [1, 'rgba(122,104,66,0)']]), transparent: true, depthWrite: false }), MARKS);
  for (let i = 0; i < MARKS; i++) { dummy.position.set(0, -5, 0); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); marks.setMatrixAt(i, dummy.matrix); }
  scene.add(marks); let markIndex = 0;
  const DUST = 24, dustPos = new Float32Array(DUST * 3), dustVel = new Float32Array(DUST * 3), dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: radialTexture(32, [[0, 'rgba(214,196,150,0.7)'], [1, 'rgba(214,196,150,0)']]), size: .12, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })); dust.frustumCulled = false; scene.add(dust);
  let dustTime = 9, bounceTime = 9, markedDelivery = null, hitDelivery = null;
  function updateBall(d, guide) {
    ballGroup.visible = !!d; ballShadow.visible = !!d; trail.visible = guide && !!d; bounceMarker.visible = Boolean(d && d.bounce) && guide;
    if (!d) { ballGlow.visible = false; return; }
    ballGroup.position.set(d.p.x, d.p.y, d.p.z); ballGroup.rotation.set(d.time * d.spin * .21, d.time * d.spin, d.time * 14);
    ballShadow.position.set(d.p.x, PITCH_TOP + .004, d.p.z); ballShadow.scale.setScalar(.5 + d.p.y * .45); ballShadow.material.opacity = Math.max(.05, .34 - d.p.y * .05);
    const dist = camera.position.distanceTo(ballGroup.position);
    ballGlow.visible = !d.hit && dist > 3; if (ballGlow.visible) { ballGlow.position.copy(ballGroup.position); ballGlow.scale.setScalar(Math.max(.1, dist * .011)); ballGlow.material.opacity = .5 * smooth((dist - 3) / 4); }
    if (d.bounce && markedDelivery !== d) {
      markedDelivery = d; bounceTime = 0; dustTime = 0; bounceMarker.position.set(d.bounce.x, PITCH_TOP + .006, d.bounce.z);
      dummy.position.set(d.bounce.x + (rng() - .5) * .01, PITCH_TOP + .005, d.bounce.z); dummy.rotation.set(-Math.PI / 2, 0, rng() * TAU); dummy.scale.setScalar(.8 + rng() * .6); dummy.updateMatrix(); marks.setMatrixAt(markIndex++ % MARKS, dummy.matrix); marks.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < DUST; i++) { dustPos[i * 3] = d.bounce.x; dustPos[i * 3 + 1] = PITCH_TOP + .02; dustPos[i * 3 + 2] = d.bounce.z; const a = rng() * TAU, s = .3 + rng() * .9; dustVel[i * 3] = Math.cos(a) * s; dustVel[i * 3 + 1] = .4 + rng() * 1.2; dustVel[i * 3 + 2] = Math.sin(a) * s * .6 - .4; }
    }
    if (d.hit && hitDelivery !== d) { hitDelivery = d; const strength = clamp(d.exitSpeed / 110, .2, 1); kick.set((d.contact.x > 0 ? -1 : 1) * .004 * strength, -.012 * strength, .006 * strength); kickRoll = (d.contact.edge ? .012 : .006) * strength * (d.contact.x > 0 ? 1 : -1); flash = .6 + .4 * d.contact.quality; }
    const len = d.path.length, start = Math.max(0, len - TRAIL), count = len - start;
    if (count >= 2) {
      const camDir = _v[0].subVectors(camera.position, ballGroup.position).normalize(), side = _v[1], dir = _v[2];
      for (let i = 0; i < count; i++) {
        const p = d.path[start + i], q = d.path[start + Math.min(count - 1, i + 1)], r = d.path[start + Math.max(0, i - 1)];
        dir.set(q.x - r.x, q.y - r.y, q.z - r.z); if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); side.crossVectors(dir, camDir).normalize();
        const w = lerp(.006, .03, i / (count - 1)) * .5, o = (TRAIL - count + i) * 6, f = i / (count - 1); trailFade[(TRAIL - count + i) * 2] = f; trailFade[(TRAIL - count + i) * 2 + 1] = f;
        trailPos[o] = p.x + side.x * w; trailPos[o + 1] = p.y + side.y * w; trailPos[o + 2] = p.z + side.z * w; trailPos[o + 3] = p.x - side.x * w; trailPos[o + 4] = p.y - side.y * w; trailPos[o + 5] = p.z - side.z * w;
      }
      trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.aFade.needsUpdate = true; trailGeo.setDrawRange((TRAIL - count) * 6, (count - 1) * 6);
    } else trailGeo.setDrawRange(0, 0);
  }
  function animateEffects(dt) {
    if (bounceTime < 9) { bounceTime += dt; bounceMarker.scale.setScalar(.2 + .8 * smooth(bounceTime / .12)); }
    if (dustTime < .45) { dustTime += dt; for (let i = 0; i < DUST; i++) { dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt; dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt; dustVel[i * 3 + 1] -= 3 * dt; } dustGeo.attributes.position.needsUpdate = true; dust.material.size = .1 + dustTime * .7; dust.material.opacity = .55 * (1 - dustTime / .45); dust.visible = true; } else dust.visible = false;
  }

  // ---------------------------------------------------------------- bat, gloves, arms, body
  const batGroup = new THREE.Group(); scene.add(batGroup);
  const willow = willowTextures();
  const wood = new THREE.MeshPhysicalMaterial({ map: willow.map, bumpMap: willow.bump, bumpScale: .0008, roughness: .55, clearcoat: .35, clearcoatRoughness: .45 });
  const blade = new THREE.Mesh(bladeGeometry(), wood); blade.castShadow = true; blade.receiveShadow = true; batGroup.add(blade);
  const gripTex = gripTextures();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.0165, .018, .29, 20), new THREE.MeshStandardMaterial({ map: gripTex.map, bumpMap: gripTex.bump, bumpScale: .0015, roughness: .92 })); handle.position.y = .455; handle.scale.z = .85; handle.castShadow = true; batGroup.add(handle);
  const gloveMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, bumpMap: quiltBump(), bumpScale: .0025 });
  const gloveGeos = { right: gloveGeometry(true, false), rightTop: gloveGeometry(false, false), left: gloveGeometry(true, true), leftTop: gloveGeometry(false, true) };
  const gloves = [new THREE.Mesh(gloveGeos.right, gloveMat), new THREE.Mesh(gloveGeos.rightTop, gloveMat)];
  for (const g of gloves) { g.castShadow = true; scene.add(g); }
  const armMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, bumpMap: knitBump(), bumpScale: .0012 });
  const SKIN = '#b5865f', SWEATER = '#ece6d3', TRIM = '#1f3a2c', L_UPPER = .5, L_FORE = .36;
  const forearmGeo = mergeGeometries([
    { g: lathe([[.034, -.01], [.036, 0], [.039, .06], [.042, .12], [.041, .15]], 18), c: SKIN },
    { g: lathe([[.043, .13], [.047, .16], [.049, .26], [.047, L_FORE]], 18), c: SWEATER },
    { g: new THREE.TorusGeometry(.044, .011, 8, 20), m: mat4(0, .135, 0, Math.PI / 2), c: TRIM },
    { g: new THREE.SphereGeometry(.05, 14, 10), m: mat4(0, L_FORE, 0), c: SWEATER },
  ]);
  const upperGeo = mergeGeometries([{ g: lathe([[.046, 0], [.05, .12], [.053, .3], [.055, .42], [.05, L_UPPER]], 18), c: SWEATER }]);
  const arms = [0, 1].map(() => ({ fore: new THREE.Mesh(forearmGeo, armMat), upper: new THREE.Mesh(upperGeo, armMat) }));
  for (const a of arms) { a.fore.castShadow = true; a.upper.material = armMat; a.upper.material.side = THREE.DoubleSide; scene.add(a.fore, a.upper); }
  const padMat = new THREE.MeshStandardMaterial({ color: '#f4f1e6', roughness: .85, bumpMap: quiltBump(), bumpScale: .004 });
  const padGeo = mergeGeometries([
    { g: lathe([[.06, 0], [.095, .04], [.1, .3], [.095, .5], [.08, .62]], 16), m: mat4(0, 0, 0, 0, 0, 0, 1, 1, .55) },
    { g: new THREE.CapsuleGeometry(.045, .12, 3, 10), m: mat4(0, .4, .04, 0, 0, Math.PI / 2) }, { g: new THREE.CapsuleGeometry(.045, .12, 3, 10), m: mat4(0, .47, .05, 0, 0, Math.PI / 2) }, { g: new THREE.CapsuleGeometry(.045, .12, 3, 10), m: mat4(0, .54, .045, 0, 0, Math.PI / 2) },
  ]);
  const pads = [new THREE.Mesh(padGeo, padMat), new THREE.Mesh(padGeo, padMat)]; for (const p of pads) scene.add(p);
  const shoulderBase = [new THREE.Vector3(.21, 1.38, 1.02), new THREE.Vector3(-.21, 1.38, 1.02)];
  let hand = 'right', handSign = 1, lastBatX = .25, lastBatY = .44, lastBatZ = -.12, batSpeed = 0;
  const wristLocal = new THREE.Vector3(.034, 0, .105), gloveY = [.40, .51];
  const kick = new THREE.Vector3(), headOffset = new THREE.Vector3(), headVel = new THREE.Vector3(); let kickRoll = 0, headRoll = 0, headRollVel = 0, flash = 0;
  function setHand(h) {
    if (h === hand) return; hand = h; handSign = h === 'left' ? -1 : 1;
    gloves[0].geometry = h === 'left' ? gloveGeos.left : gloveGeos.right; gloves[1].geometry = h === 'left' ? gloveGeos.leftTop : gloveGeos.rightTop;
    shoulderBase[0].x = .21 * handSign; shoulderBase[1].x = -.21 * handSign;
  }
  // Two-bone analytic IK: fixed bone lengths, elbow pole out-and-down, torso lean absorbs overreach.
  function solveArm(i, wristW, shoulderW) {
    const side = (i === 0 ? 1 : -1) * handSign, S = _v[3].copy(shoulderW), axis = _v[4].subVectors(wristW, S);
    let d = axis.length(); const reach = L_UPPER + L_FORE - .01;
    if (d > reach) { S.addScaledVector(axis, (d - reach) / d); d = reach; }
    axis.divideScalar(d);
    const a = (L_UPPER * L_UPPER - L_FORE * L_FORE + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L_UPPER * L_UPPER - a * a));
    const pole = _v[5].crossVectors(UP, axis).multiplyScalar(side); pole.y -= .55; pole.addScaledVector(axis, -pole.dot(axis)).normalize();
    const E = _v[6].copy(S).addScaledVector(axis, a).addScaledVector(pole, h);
    const arm = arms[i];
    arm.fore.position.copy(wristW); arm.fore.quaternion.setFromUnitVectors(UP, _v[2].subVectors(E, wristW).normalize());
    arm.upper.position.copy(E); arm.upper.quaternion.setFromUnitVectors(UP, _v[2].subVectors(S, E).normalize());
    return E;
  }
  function updateBat(b) {
    const { n, w, u } = batBasis(b);
    _m1.makeBasis(_v[0].set(w.x, w.y, w.z), _v[1].set(u.x, u.y, u.z), _v[2].set(-n.x, -n.y, -n.z));
    batGroup.quaternion.setFromRotationMatrix(_m1); batGroup.position.set(b.x, b.y, b.z); batGroup.updateMatrixWorld(true);
    batSpeed = batSpeed * .8 + .2 * Math.hypot(b.x - lastBatX, b.y - lastBatY, b.z - lastBatZ) / Math.max(1e-3, frameDt); lastBatX = b.x; lastBatY = b.y; lastBatZ = b.z;
    const travel = clamp(-(b.z + .12), 0, .8), leanX = .42 * (b.x - .25 * handSign), leanY = .22 * clamp(b.y - .6, -.25, .7), leanZ = .3 * (b.z + .12);
    const handleAxis = _v[8].set(u.x, u.y, u.z);
    for (let i = 0; i < 2; i++) {
      const glove = gloves[i], shoulder = _v[9].copy(shoulderBase[i]); shoulder.x += leanX; shoulder.y += leanY; shoulder.z += leanZ;
      const centre = _v[10].set(0, gloveY[i], 0).applyMatrix4(batGroup.matrixWorld);
      // Provisional cuff direction toward the shoulder, then refine toward the solved elbow.
      let toward = _v[11].subVectors(shoulder, centre);
      for (let pass = 0; pass < 2; pass++) {
        const zAxis = _v[12].copy(toward).addScaledVector(handleAxis, -toward.dot(handleAxis)).normalize(), xAxis = _v[13].crossVectors(handleAxis, zAxis).normalize();
        glove.quaternion.setFromRotationMatrix(_m2.makeBasis(xAxis, handleAxis, zAxis)); glove.position.copy(centre); glove.updateMatrixWorld(true);
        const wrist = _v[7].copy(wristLocal).applyMatrix4(glove.matrixWorld);
        const elbow = solveArm(i, wrist, shoulder);
        toward = _v[11].subVectors(elbow, centre);
      }
    }
    // Pads and sweater sway with the stroke so a shot reads as body motion, not a floating bat.
    const swayX = leanX * .5, swayZ = -travel * .06 + leanZ * .4;
    pads[0].position.set(-.17 * handSign + swayX, .0, .55 + swayZ); pads[0].rotation.set(-.14, 0, .06 * handSign); pads[1].position.set(.15 * handSign + swayX, .0, .8 + swayZ); pads[1].rotation.set(-.08, 0, -.04 * handSign);
  }

  // ---------------------------------------------------------------- camera, gaze, head motion
  function resize() { const rect = canvas.parentElement.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.fov = camera.aspect < 1 ? 70 : 60; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(canvas.parentElement); resize();
  const gazeCamera = camera.clone(), gazePoint = new THREE.Vector3(0, .5, -12), restPoint = new THREE.Vector3(0, .5, -12), gazeTarget = new THREE.Vector3(), viewQuat = new THREE.Quaternion().copy(camera.quaternion);
  let lastBallTime = -1, followUntil = 0, frameDt = 0, clock = 0;
  function updateGaze(d, dt, isPaused) {
    if (isPaused) { frameDt = 0; return; }
    frameDt = dt; clock += dt; idleClock += dt; timeUniform.value = clock;
    animateWicket(dt); animateEffects(dt);
    let rate = 3;
    if (!d) { gazeTarget.copy(restPoint); lastBallTime = -1; }
    else if (!d.resolved && d.p.z < .45) {
      const follow = smooth((d.p.z + 12) / 9);
      gazeTarget.set(d.p.x * follow, lerp(.5, Math.max(.4, d.p.y), follow), Math.max(-1.6, Math.min(-.25, d.p.z))); rate = 18; lastBallTime = d.time; followUntil = d.hit ? d.time + 1.2 : d.time + .55;
    } else if (d.hit && d.time < followUntil) {
      gazeTarget.set(d.p.x, Math.max(.45, d.p.y), d.p.z); rate = 9;
      const yaw = Math.atan2(gazeTarget.x - cameraBase.x, -(gazeTarget.z - cameraBase.z)); if (Math.abs(yaw) > 1.05) { const r = Math.hypot(gazeTarget.x - cameraBase.x, gazeTarget.z - cameraBase.z); gazeTarget.x = cameraBase.x + Math.sin(Math.sign(yaw) * 1.05) * r; gazeTarget.z = cameraBase.z - Math.cos(1.05) * r; }
    } else if (d.time - lastBallTime > .55 || d.time > followUntil) { gazeTarget.copy(restPoint); rate = 2.2; }
    else gazeTarget.copy(gazePoint);
    gazePoint.lerp(gazeTarget, 1 - Math.exp(-dt * rate));
    const offset = _v[0].subVectors(gazePoint, cameraBase), horizontal = Math.hypot(offset.x, offset.z);
    offset.y = clamp(offset.y, -.49 * horizontal, 1.2 * horizontal);
    gazeCamera.position.copy(cameraBase); gazeCamera.lookAt(_v[1].addVectors(cameraBase, offset)); viewQuat.slerp(gazeCamera.quaternion, 1 - Math.exp(-dt * 10));
    // Spring-damped head: stroke dip and roll, contact kick, breathing.
    const strokeDip = batSpeed > 6 ? -.025 : 0, strokeRoll = batSpeed > 6 ? .026 * handSign : 0, hdt = Math.min(dt, 1 / 30);
    headVel.addScaledVector(_v[2].set(0, strokeDip, 0).sub(headOffset), hdt * 180).multiplyScalar(Math.exp(-hdt * 14)); headOffset.addScaledVector(headVel, hdt);
    if (kick.lengthSq() > 0) { headVel.addScaledVector(kick, 40); kick.set(0, 0, 0); }
    headRollVel += (strokeRoll + kickRoll - headRoll) * hdt * 160; headRollVel *= Math.exp(-hdt * 12); headRoll += headRollVel * hdt; kickRoll *= Math.exp(-hdt * 20);
    camera.position.copy(cameraBase).add(headOffset); camera.position.y += .006 * Math.sin(clock * TAU * .25);
    camera.quaternion.copy(viewQuat).multiply(_q1.setFromAxisAngle(_v[3].set(0, 0, 1), headRoll));
    if (flash > 0) { wood.emissive.setRGB(.5 * flash, .42 * flash, .25 * flash); flash = Math.max(0, flash - dt * 7); } else wood.emissive.setRGB(0, 0, 0);
  }
  // Input plane is camera-independent: the gaze may follow the ball without moving the bat.
  const pointer = new THREE.Vector3(), projected = new THREE.Vector3(), projectedOut = { x: 0, y: 0 };
  function pointerWorld(x, y) { return pointer.set(x * 1.18, .35 + (y + 1) * .65, -.12); }
  function project(p) { projected.set(p.x, p.y, p.z).project(camera); projectedOut.x = (projected.x + 1) * .5 * canvas.clientWidth; projectedOut.y = (1 - projected.y) * .5 * canvas.clientHeight; return projectedOut; }
  const releaseOut = { x: 0, y: 0, z: 0 };
  function getReleasePosition() { bowler.updateMatrixWorld(true); heldBall.getWorldPosition(_v[0]); releaseOut.x = _v[0].x; releaseOut.y = _v[0].y; releaseOut.z = _v[0].z; return releaseOut; }

  // ---------------------------------------------------------------- weather
  function setEnvironment(c) {
    const over = c.weather === 'overcast', evening = c.weather === 'evening';
    setHand(c.hand);
    windUniform.value = Math.min(.06, Math.abs(c.wind) * .0025);
    renderer.toneMappingExposure = over ? .9 : evening ? 1.15 : 1.05;
    if (evening) { sun.color.set('#ffa25c'); sun.intensity = 3.4; sun.position.set(-19, 5.2, -30); ambient.color.set('#8b86a8'); ambient.groundColor.set('#4f4433'); ambient.intensity = .42; scene.environmentIntensity = .7; scene.backgroundIntensity = 1.25; scene.fog.color.set('#c9a07a'); scene.fog.near = 40; scene.fog.far = 220; }
    else if (over) { sun.color.set('#e8ecec'); sun.intensity = .55; sun.position.set(-14, 30, -10); ambient.color.set('#cfd3d0'); ambient.groundColor.set('#59614c'); ambient.intensity = .95; scene.environmentIntensity = .95; scene.backgroundIntensity = .95; scene.fog.color.set('#c5cbc6'); scene.fog.near = 30; scene.fog.far = 180; }
    else { sun.color.set('#fff4de'); sun.intensity = 4.2; sun.position.set(-24, 30, -6); ambient.color.set('#d7e6f5'); ambient.groundColor.set('#4f5d36'); ambient.intensity = .32; scene.environmentIntensity = .5; scene.backgroundIntensity = 1; scene.fog.color.set('#cdd9e2'); scene.fog.near = 45; scene.fog.far = 260; }
    const cam = sun.shadow.camera; cam.left = -17; cam.right = 16; cam.top = evening ? 9 : 13; cam.bottom = evening ? -3 : -10; cam.near = 5; cam.far = 90; cam.updateProjectionMatrix();
    scene.background = scene.environment = over ? overcastLight : evening ? eveningLight : daylight;
    const worldAz = Math.atan2(sun.position.z, sun.position.x) * 180 / Math.PI, theta = THREE.MathUtils.degToRad(worldAz - HDR_SUN_AZIMUTH[c.weather]);
    scene.backgroundRotation.set(0, theta, 0); scene.environmentRotation.set(0, theta, 0); scene.backgroundBlurriness = .04;
    lampMat.emissiveIntensity = evening ? 3 : 0; for (const g of glows) g.material.opacity = evening ? .9 : 0; for (const s of spots) s.intensity = evening ? 1.3 : 0;
    wearUniform.value = pitchTexture(c.pitch);
    pitchMat.color.set(c.pitch === 'green' ? '#8e956f' : c.pitch === 'soft' ? '#847862' : c.pitch === 'dry' ? '#b4a483' : '#a3946e');
    pitchMat.normalScale.setScalar(c.pitch === 'dry' ? .2 : c.pitch === 'soft' ? .08 : .1);
    pitchMat.roughness = c.pitch === 'soft' ? (over ? .5 : .45) : .95; pitchMat.clearcoat = c.pitch === 'soft' ? .25 : 0;
    ballMat.roughness = .3 + c.age / 200; ballMat.clearcoat = Math.max(0, 1 - c.age / 50); ballMat.color.set(c.age > 40 ? '#6e1519' : '#a3131f');
  }
  setEnvironment({ weather: 'clear', pitch: 'hard', age: 8, wind: 0, hand: 'right' });
  return { renderer, scene, camera, setEnvironment, updateBat, updateBall, updateGaze, animateBowler, getReleasePosition, pointerWorld, project, render() { renderer.render(scene, camera); }, resetWicket, hitWicket };
}
