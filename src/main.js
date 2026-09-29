import * as THREE from 'three';
import { World } from './physics.js';
import { Input } from './input.js';
import { Sfx, Particles } from './fx.js';
import { Hud } from './hud.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Throwable, Grunt, Spitter, Roller, CritterFrog, Boss, Projectile } from './entities.js';
import { makeBlueprint, makeDNA, mat } from './models.js';
import { SPIRE, VOLCANO, tunnelInfo, surfaceH, OCEAN_R, H } from './terrain.js';

window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));

const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const params = new URLSearchParams(location.search);
let qualityHigh = params.get('q') ? params.get('q') !== 'low' : !mobile;
const quality = {
  terrainSeg: mobile ? 300 : 420,
  trees: mobile ? 420 : 850,
};

// ---------------- Renderer ----------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, qualityHigh ? 2 : 1));
  sun.castShadow = qualityHigh || !mobile;
  document.getElementById('qualityBtn').textContent = 'Quality: ' + (qualityHigh ? 'High' : 'Low');
}
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe9ff, 140, 720);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 3000);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 75 : 62;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x5a4a3a, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
applyQuality();
resize();

// ---------------- Game context ----------------
const G = {
  scene, camera, world: new World(), sfx: new Sfx(), hud: new Hud(),
  enemies: [], throwables: [], projectiles: [], checkpoint: null, won: false, time: 0,
  shakeAmt: 0,
};
window.G = G; G.renderer = renderer;
G.fx = new Particles(scene);
const input = new Input(canvas);

buildWorld(G, quality);
const L = G.level;
G.player = new Player(G);
const player = G.player;
G.checkpoint = L.checkpoints[0];
L.checkpoints[0].active = true;

// entities
for (const s of L.throwSpawns) G.throwables.push(new Throwable(G, s));
const ENEMY = { grunt: Grunt, spitter: Spitter, roller: Roller, boss: Boss };
G.spawnEnemy = (type, x, z, extra = {}) => {
  const e = new ENEMY[type](G, { type, x, z, ...extra });
  e.render(0); G.enemies.push(e); return e;
};
for (const e of L.enemies) G.spawnEnemy(e.type, e.x, e.z, e);
for (const f of L.frogs) { const fr = new CritterFrog(G, f); fr.isFrog = true; fr.render(0); G.enemies.push(fr); }
for (let i = 0; i < 24; i++) G.projectiles.push(new Projectile(G));
G.spawnProjectile = (x, y, z, vx, vy, vz) => {
  const p = G.projectiles.find((q) => !q.alive); if (p) p.fire(x, y, z, vx, vy, vz);
};

// coins (instanced)
const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14); coinGeo.rotateX(Math.PI / 2);
const coinIM = new THREE.InstancedMesh(coinGeo, mat(0xffc81a, { emissive: 0x6a4a00 }), L.coins.length);
coinIM.castShadow = true; scene.add(coinIM);
L.coins.forEach((c) => { c.taken = false; c.phase = Math.random() * 6; });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);

// blueprint
const bp = makeBlueprint(); bp.position.set(L.blueprint.x, L.blueprint.y, L.blueprint.z); scene.add(bp);
L.blueprint.mesh = bp;
const dnaDrops = [];

// ---------------- Game actions ----------------
G.shake = (a) => { G.shakeAmt = Math.max(G.shakeAmt, a); };

G.hitArea = (x, y, z, rad, dmg, kind, hitSet) => {
  let hit = false;
  for (const e of G.enemies) {
    if (!e.alive || hitSet.has(e)) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < rad + e.r && y > e.y - 1 && y < e.y + e.h + 1) {
      hitSet.add(e);
      if (e.damage(dmg, player.x, player.z, kind)) hit = true;
    }
  }
  for (const t of G.throwables) {
    if (!t.alive || t.state === 'carried' || hitSet.has(t)) continue;
    const d = Math.hypot(t.x - x, t.z - z);
    if (d < rad + 0.7 && y > t.y - 1.2 && y < t.y + 2.6) {
      hitSet.add(t);
      if (t.type === 'tnt') { kind === 'slam' ? t.explode() : t.ignite(); }
      else {
        const dx = t.x - player.x, dz = t.z - player.z, dl = Math.hypot(dx, dz) || 1;
        t.vx = dx / dl * 11; t.vz = dz / dl * 11; t.vy = 4;
        G.sfx.play('punch');
      }
      hit = true;
    }
  }
  if (kind === 'slam') {
    for (const b of L.breakables) {
      if (!b.box.active) continue;
      const cx = (b.box.min.x + b.box.max.x) / 2, cz = (b.box.min.z + b.box.max.z) / 2;
      if (Math.hypot(cx - x, cz - z) < rad + 2.5 && Math.abs(b.box.max.y - (y - 0.5)) < 1.2) { G.breakBox(b.box); hit = true; }
    }
  }
  if (hit) G.shake(0.15);
  return hit;
};

G.breakBox = (box) => {
  if (!box.active) return;
  box.active = false; box.mesh.visible = false;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  G.fx.burst(cx, box.max.y, cz, 0xa89a7a, 40, 10, 0.5, 1.2);
  G.sfx.play('break'); G.shake(0.4);
  G.hud.toast('The cracked floor gives way!', 2);
};

G.explode = (x, y, z) => {
  G.fx.burst(x, y, z, 0xff8a2a, 40, 14, 0.6, 0.8);
  G.fx.burst(x, y, z, 0x444444, 20, 8, 0.8, 1.2, 4);
  G.sfx.play('boom');
  const pd = Math.hypot(player.x - x, player.y + 1 - y, player.z - z);
  G.shake(Math.max(0.2, 1 - pd / 30));
  for (const e of G.enemies) {
    if (e.alive && Math.hypot(e.x - x, e.y + 1 - y, e.z - z) < 6.5 + e.r) e.damage(3, x, z, 'boom');
  }
  for (const t of G.throwables) {
    if (!t.alive || t.state === 'carried') continue;
    const d = Math.hypot(t.x - x, t.y - y, t.z - z);
    if (d < 5.5 && d > 0.1) {
      if (t.type === 'tnt') { if (t.fuse <= 0) t.fuse = 0.25; }
      else { t.vx += (t.x - x) / d * 8; t.vz += (t.z - z) / d * 8; t.vy = 8; }
    }
  }
  for (const b of L.breakables) {
    if (!b.box.active) continue;
    const cx = (b.box.min.x + b.box.max.x) / 2, cz = (b.box.min.z + b.box.max.z) / 2;
    if (Math.hypot(cx - x, b.box.max.y - y, cz - z) < 6.5) G.breakBox(b.box);
  }
  // TNT launch — cartoon physics, no damage
  if (pd < 6.5 && !player.dead) {
    const k = 1 - Math.max(0, pd - 2.5) / 4;
    player.vy = Math.max(player.vy, 17 + 9 * k);
    const hx = player.x - x, hz = player.z - z, hl = Math.hypot(hx, hz) || 1;
    player.vx += hx / hl * 5 * k; player.vz += hz / hl * 5 * k;
    player.grounded = false; player.wasGrounded = false; player.slamming = false; player.grapple = null;
    player.rope.visible = false;
    if (!G._launchTip) { G._launchTip = true; G.hud.toast('KA-BOOM! TNT launches you sky-high.', 2); }
  }
};

G.magnet = (x, y, z, r) => {
  for (const c of L.coins) {
    if (!c.taken && Math.abs(c.x - x) < r && Math.abs(c.z - z) < r && Math.abs(c.y - y) < r + 1) {
      c.x += (player.x - c.x) * 0.5; c.z += (player.z - c.z) * 0.5; c.y += (player.y + 1 - c.y) * 0.5;
    }
  }
};

G.dropCarried = (fall) => {
  const t = player.carrying; if (!t) return;
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  let x = player.x + fx * 1.8, z = player.z + fz * 1.8;
  if (fall) { x = player.x; z = player.z; }
  const g = G.world.groundAt(x, z, player.y + 2.8, 0.7, t.box).g;
  if (!fall) {
    // refuse if something solid occupies the spot
    for (const b of G.world.boxes) {
      if (!b.active || b === t.box) continue;
      if (x + 0.65 > b.min.x && x - 0.65 < b.max.x && z + 0.65 > b.min.z && z - 0.65 < b.max.z &&
          b.max.y > g + 0.05 && b.min.y < g + 1.4) {
        G.hud.toast('No room to put that down there.', 1.2); G.sfx.play('deny'); return;
      }
    }
  }
  player.carrying = null;
  t.drop(x, g + 0.02, z);
  if (t.type === 'tnt' && fall) t.ignite();
};
G.throwCarried = () => {
  const t = player.carrying; if (!t) return;
  player.carrying = null;
  t.throw(Math.sin(player.yaw), Math.cos(player.yaw), player.x, player.y + 1.2, player.z);
  G.sfx.play('jump');
};

G.onEnemyDeath = (e) => {
  if (e.tag) {
    const rest = G.enemies.filter((o) => o.tag === e.tag && o.alive).length;
    if (rest === 0) revealRelic(e.tag);
    else G.hud.toast(`${rest} left...`, 1.2);
  }
  if (e instanceof Boss) revealRelic('boss');
};
function revealRelic(tag) {
  const r = L.relics.find((q) => q.unlock === tag);
  if (!r || r.taken) return;
  r.hidden = false; r.mesh.visible = true;
  G.fx.burst(r.x, r.y, r.z, 0xffd23a, 40, 9, 0.4, 1.2);
  G.sfx.play('secret');
  G.hud.toast('A Relic appears!', 2);
}
G.onFrogAbsorbed = (f) => {
  const d = makeDNA(); d.position.set(f.x, f.y + 1.2, f.z); scene.add(d);
  dnaDrops.push({ x: f.x, y: f.y + 1.2, z: f.z, mesh: d, taken: false, t: 0 });
};

// ---------------- Pickups & triggers ----------------
function collect(dt) {
  const px = player.x, py = player.y + 0.9, pz = player.z;
  const near = (o, r) => Math.abs(o.x - px) < r && Math.abs(o.z - pz) < r && Math.abs(o.y - py) < r + 0.6 && Math.hypot(o.x - px, o.y - py, o.z - pz) < r + 0.4;
  if (player.dead) return;
  const t = G.time;
  // coins
  for (let i = 0; i < L.coins.length; i++) {
    const c = L.coins[i];
    if (c.taken) { _m.makeScale(0, 0, 0); coinIM.setMatrixAt(i, _m); continue; }
    if (near(c, 1.3)) {
      c.taken = true; player.addCoins(1); G.sfx.play('coin');
      G.fx.burst(c.x, c.y, c.z, 0xffd23a, 5, 4, 0.15, 0.4);
    }
    _q.setFromAxisAngle(_up, t * 3 + c.phase);
    _m.compose(_v.set(c.x, c.y + Math.sin(t * 2 + c.phase) * 0.15, c.z), _q, _s);
    coinIM.setMatrixAt(i, _m);
  }
  coinIM.instanceMatrix.needsUpdate = true;
  // relics
  for (const r of L.relics) {
    if (r.taken || r.hidden) continue;
    r.mesh.rotation.y = t * 1.5; r.mesh.position.y = r.y + Math.sin(t * 2) * 0.25;
    r.mesh.userData.ring.rotation.x = t * 2;
    if (near(r, 1.8)) {
      r.taken = true; r.mesh.visible = false; player.relics++;
      G.sfx.play('relic'); G.fx.burst(r.x, r.y, r.z, 0xffd23a, 40, 10, 0.4, 1.2);
      G.hud.toast(`🏺 RELIC: <b>${r.name}</b> (${player.relics}/12)`, 3);
      G.hud.pop('relics');
      player.hp = player.maxHp;
      checkBarrier();
    }
  }
  // blueprint
  const b = L.blueprint;
  if (!b.taken) {
    bp.rotation.y = t * 1.2; bp.position.y = b.y + Math.sin(t * 2) * 0.2;
    if (near(b, 1.8)) {
      b.taken = true; bp.visible = false; player.has.grapple = true;
      G.sfx.play('big'); G.fx.burst(b.x, b.y, b.z, 0x3ad8ff, 40, 10, 0.4, 1.2);
      G.hud.toast('🪝 GRAPPLE HOOK! Aim at a blue ring and press <b>X / Right-click / 🪝</b>.', 5);
    }
  }
  // dna
  for (const d of dnaDrops) {
    if (d.taken) continue;
    d.t += dt; d.mesh.rotation.y = t * 3;
    d.mesh.position.set(d.x, d.y + Math.sin(t * 3) * 0.2, d.z);
    if (near(d, 1.8) || d.t > 3) {
      d.taken = true; scene.remove(d.mesh); player.dna++;
      G.sfx.play(player.dna >= 3 ? 'big' : 'relic'); G.hud.pop('dna');
      if (player.dna >= 3) G.hud.toast('🐸 FROG FORM UNLOCKED! Press <b>Q / 🐸</b> to transform. Frogs jump HUGE and have a long tongue.', 5);
      else G.hud.toast(`🧬 Frog DNA absorbed (${player.dna}/3)`, 2);
    }
  }
  // chests
  for (const c of L.chests) {
    if (c.opened) continue;
    if (near(c, 1.9)) {
      c.opened = true; player.secrets++; player.addCoins(10);
      c.mesh.userData.lid.rotation.x = -1.9;
      G.sfx.play('secret'); G.fx.burst(c.x, c.y + 1, c.z, 0xffd23a, 30, 8, 0.25, 1);
      G.hud.toast(`🗝️ SECRET FOUND! +10 coins (${player.secrets}/${L.chests.length})`, 2.5);
      G.hud.pop('secrets');
    }
  }
  // checkpoints
  for (const cp of L.checkpoints) {
    if (Math.hypot(cp.x - px, cp.z - pz) < 2.6 && Math.abs(cp.y - player.y) < 3) {
      if (G.checkpoint !== cp) {
        if (G.checkpoint) { G.checkpoint.active = false; G.checkpoint.mesh.userData.flag.material = mat(0x888888); }
        G.checkpoint = cp; cp.active = true;
        cp.mesh.userData.flag.material = mat(0xffd23a, { emissive: 0x5a4a00 });
        G.sfx.play('check'); G.hud.toast(`Checkpoint: ${cp.name}`, 1.6);
        player.hp = player.maxHp;
      }
    }
    cp.mesh.userData.flag.rotation.y = Math.sin(t * 3 + cp.x) * 0.2;
  }
  // crown
  const cr = L.crown;
  if (!cr.taken) {
    cr.mesh.rotation.y = t;
    if (near(cr, 2.4)) { cr.taken = true; cr.mesh.visible = false; win(); }
  }
  // plates
  if (L.gate && !L.gate.open) {
    let all = true;
    for (const p of L.plates) {
      let pressed = Math.abs(player.x - p.x) < 1.6 && Math.abs(player.z - p.z) < 1.6 && Math.abs(player.y - p.y) < 1;
      for (const th of G.throwables) {
        if (th.alive && th.state !== 'carried' && Math.abs(th.x - p.x) < 1.8 && Math.abs(th.z - p.z) < 1.8 && Math.abs(th.y - p.y) < 1.2) pressed = true;
      }
      for (const e of G.enemies) if (e.alive && Math.abs(e.x - p.x) < 1.6 && Math.abs(e.z - p.z) < 1.6) pressed = true;
      if (pressed !== p.pressed) { p.pressed = pressed; if (pressed) G.sfx.play('check'); }
      p.mesh.position.y = p.y + (pressed ? 0.02 : 0.12);
      p.mesh.material = mat(pressed ? 0x3ad84a : 0xd84a3a);
      all = all && pressed;
    }
    if (all) {
      L.gate.open = true; L.gate.box.active = false;
      G.sfx.play('secret'); G.hud.toast('The vault gate grinds open!', 2.5); G.shake(0.4);
    }
  }
  if (L.gate && L.gate.open && L.gate.mesh.position.y > L.gate.y0 - 3.5) L.gate.mesh.position.y -= dt * 3;
}

function checkBarrier() {
  const bar = L.barrier;
  if (bar.cyl.active && player.relics >= bar.need) {
    bar.cyl.active = false; bar.mesh.visible = false;
    G.sfx.play('big'); G.shake(0.8);
    G.fx.burst(SPIRE.x, 6, SPIRE.z, 0x8a5aff, 80, 16, 0.6, 1.5);
    G.hud.toast('✨ The Kong Spire\'s seal SHATTERS! Climb to the Crown!', 5);
  }
}

function win() {
  G.won = true;
  G.sfx.play('big');
  G.fx.burst(SPIRE.x, 102, SPIRE.z, 0xffd23a, 120, 20, 0.6, 2);
  const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
  document.getElementById('winStats').innerHTML =
    `<p>Time: <b>${mins}:${String(secs).padStart(2, '0')}</b><br/>Relics: <b>${player.relics}/12</b> · Secrets: <b>${player.secrets}/${L.chests.length}</b> · Coins: <b>${player.coins}</b></p>`;
  setTimeout(() => { showOverlay('win'); }, 1200);
}

// ---------------- Interact ----------------
function interactables() {
  if (player.dead || player.grapple) return null;
  if (player.carrying) return { text: '[E] Drop  ·  [Attack] Throw', act: () => G.dropCarried() };
  if (player.form === 'hero') {
    let best = null, bd = 2.4;
    for (const t of G.throwables) {
      if (!t.alive || t.state === 'thrown') continue;
      const d = Math.hypot(t.x - player.x, t.z - player.z);
      if (d < bd && Math.abs(t.y - player.y) < 1.5) { bd = d; best = t; }
    }
    if (best) return {
      text: best.type === 'tnt' ? '[E] Lift TNT (punch it to light the fuse!)' : '[E] Lift crate',
      act: () => {
        // don't lift a crate that has something stacked on it
        best.pickUp(); player.carrying = best; G.sfx.play('grapple');
        for (const o of G.throwables) if (o !== best && o.state === 'rest') o.grounded = false;
      },
    };
  }
  const s = L.shop;
  if (Math.hypot(s.x - player.x, s.z - player.z) < 3.8) return { text: '[E] Shop', act: openShop };
  for (const sg of L.signs) {
    if (Math.hypot(sg.x - player.x, sg.z - player.z) < 2.8 && Math.abs(sg.y - player.y) < 3) return { text: '[E] Read sign', act: () => G.hud.toast(sg.text, 5) };
  }
  return null;
}

// ---------------- Overlays ----------------
let paused = true;
let started = false;
const overlays = ['title', 'pause', 'shop', 'win'];
function showOverlay(id) {
  for (const o of overlays) document.getElementById(o).classList.toggle('hidden', o !== id);
  paused = !!id;
  if (id && document.pointerLockElement) document.exitPointerLock();
  if (id === 'pause') {
    document.getElementById('pauseStats').innerHTML =
      `<p>Relics ${player.relics}/12 · Secrets ${player.secrets}/${L.chests.length} · Coins ${player.coins} · DNA ${player.dna}/3</p>` +
      `<p style="font-size:14px;opacity:.8">Relics break the Spire seal at 8. Checkpoint: ${G.checkpoint.name}</p>`;
  }
}
function openShop() { refreshShop(); showOverlay('shop'); }
function refreshShop() {
  const dj = document.getElementById('buyDJ'), ht = document.getElementById('buyHeart');
  dj.disabled = player.has.djump || player.coins < 60; dj.textContent = player.has.djump ? 'Owned' : '60 🪙';
  ht.disabled = player.maxHp >= 8 || player.coins < 40; ht.textContent = player.maxHp >= 8 ? 'Maxed' : '40 🪙';
}
const resume = () => { showOverlay(null); if (!input.usedTouch && !mobile) canvas.requestPointerLock?.(); };
document.getElementById('startBtn').onclick = () => { started = true; G.sfx.unlock(); resume(); intro(); };
document.getElementById('resumeBtn').onclick = resume;
document.getElementById('shopClose').onclick = resume;
document.getElementById('winClose').onclick = resume;
document.getElementById('restartBtn').onclick = () => location.reload();
document.getElementById('qualityBtn').onclick = () => { qualityHigh = !qualityHigh; applyQuality(); };
document.getElementById('muteBtn').onclick = (e) => { G.sfx.muted = !G.sfx.muted; e.target.textContent = 'Sound: ' + (G.sfx.muted ? 'Off' : 'On'); };
document.getElementById('buyDJ').onclick = () => {
  if (player.coins >= 60 && !player.has.djump) { player.coins -= 60; player.has.djump = true; G.sfx.play('buy'); G.hud.toast('DOUBLE JUMP! Press jump again in mid-air.', 3); }
  else G.sfx.play('deny');
  refreshShop();
};
document.getElementById('buyHeart').onclick = () => {
  if (player.coins >= 40 && player.maxHp < 8) { player.coins -= 40; player.maxHp++; player.hp = player.maxHp; G.sfx.play('buy'); }
  else G.sfx.play('deny');
  refreshShop();
};
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started && !paused && !input.usedTouch) showOverlay('pause');
});

function intro() {
  if (G._intro) return; G._intro = true;
  G.hud.zone('KONG VILLAGE');
  setTimeout(() => G.hud.toast(input.usedTouch || mobile
    ? 'Left thumb moves, drag right side to look. Grab the coins and climb the watchtower!'
    : 'WASD to move, Space to jump, mouse to look. Grab the coins and climb the watchtower!', 5), 1500);
}

// ---------------- Camera ----------------
const cam = { yaw: 0, pitch: 0.32, dist: 10, tx: player.x, ty: player.y + 1.6, tz: player.z, curDist: 10 };
function updateCamera(dt) {
  const look = input.consumeLook();
  cam.yaw -= look.x * 0.0028;
  cam.pitch = Math.max(-0.2, Math.min(1.25, cam.pitch + look.y * 0.0024));
  const moving = Math.hypot(input.move.x, input.move.y) > 0.2;
  if ((input.usedTouch || !input.mouseLocked) && !input.cameraDragging && moving && !player.grapple) {
    const behind = player.yaw + Math.PI;
    const diff = Math.atan2(Math.sin(behind - cam.yaw), Math.cos(behind - cam.yaw));
    cam.yaw += diff * Math.min(1, dt * 1.4 * Math.abs(input.move.x));
  }
  const k = Math.min(1, dt * 10);
  cam.tx += (player.x - cam.tx) * k;
  cam.tz += (player.z - cam.tz) * k;
  cam.ty += (player.y + (player.form === 'frog' ? 1.2 : 1.7) - cam.ty) * Math.min(1, dt * 6);
  const want = player.form === 'frog' ? 8.5 : 10;
  const cx = cam.tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * want;
  const cy = cam.ty + Math.sin(cam.pitch) * want;
  const cz = cam.tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * want;
  const free = G.world.rayFree(cam.tx, cam.ty, cam.tz, cx, cy, cz);
  const target = Math.max(1.2, want * free - 0.4);
  cam.curDist = target < cam.curDist ? target : cam.curDist + (target - cam.curDist) * Math.min(1, dt * 3);
  const d = cam.curDist;
  camera.position.set(
    cam.tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * d,
    cam.ty + Math.sin(cam.pitch) * d,
    cam.tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * d,
  );
  if (G.shakeAmt > 0) {
    const s = G.shakeAmt * 0.5;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
    G.shakeAmt = Math.max(0, G.shakeAmt - dt * 2.5);
  }
  const floor = H(camera.position.x, camera.position.z) + 0.6;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  sun.position.set(player.x + 50, player.y + 80, player.z + 30);
  sun.target.position.set(player.x, player.y, player.z);
  G.sky.position.copy(camera.position);
}

// ---------------- Grapple targeting ----------------
const _fwd = new THREE.Vector3(), _to = new THREE.Vector3(), _proj = new THREE.Vector3();
function updateGrappleTarget() {
  G.grappleTarget = null; G.grappleTargetAny = null;
  camera.getWorldDirection(_fwd);
  const cands = [];
  for (const gp of L.grapples) {
    if (gp.requires === 'spire' && L.barrier.cyl.active) { gp.mesh.visible = false; continue; }
    const dx = gp.x - player.x, dy = gp.y - (player.y + 1), dz = gp.z - player.z;
    const d = Math.hypot(dx, dy, dz);
    gp.mesh.visible = d < 200;
    gp.mesh.userData.ring.rotation.y = G.time * 2;
    if (d > 36 || d < 2.5 || dy < -3) continue;
    if (gp === player.lastGrapple && d < 7) continue;
    _to.set(gp.x - camera.position.x, gp.y - camera.position.y, gp.z - camera.position.z).normalize();
    const dot = _to.dot(_fwd);
    if (dot < 0.72) continue;
    cands.push({ gp, score: dot * 2 - d / 36 + Math.max(0, dy) * 0.03 });
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 3)) {
    const gp = c.gp;
    const free = G.world.rayFree(player.x, player.y + 1.5, player.z, gp.x, gp.y, gp.z);
    if (free > 0.9) { G.grappleTargetAny = gp; break; }
  }
  if (player.has.grapple && G.grappleTargetAny && !player.grapple) G.grappleTarget = G.grappleTargetAny;
  if (G.grappleTarget) {
    _proj.set(G.grappleTarget.x, G.grappleTarget.y, G.grappleTarget.z).project(camera);
    G.hud.reticle((_proj.x + 1) / 2 * innerWidth, (1 - _proj.y) / 2 * innerHeight, true);
  } else G.hud.reticle(0, 0, false);
}

// ---------------- Zones ----------------
function zoneName() {
  const { x, y, z } = player;
  const ti = tunnelInfo(x, z);
  if (ti.d < 5 && y < surfaceH(x, z) - 2) return 'OLD STONE TUNNEL';
  if (Math.hypot(x - SPIRE.x, z - SPIRE.z) < 18) return 'KONG SPIRE';
  if (z < -114) return 'ANCIENT RUINS';
  if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 88) return 'THE CALDERA';
  if (x < -58) return 'DEEP JUNGLE';
  if (Math.hypot(x, z) > OCEAN_R - 20) return 'SHORELINE';
  return 'KONG VILLAGE';
}
let zoneCur = 'KONG VILLAGE', zoneCand = zoneCur, zoneT = 0;

// ---------------- Loop ----------------
let last = performance.now();
let fpsAcc = 0, fpsN = 0; G.fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.max(0, (now - last) / 1000); last = now;
  const dt = Math.min(0.05, raw);
  fpsAcc += raw; fpsN++;
  if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  step(dt);
  renderer.render(scene, camera);
}
function step(dt) {
  input.poll();
  if (input.pressed.pause && started) {
    if (paused && !document.getElementById('pause').classList.contains('hidden')) resume();
    else if (!paused) showOverlay('pause');
  }
  if (paused) { updateCamera(0); return; }
  G.time += dt;
  const sub = dt > 1 / 45 ? 2 : 1;
  const h = dt / sub;
  for (let i = 0; i < sub; i++) {
    const inp = i === 0 ? input : { ...input, pressed: {} };
    player.update(h, inp, cam.yaw);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (!(e instanceof Boss) && Math.abs(e.x - player.x) + Math.abs(e.z - player.z) > 140) { e.mesh.visible = false; continue; }
      e.update(h);
    }
    for (const t of G.throwables) {
      if (t.state === 'carried' || Math.abs(t.x - player.x) + Math.abs(t.z - player.z) < 120 || t.fuse > 0 || !t.alive) t.update(h);
    }
    for (const p of G.projectiles) p.update(h);
  }
  // distance culling for small props (fog hides them anyway)
  if ((G._cullTick = (G._cullTick || 0) + 1) % 10 === 0) {
    const R = 190 * 190;
    for (const m of L.cull) { const dx = m.position.x - player.x, dz = m.position.z - player.z; m.visible = dx * dx + dz * dz < R; }
    for (const r of L.relics) { const dx = r.x - player.x, dz = r.z - player.z; r.mesh.visible = !r.taken && !r.hidden && dx * dx + dz * dz < R * 1.6; }
    for (const t of G.throwables) { const dx = t.x - player.x, dz = t.z - player.z; t.mesh.visible = t.alive && dx * dx + dz * dz < R; }
  }
  // Interact
  const it = interactables();
  G.hud.prompt(it ? it.text.replace('[E]', input.usedTouch ? '[USE]' : '[E]') : '');
  if (input.pressed.interact && it) it.act();
  collect(dt);
  for (const a of L.animated) a(G.time);
  G.fx.update(dt);
  updateCamera(dt);
  updateGrappleTarget();
  // zones
  const zn = zoneName();
  if (zn !== zoneCand) { zoneCand = zn; zoneT = 0; }
  zoneT += dt;
  if (zoneCand !== zoneCur && zoneT > 0.8) { zoneCur = zoneCand; G.hud.zone(zoneCur); }
  G.hud.update(player, dt, G);
}

// ---------------- Debug / test API ----------------
window.game = {
  G, player, input, L,
  teleport(x, y, z) { player.x = x; player.y = y ?? G.world.groundAt(x, z, 999, 0.5).g + 0.1; player.z = z; player.vx = player.vy = player.vz = 0; cam.tx = x; cam.tz = z; cam.ty = player.y; },
  give(what) {
    if (what === 'grapple') player.has.grapple = true;
    if (what === 'djump') player.has.djump = true;
    if (what === 'dna') player.dna = 3;
    if (what === 'coins') player.coins += 100;
  },
  setCamYaw(y) { cam.yaw = y; }, setCamPitch(p) { cam.pitch = p; },
  get cam() { return cam; },
  step: (dt) => step(dt),
  start() { started = true; showOverlay(null); intro(); },
  state() {
    return {
      x: player.x, y: player.y, z: player.z, hp: player.hp, coins: player.coins, relics: player.relics, dna: player.dna,
      secrets: player.secrets, form: player.form, grounded: player.grounded, won: G.won, fps: G.fps, paused,
      zone: zoneCur, grapple: player.has.grapple, barrier: L.barrier.cyl.active, dead: player.dead,
      enemiesAlive: G.enemies.filter((e) => e.alive).length,
    };
  },
};

document.getElementById('loading').remove();
showOverlay('title');
if (params.has('autostart')) window.game.start();
requestAnimationFrame(frame);
