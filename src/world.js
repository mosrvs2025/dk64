// Builds the island: terrain, water, lava, props, colliders, and all placements.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createSky, terrainMaterial, heightTexture, createWaterMaterial, createLavaMaterial, windify, scatterFlora, shared } from './gfx.js';
import {
  H, surfaceH, buildTerrainMesh, LAGOON, ROCK, VOLCANO, SPIRE, PLATEAU_Y, OCEAN_R, SEA_LEVEL,
  TUNNEL, tunnelPoint, tunnelFloor, SECRET_PIT, ISLET, fbm, smooth, tunnelInfo, isLagoon,
} from './terrain.js';
import { Box } from './physics.js';
import {
  mat, makeRelic, makeChest, makeCheckpoint, makeGrapplePoint, makeShopkeeper, makeCrown,
} from './models.js';

export function buildWorld(G, quality) {
  const { scene, world } = G;
  const L = {
    relics: [], chests: [], checkpoints: [], grapples: [], throwSpawns: [], enemies: [], frogs: [],
    coins: [], plates: [], signs: [], breakables: [], shop: null, blueprint: null, crown: null,
    barrier: null, gate: null, animated: [], cull: [],
  };
  G.level = L;

  // ---------- Sky ----------
  G.sky = createSky(scene);

  // ---------- Terrain ----------
  const terrain = buildTerrainMesh(quality.terrainSeg);
  terrain.material = terrainMaterial();
  scene.add(terrain);

  // ---------- Water & lava ----------
  const hTex = heightTexture();
  const mkWater = (level) => {
    const m = createWaterMaterial(hTex, level);
    m.uniforms.uTime = shared.time; m.uniforms.uH.value = hTex;
    return m;
  };
  const lag = new THREE.Mesh(new THREE.CircleGeometry(LAGOON.r + 6, 64), mkWater(LAGOON.water));
  lag.rotation.x = -Math.PI / 2; lag.position.set(LAGOON.x, LAGOON.water, LAGOON.z); scene.add(lag);
  const ocean = new THREE.Mesh(new THREE.RingGeometry(OCEAN_R - 50, 1800, 128, 24), mkWater(SEA_LEVEL));
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = SEA_LEVEL; scene.add(ocean);
  const lavaMat = createLavaMaterial();
  lavaMat.uniforms.uTime = shared.time;
  const lava = new THREE.Mesh(new THREE.CircleGeometry(60, 64), lavaMat);
  lava.rotation.x = -Math.PI / 2; lava.position.set(VOLCANO.x, VOLCANO.lava, VOLCANO.z); scene.add(lava);
  const lavaLight = new THREE.PointLight(0xff6a2a, 250, 170, 1.5);
  lavaLight.position.set(VOLCANO.x, 22, VOLCANO.z); scene.add(lavaLight);
  L.animated.push((t) => { lavaLight.intensity = 250 + Math.sin(t * 2.1) * 35 + Math.sin(t * 5.3) * 15; });

  // ---------- Helpers ----------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const staticMeshes = [];
  function B(x, y, z, w, h, d, color = 0xb9ad92, opts = {}) {
    const m = new THREE.Mesh(boxGeo, mat(color, opts.mat || {}));
    m.scale.set(w, h, d); m.position.set(x, y + h / 2, z);
    m.castShadow = !opts.noShadow; m.receiveShadow = true;
    scene.add(m);
    if (!opts.breakable && !opts.dynamic) staticMeshes.push({ m, color });
    let b = null;
    if (!opts.noCol) {
      b = world.addBox(new Box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, { mesh: m, ...opts }));
    }
    return { mesh: m, box: b };
  }
  G.B = B;
  const gy = (x, z) => H(x, z);
  const grapple = (x, y, z, requires) => {
    const g = makeGrapplePoint(); g.position.set(x, y, z); scene.add(g);
    L.grapples.push({ x, y, z, mesh: g, requires });
  };
  const relic = (id, name, x, y, z, hidden = false) => {
    const m = makeRelic(); m.position.set(x, y, z); m.visible = !hidden; scene.add(m);
    const r = { id, name, x, y, z, mesh: m, taken: false, hidden };
    L.relics.push(r); return r;
  };
  const chest = (x, z, y) => {
    const yy = y ?? world.groundAt(x, z, 999, 0.5).g;
    const m = makeChest(); m.position.set(x, yy, z); m.rotation.y = Math.random() * 6; scene.add(m);
    L.chests.push({ x, y: yy, z, mesh: m, opened: false });
    L.cull.push(m);
  };
  const checkpoint = (name, x, z, y) => {
    const yy = y ?? world.groundAt(x, z, 999, 0.5).g;
    const m = makeCheckpoint(); m.position.set(x, yy, z); scene.add(m);
    L.checkpoints.push({ name, x, y: yy, z, mesh: m, active: false });
    L.cull.push(m);
  };
  const coinTrail = (x0, z0, x1, z1, n, lift = 1.2) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      L.coins.push({ x, y: world.groundAt(x, z, 999, 0.3).g + lift, z });
    }
  };
  const coinRing = (x, z, r, n, y) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      L.coins.push({ x: cx, y: y ?? world.groundAt(cx, cz, 999, 0.3).g + 1.2, z: cz });
    }
  };
  const sign = (x, z, text) => {
    const y = gy(x, z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(boxGeo, mat(0x7a5230)); post.scale.set(0.2, 1.6, 0.2); post.position.y = 0.8; g.add(post);
    const board = new THREE.Mesh(boxGeo, mat(0xc8a060)); board.scale.set(1.6, 0.9, 0.12); board.position.y = 1.6; g.add(board);
    g.position.set(x, y, z); scene.add(g);
    L.signs.push({ x, y, z, text });
    L.cull.push(g);
  };
  const throwSpawn = (type, x, z, y) => L.throwSpawns.push({ type, x, z, y: y ?? world.groundAt(x, z, 999, 0.7).g + 0.1 });
  const enemy = (type, x, z, extra = {}) => L.enemies.push({ type, x, z, ...extra });

  // ---------- Trees & rocks ----------
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.7, 1, 7, 3); trunkGeo.translate(0, 0.5, 0);
  { // gentle bend in trunks
    const p = trunkGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 2.2) * 0.12); }
    trunkGeo.computeVertexNormals();
  }
  // broadleaf canopy: several lumpy blobs merged into one mesh
  const canopyParts = [];
  for (const [x, y, z, r] of [[0, 0, 0, 1], [0.75, -0.25, 0.3, 0.72], [-0.7, -0.2, -0.25, 0.75], [0.1, 0.45, -0.55, 0.65], [-0.2, -0.35, 0.75, 0.6]]) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * 0.08);
      p.setXYZ(i, p.getX(i) * k + x, p.getY(i) * k * 0.85 + y, p.getZ(i) * k + z);
    }
    canopyParts.push(g.index ? g.toNonIndexed() : g);
  }
  const leafGeo = mergeGeometries(canopyParts); leafGeo.computeVertexNormals();
  // palm fronds
  const frondParts = [];
  for (let i = 0; i < 7; i++) {
    const f = new THREE.PlaneGeometry(0.5, 2.6, 1, 4);
    const p = f.attributes.position;
    for (let k = 0; k < p.count; k++) { const yy = p.getY(k) + 1.3; p.setY(k, yy); p.setZ(k, -yy * yy * 0.12); p.setX(k, p.getX(k) * (1 - yy / 3)); }
    f.rotateX(-Math.PI / 2 + 0.35); f.rotateY((i / 7) * Math.PI * 2);
    frondParts.push(f);
  }
  const palmLeafGeo = mergeGeometries(frondParts); palmLeafGeo.computeVertexNormals();
  const trees = [];
  const rng = mulberry(7);
  function okTree(x, z) {
    const h = H(x, z);
    if (h < 0) return false;
    if (Math.hypot(x, z) < 50) return false;
    if (isLagoon(x, z)) return false;
    if (tunnelInfo(x, z).d < 9) return false;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 95) return false;
    if (Math.abs(z - 12) < 7 && x < -40) return false; // jungle path
    if (Math.abs(z - 20) < 8 && x > 40) return false; // east path
    if (Math.hypot(x + 110, z + 15) < 18) return false; // camp
    if (Math.hypot(x + 205, z + 40) < 14) return false; // canopy course
    if (Math.hypot(x - SPIRE.x, z - SPIRE.z) < 20) return false;
    return true;
  }
  for (let i = 0; i < 2600 && trees.length < quality.trees; i++) {
    const x = -290 + rng() * 580, z = -290 + rng() * 580;
    if (!okTree(x, z)) continue;
    const jungle = smooth(-40, -90, x);
    const plateau = z < -120;
    const density = plateau ? 0.12 : 0.18 + jungle * 0.8;
    if (rng() > density) continue;
    const beach = H(x, z) < 1.2 && Math.hypot(x, z) > 180;
    trees.push({ x, z, s: 0.8 + rng() * 0.8 + jungle * 0.6, palm: beach || (!plateau && rng() < 0.15 && jungle < 0.5), plateau });
  }
  const trunkIM = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 1, flatShading: true }), trees.length);
  const leafMat = windify(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), { strength: 0.25, heightScale: 0.5 });
  const nPalm = trees.filter((t) => t.palm).length;
  const leafIM = new THREE.InstancedMesh(leafGeo, leafMat, trees.length - nPalm);
  const palmIM = new THREE.InstancedMesh(palmLeafGeo, windify(new THREE.MeshStandardMaterial({ color: 0x5ab83a, roughness: 0.7, side: THREE.DoubleSide }), { strength: 0.5, heightScale: 0.6 }), Math.max(1, nPalm));
  trunkIM.castShadow = leafIM.castShadow = palmIM.castShadow = true;
  trunkIM.receiveShadow = leafIM.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const lc = new THREE.Color();
  let li = 0, pi = 0;
  trees.forEach((t, i) => {
    const y = H(t.x, t.z) - 0.3;
    const hgt = (t.palm ? 7 : 6) * t.s;
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.4);
    m4.compose(v.set(t.x, y, t.z), tq, s3.set(t.s, hgt, t.s));
    trunkIM.setMatrixAt(i, m4);
    if (t.palm) {
      m4.compose(v.set(t.x + Math.sin(hgt * 2.2) * 0.12 * t.s, y + hgt, t.z), tq, s3.set(1.6 * t.s, 1.3 * t.s, 1.6 * t.s));
      palmIM.setMatrixAt(pi++, m4);
    } else {
      const cs = t.s * (t.x < -60 ? 3.1 : 2.6);
      m4.compose(v.set(t.x, y + hgt + cs * 0.2, t.z), tq, s3.set(cs, cs, cs));
      leafIM.setMatrixAt(li, m4);
      const base = t.plateau ? 0x9ab84a : (t.x < -60 ? 0x1f7a34 : 0x4aa83a);
      lc.set(base).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.12);
      leafIM.setColorAt(li++, lc);
    }
    world.cylinders.push({ x: t.x, z: t.z, r: 0.55 * t.s, y0: y, y1: y + hgt, active: true });
  });
  scene.add(trunkIM, leafIM, palmIM);
  scatterFlora(scene, quality.flora, rng, okTree);

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockIM = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ color: 0x8a8276, roughness: 0.95, flatShading: true }), 120);
  rockIM.receiveShadow = true;
  rockIM.castShadow = true;
  let rc = 0;
  for (let i = 0; i < 600 && rc < 120; i++) {
    const x = -280 + rng() * 560, z = -280 + rng() * 560;
    if (!okTree(x, z) || rng() < 0.6) continue;
    const s = 0.6 + rng() * 1.4;
    m4.compose(v.set(x, H(x, z), z), q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0)), s3.set(s, s * 0.7, s));
    rockIM.setMatrixAt(rc++, m4);
  }
  rockIM.count = rc; scene.add(rockIM);

  // ================= HUB: Kong Village =================
  checkpoint('Kong Village', 4, 16);
  G.spawn = { x: 0, y: 1, z: 12 };
  // huts
  const hut = (x, z, rot = 0, col = 0xc8905a) => {
    B(x, 1, z, 7, 4, 6, col);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3.4, 4), mat(0xa0402a));
    roof.position.set(x, 6.7, z); roof.rotation.y = Math.PI / 4 + rot; roof.castShadow = true; scene.add(roof);
    B(x, 5, z, 7.6, 0.3, 6.6, 0x8a5a2a, { noShadow: true });
  };
  hut(24, 14); hut(-24, 8, 0, 0xd8a86a); hut(16, 32, 0, 0xb8804a); hut(-12, 34);
  // shop
  B(-12, 1, 22, 6, 0.3, 4, 0x8a5a2a);
  const shopkeeper = makeShopkeeper(); shopkeeper.position.set(-12, 1.3, 21); scene.add(shopkeeper);
  L.shop = { x: -12, y: 1.3, z: 22.5, mesh: shopkeeper };
  sign(-8, 25, "CRANKY'S CRATE CO. — Upgrades for coins. Press E / Use to shop.");

  // Watchtower — Relic 1 (tutorial climb)
  const TX = -16, TZ = -12;
  B(TX, 1, TZ, 3, 10, 3, 0x9a7a5a);
  [[3.2, 0, 3], [0, -3.2, 5], [-3.2, 0, 7], [0, 3.2, 9]].forEach(([dx, dz, y], i) => {
    B(TX + dx, y - 0.5, TZ + dz, 2.6, 0.5, 2.6, 0xc8a070);
    if (i === 1) coinRing(TX + dx, TZ + dz, 0.01, 1, y + 1.2);
  });
  B(TX + 3, 1, TZ + 3.4, 2.6, 0.5, 2.6, 0xc8a070);
  relic(1, 'Watchtower Summit', TX, 12.4, TZ);
  coinTrail(0, 8, TX + 4, TZ + 4, 7);
  sign(-7, 4, 'Climb the watchtower! A golden Relic waits on top.');

  // Pillar puzzle — Relic 2 (many solutions)
  const PX = 22, PZ = -18;
  B(PX, 1, PZ, 3, 5.2, 3, 0x9a8a7a);
  relic(2, 'Stubborn Pillar', PX, 7.6, PZ);
  grapple(PX, 12, PZ);
  throwSpawn('crate', 14, -12); throwSpawn('crate', 16, -9); throwSpawn('crate', 12, -16);
  throwSpawn('tnt', 28, -10);
  sign(17, -6, 'Too tall to jump... Stack crates (E to lift, E to drop), punch a TNT and stand close, or come back with new tricks.');

  // Big rock secret
  grapple(ROCK.x, 18, ROCK.z);
  chest(ROCK.x, ROCK.z);

  // Hub coins
  coinRing(0, 0, 10, 10);
  coinTrail(-10, 12, -60, 12, 10);
  coinTrail(10, 16, 60, 20, 10);
  coinTrail(0, -10, 0, -58, 8);

  // Beach secret
  B(45, 0, 150, 6, 3, 1, 0x8a8276); B(47.5, 0, 152, 1, 3, 5, 0x8a8276);
  chest(45, 152.5);
  coinTrail(0, 40, 20, 200, 10);

  // Hub enemies
  enemy('grunt', 8, -32); enemy('grunt', -6, 44);

  // ================= SPIRE (landmark) =================
  {
    const trunkH = 100;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, trunkH, 12), mat(0x8a7a6a));
    trunk.position.set(SPIRE.x, trunkH / 2, SPIRE.z); trunk.castShadow = true; trunk.receiveShadow = true; scene.add(trunk);
    for (let i = 1; i < 10; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(7 - i * 0.3 + 0.2, 0.35, 6, 20), mat(0xffd23a, { emissive: 0x6a4a00 }));
      band.rotation.x = Math.PI / 2; band.position.set(SPIRE.x, i * 10, SPIRE.z); scene.add(band);
    }
    world.cylinders.push({ x: SPIRE.x, z: SPIRE.z, r: 6.2, y0: -5, y1: trunkH - 1, active: true });
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a = Math.PI / 2 + i * 0.36;
      const y = 1 + 1.55 * (i + 1);
      const rest = i % 16 === 15;
      const rad = 9.6 - (y / trunkH) * 2.4;
      const w = rest ? 4.4 : 3.2;
      B(SPIRE.x + Math.cos(a) * rad, y - 0.5, SPIRE.z + Math.sin(a) * rad, w, 0.5, w, rest ? 0xffd23a : 0xc8b89a);
      if (i % 4 === 2) L.coins.push({ x: SPIRE.x + Math.cos(a) * rad, y: y + 1.2, z: SPIRE.z + Math.sin(a) * rad });
      if (rest) checkpoint('Spire Ledge ' + ((i + 1) / 16), SPIRE.x + Math.cos(a) * rad, SPIRE.z + Math.sin(a) * rad, y);
      if (i % 12 === 6 && i > 12) grapple(SPIRE.x + Math.cos(a + 0.5) * 14, y + 7, SPIRE.z + Math.sin(a + 0.5) * 14, 'spire');
    }
    B(SPIRE.x, trunkH - 0.8, SPIRE.z, 10, 0.8, 10, 0xffd23a);
    const crown = makeCrown(); crown.position.set(SPIRE.x, trunkH + 1.6, SPIRE.z); scene.add(crown);
    L.crown = { x: SPIRE.x, y: trunkH + 1.6, z: SPIRE.z, mesh: crown, taken: false };
    chest(SPIRE.x + 3, SPIRE.z + 3, trunkH);
    // Seal barrier
    const barMesh = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 16, 32, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8a5aff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    barMesh.position.set(SPIRE.x, 7, SPIRE.z); scene.add(barMesh);
    const cylB = { x: SPIRE.x, z: SPIRE.z, r: 12.5, y0: -5, y1: 16, active: true };
    cylB.onPush = () => {
      if (G.time - (G._barT ?? -99) < 5) return;
      G._barT = G.time;
      G.hud.toast(`The Spire is sealed. Relics: ${G.player.relics}/8`, 2.5);
      G.sfx.play('deny');
    };
    world.cylinders.push(cylB);
    L.barrier = { mesh: barMesh, cyl: cylB, need: 8 };
    L.animated.push((t) => { barMesh.material.opacity = 0.18 + Math.sin(t * 3) * 0.07; barMesh.rotation.y = t * 0.3; });
    sign(SPIRE.x + 4, SPIRE.z + 16, 'KONG SPIRE — sealed. Bring 8 Relics to break the seal. The Crown waits at the top.');
    checkpoint('Spire Gate', SPIRE.x - 6, SPIRE.z + 17);
  }

  // ================= JUNGLE (west) =================
  checkpoint('Jungle Gate', -70, 12);
  sign(-66, 16, 'JUNGLE — Blue frogs carry strange DNA. Punch three of them...');
  // Grunt camp — Relic 4
  const CX = -110, CZ = -15;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i === 3) continue; // gap facing the path
    const px = CX + Math.cos(a) * 14, pz = CZ + Math.sin(a) * 14;
    B(px, gy(px, pz) - 0.5, pz, 1.2, 3, 1.2, 0x7a5230);
  }
  enemy('grunt', CX + 4, CZ, { tag: 'camp' }); enemy('grunt', CX - 4, CZ + 3, { tag: 'camp' }); enemy('grunt', CX, CZ - 5, { tag: 'camp' });
  const campRelic = relic(4, 'Grunt Camp Bounty', CX, gy(CX, CZ) + 1.5, CZ, true);
  campRelic.unlock = 'camp';
  chest(CX - 16, CZ - 8);

  // Lagoon pillar — Relic 3
  const LX = LAGOON.x, LZ = LAGOON.z;
  B(LX, -6, LZ, 3, 11.5, 3, 0x8a8276);
  relic(3, 'Lagoon Needle', LX, 7, LZ);
  grapple(LX, 11, LZ);
  const pads = [[-128, 42], [-134, 46], [-140, 50], [-146, 49], [-152, 51], [-184, 64], [-178, 72]];
  pads.forEach(([x, z]) => {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 10), mat(0x3aa84a));
    pad.position.set(x, -1.35, z); scene.add(pad);
    world.addBox(new Box(x - 1.2, -1.6, z - 1.2, x + 1.2, -1.2, z + 1.2, { noCam: true }));
  });
  chest(-178, 72, -1.2);
  throwSpawn('tnt', -124, 38); throwSpawn('crate', -122, 44); throwSpawn('crate', -121, 48); throwSpawn('crate', -123, 52);
  sign(-120, 36, 'Lagoon Needle: frogs jump high, crates stack, TNT launches... pick your poison.');
  coinRing(LX, LZ, 20, 16, -0.3);
  for (const [x, z] of [[-128, 72], [-186, 26], [-178, 88]]) L.frogs.push({ x, z });

  // Canopy course — Relic 5
  const KX = -205, KZ = -40;
  const canopy = [];
  for (let i = 0; i < 10; i++) {
    const a = i * 1.1, r = 7;
    canopy.push([KX + Math.cos(a) * r, 2.2 + i * 2.1, KZ + Math.sin(a) * r]);
  }
  const baseY = gy(KX, KZ);
  const bigTrunk = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 30, 10), mat(0x6a4222));
  bigTrunk.position.set(KX, baseY + 15, KZ); bigTrunk.castShadow = true; scene.add(bigTrunk);
  world.cylinders.push({ x: KX, z: KZ, r: 3, y0: baseY - 2, y1: baseY + 30, active: true });
  const crownLeaf = new THREE.Mesh(new THREE.IcosahedronGeometry(9, 1), mat(0x1f7a3a));
  crownLeaf.position.set(KX, baseY + 33, KZ); crownLeaf.scale.y = 0.5; scene.add(crownLeaf);
  canopy.forEach(([x, y, z], i) => {
    B(x, baseY + y - 0.4, z, 3, 0.4, 3, 0x8a5a2a);
    if (i % 2) L.coins.push({ x, y: baseY + y + 1.2, z });
  });
  B(KX, baseY + 23.5, KZ, 7, 0.5, 7, 0x8a5a2a);
  relic(5, 'Canopy Crown', KX, baseY + 25.5, KZ);
  B(KX + 12, baseY + 14, KZ, 2.5, 0.4, 2.5, 0x8a5a2a);
  chest(KX + 12, KZ, baseY + 14.4);
  sign(KX + 10, KZ + 9, 'Canopy Climb. Mind your footing.');

  enemy('spitter', -95, 40); enemy('spitter', -200, 12); enemy('grunt', -180, -85); enemy('roller', -140, 8);
  chest(-236, -8); chest(-238, 90);
  coinTrail(-70, 12, -118, 30, 8);
  coinTrail(-120, 0, -200, -30, 10);

  // Pit into the tunnel
  const [p0x, p0z] = TUNNEL[0];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const x = p0x + Math.cos(a) * 6.5, z = p0z + Math.sin(a) * 6.5;
    if (i % 3 === 0) continue;
    B(x, surfaceH(x, z) - 0.5, z, 1.2, 1.4 + (i % 2), 1.2, 0x8a8276);
  }
  sign(p0x + 7, p0z + 5, 'A deep hole. Wind whistles from below... it smells like old stone.');

  // ================= TUNNEL =================
  const tlen = 118;
  for (let s = 10.5 / tlen; s < 0.97; s += 2.4 / tlen) {
    const [x, z] = tunnelPoint(s);
    const f = tunnelFloor(s);
    let top = -1e9;
    for (const [ox, oz] of [[-4, -4], [4, -4], [-4, 4], [4, 4], [0, 0]]) top = Math.max(top, surfaceH(x + ox, z + oz));
    if (top - f < 5.5) break;
    B(x, top - 1.4, z, 9.6, 1.6, 9.6, 0x6a5a4a, { noShadow: false });
  }
  const torch = (s) => {
    const [x, z] = tunnelPoint(s);
    const f = tunnelFloor(s);
    const t = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffaa3a }));
    t.position.set(x + 2.6, f + 2.8, z); scene.add(t);
  };
  [0.1, 0.25, 0.4, 0.55, 0.7, 0.85].forEach(torch);
  for (const s of [0.18, 0.62]) {
    const [x, z] = tunnelPoint(s);
    const pl = new THREE.PointLight(0xffaa55, 2.5, 40, 1.2); pl.position.set(x, tunnelFloor(s) + 3, z); scene.add(pl);
  }
  {
    const [x, z] = tunnelPoint(0.03);
    checkpoint('Pit Bottom', x, z, H(x, z));
    const [cx, cz] = tunnelPoint(0.08);
    chest(cx + 2, cz, H(cx + 2, cz));
  }
  // Breakable slab over the secret pit — Relic 6
  {
    const f = tunnelFloor(SECRET_PIT.s);
    const slab = B(SECRET_PIT.x, f - 0.5, SECRET_PIT.z, 5.6, 0.55, 5.6, 0xa89a7a, { breakable: true, mat: {} });
    slab.box.slam = true;
    slab.mesh.material = new THREE.MeshLambertMaterial({ color: 0xa89a7a, flatShading: true, emissive: 0x2a1a0a });
    L.breakables.push(slab);
    relic(6, 'Cracked Floor Cache', SECRET_PIT.x, f - 1.2, SECRET_PIT.z);
    const [tx, tz] = tunnelPoint(SECRET_PIT.s - 0.06);
    throwSpawn('tnt', tx, tz, H(tx, tz) + 0.1);
    sign(tx + 2, tz + 1, 'The floor ahead is cracked. Something heavy from above might break it... (attack in mid-air to ground-pound)');
  }
  for (const s of [0.3, 0.7]) { const [x, z] = tunnelPoint(s); enemy('grunt', x, z, { y: H(x, z) }); }
  for (let s = 0.12; s < 0.9; s += 0.06) { const [x, z] = tunnelPoint(s); L.coins.push({ x, y: H(x, z) + 1.2, z }); }
  { const [x, z] = tunnelPoint(0.78); chest(x - 1.5, z + 1.5, H(x - 1.5, z + 1.5)); }

  // ================= RUINS PLATEAU (north) =================
  const [ex, ez] = TUNNEL[TUNNEL.length - 1];
  checkpoint('Ruins Rise', ex + 6, ez - 4);
  B(ex + 2, PLATEAU_Y, ez - 10, 3, 1.2, 2, 0xd8c8a0);
  L.blueprint = { x: ex + 2, y: PLATEAU_Y + 2.6, z: ez - 10, taken: false };
  sign(ex + 8, ez - 2, 'ANCIENT RUINS — a blueprint for a Grapple Hook sits on the altar ahead.');

  // Columns / scenery
  for (let i = 0; i < 30; i++) {
    const x = -140 + rng() * 280, z = -130 - rng() * 120;
    if (Math.hypot(x - 40, z + 190) < 20 || Math.hypot(x + 40, z + 200) < 16 || Math.hypot(x - 95, z + 160) < 12) continue;
    if (tunnelInfo(x, z).d < 7) continue;
    const hh = 2 + rng() * 6;
    B(x, gy(x, z) - 0.5, z, 1.6, hh, 1.6, 0xd8c8a0);
    if (rng() < 0.3) B(x + 1, gy(x, z) - 0.3, z + 1.5, 1.8, 0.8, 1.2, 0xc8b890);
  }

  // Temple — Relic 7 (grapple or frog)
  const TPX = 40, TPZ = -190;
  for (let k = 0; k < 4; k++) {
    const w = 26 - k * 6;
    B(TPX, k === 0 ? PLATEAU_Y - 1 : PLATEAU_Y + k * 4, TPZ, w, k === 0 ? 5 : 4, w, k % 2 ? 0xd8c8a0 : 0xc8b48a);
    const topY = PLATEAU_Y + 4 + k * 4;
    grapple(TPX, topY + 3, TPZ + w / 2 + 1);
  }
  relic(7, 'Sun Temple Apex', TPX, PLATEAU_Y + 17.6, TPZ);
  chest(TPX + 16, TPZ - 14);
  sign(TPX, TPZ + 19, 'SUN TEMPLE. Walls too high to climb. A hook might catch those rings...');

  // Pressure-plate vault — Relic 8
  const VX = -40, VZ = -205;
  B(VX - 5, PLATEAU_Y - 0.5, VZ, 1, 6.5, 10, 0xb8a888);
  B(VX + 5, PLATEAU_Y - 0.5, VZ, 1, 6.5, 10, 0xb8a888);
  B(VX, PLATEAU_Y - 0.5, VZ - 5, 11, 6.5, 1, 0xb8a888);
  const gate = B(VX, PLATEAU_Y - 0.5, VZ + 5, 9, 6.5, 1, 0x6a5a8a, { dynamic: true });
  L.gate = { ...gate, open: false, y0: PLATEAU_Y - 0.5 };
  relic(8, 'Vault of Weights', VX, PLATEAU_Y + 1.5, VZ);
  chest(VX + 2.5, VZ - 2.5, PLATEAU_Y);
  for (const px of [VX - 8, VX + 8]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 2.6), mat(0xd84a3a));
    const py = gy(px, VZ + 13);
    plate.position.set(px, py + 0.12, VZ + 13); scene.add(plate);
    L.plates.push({ x: px, z: VZ + 13, y: py, mesh: plate, pressed: false });
  }
  throwSpawn('crate', VX - 2, VZ + 20); throwSpawn('crate', VX + 2, VZ + 22); throwSpawn('crate', VX, VZ + 25);
  sign(VX + 4, VZ + 18, 'VAULT: Two plates must be weighed down at once.');

  // Spitter nest — Relic 9
  const NX = 95, NZ = -160;
  for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    B(NX + dx, PLATEAU_Y - 0.5, NZ + dz, 2.4, 4.5, 2.4, 0xd8c8a0);
    B(NX + dx * 1.45, PLATEAU_Y - 0.5, NZ + dz * 1.45, 1.8, 2.5, 1.8, 0xc8b890);
    enemy('spitter', NX + dx, NZ + dz, { tag: 'nest', y: PLATEAU_Y + 4 });
  }
  const nestRelic = relic(9, 'Spitter Nest Prize', NX, PLATEAU_Y + 1.6, NZ, true);
  nestRelic.unlock = 'nest';
  chest(NX + 9, NZ - 9, PLATEAU_Y + 4);
  B(NX + 9, PLATEAU_Y - 0.5, NZ - 9, 2.4, 4.5, 2.4, 0xd8c8a0);

  enemy('roller', 0, -150); enemy('roller', -20, -235); enemy('grunt', 60, -225); enemy('grunt', -95, -205);
  chest(-130, -245); chest(130, -240);
  coinTrail(ex, ez - 10, TPX - 12, TPZ + 16, 12);
  coinTrail(TPX + 12, TPZ + 14, NX - 8, NZ + 8, 8);

  // Cliff shortcut from the hub side (frog / double-jump / grapple)
  B(62, 0, -108.5, 5, 7, 4, 0xa89a7a);
  B(66, 0, -111.5, 4, 12, 3, 0xa89a7a);
  chest(66, -111.5, 12);
  grapple(58, 21, -117); grapple(-40, 21, -117);
  sign(60, -98, 'Ledges up the cliff. A strong leap might reach them.');

  // ================= VOLCANO (east) =================
  checkpoint('Ashen Gate', 112, 20);
  sign(114, 26, 'THE CALDERA — lava bites. Hop the stones to the island. A chieftain waits.');
  // Stepping stones to arena
  const stones = [[130, 20], [134, 23], [138, 19], [142, 22], [146, 18], [150, 21], [154, 18], [158, 21], [162, 19], [166, 21]];
  stones.forEach(([x, z]) => B(x, -2, z, 2.6, 4.3, 2.6, 0x4a3a3a));
  grapple(148, 10, 20);
  // Lava gauntlet north — Relic 10
  const gaunt = [[190, -3], [192, -8], [188, -13], [191, -18], [187, -23], [190, -28], [194, -33]];
  gaunt.forEach(([x, z], i) => B(x, -2, z, i === gaunt.length - 1 ? 2 : 2.3, 4.2 + i * 0.35, i === gaunt.length - 1 ? 2 : 2.3, 0x4a3a3a));
  B(190, -2, -40, 4, 7.5, 4, 0x5a4a4a);
  relic(10, 'Lava Gauntlet', 190, 7.7, -40);
  grapple(191, 13, -22);
  const arenaY = 3;
  checkpoint('Arena Edge', 172, 20, arenaY);
  L.arena = { x: VOLCANO.x, z: VOLCANO.z, r: 20, y: arenaY };
  const bossRelic = relic(11, "Chieftain's Crown Jewel", VOLCANO.x, arenaY + 1.6, VOLCANO.z, true);
  bossRelic.unlock = 'boss';
  enemy('boss', VOLCANO.x + 4, VOLCANO.z);
  chest(VOLCANO.x, VOLCANO.z + 17, arenaY);
  chest(VOLCANO.x - 2, VOLCANO.z - 64 + 0.5);
  enemy('spitter', 140, -28); enemy('spitter', 140, 68); enemy('roller', 190, -45);
  enemy('roller', 72, 12); enemy('roller', 95, 30); enemy('grunt', 88, -6);
  coinTrail(60, 20, 110, 20, 8);
  stones.forEach(([x, z], i) => { if (i % 2 === 0) L.coins.push({ x, y: 3.5, z }); });
  // rim secret
  grapple(VOLCANO.x - 60, 24, VOLCANO.z + 40);
  chest(VOLCANO.x - 48, VOLCANO.z + 58);

  // ================= OCEAN ISLET — Relic 12 =================
  relic(12, 'Castaway Islet', ISLET.x, H(ISLET.x, ISLET.z) + 1.6, ISLET.z);
  chest(ISLET.x + 3, ISLET.z + 2);
  B(ISLET.x - 3, H(ISLET.x - 3, ISLET.z) - 0.5, ISLET.z, 0.4, 5, 0.4, 0x7a5230);

  // Merge all static boxes into one vertex-coloured mesh (hundreds of draw calls -> 1)
  const geos = [];
  const col = new THREE.Color();
  for (const { m, color } of staticMeshes) {
    m.updateMatrix();
    const gg = boxGeo.clone().applyMatrix4(m.matrix).toNonIndexed();
    col.set(color);
    const cols = new Float32Array(gg.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r; cols[i + 1] = col.g; cols[i + 2] = col.b; }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    gg.deleteAttribute('uv');
    geos.push(gg);
    scene.remove(m);
  }
  const merged = mergeGeometries(geos);
  const mm = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  mm.castShadow = true; mm.receiveShadow = true;
  scene.add(mm);

  return L;
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
