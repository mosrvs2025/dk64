// Analytic heightfield for the whole island. Collision samples H() directly;
// the render mesh is built from the same function.
import * as THREE from 'three';

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return vnoise(x, z) * 0.6 + vnoise(x * 2.1 + 5, z * 2.1 + 9) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.1;
}
export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

// --- Landmarks -----------------------------------------------------------
export const HUB = { x: 0, z: 0 };
export const LAGOON = { x: -160, z: 50, r: 32, water: -1.5 };
export const ROCK = { x: -32, z: 26 };
export const VOLCANO = { x: 190, z: 20, lava: -0.4 };
export const PLATEAU_Y = 16;
export const PLATEAU_EDGE = -112; // cliff starts here (z)
export const SPIRE = { x: 0, z: -84 };
export const OCEAN_R = 240;
export const SEA_LEVEL = -1.5;
export const ISLET = { x: 10, z: 262 };

// Underground tunnel: jungle pit -> ruins plateau
export const TUNNEL = [
  [-130, -62], [-112, -92], [-92, -118], [-78, -140], [-68, -162],
];
const TUNNEL_SEG = [];
let TUNNEL_LEN = 0;
for (let i = 0; i < TUNNEL.length - 1; i++) {
  const [ax, az] = TUNNEL[i], [bx, bz] = TUNNEL[i + 1];
  const len = Math.hypot(bx - ax, bz - az);
  TUNNEL_SEG.push({ ax, az, bx, bz, len, start: TUNNEL_LEN });
  TUNNEL_LEN += len;
}
export function tunnelInfo(x, z) {
  let best = 1e9, bestS = 0;
  for (const s of TUNNEL_SEG) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    let t = ((x - s.ax) * dx + (z - s.az) * dz) / (s.len * s.len);
    t = Math.min(1, Math.max(0, t));
    const px = s.ax + dx * t, pz = s.az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestS = (s.start + t * s.len) / TUNNEL_LEN; }
  }
  return { d: best, s: bestS };
}
export function tunnelPoint(s) {
  const target = s * TUNNEL_LEN;
  for (const seg of TUNNEL_SEG) {
    if (target <= seg.start + seg.len) {
      const t = (target - seg.start) / seg.len;
      return [seg.ax + (seg.bx - seg.ax) * t, seg.az + (seg.bz - seg.az) * t];
    }
  }
  const l = TUNNEL[TUNNEL.length - 1];
  return [l[0], l[1]];
}
export const tunnelFloor = (s) => lerp(-12, PLATEAU_Y, smooth(0.12, 1.0, s));
export const SECRET_PIT = { s: 0.42 };
const [spx, spz] = tunnelPoint(SECRET_PIT.s);
SECRET_PIT.x = spx; SECRET_PIT.z = spz;

// Surface without the tunnel carve (used for tunnel roof placement)
export function surfaceH(x, z) {
  let h = 1 + (fbm(x * 0.03, z * 0.03) - 0.5) * 2.5;

  // Jungle hills to the west
  const jungle = smooth(-50, -90, x);
  h += jungle * (fbm(x * 0.018 + 20, z * 0.018) - 0.35) * 9;

  // Hub flattening
  const dh = Math.hypot(x - HUB.x, z - HUB.z);
  h = lerp(1, h, smooth(38, 60, dh));

  // Big rock in the hub (secret on top)
  const dr = Math.hypot(x - ROCK.x, z - ROCK.z);
  h += 12 * smooth(8, 5.5, dr);

  // Lagoon
  const dl = Math.hypot(x - LAGOON.x, z - LAGOON.z);
  h = lerp(h, -6, smooth(LAGOON.r + 4, LAGOON.r - 6, dl));

  // Ruins plateau (north) — steep cliff
  const pt = smooth(PLATEAU_EDGE, PLATEAU_EDGE - 6, z);
  h = lerp(h, PLATEAU_Y + (fbm(x * 0.05, z * 0.05) - 0.5) * 0.8, pt);

  // Volcano rim with a western gap
  const vx = x - VOLCANO.x, vz = z - VOLCANO.z;
  const dv = Math.hypot(vx, vz);
  if (dv < 95) {
    const ang = Math.atan2(vz, vx);
    const gapDist = Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)));
    const gap = smooth(0.2, 0.12, gapDist);
    const rimH = 15 * smooth(88, 80, dv) * smooth(64, 69, dv) * (1 - gap);
    let vh = Math.max(2, rimH);
    vh = lerp(vh, -1.5, smooth(59, 57, dv));
    h = lerp(h, vh, smooth(94, 86, dv));
    const basin = -1.5;
    // central arena island
    h = Math.max(h, lerp(basin, 3, smooth(24, 20, dv)));
  }

  // Ocean
  const dc = Math.hypot(x, z);
  h = lerp(h, -9, smooth(OCEAN_R - 10, OCEAN_R + 30, dc));

  // Tiny ocean islet with a secret relic
  const di = Math.hypot(x - ISLET.x, z - ISLET.z);
  h = Math.max(h, lerp(-9, 2.5, smooth(14, 8, di)));

  return h;
}

export function H(x, z) {
  let h = surfaceH(x, z);
  const t = tunnelInfo(x, z);
  if (t.d < 5) {
    const mask = smooth(4.6, 3.4, t.d);
    const f = tunnelFloor(t.s);
    h = lerp(h, Math.min(h, f), mask);
    // Secret pit under a breakable slab
    const dp = Math.hypot(x - SECRET_PIT.x, z - SECRET_PIT.z);
    if (dp < 2.6) h = Math.min(h, tunnelFloor(SECRET_PIT.s) - 2.2);
  }
  return h;
}

export function slope(x, z) {
  const e = 0.4;
  const gx = (H(x + e, z) - H(x - e, z)) / (2 * e);
  const gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
  return { gx, gz, m: Math.hypot(gx, gz) };
}

export function isLagoon(x, z) {
  return Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 3;
}
export function waterLevelAt(x, z) {
  if (isLagoon(x, z)) return LAGOON.water;
  if (Math.hypot(x, z) > OCEAN_R - 12) return SEA_LEVEL;
  return -Infinity;
}
export function isLava(x, z) {
  return Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 59;
}

const C = (h) => new THREE.Color(h);
const COL = {
  sand: C(0xe8d49a), grass: C(0x6fbf4a), jungle: C(0x2f8a3a), dirt: C(0x8a6a44),
  rock: C(0x7d7468), stone: C(0xb9ad92), ash: C(0x3b3130), hot: C(0x6a2a1a), deep: C(0x3c6b5a),
  cave: C(0x4a3b30),
};

export function buildTerrainMesh(segments) {
  const size = 620;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = H(x, z);
    pos.setY(i, h);
    const s = slope(x, z).m;
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const jungle = smooth(-50, -90, x);
    c.copy(COL.grass).lerp(COL.jungle, jungle);
    if (h < 0.2) c.lerp(COL.sand, smooth(0.2, -0.6, h));
    if (h < -3) c.copy(COL.deep);
    if (z < PLATEAU_EDGE - 4 && h > PLATEAU_Y - 3) c.copy(COL.stone).lerp(COL.grass, fbm(x * 0.1, z * 0.1) * 0.5);
    if (dv < 92) c.lerp(COL.ash, smooth(92, 80, dv));
    if (dv < 62) c.copy(COL.hot);
    if (dv < 24 && h > 1) c.copy(COL.ash).lerp(COL.rock, 0.3);
    const t = tunnelInfo(x, z);
    if (t.d < 4.2 && h < surfaceH(x, z) - 1) c.copy(COL.cave);
    if (s > 1.1) c.lerp(COL.rock, smooth(1.1, 1.8, s));
    const n = (fbm(x * 0.3, z * 0.3) - 0.5) * 0.12;
    c.offsetHSL(0, 0, n);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
