// The hero: a rigged, smooth-shaded ape with procedural animation.
import * as THREE from 'three';

const M = new Map();
function m(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!M.has(k)) M.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
  return M.get(k);
}
function mesh(geo, color, o) { const x = new THREE.Mesh(geo, m(color, o)); x.castShadow = true; return x; }
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 12);
const ball = (r) => new THREE.SphereGeometry(r, 20, 14);

const FUR = 0x6b3a1c, FUR_DARK = 0x4a2610, SKIN = 0xe9b88a, TIE = 0xd11f2a;

// Makes a pivot group whose child limb hangs downward from the pivot.
function limb(r, len, color, taper = 1) {
  const pivot = new THREE.Group();
  const seg = mesh(cap(r, len), color);
  seg.position.y = -len / 2 - r * 0.3;
  seg.scale.set(1, 1, taper);
  pivot.add(seg);
  const end = new THREE.Group(); end.position.y = -len - r * 0.5;
  pivot.add(end);
  return { pivot, end };
}

export function makeKong() {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.78; root.add(hips);
  const pelvis = mesh(ball(0.36), FUR); pelvis.scale.set(1.15, 0.8, 0.95); hips.add(pelvis);

  const torso = new THREE.Group(); torso.position.y = 0.12; hips.add(torso);
  const chest = mesh(ball(0.62), FUR); chest.position.set(0, 0.5, -0.02); chest.scale.set(1.12, 0.95, 0.85); torso.add(chest);
  const pecs = mesh(ball(0.42), SKIN); pecs.position.set(0, 0.52, 0.26); pecs.scale.set(1.25, 0.8, 0.55); torso.add(pecs);
  const belly = mesh(ball(0.36), SKIN); belly.position.set(0, 0.12, 0.2); belly.scale.set(1.1, 0.95, 0.65); torso.add(belly);
  // back hump + shoulder mass
  const hump = mesh(ball(0.5), FUR_DARK); hump.position.set(0, 0.72, -0.2); hump.scale.set(1.3, 0.7, 0.8); torso.add(hump);

  // tie
  const knot = mesh(new THREE.OctahedronGeometry(0.1), TIE, { roughness: 0.5 }); knot.position.set(0, 0.88, 0.47); knot.scale.set(1.2, 0.8, 0.6); torso.add(knot);
  const tieGeo = new THREE.CylinderGeometry(0.16, 0.06, 0.5, 4, 1); tieGeo.rotateY(Math.PI / 4);
  const tie = mesh(tieGeo, TIE, { roughness: 0.5 }); tie.position.set(0, 0.6, 0.5); tie.scale.set(1, 1, 0.3); tie.rotation.x = 0.28; torso.add(tie);
  const badge = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), 0xffcf3a, { metalness: 0.8, roughness: 0.3, emissive: 0x5a3a00 });
  badge.rotation.x = Math.PI / 2 + 0.28; badge.position.set(0, 0.6, 0.555); torso.add(badge);

  // head
  const neck = new THREE.Group(); neck.position.set(0, 1.0, 0.12); torso.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.22, 0.06); neck.add(head);
  const skull = mesh(ball(0.42), FUR); skull.scale.set(1, 0.95, 0.95); head.add(skull);
  const tuft = new THREE.Group(); tuft.position.set(0, 0.38, -0.02); head.add(tuft);
  for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(0.08, 0.28, 6), FUR_DARK); c.position.set((i - 1) * 0.07, 0.06, -i * 0.04); c.rotation.set(-0.5, 0, (i - 1) * 0.3); tuft.add(c); }
  const face = mesh(ball(0.3), SKIN); face.position.set(0, -0.02, 0.24); face.scale.set(1.15, 0.9, 0.7); head.add(face);
  const muzzle = mesh(ball(0.22), SKIN); muzzle.position.set(0, -0.14, 0.38); muzzle.scale.set(1.35, 0.9, 0.9); head.add(muzzle);
  const mouth = mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 16, Math.PI), 0x3a1a0a); mouth.position.set(0, -0.2, 0.55); mouth.rotation.set(0.2, 0, Math.PI); head.add(mouth);
  for (const s of [-1, 1]) {
    const nos = mesh(ball(0.03), 0x2a140a); nos.position.set(s * 0.06, -0.06, 0.58); head.add(nos);
    const white = mesh(ball(0.085), 0xffffff, { roughness: 0.2 }); white.position.set(s * 0.13, 0.09, 0.4); white.scale.set(1, 1.15, 0.7); head.add(white);
    const pupil = mesh(ball(0.045), 0x140a04, { roughness: 0.1 }); pupil.position.set(s * 0.125, 0.085, 0.46); head.add(pupil);
    const glint = mesh(ball(0.012), 0xffffff, { emissive: 0xffffff }); glint.position.set(s * 0.11, 0.105, 0.5); head.add(glint);
    const ear = mesh(ball(0.12), SKIN); ear.position.set(s * 0.42, 0.02, 0); ear.scale.set(0.45, 1, 0.9); head.add(ear);
    const earIn = mesh(ball(0.12), FUR_DARK); earIn.position.set(s * 0.44, 0.02, 0); earIn.scale.set(0.2, 1.1, 1); head.add(earIn);
  }
  const brow = mesh(cap(0.08, 0.34), FUR_DARK); brow.rotation.z = Math.PI / 2; brow.position.set(0, 0.2, 0.36); head.add(brow);

  // arms (big forearms, ape proportions)
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(s * 0.68, 0.72, 0.02); torso.add(shoulder);
    const delt = mesh(ball(0.27), FUR); shoulder.add(delt);
    const upper = limb(0.19, 0.46, FUR); shoulder.add(upper.pivot);
    const elbow = new THREE.Group(); upper.end.add(elbow);
    const fore = limb(0.25, 0.42, FUR); elbow.add(fore.pivot);
    const hand = mesh(ball(0.23), SKIN); hand.scale.set(1, 0.85, 1.1); hand.position.y = 0.04; fore.end.add(hand);
    for (let f = 0; f < 3; f++) { const k = mesh(ball(0.075), SKIN); k.position.set((f - 1) * 0.1, -0.12, 0.12); hand.add(k); }
    arms.push({ shoulder, elbow, upper: upper.pivot, hand });
  }
  // legs (short and stout)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.26, -0.1, 0); hips.add(hip);
    const thigh = limb(0.19, 0.22, FUR); hip.add(thigh.pivot);
    const knee = new THREE.Group(); thigh.end.add(knee);
    const shin = limb(0.16, 0.18, FUR); knee.add(shin.pivot);
    const foot = mesh(ball(0.18), SKIN); foot.scale.set(1.05, 0.55, 1.6); foot.position.set(0, -0.02, 0.12); shin.end.add(foot);
    legs.push({ hip, knee, foot });
  }
  root.userData.rig = { root, hips, torso, neck, head, arms, legs, chest, tuft, pose: {} };
  return root;
}

const damp = (a, b, k) => a + (b - a) * k;

// s: { speed, grounded, vy, t, dt, attack(0..1 or -1), combo, slamming, carrying, grapple, swimming, dash, flip, sprint, landing }
export function animateKong(rig, s) {
  const { hips, torso, neck, head, arms, legs } = rig;
  const P = rig.pose;
  const k = Math.min(1, s.dt * 16);
  rig.phase = (rig.phase || 0) + s.dt * (3 + s.speed * 1.05);
  const ph = rig.phase, sn = Math.sin(ph), cs = Math.cos(ph);
  const run = s.grounded ? Math.min(1, s.speed / 9) : 0;
  const gallop = s.grounded ? Math.max(0, Math.min(1, (s.speed - 10) / 4)) : 0;

  // default targets
  const T = {
    hipsY: 0.78, hipsYaw: 0, hipsRoll: 0,
    torsoX: 0.12, torsoY: 0, torsoZ: 0,
    neckX: -0.1, neckY: 0,
    sh: [[0.1, 0, 0.15], [0.1, 0, -0.15]], // shoulder x,y,z (L,R)
    el: [-0.35, -0.35],
    hip: [0, 0], kn: [0.1, 0.1],
  };
  // idle breathing & look around
  const breath = Math.sin(s.t * 2.2);
  T.torsoX += breath * 0.02; T.neckY = Math.sin(s.t * 0.5) * 0.25 * (1 - run);
  T.sh[0][2] = 0.15 + breath * 0.03; T.sh[1][2] = -0.15 - breath * 0.03;

  if (run > 0.01) {
    T.hipsY = 0.78 + Math.abs(cs) * 0.09 * run - 0.03 * run;
    T.hipsYaw = sn * 0.18 * run; T.hipsRoll = cs * 0.05 * run;
    T.torsoX = 0.2 + 0.2 * run + gallop * 0.35;
    T.torsoY = -sn * 0.22 * run;
    T.neckX = -0.2 * run - gallop * 0.3; T.neckY = sn * 0.12 * run;
    T.hip = [sn * 0.9 * run, -sn * 0.9 * run];
    T.kn = [Math.max(0, -sn) * 1.3 * run + 0.15, Math.max(0, sn) * 1.3 * run + 0.15];
    const swing = 0.9 + gallop * 0.6;
    T.sh = [[-sn * swing * run, 0, 0.2], [sn * swing * run, 0, -0.2]];
    T.el = [-0.5 - Math.max(0, sn) * 0.6 * run, -0.5 - Math.max(0, -sn) * 0.6 * run];
  }
  if (!s.grounded && !s.swimming) {
    if (s.vy > 0) { // rising: arms thrown up, legs tucked
      T.sh = [[-2.6, 0, 0.5], [-2.6, 0, -0.5]]; T.el = [-0.3, -0.3];
      T.hip = [-0.9, -0.3]; T.kn = [1.4, 0.6]; T.torsoX = -0.05;
    } else { // falling: flail
      const f = Math.sin(s.t * 18) * 0.35;
      T.sh = [[-1.2 + f, 0, 1.1], [-1.2 - f, 0, -1.1]]; T.el = [-0.6, -0.6];
      T.hip = [-0.3, 0.2]; T.kn = [0.5, 0.3]; T.torsoX = 0.1;
    }
  }
  if (s.swimming) {
    T.torsoX = 1.1; T.neckX = -0.9;
    T.sh = [[-2.2 + sn * 1.2, 0, 0.4], [-2.2 - sn * 1.2, 0, -0.4]]; T.el = [-0.3, -0.3];
    T.hip = [sn * 0.5, -sn * 0.5]; T.kn = [0.3, 0.3];
  }
  if (s.attack >= 0) { // punch: wind-up then snap
    const a = s.attack, ext = a < 0.25 ? -a * 2 : Math.min(1, (a - 0.25) * 5);
    const side = s.combo === 1 ? 0 : 1;
    T.torsoY = (side ? -1 : 1) * (0.5 * ext - 0.2);
    T.sh[side] = [-1.55 * ext, 0, side ? -0.1 : 0.1]; T.el[side] = -0.1 - (1 - ext) * 1.2;
    const o = 1 - side; T.sh[o] = [0.4, 0, o ? -0.3 : 0.3]; T.el[o] = -1.2;
    if (s.combo === 2) { T.sh = [[-1.6 * ext, 0, 0.35], [-1.6 * ext, 0, -0.35]]; T.el = [-0.1, -0.1]; T.torsoY = 0; T.torsoX = 0.35; }
    T.hip = [0.5, -0.4]; T.kn = [0.4, 0.5];
  }
  if (s.slamming) { T.sh = [[-3, 0, 0.3], [-3, 0, -0.3]]; T.el = [-0.2, -0.2]; T.hip = [-1.2, -1.2]; T.kn = [1.6, 1.6]; }
  if (s.carrying) { T.sh = [[-2.9, 0, 0.25], [-2.9, 0, -0.25]]; T.el = [-0.35, -0.35]; T.torsoX = -0.05; }
  if (s.grapple) { T.sh = [[0.6, 0, 0.4], [-3.0, 0, -0.1]]; T.el = [-0.8, -0.05]; T.hip = [0.3, -0.5]; T.kn = [0.6, 0.9]; }
  if (s.dash) { T.torsoX = 0.9; T.sh = [[0.9, 0, 0.3], [0.9, 0, -0.3]]; T.hip = [-0.8, 0.6]; T.kn = [1, 0.4]; }
  if (s.landing > 0) { T.hipsY -= s.landing * 0.9; T.kn = [T.kn[0] + s.landing * 3, T.kn[1] + s.landing * 3]; T.hip = [T.hip[0] - s.landing * 2, T.hip[1] - s.landing * 2]; T.torsoX += s.landing * 1.5; }

  // blend
  const b = (key, v) => (P[key] = damp(P[key] ?? v, v, k));
  hips.position.y = b('hy', T.hipsY);
  hips.rotation.y = b('hyaw', T.hipsYaw);
  hips.rotation.z = b('hroll', T.hipsRoll);
  torso.rotation.x = s.flip ? -s.flip : b('tx', T.torsoX);
  torso.rotation.y = b('ty', T.torsoY);
  neck.rotation.x = b('nx', T.neckX - (s.flip ? 0 : T.torsoX * 0.6));
  neck.rotation.y = b('ny', T.neckY - T.torsoY * 0.5);
  rig.chest.scale.y = 0.95 + breath * 0.015;
  for (let i = 0; i < 2; i++) {
    const A = arms[i], L = legs[i];
    A.shoulder.rotation.x = b('sx' + i, T.sh[i][0]);
    A.shoulder.rotation.y = b('sy' + i, T.sh[i][1]);
    A.shoulder.rotation.z = b('sz' + i, T.sh[i][2]);
    A.elbow.rotation.x = b('e' + i, T.el[i]);
    L.hip.rotation.x = b('hp' + i, T.hip[i]);
    L.knee.rotation.x = b('kn' + i, T.kn[i]);
    L.foot.rotation.x = -(P['hp' + i] + P['kn' + i]) * 0.3;
  }
}
