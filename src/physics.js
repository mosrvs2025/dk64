// Lightweight kinematic collision: analytic terrain + axis-aligned boxes + vertical cylinders.
import { H, slope } from './terrain.js';

export const GRAVITY = 34;
export const STEP = 0.4;
const MAX_WALK_SLOPE = 1.15;

export class Box {
  constructor(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    this.min = { x: minX, y: minY, z: minZ };
    this.max = { x: maxX, y: maxY, z: maxZ };
    Object.assign(this, opts);
    this.active = true;
  }
  set(cx, by, cz, hw, h, hd) {
    this.min.x = cx - hw; this.max.x = cx + hw;
    this.min.z = cz - hd; this.max.z = cz + hd;
    this.min.y = by; this.max.y = by + h;
  }
}

export class World {
  constructor() {
    this.boxes = [];     // static + dynamic (crates register their own box)
    this.cylinders = []; // {x,z,r,y0,y1,active}
  }
  addBox(b) { this.boxes.push(b); return b; }
  removeBox(b) { const i = this.boxes.indexOf(b); if (i >= 0) this.boxes.splice(i, 1); }

  // Highest walkable surface below (y + STEP) at footprint (x,z,r)
  groundAt(x, z, y, r, ignore) {
    let g = H(x, z), src = null;
    const rr = r * 0.75;
    for (const b of this.boxes) {
      if (!b.active || b === ignore) continue;
      if (b.max.y > y + STEP || b.max.y <= g) continue;
      if (x + rr > b.min.x && x - rr < b.max.x && z + rr > b.min.z && z - rr < b.max.z) {
        g = b.max.y; src = b;
      }
    }
    return { g, src };
  }

  // Move a vertical capsule-ish body. body: {x,y,z,vx,vy,vz,r,h,grounded}
  move(body, dt, ignore) {
    const r = body.r, h = body.h;
    const ox = body.x, oz = body.z;
    // Horizontal, per axis for wall sliding
    const dx = body.vx * dt, dz = body.vz * dt;
    this._stepAxis(body, dx, 0, ignore);
    this._stepAxis(body, 0, dz, ignore);

    // Vertical
    const prevY = body.y;
    body.vy -= GRAVITY * dt * (body.gravScale ?? 1);
    if (body.vy < -60) body.vy = -60;
    let ny = body.y + body.vy * dt;
    // ceilings
    if (body.vy > 0) {
      for (const b of this.boxes) {
        if (!b.active || b === ignore) continue;
        if (!this._overlapXZ(body.x, body.z, r * 0.8, b)) continue;
        if (b.min.y >= prevY + h - 0.05 && ny + h > b.min.y) { ny = b.min.y - h; body.vy = 0; body.bonk = true; }
      }
    }
    const { g, src } = this.groundAt(body.x, body.z, Math.max(prevY, ny), r, ignore);
    body.grounded = false;
    body.groundBox = null;
    if (ny <= g + 0.02 && body.vy <= 0.01) {
      body.landingSpeed = -body.vy;
      ny = g; body.vy = 0; body.grounded = true; body.groundBox = src;
    } else if (ny < g) {
      ny = g;
    }
    // stick to ground when walking down gentle slopes
    if (!body.grounded && body.wasGrounded && body.vy <= 0 && prevY - g < 0.6 && prevY - g >= 0) {
      ny = g; body.vy = 0; body.grounded = true; body.groundBox = src;
    }
    body.y = ny;

    // slide off steep terrain
    if (body.grounded && !src) {
      const s = slope(body.x, body.z);
      if (s.m > MAX_WALK_SLOPE) {
        body.x -= s.gx / s.m * 8 * dt;
        body.z -= s.gz / s.m * 8 * dt;
        const g2 = H(body.x, body.z);
        body.y = Math.max(body.y - 8 * dt, g2);
        body.sliding = true;
      } else body.sliding = false;
    }
    body.wasGrounded = body.grounded;
    body.movedDist = Math.hypot(body.x - ox, body.z - oz);
  }

  _overlapXZ(x, z, r, b) {
    return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z;
  }

  _stepAxis(body, dx, dz, ignore) {
    if (dx === 0 && dz === 0) return;
    const nx = body.x + dx, nz = body.z + dz;
    // terrain cliffs
    const gOld = H(body.x, body.z), gNew = H(nx, nz);
    const d = Math.hypot(dx, dz);
    if (gNew > body.y + 0.05 && (gNew - gOld) / d > MAX_WALK_SLOPE) {
      if (gNew > body.y + STEP) { body.hitWall = true; return; }
    }
    body.x = nx; body.z = nz;
    const r = body.r, h = body.h;
    for (const b of this.boxes) {
      if (!b.active || b === ignore) continue;
      if (body.y + h <= b.min.y + 0.01 || body.y >= b.max.y - STEP) continue;
      if (!this._overlapXZ(body.x, body.z, r, b)) continue;
      if (b.max.y - body.y <= STEP && body.grounded) continue; // step up
      if (dx !== 0) {
        body.x = dx > 0 ? b.min.x - r - 0.001 : b.max.x + r + 0.001;
        if (body.onWall) body.onWall(b, 'x');
        body.hitWall = true;
      } else {
        body.z = dz > 0 ? b.min.z - r - 0.001 : b.max.z + r + 0.001;
        if (body.onWall) body.onWall(b, 'z');
        body.hitWall = true;
      }
    }
    for (const c of this.cylinders) {
      if (!c.active) continue;
      if (body.y + h <= c.y0 || body.y >= c.y1) continue;
      const ex = body.x - c.x, ez = body.z - c.z;
      const dd = Math.hypot(ex, ez), min = c.r + r;
      if (dd < min && dd > 0.0001) {
        body.x = c.x + ex / dd * min;
        body.z = c.z + ez / dd * min;
        if (c.onPush && body.isPlayer) c.onPush();
      }
    }
  }

  // Ray march for camera collision. Returns fraction along the segment that is free.
  rayFree(ax, ay, az, bx, by, bz) {
    let t = 1;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    // terrain march
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const x = ax + dx * f, y = ay + dy * f, z = az + dz * f;
      if (y < H(x, z) + 0.4) { t = Math.min(t, (i - 1) / steps); break; }
    }
    // boxes (slab test)
    for (const b of this.boxes) {
      if (!b.active || b.noCam) continue;
      const hit = rayBox(ax, ay, az, dx, dy, dz, b);
      if (hit !== null && hit < t) t = hit;
    }
    return Math.max(0, t);
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = 1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmin <= 0) return null; // camera target inside box — ignore
  return tmin;
}
