// DOM-based HUD.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hearts: $('hearts'), coins: $('coins'), relics: $('relics'), dna: $('dna'), secrets: $('secrets'),
      toast: $('toast'), prompt: $('prompt'), boss: $('boss'), bossName: $('bossName'), bossFill: $('bossFill'),
      reticle: $('reticle'), abilities: $('abilities'), zone: $('zone'), btnUse: $('btnUse'), btnForm: $('btnForm'),
    };
    this.toastT = 0; this.zoneT = 0; this.last = {};
  }
  update(p, dt, G) {
    const hearts = '❤'.repeat(Math.max(0, p.hp)) + '<span class="empty">' + '❤'.repeat(Math.max(0, p.maxHp - p.hp)) + '</span>';
    this.set('hearts', hearts);
    this.set('coins', String(p.coins));
    this.set('relics', `${p.relics}/12`);
    this.set('dna', `${p.dna}/3`);
    this.set('secrets', `${p.secrets}/${G.level.chests.length}`);
    const ab = [];
    if (p.has.grapple) ab.push('<span title="Grapple (X / Right-click)">🪝</span>');
    if (p.has.djump) ab.push('<span title="Double jump">⤊</span>');
    if (p.dna >= 3) ab.push(`<span title="Frog form (Q)">${p.form === 'frog' ? '🐸' : '🦍'}</span>`);
    this.set('abilities', ab.join(''));
    this.el.btnForm.style.display = p.dna >= 3 ? '' : 'none';
    this.el.btnForm.textContent = p.form === 'frog' ? '🦍' : '🐸';
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.el.toast.classList.remove('show');
    }
    if (this.zoneT > 0) { this.zoneT -= dt; if (this.zoneT <= 0) this.el.zone.classList.remove('show'); }
  }
  set(k, v) {
    if (this.last[k] === v) return;
    this.last[k] = v; this.el[k].innerHTML = v;
  }
  pop(k) {
    const e = this.el[k]?.parentElement || this.el[k];
    if (!e) return;
    e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
  }
  toast(msg, t = 2.5) {
    this.el.toast.innerHTML = msg; this.el.toast.classList.add('show'); this.toastT = t;
  }
  zone(name) {
    this.el.zone.textContent = name; this.el.zone.classList.add('show'); this.zoneT = 2.5;
  }
  prompt(text) {
    if (this.last.prompt === text) return;
    this.last.prompt = text;
    this.el.prompt.textContent = text || '';
    this.el.prompt.style.display = text ? 'block' : 'none';
    this.el.btnUse.classList.toggle('hot', !!text);
  }
  boss(show, name, frac) {
    this.el.boss.style.display = show ? 'block' : 'none';
    if (show) { this.el.bossName.textContent = name; this.el.bossFill.style.width = (frac * 100).toFixed(1) + '%'; }
  }
  reticle(x, y, show) {
    const r = this.el.reticle;
    r.style.display = show ? 'block' : 'none';
    if (show) r.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  }
}
