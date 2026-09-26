// A small articulated athlete, built once from shaped surfaces. All details on
// each moving part are baked into one vertex-colour mesh: no texture downloads,
// per-frame geometry updates, material switches, or separate buttons / shoelaces.
import * as THREE from './vendor/three.module.js';

const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2, UPPER_LEG = .455, LOWER_LEG = .445, ANKLE = .165;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const C = { shirt: '#255244', panel: '#356653', trim: '#d8cfa4', dark: '#18392f', pants: '#e7e2d2', seam: '#cfc9b7', skin: '#a97250', shade: '#8c573e', hair: '#30251f', eye: '#201e1b', white: '#f2f0e4', sole: '#a7b0a1' };

// Closed elliptical cross-sections with an authored silhouette and front/back
// depth, rather than spheres and straight cylinders joined into a stick figure.
function loft(rings, segments = 14) {
  const position = [], uv = [], index = [];
  for (let j = 0; j < rings.length; j++) {
    const [y, rx, rz, z = 0, x = 0] = rings[j];
    for (let i = 0; i <= segments; i++) {
      const a = TAU * i / segments;
      position.push(x + Math.sin(a) * rx, y, z + Math.cos(a) * rz);
      uv.push(i / segments, j / (rings.length - 1));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    index.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // Preserve winding whether the authored profile runs up or down.
  if (rings[0][0] > rings[rings.length - 1][0]) for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index); g.computeVertexNormals();
  // The duplicated UV seam shares its normals, so shirt fronts and faces have
  // continuous lighting even at very low vertex counts.
  const normals = g.attributes.normal, smoothNormal = new THREE.Vector3();
  for (let j = 0; j < rings.length; j++) {
    const a = j * (segments + 1), b = a + segments;
    smoothNormal.set(normals.getX(a) + normals.getX(b), normals.getY(a) + normals.getY(b), normals.getZ(a) + normals.getZ(b)).normalize();
    normals.setXYZ(a, smoothNormal.x, smoothNormal.y, smoothNormal.z); normals.setXYZ(b, smoothNormal.x, smoothNormal.y, smoothNormal.z);
  }
  return g;
}
const matrix = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function merge(parts) {
  const position = [], normal = [], color = [], uv = [], index = [];
  const col = new THREE.Color(), v = new THREE.Vector3(), n = new THREE.Matrix3();
  for (const [g, tint, transform = new THREE.Matrix4()] of parts) {
    const start = position.length / 3, p = g.attributes.position, norm = g.attributes.normal;
    col.set(tint); n.getNormalMatrix(transform);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(transform); position.push(v.x, v.y, v.z);
      v.fromBufferAttribute(norm, i).applyMatrix3(n).normalize(); normal.push(v.x, v.y, v.z);
      color.push(col.r, col.g, col.b); uv.push(0, 0);
    }
    for (let i = 0; i < g.index.count; i++) index.push(start + g.index.getX(i));
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index); g.computeBoundingSphere(); return g;
}
const oval = (x, y, z, sx, sy, sz, color, rx = 0) => [new THREE.SphereGeometry(1, 12, 8), color, matrix(x, y, z, sx, sy, sz, rx)];
const box = (x, y, z, w, h, d, color, rz = 0) => [new THREE.BoxGeometry(w, h, d), color, matrix(x, y, z, 1, 1, 1, 0, 0, rz)];
function piping(a, b, radius, color) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from);
  return [new THREE.CylinderGeometry(radius, radius, dir.length(), 6), color,
    new THREE.Matrix4().compose(from.add(to).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), new THREE.Vector3(1, 1, 1))];
}
function shoeGeometry() {
  // Model a running shoe along its length: fitted heel, low toe box, raised
  // tongue and separate outsole, all in a single mesh including the laces.
  const shoe = (shrink, bottom, top, color) => {
    const g = loft([
      [-.115, .009, .012, 0], [-.103, .045, .033, .002], [-.07, .06, .042, .004],
      [.025, .064, .045, -.002], [.12, .058, .026, -.018], [.175, .043, .02, -.024], [.19, .008, .008, -.025],
    ], 12);
    // Convert y-axis stations into z and remap ring depth into shoe height.
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getY(i), y = p.getZ(i); p.setXYZ(i, x * shrink, bottom + (y + .05) * top, z); }
    // This coordinate swap reverses orientation.
    for (let i = 0; i < g.index.count; i += 3) { const v = g.index.getX(i + 1); g.index.setX(i + 1, g.index.getX(i + 2)); g.index.setX(i + 2, v); }
    g.computeVertexNormals(); return [g, color];
  };
  const parts = [shoe(1.04, -.13, .26, C.sole), shoe(1, -.108, 1, C.white), oval(0, -.028, -.028, .043, .054, .068, C.dark, -.3)];
  for (let i = 0; i < 4; i++) parts.push(piping([-.027, -.01 - i * .014, -.012 + i * .024], [.027, -.01 - i * .014, -.006 + i * .024], .003, C.white));
  for (const side of [-1, 1]) {
    parts.push(piping([side * .059, -.068, -.06], [side * .061, -.068, .057], .008, C.panel));
    parts.push(piping([side * .061, -.068, .057], [side * .041, -.079, .112], .008, C.panel));
  }
  return merge(parts);
}

// Cubic Hermite curves preserve velocity across the approach, load, release and
// deceleration. The same timeline is sampled on both sides of the 2.2s release.
function curve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t > keys[i][0]) continue;
    const [t0, a, da = 0] = keys[i - 1], [t1, b, db = 0] = keys[i], span = t1 - t0, u = (t - t0) / span;
    return (2 * u ** 3 - 3 * u ** 2 + 1) * a + (u ** 3 - 2 * u ** 2 + u) * span * da + (-2 * u ** 3 + 3 * u ** 2) * b + (u ** 3 - u ** 2) * span * db;
  }
  return keys[keys.length - 1][1];
}
const ROOT = [[0, -23.4, .4], [.38, -22.6, 3.3], [1.3, -19.2, 3.5], [1.63, -18.3, 2], [1.9, -17.91, .95], [2.2, -17.7, .6], [2.53, -17.23, 2.0], [3.06, -16.4, 1], [3.8, -16.02, .1], [4.4, -16, 0]];
const ROOT_SPIN = ROOT.map(([t, z, speed]) => [t, t <= 1.63 ? -18.3 + (z + 18.3) * .64 : z, t <= 1.3 ? speed * .64 : speed]);
const LEAN = [[0, .02], [.5, .11], [1.3, .13], [1.64, -.11], [1.9, -.15], [2.2, .15, 1], [2.5, .42], [2.9, .16], [3.8, .02]];
const TWIST = [[0, 0], [1.25, .06], [1.64, .92], [1.85, .98], [2.2, .04, -3], [2.52, -.48], [3.1, -.12], [3.8, 0]];
const BOWL_UPPER = [[1.2, .42], [1.56, .65], [1.83, 1.1, 1], [2.2, Math.PI, 8], [2.52, 5.25, 3], [2.86, 5.9], [3.6, TAU - .2], [4.4, TAU - .25]];
const BOWL_ELBOW = [[1.2, -.9], [1.58, -.65], [1.87, -.06], [2.2, 0], [2.55, -.38], [3.3, -.9], [4.4, -1.0]];
const GUIDE_UPPER = [[1.2, -.5], [1.62, -2.2], [1.86, -2.8], [2.2, -.45, 4], [2.55, .42], [3.25, -.22], [4.4, -.35]];
const GUIDE_ELBOW = [[1.2, -.9], [1.62, -.45], [1.85, -.16], [2.2, -.8], [2.6, -1.3], [3.4, -.8], [4.4, -.85]];

function footTrack(back, spin) {
  const root = spin ? ROOT_SPIN : ROOT, at = t => curve(root, t), marks = [];
  const add = (time, z, lift = 0, height = 0) => marks.push([time, z, lift, height]);
  if (back) {
    add(0, at(0) - .14); add(.07, at(0) - .14); add(.29, at(.29) + .23, .16); add(.5, at(.29) + .23);
    add(.73, at(.73) + .29, .19); add(.88, at(.73) + .29); add(1.17, at(1.17) + .25, .2); add(1.28, at(1.17) + .25);
    add(1.67, -18.29, .27); add(2.16, -18.29); add(2.55, -16.91, .25); add(2.87, -16.91); add(3.22, -16.15, .14); add(4.4, -16.15);
  } else {
    add(0, at(0) + .14); add(.28, at(0) + .14); add(.51, at(.51) + .27, .18); add(.73, at(.51) + .27);
    add(.96, at(.96) + .27, .2); add(1.12, at(.96) + .27); add(1.52, at(1.52) + .08, .15, .42); add(1.94, -17.31, .05); add(2.55, -17.31);
    add(2.91, -16.22, .18); add(3.23, -16.22); add(3.62, -15.84, .1); add(4.4, -15.84);
  }
  return marks;
}
function sampleFoot(keys, t, out) {
  let prev = keys[0]; out.z = prev[1]; out.y = ANKLE; out.pitch = 0;
  for (let i = 1; i < keys.length; i++) {
    const next = keys[i];
    if (t <= next[0]) {
      const u = clamp((t - prev[0]) / (next[0] - prev[0])), s = ease(u), lifting = next[2];
      out.z = mix(prev[1], next[1], s);
      // Flat contacts remain locked in world space; only swing feet interpolate.
      out.y = ANKLE + mix(prev[3], next[3], s) + Math.sin(Math.PI * s) * lifting;
      out.pitch = lifting ? Math.sin(TAU * u) * -.18 : 0;
      return out;
    }
    prev = next;
  }
  out.z = prev[1]; return out;
}

export function createBowler({ ballMaterial }) {
  const group = new THREE.Group(); group.name = 'Bowler';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .88 });
  const mesh = (g, parent = group, name = '') => { const m = new THREE.Mesh(g, material); m.name = name; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const body = new THREE.Group(); body.position.y = .98; group.add(body);
  const pelvis = new THREE.Group(); pelvis.position.y = .98; group.add(pelvis);
  mesh(merge([
    [loft([[.028, .151, .107], [.041, .157, .113], [.085, .162, .115], [.16, .166, .117], [.31, .193, .122], [.43, .224, .117], [.48, .205, .096], [.54, .075, .065]], 18), C.shirt],
    [loft([[.47, .078, .067], [.525, .073, .063], [.545, .067, .06]], 14), C.dark],
    [loft([[.53, .064, .055], [.61, .057, .052], [.63, .059, .052]], 12), C.skin],
    piping([-.185, .478, .075], [-.069, .525, .06], .011, C.trim), piping([.185, .478, .075], [.069, .525, .06], .011, C.trim),
    box(0, .419, .123, .015, .132, .006, C.dark), box(0, .461, .127, .006, .006, .004, C.trim), box(0, .423, .128, .006, .006, .004, C.trim),
    oval(-.115, .364, .11, .022, .029, .004, C.trim), box(-.115, .369, .116, .006, .028, .002, C.panel),
    box(.12, .37, .118, .05, .007, .003, C.white), box(.12, .353, .119, .03, .006, .003, C.trim),
    piping([-.17, .29, .036], [-.148, .04, .05], .014, C.panel), piping([.17, .29, .036], [.148, .04, .05], .014, C.panel),
  ]), body, 'Shaped shirt, collar and embroidered kit');
  mesh(merge([
    [loft([[-.15, .095, .079], [-.105, .148, .11], [.025, .153, .11], [.066, .146, .105]], 16), C.pants],
    [loft([[.012, .152, .11], [.029, .152, .11]], 16), C.dark], box(0, .021, .113, .029, .016, .007, C.trim),
  ]), pelvis, 'Trouser waist');
  const head = new THREE.Group(); head.position.set(0, .717, .005); body.add(head);
  const faceParts = [
    [loft([[-.09, .033, .041, .035], [-.064, .064, .061, .022], [-.02, .09, .079, .005], [.047, .095, .077], [.106, .083, .067, -.005], [.139, .04, .037, -.009], [.148, .001, .001, -.009]], 18), C.skin],
    oval(-.097, .006, -.003, .017, .032, .023, C.skin), oval(.097, .006, -.003, .017, .032, .023, C.skin),
    oval(0, .027, .077, .014, .036, .018, C.skin), oval(0, -.006, .094, .02, .013, .018, C.skin),
    oval(0, -.055, .079, .034, .007, .006, C.shade), oval(0, -.074, .062, .024, .014, .013, C.shade),
    [new THREE.SphereGeometry(.102, 16, 8, 0, TAU, 0, Math.PI / 2), C.dark, matrix(0, .07, -.008, 1.03, .8, 1.01)],
    [loft([[.061, .102, .098, -.008], [.076, .105, .1, -.008]], 18), C.panel],
    oval(0, .065, .084, .111, .008, .088, C.dark, -.09), box(0, .111, .075, .019, .018, .004, C.trim),
  ];
  for (const side of [-1, 1]) {
    faceParts.push(oval(side * .041, .027, .073, .023, .009, .009, C.shade), oval(side * .041, .029, .080, .015, .005, .004, C.white), oval(side * .04, .029, .084, .006, .006, .003, C.eye));
    faceParts.push(piping([side * .022, .049, .078], [side * .064, .05, .065], .006, C.hair));
  }
  mesh(merge(faceParts), head, 'Sculpted face and cap');

  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * .217, .465, 0); body.add(pivot);
    mesh(merge([
      oval(0, -.028, 0, .064, .061, .067, C.shirt),
      [loft([[.008, .051, .055], [-.08, .069, .069], [-.16, .062, .062], [-.194, .058, .057]], 14), C.shirt],
      [loft([[-.178, .062, .06], [-.199, .059, .058]], 14), C.trim],
      [loft([[-.192, .052, .051], [-.238, .052, .049], [-.285, .047, .043], [-.313, .043, .041]], 12), C.skin],
    ]), pivot, 'Sleeve and upper arm');
    const lower = new THREE.Group(); lower.position.y = -.307; pivot.add(lower);
    const handParts = [
      oval(0, -.003, 0, .045, .048, .043, C.skin),
      [loft([[.015, .024, .026], [0, .046, .043], [-.07, .05, .043], [-.15, .041, .036], [-.233, .03, .028], [-.271, .028, .025]], 12), C.skin],
      oval(0, -.286, .006, .034, .043, .023, C.skin),
      oval(side * .03, -.292, .02, .013, .032, .014, C.skin, -.5),
    ];
    for (let i = 0; i < 4; i++) handParts.push(oval(-.023 + i * .0145, -.318 - (i === 1 || i === 2 ? .009 : 0), .017, .008, .022, .013, C.skin, -.35));
    mesh(merge(handParts), lower, 'Forearm and curled fingers');
    arms.push({ pivot, lower });
  }
  const thighGeometry = merge([[loft([[.02, .044, .052], [0, .092, .096], [-.12, .095, .098], [-.27, .078, .081], [-.397, .066, .069], [-.466, .058, .06]], 14), C.pants]]);
  const shinGeometry = merge([oval(0, -.008, 0, .065, .067, .068, C.pants), [loft([[.023, .04, .042], [0, .065, .068], [-.085, .067, .065], [-.16, .062, .059], [-.28, .05, .047], [-.386, .045, .043], [-.423, .048, .046], [-.445, .042, .04]], 14), C.pants], [loft([[-.413, .049, .047], [-.434, .047, .044]], 12), C.seam]]);
  const footGeometry = shoeGeometry();
  const legs = [-1, 1].map(side => ({ side, upper: mesh(thighGeometry, group, 'Tailored thigh'), lower: mesh(shinGeometry, group, 'Trouser calf and cuff'), foot: mesh(footGeometry, group, 'Running shoe'), target: { z: 0, y: ANKLE, pitch: 0 } }));
  const heldBall = new THREE.Mesh(new THREE.SphereGeometry(.036, 12, 8), ballMaterial); heldBall.position.set(0, -.332, .035); arms[0].lower.add(heldBall);
  const tracks = { pace: [footTrack(true, false), footTrack(false, false)], spin: [footTrack(true, true), footTrack(false, true)] };
  const hip = new THREE.Vector3(), ankle = new THREE.Vector3(), axis = new THREE.Vector3(), pole = new THREE.Vector3(), knee = new THREE.Vector3(), aim = new THREE.Vector3();

  function solveLeg(leg, z, lift) {
    hip.set(leg.side * .101, 0, 0).applyQuaternion(pelvis.quaternion).add(pelvis.position);
    ankle.set(leg.side * .112, leg.target.y - lift, leg.target.z - z);
    axis.subVectors(ankle, hip); let distance = axis.length(); axis.multiplyScalar(1 / Math.max(distance, .001));
    distance = clamp(distance, Math.abs(UPPER_LEG - LOWER_LEG) + .001, UPPER_LEG + LOWER_LEG - .001);
    // Keep limb lengths fixed if an airborne target exceeds anatomical reach.
    ankle.copy(hip).addScaledVector(axis, distance);
    const along = (UPPER_LEG ** 2 - LOWER_LEG ** 2 + distance ** 2) / (2 * distance), height = Math.sqrt(Math.max(0, UPPER_LEG ** 2 - along ** 2));
    pole.set(leg.side * .12, 0, 1).addScaledVector(axis, -axis.z - leg.side * .12 * axis.x).normalize();
    knee.copy(hip).addScaledVector(axis, along).addScaledVector(pole, height);
    leg.upper.position.copy(hip); leg.upper.quaternion.setFromUnitVectors(DOWN, aim.subVectors(knee, hip).normalize());
    leg.lower.position.copy(knee); leg.lower.quaternion.setFromUnitVectors(DOWN, aim.subVectors(ankle, knee).normalize());
    leg.foot.position.copy(ankle); leg.foot.rotation.set(leg.target.pitch, -leg.side * .045, 0);
  }
  function setArm(arm, upper, lower, splay) { arm.pivot.rotation.set(upper, 0, splay); arm.lower.rotation.x = lower; }
  function animate(phase, time, config, idleClock = 0) {
    const sign = config.arm === 'left' ? -1 : 1, spin = config.bowler.includes('spin'), bowling = arms[sign > 0 ? 0 : 1], guide = arms[sign > 0 ? 1 : 0];
    if (heldBall.parent !== bowling.lower) bowling.lower.add(heldBall);
    heldBall.visible = phase === 'runup' || phase === 'intro' || phase === 'ready';
    heldBall.rotation.y = idleClock * 2;
    const idle = phase !== 'runup' && phase !== 'flight' && phase !== 'result';
    const t = idle ? 0 : clamp(time + (phase === 'runup' ? 0 : 2.2), 0, 4.4);
    const root = spin ? ROOT_SPIN : ROOT, z = curve(root, t);
    const fade = ease(t / .32), runFade = 1 - ease((t - 1.1) / .24), running = fade * runFade;
    const stride = Math.sin(t * (spin ? 12 : 15)) * (spin ? .4 : .62);
    let lean = curve(LEAN, t), twist = curve(TWIST, t), lift = .012 * Math.sin(t * 30) * running;
    if (idle) { lean += .006 * Math.sin(idleClock * 1.8); body.scale.y = 1 + .002 * Math.sin(idleClock * 1.8); } else body.scale.y = 1;
    body.rotation.set(lean, sign * twist, -sign * .025 * Math.sin(t * Math.PI / 2.2));
    head.rotation.set(-lean * .42, -sign * twist * .65, 0);
    pelvis.rotation.set(0, sign * twist * .3, 0);
    const footKeys = tracks[spin ? 'spin' : 'pace'];
    for (const leg of legs) {
      const back = leg.side === -sign;
      sampleFoot(footKeys[back ? 0 : 1], t, leg.target);
      // Solve root height continuously against both feet. Including the
      // airborne target avoids a height snap when it becomes the support foot.
      hip.set(leg.side * .101, 0, 0).applyQuaternion(pelvis.quaternion);
      const dx = leg.side * .112 - hip.x, dz = leg.target.z - z - hip.z;
      lift = Math.min(lift, leg.target.y + Math.sqrt(Math.max(.02, .895 ** 2 - dx * dx - dz * dz)) - .98);
    }
    group.position.set(-.195 * sign, lift, z);
    for (const leg of legs) solveLeg(leg, z, lift);
    const deliveryBlend = ease((t - 1.12) / .24);
    const bowlingUpper = mix(-.25 + stride * .7 * fade, curve(BOWL_UPPER, t), deliveryBlend);
    const guideUpper = mix(-.35 - stride * .7 * fade, curve(GUIDE_UPPER, t), deliveryBlend);
    setArm(bowling, bowlingUpper, mix(-1.0, curve(BOWL_ELBOW, t), deliveryBlend), sign * -.035);
    setArm(guide, guideUpper, mix(-.85, curve(GUIDE_ELBOW, t), deliveryBlend), sign * .055);
    // No stateful interpolation: skipped frames and low-power frame caps sample
    // the exact same pose, including the held ball at the physics release time.
    return group;
  }
  return { group, heldBall, animate, legs, arms, material };
}
