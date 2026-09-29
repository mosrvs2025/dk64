// Progress persistence (per-browser) and the pause-menu island map.
import { H, VOLCANO, LAGOON, SPIRE, PLATEAU_EDGE, isLava } from './terrain.js';

const KEY = 'kong-island-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

export function saveGame(G) {
  const { player: p, level: L } = G;
  const idx = (arr, f) => arr.reduce((a, x, i) => (f(x) ? (a.push(i), a) : a), []);
  const data = {
    v: 1,
    coins: p.coins, dna: p.dna, maxHp: p.maxHp, has: p.has, time: G.time, won: G.won,
    relics: L.relics.filter((r) => r.taken).map((r) => r.id),
    chests: idx(L.chests, (c) => c.opened),
    coinsTaken: idx(L.coins, (c) => c.taken),
    cp: L.checkpoints.indexOf(G.checkpoint),
    blueprint: L.blueprint.taken,
    gate: L.gate.open,
    crown: L.crown.taken,
    dead: idx(G.enemies, (e) => !e.alive && (e.isFrog || e.tag || e.constructor.name === 'Boss')),
    breakables: idx(L.breakables, (b) => !b.box.active),
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

export function loadGame(G, bpMesh) {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
  if (!d || d.v !== 1) return false;
  const { player: p, level: L } = G;
  p.coins = d.coins | 0; p.dna = d.dna | 0; p.maxHp = d.maxHp || 5; p.hp = p.maxHp;
  Object.assign(p.has, d.has || {});
  G.time = d.time || 0; G.won = !!d.won;
  for (const r of L.relics) if (d.relics.includes(r.id)) { r.taken = true; r.hidden = false; r.mesh.visible = false; }
  p.relics = d.relics.length;
  for (const i of d.chests) { const c = L.chests[i]; if (c) { c.opened = true; c.mesh.userData.lid.rotation.x = -1.9; } }
  p.secrets = d.chests.length;
  for (const i of d.coinsTaken) if (L.coins[i]) L.coins[i].taken = true;
  if (d.blueprint) { L.blueprint.taken = true; bpMesh.visible = false; }
  if (d.gate) { L.gate.open = true; L.gate.box.active = false; L.gate.mesh.position.y = L.gate.y0 - 3.5; }
  if (d.crown) { L.crown.taken = true; L.crown.mesh.visible = false; }
  for (const i of d.dead || []) { const e = G.enemies[i]; if (e) { e.alive = false; e.mesh.visible = false; } }
  for (const i of d.breakables || []) { const b = L.breakables[i]; if (b) { b.box.active = false; b.mesh.visible = false; } }
  if (p.relics >= L.barrier.need) { L.barrier.cyl.active = false; L.barrier.mesh.visible = false; }
  const cp = L.checkpoints[d.cp] || L.checkpoints[0];
  G.setCheckpoint(cp, true);
  p.reset({ x: cp.x, y: cp.y + 0.3, z: cp.z });
  return true;
}

// ---------------- Map ----------------
let mapImg = null;
function bakeMap(size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const x2 = cv.getContext('2d');
  const img = x2.createImageData(size, size);
  const W = 560;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i / size - 0.5) * W, z = (j / size - 0.5) * W;
    const h = H(x, z);
    let c;
    const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const lag = Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.r + 3;
    if (isLava(x, z) && h < 0.5) c = [240, 110, 30];
    else if (h < -1.5 || (lag && h < LAGOON.water)) c = h < -5 ? [30, 90, 150] : [60, 170, 200];
    else if (h < 0.4) c = [232, 214, 160];
    else if (dv < 90) c = [80, 66, 60];
    else if (z < PLATEAU_EDGE - 4 && h > 12) c = [196, 184, 150];
    else if (x < -58) c = [40, 120, 55];
    else c = [110, 185, 80];
    const shade = 0.8 + Math.min(0.35, Math.max(0, h) * 0.012);
    const k = (j * size + i) * 4;
    img.data[k] = c[0] * shade; img.data[k + 1] = c[1] * shade; img.data[k + 2] = c[2] * shade; img.data[k + 3] = 255;
  }
  x2.putImageData(img, 0, 0);
  return cv;
}
export function drawMap(canvas, G) {
  const S = canvas.width, W = 560;
  if (!mapImg) mapImg = bakeMap(160);
  const x = canvas.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(mapImg, 0, 0, S, S);
  const P = (wx, wz) => [(wx / W + 0.5) * S, (wz / W + 0.5) * S];
  const L = G.level, p = G.player;
  x.font = 'bold 11px sans-serif'; x.textAlign = 'center';
  const label = (t, wx, wz) => { const [a, b] = P(wx, wz); x.fillStyle = 'rgba(0,0,0,.55)'; x.fillText(t, a + 1, b + 1); x.fillStyle = '#fff'; x.fillText(t, a, b); };
  label('VILLAGE', 0, 30); label('JUNGLE', -170, -10); label('RUINS', 0, -210); label('CALDERA', 190, 60);
  // spire
  const [sx, sy] = P(SPIRE.x, SPIRE.z);
  x.fillStyle = L.barrier.cyl.active ? '#8a5aff' : '#ffd23a';
  x.beginPath(); x.arc(sx, sy, 5, 0, 7); x.fill();
  // checkpoints
  for (const c of L.checkpoints) { const [a, b] = P(c.x, c.z); x.fillStyle = c === G.checkpoint ? '#ffd23a' : 'rgba(255,255,255,.7)'; x.fillRect(a - 1.5, b - 1.5, 3, 3); }
  // grapple rings (once unlocked)
  if (p.has.grapple) for (const g of L.grapples) { const [a, b] = P(g.x, g.z); x.strokeStyle = '#3ad8ff'; x.lineWidth = 1.5; x.beginPath(); x.arc(a, b, 2.5, 0, 7); x.stroke(); }
  // relics still out there
  for (const r of L.relics) {
    if (r.taken) continue;
    const [a, b] = P(r.x, r.z);
    x.fillStyle = r.hidden ? 'rgba(255,210,58,.45)' : '#ffd23a';
    x.strokeStyle = '#6a4a00'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(a, b - 5); x.lineTo(a + 4, b); x.lineTo(a, b + 5); x.lineTo(a - 4, b); x.closePath(); x.fill(); x.stroke();
  }
  // player
  const [px, py] = P(p.x, p.z);
  x.save(); x.translate(px, py); x.rotate(-p.yaw + Math.PI);
  x.fillStyle = '#ff3a3a'; x.strokeStyle = '#fff'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(0, -8); x.lineTo(6, 6); x.lineTo(0, 3); x.lineTo(-6, 6); x.closePath(); x.stroke(); x.fill();
  x.restore();
}
