// UI orchestration: HUD, menus, toasts, banners, title / class select, death screen.
import type { Game } from '../Game';
import { Hud } from './Hud';
import { Menus } from './Menus';
import { el, escapeHtml, formatNum } from '../core/util';
import { itemIcon } from './Icons';
import { IconSpec } from '../rpg/items';
import { CLASSES } from '../rpg/classes';
import { ClassId } from '../rpg/types';
import { PlayerState } from '../rpg/PlayerState';
import { MAPS } from '../world/maps';
import { audio } from '../audio/Audio';

export class UI {
  root: HTMLElement;
  hud: Hud | null = null;
  menus: Menus;
  private toasts: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private mapBannerEl: HTMLDivElement;
  private fade: HTMLDivElement;
  private titleEl: HTMLDivElement | null = null;
  private deathEl: HTMLDivElement | null = null;

  constructor(private game: Game) {
    this.root = document.getElementById('ui')!;
    this.toasts = el('div', 'toasts');
    this.bannerEl = el('div', 'banner hidden');
    this.mapBannerEl = el('div', 'map-banner hidden');
    this.fade = el('div', 'fade');
    this.menus = new Menus(game, this.root);
    this.root.append(this.toasts, this.bannerEl, this.mapBannerEl, this.fade);
  }

  createHud() {
    if (!this.hud) this.hud = new Hud(this.game, this.root);
    this.hud.root.classList.remove('hidden');
    this.root.insertBefore(this.hud.root, this.root.firstChild);
  }
  hideHud() { this.hud?.root.classList.add('hidden'); }

  openMenu(tab: string) {
    if (this.game.state !== 'play') return;
    audio.play('open');
    this.menus.show(tab);
  }

  toast(msg: string, kind: 'info' | 'warn' | 'good' | 'item' | 'boss' | 'quest' = 'info', dur = 2, color?: string, icon?: IconSpec) {
    const t = el('div', `toast ${kind}`);
    t.innerHTML = `${icon ? `<img src="${itemIcon(icon, 48)}">` : ''}<span ${color ? `style="color:${color}"` : ''}>${escapeHtml(msg)}</span>`;
    this.toasts.appendChild(t);
    while (this.toasts.childElementCount > 5) this.toasts.firstChild!.remove();
    setTimeout(() => t.classList.add('out'), dur * 1000);
    setTimeout(() => t.remove(), dur * 1000 + 500);
  }

  banner(top: string, main: string, color = '#ff3a4a', dur = 2.6) {
    const b = this.bannerEl;
    b.innerHTML = `<div class="b-top" style="color:${color}">${escapeHtml(top)}</div><div class="b-main">${escapeHtml(main)}</div><div class="b-line" style="background:${color}"></div>`;
    b.classList.remove('hidden', 'show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout((b as any)._t);
    (b as any)._t = setTimeout(() => b.classList.add('hidden'), dur * 1000);
  }

  mapBanner(name: string, jp: string) {
    if (this.game.state === 'title') return;
    const b = this.mapBannerEl;
    b.innerHTML = `<div class="mb-jp">${escapeHtml(jp)}</div><div class="mb-name">${escapeHtml(name)}</div>`;
    b.classList.remove('hidden', 'show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout((b as any)._t);
    (b as any)._t = setTimeout(() => b.classList.add('hidden'), 3200);
    this.hud?.buildMinimap();
  }

  async fadeOut(ms = 350) { this.fade.style.transition = `opacity ${ms}ms`; this.fade.style.opacity = '1'; await wait(ms); }
  async fadeIn(ms = 450) { this.fade.style.transition = `opacity ${ms}ms`; this.fade.style.opacity = '0'; await wait(ms); }

  levelUp(lv: number) {
    this.banner('LEVEL UP', `Level ${lv}`, '#ffd23a', 2.2);
    this.toast('+5 stat points, +1 skill point', 'good', 2.5);
  }

  // ------------------------------------------------------------------
  // Death
  // ------------------------------------------------------------------
  showDeath(canHub: boolean) {
    this.deathEl?.remove();
    const d = el('div', 'death');
    d.innerHTML = `<div class="death-k">敗</div><div class="death-t">YOU HAVE FALLEN</div><div class="death-s">Your cursed energy flickers out… for now.</div>
      <div class="death-btns"><button class="btn primary" data-r="here">Revive at area entrance</button>${canHub ? '<button class="btn" data-r="hub">Return to Jujutsu High</button>' : ''}</div>
      <div class="death-p">Reviving costs 10% of your yen.</div>`;
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
      if (!b) return;
      d.remove();
      this.deathEl = null;
      this.game.revive(b.dataset.r === 'hub');
    });
    this.root.appendChild(d);
    this.deathEl = d;
  }

  // ------------------------------------------------------------------
  // Title flow
  // ------------------------------------------------------------------
  showTitle() {
    this.hideHud();
    this.titleEl?.remove();
    const t = el('div', 'title');
    this.titleEl = t;
    this.root.appendChild(t);
    this.titleMain();
  }

  hideTitle() { this.titleEl?.remove(); this.titleEl = null; }

  private logo() {
    return `<div class="logo"><div class="logo-jp">呪術年代記</div><div class="logo-en">CURSED <span>CHRONICLES</span></div><div class="logo-sub">A Jujutsu Kaisen fan RPG</div></div>`;
  }

  private titleMain() {
    const t = this.titleEl!;
    const slots = [0, 1, 2].map(i => PlayerState.peek(i));
    const latest = slots.map((s, i) => ({ s, i })).filter(x => x.s).sort((a, b) => (b.s!.savedAt ?? 0) - (a.s!.savedAt ?? 0))[0];
    t.innerHTML = `${this.logo()}
      <div class="title-menu">
        ${latest ? `<button class="tbtn primary" data-a="continue">Continue <small>${CLASSES[latest.s!.cls].name} · Lv ${latest.s!.level}</small></button>` : ''}
        <button class="tbtn ${latest ? '' : 'primary'}" data-a="new">New Game</button>
        ${latest ? '<button class="tbtn" data-a="load">Load Game</button>' : ''}
        <button class="tbtn" data-a="settings">Settings</button>
      </div>
      <div class="title-foot">Unofficial fan game · Not affiliated with Gege Akutami, Shueisha or MAPPA</div>`;
    t.onclick = (e) => {
      const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!b) return;
      audio.play('click');
      const a = b.dataset.a;
      if (a === 'continue' && latest) this.game.loadGame(latest.i);
      if (a === 'new') this.slotSelect('new');
      if (a === 'load') this.slotSelect('load');
      if (a === 'settings') this.titleSettings();
    };
  }

  private slotSelect(mode: 'new' | 'load') {
    const t = this.titleEl!;
    const rows = [0, 1, 2].map(i => {
      const s = PlayerState.peek(i);
      if (!s) return `<div class="slot ${mode === 'load' ? 'disabled' : ''}" data-s="${i}"><div class="slot-n">Slot ${i + 1}</div><div class="slot-empty">— Empty —</div></div>`;
      const mins = Math.floor((s.playTime ?? 0) / 60);
      return `<div class="slot" data-s="${i}"><div class="slot-portrait" style="background-image:url(${this.game.portraits.get(CLASSES[s.cls].model)})"></div>
        <div class="slot-info"><div class="slot-n">Slot ${i + 1} · ${CLASSES[s.cls].name}</div><div>Lv ${s.level} · ${MAPS[s.map]?.name ?? s.map}</div><small>¥${formatNum(s.gold)} · ${Math.floor(mins / 60)}h ${mins % 60}m · Fingers ${s.fingers}/20</small></div>
        <button class="btn small danger" data-del="${i}">Delete</button></div>`;
    }).join('');
    t.innerHTML = `${this.logo()}<div class="slots-panel"><div class="panel-title">${mode === 'new' ? 'Choose a save slot' : 'Load game'}</div>${rows}<button class="tbtn back" data-back="1">Back</button></div>`;
    t.onclick = (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest('[data-back]')) { audio.play('click'); this.titleMain(); return; }
      const del = tgt.closest('[data-del]') as HTMLElement | null;
      if (del) {
        e.stopPropagation();
        if (confirm('Delete this save permanently?')) { PlayerState.erase(+del.dataset.del!); this.slotSelect(mode); }
        return;
      }
      const s = tgt.closest('[data-s]') as HTMLElement | null;
      if (!s || s.classList.contains('disabled')) return;
      audio.play('click');
      const i = +s.dataset.s!;
      if (mode === 'load') { if (PlayerState.peek(i)) this.game.loadGame(i); return; }
      if (PlayerState.peek(i) && !confirm('Overwrite this save?')) return;
      this.classSelect(i);
    };
  }

  private classSelect(slot: number) {
    const t = this.titleEl!;
    let pick: ClassId = 'yuji';
    const render = () => {
      const cards = (Object.keys(CLASSES) as ClassId[]).map(id => {
        const c = CLASSES[id];
        const bars = (['hp', 'ce', 'atk', 'def'] as const).map(k => {
          const v = k === 'hp' ? c.base.hp / 160 : k === 'ce' ? c.base.ce / 100 : k === 'atk' ? c.base.atk / 15 : c.base.def / 7;
          return `<div class="cbar"><span>${k.toUpperCase()}</span><div><i style="width:${Math.round(v * 100)}%;background:${c.color}"></i></div></div>`;
        }).join('');
        return `<div class="ccard ${pick === id ? 'sel' : ''}" data-c="${id}" style="--c:${c.color}">
          <div class="cportrait" style="background-image:url(${this.game.portraits.get(c.model)})"></div>
          <div class="cname">${c.name}</div><div class="ctitle">${c.title}</div>
          <div class="cdesc">${escapeHtml(c.desc)}</div>${bars}</div>`;
      }).join('');
      t.innerHTML = `<div class="class-select"><div class="panel-title big">Choose your sorcerer</div><div class="cards">${cards}</div>
        <div class="cs-btns"><button class="tbtn back" data-back="1">Back</button><button class="tbtn primary" data-go="1">Begin — ${CLASSES[pick].name}</button></div></div>`;
    };
    render();
    t.onclick = (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest('[data-back]')) { audio.play('click'); this.slotSelect('new'); return; }
      if (tgt.closest('[data-go]')) { audio.play('questAccept'); this.game.newGame(pick, slot); return; }
      const c = tgt.closest('[data-c]') as HTMLElement | null;
      if (c) { pick = c.dataset.c as ClassId; audio.play('tab'); render(); }
    };
  }

  private titleSettings() {
    const t = this.titleEl!;
    const s = this.game.settings;
    const q = (v: string, l: string) => `<button class="chip ${s.quality === v ? 'on' : ''}" data-q="${v}">${l}</button>`;
    t.innerHTML = `${this.logo()}<div class="slots-panel"><div class="panel-title">Settings</div>
      <label class="set"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-set="music"></label>
      <label class="set"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-set="sfx"></label>
      <label class="set"><span>Ambience</span><input type="range" min="0" max="100" value="${Math.round(s.amb * 100)}" data-set="amb"></label>
      <div class="panel-title">Graphics</div><div class="chips">${q('low', 'Low')}${q('medium', 'Medium')}${q('high', 'High')}</div>
      <button class="tbtn back" data-back="1">Back</button></div>`;
    for (const inp of Array.from(t.querySelectorAll('input[data-set]')) as HTMLInputElement[]) {
      inp.addEventListener('input', () => { (s as any)[inp.dataset.set!] = +inp.value / 100; this.game.applySettings(); });
    }
    t.onclick = (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest('[data-back]')) { audio.play('click'); this.titleMain(); return; }
      const qb = tgt.closest('[data-q]') as HTMLElement | null;
      if (qb) { s.quality = qb.dataset.q as any; s.autoQ = false; this.game.applySettings(); this.titleSettings(); }
    };
  }

  /** First screen: needed so the audio context unlocks on a user gesture. */
  showTapToStart(onGo: () => void) {
    const t = el('div', 'title tap');
    t.innerHTML = `${this.logo()}<div class="tap-hint">TAP TO START</div><div class="title-foot">Best played in landscape · Headphones recommended</div>`;
    this.root.appendChild(t);
    const go = () => { t.remove(); onGo(); };
    t.addEventListener('click', go, { once: true });
    t.addEventListener('touchend', (e) => { e.preventDefault(); go(); }, { once: true });
  }
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }
