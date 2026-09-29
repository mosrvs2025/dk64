// Procedural low-poly models built from primitives.
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.78, metalness: 0, ...opts }));
  }
  return matCache.get(key);
}
function part(geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, mat(color, { flatShading: false, ...(opts || {}) }));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, s = 10) => new THREE.SphereGeometry(r, Math.max(16, s), Math.max(12, s - 2));
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);

export function makeHero() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const fur = 0x7a4a24, skin = 0xe8b47a;
  const torso = part(sph(0.62, 12), fur, 0, 1.0, 0); torso.scale.set(1.05, 1, 0.9); body.add(torso);
  const belly = part(sph(0.45, 10), skin, 0, 0.95, 0.28); belly.scale.set(1, 1, 0.6); body.add(belly);
  const head = new THREE.Group(); head.position.set(0, 1.7, 0.05); body.add(head);
  head.add(part(sph(0.45, 12), fur, 0, 0, 0));
  const face = part(sph(0.34, 10), skin, 0, -0.05, 0.25); face.scale.set(1.1, 0.85, 0.7); head.add(face);
  for (const sx of [-0.14, 0.14]) {
    head.add(part(sph(0.12, 8), 0xffffff, sx, 0.1, 0.36, { roughness: 0.3 }));
    head.add(part(sph(0.065, 6), 0x1a0e06, sx, 0.11, 0.46, { roughness: 0.2 }));
  }
  head.add(part(box(0.62, 0.1, 0.12), 0x5a3418, 0, 0.2, 0.38));
  const tie = part(box(0.22, 0.34, 0.08), 0xd8242a, 0, 1.35, 0.52); tie.rotation.x = 0.25; body.add(tie);
  const armGeo = cyl(0.17, 0.2, 0.9);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.68, 1.35, 0); armR.position.set(0.68, 1.35, 0);
  const al = part(armGeo, fur, 0, -0.45, 0), ar = part(armGeo, fur, 0, -0.45, 0);
  armL.add(al, part(sph(0.24, 8), skin, 0, -0.95, 0)); armR.add(ar, part(sph(0.24, 8), skin, 0, -0.95, 0));
  body.add(armL, armR);
  const legGeo = cyl(0.18, 0.16, 0.5);
  const legL = part(legGeo, fur, -0.3, 0.3, 0), legR = part(legGeo, fur, 0.3, 0.3, 0);
  legL.add(part(box(0.3, 0.14, 0.45), skin, 0, -0.25, 0.08)); legR.add(part(box(0.3, 0.14, 0.45), skin, 0, -0.25, 0.08));
  body.add(legL, legR);
  g.userData = { body, head, armL, armR, legL, legR };
  return g;
}

export function makeFrogForm() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const green = 0x3fbf4a, belly = 0xd8f08a;
  const b = part(sph(0.75, 12), green, 0, 0.7, 0); b.scale.set(1.1, 0.75, 1.1); body.add(b);
  const bl = part(sph(0.55, 10), belly, 0, 0.6, 0.35); bl.scale.set(1, 0.7, 0.6); body.add(bl);
  for (const s of [-1, 1]) {
    const eye = part(sph(0.24, 8), green, s * 0.35, 1.2, 0.3); body.add(eye);
    eye.add(part(sph(0.14, 6), 0xffffff, 0, 0.05, 0.14));
    eye.add(part(sph(0.07, 6), 0x111111, 0, 0.07, 0.25));
    const leg = part(sph(0.3, 8), green, s * 0.7, 0.3, -0.3); leg.scale.set(0.8, 0.6, 1.4); body.add(leg);
  }
  body.add(part(box(0.1, 0.05, 0.3), 0x222222, 0, 0.95, 0.72));
  const tongue = part(cyl(0.07, 0.07, 1, 6), 0xff5a7a, 0, 0.8, 0.5);
  tongue.rotation.x = Math.PI / 2; tongue.visible = false; tongue.geometry.translate(0, 0.5, 0);
  g.add(tongue);
  g.userData = { body, tongue };
  return g;
}

export function makeGrunt(scale = 1, color = 0x5a8a3a) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const b = part(sph(0.7, 10), color, 0, 0.9, 0); b.scale.set(1, 1.1, 0.9); body.add(b);
  body.add(part(box(0.9, 0.3, 0.4), 0xffe0a0, 0, 0.8, 0.5));
  for (const s of [-1, 1]) {
    body.add(part(sph(0.12, 6), 0xffee55, s * 0.25, 1.3, 0.55));
    body.add(part(cyl(0.02, 0.1, 0.35, 5), 0xffffff, s * 0.3, 0.9, 0.6));
    body.add(part(cyl(0.15, 0.15, 0.45), color, s * 0.35, 0.2, 0));
    const horn = part(cyl(0.01, 0.12, 0.45, 5), 0xeeeecc, s * 0.35, 1.7, 0); horn.rotation.z = -s * 0.4; body.add(horn);
  }
  const club = part(cyl(0.12, 0.2, 1.1, 6), 0x7a5230, 0.8, 0.9, 0.2); club.rotation.x = 0.6; body.add(club);
  g.scale.setScalar(scale);
  g.userData = { body, club };
  return g;
}

export function makeSpitter() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  body.add(part(cyl(0.18, 0.25, 1.4, 6), 0x2f7a2a, 0, 0.7, 0));
  const head = new THREE.Group(); head.position.y = 1.6; body.add(head);
  head.add(part(sph(0.55, 10), 0xb02a6a, 0, 0, 0));
  head.add(part(cyl(0.22, 0.32, 0.5, 8), 0x7a1a4a, 0, 0, 0.45)).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const leaf = part(box(0.9, 0.05, 0.35), 0x3f9a3a, 0, 0.1, 0);
    leaf.rotation.y = i * 1.25; leaf.position.set(Math.cos(i * 1.25) * 0.45, 0.1, -Math.sin(i * 1.25) * 0.45);
    body.add(leaf);
  }
  g.userData = { body, head };
  return g;
}

export function makeRoller() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const shell = part(sph(0.8, 10), 0x8a7a9a, 0, 0.8, 0); shell.scale.set(1, 0.85, 1.2); body.add(shell);
  for (let i = -2; i <= 2; i++) body.add(part(box(1.5, 0.1, 0.12), 0x5a4a6a, 0, 1.0 + Math.cos(i * 0.5) * 0.3, i * 0.35));
  const face = part(sph(0.35, 8), 0xd8c0a0, 0, 0.6, 0.85); body.add(face);
  face.add(part(sph(0.07, 6), 0xff2222, -0.12, 0.1, 0.3));
  face.add(part(sph(0.07, 6), 0xff2222, 0.12, 0.1, 0.3));
  g.userData = { body };
  return g;
}

export function makeCritterFrog() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const b = part(sph(0.9, 10), 0x2aa8c8, 0, 0.8, 0); b.scale.set(1.2, 0.8, 1.2); body.add(b);
  for (const s of [-1, 1]) {
    const eye = part(sph(0.3, 8), 0x2aa8c8, s * 0.45, 1.45, 0.4); body.add(eye);
    eye.add(part(sph(0.18, 6), 0xffff88, 0, 0.05, 0.18));
    eye.add(part(sph(0.09, 6), 0x111111, 0, 0.07, 0.32));
  }
  body.add(part(sph(0.35, 8), 0xffe066, 0, 0.9, 0.9));
  g.userData = { body };
  return g;
}

export function makeRelic() {
  const g = new THREE.Group();
  const gold = { emissive: 0xffa010, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.25 };
  const core = part(new THREE.OctahedronGeometry(0.7), 0xffd23a, 0, 0, 0, gold); g.add(core);
  const ring = part(new THREE.TorusGeometry(1.0, 0.1, 6, 20), 0xffe98a, 0, 0, 0, gold); g.add(ring);
  const glow = new THREE.Mesh(sph(1.4, 10), new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(glow);
  g.userData = { ring, core };
  return g;
}

export function makeDNA() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8, y = i * 0.18 - 0.6;
    g.add(part(sph(0.13, 6), 0x5aff9a, Math.cos(a) * 0.35, y, Math.sin(a) * 0.35, { emissive: 0x1a6a3a }));
    g.add(part(sph(0.13, 6), 0x9a5aff, -Math.cos(a) * 0.35, y, -Math.sin(a) * 0.35, { emissive: 0x3a1a6a }));
  }
  return g;
}

export function makeBlueprint() {
  const g = new THREE.Group();
  const p = part(box(1.4, 1.0, 0.08), 0x2a6adf, 0, 0, 0, { emissive: 0x0a2a6a }); g.add(p);
  const hook = part(new THREE.TorusGeometry(0.25, 0.06, 6, 12, Math.PI * 1.3), 0xffffff, 0, 0, 0.06, { emissive: 0x888888 }); g.add(hook);
  return g;
}

export function makeChest() {
  const g = new THREE.Group();
  g.add(part(box(1.2, 0.7, 0.8), 0x8a5a2a, 0, 0.35, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.4); g.add(lid);
  const l = part(box(1.2, 0.3, 0.8), 0xa06a30, 0, 0.15, 0.4); lid.add(l);
  g.add(part(box(1.25, 0.12, 0.85), 0xffcf3a, 0, 0.6, 0));
  g.userData = { lid };
  return g;
}

export function makeCrate(tnt = false) {
  const g = new THREE.Group();
  if (tnt) {
    g.add(part(cyl(0.65, 0.65, 1.4, 12), 0xc8281e, 0, 0.7, 0));
    g.add(part(cyl(0.68, 0.68, 0.15, 12), 0x333333, 0, 1.2, 0));
    g.add(part(cyl(0.68, 0.68, 0.15, 12), 0x333333, 0, 0.2, 0));
    const lbl = part(box(0.9, 0.4, 0.05), 0xffe066, 0, 0.7, 0.64); g.add(lbl);
  } else {
    g.add(part(box(1.4, 1.4, 1.4), 0xb07a3a, 0, 0.7, 0));
    for (const y of [0.1, 1.3]) {
      g.add(part(box(1.46, 0.16, 1.46), 0x7a4a1a, 0, y, 0));
    }
    const x = part(box(0.16, 1.8, 1.44), 0x7a4a1a, 0, 0.7, 0); x.rotation.x = Math.PI / 4; g.add(x);
  }
  return g;
}

export function makeCheckpoint() {
  const g = new THREE.Group();
  g.add(part(cyl(0.08, 0.1, 3.2, 6), 0xdddddd, 0, 1.6, 0));
  const flag = part(box(1.2, 0.8, 0.05), 0x888888, 0.62, 2.7, 0); g.add(flag);
  g.add(part(cyl(0.6, 0.7, 0.3, 8), 0x777777, 0, 0.15, 0));
  g.userData = { flag };
  return g;
}

export function makeGrapplePoint() {
  const g = new THREE.Group();
  const ring = part(new THREE.TorusGeometry(0.6, 0.14, 6, 16), 0x3ad8ff, 0, 0, 0, { emissive: 0x2ad8ff, emissiveIntensity: 1.4 });
  g.add(ring);
  g.add(part(sph(0.22, 8), 0xffffff, 0, 0, 0, { emissive: 0x4a8aaa }));
  g.userData = { ring };
  return g;
}

export function makeShopkeeper() {
  const g = new THREE.Group();
  const b = part(sph(0.7, 10), 0x9a9a9a, 0, 0.9, 0); g.add(b);
  g.add(part(sph(0.45, 10), 0xa8a8a8, 0, 1.8, 0));
  g.add(part(sph(0.3, 8), 0xe8c8a0, 0, 1.75, 0.3));
  g.add(part(cyl(0.7, 0.7, 0.1, 10), 0x8a5a2a, 0, 2.2, 0));
  g.add(part(cyl(0.4, 0.45, 0.4, 10), 0x8a5a2a, 0, 2.4, 0));
  g.add(part(box(0.8, 0.3, 0.3), 0xeeeeee, 0, 1.45, 0.35));
  return g;
}

export function makeBoss() {
  const g = makeGrunt(2.6, 0x8a2a2a);
  const crown = part(cyl(0.35, 0.3, 0.3, 6), 0xffd23a, 0, 1.95, 0, { emissive: 0x5a3a00 });
  g.userData.body.add(crown);
  return g;
}

export function makeCrown() {
  const g = new THREE.Group();
  const gold = { emissive: 0xffa010, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.25 };
  g.add(part(cyl(1.2, 1.0, 0.8, 10), 0xffd23a, 0, 0, 0, gold));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(part(new THREE.ConeGeometry(0.28, 0.8, 5), 0xffd23a, Math.cos(a) * 1.05, 0.7, Math.sin(a) * 1.05, gold));
    g.add(part(sph(0.15, 6), [0xff3a3a, 0x3aff8a, 0x3a8aff][i % 3], Math.cos(a) * 1.15, 0.05, Math.sin(a) * 1.15, { emissive: 0x333333 }));
  }
  return g;
}
