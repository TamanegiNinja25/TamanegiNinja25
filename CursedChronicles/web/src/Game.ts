// Top-level controller: main loop, state machine, saving, travel, dialogue/quest flow.
import { Renderer, Quality } from './render/Renderer';
import { Overlay2D } from './ui/Overlay2D';
import { World } from './world/World';
import { Input } from './core/Input';
import { UI } from './ui/UI';
import { Dialogue } from './ui/Dialogue';
import { Portraits } from './ui/Portraits';
import { PlayerState } from './rpg/PlayerState';
import { ClassId } from './rpg/types';
import { CLASSES } from './rpg/classes';
import { QUEST_BY_ID, QUESTS, IDLE, Line, NPC_NAMES } from './data/story';
import { NPC } from './entities/NPC';
import { MAPS } from './world/maps';
import { audio } from './audio/Audio';
import { music } from './audio/Music';
import { IconSpec } from './rpg/items';
import { pick } from './core/util';
import { occlusion } from './render/toon';

export type GameState = 'boot' | 'title' | 'play' | 'dialogue' | 'menu' | 'dead' | 'loading';

const SETTINGS_KEY = 'cursedChronicles.settings';

export class Game {
  r: Renderer;
  overlay: Overlay2D;
  world: World;
  input = new Input();
  ui: UI;
  dialogue: Dialogue;
  portraits: Portraits;
  ps: PlayerState | null = null;
  state: GameState = 'boot';
  settings = { music: 0.55, sfx: 0.85, amb: 0.6, quality: 'high' as Quality, zoom: 1, autoQ: true };
  private last = performance.now();
  private autosaveT = 0;
  private titleT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private slowSecs = 0;
  fps = 60;

  constructor() {
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.r = new Renderer(canvas);
    this.loadSettings();
    this.r.setQuality(this.settings.quality);
    this.overlay = new Overlay2D(document.getElementById('overlay') as HTMLCanvasElement, this.r);
    this.world = new World(this, this.r, this.overlay);
    this.portraits = new Portraits(this.r);
    this.ui = new UI(this);
    this.dialogue = new Dialogue(this, this.ui.root);
    window.addEventListener('resize', () => { this.r.resize(); this.overlay.resize(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.save(false); audio.ctx?.suspend(); } else if (this.state !== 'boot') audio.ctx?.resume();
    });
    window.addEventListener('keydown', (e) => {
      if (this.state !== 'play') return;
      const tabs: Record<string, string> = { KeyI: 'bag', KeyK: 'skills', KeyL: 'quests', KeyM: 'map', Escape: 'system', KeyC: 'status' };
      if (tabs[e.code]) { e.preventDefault(); this.ui.openMenu(tabs[e.code]); }
    });
  }

  start() {
    // A lightweight title backdrop: Jujutsu High with the camera drifting.
    this.ps = PlayerState.fresh('yuji', -1);
    this.world.loadMap('hub');
    this.world.player.model!.root.visible = false;
    this.state = 'title';
    document.getElementById('boot')?.remove();
    this.ui.showTapToStart(() => {
      audio.unlock();
      this.applySettings();
      music.play('title');
      music.resume();
      this.ui.showTitle();
    });
    requestAnimationFrame(this.frame);
  }

  private frame = (t: number) => {
    requestAnimationFrame(this.frame);
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.autoQuality(); }
    this.input.update();
    try {
      this.update(dt);
    } catch (err) {
      console.error(err);
    }
    this.r.render();
    this.overlay.draw(dt);
  };

  private update(dt: number) {
    switch (this.state) {
      case 'title': {
        this.titleT += dt;
        occlusion.uOccOn.value = 0;
        const a = this.titleT * 0.05;
        const w = this.world;
        w.fx.update(dt);
        w.weather.update(dt, 0, 0);
        for (const n of w.npcs) n.update(dt);
        this.r.camera.position.set(Math.sin(a) * 26, 14, Math.cos(a) * 26 + 2);
        this.r.camera.lookAt(0, 2, -6);
        this.r.target.set(0, 0, 0);
        this.r.sun.target.position.set(0, 0, 0);
        this.r.sun.position.set(-20, 30, 20);
        return;
      }
      case 'play':
        occlusion.uOccOn.value = 1;
        this.world.update(dt);
        this.ui.hud?.update(dt);
        this.autosaveT += dt;
        if (this.autosaveT > 60) { this.autosaveT = 0; this.save(false); }
        break;
      case 'dialogue':
        this.dialogue.update(dt);
        this.world.fx.update(dt);
        this.world.r.updateCamera(dt, this.world.player.x, this.world.player.z);
        for (const n of this.world.npcs) n.update(dt);
        this.world.player.syncModel(dt);
        break;
      case 'menu':
      case 'dead':
        this.world.fx.update(dt);
        this.world.r.updateCamera(dt, this.world.player.x, this.world.player.z);
        if (this.state === 'dead') this.world.player.syncModel(dt);
        break;
      default:
        break;
    }
  }

  setState(s: GameState) {
    if (this.state === 'title' && s === 'play') return;
    this.state = s;
    this.input.enabled = s === 'play';
    if (s !== 'play') this.input.releaseAll();
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
      else {
        // pick a sensible default for phones
        const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
        if (mobile) this.settings.quality = 'medium';
      }
    } catch { /* storage unavailable */ }
  }

  /** Steps graphics down a tier when play stays below ~24 fps, unless the player picked a quality. */
  private autoQuality() {
    const s = this.settings;
    if (!s.autoQ || this.state !== 'play' || s.quality === 'low') { this.slowSecs = 0; return; }
    this.slowSecs = this.fps < 24 ? this.slowSecs + 1 : 0;
    if (this.slowSecs < 6) return;
    this.slowSecs = 0;
    s.quality = s.quality === 'high' ? 'medium' : 'low';
    this.applySettings();
    this.toast(`Graphics set to ${s.quality === 'low' ? 'Low' : 'Medium'} to keep the game smooth`, 'info', 3);
  }

  applySettings() {
    const s = this.settings;
    audio.volumes.music = s.music;
    audio.volumes.sfx = s.sfx;
    audio.volumes.amb = s.amb;
    audio.applyVolumes();
    if (this.r.quality !== s.quality) {
      this.r.setQuality(s.quality);
      this.world.fx.quality = s.quality === 'low' ? 0.5 : s.quality === 'medium' ? 0.75 : 1;
    }
    this.r.zoom = s.zoom;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------
  // Game lifecycle
  // ------------------------------------------------------------------
  private bindPlayerEvents(ps: PlayerState) {
    ps.on((ev, data) => {
      if (ev === 'levelup') {
        audio.play('levelup');
        this.ui.levelUp(data);
        const p = this.world.player;
        if (p) { this.world.fx.pillar(p.x, p.z, 1.2, 5, 0xffd23a, 1.2); this.world.fx.burst(p.x, 1, p.z, 0xffe08a, 40, 6, 0.25, 1); }
      }
      if (ev === 'questAccept') { audio.play('questAccept'); this.toast(`Quest accepted: ${data.name}`, 'quest', 2.5); }
      if (ev === 'questReady') { audio.play('questDone'); this.toast(`Objective complete — report to ${NPC_NAMES[data.turnIn ?? data.giver] ?? ''}`, 'quest', 3); }
      if (ev === 'questDone') { this.toast(`Quest complete: ${data.name}`, 'quest', 3); }
      if (ev === 'invFull') this.toast('Inventory full!', 'warn');
      if (ev === 'inventory' || ev === 'stats' || ev === 'skills' || ev === 'gold') this.ui.menus.refresh();
    });
  }

  private async enterWorld(ps: PlayerState, map: string, x?: number, z?: number) {
    await this.ui.fadeOut(300);
    this.ui.hideTitle();
    this.ps = ps;
    this.bindPlayerEvents(ps);
    // the title backdrop used a throwaway player; rebuild for the real save
    if (this.world.player) { this.world.player.dispose(); (this.world as any).player = undefined; }
    this.world.loadMap(map, x, z);
    this.world.player.model!.root.visible = true;
    this.ui.createHud();
    this.ui.hud!.buildMinimap();
    this.state = 'play';
    this.input.enabled = true;
    this.applySettings();
    this.ui.mapBanner(MAPS[map].name, MAPS[map].jp);
    await this.ui.fadeIn(500);
  }

  async newGame(cls: ClassId, slot: number) {
    const ps = PlayerState.fresh(cls, slot);
    await this.enterWorld(ps, 'sugisawa');
    ps.save();
    // the opening scene
    const q = QUEST_BY_ID.m1;
    this.world.schedule(0.6, () => {
      this.dialogue.play(q.offer, { onEnd: () => ps.accept('m1') });
    });
  }

  async loadGame(slot: number) {
    const ps = PlayerState.load(slot);
    if (!ps) { this.toast('Save data could not be read', 'warn'); return; }
    await this.enterWorld(ps, MAPS[ps.d.map] ? ps.d.map : 'hub', ps.d.x, ps.d.z);
    this.toast(`Welcome back, ${CLASSES[ps.d.cls].name.split(' ')[0]}.`, 'info', 2.5);
  }

  save(manual: boolean) {
    if (!this.ps || this.ps.d.slot < 0 || this.state === 'title') return;
    const ok = this.ps.save();
    if (manual) { audio.play(ok ? 'save' : 'error'); this.toast(ok ? 'Game saved' : 'Could not save!', ok ? 'good' : 'warn'); }
  }

  async toTitle() {
    await this.ui.fadeOut(300);
    this.ui.hideHud();
    this.world.player?.dispose();
    (this.world as any).player = undefined;
    this.ps = PlayerState.fresh('yuji', -1);
    this.world.loadMap('hub');
    this.world.player.model!.root.visible = false;
    this.state = 'title';
    this.input.enabled = false;
    music.play('title');
    this.ui.showTitle();
    await this.ui.fadeIn(400);
  }

  async travel(map: string, x?: number, z?: number) {
    if (this.state === 'loading') return;
    const prev = this.state;
    this.state = 'loading';
    this.input.enabled = false;
    this.input.releaseAll();
    await this.ui.fadeOut(350);
    this.world.loadMap(map, x, z);
    this.ui.hud?.buildMinimap();
    this.state = prev === 'dialogue' ? 'dialogue' : 'play';
    this.input.enabled = this.state === 'play';
    this.save(false);
    await this.ui.fadeIn(450);
  }

  onPlayerDeath() {
    this.state = 'dead';
    this.input.enabled = false;
    this.input.releaseAll();
    music.push('title');
    setTimeout(() => this.ui.showDeath(this.ps!.questState('m2')?.state === 'done'), 1400);
  }

  async revive(toHub: boolean) {
    const ps = this.ps!;
    ps.addGold(-Math.floor(ps.d.gold * 0.1));
    ps.d.hp = ps.stats.maxHp;
    ps.d.ce = ps.stats.maxCe;
    music.pop();
    const p = this.world.player;
    p.alive = true;
    p.model?.revive();
    p.invulnT = 2;
    await this.travel(toHub ? 'hub' : ps.d.map);
    this.state = 'play';
    this.input.enabled = true;
  }

  // ------------------------------------------------------------------
  // NPC conversations + quests
  // ------------------------------------------------------------------
  talkTo(n: NPC) {
    if (this.state !== 'play') return;
    const ps = this.ps!;
    const id = n.id;
    ps.questCheckCollect();
    ps.questProgress('talk', id, 1);
    n.model.play('wave', 0.8);
    // 1. completing a quest
    const ready = ps.turnInsFor(id).find(q => ps.questState(q.id)?.state === 'ready');
    if (ready) {
      this.dialogue.play(ready.complete, {
        onEnd: () => {
          ps.complete(ready.id);
          this.save(false);
          this.world.refreshNpcs();
          // chain straight into an auto-accepted follow-up from the same NPC
          const next = ps.offersFor(id).find(q => q.autoAccept);
          if (next) this.offerQuest(next.id);
        },
      });
      return;
    }
    // 2. offering a new quest
    const offer = ps.offersFor(id)[0];
    if (offer) { this.offerQuest(offer.id); return; }
    // 3. progress hints for active quests involving this NPC
    const activeQ = ps.turnInsFor(id).find(q => ps.questState(q.id)?.state === 'active');
    const gated = QUESTS.find(q => q.giver === id && !ps.questState(q.id) && (q.prereq ?? []).every(p => ps.questState(p)?.state === 'done') && q.level && ps.d.level < q.level);
    if (n.d.shop && !activeQ) {
      if (gated) this.toast(`${n.name} will have a request for you at Lv ${gated.level}.`, 'info', 2.5);
      this.ui.menus.openShop(n.d.shop === 'workshop' ? 'workshop' : n.d.shop, n.d.model ?? id);
      return;
    }
    if (activeQ?.progress) { this.dialogue.play(activeQ.progress); return; }
    const lines: Line[] = [...pick(IDLE[id] ?? IDLE.civilian ?? [[{ who: id, text: '…' }]])];
    if (gated) lines.push({ who: id, text: `Get a little stronger first. Come back at level ${gated.level}.` });
    this.dialogue.play(lines.map(l => ({ ...l, who: l.who === 'civilian' || l.who === 'student' ? id : l.who })));
  }

  offerQuest(qid: string) {
    const q = QUEST_BY_ID[qid];
    const ps = this.ps!;
    this.dialogue.play(q.offer, { onEnd: () => { ps.accept(qid); this.save(false); this.world.refreshNpcs(); } });
  }

  npcEmote(who: string, emote: string) {
    const n = this.world.npcs.find(x => x.id === who);
    n?.model.play(emote, 0.9);
    if (who === 'player') this.world.player.model?.play(emote, 0.9);
  }

  toast(msg: string, kind: 'info' | 'warn' | 'good' | 'item' | 'boss' | 'quest' = 'info', dur = 2, color?: string, icon?: IconSpec) {
    this.ui.toast(msg, kind, dur, color, icon);
  }
}
