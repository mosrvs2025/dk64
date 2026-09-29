// In-page bot helpers. Drives the real Input object (key codes / queued actions) and steps the game deterministically.
window.bot = (() => {
  const g = window.game, inp = g.input, P = g.player;
  const DT = 1 / 60;
  const step = (n = 1) => { for (let i = 0; i < n; i++) g.step(DT); };
  const keys = (codes, on) => codes.forEach((c) => (on ? inp.keys.add(c) : inp.keys.delete(c)));
  const release = () => inp.keys.clear();
  const press = (a) => { inp.inject(a); if (a === 'jump') inp.keys.add('Space'); step(1); };
  const yawToward = (x, z) => Math.atan2(-(x - P.x), -(z - P.z));
  const face = (x, z) => g.setCamYaw(yawToward(x, z));
  const dist = (x, z) => Math.hypot(P.x - x, P.z - z);

  // Walk (or sprint) to x,z. Auto-jumps when stuck. Returns true on arrival.
  function walkTo(x, z, { tol = 1.2, max = 1200, sprint = false, jumpWhenStuck = true } = {}) {
    let stuck = 0;
    for (let i = 0; i < max; i++) {
      if (P.dead) return false;
      face(x, z);
      keys(['KeyW'], true); keys(['ShiftLeft'], sprint);
      const bx = P.x, bz = P.z;
      step(1);
      if (dist(x, z) < tol) { release(); return true; }
      if (Math.hypot(P.x - bx, P.z - bz) < 0.02) stuck++; else stuck = 0;
      if (stuck > 10 && jumpWhenStuck && P.grounded) { press('jump'); stuck = 0; }
      if (!P.grounded) { /* keep holding */ } else inp.keys.delete('Space');
    }
    release(); return false;
  }

  // Precise hop onto a target platform at (x, topY, z): run, jump, steer, stop.
  function hopTo(x, z, { sprint = false, maxFrames = 240, jumpAt = 3.0 } = {}) {
    release();
    let jumped = false;
    for (let i = 0; i < maxFrames; i++) {
      if (P.dead) return false;
      face(x, z);
      const d = dist(x, z);
      const hold = d > 0.15;
      keys(['KeyW'], hold); keys(['ShiftLeft'], sprint && hold);
      if (!jumped && d <= jumpAt && i >= 2) { press('jump'); jumped = true; continue; }
      step(1);
      if (jumped && P.grounded && i > 8) { release(); step(6); return true; }
    }
    release(); return false;
  }

  // Fight an enemy: close in, face it, punch on a rhythm.
  function fight(e, max = 600) {
    for (let i = 0; i < max && e.alive; i++) {
      const d = dist(e.x, e.z);
      face(e.x, e.z);
      keys(['KeyW'], d > e.r + 1.4);
      if (d < e.r + 2.4 && i % 14 === 0) { P.yaw = Math.atan2(e.x - P.x, e.z - P.z); press('attack'); } else step(1);
    }
    release();
    return !e.alive;
  }
  function waitGrounded(max = 240) { for (let i = 0; i < max && !P.grounded; i++) step(1); return P.grounded; }
  function relic(id) { return g.L.relics.find((r) => r.id === id); }
  function st() { return g.state(); }
  return { step, keys, release, press, face, dist, walkTo, hopTo, fight, waitGrounded, relic, st, P, g };
})();
