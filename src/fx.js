import * as THREE from 'three';

// ---------------- Audio: tiny WebAudio synth ----------------
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
  }
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0, delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.3, lp = 800) {
    const c = this.ctx; if (!c || this.muted) return;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start();
  }
  play(name) {
    switch (name) {
      case 'jump': this.tone(300, 0.15, 'square', 0.06, 300); break;
      case 'djump': this.tone(450, 0.15, 'square', 0.06, 450); break;
      case 'coin': this.tone(988, 0.07, 'square', 0.05); this.tone(1319, 0.12, 'square', 0.05, 0, 0.06); break;
      case 'relic': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.12, 0, i * 0.11)); break;
      case 'big': [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, 0, i * 0.1)); break;
      case 'hit': this.tone(160, 0.12, 'sawtooth', 0.12, -80); this.noise(0.08, 0.15, 2000); break;
      case 'hurt': this.tone(220, 0.3, 'sawtooth', 0.14, -150); break;
      case 'punch': this.noise(0.07, 0.2, 1200); break;
      case 'slam': this.noise(0.3, 0.4, 400); this.tone(80, 0.3, 'sine', 0.3, -40); break;
      case 'boom': this.noise(0.7, 0.6, 500); this.tone(60, 0.5, 'sine', 0.4, -30); break;
      case 'break': this.noise(0.35, 0.35, 1500); break;
      case 'grapple': this.tone(700, 0.2, 'sawtooth', 0.05, -400); break;
      case 'secret': [659, 622, 523, 440, 415, 659, 831, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.05, 0, i * 0.08)); break;
      case 'shift': this.tone(200, 0.4, 'sine', 0.15, 600); break;
      case 'splash': this.noise(0.3, 0.2, 900); break;
      case 'buy': this.tone(880, 0.1, 'square', 0.06); this.tone(1760, 0.2, 'square', 0.06, 0, 0.08); break;
      case 'deny': this.tone(150, 0.2, 'square', 0.08); break;
      case 'check': this.tone(523, 0.1, 'triangle', 0.1); this.tone(784, 0.2, 'triangle', 0.1, 0, 0.1); break;
      case 'tongue': this.tone(400, 0.1, 'sine', 0.1, 400); break;
    }
  }
}

// ---------------- Particles ----------------
export class Particles {
  constructor(scene, max = 260) {
    this.max = max;
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0 });
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._e = new THREE.Euler(); this._c = new THREE.Color();
    this.cursor = 0;
  }
  burst(x, y, z, color, n = 12, speed = 6, size = 0.3, life = 0.8, grav = 18) {
    for (let i = 0; i < n; i++) {
      const idx = this.cursor, p = this.items[idx]; this.cursor = (idx + 1) % this.max;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      p.x = x; p.y = y; p.z = z;
      const sp = speed * (0.4 + Math.random() * 0.6);
      p.vx = Math.cos(a) * s * sp; p.vy = Math.abs(u) * sp + speed * 0.3; p.vz = Math.sin(a) * s * sp;
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.size = size; p.grav = grav;
      p.rot = Math.random() * 6;
      this.mesh.setColorAt(idx, this._c.set(color));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += dt * 5;
        const k = Math.max(0, p.life / p.max) * p.size;
        this._s.set(k, k, k);
        this._q.setFromEuler(this._e.set(p.rot, p.rot * 0.7, 0));
        this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s);
      } else {
        this._m.makeScale(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
