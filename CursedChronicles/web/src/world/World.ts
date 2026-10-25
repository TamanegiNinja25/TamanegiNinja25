// The live game world: map loading, entity simulation, combat resolution,
// bosses, domains, loot and quest hooks.
import * as THREE from 'three';
import type { Game } from '../Game';
import { Renderer } from '../render/Renderer';
import { Effects } from '../render/Effects';
import { Overlay2D } from '../ui/Overlay2D';
import { CollisionWorld } from './Collision';
import { MapBuilder, MapRuntime, MapDef, BossDef, SpawnerDef, buildTerrain } from './MapBuilder';
import { MAPS } from './maps';
import { SplatPainter } from '../render/textures';
import { clearWaterMaterials, tickWater } from '../render/models/buildings';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { Actor } from '../entities/Actor';
import { Summon } from '../entities/Summon';
import { NPC } from '../entities/NPC';
import { Projectile } from '../entities/Projectile';
import { Loot, Pickup, Portal } from '../entities/Loot';
import { ENEMIES, GRADE_NAME } from '../rpg/enemies';
import { ITEMS, makeItem, randomGear, rollRarity, uniquesForLevel } from '../rpg/items';
import { QUEST_BY_ID } from '../data/story';
import { Caster, DamageOpts, DamageSource, ProjectileSpec, Target, WorldAPI } from './api';
import { audio, Surface } from '../audio/Audio';
import { music } from '../audio/Music';
import { Weather } from '../render/Weather';
import { occlusion } from '../render/toon';
import { angleDiff, chance, clamp, pick, rand, randInt } from '../core/util';

const _occV = new THREE.Vector3();

interface SpawnerState { def: SpawnerDef; alive: Set<Enemy>; timers: number[] }

export class World implements WorldAPI {
  game: Game;
  r: Renderer;
  root = new THREE.Group();
  col = new CollisionWorld();
  fx: Effects;
  overlay: Overlay2D;
  weather: Weather;
  player!: Player;
  enemies: Enemy[] = [];
  summons: Summon[] = [];
  npcs: NPC[] = [];
  projectiles: Projectile[] = [];
  loot: Loot[] = [];
  pickups: Pickup[] = [];
  portals: Portal[] = [];
  map!: MapRuntime;
  mapDef!: MapDef;
  time = 0;
  private tasks: { t: number; fn: () => void }[] = [];
  hitstopT = 0;
  private spawners: SpawnerState[] = [];
  bossActive: { def: BossDef; enemy: Enemy } | null = null;
  private bossPending: BossDef | null = null;
  private bossStarting = false;
  bossDom: { enemy: Enemy; until: number; dps: number; r: number; x: number; z: number; tick: number } | null = null;
  domainOwner: 'player' | 'enemy' | null = null;
  private domainUntil = 0;
  private portalCooldown = 0;
  private dummyTimers: { x: number; z: number; t: number }[] = [];
  private terrain: THREE.Mesh | null = null;

  constructor(game: Game, r: Renderer, overlay: Overlay2D) {
    this.game = game;
    this.r = r;
    this.overlay = overlay;
    this.fx = new Effects(r);
    this.fx.onText = (x, y, z, t, c, s) => overlay.add(x, y, z, t, c, s, true);
    this.fx.onHitstop = (t) => { this.hitstopT = Math.max(this.hitstopT, t); };
    this.weather = new Weather(r);
    r.scene.add(this.root);
    r.cameraBlocked = (x, z) => this.col.blocked(x, z, 1.2);
  }

  // ------------------------------------------------------------------
  // Map loading
  // ------------------------------------------------------------------

  loadMap(id: string, x?: number, z?: number, facing?: number) {
    const def = MAPS[id];
    if (!def) throw new Error('Unknown map ' + id);
    this.clearMap();
    this.mapDef = def;
    const [W, D] = def.size;
    this.col.bounds = { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 };
    const splat = new SplatPainter(W, D, 4);
    def.terrain.paint(splat);
    const b = new MapBuilder(def, this.col, this.r.quality, splat);
    def.build(b);
    this.map = b.finish();
    this.root.add(b.group);
    this.terrain = buildTerrain(def, splat);
    this.root.add(this.terrain);
    this.fx.attach(this.root);
    this.r.applyLighting(def.lighting);
    this.weather.set(def.weather, this.root);
    music.clearStack();
    music.play(def.music);
    music.ambience(def.ambience);

    const ps = this.game.ps!;
    if (!this.player) this.player = new Player(this, ps, this.game.input);
    else this.root.add(this.player.model!.root);
    this.player.alive = true;
    this.player.model?.revive();
    const sx = x ?? def.spawn.x, sz = z ?? def.spawn.z;
    this.player.place(sx, sz);
    this.player.facing = facing ?? def.spawn.facing ?? Math.PI;
    this.player.kx = this.player.kz = 0;
    this.player.dashS = null;
    ps.d.map = id;
    ps.d.x = sx; ps.d.z = sz;

    for (const n of this.map.npcs) if (!n.cond || n.cond(ps)) this.npcs.push(new NPC(this, n));
    for (const p of this.map.portals) this.portals.push(new Portal(this, p));
    for (const p of this.map.pickups) this.pickups.push(new Pickup(this, p.x, p.z, p.item, p.quest));
    for (const s of this.map.spawners) {
      const st: SpawnerState = { def: s, alive: new Set(), timers: [] };
      this.spawners.push(st);
      if (!s.cond || s.cond(ps)) for (let i = 0; i < s.count; i++) this.spawnFrom(st);
    }
    for (const dm of this.map.dummies) this.spawnDummy(dm.x, dm.z);
    ps.questProgress('reach', id, 1);
    this.r.snap(sx, sz);
    this.portalCooldown = 1.0;
    this.time = 0;
    this.game.ui.mapBanner(def.name, def.jp);
  }

  clearMap() {
    for (const e of this.enemies) e.dispose();
    for (const s of this.summons) s.dispose();
    for (const n of this.npcs) n.dispose();
    for (const p of this.projectiles) p.end();
    for (const l of this.loot) l.remove();
    this.enemies = []; this.summons = []; this.npcs = []; this.projectiles = []; this.loot = []; this.pickups = []; this.portals = [];
    this.spawners = [];
    this.tasks = [];
    this.dummyTimers = [];
    this.bossActive = null;
    this.bossStarting = false;
    this.bossPending = null;
    this.bossDom = null;
    this.domainOwner = null;
    this.fx.clear();
    this.overlay.clear();
    this.game.ui.hud?.setBoss(null);
    // dispose map-owned GPU resources (shared prop/building geometry stays cached)
    this.root.traverse(o => {
      const im = o as THREE.InstancedMesh;
      if (im.isInstancedMesh) im.dispose();
    });
    if (this.terrain) {
      this.terrain.geometry.dispose();
      const m = this.terrain.material as THREE.MeshLambertMaterial;
      m.map?.dispose();
      m.dispose();
      this.terrain = null;
    }
    clearWaterMaterials();
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    this.col.clear();
  }

  // ------------------------------------------------------------------
  // Main update
  // ------------------------------------------------------------------

  update(dt: number) {
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      this.fx.update(dt * 0.25);
      this.updateLights();
      this.r.updateCamera(dt, this.player.x, this.player.z);
      return;
    }
    this.time += dt;
    this.game.ps!.tick(dt);
    // scheduled tasks
    for (let i = 0; i < this.tasks.length; i++) {
      const t = this.tasks[i];
      if (t.t <= this.time) {
        this.tasks.splice(i--, 1);
        t.fn();
      }
    }
    const p = this.player;
    p.update(dt);
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.removed);
    this.separate();
    for (const s of this.summons) s.update(dt);
    this.summons = this.summons.filter(s => !s.removed);
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    for (const l of this.loot) l.update(dt);
    this.loot = this.loot.filter(l => !l.dead);
    for (const pk of this.pickups) pk.update(dt);
    for (const po of this.portals) po.update(dt);
    for (const n of this.npcs) n.update(dt);
    this.npcTimer -= dt;
    if (this.npcTimer <= 0) { this.npcTimer = 1; this.refreshNpcs(); }
    this.tickSpawners(dt);
    this.checkBosses();
    this.tickDomain(dt);
    this.checkPortals(dt);
    this.fx.update(dt);
    this.weather.update(dt, this.player.x, this.player.z);
    tickWater(this.time);
    this.updateLights();
    this.fillOverlay();
    if (p.wantsInteract) { p.wantsInteract = false; this.tryInteract(); }
    const look = 1.2;
    this.r.updateCamera(dt, p.x, p.z, Math.sin(p.facing) * look * 0.5, Math.cos(p.facing) * look * 0.35);
    occlusion.uOccA.value.copy(this.r.camera.position);
    occlusion.uOccB.value.set(p.x, 1.0, p.z);
    occlusion.uViewInv.value.copy(this.r.camera.matrixWorld);
    this.r.camera.updateMatrixWorld();
    _occV.set(p.x, 1.0, p.z).applyMatrix4(this.r.camera.matrixWorldInverse);
    occlusion.uOccDepth.value = -_occV.z;
    this.game.ps!.d.x = p.x;
    this.game.ps!.d.z = p.z;
  }

  /** Spawn/despawn NPCs whose conditions changed (quest progress). */
  refreshNpcs() {
    const ps = this.game.ps!;
    for (const def of this.map.npcs) {
      const present = this.npcs.find(n => n.d === def);
      const ok = !def.cond || def.cond(ps);
      if (ok && !present) this.npcs.push(new NPC(this, def));
      if (!ok && present) { present.dispose(); this.npcs = this.npcs.filter(n => n !== present); }
    }
  }

  private npcTimer = 0;

  private separate() {
    const list: Actor[] = this.enemies.filter(e => e.alive && e.d.speed > 0);
    const p = this.player;
    for (const n of this.npcs) {
      const dx = p.x - n.x, dz = p.z - n.z;
      const rr = p.radius + n.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = n.x + dx / d * rr; p.z = n.z + dz / d * rr; }
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          a.x -= dx / d * push; a.z -= dz / d * push;
          b.x += dx / d * push; b.z += dz / d * push;
        }
      }
      if (p.alive) {
        const dx = a.x - p.x, dz = a.z - p.z;
        const rr = a.radius + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = rr - d;
          if (a.isBoss) { p.x -= dx / d * push; p.z -= dz / d * push; }
          else { a.x += dx / d * push * 0.8; a.z += dz / d * push * 0.8; p.x -= dx / d * push * 0.2; p.z -= dz / d * push * 0.2; }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Spawning
  // ------------------------------------------------------------------

  private spawnFrom(st: SpawnerState) {
    const s = st.def;
    const tot = s.enemies.reduce((a, e) => a + (e.w ?? 1), 0);
    let r = Math.random() * tot;
    let id = s.enemies[0].id;
    for (const e of s.enemies) { r -= e.w ?? 1; if (r <= 0) { id = e.id; break; } }
    for (let tries = 0; tries < 20; tries++) {
      const x = s.x + (Math.random() - 0.5) * s.w, z = s.z + (Math.random() - 0.5) * s.d;
      const def = ENEMIES[id];
      if (this.col.blocked(x, z, def.radius * def.scale)) continue;
      if (this.player && Math.hypot(this.player.x - x, this.player.z - z) < 7 && this.time > 1) continue;
      if (this.inArena(x, z)) continue;
      const lv = s.level ? randInt(s.level[0], s.level[1]) : def.level;
      const e = this.spawnEnemy(id, x, z, lv, false);
      e.spawner = { alive: 0, onDeath: () => { st.alive.delete(e); st.timers.push(s.respawn * rand(0.8, 1.3)); } };
      st.alive.add(e);
      return;
    }
  }

  private tickSpawners(dt: number) {
    const ps = this.game.ps!;
    for (const st of this.spawners) {
      const ok = !st.def.cond || st.def.cond(ps);
      if (!ok) {
        for (const e of st.alive) { if (e.alive) { e.alive = false; e.dispose(); } }
        st.alive.clear();
        st.timers = [];
        continue;
      }
      // conditional spawners populate when they become valid
      if (st.alive.size + st.timers.length < st.def.count) st.timers.push(0.5);
      for (let i = st.timers.length - 1; i >= 0; i--) {
        st.timers[i] -= dt;
        if (st.timers[i] <= 0) { st.timers.splice(i, 1); this.spawnFrom(st); }
      }
    }
    for (let i = this.dummyTimers.length - 1; i >= 0; i--) {
      const d = this.dummyTimers[i];
      d.t -= dt;
      if (d.t <= 0) { this.dummyTimers.splice(i, 1); this.spawnDummy(d.x, d.z); }
    }
  }

  private spawnDummy(x: number, z: number) {
    const e = this.spawnEnemy('dummy', x, z, 1, true);
    e.facing = Math.PI;
    e.spawner = { alive: 0, onDeath: () => this.dummyTimers.push({ x, z, t: 4 }) };
  }

  spawnEnemy(id: string, x: number, z: number, level?: number, noLoot = false) {
    const def = ENEMIES[id];
    const e = new Enemy(this, def, x, z, level);
    e.noLoot = noLoot;
    this.enemies.push(e);
    if (def.ai !== 'dummy' && this.time > 0.5) { this.fx.smoke(x, z, 0x2a1a3a, 8); }
    return e;
  }

  // ------------------------------------------------------------------
  // Bosses and domains
  // ------------------------------------------------------------------

  private checkBosses() {
    const p = this.player;
    const ps = this.game.ps!;
    if (this.bossActive) {
      const { def, enemy } = this.bossActive;
      if (!enemy.alive) return;
      if (Math.hypot(p.x - def.x, p.z - def.z) > def.r * 2.6) {
        // player fled: the boss withdraws and recovers
        enemy.dispose();
        enemy.alive = false;
        this.enemies = this.enemies.filter(e => e !== enemy);
        this.bossActive = null;
        this.bossDom = null;
        music.pop();
        this.game.ui.hud?.setBoss(null);
        this.game.toast('The curse withdrew… it will be waiting.', 'boss');
      }
      return;
    }
    if (this.bossStarting || this.game.state !== 'play') return;
    for (const b of this.map.bosses) {
      if (Math.hypot(p.x - b.x, p.z - b.z) > b.r) continue;
      if (b.quest) {
        const st = ps.questState(b.quest);
        if (!st || st.state === 'done') continue;
        const q = QUEST_BY_ID[b.quest];
        const oi = q.objectives.findIndex(o => o.type === 'boss' && o.target === b.id);
        if (oi < 0 || ps.objectiveDone(q, oi)) continue;
        // earlier objectives must be complete
        let ok = true;
        for (let k = 0; k < oi; k++) if (!ps.objectiveDone(q, k)) ok = false;
        if (!ok) continue;
      }
      if (b.cond && !b.cond(ps)) continue;
      this.startBoss(b);
      return;
    }
  }

  private startBoss(b: BossDef) {
    this.bossStarting = true;
    this.bossPending = b;
    const go = () => {
      this.bossStarting = false;
      this.bossPending = null;
      // Lesser curses scatter from the arena so the duel isn't buried under trash mobs.
      for (const st of this.spawners) for (const o of st.alive) {
        if (!o.alive || Math.hypot(o.x - b.x, o.z - b.z) >= b.r + 4) continue;
        this.fx.smoke(o.x, o.z, 0x1a0a1a, 8);
        o.alive = false; o.dispose();
        st.alive.delete(o);
        st.timers.push(st.def.respawn);
      }
      const def = ENEMIES[b.id];
      this.fx.sigil(b.x, b.z, 3.5, 0x8a0a2a, 1.4);
      this.fx.smoke(b.x, b.z, 0x1a0a1a, 30);
      this.sfx('roar', b.x, b.z);
      this.fx.shake(0.5, 0.6);
      const e = this.spawnEnemy(b.id, b.x, b.z, b.level ?? def.level, false);
      e.aggro = true;
      e.target = this.player;
      e.atkCd = 1.5;
      this.bossActive = { def: b, enemy: e };
      music.push(b.id === 'sukuna' || b.id === 'mahoraga' ? 'finalBoss' : 'boss');
      this.game.ui.hud?.setBoss(e);
      this.game.ui.banner(GRADE_NAME[def.grade].toUpperCase(), def.name, '#ff3a4a');
    };
    const q = b.quest ? QUEST_BY_ID[b.quest] : null;
    if (b.intro?.length) this.game.dialogue.play(b.intro, { choices: q?.choices, onEnd: go });
    else go();
  }

  inBossFight() { return !!this.bossActive || this.bossStarting; }

  /** True inside the arena of the boss currently being fought (spawners stay out of it). */
  private inArena(x: number, z: number) {
    const b = this.bossActive?.def ?? this.bossPending;
    return !!b && Math.hypot(x - b.x, z - b.z) < b.r + 4;
  }

  bossDomain(e: Enemy, kind: string, r: number, dur: number, dpsPct: number, banner: string) {
    if (this.domainOwner === 'player') {
      // the player's own domain is up: the boss's expansion is overwhelmed immediately
      this.game.ui.banner('DOMAIN CLASH', 'Your domain holds — theirs collapses!', '#9adfff');
      return;
    }
    this.fx.domain(kind, e.x, e.z, r, dur);
    this.bossDom = { enemy: e, until: this.time + dur, dps: dpsPct, r, x: e.x, z: e.z, tick: 1.2 };
    this.domainOwner = 'enemy';
    this.domainUntil = this.time + dur;
    this.sfx('domain', e.x, e.z);
    this.game.ui.banner('DOMAIN EXPANSION', banner.replace('Domain Expansion: ', ''), '#ff2a4a');
    // the threat stirs the player's cursed energy, bringing a counter-domain within reach
    const ps = this.game.ps!;
    ps.d.domain = Math.min(100, ps.d.domain + 25);
    this.game.toast('Sure-hit domain! Survive it — or use your Ultimate to clash!', 'boss', 3);
  }

  private tickDomain(dt: number) {
    if (this.domainOwner && this.time > this.domainUntil) this.domainOwner = null;
    const bd = this.bossDom;
    if (!bd) return;
    if (!bd.enemy.alive || this.time > bd.until) { this.bossDom = null; return; }
    bd.tick -= dt;
    if (bd.tick <= 0) {
      bd.tick = 0.5;
      const p = this.player;
      if (Math.hypot(p.x - bd.x, p.z - bd.z) < bd.r) {
        this.applyDamageRaw(bd.enemy, p, p.maxHp * bd.dps * 0.5, { kind: 'domain', noBF: true, quiet: true, color: '#ff4a6a' });
        this.fx.slash(p.x, p.z, rand(0, Math.PI * 2), 1.2, 0xff4a6a, 0.8, rand(-1, 1));
      }
    }
  }

  onPlayerUltimate(_id: string) {
    if (this.bossDom) {
      const e = this.bossDom.enemy;
      this.fx.breakDomain();
      this.bossDom = null;
      this.game.ui.banner('DOMAIN CLASH', 'Your domain overwhelms theirs!', '#9adfff');
      this.sfx('shatter', e.x, e.z);
      e.stunT = 3;
      this.applyDamageRaw(this.player, e, e.maxHp * 0.08, { kind: 'domain', ignoreDef: true, color: '#9adfff' });
    }
  }

  // ------------------------------------------------------------------
  // Interaction & portals
  // ------------------------------------------------------------------

  interactableNear(): NPC | null {
    const p = this.player;
    let best: NPC | null = null, bd = 2.6;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  private tryInteract() {
    const n = this.interactableNear();
    if (n) this.game.talkTo(n);
  }

  private checkPortals(dt: number) {
    if (this.portalCooldown > 0) { this.portalCooldown -= dt; return; }
    const p = this.player;
    for (const po of this.portals) {
      const d = po.d;
      if (Math.hypot(p.x - d.x, p.z - d.z) > d.r) continue;
      const ps = this.game.ps!;
      if (d.cond && ps.questState(d.cond)?.state !== 'done' && !(d.cond === 'm7' && ps.questState('m8'))) {
        this.game.toast(d.condText ?? 'The way is sealed.', 'warn', 2);
        this.portalCooldown = 2.5;
        const dx = p.x - d.x, dz = p.z - d.z, dd = Math.hypot(dx, dz) || 1;
        p.place(d.x + dx / dd * (d.r + 0.6), d.z + dz / dd * (d.r + 0.6));
        return;
      }
      if (this.inBossFight()) { this.portalCooldown = 2; this.game.toast('You can\'t leave mid-fight!', 'warn'); return; }
      this.portalCooldown = 3;
      audio.play('portal');
      this.game.travel(d.to, d.toX, d.toZ);
      return;
    }
  }

  surfaceAt(x: number, z: number): Surface {
    for (const w of this.map.water) if (Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2) return 'water';
    const sp = this.map.splat;
    const u = (x + sp.width / 2) / sp.width, v = (z + sp.depth / 2) / sp.depth;
    const tx = clamp(Math.floor(u * sp.size), 0, sp.size - 1), ty = clamp(Math.floor(v * sp.size), 0, sp.size - 1);
    const i = (ty * sp.size + tx) * 4;
    let best = 0;
    for (let c = 1; c < 4; c++) if (sp.data[i + c] > sp.data[i + best]) best = c;
    return this.mapDef.surfaces[best];
  }

  // ------------------------------------------------------------------
  // Lights + overlay
  // ------------------------------------------------------------------

  private updateLights() {
    const pl = this.r.pointLights;
    const px = this.r.target.x, pz = this.r.target.z;
    const cands: { x: number; y: number; z: number; color: number; intensity: number; range: number; score: number }[] = [];
    for (const l of this.fx.dynLights) {
      const k = 1 - l.t / l.dur;
      cands.push({ x: l.x, y: l.y, z: l.z, color: l.color, intensity: l.intensity * k, range: l.range, score: -1000 + Math.hypot(l.x - px, l.z - pz) });
    }
    for (const l of this.map.lights) {
      const d = Math.hypot(l.x - px, l.z - pz);
      if (d > 26) continue;
      const fl = l.flicker ? 0.75 + 0.25 * Math.sin(this.time * 17 + l.x) * Math.sin(this.time * 7.3 + l.z) : 1;
      cands.push({ ...l, intensity: l.intensity * fl * 0.6, score: d });
    }
    cands.sort((a, b) => a.score - b.score);
    for (let i = 0; i < pl.length; i++) {
      const c = cands[i];
      const L = pl[i];
      if (c) {
        L.position.set(c.x, c.y, c.z);
        L.color.setHex(c.color);
        L.intensity = c.intensity;
        L.distance = c.range;
      } else L.intensity = 0;
    }
  }

  private fillOverlay() {
    const o = this.overlay;
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive || e.isBoss || !e.model?.root.visible) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 20) continue;
      const elite = e.d.grade <= 1;
      if (e.hp < e.maxHp || elite || d < 7) {
        o.bars.push({ x: e.x, y: (e.model?.height ?? 1.6) * e.scale + 0.35 + (e.d.flying ? 0.6 : 0), z: e.z, hp: e.hp, max: e.maxHp, name: `Lv${e.level} ${e.d.name}`, gradeColor: e.gradeColor, elite, marked: e.marked, stun: e.stunned });
      }
    }
    const ps = this.game.ps!;
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      if (d > 24) continue;
      const kind = this.npcMarker(n.id, n.d.shop);
      o.markers.push({ x: n.x, y: n.model.height + 0.55, z: n.z, kind: kind ?? '…', name: n.name, near: d < 5 });
      if (!kind) o.markers.pop();
      else if (d < 5 && kind === '…') o.markers[o.markers.length - 1].kind = '…';
    }
    void ps;
  }

  npcMarker(id: string, shop?: string): '!' | '?' | 'shop' | 'travel' | '…' | null {
    const ps = this.game.ps!;
    if (ps.turnInsFor(id).some(q => ps.questState(q.id)?.state === 'ready')) return '?';
    if (ps.offersFor(id).length) return '!';
    if (ps.turnInsFor(id).some(q => q.objectives.some(o => o.type === 'talk' && o.npc === id))) return '?';
    if (shop === 'travel') return 'travel';
    if (shop) return 'shop';
    return null;
  }

  // ------------------------------------------------------------------
  // Combat core
  // ------------------------------------------------------------------

  hostileToEnemies(): Actor[] {
    const out: Actor[] = [];
    if (this.player.alive) out.push(this.player);
    for (const s of this.summons) if (s.alive && s.targetable) out.push(s);
    return out;
  }

  private targetsFor(src: DamageSource): Actor[] {
    return src.team === 'player' ? this.enemies.filter(e => e.alive) : this.hostileToEnemies();
  }

  applyDamageRaw(src: Actor | DamageSource, target: Actor, amount: number, opts: DamageOpts = {}) {
    if (!target.alive || target.invulnT > 0 && target.team === 'player') return 0;
    let dmg = Math.max(1, Math.round(amount));
    if (target === this.player) dmg = Math.round(dmg * (1 - this.player.ps.stats.dmgReduce));
    target.hp -= dmg;
    this.overlay.add(target.x, 1.9, target.z, String(dmg), opts.color ?? (target === this.player ? '#ff5a5a' : '#ffffff'), 14);
    if (target === this.player) this.player.onHit(dmg);
    else target.onHit(dmg, src as Actor);
    if (target.hp <= 0) this.onZero(target, src as Actor);
    return dmg;
  }

  /** Main damage formula. Returns damage dealt (0 if missed/invalid). */
  applyDamage(src: Actor, target: Actor, mult: number, opts: DamageOpts = {}): number {
    if (!target.alive || src === target) return 0;
    if (target.invulnT > 0) {
      if (target === this.player) this.overlay.add(target.x, 2, target.z, 'IMMUNE', '#9adfff', 12);
      return 0;
    }
    const isPlayerSrc = src === this.player;
    const ps = this.player.ps;
    // evasion for the player
    if (target === this.player && Math.random() < ps.stats.evasion) {
      this.overlay.add(target.x, 2.1, target.z, 'MISS', '#c0c0ff', 14);
      return 0;
    }
    let dmg = src.atkPower() * mult * rand(0.92, 1.08);
    const kind = opts.kind ?? 'melee';
    if (isPlayerSrc) {
      if (kind === 'skill' || kind === 'domain') dmg *= ps.stats.skillPow;
      if (kind === 'proj') dmg *= ps.stats.projPow;
    }
    if (src instanceof Summon) dmg *= ps.stats.summonPow;
    let bf = false, crit = false;
    if (isPlayerSrc && !opts.noBF && (opts.bf || ((kind === 'melee' || kind === 'skill') && Math.random() < ps.stats.bfChance))) bf = true;
    if (!bf && (opts.crit || Math.random() < src.critChance)) crit = true;
    if (bf) dmg *= 2.5;
    else if (crit) dmg *= src.critMult;
    if (opts.vsMarked && target.marked > 0) dmg *= opts.vsMarked;
    if (!opts.ignoreDef) {
      const def = target.def;
      dmg *= 1 - def / (def + 60 + 8 * src.level);
    }
    if (target instanceof Enemy && target.boss?.incomingMult) dmg *= target.boss.incomingMult(opts);
    if (target === this.player) dmg *= 1 - ps.stats.dmgReduce;
    dmg = Math.max(1, Math.round(dmg));
    target.hp -= dmg;

    // feedback
    const y = target === this.player ? 2.0 : (target.model?.height ?? 1.6) * target.scale * 0.85 + 0.4;
    const color = opts.color ?? (bf ? '#ff2a3a' : crit ? '#ffd23a' : target === this.player ? '#ff5a5a' : src.team === 'player' && !(src === this.player) ? '#c8d8ff' : '#ffffff');
    this.overlay.add(target.x, y, target.z, String(dmg), color, bf ? 30 : crit ? 24 : target === this.player ? 17 : 17, bf || crit);
    if (bf) {
      this.fx.blackFlash(target.x, y - 0.3, target.z);
      this.sfx('blackflash', target.x, target.z);
      ps.d.domain = Math.min(100, ps.d.domain + 12);
      const bfi = ps.skillLevel('bfInstinct');
      if (bfi) ps.d.ce = Math.min(ps.stats.maxCe, ps.d.ce + bfi * 4);
      // Black Flash briefly heightens focus
      ps.addBuff('zone', 6, { crit: 0.1, bfChance: 0.02 });
    } else if (!opts.quiet) {
      const hc = target.team === 'enemy' ? (crit ? 0xffe0a0 : 0xffffff) : 0xff4a4a;
      this.fx.burst(target.x, y - 0.4, target.z, hc, crit ? 14 : 7, crit ? 6 : 4, 0.16, 0.3);
      if (target.team === 'enemy') this.fx.burst(target.x, y - 0.4, target.z, 0x6a2a8a, 4, 3, 0.25, 0.5, false);
      if (crit) this.fx.hitstop(0.045);
    }
    if (!opts.quiet || bf) this.sfx(bf ? 'punch' : crit ? 'crit' : opts.hitSfx ?? 'hit', target.x, target.z, crit ? 0.9 : 0.6, 0.9 + Math.random() * 0.2);
    if (opts.knock && !(target === this.player && target.invulnT > 0)) target.knockback(src.x, src.z, opts.knock * (bf ? 2 : 1) * (target.isBoss ? 0.2 : 1));
    if (opts.stun && !(target.isBoss && Math.random() < 0.6)) target.stunT = Math.max(target.stunT, target.isBoss ? opts.stun * 0.4 : opts.stun);
    if (opts.slow) { target.slowMul = Math.min(target.slowMul, opts.slow.mult); target.slowT = Math.max(target.slowT, opts.slow.dur); }
    if (opts.mark) { target.marked = Math.min(9, target.marked + 1); target.markT = 8; }
    if (opts.consumeMark) { target.marked = 0; target.markT = 0; }
    if (opts.dot) { target.dotDmg = src.atkPower() * opts.dot.mult; target.dotT = opts.dot.dur; target.dotTick = 0.5; target.dotSrc = src; }

    if (target === this.player) this.player.onHit(dmg);
    else target.onHit(dmg, src);
    if (isPlayerSrc || src instanceof Summon) {
      ps.d.domain = Math.min(100, ps.d.domain + (kind === 'melee' ? 0.9 : kind === 'domain' ? 0 : 0.5));
      if (ps.stats.lifesteal > 0 && isPlayerSrc) this.player.heal(dmg * ps.stats.lifesteal);
    }
    if (target.hp <= 0) this.onZero(target, src);
    return dmg;
  }

  private onZero(target: Actor, src: Actor | null) {
    if (target === this.player) {
      this.player.hp = 0;
      this.player.alive = false;
      this.player.model?.die();
      audio.play('playerDie');
      this.game.onPlayerDeath();
      return;
    }
    if (target instanceof Enemy) this.kill(target, src);
    else if (target instanceof Summon) { target.alive = false; }
  }

  kill(e: Enemy, killer: Actor | null) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.state = 'dead';
    e.model?.die();
    e.spawner?.onDeath(e);
    const ps = this.game.ps!;
    const d = e.d;
    this.sfx(d.deathSfx ?? (e.isBoss ? 'bossDie' : 'curseDie'), e.x, e.z, 0.8);
    this.fx.burst(e.x, 1, e.z, 0x9a4aff, e.isBoss ? 80 : 18, e.isBoss ? 9 : 4, 0.3, 0.9);
    this.fx.burst(e.x, 1, e.z, 0x1a0a20, e.isBoss ? 40 : 10, 3, 0.5, 1.0, false);
    void killer;
    if (d.ai === 'dummy' && d.id === 'dummy') {
      ps.questProgress('kill', 'dummy', 1, this.mapDef.id);
      ps.gainExp(6);
      return;
    }
    ps.d.kills++;
    ps.gainExp(e.st.exp);
    this.overlay.add(e.x, 2.6, e.z, `+${Math.round(e.st.exp * (1 + ps.stats.expBonus))} EXP`, '#b0ffb0', 13);
    ps.questProgress('kill', d.id, 1, this.mapDef.id);
    if (e.isBoss) {
      ps.questProgress('boss', d.id, 1);
      if (this.bossActive?.enemy === e) {
        this.bossActive = null;
        this.bossDom = null;
        music.pop();
        this.game.ui.hud?.setBoss(null);
        this.game.ui.banner('EXORCISED', d.name, '#ffd23a');
        this.fx.flash('#ffffff', 0.6, 0.6);
        this.fx.shake(0.8, 0.6);
        this.fx.hitstop(0.25);
      }
    }
    if (!e.noLoot) this.dropLoot(e);
  }

  private dropLoot(e: Enemy) {
    const ps = this.game.ps!;
    const L = e.level;
    const boss = e.isBoss;
    const n = boss ? 6 : 1;
    for (let i = 0; i < n; i++) if (boss || chance(0.7)) this.loot.push(new Loot(this, e.x, e.z, Math.round(e.st.gold / n * rand(0.6, 1.4)), null));
    const drops: { id: string; qty: number; rarity: 0 | 1 | 2 | 3 }[] = [];
    if (chance(boss ? 1 : 0.17)) drops.push({ id: 'fragment', qty: boss ? randInt(4, 8) : randInt(1, 2), rarity: 0 });
    if (chance(boss ? 0.8 : e.d.grade <= 1 ? 0.06 : 0.012)) drops.push({ id: 'core', qty: 1, rarity: 0 });
    if (chance(boss ? 1 : 0.08)) {
      const pots = L >= 22 ? ['hpL', 'ceL', 'hpM'] : L >= 10 ? ['hpM', 'ceM', 'hpS'] : ['hpS', 'ceS'];
      drops.push({ id: pick(pots), qty: boss ? 3 : 1, rarity: 0 });
    }
    const gearChance = boss ? 1 : 0.06 + (4 - e.d.grade) * 0.01;
    const gearRolls = boss ? 2 : 1;
    for (let g = 0; g < gearRolls; g++) if (chance(gearChance)) {
      const id = randomGear(L, ps.d.cls);
      if (id) drops.push({ id, qty: 1, rarity: boss ? (chance(0.5) ? 2 : 1) : rollRarity(e.d.grade <= 2 ? 0.05 : 0) });
    }
    if (boss && chance(0.35)) {
      const u = uniquesForLevel(L).filter(b => !b.cls || b.cls === ps.d.cls);
      if (u.length) drops.push({ id: pick(u).id, qty: 1, rarity: 3 });
    }
    // quest drops only while needed
    for (const qd of e.d.drops ?? []) {
      const need = Object.entries(ps.d.quests).some(([qid, st]) => st.state !== 'done' && QUEST_BY_ID[qid]?.objectives.some(o => o.type === 'collect' && o.item === qd.item && ps.countItem(qd.item) < o.count));
      if (need && chance(qd.chance)) drops.push({ id: qd.item, qty: 1, rarity: 0 });
    }
    for (const dr of drops) this.loot.push(new Loot(this, e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5), 0, makeItem(dr.id, dr.rarity as 0 | 1 | 2 | 3, dr.qty)));
    void ITEMS;
  }

  damageTargetActor(src: Actor, t: Actor, mult: number, opts: DamageOpts = {}) { return this.applyDamage(src, t, mult, opts); }

  // ------------------------------------------------------------------
  // WorldAPI
  // ------------------------------------------------------------------

  sfx(name: string, x?: number, z?: number, vol = 1, pitch = 1) {
    let pan = 0, att = 1;
    if (x !== undefined && z !== undefined && this.player) {
      const dx = x - this.player.x, dz = z - this.player.z;
      pan = clamp(dx / 14, -0.8, 0.8);
      att = clamp(1.25 - Math.hypot(dx, dz) / 26, 0.15, 1);
    }
    audio.play(name, { vol: vol * att, pan, pitch });
  }

  damageArea(src: DamageSource, x: number, z: number, r: number, mult: number, opts?: DamageOpts) {
    let n = 0;
    for (const t of this.targetsFor(src)) {
      const rr = r + t.radius;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 <= rr * rr) { this.applyDamage(src as unknown as Actor, t, mult, opts); n++; }
    }
    return n;
  }

  damageCone(src: DamageSource, x: number, z: number, dir: number, range: number, arc: number, mult: number, opts?: DamageOpts) {
    let n = 0;
    for (const t of this.targetsFor(src)) {
      const dx = t.x - x, dz = t.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range + t.radius) continue;
      if (d > 0.9 + t.radius && Math.abs(angleDiff(dir, Math.atan2(dx, dz))) > arc / 2 + Math.atan2(t.radius, d)) continue;
      this.applyDamage(src as unknown as Actor, t, mult, opts);
      n++;
    }
    return n;
  }

  damageLine(src: DamageSource, x0: number, z0: number, x1: number, z1: number, width: number, mult: number, opts?: DamageOpts) {
    let n = 0;
    const vx = x1 - x0, vz = z1 - z0;
    const L2 = vx * vx + vz * vz || 1;
    for (const t of this.targetsFor(src)) {
      const k = clamp(((t.x - x0) * vx + (t.z - z0) * vz) / L2, 0, 1);
      const px = x0 + vx * k, pz = z0 + vz * k;
      if (Math.hypot(t.x - px, t.z - pz) <= width / 2 + t.radius) { this.applyDamage(src as unknown as Actor, t, mult, opts); n++; }
    }
    return n;
  }

  damageTarget(src: DamageSource, t: Target, mult: number, opts?: DamageOpts) {
    this.applyDamage(src as unknown as Actor, t as unknown as Actor, mult, opts);
  }

  projectile(p: ProjectileSpec) { this.projectiles.push(new Projectile(this, p)); }

  summon(kind: string, x: number, z: number, opts: { dur: number; power: number; owner: Caster }) {
    const [sx, sz] = this.col.resolve(x, z, 0.4);
    this.summons.push(new Summon(this, kind, sx, sz, opts.owner, opts.dur, opts.power));
  }

  schedule(delay: number, fn: () => void) { this.tasks.push({ t: this.time + delay, fn }); }

  targetsNear(team: 'player' | 'enemy', x: number, z: number, r: number): Target[] {
    const list: Actor[] = team === 'enemy' ? this.enemies.filter(e => e.alive && e.d.ai !== 'dummy' || e.alive && e.d.id === 'dummy') : this.hostileToEnemies();
    return list
      .map(t => ({ t, d: Math.hypot(t.x - x, t.z - z) }))
      .filter(o => o.d <= r + o.t.radius)
      .sort((a, b) => a.d - b.d)
      .map(o => o.t as unknown as Target);
  }

  nearestTarget(team: 'player' | 'enemy', x: number, z: number, r: number): Target | null {
    return this.targetsNear(team, x, z, r)[0] ?? null;
  }

  nearestEnemyActor(x: number, z: number, r: number): Enemy | null {
    let best: Enemy | null = null, bd = r;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z) - e.radius;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  domain(kind: 'shrine' | 'shadow' | 'nails' | 'void' | 'coffin' | 'womb', x: number, z: number, r: number, dur: number) {
    this.fx.domain(kind, x, z, r, dur);
    this.domainOwner = 'player';
    this.domainUntil = this.time + dur;
    this.game.ui.banner('DOMAIN EXPANSION', kind === 'shrine' ? 'Malevolent Shrine' : kind === 'shadow' ? 'Chimera Shadow Garden' : kind === 'nails' ? 'Resonance: Thousand Nails' : 'Unlimited Void', kind === 'shadow' ? '#8a8aff' : '#ff2a3a');
    music.push('domain');
    this.schedule(dur, () => music.pop());
  }

  blocked(x: number, z: number, r: number) { return this.col.blocked(x, z, r); }

  /** Ground warning for incoming enemy attacks. */
  telegraph(shape: 'circle' | 'line', x: number, z: number, size: number, dur: number, color: number, o: { dir?: number; width?: number } = {}) {
    this.fx.telegraph(shape, x, z, size, dur, color, o.dir ?? 0, o.width ?? 1);
  }
}
