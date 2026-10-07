// Close-up equipment is built once, in metres, and drawn as one mesh per hand.
// The handle is local +y; the blade's striking plane stays at z = -.012.
import * as THREE from './vendor/three.module.js';

const TAU = Math.PI * 2, UP = new THREE.Vector3(0, 1, 0);
const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const matrix = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function geometry(positions, indices, uvs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs || new Float32Array(positions.length / 3 * 2), 2));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

// Indexed rings run counterclockwise, viewed from their positive axis.
function joinRings(indices, rings, count) {
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < count; j++) {
    const a = i * count + j, b = i * count + (j + 1) % count;
    indices.push(a, b, b + count, a, b + count, a + count);
  }
}

// Retains the existing face/back texture atlas, .108 m width and .62 m length.
// More stations at the toe and shoulders round their cut edges; the central
// spine has a small crown instead of the old knife-edged triangular ridge.
export function bladeGeometry() {
  const zFace = -.012, stations = [-.31, -.3094, -.308, -.305, -.301, -.296, -.292];
  for (let y = -.276; y < .225; y += .018) stations.push(y);
  stations.push(.225, .242, .257, .271, .284, .294, .302, .307, .309, .31);
  const rings = stations.map(y => {
    const t = (y + .31) / .62, bevel = .0016;
    let hw = .054;
    if (y < -.292) hw = .036 + .018 * Math.sqrt(Math.max(0, 1 - ((y + .292) / .018) ** 2));
    else if (y > .225) hw -= .028 * smooth((y - .225) / .085);
    const depth = y < -.05 ? THREE.MathUtils.lerp(.025, .043, smooth((y + .31) / .26)) : THREE.MathUtils.lerp(.043, .018, smooth((y + .05) / .36));
    const zEdge = zFace + Math.min(.018, depth - .004), zSpine = zFace + depth;
    const endRound = .0012 * (1 - smooth((y + .31) / .0025)) + .0007 * smooth((y - .3075) / .0025);
    const face = zFace + endRound, points = [];
    const push = (x, z, u) => points.push([x, y, z, u, t]);
    push(-hw + bevel, face, .25 + (hw - bevel) / .054 * .23);
    push(hw - bevel, face, .25 - (hw - bevel) / .054 * .23);
    // Separate normals at the flat striking face and the bevel.
    push(hw - bevel, face, .49);
    push(hw - bevel * .3, face + bevel * .3, .49);
    push(hw, zFace + bevel + endRound, .49);
    push(hw, zEdge - bevel - endRound, .49);
    push(hw - bevel * .3, zEdge - bevel * .3 - endRound, .98);
    for (let j = 0; j <= 20; j++) {
      const k = 1 - j / 10, x = k * (hw - bevel);
      const crown = (Math.sqrt(k * k + .025) - Math.sqrt(.025)) / (Math.sqrt(1.025) - Math.sqrt(.025));
      push(x, zEdge + (zSpine - zEdge) * Math.pow(1 - crown, 1.16) - endRound, .75 + x / .054 * .23);
    }
    push(-hw + bevel * .3, zEdge - bevel * .3 - endRound, .52);
    push(-hw, zEdge - bevel - endRound, .01);
    push(-hw, zFace + bevel + endRound, .01);
    push(-hw + bevel * .3, face + bevel * .3, .01);
    push(-hw + bevel, face, .01);
    return points;
  });
  const count = rings[0].length, positions = [], uvs = [], indices = [];
  for (const ring of rings) for (const [x, y, z, u, v] of ring) { positions.push(x, y, z); uvs.push(u, v); }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < count - 1; j++) {
    if (j === 1) continue;
    const a = i * count + j, b = a + 1, c = a + count + 1, d = a + count;
    indices.push(a, c, b, a, d, c);
  }
  for (const [ring, up] of [[rings[0], false], [rings.at(-1), true]]) {
    const outline = [ring[0], ...ring.slice(2, -1)], base = positions.length / 3;
    positions.push(0, ring[0][1], zFace + .01); uvs.push(.25, up ? 1 : 0);
    for (const [x, y, z, u, v] of outline) { positions.push(x, y, z); uvs.push(u, v); }
    for (let j = 0; j < outline.length; j++) {
      const a = base + 1 + j, b = base + 1 + (j + 1) % outline.length;
      if (up) indices.push(base, b, a); else indices.push(base, a, b);
    }
  }
  const result = geometry(positions, indices, uvs);
  result.name = 'willow-blade';
  return result;
}

function roundedOutline(width, height, radius, steps = 5) {
  const points = [], r = Math.min(radius, width / 2, height / 2);
  for (let corner = 0; corner < 4; corner++) {
    const angle = corner * Math.PI / 2;
    const cx = (corner === 0 || corner === 3 ? 1 : -1) * (width / 2 - r);
    const cy = (corner < 2 ? 1 : -1) * (height / 2 - r);
    for (let i = 0; i <= steps; i++) {
      const a = angle + i / steps * Math.PI / 2;
      points.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return points;
}

// A soft foam panel with a rolled edge and gently crowned top. It stays within
// the supplied dimensions, unlike extrusions whose bevel enlarged every pad.
export function paddedPanel(width, height, depth, radius = .004) {
  const outline = roundedOutline(width, height, radius), positions = [], indices = [], uvs = [];
  const profiles = [[.85, -.5], [1, -.25], [1, .05], [.93, .34], [.65, .48]];
  for (const [scale, z] of profiles) for (const [x, y] of outline) {
    positions.push(x * scale, y * scale, z * depth); uvs.push(x / width + .5, y / height + .5);
  }
  const count = outline.length;
  joinRings(indices, profiles.length, count);
  for (const top of [false, true]) {
    const centre = positions.length / 3, ring = top ? (profiles.length - 1) * count : 0;
    positions.push(0, 0, (top ? .5 : -.5) * depth); uvs.push(.5, .5);
    for (let j = 0; j < count; j++) {
      const a = ring + j, b = ring + (j + 1) % count;
      if (top) indices.push(centre, a, b); else indices.push(centre, b, a);
    }
  }
  const result = geometry(positions, indices, uvs);
  result.name = 'sewn-padded-panel';
  return result;
}

// Small sewn cords use a four-sided cross-section; their width is under 1 mm.
function cord(points, radius = .00045, closed = false) {
  const path = points.map(p => new THREE.Vector3(...p)), positions = [], indices = [];
  const tangent = new THREE.Vector3(), side = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < path.length; i++) {
    const previous = path[closed ? (i + path.length - 1) % path.length : Math.max(0, i - 1)];
    const next = path[closed ? (i + 1) % path.length : Math.min(path.length - 1, i + 1)];
    tangent.subVectors(next, previous).normalize();
    side.crossVectors(tangent, Math.abs(tangent.y) < .9 ? UP : new THREE.Vector3(1, 0, 0)).normalize();
    normal.crossVectors(tangent, side).normalize();
    for (let j = 0; j < 4; j++) {
      const a = j / 4 * TAU, v = path[i].clone().addScaledVector(side, Math.cos(a) * radius).addScaledVector(normal, Math.sin(a) * radius);
      positions.push(v.x, v.y, v.z);
    }
  }
  joinRings(indices, path.length, 4);
  if (closed) for (let j = 0; j < 4; j++) {
    const a = (path.length - 1) * 4 + j, b = (path.length - 1) * 4 + (j + 1) % 4;
    indices.push(a, b, (j + 1) % 4, a, (j + 1) % 4, j);
  }
  return geometry(positions, indices);
}

function merge(parts) {
  const positions = [], normals = [], uvs = [], colors = [], surfaces = [], indices = [], color = new THREE.Color();
  const vertex = new THREE.Vector3(), n = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  for (const { g, m, c, roughness, grain } of parts) {
    const offset = positions.length / 3, p = g.attributes.position, uv = g.attributes.uv, no = g.attributes.normal;
    color.set(c); normalMatrix.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      vertex.fromBufferAttribute(p, i).applyMatrix4(m); n.fromBufferAttribute(no, i).applyMatrix3(normalMatrix).normalize();
      positions.push(vertex.x, vertex.y, vertex.z); normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b); surfaces.push(roughness, grain);
      uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    const flip = m.determinant() < 0, count = g.index ? g.index.count : p.count;
    const index = i => offset + (g.index ? g.index.getX(i) : i);
    for (let i = 0; i < count; i += 3) indices.push(index(i), index(i + (flip ? 2 : 1)), index(i + (flip ? 1 : 2)));
    g.dispose();
  }
  const result = geometry(positions, indices, uvs);
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  result.setAttribute('equipmentSurface', new THREE.Float32BufferAttribute(surfaces, 2));
  return result;
}

// Rounded rectangular finger sections follow the grip instead of intersecting
// straight capsules. Cross-section width and padding thickness are independent.
function fingerSection(start, end, y, radius, width, depth, steps = 7) {
  const positions = [], indices = [], uvs = [], sides = 12;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, t = THREE.MathUtils.lerp(start, end, u);
    const cap = .50 + .50 * smooth(Math.min(u, 1 - u) / .19);
    for (let j = 0; j < sides; j++) {
      const a = j / sides * TAU, cos = Math.cos(a), sin = Math.sin(a);
      const r = radius + Math.sign(cos) * Math.abs(cos) ** .70 * depth * cap;
      positions.push(r * Math.cos(t), y + Math.sign(sin) * Math.abs(sin) ** .72 * width * cap, -r * Math.sin(t));
      uvs.push(u, j / sides);
    }
  }
  joinRings(indices, steps + 1, sides);
  // Section rings are clockwise relative to this curve's direction.
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  for (const top of [false, true]) {
    const t = top ? end : start, centre = positions.length / 3, ring = top ? steps * sides : 0;
    positions.push(radius * Math.cos(t), y, -radius * Math.sin(t)); uvs.push(top ? 1 : 0, .5);
    for (let j = 0; j < sides; j++) {
      const a = ring + j, b = ring + (j + 1) % sides;
      if (top) indices.push(centre, b, a); else indices.push(centre, a, b);
    }
  }
  return geometry(positions, indices, uvs);
}

function cuffGeometry(profile, ribs = false) {
  const positions = [], indices = [], uvs = [], count = 48;
  for (let ring = 0; ring < profile.length; ring++) {
    const [z, rx, ry, cx] = profile[ring];
    for (let j = 0; j < count; j++) {
      const a = j / count * TAU, rib = ribs && ring > 0 && ring < profile.length - 1 ? .0003 * (j % 2) : 0;
      positions.push(cx + (rx + rib) * Math.cos(a), (ry + rib) * Math.sin(a), z); uvs.push(j / count, ring / (profile.length - 1));
    }
  }
  joinRings(indices, profile.length, count);
  return geometry(positions, indices, uvs);
}

export function gloveGeometry(thumbUp, mirror) {
  const parts = [], mirrorMatrix = new THREE.Matrix4().makeScale(mirror ? -1 : 1, 1, 1);
  const cream = '#ebe8df', pad = '#f4f1e8', leather = '#d5c5a7', seam = '#beb8a7', green = '#30473b';
  const add = (g, m = matrix(), c = pad, roughness = .73, grain = .04) => parts.push({ g, m: new THREE.Matrix4().multiplyMatrices(mirrorMatrix, m), c, roughness, grain });
  const thread = (points, radius = .0004, color = seam, closed = false) => add(cord(points, radius, closed), matrix(), color, .92, .015);
  const panel = (w, h, d, r, m, color = pad, sewn = true) => {
    add(paddedPanel(w, h, d, r), m, color);
    if (!sewn) return;
    const outline = roundedOutline(w * .92, h * .92, r * .9, 3);
    add(cord(outline.map(([x, y]) => [x, y, d * .35]), .00036, true), m, seam, .90, .012);
    // Short stitches along the long sides remain visible in the first-person view.
    for (const x of [-w * .39, w * .39]) for (let y = -h * .28; y < h * .29; y += .0055) {
      add(cord([[x, y, d * .435], [x, y + .0022, d * .435]], .00020), m, '#f8f5e9', .94, .01);
    }
  };

  // Soft palm/web with a narrowed wrist transition; lower padding has a warmer
  // suede tone and is visible through the finger flexion channels.
  const palm = new THREE.SphereGeometry(1, 20, 14), pp = palm.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), taper = 1 - .19 * Math.max(0, z);
    pp.setXYZ(i, .040 + x * .020 * taper, y * .047 * taper, .029 + z * .039);
  }
  palm.computeVertexNormals(); add(palm, matrix(), leather, .87, .055);
  add(new THREE.SphereGeometry(1, 18, 12), matrix(.047, 0, .037, 0, 0, 0, .013, .047, .031), cream, .81, .04);

  // Split back-of-hand shields: tapered toward the cuff with sewn perimeter
  // welts, then four independently raised knuckle blocks.
  for (const side of [-1, 1]) {
    panel(.037, .040, .013, .008, matrix(.060, side * .0215, .038, 0, Math.PI / 2, side * -.035));
    panel(.024, .033, .010, .006, matrix(.058, side * .018, .065, 0, Math.PI / 2, side * .055), cream);
  }
  const reach = [2.45, 2.62, 2.53, 2.19], widths = [.0092, .0098, .0093, .0082], split = [0, .40, .73, 1];
  for (let k = 0; k < 4; k++) {
    const y = (k - 1.5) * .0221, start = -.36, end = reach[k], w = widths[k];
    const knuckleX = k === 1 || k === 2 ? .057 : .053;
    panel(.022, w * 1.95, .012, .0055, matrix(knuckleX, y, .005, 0, Math.PI / 2 + .13), k === 3 ? cream : pad);
    add(fingerSection(start - .06, end + .025, y, .028, w * .84, .0064, 14), matrix(), leather, .88, .06);
    for (let segment = 0; segment < 3; segment++) {
      const t0 = start + (end - start) * split[segment] + .06, t1 = start + (end - start) * split[segment + 1] - .065;
      const r = .035 - segment * .0011, depth = segment === 2 ? .0058 : .0069;
      add(fingerSection(t0, t1, y, r, w, depth), matrix(), segment === 2 ? cream : pad);
      // Narrow leather piping runs along both sides, clear of the flex joints.
      for (const side of [-1, 1]) {
        const points = [];
        for (let j = 0; j <= 10; j++) {
          const u = .035 + .93 * j / 10, t = t0 + (t1 - t0) * u;
          const cap = .50 + .50 * smooth(Math.min(u, 1 - u) / .19), rr = r + depth * cap * .64;
          points.push([rr * Math.cos(t), y + side * w * cap * .86, -rr * Math.sin(t)]);
        }
        thread(points, .00035);
      }
    }
  }

  const ty = thumbUp ? 1 : -1;
  const thumb = [[.043, ty * .029, .031], [.012, ty * .055, .015], [-.016, ty * .043, -.003]];
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Vector3(...thumb[i]), b = new THREE.Vector3(...thumb[i + 1]), direction = b.clone().sub(a), length = direction.length();
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()), new THREE.Vector3(1, 1, 1));
    add(new THREE.CapsuleGeometry(i ? .0073 : .0084, length - .010, 3, 10), m, leather, .87, .05);
    const shield = matrix(.003, 0, .004);
    panel(i ? .018 : .021, length * .93, .013, .0065, m.clone().multiply(shield), i ? cream : pad);
  }

  // A hollow, oval elastic cuff meets the existing wrist anchor (.034,0,.105).
  // Separate inner lining and folded rims avoid the old doughnut silhouette.
  add(cuffGeometry([[.047, .024, .038, .040], [.059, .029, .042, .037], [.076, .034, .042, .034], [.099, .034, .038, .034], [.106, .032, .036, .034], [.106, .029, .033, .034], [.098, .030, .034, .034]], true), matrix(), cream, .97, .10);
  // Close the mouth of the cuff where it meets the hand: from above, the batter
  // otherwise looks through the hollow cuff at the handle and the dark inside.
  add(cuffGeometry([[.049, .0245, .0385, .040], [.049, .003, .004, .040]]), matrix(), cream, .97, .10);
  add(cuffGeometry([[.072, .0345, .043, .034], [.075, .0355, .0438, .034], [.089, .0355, .0418, .034], [.092, .0345, .041, .034]]), matrix(), green, .95, .08);
  for (const [z, rx, ry, cx] of [[.052, .027, .040, .038], [.104, .032, .036, .034]]) {
    const outline = Array.from({ length: 48 }, (_, i) => [cx + rx * Math.cos(i / 48 * TAU), ry * Math.sin(i / 48 * TAU), z]);
    thread(outline, .00075, '#d3cebd', true);
  }
  for (const z of [.075, .089]) for (let i = 0; i < 40; i++) {
    const a = i / 40 * TAU, b = a + .052, ry = z < .08 ? .0442 : .0424;
    thread([[.034 + .036 * Math.cos(a), ry * Math.sin(a), z], [.034 + .036 * Math.cos(b), ry * Math.sin(b), z]], .00024, '#b5b6a5');
  }
  panel(.024, .034, .0045, .003, matrix(.071, 0, .083, 0, Math.PI / 2), green, false);
  panel(.009, .023, .0016, .001, matrix(.074, 0, .083, 0, Math.PI / 2), '#d5dec2', false);
  // Embossed parallel bars on the strap tab, not a floating badge.
  for (let i = 0; i < 3; i++) thread([[.075, -.007 + i * .006, .080], [.075, -.007 + i * .006, .086]], .00034, green);
  const result = merge(parts);
  result.name = `batting-glove-${mirror ? 'left' : 'right'}-${thumbUp ? 'lower' : 'upper'}`;
  return result;
}

// Surface roughness is baked per part. Position-based, derivative-filtered grain
// has a constant submillimetre scale across leather, thread and fabric; it does
// not stretch huge quilt squares over the tiny UVs of extruded panels.
export function createGloveMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 equipmentSurface;\nvarying vec2 vEquipmentSurface;\nvarying vec3 vEquipmentPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEquipmentSurface = equipmentSurface;\nvEquipmentPosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vEquipmentSurface;\nvarying vec3 vEquipmentPosition;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        vec3 grainPosition = vEquipmentPosition * 1750.0;
        float grainVisibility = 1.0 - smoothstep(0.45, 1.6, length(fwidth(grainPosition)));
        float grain = fract(sin(dot(floor(grainPosition), vec3(12.9898,78.233,37.719))) * 43758.5453) - 0.5;
        float weave = sin(vEquipmentPosition.y * 4600.0) * sin(vEquipmentPosition.z * 4600.0);
        float surfaceDetail = (grain + weave * 0.15) * grainVisibility * vEquipmentSurface.y;
        roughnessFactor = clamp(vEquipmentSurface.x + surfaceDetail, 0.4, 1.0);
        diffuseColor.rgb *= 1.0 + surfaceDetail * 0.45;`);
  };
  material.customProgramCacheKey = () => 'cricsim-equipment-grain-v1';
  return material;
}
