// End-to-end play-test: boots the game in headless Chromium and verifies progression + multi-solution puzzles.
// Usage: npm test            (uses the dev server)
//        node tests/smoke.mjs --only=pillar
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = 4180;
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const botSrc = fs.readFileSync(new URL('./bot.js', import.meta.url), 'utf8');

const results = [];
async function scenario(name, fn, opts = {}) {
  if (only && !name.includes(only)) return;
  const page = await browser.newPage(opts.mobile
    ? { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/?fresh`);
  await page.waitForFunction(() => window.game, null, { timeout: 90000 });
  await page.evaluate(() => { window.game.start(); });
  await page.evaluate(botSrc);
  let ok = false, info = '';
  try {
    const r = await fn(page);
    ok = r === true || (r && r.ok);
    info = typeof r === 'object' ? JSON.stringify(r) : String(r);
  } catch (e) { info = 'EXCEPTION ' + e.message; }
  if (errors.length) { ok = false; info += ' ERRORS: ' + errors.join(' | '); }
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`);
  await page.close();
}
const E = (page, fn, arg) => page.evaluate(fn, arg);

// ---------------------------------------------------------------------------
await scenario('boot: title -> playing, HUD present, no errors', async (p) => E(p, () => {
  const s = bot.st();
  return { ok: !s.paused && document.getElementById('relics').textContent === '0/12', s };
}));

await scenario('movement: walk, sprint, jump with coyote/variable height', async (p) => E(p, () => {
  const { P } = bot;
  const z0 = P.z;
  bot.face(0, -100); bot.keys(['KeyW'], true); bot.step(60); bot.release();
  const walked = z0 - P.z;
  bot.step(20);
  bot.face(0, -100); bot.keys(['KeyW', 'ShiftLeft'], true); bot.step(60); bot.release();
  const sprinted = z0 - P.z - walked;
  bot.step(30);
  let peak = P.y; bot.press('jump');
  for (let i = 0; i < 60; i++) { bot.step(1); peak = Math.max(peak, P.y); }
  bot.release(); bot.step(60);
  const full = peak - 1;
  // short hop (tap)
  bot.press('jump'); bot.release();
  let peak2 = P.y; for (let i = 0; i < 60; i++) { bot.step(1); peak2 = Math.max(peak2, P.y); }
  return { ok: walked > 6 && sprinted > walked * 1.3 && full > 2.3 && peak2 - 1 < full * 0.8, walked, sprinted, full, short: peak2 - 1 };
}));

await scenario('first minute: coins + fight + watchtower relic', async (p) => E(p, () => {
  const { P, g } = bot;
  const L = g.L;
  // run along the coin trail toward the tower
  bot.walkTo(-12, -8, { sprint: true });
  const coins = P.coins;
  // punch a grunt near the tower
  const grunt = g.G.enemies.find((e) => e.constructor.name === 'Grunt' && Math.hypot(e.x - 8, e.z + 32) < 6);
  g.teleport(grunt.x + 4, null, grunt.z);
  bot.fight(grunt);
  // climb the tower: platforms at heights 1.5,3,5,7,9 then pillar top 11
  g.teleport(-16 + 3, null, -12 + 3.4 + 2.5);
  const route = [[-13, -8.6], [-12.8, -12], [-16, -15.2], [-19.2, -12], [-16, -8.8], [-16, -12]];
  for (let attempt = 0; attempt < 2 && !bot.relic(1).taken; attempt++) {
    g.teleport(-16 + 3, null, -12 + 3.4 + 2.5); bot.step(10);
    for (const [x, z] of route) bot.hopTo(x, z);
    bot.walkTo(-16, -12, { tol: 0.4, max: 60, jumpWhenStuck: false });
  }
  const r = bot.relic(1);
  return { ok: coins >= 5 && !grunt.alive && r.taken, coins, gruntDead: !grunt.alive, relic: r.taken, y: P.y, time: g.G.time.toFixed(1) };
}));

await scenario('pillar: solved by 3-crate staircase (lift/drop with E)', async (p) => E(p, () => {
  const { P, g } = bot;
  const crates = g.G.throwables.filter((t) => t.type === 'crate' && Math.hypot(t.x - 14, t.z + 12) < 8);
  // Stack: crate A+B at (22,-14.6) (two high), crate C at (22,-12.8) (step)
  const carryTo = (c, sx, sz, faceX, faceZ) => {
    g.teleport(c.x, null, c.z + 1.8); bot.face(c.x, c.z); bot.step(2);
    bot.press('interact'); bot.step(2);
    if (P.carrying !== c) return false;
    g.teleport(sx, null, sz); bot.face(faceX, faceZ); bot.step(3);
    bot.press('interact'); bot.step(30);
    return P.carrying === null;
  };
  const a = carryTo(crates[0], 22, -12.2, 22, -18);
  const b = carryTo(crates[1], 22, -12.2, 22, -18);
  const c = carryTo(crates[2], 22, -10.4, 22, -18);
  const tops = crates.map((k) => +(k.y + 1.4).toFixed(2));
  // climb: ground -> C -> stack -> pillar
  g.teleport(22, null, -6); bot.step(10);
  bot.hopTo(22, -12.6);
  bot.hopTo(22, -14.4);
  bot.hopTo(22, -18, { sprint: true });
  return { ok: a && b && c && bot.relic(2).taken, placed: [a, b, c], tops, y: P.y };
}));

await scenario('pillar: solved by Frog form jump', async (p) => E(p, () => {
  const { P, g } = bot;
  g.give('dna'); bot.press('form'); bot.step(5);
  g.teleport(22, null, -12.5);
  bot.hopTo(22, -18);
  return { ok: P.form === 'frog' && bot.relic(2).taken, form: P.form, y: P.y };
}));

await scenario('pillar: solved by Grapple hook', async (p) => E(p, () => {
  const { P, g } = bot;
  g.give('grapple');
  g.teleport(22, null, -4); bot.face(22, -18); g.setCamPitch(0.05); bot.step(5);
  const target = g.G.grappleTarget;
  bot.press('special');
  for (let i = 0; i < 200 && !bot.relic(2).taken; i++) {
    if (!P.grapple) { bot.face(22, -18); bot.keys(['KeyW'], bot.dist(22, -18) > 0.15); }
    bot.step(1);
  }
  bot.release();
  return { ok: !!target && bot.relic(2).taken, target: !!target, y: P.y };
}));

await scenario('pillar: solved by TNT launch', async (p) => E(p, () => {
  const { P, g } = bot;
  const tnt = g.G.throwables.find((t) => t.type === 'tnt' && Math.hypot(t.x - 28, t.z + 10) < 3);
  g.teleport(tnt.x, null, tnt.z + 1.8); bot.face(tnt.x, tnt.z); bot.step(2);
  bot.press('interact'); bot.step(2);
  g.teleport(22, null, -11.5); bot.face(22, 0); bot.step(2);
  bot.press('interact'); bot.step(20); // TNT now at ~ (22,-9.7)
  g.teleport(22, null, -12.2); bot.face(22, -9.7); bot.step(2);
  bot.press('attack'); // light fuse
  bot.release();
  bot.step(10);
  // wait for the blast while standing still, then steer onto the pillar
  let peak = 0;
  for (let i = 0; i < 200; i++) {
    if (!P.grounded || i > 80) { bot.face(22, -18); bot.keys(['KeyW'], bot.dist(22, -18) > 0.4); }
    bot.step(1); peak = Math.max(peak, P.y);
    if (bot.relic(2).taken) break;
  }
  bot.release();
  return { ok: bot.relic(2).taken, peak, y: P.y };
}));

await scenario('pillar: solved by Double Jump bought at the shop', async (p) => E(p, () => {
  const { P, g } = bot;
  P.coins = 60;
  g.teleport(-12, null, 19); bot.face(-12, 22); bot.step(3);
  bot.press('interact'); bot.step(2);
  document.getElementById('buyDJ').click();
  document.getElementById('shopClose').click();
  g.teleport(22, null, -12); bot.step(5);
  bot.face(22, -18); bot.keys(['KeyW'], true);
  bot.press('jump');
  for (let i = 0; i < 120; i++) {
    bot.face(22, -18); bot.keys(['KeyW'], bot.dist(22, -18) > 0.4);
    if (i === 16) bot.press('jump'); else bot.step(1);
  }
  bot.release();
  return { ok: P.has.djump && P.coins === 0 && bot.relic(2).taken, djump: P.has.djump, y: P.y };
}));

await scenario('jungle: punch 3 frogs -> DNA -> transformation unlock', async (p) => E(p, () => {
  const { P, g } = bot;
  const frogs = g.G.enemies.filter((e) => e.isFrog);
  for (const f of frogs) {
    g.teleport(f.x + 3, null, f.z);
    bot.fight(f, 900);
    bot.step(200);
  }
  bot.press('form'); bot.step(3);
  return { ok: P.dna === 3 && P.form === 'frog', dna: P.dna, form: P.form };
}));

await scenario('lagoon relic: frog from lily pad / grapple', async (p) => E(p, () => {
  const { P, g } = bot;
  g.give('dna'); bot.press('form'); bot.step(3);
  g.teleport(-152, -1.2, 51); bot.step(10);
  bot.hopTo(-160, 50, { sprint: true, jumpAt: 8.5 });
  const frogOk = bot.relic(3).taken;
  return { ok: frogOk, frogOk, y: P.y };
}));

await scenario('route: hub -> jungle -> pit -> tunnel -> ruins, no loading screens', async (p) => E(p, () => {
  const { P, g } = bot;
  const T = [[-130, -62], [-112, -92], [-92, -118], [-78, -140], [-68, -162]];
  const zones = new Set();
  const log = (s) => zones.add(g.state().zone);
  const legs = [[-40, 12], [-70, 12], [-100, -20], [-124, -54], [-130, -62]];
  for (const [x, z] of legs) { if (!bot.walkTo(x, z, { sprint: true, max: 900 })) return { ok: false, stuckAt: [P.x, P.y, P.z], leg: [x, z] }; log(); }
  bot.step(90); log();
  const bottomY = P.y;
  for (const [x, z] of T.slice(1)) { if (!bot.walkTo(x, z, { sprint: true, max: 900 })) return { ok: false, stuckAt: [P.x, P.y, P.z], leg: [x, z], zones: [...zones] }; log(); }
  bot.walkTo(-66, -172, { max: 400 }); bot.step(60); log();
  return { ok: bottomY < -8 && P.y > 15 && P.has.grapple && zones.has('OLD STONE TUNNEL') && zones.has('ANCIENT RUINS'), bottomY, y: P.y, grapple: P.has.grapple, zones: [...zones] };
}));

await scenario('cracked floor: broken by ground pound', async (p) => E(p, () => {
  const { P, g } = bot;
  const slab = g.L.breakables[0].box;
  const cx = (slab.min.x + slab.max.x) / 2, cz = (slab.min.z + slab.max.z) / 2;
  g.teleport(cx, slab.max.y + 0.05, cz); bot.step(10);
  bot.press('jump'); bot.step(18); bot.press('attack'); bot.release(); bot.step(90);
  const broken = !slab.active;
  bot.step(60);
  bot.walkTo(g.L.relics.find((r) => r.id === 6).x, g.L.relics.find((r) => r.id === 6).z, { tol: 0.6, max: 120 });
  bot.step(30);
  return { ok: broken && bot.relic(6).taken, broken, relic: bot.relic(6).taken };
}));

await scenario('cracked floor: broken by thrown TNT', async (p) => E(p, () => {
  const { P, g } = bot;
  const slab = g.L.breakables[0].box;
  const cx = (slab.min.x + slab.max.x) / 2, cz = (slab.min.z + slab.max.z) / 2;
  const tnt = g.G.throwables.find((t) => t.type === 'tnt' && Math.hypot(t.x - cx, t.z - cz) < 12);
  g.teleport(tnt.x + 1.6, tnt.y, tnt.z); bot.step(2);
  bot.press('interact'); bot.step(3);
  const lifted = P.carrying === tnt;
  const sx = cx + (tnt.x - cx) * 0.6, sz = cz + (tnt.z - cz) * 0.6;
  g.teleport(sx, tnt.y + 0.3, sz); bot.step(10);
  P.yaw = Math.atan2(cx - P.x, cz - P.z);
  bot.press('attack'); bot.step(120);
  return { ok: lifted && !slab.active, lifted, broken: !slab.active };
}));

await scenario('ruins: temple apex via grapple chain', async (p) => E(p, () => {
  const { P, g } = bot;
  g.give('grapple');
  g.teleport(40, null, -168); bot.step(5);
  let grapples = 0;
  for (let k = 0; k < 6 && !bot.relic(7).taken; k++) {
    bot.face(40, -190); g.setCamPitch(-0.1); bot.step(3);
    if (g.G.grappleTarget) { bot.press('special'); grapples++; bot.step(80); bot.waitGrounded(); }
    // walk inward a bit
    bot.hopTo(40, P.z - 2.2);
  }
  bot.walkTo(40, -190, { tol: 0.8, max: 200 });
  return { ok: bot.relic(7).taken, grapples, y: P.y };
}));

await scenario('ruins vault: two crates on plates open gate', async (p) => E(p, () => {
  const { P, g } = bot;
  const plates = g.L.plates;
  const crates = g.G.throwables.filter((t) => t.type === 'crate' && Math.hypot(t.x + 40, t.z + 183) < 8);
  plates.forEach((pl, i) => { const c = crates[i]; c.pickUp(); c.drop(pl.x, pl.y, pl.z); });
  bot.step(30);
  const open = g.L.gate.open;
  g.teleport(-40, null, -190); bot.step(5);
  bot.walkTo(-40, -205, { tol: 0.8, max: 400 });
  return { ok: open && bot.relic(8).taken, open, relic: bot.relic(8).taken };
}));

await scenario('ruins vault: frog hops over the wall (alt solution)', async (p) => E(p, () => {
  const { P, g } = bot;
  g.give('dna'); bot.press('form'); bot.step(3);
  g.teleport(-40, null, -195); bot.step(5);
  bot.hopTo(-40, -205, { jumpAt: 6.5 });
  bot.walkTo(-40, -205, { tol: 0.8, max: 200 });
  return { ok: bot.relic(8).taken && !g.L.gate.open, relic: bot.relic(8).taken };
}));

await scenario('caldera: hop stepping stones and defeat Chieftain Krog', async (p) => E(p, () => {
  const { P, g } = bot;
  g.teleport(126, null, 20); bot.step(10);
  const stones = [[130, 20], [134, 23], [138, 19], [142, 22], [146, 18], [150, 21], [154, 18], [158, 21], [162, 19], [166, 21]];
  for (const [x, z] of stones) { bot.hopTo(x, z, { jumpAt: bot.dist(x, z) - 1.0 }); if (P.dead) return { ok: false, diedAt: [x, z] }; }
  bot.hopTo(172, 20, { sprint: true });
  if (P.dead) return { ok: false, died: 'last' };
  const boss = g.G.enemies.find((e) => e.constructor.name === 'Boss');
  P.maxHp = 99; P.hp = 99; // bot can't dodge well; verify the fight loop, not its reflexes
  for (let i = 0; i < 60 * 90 && boss.alive; i++) {
    const d = Math.hypot(boss.x - P.x, boss.z - P.z);
    bot.face(boss.x, boss.z);
    bot.keys(['KeyW'], d > boss.r + 1.2);
    if (d < boss.r + 2.2 && i % 10 === 0) bot.press('attack'); else bot.step(1);
    if (P.dead) { P.dead = false; P.mesh.visible = true; g.teleport(175, null, 20); }
  }
  bot.release();
  bot.walkTo(190, 20, { tol: 0.8, max: 400 });
  return { ok: !boss.alive && bot.relic(11).taken, bossHp: boss.hp, relic: bot.relic(11).taken };
}));

await scenario('spire: seal needs 8 relics, then climb to Crown -> victory', async (p) => E(p, () => {
  const { P, g } = bot;
  g.teleport(0, null, -64); bot.walkTo(0, -84, { max: 200, jumpWhenStuck: false });
  const blocked = Math.hypot(P.x, P.z + 84) > 12;
  // grant 8 relics by collecting them
  for (const r of g.L.relics.slice(0, 12)) { if (P.relics >= 8) break; r.hidden = false; g.teleport(r.x, r.y - 0.9, r.z); bot.step(2); }
  const sealBroken = !g.L.barrier.cyl.active;
  // climb the spiral: hop platform to platform
  const plats = g.G.world.boxes.filter((b) => b.mesh && Math.hypot((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2 + 84) < 11 && b.max.y - b.min.y < 0.6)
    .sort((a, b) => a.max.y - b.max.y);
  const first = plats[0];
  g.teleport((first.min.x + first.max.x) / 2, first.max.y + 0.05, (first.min.z + first.max.z) / 2); bot.step(5);
  let fails = 0;
  for (const b of plats.slice(1)) {
    const x = (b.min.x + b.max.x) / 2, z = (b.min.z + b.max.z) / 2;
    bot.hopTo(x, z);
    if (Math.abs(P.y - b.max.y) > 0.3) { fails++; g.teleport(x, b.max.y + 0.05, z); bot.step(3); }
  }
  bot.hopTo(0, -84);
  bot.walkTo(0, -84, { tol: 0.5, max: 200 });
  bot.step(10);
  return { ok: blocked && sealBroken && g.G.won && fails <= 3, blocked, sealBroken, won: g.G.won, fails, platforms: plats.length };
}));

await scenario('hook onboarding: tutorial ring is targeted right after pickup and leads to a secret', async (p) => E(p, () => {
  const { P, g } = bot;
  g.teleport(-66, null, -167); bot.step(5);
  bot.walkTo(-66, -172, { tol: 0.8, max: 200 });
  bot.step(3);
  const targeted = g.G.grappleTarget === g.L.tutorialRing;
  const secrets0 = P.secrets;
  bot.press('special');
  for (let i = 0; i < 200 && P.secrets === secrets0; i++) bot.step(1);
  return { ok: P.has.grapple && targeted && P.secrets > secrets0, grapple: P.has.grapple, targeted, secrets: P.secrets };
}));

await scenario('save: progress survives a reload (Continue)', async (p) => {
  await p.evaluate(() => { const { P, g } = bot; const r = bot.relic(1); g.teleport(r.x, r.y - 0.9, r.z); bot.step(3); P.coins += 25; g.G.save(); });
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForFunction(() => window.game, null, { timeout: 90000 });
  const r = await p.evaluate(() => ({ relics: window.game.player.relics, btn: document.getElementById('startBtn').textContent, taken: window.game.L.relics[0].taken }));
  await p.evaluate(() => localStorage.clear());
  return { ok: r.relics === 1 && r.taken && r.btn === 'CONTINUE', ...r };
});

await scenario('mobile: touch UI visible and joystick moves player', async (p) => {
  const vis = await E(p, () => getComputedStyle(document.getElementById('btnJump')).display !== 'none');
  const z0 = await E(p, () => bot.P.z);
  await p.evaluate(() => { bot.g.setCamYaw(0); });
  const c = p.locator('#c');
  const box = await c.boundingBox();
  const sx = box.x + 120, sy = box.y + 280;
  // synthesize a touch drag on the left half
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - 60, id: 1 }] });
  await p.evaluate(() => { for (let i = 0; i < 60; i++) { bot.g.setCamYaw(0); bot.step(1); } });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // tap jump button
  const jb = await p.locator('#btnJump').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jb.x + 40, y: jb.y + 40, id: 2 }] });
  const jumped = await p.evaluate(() => { let peak = bot.P.y; for (let i = 0; i < 30; i++) { bot.step(1); peak = Math.max(peak, bot.P.y); } return peak - 1; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const z1 = await E(p, () => bot.P.z);
  await p.screenshot({ path: 'tests/shots/mobile.png' });
  return { ok: vis && z0 - z1 > 4 && jumped > 1.5, vis, moved: z0 - z1, jumped };
}, { mobile: true });

await scenario('perf: game logic per frame well under budget (rendering is GPU-bound, not testable in software GL)', async (p) => E(p, () => {
  const { g } = bot;
  const spots = [[0, 12], [-150, 20], [-60, -172], [150, 20]];
  const res = {};
  for (const [x, z] of spots) {
    g.teleport(x, null, z); bot.step(30);
    const t0 = performance.now(); bot.step(240); res[`${x},${z}`] = +((performance.now() - t0) / 240).toFixed(2);
  }
  const worst = Math.max(...Object.values(res));
  const info = g.G.renderer.info.render;
  return { ok: worst < 4, msPerStep: res, drawCalls: info.calls, triangles: info.triangles };
}));

await browser.close(); srv.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
process.exit(failed.length ? 1 : 0);
