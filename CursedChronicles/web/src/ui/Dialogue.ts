// Visual-novel style dialogue box with portraits, typewriter text and choices.
import type { Game } from '../Game';
import { Line, Choice, NPC_NAMES } from '../data/story';
import { audio } from '../audio/Audio';
import { el, escapeHtml } from '../core/util';
import { CLASSES } from '../rpg/classes';

const VOICE_PITCH: Record<string, number> = { gojo: 1.05, yuji: 1.1, megumi: 0.9, nobara: 1.3, nanami: 0.75, sukuna: 0.6, mahito: 1.2, todo: 0.7, panda: 0.8, inumaki: 1.15, shoko: 1.0, maki: 1.1, yaga: 0.7, ijichi: 1.0, junpei: 1.0, miwa: 1.35, meimei: 1.15, hanami: 0.8, jogo: 1.25, dagon: 0.5, narrator: 0.95 };

export class Dialogue {
  root: HTMLDivElement;
  private box: HTMLDivElement;
  private portrait: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private textEl: HTMLDivElement;
  private choicesEl: HTMLDivElement;
  private hint: HTMLDivElement;
  private lines: Line[] = [];
  private idx = 0;
  private full = '';
  private shown = 0;
  private typing = false;
  private timer = 0;
  private onEnd: (() => void) | null = null;
  private choices: Choice[] | undefined;
  active = false;
  private speaker = '';

  constructor(private game: Game, parent: HTMLElement) {
    this.root = el('div', 'dlg hidden');
    this.portrait = el('div', 'dlg-portrait');
    this.box = el('div', 'dlg-box');
    this.nameEl = el('div', 'dlg-name');
    this.textEl = el('div', 'dlg-text');
    this.choicesEl = el('div', 'dlg-choices');
    this.hint = el('div', 'dlg-hint', '▼');
    this.box.append(this.nameEl, this.textEl, this.hint);
    this.root.append(this.portrait, this.box, this.choicesEl);
    parent.appendChild(this.root);
    const adv = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.advance(); };
    this.box.addEventListener('click', adv);
    this.portrait.addEventListener('click', adv);
    this.root.addEventListener('touchstart', (e) => { if ((e.target as HTMLElement).closest('.dlg-choice')) return; adv(e); }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n) { (this.choicesEl.children[+n[1] - 1] as HTMLElement | undefined)?.click(); return; }
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ' || e.code === 'KeyF') { e.preventDefault(); this.advance(); }
    });
  }

  play(lines: Line[], opts: { choices?: Choice[]; onEnd?: () => void } = {}) {
    const cls = this.game.ps?.d.cls;
    this.lines = lines.filter(l => (!l.only || (cls && l.only.includes(cls))) && (!l.not || !cls || !l.not.includes(cls)));
    this.idx = 0;
    this.onEnd = opts.onEnd ?? null;
    this.choices = opts.choices;
    this.active = true;
    this.root.classList.remove('hidden');
    this.choicesEl.innerHTML = '';
    this.game.setState('dialogue');
    if (!this.lines.length) { this.finish(); return; }
    this.show();
  }

  private show() {
    const l = this.lines[this.idx];
    const ps = this.game.ps;
    const pid = ps ? CLASSES[ps.d.cls].model : 'yuji';
    const who = l.who === 'player' ? pid : l.who;
    this.speaker = who;
    const name = l.who === 'player' ? (ps ? CLASSES[ps.d.cls].name : '') : NPC_NAMES[l.who] ?? l.who;
    this.nameEl.textContent = name;
    this.nameEl.style.display = l.who === 'narrator' ? 'none' : '';
    this.root.classList.toggle('narration', l.who === 'narrator');
    this.root.classList.toggle('right', l.who === 'player');
    this.root.classList.toggle('sukuna', l.who === 'sukuna');
    if (l.who === 'narrator') this.portrait.style.display = 'none';
    else {
      const url = this.game.portraits.get(who);
      this.portrait.style.display = url ? '' : 'none';
      this.portrait.style.backgroundImage = url ? `url(${url})` : '';
    }
    const first = ps ? CLASSES[ps.d.cls].name.split(' ')[0] : '';
    this.full = l.text.replace(/\{name\}/g, first);
    this.shown = 0;
    this.typing = true;
    this.textEl.innerHTML = '';
    this.hint.style.visibility = 'hidden';
    if (l.sfx) audio.play(l.sfx);
    if (l.emote) this.game.npcEmote(l.who, l.emote);
  }

  update(dt: number) {
    if (!this.active || !this.typing) return;
    this.timer += dt;
    const speed = 55; // characters per second
    const target = Math.min(this.full.length, Math.floor(this.timer * speed));
    if (target > this.shown) {
      if (Math.floor(target / 3) > Math.floor(this.shown / 3) && this.speaker !== 'narrator') audio.play('dialog', { pitch: (VOICE_PITCH[this.speaker] ?? 1) * (0.95 + Math.random() * 0.1) });
      this.shown = target;
      this.textEl.innerHTML = escapeHtml(this.full.slice(0, this.shown));
    }
    if (this.shown >= this.full.length) { this.typing = false; this.timer = 0; this.hint.style.visibility = 'visible'; }
  }

  advance() {
    if (!this.active) return;
    if (this.typing) {
      this.shown = this.full.length;
      this.textEl.innerHTML = escapeHtml(this.full);
      this.typing = false;
      this.timer = 0;
      this.hint.style.visibility = 'visible';
      return;
    }
    if (this.choicesEl.childElementCount) return;
    this.idx++;
    this.timer = 0;
    if (this.idx < this.lines.length) { audio.play('click', { vol: 0.5 }); this.show(); return; }
    if (this.choices?.length) { this.showChoices(); return; }
    this.finish();
  }

  private showChoices() {
    const cs = this.choices!;
    this.choices = undefined;
    this.choicesEl.innerHTML = '';
    for (const c of cs) {
      const b = el('button', 'dlg-choice', escapeHtml(c.text));
      const pick = (e: Event) => {
        e.preventDefault(); e.stopPropagation();
        audio.play('click');
        if (c.flag && this.game.ps) this.game.ps.d.flags[c.flag] = true;
        this.choicesEl.innerHTML = '';
        const end = this.onEnd;
        this.play(c.reply, { onEnd: end ?? undefined });
      };
      b.addEventListener('click', pick);
      b.addEventListener('touchstart', pick, { passive: false });
      this.choicesEl.appendChild(b);
    }
  }

  private finish() {
    this.active = false;
    this.root.classList.add('hidden');
    this.game.setState('play');
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }
}
