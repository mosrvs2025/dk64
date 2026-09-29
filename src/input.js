// Unified input: keyboard + mouse, gamepad, and touch (virtual joystick + buttons).
const ACTIONS = ['jump', 'attack', 'special', 'interact', 'form', 'pause', 'sprint'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.held = {}; this.pressed = {};
    this._queued = {};
    for (const a of ACTIONS) { this.held[a] = false; this.pressed[a] = false; this._queued[a] = false; }
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.usedTouch = false;
    this.cameraDragging = false;
    this.mouseLocked = false;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.camTouch = { id: null, lx: 0, ly: 0 };
    this._touchHeld = {};
    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    const map = {
      Space: 'jump', KeyZ: 'attack', KeyJ: 'attack', KeyX: 'special', KeyK: 'special',
      KeyE: 'interact', KeyQ: 'form', KeyF: 'form', Escape: 'pause', KeyP: 'pause',
      ShiftLeft: 'sprint', ShiftRight: 'sprint',
    };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = map[e.code];
      if (a) { this._queued[a] = true; e.preventDefault(); }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this._keyMap = map;
  }

  _bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (this.usedTouch) return;
      if (document.pointerLockElement !== c) {
        c.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this._queued.attack = true;
      if (e.button === 2) this._queued.special = true;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === c;
    });
    addEventListener('mousemove', (e) => {
      if (this.mouseLocked) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
  }

  _bindTouch() {
    const c = this.canvas;
    const opts = { passive: false };
    c.addEventListener('touchstart', (e) => {
      this.usedTouch = true;
      document.body.classList.add('touch');
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.stick.id === null) {
          this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          this._showStick(t.clientX, t.clientY, 0, 0);
        } else if (this.camTouch.id === null) {
          this.camTouch = { id: t.identifier, lx: t.clientX, ly: t.clientY };
        }
      }
      e.preventDefault();
    }, opts);
    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
          const R = 55, d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          this.stick.x = dx / R; this.stick.y = dy / R;
          this._showStick(this.stick.ox, this.stick.oy, dx, dy);
        } else if (t.identifier === this.camTouch.id) {
          this.look.x += (t.clientX - this.camTouch.lx) * 1.6;
          this.look.y += (t.clientY - this.camTouch.ly) * 1.6;
          this.camTouch.lx = t.clientX; this.camTouch.ly = t.clientY;
          this.cameraDragging = true;
        }
      }
      e.preventDefault();
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) {
          this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
          this._hideStick();
        } else if (t.identifier === this.camTouch.id) {
          this.camTouch = { id: null }; this.cameraDragging = false;
        }
      }
    };
    c.addEventListener('touchend', end);
    c.addEventListener('touchcancel', end);

    // on-screen buttons
    document.querySelectorAll('[data-action]').forEach((btn) => {
      const a = btn.dataset.action;
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        this.usedTouch = true; document.body.classList.add('touch');
        this._queued[a] = true; this._touchHeld[a] = true; btn.classList.add('down');
      };
      const up = (e) => { e.preventDefault(); this._touchHeld[a] = false; btn.classList.remove('down'); };
      btn.addEventListener('touchstart', down, opts);
      btn.addEventListener('touchend', up, opts);
      btn.addEventListener('touchcancel', up, opts);
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    });
    if (this.touch) document.body.classList.add('touch');
  }

  _showStick(ox, oy, dx, dy) {
    const base = document.getElementById('stick'), knob = document.getElementById('knob');
    if (!base) return;
    base.style.display = 'block';
    base.style.left = ox - 60 + 'px'; base.style.top = oy - 60 + 'px';
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  _hideStick() {
    const base = document.getElementById('stick');
    if (base) base.style.display = 'none';
  }

  // Called once per frame before game update.
  poll() {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    const held = {
      jump: k.has('Space'), attack: k.has('KeyZ') || k.has('KeyJ'), special: k.has('KeyX') || k.has('KeyK'),
      interact: k.has('KeyE'), form: false, pause: false, sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
    if (this.stick.id !== null) {
      mx = this.stick.x; my = this.stick.y;
      if (Math.hypot(mx, my) > 0.92) held.sprint = true;
    }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      if (dz(p.axes[0]) || dz(p.axes[1])) { mx = dz(p.axes[0]); my = dz(p.axes[1]); }
      this.look.x += dz(p.axes[2] ?? 0) * 14; this.look.y += dz(p.axes[3] ?? 0) * 10;
      const b = (i) => p.buttons[i]?.pressed;
      const pad = { jump: b(0), attack: b(2), special: b(1) || b(7), interact: b(3), form: b(4) || b(5), pause: b(9), sprint: b(6) || b(10) };
      this._padPrev = this._padPrev || {};
      for (const a of ACTIONS) {
        if (pad[a]) { held[a] = true; if (!this._padPrev[a]) this._queued[a] = true; }
        this._padPrev[a] = pad[a];
      }
    }
    for (const a of ACTIONS) if (this._touchHeld[a]) held[a] = true;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.move.x = mx; this.move.y = my;
    for (const a of ACTIONS) {
      this.held[a] = held[a] || false;
      this.pressed[a] = this._queued[a];
      this._queued[a] = false;
    }
  }
  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0; this.look.y = 0;
    return l;
  }
  // test hook
  inject(action) { this._queued[action] = true; }
}
