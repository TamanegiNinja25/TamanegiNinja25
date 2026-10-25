// In-game HUD: vitals, EXP, minimap, quest tracker, boss bar and touch controls.
import type { Game } from '../Game';
import type { Enemy } from '../entities/Enemy';
import { el, formatNum } from '../core/util';
import { skillIcon, itemIcon } from './Icons';
import { SKILLS } from '../rpg/skills';
import { ITEMS } from '../rpg/items';
import { expToNext, CLASSES } from '../rpg/classes';
import { GRADE_NAME } from '../rpg/enemies';
import { Action } from '../core/Input';

export class Hud {
  root: HTMLDivElement;
  private hpFill!: HTMLDivElement; private hpText!: HTMLDivElement; private hpLag!: HTMLDivElement;
  private ceFill!: HTMLDivElement; private ceText!: HTMLDivElement;
  private domFill!: HTMLDivElement; private domWrap!: HTMLDivElement;
  private expFill!: HTMLDivElement; private expText!: HTMLDivElement;
  private lvl!: HTMLDivElement; private portrait!: HTMLDivElement; private nameEl!: HTMLDivElement;
  private gold!: HTMLDivElement;
  private tracker!: HTMLDivElement; private trackerName!: HTMLDivElement; private trackerText!: HTMLDivElement;
  private mm!: HTMLCanvasElement; private mmCtx!: CanvasRenderingContext2D;
  private mmBg: HTMLCanvasElement | null = null;
  private bossWrap!: HTMLDivElement; private bossFill!: HTMLDivElement; private bossLag!: HTMLDivElement; private bossName!: HTMLDivElement;
  private boss: Enemy | null = null;
  private skillBtns: { el: HTMLDivElement; cd: HTMLDivElement; icon: HTMLDivElement; id: string | null; cost: HTMLDivElement }[] = [];
  private potBtns: { el: HTMLDivElement; icon: HTMLDivElement; count: HTMLDivElement; id: string | null }[] = [];
  private attackBtn!: HTMLDivElement; private attackLabel!: HTMLDivElement;
  private ultBtn!: HTMLDivElement;
  private dodgeBtn!: HTMLDivElement; private dodgeCd!: HTMLDivElement;
  private statDot!: HTMLDivElement;
  private hpLagV = 1;
  private bossLagV = 1;
  private lastTrack = '';
  private lastPortrait = '';
  private mmTimer = 0;

  constructor(private game: Game, parent: HTMLElement) {
    this.root = el('div', 'hud');
    parent.appendChild(this.root);
    this.buildVitals();
    this.buildTopRight();
    this.buildBoss();
    this.buildControls();
    const exp = el('div', 'exp-bar');
    this.expFill = el('div', 'exp-fill');
    this.expText = el('div', 'exp-text');
    exp.append(this.expFill, this.expText);
    this.root.appendChild(exp);
  }

  private buildVitals() {
    const v = el('div', 'vitals');
    this.portrait = el('div', 'hud-portrait');
    this.lvl = el('div', 'hud-lvl', '1');
    this.statDot = el('div', 'hud-dot');
    this.portrait.append(this.lvl, this.statDot);
    this.portrait.addEventListener('click', () => this.game.ui.openMenu('status'));
    const bars = el('div', 'bars');
    this.nameEl = el('div', 'hud-name');
    const hp = el('div', 'bar hp');
    this.hpLag = el('div', 'bar-lag');
    this.hpFill = el('div', 'bar-fill');
    this.hpText = el('div', 'bar-text');
    hp.append(this.hpLag, this.hpFill, this.hpText);
    const ce = el('div', 'bar ce');
    this.ceFill = el('div', 'bar-fill');
    this.ceText = el('div', 'bar-text');
    ce.append(this.ceFill, this.ceText);
    this.domWrap = el('div', 'bar dom');
    this.domFill = el('div', 'bar-fill');
    this.domWrap.append(this.domFill, el('div', 'bar-label', 'DOMAIN'));
    bars.append(this.nameEl, hp, ce, this.domWrap);
    v.append(this.portrait, bars);
    this.root.appendChild(v);
  }

  private buildTopRight() {
    const tr = el('div', 'top-right');
    const row = el('div', 'menu-row');
    const mk = (label: string, tab: string, title: string) => {
      const b = el('button', 'hud-btn', label);
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.game.ui.openMenu(tab); });
      return b;
    };
    row.append(mk('☰', 'system', 'Menu'), mk('袋', 'bag', 'Bag'), mk('術', 'skills', 'Skills'), mk('任', 'quests', 'Quests'));
    const mmWrap = el('div', 'minimap');
    this.mm = el('canvas');
    this.mm.width = this.mm.height = 220;
    this.mmCtx = this.mm.getContext('2d')!;
    mmWrap.appendChild(this.mm);
    mmWrap.addEventListener('click', () => this.game.ui.openMenu('map'));
    this.gold = el('div', 'gold', '¥0');
    this.tracker = el('div', 'tracker');
    this.trackerName = el('div', 'tracker-name');
    this.trackerText = el('div', 'tracker-text');
    this.tracker.append(this.trackerName, this.trackerText);
    this.tracker.addEventListener('click', () => this.game.ui.openMenu('quests'));
    tr.append(row, mmWrap, this.gold, this.tracker);
    this.root.appendChild(tr);
  }

  private buildBoss() {
    this.bossWrap = el('div', 'boss-bar hidden');
    this.bossName = el('div', 'boss-name');
    const bar = el('div', 'boss-track');
    this.bossLag = el('div', 'boss-lag');
    this.bossFill = el('div', 'boss-fill');
    bar.append(this.bossLag, this.bossFill);
    this.bossWrap.append(this.bossName, bar);
    this.root.appendChild(this.bossWrap);
  }

  private buildControls() {
    const inp = this.game.input;
    const zone = el('div', 'joy-zone');
    const base = el('div', 'joy-base');
    const knob = el('div', 'joy-knob');
    base.appendChild(knob);
    this.root.append(zone, base);
    inp.bindJoystick(zone, base, knob);

    const cluster = el('div', 'actions');
    this.attackBtn = el('div', 'act attack');
    this.attackLabel = el('div', 'act-label', '攻');
    this.attackBtn.appendChild(this.attackLabel);
    inp.bindButton(this.attackBtn, 'attack');
    cluster.appendChild(this.attackBtn);
    const slots: Action[] = ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'];
    slots.forEach((a, i) => {
      const b = el('div', `act skill s${i + 1}`);
      const icon = el('div', 'act-icon');
      const cd = el('div', 'act-cd');
      const cost = el('div', 'act-cost');
      b.append(icon, cd, cost);
      inp.bindButton(b, a);
      cluster.appendChild(b);
      this.skillBtns.push({ el: b, cd, icon, id: null, cost });
    });
    this.ultBtn = el('div', 'act ult');
    const ui = el('div', 'act-icon');
    const ucd = el('div', 'act-cd');
    this.ultBtn.append(ui, ucd, el('div', 'act-cost'));
    inp.bindButton(this.ultBtn, 'ultimate');
    cluster.appendChild(this.ultBtn);
    this.skillBtns.push({ el: this.ultBtn, cd: ucd, icon: ui, id: null, cost: this.ultBtn.lastChild as HTMLDivElement });
    this.dodgeBtn = el('div', 'act dodge', '<span>回避</span>');
    this.dodgeCd = el('div', 'act-cd');
    this.dodgeBtn.appendChild(this.dodgeCd);
    inp.bindButton(this.dodgeBtn, 'dash');
    cluster.appendChild(this.dodgeBtn);
    (['potion1', 'potion2'] as Action[]).forEach((a, i) => {
      const b = el('div', `act potion p${i + 1}`);
      const icon = el('div', 'act-icon');
      const count = el('div', 'pot-count');
      b.append(icon, count);
      inp.bindButton(b, a);
      cluster.appendChild(b);
      this.potBtns.push({ el: b, icon, count, id: null });
    });
    this.root.appendChild(cluster);
  }

  setBoss(e: Enemy | null) {
    this.boss = e;
    this.bossWrap.classList.toggle('hidden', !e);
    if (e) {
      this.bossName.innerHTML = `<span class="grade" style="color:${e.gradeColor}">${GRADE_NAME[e.d.grade]}</span> ${e.d.name} <span class="lv">Lv ${e.level}</span>`;
      this.bossLagV = 1;
    }
  }

  flashSkill(id: string) {
    const b = this.skillBtns.find(s => s.id === id);
    if (!b) return;
    b.el.classList.remove('flash');
    void b.el.offsetWidth;
    b.el.classList.add('flash');
  }

  /** Paint the static minimap background once per map. */
  buildMinimap() {
    const w = this.game.world;
    const [W, D] = w.mapDef.size;
    const S = 4; // px per unit
    const c = document.createElement('canvas');
    c.width = W * S; c.height = D * S;
    const x = c.getContext('2d')!;
    const sp = w.map.splat;
    const night = w.mapDef.night;
    const palette = [[60, 90, 50], [130, 128, 120], [120, 100, 74], [70, 70, 78]];
    const img = x.createImageData(c.width, c.height);
    for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
      const u = px / c.width, v = py / c.height;
      const tx = Math.floor(u * sp.size * (W / sp.width)), ty = Math.floor(v * sp.size * (D / sp.depth));
      const i = (Math.min(sp.size - 1, ty) * sp.size + Math.min(sp.size - 1, tx)) * 4;
      let r = 0, g = 0, b = 0;
      for (let ch = 0; ch < 4; ch++) { const wgt = sp.data[i + ch]; r += palette[ch][0] * wgt; g += palette[ch][1] * wgt; b += palette[ch][2] * wgt; }
      const k = night ? 0.65 : 1;
      const o = (py * c.width + px) * 4;
      img.data[o] = r * k; img.data[o + 1] = g * k; img.data[o + 2] = b * k; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.fillStyle = 'rgba(20,16,30,0.85)';
    for (const col of w.col.all) {
      if (col.kind === 'box') {
        const bw = (col.x1 - col.x0), bd = (col.z1 - col.z0);
        if (bw * bd < 1.5) continue;
        x.fillRect((col.x0 + W / 2) * S, (col.z0 + D / 2) * S, bw * S, bd * S);
      }
    }
    x.fillStyle = 'rgba(60,140,220,0.9)';
    for (const wt of w.map.water) x.fillRect((wt.x - wt.w / 2 + W / 2) * S, (wt.z - wt.d / 2 + D / 2) * S, wt.w * S, wt.d * S);
    this.mmBg = c;
  }

  private drawMinimap() {
    const w = this.game.world;
    if (!this.mmBg || !w.mapDef) return;
    const x = this.mmCtx;
    const N = this.mm.width;
    const [W, D] = w.mapDef.size;
    const S = 4;
    const view = 26; // world units across
    const scale = N / view;
    const p = w.player;
    x.clearRect(0, 0, N, N);
    x.save();
    x.beginPath(); x.arc(N / 2, N / 2, N / 2 - 2, 0, Math.PI * 2); x.clip();
    x.fillStyle = '#0a0812'; x.fillRect(0, 0, N, N);
    const sx = (p.x + W / 2 - view / 2) * S, sz = (p.z + D / 2 - view / 2) * S;
    x.imageSmoothingEnabled = true;
    x.drawImage(this.mmBg, sx, sz, view * S, view * S, 0, 0, N, N);
    const toM = (wx: number, wz: number) => [N / 2 + (wx - p.x) * scale, N / 2 + (wz - p.z) * scale];
    for (const po of w.portals) { const [mx, my] = toM(po.d.x, po.d.z); x.fillStyle = '#b08aff'; x.beginPath(); x.arc(mx, my, 6, 0, Math.PI * 2); x.fill(); }
    for (const n of w.npcs) {
      const [mx, my] = toM(n.x, n.z);
      const mk = w.npcMarker(n.id, n.d.shop);
      x.fillStyle = mk === '!' ? '#ffd23a' : mk === '?' ? '#7affb0' : '#e8e8ff';
      x.beginPath(); x.arc(mx, my, mk === '!' || mk === '?' ? 6 : 4, 0, Math.PI * 2); x.fill();
    }
    for (const e of w.enemies) {
      if (!e.alive) continue;
      const [mx, my] = toM(e.x, e.z);
      if (mx < -10 || my < -10 || mx > N + 10 || my > N + 10) continue;
      x.fillStyle = e.isBoss ? '#ff2a3a' : e.d.grade <= 1 ? '#ff9a3a' : '#ff5a6a';
      x.beginPath(); x.arc(mx, my, e.isBoss ? 8 : 4, 0, Math.PI * 2); x.fill();
    }
    for (const b of w.map.bosses) {
      const [mx, my] = toM(b.x, b.z);
      x.strokeStyle = 'rgba(255,60,80,0.7)'; x.lineWidth = 2;
      x.beginPath(); x.arc(mx, my, b.r * scale, 0, Math.PI * 2); x.stroke();
    }
    // player arrow
    x.translate(N / 2, N / 2);
    x.rotate(-p.facing + Math.PI);
    x.fillStyle = '#ffffff';
    x.strokeStyle = '#000'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -11); x.lineTo(8, 9); x.lineTo(0, 4); x.lineTo(-8, 9); x.closePath(); x.fill(); x.stroke();
    x.restore();
    x.strokeStyle = 'rgba(200,180,255,0.6)'; x.lineWidth = 4;
    x.beginPath(); x.arc(N / 2, N / 2, N / 2 - 3, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center';
    x.fillText('N', N / 2, 22);
  }

  update(dt: number) {
    const g = this.game;
    const ps = g.ps;
    const w = g.world;
    if (!ps || !w.player) return;
    const st = ps.stats;
    const d = ps.d;
    const hpK = Math.max(0, d.hp / st.maxHp);
    this.hpFill.style.width = (hpK * 100).toFixed(1) + '%';
    this.hpLagV = this.hpLagV > hpK ? Math.max(hpK, this.hpLagV - dt * 0.6) : hpK;
    this.hpLag.style.width = (this.hpLagV * 100).toFixed(1) + '%';
    this.hpText.textContent = `${Math.ceil(d.hp)} / ${st.maxHp}`;
    this.root.classList.toggle('low-hp', hpK < 0.25);
    this.ceFill.style.width = (Math.max(0, d.ce / st.maxCe) * 100).toFixed(1) + '%';
    this.ceText.textContent = `${Math.floor(d.ce)} / ${st.maxCe}`;
    this.domFill.style.width = d.domain.toFixed(1) + '%';
    this.domWrap.classList.toggle('full', d.domain >= 100);
    const need = expToNext(d.level);
    this.expFill.style.width = (d.level >= 50 ? 100 : d.exp / need * 100).toFixed(2) + '%';
    this.expText.textContent = d.level >= 50 ? 'MAX' : `EXP ${(d.exp / need * 100).toFixed(1)}%`;
    this.lvl.textContent = String(d.level);
    this.statDot.style.display = d.statPoints > 0 || d.skillPoints > 0 ? 'block' : 'none';
    const pid = CLASSES[d.cls].model;
    if (this.lastPortrait !== pid) { this.lastPortrait = pid; this.portrait.style.backgroundImage = `url(${g.portraits.get(pid)})`; this.nameEl.textContent = CLASSES[d.cls].name; }
    this.gold.textContent = '¥' + formatNum(d.gold);
    const tr = ps.trackerText();
    const key = tr ? tr.name + tr.text + tr.ready : '';
    if (key !== this.lastTrack) {
      this.lastTrack = key;
      this.tracker.style.display = tr ? '' : 'none';
      if (tr) { this.trackerName.textContent = tr.name; this.trackerText.textContent = tr.text; this.tracker.classList.toggle('ready', tr.ready); }
    }
    // skills
    const p = w.player;
    this.skillBtns.forEach((b, i) => {
      const id = d.quick[i];
      if (b.id !== id) {
        b.id = id;
        b.icon.style.backgroundImage = id ? `url(${skillIcon(id)})` : '';
        b.el.classList.toggle('empty', !id);
      }
      if (!id) return;
      const s = SKILLS[id];
      const lv = ps.skillLevel(id);
      const cdMax = (s.cd?.(lv) ?? 1) * (1 - st.cdr);
      const cd = p.skillCd(id);
      b.cd.style.setProperty('--p', cd > 0 ? String(cd / cdMax) : '0');
      b.cd.textContent = cd > 0 ? (cd < 10 ? cd.toFixed(1) : String(Math.ceil(cd))) : '';
      const cost = s.ce?.(lv) ?? 0;
      const ult = s.type === 'ultimate';
      b.el.classList.toggle('nope', ult ? d.domain < 100 : d.ce < cost);
      b.cost.textContent = ult ? (d.domain >= 100 ? 'READY' : Math.floor(d.domain) + '%') : String(cost);
      if (ult) b.el.classList.toggle('ready', d.domain >= 100 && cd <= 0);
    });
    this.dodgeCd.style.setProperty('--p', p.dodgeCd > 0 ? String(p.dodgeCd / 1.1) : '0');
    this.potBtns.forEach((b, i) => {
      const id = d.potions[i];
      if (b.id !== id) { b.id = id; b.icon.style.backgroundImage = id ? `url(${itemIcon(ITEMS[id].icon)})` : ''; }
      const n = id ? ps.countItem(id) : 0;
      b.count.textContent = id ? String(n) : '';
      b.el.classList.toggle('nope', n <= 0);
    });
    // talk prompt
    const npc = w.interactableNear();
    const talk = !!npc && !w.nearestTarget('enemy', p.x, p.z, 5);
    this.attackBtn.classList.toggle('talk', talk);
    this.attackLabel.textContent = talk ? '話' : '攻';
    // boss
    if (this.boss) {
      const k = Math.max(0, this.boss.hp / this.boss.maxHp);
      this.bossFill.style.width = (k * 100).toFixed(2) + '%';
      this.bossLagV = this.bossLagV > k ? Math.max(k, this.bossLagV - dt * 0.3) : k;
      this.bossLag.style.width = (this.bossLagV * 100).toFixed(2) + '%';
      if (!this.boss.alive) this.setBoss(null);
    }
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) { this.mmTimer = 1 / 20; this.drawMinimap(); }
  }
}
