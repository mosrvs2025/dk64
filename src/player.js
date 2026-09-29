// The hero: movement, abilities, transformation, combat.
import * as THREE from 'three';
import { H, waterLevelAt, isLava } from './terrain.js';
import { makeFrogForm } from './models.js';
import { makeKong, animateKong } from './kong.js';

const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * Math.min(1, t);

const FORMS = {
  hero: { speed: 9, sprint: 14.5, jump: 13.5, h: 1.9, r: 0.5, accel: 70, air: 30 },
  frog: { speed: 7.5, sprint: 10.5, jump: 22, h: 1.3, r: 0.6, accel: 55, air: 26 },
};

export class Player {
  constructor(G) {
    this.G = G;
    this.heroMesh = makeKong(); this.frogMesh = makeFrogForm();
    this.mesh = new THREE.Group(); this.mesh.add(this.heroMesh, this.frogMesh);
    this.frogMesh.visible = false;
    G.scene.add(this.mesh);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; G.scene.add(this.shadow);
    const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5); ropeGeo.translate(0, 0.5, 0); ropeGeo.rotateX(Math.PI / 2);
    this.rope = new THREE.Mesh(ropeGeo, new THREE.MeshBasicMaterial({ color: 0x3ad8ff }));
    this.rope.visible = false; G.scene.add(this.rope);

    this.form = 'hero'; this.isPlayer = true;
    this.maxHp = 5; this.hp = 5;
    this.coins = 0; this.relics = 0; this.dna = 0; this.secrets = 0;
    this.has = { grapple: false, djump: false };
    this.reset(G.spawn);
  }
  get F() { return FORMS[this.form]; }
  reset(p) {
    this.x = p.x; this.y = p.y; this.z = p.z;
    this.vx = this.vy = this.vz = 0; this.yaw = Math.PI; this.r = this.F.r; this.h = this.F.h;
    this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.airJumps = 0;
    this.attackT = 0; this.attackActive = false; this.combo = 0; this.comboT = 0;
    this.slamming = false; this.slamHang = 0; this.grapple = null; this.dashT = 0; this.dashCd = 0;
    this.invuln = 0; this.dead = false; this.swimming = false; this.carrying = null; this.tongueT = 0;
    this.t = 0; this.squash = 1; this.jumpHeld = false; this.landT = 0;
  }
  addCoins(n) { this.coins += n; this.G.hud.pop('coins'); }

  setForm(f) {
    if (f === this.form) return;
    if (this.carrying) { this.G.dropCarried(); }
    const prevH = this.h;
    this.form = f; this.r = this.F.r; this.h = this.F.h;
    if (f === 'hero' && prevH < this.h) {
      // make sure we fit
      this.y += 0.05;
    }
    this.heroMesh.visible = f === 'hero'; this.frogMesh.visible = f === 'frog';
    this.G.fx.burst(this.x, this.y + 1, this.z, 0x5aff9a, 30, 7, 0.3, 0.8);
    this.G.sfx.play('shift');
  }

  hurt(n, fx, fz) {
    if (this.invuln > 0 || this.dead || this.G.won) return;
    this.hp -= n; this.invuln = 1.3;
    const dx = this.x - fx, dz = this.z - fz, d = Math.hypot(dx, dz) || 1;
    this.vx = dx / d * 11; this.vz = dz / d * 11; this.vy = 9;
    this.grapple = null; this.slamming = false;
    this.G.sfx.play('hurt'); this.G.shake(0.35);
    this.G.hud.pop('hearts');
    if (this.hp <= 0) this.die();
  }
  die(reason) {
    if (this.dead) return;
    this.dead = true; this.deadT = 1.2;
    this.G.fx.burst(this.x, this.y + 1, this.z, reason === 'lava' ? 0xff6a2a : 0xffffff, 30, 8, 0.35, 1);
    this.G.hud.toast(reason === 'lava' ? 'Toasty! Back to the checkpoint.' : 'Ouch! Back to the checkpoint.', 2);
    this.mesh.visible = false;
    if (this.carrying) this.G.dropCarried(true);
  }

  update(dt, input, camYaw) {
    const G = this.G;
    this.t += dt;
    if (this.dead) {
      this.deadT -= dt;
      if (this.deadT <= 0) {
        const cp = G.checkpoint;
        this.reset({ x: cp.x, y: cp.y + 0.5, z: cp.z });
        this.hp = this.maxHp; this.mesh.visible = true; this.invuln = 1.5;
        if (this.form === 'frog') this.setForm('hero');
      }
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    const F = this.F;

    // --- input to world direction
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = rx * input.move.x - fx * input.move.y;
    let wz = rz * input.move.x - fz * input.move.y;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 0.01) { const l = Math.hypot(wx, wz); wx /= l; wz /= l; }

    const wl = waterLevelAt(this.x, this.z);
    this.swimming = this.y < wl - 0.9 && !this.grapple;

    if (input.pressed.jump) this.jumpBuf = 0.14;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.grounded) { this.coyote = 0.12; this.airJumps = this.has.djump && this.form === 'hero' ? 1 : 0; }
    else this.coyote = Math.max(0, this.coyote - dt);

    // --- form toggle
    if (input.pressed.form) {
      if (this.dna >= 3) this.setForm(this.form === 'hero' ? 'frog' : 'hero');
      else { G.hud.toast(`Need 3 Frog DNA to transform (${this.dna}/3). Punch the blue frogs in the jungle!`, 2.5); G.sfx.play('deny'); }
    }

    // --- grapple
    if (this.grapple) {
      const g = this.grapple;
      const dx = g.x - this.x, dy = g.y - 1 - this.y, dz = g.z - this.z;
      const d = Math.hypot(dx, dy, dz);
      this.grappleT += dt;
      const sp = 36;
      this.vx = dx / d * sp; this.vy = dy / d * sp; this.vz = dz / d * sp;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
      if (Math.hypot(dx, dz) > 0.5) this.yaw = Math.atan2(dx, dz);
      this.rope.visible = true;
      this.rope.position.set(this.x, this.y + 1.3, this.z);
      this.rope.lookAt(g.x, g.y, g.z);
      this.rope.scale.set(1, 1, Math.hypot(g.x - this.x, g.y - this.y - 1.3, g.z - this.z));
      if (d < 1.8 || this.grappleT > 1.6 || input.pressed.jump) {
        const gd = this.grappleDir;
        this.vx = gd.x * 7; this.vz = gd.z * 7; this.vy = 14;
        this.yaw = Math.atan2(gd.x, gd.z);
        this.grapple = null; this.rope.visible = false;
        this.airJumps = this.has.djump && this.form === 'hero' ? 1 : 0;
        G.sfx.play('jump');
      }
      this.grounded = false; this.wasGrounded = false;
      const g2 = H(this.x, this.z);
      if (this.y < g2) this.y = g2;
      this.animate(dt, 0);
      return;
    }

    // --- horizontal movement
    let speed = input.held.sprint ? F.sprint : F.speed;
    if (this.swimming) speed = this.form === 'frog' ? 11 : 6;
    if (this.carrying) speed *= 0.8;
    if (this.attackT > 0 && this.grounded && this.form === 'hero') speed *= 0.35;
    let tvx = wx * speed * mag, tvz = wz * speed * mag;
    if (this.dashT > 0) {
      this.dashT -= dt;
      tvx = Math.sin(this.yaw) * 22; tvz = Math.cos(this.yaw) * 22;
    }
    const acc = (this.grounded || this.swimming ? F.accel : F.air) * dt;
    const airCoast = !this.grounded && !this.swimming && mag < 0.1 && this.dashT <= 0;
    if (airCoast) {
      const k = Math.max(0, 1 - dt * 1.2);
      this.vx *= k; this.vz *= k;
    } else if (this.invuln < 1.0 || this.grounded) {
      const dvx = tvx - this.vx, dvz = tvz - this.vz, dl = Math.hypot(dvx, dvz);
      if (dl <= acc || this.dashT > 0) { this.vx = tvx; this.vz = tvz; }
      else { this.vx += dvx / dl * acc; this.vz += dvz / dl * acc; }
    }
    if (mag > 0.1 && this.attackT <= 0) this.yaw = angLerp(this.yaw, Math.atan2(wx, wz), dt * 14);

    // --- jumping
    if (this.jumpBuf > 0 && !this.slamming) {
      if (this.swimming) {
        this.vy = 11; this.jumpBuf = 0; G.sfx.play('splash');
        G.fx.burst(this.x, wl, this.z, 0xaaddff, 10, 5, 0.25, 0.5);
      } else if (this.coyote > 0) {
        this.vy = F.jump + (input.held.sprint && mag > 0.5 ? 0.8 : 0);
        this.coyote = 0; this.jumpBuf = 0; this.grounded = false; this.wasGrounded = false;
        this.jumpHeld = true; this.squash = 1.3;
        G.sfx.play('jump');
        if (this.form === 'frog') G.fx.burst(this.x, this.y, this.z, 0xffffff, 8, 4, 0.2, 0.4);
      } else if (this.airJumps > 0) {
        this.airJumps--; this.vy = 13.5; this.jumpBuf = 0; this.jumpHeld = true;
        G.sfx.play('djump');
        G.fx.burst(this.x, this.y, this.z, 0xffffff, 10, 4, 0.2, 0.4);
        this.flip = 0.0001;
      }
    }
    if (this.jumpHeld && !input.held.jump) {
      if (this.vy > 4 && this.form === 'hero') this.vy *= 0.55;
      this.jumpHeld = false;
    }

    // --- attacks
    this.attackActive = false;
    if (input.pressed.attack && !this.carrying) {
      // snap to stick direction, then soft-lock the nearest enemy in front
      if (mag > 0.1) this.yaw = Math.atan2(wx, wz);
      const range = this.form === 'frog' ? 7.5 : 3.4, cone = this.form === 'frog' ? 0.7 : 1.5;
      let best = null, bd = range;
      for (const e of G.enemies) {
        if (!e.alive || Math.abs(e.y - this.y) > 2.5) continue;
        const ex = e.x - this.x, ez = e.z - this.z, d = Math.hypot(ex, ez) - e.r * 0.5;
        const da = Math.abs(Math.atan2(Math.sin(Math.atan2(ex, ez) - this.yaw), Math.cos(Math.atan2(ex, ez) - this.yaw)));
        if (d < bd && da < cone) { bd = d; best = e; }
      }
      if (best) this.yaw = Math.atan2(best.x - this.x, best.z - this.z);
    }
    if (input.pressed.attack) {
      if (this.carrying) G.throwCarried();
      else if (this.form === 'frog') {
        if (this.tongueT <= 0) { this.tongueT = 0.35; G.sfx.play('tongue'); this.tongueHit = false; }
      } else if (!this.grounded && !this.swimming && !this.slamming && this.y - H(this.x, this.z) > 1.2) {
        this.slamming = true; this.slamHang = 0.18; this.vx = this.vz = 0; this.vy = 0;
        G.sfx.play('grapple');
      } else if (this.attackT <= 0.1) {
        this.combo = this.comboT > 0 ? (this.combo + 1) % 3 : 0;
        this.comboT = 0.6; this.attackT = this.combo === 2 ? 0.42 : 0.3; this.attackHit = new Set();
        this.vx += Math.sin(this.yaw) * (this.combo === 2 ? 9 : 5); this.vz += Math.cos(this.yaw) * (this.combo === 2 ? 9 : 5);
        G.sfx.play('punch');
      }
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      const span = this.combo === 2 ? 0.42 : 0.3;
      const age = span - this.attackT;
      if (age > 0.05 && age < 0.22) {
        this.attackActive = true; this.attackKind = 'punch';
        const reach = this.combo === 2 ? 1.9 : 1.5;
        const hx = this.x + Math.sin(this.yaw) * reach, hz = this.z + Math.cos(this.yaw) * reach;
        G.hitArea(hx, this.y + 1, hz, this.combo === 2 ? 1.6 : 1.25, this.combo === 2 ? 2 : 1, 'punch', this.attackHit);
      }
    }
    if (this.tongueT > 0) {
      this.tongueT -= dt;
      const ext = Math.sin((1 - this.tongueT / 0.35) * Math.PI) * 7;
      const tg = this.frogMesh.userData.tongue;
      tg.visible = true; tg.scale.set(1, Math.max(0.01, ext), 1);
      const tx = this.x + Math.sin(this.yaw) * ext, tz = this.z + Math.cos(this.yaw) * ext;
      if (!this.tongueHit && ext > 2) {
        this.tongueHit = G.hitArea(tx, this.y + 0.8, tz, 1.2, 1, 'tongue', new Set());
      }
      G.magnet(tx, this.y + 0.8, tz, 2.2);
      if (this.tongueT <= 0) tg.visible = false;
    }

    // --- special: grapple or dash
    if (input.pressed.special) {
      const target = this.has.grapple ? G.grappleTarget : null;
      if (!this.has.grapple && G.grappleTargetAny && !G._grappleHint) {
        G._grappleHint = true;
        G.hud.toast('That blue ring is a grapple point. Find the Grapple Hook blueprint to use it!', 3);
      }
      if (target) {
        this.grapple = target; this.grappleT = 0; this.slamming = false; this.lastGrapple = target;
        const gdx = target.x - this.x, gdz = target.z - this.z, gl = Math.hypot(gdx, gdz);
        this.grappleDir = gl > 0.5 ? { x: gdx / gl, z: gdz / gl } : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
        if (this.carrying) G.dropCarried();
        G.sfx.play('grapple');
      } else if (this.form === 'hero' && this.dashCd <= 0 && !this.swimming) {
        this.dashT = 0.22; this.dashCd = 0.7; G.sfx.play('punch');
        if (!this.grounded) this.vy = Math.max(this.vy, 3);
        G.fx.burst(this.x, this.y + 0.5, this.z, 0xffffff, 6, 3, 0.25, 0.3);
      } else if (this.form === 'frog' && !this.grounded && this.dashCd <= 0) {
        this.vy = Math.max(this.vy, 8); this.dashCd = 1.2; G.sfx.play('djump');
      }
    }

    // --- slam
    if (this.slamming) {
      if (this.slamHang > 0) { this.slamHang -= dt; this.vy = 0; this.vx = this.vz = 0; }
      else { this.vy = -42; this.vx = this.vz = 0; }
    }

    // --- physics
    this.gravScale = this.swimming ? 0.12 : (this.slamming && this.slamHang > 0 ? 0 : 1);
    if (this.swimming) {
      const target = (wl - 0.95 - this.y) * 4;
      this.vy += (target - this.vy) * Math.min(1, dt * 4);
      this.slamming = false;
    }
    const wasGround = this.grounded;
    const prevVy = this.vy;
    this.G.world.move(this, dt, this.carrying ? this.carrying.box : null);
    if (this.grounded && !wasGround) {
      this.landT = 0.15; this.squash = 0.7;
      if (this.slamming) this.onSlamLand();
      else if (prevVy < -14) G.fx.burst(this.x, this.y + 0.1, this.z, 0xd8c8a0, 6, 3, 0.25, 0.4);
    }
    if (this.grounded && this.groundBox && this.groundBox.bounce) { this.vy = this.groundBox.bounce; this.grounded = false; }
    if (this.slamming && this.swimming) this.slamming = false;

    // hazards
    if (isLava(this.x, this.z) && this.y < 0.3 && this.grounded && !this.groundBox) {
      this.die('lava'); return;
    }
    if (this.y < -35) { this.die(); return; }
    const bound = 320;
    const dc = Math.hypot(this.x, this.z);
    if (dc > bound) { this.x *= bound / dc; this.z *= bound / dc; }

    this.animate(dt, Math.hypot(this.vx, this.vz));
  }

  onSlamLand() {
    const G = this.G;
    this.slamming = false;
    G.sfx.play('slam'); G.shake(0.5);
    G.fx.burst(this.x, this.y + 0.2, this.z, 0xd8c8a0, 20, 9, 0.35, 0.6);
    G.hitArea(this.x, this.y + 0.5, this.z, 3.6, 2, 'slam', new Set());
    // breakables under feet
    if (this.groundBox && this.groundBox.slam) G.breakBox(this.groundBox);
    this.vy = 7; this.grounded = false;
  }

  animate(dt, speed) {
    const G = this.G;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this.squash += (1 - this.squash) * Math.min(1, dt * 10);
    const blink = this.invuln > 0 && Math.floor(this.invuln * 15) % 2 === 0;
    this.mesh.visible = !blink && !this.dead;
    const sq = this.squash;
    this.mesh.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (this.form === 'hero') {
      this.landT = Math.max(0, (this.landT || 0) - dt);
      if (this.flip) { this.flip += dt * 14; if (this.flip > 6.28) this.flip = 0; }
      const span = this.combo === 2 ? 0.42 : 0.3;
      animateKong(this.heroMesh.userData.rig, {
        dt, t: this.t, speed: this.grounded ? speed : 0, grounded: this.grounded, vy: this.vy,
        attack: this.attackT > 0 ? 1 - this.attackT / span : -1, combo: this.combo,
        slamming: this.slamming, carrying: !!this.carrying, grapple: !!this.grapple, swimming: this.swimming,
        dash: this.dashT > 0, flip: this.flip || (this.slamming && this.slamHang > 0 ? 6.28 * (0.18 - this.slamHang) / 0.18 : 0),
        landing: this.landT > 0 ? (this.landT / 0.15) * 0.18 : 0,
      });
    } else {
      const u = this.frogMesh.userData;
      u.body.rotation.x = this.grounded ? 0 : -Math.max(-0.6, Math.min(0.6, this.vy * 0.04));
      u.body.scale.set(1, this.grounded ? 1 + Math.sin(this.t * 3) * 0.03 : 1.25, 1);
    }
    // blob shadow
    const g = G.world.groundAt(this.x, this.z, this.y + 0.1, 0.3).g;
    const hgt = this.y - g;
    this.shadow.position.set(this.x, g + 0.06, this.z);
    const ss = Math.max(0.3, 1 - hgt * 0.04);
    this.shadow.scale.setScalar(ss * (this.form === 'frog' ? 1.3 : 1));
    this.shadow.visible = !this.dead && hgt < 30;
  }
}
