// Throwables (crates/TNT), enemies, critter frogs, projectiles, and the mini-boss.
import * as THREE from 'three';
import { Box, GRAVITY } from './physics.js';
import { H, isLava, waterLevelAt } from './terrain.js';
import { makeCrate, makeGrunt, makeSpitter, makeRoller, makeCritterFrog, makeBoss, mat } from './models.js';

const TAU = Math.PI * 2;
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

// ---------------- Throwables ----------------
export class Throwable {
  constructor(G, spawn) {
    this.G = G; this.type = spawn.type; this.spawn = spawn;
    this.mesh = makeCrate(this.type === 'tnt'); G.scene.add(this.mesh);
    this.r = 0.7; this.h = 1.4;
    this.box = new Box(0, 0, 0, 0, 0, 0, { throwable: this });
    G.world.addBox(this.box);
    this.reset();
  }
  reset() {
    const s = this.spawn;
    this.x = s.x; this.y = s.y + 0.5; this.z = s.z; this.vx = this.vy = this.vz = 0;
    this.state = 'rest'; this.fuse = 0; this.alive = true; this.respawn = 0;
    this.mesh.visible = true; this.box.active = true; this.mesh.rotation.set(0, 0, 0);
    this.syncBox();
  }
  syncBox() { this.box.set(this.x, this.y, this.z, 0.7, 1.4, 0.7); }
  pickUp() { this.state = 'carried'; this.box.active = false; this.fuse = 0; }
  drop(x, y, z) {
    this.state = 'rest'; this.x = x; this.y = y; this.z = z; this.vx = this.vz = 0; this.vy = 0;
    this.box.active = true; this.syncBox();
  }
  throw(dirx, dirz, px, py, pz) {
    this.state = 'thrown'; this.x = px + dirx * 1.2; this.y = py; this.z = pz + dirz * 1.2;
    this.vx = dirx * 17; this.vz = dirz * 17; this.vy = 7; this.box.active = true; this.thrownT = 0;
  }
  ignite() { if (this.type === 'tnt' && this.fuse <= 0 && this.alive) { this.fuse = 1.4; this.G.sfx.play('tongue'); } }
  explode() {
    if (!this.alive) return;
    this.alive = false; this.mesh.visible = false; this.box.active = false;
    if (this.G.player.carrying === this) this.G.player.carrying = null;
    this.state = 'dead'; this.respawn = 5;
    this.G.explode(this.x, this.y + 0.7, this.z);
  }
  update(dt) {
    const G = this.G;
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.reset();
      return;
    }
    if (this.fuse > 0) {
      this.fuse -= dt;
      this.mesh.scale.setScalar(1 + Math.sin(this.fuse * 40) * 0.08);
      if (this.fuse <= 0) { this.explode(); return; }
    }
    if (this.state === 'carried') {
      const p = G.player;
      this.x = p.x; this.y = p.y + p.h + 0.1; this.z = p.z;
      this.mesh.position.set(this.x, this.y, this.z);
      this.mesh.rotation.y = p.yaw;
      return;
    }
    if (this.state === 'thrown' || this.state === 'rest') {
      const body = this;
      body.r = 0.7; body.h = 1.4;
      const wasThrown = this.state === 'thrown';
      this.hitWall = false;
      G.world.move(body, dt, this.box);
      if (this.state === 'thrown') {
        this.thrownT += dt;
        this.mesh.rotation.x += dt * 8;
        // hit enemies
        for (const e of G.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(e.x - this.x, e.z - this.z) < e.r + 0.9 && Math.abs(e.y + e.h / 2 - (this.y + 0.7)) < e.h / 2 + 1) {
            if (this.type === 'tnt') { this.explode(); return; }
            e.damage(2, this.x, this.z, 'throw');
            this.vx *= -0.3; this.vz *= -0.3;
          }
        }
        if ((this.grounded || this.hitWall) && this.thrownT > 0.05) {
          if (this.type === 'tnt') { this.explode(); return; }
          G.fx.burst(this.x, this.y + 0.3, this.z, 0xb07a3a, 6, 4, 0.25, 0.5);
          this.state = 'rest'; this.mesh.rotation.set(0, this.mesh.rotation.y, 0);
        }
      }
      if (this.grounded) {
        const f = Math.max(0, 1 - dt * 8);
        this.vx *= f; this.vz *= f;
      }
      void wasThrown;
      if (this.y < -30 || (isLava(this.x, this.z) && this.y < 0.2)) {
        if (this.type === 'tnt') { this.explode(); return; }
        G.fx.burst(this.x, this.y, this.z, 0xff6a2a, 10, 5);
        this.reset(); return;
      }
      const wl = waterLevelAt(this.x, this.z);
      if (this.y < wl - 0.6) { this.vy = Math.max(this.vy, 2); this.vx *= 0.95; this.vz *= 0.95; }
      this.syncBox();
      this.mesh.position.set(this.x, this.y, this.z);
    }
  }
}

// ---------------- Enemy base ----------------
class Enemy {
  constructor(G, spec) {
    this.G = G; this.spec = spec; this.tag = spec.tag;
    this.x = spec.x; this.z = spec.z; this.y = spec.y ?? G.world.groundAt(spec.x, spec.z, 999, 0.5).g;
    this.home = { x: this.x, y: this.y, z: this.z };
    this.vx = this.vy = this.vz = 0; this.yaw = Math.random() * TAU;
    this.alive = true; this.flash = 0; this.stun = 0; this.t = Math.random() * 10;
    this.r = 0.8; this.h = 1.8; this.hp = 2; this.coins = 3; this.contact = 1;
  }
  get dPlayer() { const p = this.G.player; return Math.hypot(p.x - this.x, p.z - this.z); }
  damage(n, fx, fz, kind) {
    if (!this.alive || this.invuln > 0) return false;
    if (this.armored && this.armored(kind)) {
      this.G.sfx.play('deny');
      this.G.fx.burst(this.x, this.y + 1, this.z, 0xcccccc, 5, 4, 0.15, 0.3);
      return false;
    }
    this.hp -= n; this.flash = 0.2; this.invuln = 0.25;
    const dx = this.x - fx, dz = this.z - fz, d = Math.hypot(dx, dz) || 1;
    this.vx = dx / d * 9; this.vz = dz / d * 9; this.vy = 6;
    this.stun = 0.5;
    this.G.sfx.play('hit');
    this.G.fx.burst(this.x, this.y + this.h * 0.6, this.z, 0xffffff, 8, 6, 0.25, 0.4);
    if (this.hp <= 0) this.die();
    return true;
  }
  die() {
    this.alive = false; this.mesh.visible = false;
    this.G.fx.burst(this.x, this.y + 1, this.z, 0x9a5aff, 20, 8, 0.35, 0.9);
    this.G.fx.burst(this.x, this.y + 1, this.z, 0xffd23a, this.coins * 2, 6, 0.25, 0.7);
    this.G.player.addCoins(this.coins);
    this.G.onEnemyDeath(this);
  }
  physics(dt) {
    this.invuln = Math.max(0, (this.invuln || 0) - dt);
    this.G.world.move(this, dt);
    if (this.y < -30 || (isLava(this.x, this.z) && this.y < 0.2 && this.lavaKills !== false)) this.die();
  }
  touchPlayer() {
    const p = this.G.player;
    if (!this.alive || this.stun > 0.3) return;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d < this.r + p.r && p.y < this.y + this.h && p.y + p.h > this.y) {
      if (p.vy < -2 && p.y > this.y + this.h * 0.55 && !this.noStomp) {
        this.damage(1, p.x, p.z, 'stomp');
        p.vy = 12; p.slamming = false;
        return;
      }
      p.hurt(this.contact, this.x, this.z);
    }
  }
  render(dt) {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this.flash = Math.max(0, this.flash - dt);
    this.mesh.visible = this.alive && !(this.flash > 0 && Math.floor(this.flash * 30) % 2);
  }
}

export class Grunt extends Enemy {
  constructor(G, spec) {
    super(G, spec);
    this.mesh = makeGrunt(); G.scene.add(this.mesh);
    this.state = 'wander'; this.target = null; this.attackCd = 0;
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const p = this.G.player;
    const d = this.dPlayer;
    const homeD = Math.hypot(this.x - this.home.x, this.z - this.home.z);
    if (this.stun > 0) { this.stun -= dt; this.vx *= 0.9; this.vz *= 0.9; }
    else if (d < 16 && Math.abs(p.y - this.y) < 5 && homeD < 30 && !p.dead) {
      const a = Math.atan2(p.x - this.x, p.z - this.z);
      this.yaw = angLerp(this.yaw, a, dt * 8);
      const sp = 5.2;
      this.vx = Math.sin(this.yaw) * sp; this.vz = Math.cos(this.yaw) * sp;
    } else {
      if (!this.target || Math.random() < dt * 0.3) {
        const a = Math.random() * TAU, r = Math.random() * 8;
        this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
      }
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      if (Math.hypot(dx, dz) > 1) {
        this.yaw = angLerp(this.yaw, Math.atan2(dx, dz), dt * 4);
        this.vx = Math.sin(this.yaw) * 2; this.vz = Math.cos(this.yaw) * 2;
      } else { this.vx = this.vz = 0; }
    }
    this.physics(dt);
    this.touchPlayer();
    const b = this.mesh.userData.body;
    const moving = Math.hypot(this.vx, this.vz) > 0.5;
    b.position.y = moving ? Math.abs(Math.sin(this.t * 10)) * 0.2 : 0;
    b.rotation.z = moving ? Math.sin(this.t * 10) * 0.1 : 0;
    this.render(dt);
  }
}

export class Spitter extends Enemy {
  constructor(G, spec) {
    super(G, spec);
    this.mesh = makeSpitter(); G.scene.add(this.mesh);
    this.cd = 1 + Math.random() * 2; this.hp = 2; this.r = 0.7; this.h = 2.1; this.coins = 4;
    this.noStomp = false;
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const p = this.G.player;
    const d = this.dPlayer;
    const head = this.mesh.userData.head;
    this.stun = Math.max(0, this.stun - dt);
    if (d < 34 && !p.dead) {
      this.yaw = angLerp(this.yaw, Math.atan2(p.x - this.x, p.z - this.z), dt * 5);
      this.cd -= dt;
      head.scale.setScalar(1 + Math.max(0, 0.5 - this.cd) * 0.6);
      if (this.cd <= 0 && this.stun <= 0) {
        this.cd = 2.2;
        const sx = this.x, sy = this.y + 1.8, sz = this.z;
        const tx = p.x + p.vx * 0.4, tz = p.z + p.vz * 0.4, ty = p.y + 0.8;
        const dist = Math.hypot(tx - sx, tz - sz);
        const T = Math.max(0.5, dist / 16);
        const vy = (ty - sy + 0.5 * GRAVITY * 0.6 * T * T) / T;
        this.G.spawnProjectile(sx, sy, sz, (tx - sx) / T, vy, (tz - sz) / T);
        this.G.sfx.play('tongue');
      }
    } else head.scale.setScalar(1);
    head.rotation.x = Math.sin(this.t * 3) * 0.1;
    this.touchPlayer();
    this.render(dt);
  }
}

export class Roller extends Enemy {
  constructor(G, spec) {
    super(G, spec);
    this.mesh = makeRoller(); G.scene.add(this.mesh);
    this.state = 'idle'; this.timer = 0; this.hp = 2; this.coins = 5; this.r = 0.9;
    this.armored = (kind) => this.state !== 'dizzy' && (kind === 'punch' || kind === 'stomp' || kind === 'tongue');
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const p = this.G.player;
    const d = this.dPlayer;
    const b = this.mesh.userData.body;
    this.timer -= dt;
    this.stun = Math.max(0, this.stun - dt);
    switch (this.state) {
      case 'idle':
        this.vx *= 0.9; this.vz *= 0.9;
        b.rotation.x = 0; b.position.x = 0;
        if (d < 18 && Math.abs(p.y - this.y) < 4 && !p.dead) { this.state = 'windup'; this.timer = 0.7; }
        break;
      case 'windup':
        this.yaw = angLerp(this.yaw, Math.atan2(p.x - this.x, p.z - this.z), dt * 10);
        b.position.x = Math.sin(this.t * 60) * 0.08;
        if (this.timer <= 0) { this.state = 'charge'; this.timer = 1.3; }
        break;
      case 'charge': {
        const sp = 17;
        this.vx = Math.sin(this.yaw) * sp; this.vz = Math.cos(this.yaw) * sp;
        b.rotation.x += dt * 20;
        if (this.timer <= 0 || this.hitWall) {
          this.state = 'dizzy'; this.timer = 2;
          if (this.hitWall) { this.G.fx.burst(this.x, this.y + 1, this.z, 0xffffaa, 8, 5, 0.2, 0.5); this.G.sfx.play('punch'); }
        }
        break;
      }
      case 'dizzy':
        this.vx *= 0.85; this.vz *= 0.85;
        b.rotation.x = 0.4; b.rotation.z = Math.sin(this.t * 8) * 0.3;
        if (this.timer <= 0) { this.state = 'idle'; b.rotation.z = 0; }
        break;
    }
    this.hitWall = false;
    const homeD = Math.hypot(this.x - this.home.x, this.z - this.home.z);
    if (homeD > 40 && this.state === 'idle') { this.x = this.home.x; this.z = this.home.z; }
    this.physics(dt);
    if (this.state === 'charge' || this.state === 'windup' || this.state === 'idle') this.touchPlayer();
    this.render(dt);
  }
}

export class CritterFrog extends Enemy {
  constructor(G, spec) {
    super(G, spec);
    this.mesh = makeCritterFrog(); G.scene.add(this.mesh);
    this.hp = 1; this.coins = 0; this.hop = Math.random() * 2; this.r = 1; this.h = 1.5;
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    this.hop -= dt;
    if (this.grounded) { this.vx *= 0.8; this.vz *= 0.8; }
    if (this.hop <= 0 && this.grounded) {
      this.hop = 1.2 + Math.random() * 2;
      const p = this.G.player;
      let a;
      if (this.dPlayer < 7) a = Math.atan2(this.x - p.x, this.z - p.z) + (Math.random() - 0.5);
      else {
        const hx = this.home.x - this.x, hz = this.home.z - this.z;
        a = Math.hypot(hx, hz) > 8 ? Math.atan2(hx, hz) : Math.random() * TAU;
      }
      this.yaw = a; this.vx = Math.sin(a) * 6; this.vz = Math.cos(a) * 6; this.vy = 11;
    }
    this.physics(dt);
    const b = this.mesh.userData.body;
    b.scale.y = this.grounded ? 1 : 1.25; b.scale.x = b.scale.z = this.grounded ? 1 : 0.85;
    this.render(dt);
  }
  die() {
    this.alive = false; this.mesh.visible = false;
    this.G.fx.burst(this.x, this.y + 1, this.z, 0x5aff9a, 25, 8, 0.3, 1);
    this.G.onFrogAbsorbed(this);
  }
}

export class Boss extends Enemy {
  constructor(G, spec) {
    super(G, spec);
    this.mesh = makeBoss(); G.scene.add(this.mesh);
    this.hp = this.maxHp = 14; this.r = 2.1; this.h = 4.5; this.coins = 30; this.contact = 1;
    this.state = 'sleep'; this.timer = 0; this.summoned = false; this.lavaKills = false;
    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffaa3a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    this.ring.visible = false; G.scene.add(this.ring);
    this.ringR = 0; this.ringActive = false;
  }
  damage(n, fx, fz, kind) {
    if (this.state === 'sleep') this.wake();
    const ok = super.damage(n, fx, fz, kind);
    if (ok) { this.vx *= 0.3; this.vz *= 0.3; this.vy = 3; this.invuln = 0.5; this.stun = 0.2; }
    return ok;
  }
  wake() {
    if (this.state !== 'sleep') return;
    this.state = 'chase'; this.timer = 2.5;
    this.G.hud.boss(true, 'CHIEFTAIN KROG', 1);
    this.G.hud.toast('CHIEFTAIN KROG awakens! Jump over his shockwaves!', 3);
    this.G.sfx.play('boom');
  }
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const G = this.G, p = G.player;
    const A = G.level.arena;
    const pd = Math.hypot(p.x - A.x, p.z - A.z);
    if (this.state === 'sleep') {
      if (pd < A.r - 1 && p.y > A.y - 1) this.wake();
      this.mesh.userData.body.rotation.x = Math.sin(this.t) * 0.05;
      this.render(dt);
      return;
    }
    if (p.dead || (pd > A.r + 12)) {
      // reset if player leaves
      if (pd > A.r + 25) {
        this.state = 'sleep'; this.hp = this.maxHp; this.x = this.home.x; this.z = this.home.z; this.summoned = false;
        G.hud.boss(false);
      }
    }
    this.timer -= dt;
    this.stun = Math.max(0, this.stun - dt);
    const b = this.mesh.userData.body;
    switch (this.state) {
      case 'chase': {
        const a = Math.atan2(p.x - this.x, p.z - this.z);
        this.yaw = angLerp(this.yaw, a, dt * 4);
        const sp = this.hp < 7 ? 7.5 : 6;
        if (this.stun <= 0) { this.vx = Math.sin(this.yaw) * sp; this.vz = Math.cos(this.yaw) * sp; }
        b.position.y = Math.abs(Math.sin(this.t * 7)) * 0.3;
        if (this.timer <= 0) { this.state = 'leap'; this.timer = 0.5; this.vx = this.vz = 0; }
        break;
      }
      case 'leap':
        b.scale.y = 0.8;
        if (this.timer <= 0) {
          b.scale.y = 1;
          const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1;
          const T = 1.1;
          this.vx = dx / T; this.vz = dz / T; this.vy = 0.5 * 34 * T;
          if (d > 16) { this.vx *= 16 / d; this.vz *= 16 / d; }
          this.state = 'air';
        }
        break;
      case 'air':
        if (this.grounded) {
          this.vx = this.vz = 0;
          this.state = 'recover'; this.timer = this.hp < 7 ? 0.9 : 1.4;
          G.sfx.play('slam'); G.shake(0.6);
          G.fx.burst(this.x, this.y + 0.3, this.z, 0x6a5a4a, 24, 10, 0.5, 0.8);
          this.ringR = this.r; this.ringActive = true; this.ringY = this.y; this.ring.visible = true;
          this.ringX = this.x; this.ringZ = this.z;
          if (this.hp <= 7 && !this.summoned) {
            this.summoned = true;
            G.spawnEnemy('grunt', A.x - 8, A.z + 6);
            G.spawnEnemy('grunt', A.x + 8, A.z - 6);
            G.hud.toast('Krog calls for backup!', 2);
          }
        }
        break;
      case 'recover':
        this.vx *= 0.8; this.vz *= 0.8;
        b.rotation.x = 0.3;
        if (this.timer <= 0) { this.state = 'chase'; this.timer = 2 + Math.random() * 1.5; b.rotation.x = 0; }
        break;
    }
    // shockwave
    if (this.ringActive) {
      this.ringR += dt * 15;
      this.ring.position.set(this.ringX, this.ringY + 0.2, this.ringZ);
      this.ring.scale.setScalar(this.ringR);
      this.ring.material.opacity = Math.max(0, 1 - this.ringR / 26);
      const d = Math.hypot(p.x - this.ringX, p.z - this.ringZ);
      if (Math.abs(d - this.ringR) < 0.9 && p.y < this.ringY + 0.8 && p.grounded) p.hurt(1, this.ringX, this.ringZ);
      if (this.ringR > 26) { this.ringActive = false; this.ring.visible = false; }
    }
    // stay on island
    const ad = Math.hypot(this.x - A.x, this.z - A.z);
    if (ad > A.r - 2) { this.x = A.x + (this.x - A.x) / ad * (A.r - 2); this.z = A.z + (this.z - A.z) / ad * (A.r - 2); }
    this.physics(dt);
    this.touchPlayer();
    G.hud.boss(true, 'CHIEFTAIN KROG', this.hp / this.maxHp);
    this.render(dt);
  }
  die() {
    super.die();
    this.ring.visible = false;
    this.G.hud.boss(false);
    this.G.shake(1);
    this.G.sfx.play('big');
  }
}

export class Projectile {
  constructor(G) {
    this.G = G;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mat(0xb02a6a, { emissive: 0x5a0a2a }));
    G.scene.add(this.mesh);
    this.alive = false;
  }
  fire(x, y, z, vx, vy, vz) {
    Object.assign(this, { x, y, z, vx, vy, vz, alive: true, life: 4 });
    this.mesh.visible = true;
  }
  update(dt) {
    if (!this.alive) { this.mesh.visible = false; return; }
    const G = this.G, p = G.player;
    this.life -= dt;
    this.vy -= GRAVITY * 0.6 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.mesh.position.set(this.x, this.y, this.z);
    const hitP = Math.hypot(p.x - this.x, p.z - this.z) < 0.9 && this.y > p.y - 0.2 && this.y < p.y + p.h + 0.2;
    if (hitP) {
      if (p.attackActive && p.attackKind === 'punch') {
        // parry: send it back
        this.vx *= -1.4; this.vz *= -1.4; this.vy = 6; this.reflected = true;
        G.sfx.play('punch');
        return;
      }
      p.hurt(1, this.x - this.vx, this.z - this.vz);
    }
    if (this.reflected) {
      for (const e of G.enemies) {
        if (e.alive && Math.hypot(e.x - this.x, e.z - this.z) < e.r + 0.6 && this.y > e.y && this.y < e.y + e.h + 0.5) {
          e.damage(2, this.x, this.z, 'throw'); this.kill(); return;
        }
      }
    }
    if (hitP || this.y < H(this.x, this.z) || this.life <= 0) this.kill();
  }
  kill() {
    this.alive = false; this.mesh.visible = false;
    this.G.fx.burst(this.x, this.y, this.z, 0xb02a6a, 8, 4, 0.2, 0.4);
  }
}
