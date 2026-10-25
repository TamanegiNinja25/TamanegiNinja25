// Boss attack patterns. Each boss is a small move-set with telegraphs, phases
// and, for the special grades, a domain expansion the player can clash with.
import type { Enemy } from './Enemy';
import type { Actor } from './Actor';
import { DamageOpts } from '../world/api';
import { rand, pick, TAU } from '../core/util';

export interface BossScript {
  update(dt: number): boolean;
  onHit?(dmg: number, src: Actor | null): void;
  incomingMult?(opts: DamageOpts): number;
  phase: number;
}

interface Move {
  id: string;
  cd: number;
  dur: number;
  min?: number;      // min distance to target
  max?: number;      // max distance
  phase?: number;    // available from this phase on
  weight?: number;
  run: () => void;
}

abstract class BossBase implements BossScript {
  e: Enemy;
  busy = 0;
  cds: Record<string, number> = {};
  phase = 0;
  private fired = new Set<string>();
  intro = true;

  constructor(e: Enemy) { this.e = e; }
  get w() { return this.e.world; }
  get t() { return this.e.target ?? this.w.player; }
  get hpPct() { return this.e.hp / this.e.maxHp; }

  abstract moves(): Move[];
  /** hp thresholds -> one-shot events */
  phases(): { at: number; id: string; run: () => void }[] { return []; }

  once(id: string, fn: () => void) { if (!this.fired.has(id)) { this.fired.add(id); fn(); } }

  update(dt: number): boolean {
    for (const k in this.cds) this.cds[k] -= dt;
    if (this.busy > 0) { this.busy -= dt; return true; }
    const e = this.e;
    for (const p of this.phases()) if (this.hpPct <= p.at) this.once(p.id, () => { this.phase++; p.run(); });
    const t = this.t;
    if (!t.alive) return false;
    const dist = Math.hypot(t.x - e.x, t.z - e.z);
    if (dist > e.d.aggro * 1.6 && !e.aggro) return false;
    e.aggro = true;
    e.target = t;
    const avail = this.moves().filter(m => (this.cds[m.id] ?? 0) <= 0 && (m.min === undefined || dist >= m.min) && (m.max === undefined || dist <= m.max) && (m.phase === undefined || this.phase >= m.phase));
    if (avail.length && e.atkCd <= 0) {
      let tot = 0;
      for (const m of avail) tot += m.weight ?? 1;
      let r = Math.random() * tot;
      let mv = avail[0];
      for (const m of avail) { r -= m.weight ?? 1; if (r <= 0) { mv = m; break; } }
      e.faceTowards(t.x, t.z, 1, 99);
      mv.run();
      this.busy = mv.dur;
      this.cds[mv.id] = mv.cd;
      e.atkCd = 0.35 / e.enrage;
      return true;
    }
    // close distance
    const spd = e.d.speed * (e.slowT > 0 ? e.slowMul : 1) * (e.enrage > 1 ? 1.15 : 1);
    if (dist > 2.2) e.moveToward(t.x, t.z, spd, dt);
    else e.faceTowards(t.x, t.z, dt, 6);
    return true;
  }

  // ---------------- helpers ----------------
  anim(a: string, d: number) { this.e.model?.play(a, d); }

  slam(x: number, z: number, r: number, mult: number, windup: number, color = 0xff3a3a, sfx = 'shockwave', opts: DamageOpts = {}) {
    this.w.telegraph('circle', x, z, r, windup, color);
    this.w.schedule(windup, () => {
      if (!this.e.alive) return;
      this.w.sfx(sfx, x, z);
      this.w.fx.shockwave(x, z, r, color);
      this.w.fx.shake(0.35);
      this.w.damageArea(this.e, x, z, r, mult, { kind: 'melee', knock: 2, ...opts });
    });
  }

  line(dir: number, len: number, width: number, mult: number, windup: number, color: number, sfx: string, visual?: (x0: number, z0: number, x1: number, z1: number) => void, opts: DamageOpts = {}) {
    const e = this.e;
    const x0 = e.x, z0 = e.z;
    const x1 = x0 + Math.sin(dir) * len, z1 = z0 + Math.cos(dir) * len;
    this.w.telegraph('line', x0, z0, len, windup, color, { dir, width });
    this.w.schedule(windup, () => {
      if (!e.alive) return;
      this.w.sfx(sfx, x0, z0);
      visual?.(x0, z0, x1, z1);
      this.w.damageLine(e, x0, z0, x1, z1, width, mult, { kind: 'skill', ...opts });
    });
  }

  volley(n: number, spread: number, visual: any, speed: number, mult: number, color?: number, homing = 0) {
    const e = this.e, t = this.t;
    const base = Math.atan2(t.x - e.x, t.z - e.z);
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      this.w.projectile({ x: e.x + Math.sin(a), z: e.z + Math.cos(a), dirX: Math.sin(a), dirZ: Math.cos(a), speed, range: 16, radius: 0.5, mult, visual, color, team: 'enemy', fromCaster: e as any, homing, opts: { kind: 'proj' } });
    }
  }

  ringBurst(n: number, visual: any, speed: number, mult: number, color?: number, offset = 0) {
    const e = this.e;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + offset;
      this.w.projectile({ x: e.x + Math.sin(a) * 0.8, z: e.z + Math.cos(a) * 0.8, dirX: Math.sin(a), dirZ: Math.cos(a), speed, range: 14, radius: 0.5, mult, visual, color, team: 'enemy', fromCaster: e as any, opts: { kind: 'proj' } });
    }
  }

  charge(speed: number, dur: number, mult: number, windup = 0.5) {
    const e = this.e, t = this.t;
    const dir = Math.atan2(t.x - e.x, t.z - e.z);
    this.w.telegraph('line', e.x, e.z, speed * dur, windup, 0xff4a3a, { dir, width: e.radius * 2 + 0.6 });
    this.w.schedule(windup, () => {
      if (!e.alive) return;
      e.facing = dir;
      e.lungeV = { x: Math.sin(dir) * speed, z: Math.cos(dir) * speed, t: dur };
      e.hitPlayerThisLunge = false;
      this.anim('dash', dur);
      this.w.sfx('dash', e.x, e.z, 1, 0.6);
      const steps = Math.ceil(dur / 0.08);
      for (let i = 1; i <= steps; i++) this.w.schedule(i * 0.08, () => {
        if (!e.alive || e.hitPlayerThisLunge) return;
        const p = this.w.player;
        if (Math.hypot(p.x - e.x, p.z - e.z) < e.radius + p.radius + 0.6) {
          e.hitPlayerThisLunge = true;
          this.w.damageTargetActor(e, p, mult, { kind: 'melee', knock: 3, hitSfx: 'punch' });
        }
      });
    });
  }

  combo(n: number, mult: number, gap: number, anims: string[], sfx = 'slash', range = 3, arc = 1.8) {
    const e = this.e;
    for (let i = 0; i < n; i++) this.w.schedule(i * gap, () => {
      if (!e.alive) return;
      const t = this.t;
      e.faceTowards(t.x, t.z, 1, 99);
      const d = Math.hypot(t.x - e.x, t.z - e.z);
      if (d > range * 0.8) e.lungeV = { x: Math.sin(e.facing) * 8, z: Math.cos(e.facing) * 8, t: 0.12 };
      this.anim(anims[i % anims.length], gap * 0.95);
      this.w.schedule(gap * 0.45, () => {
        if (!e.alive) return;
        this.w.fx.slash(e.x, e.z, e.facing, range * 0.8, 0xffd0d0, arc, i % 2 ? 0.8 : -0.8);
        this.w.sfx('swing', e.x, e.z, 0.7);
        this.w.damageCone(e, e.x, e.z, e.facing, range, arc, mult, { kind: 'melee', hitSfx: sfx, knock: 0.8 });
      });
    });
  }

  summonAdds(id: string, n: number, r = 4) {
    const e = this.e;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(0, 1);
      const x = e.x + Math.sin(a) * r, z = e.z + Math.cos(a) * r;
      if (this.w.col.blocked(x, z, 0.6)) continue;
      this.w.fx.sigil(x, z, 1.2, 0x8a2a4a, 0.8);
      this.w.fx.smoke(x, z, 0x2a1a2a, 10);
      this.w.schedule(0.5, () => { if (e.alive) this.w.spawnEnemy(id, x, z, e.level - 3, true); });
    }
  }

  domain(kind: string, r: number, dur: number, dpsPct: number, banner: string) {
    this.anim('domain', 1.4);
    this.w.bossDomain(this.e, kind, r, dur, dpsPct, banner);
  }

  teleportNear(dist = 3) {
    const e = this.e, t = this.t;
    for (let k = 0; k < 8; k++) {
      const a = rand(0, TAU);
      const x = t.x + Math.sin(a) * dist, z = t.z + Math.cos(a) * dist;
      if (!this.w.col.blocked(x, z, e.radius)) {
        this.w.fx.smoke(e.x, e.z, 0x111111, 12);
        e.place(x, z);
        this.w.fx.smoke(x, z, 0x111111, 12);
        this.w.sfx('teleport', x, z);
        e.faceTowards(t.x, t.z, 1, 99);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------

class Glutton extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'slam', cd: 3.5, dur: 1.3, max: 4.5, weight: 3, run: () => { this.anim('slam', 1.1); this.slam(e.x + Math.sin(e.facing) * 1.8, e.z + Math.cos(e.facing) * 1.8, 3.2, 1.5, 0.85, 0xff4a3a, 'shockwave'); } },
      { id: 'charge', cd: 6, dur: 1.6, min: 4, weight: 2, run: () => { this.w.sfx('roar', e.x, e.z, 0.6, 1.2); this.charge(11, 0.6, 1.6, 0.7); } },
      { id: 'vomit', cd: 5, dur: 1.2, min: 2.5, max: 11, weight: 2, run: () => { this.anim('cast', 1.0); this.w.schedule(0.5, () => { if (e.alive) { this.w.sfx('squish', e.x, e.z); this.volley(5, 0.9, 'spit', 9, 1.1, 0x9ad04a); } }); } },
      { id: 'bite', cd: 1.8, dur: 0.9, max: 3.4, weight: 2, run: () => this.combo(2, 1.1, 0.45, ['punch1', 'punch2'], 'punch', 3.4, 2) },
    ];
  }
  phases() {
    return [{ at: 0.5, id: 'adds', run: () => { this.w.sfx('roar', this.e.x, this.e.z); this.summonAdds('flyhead', 4, 3); this.e.enrage = 1.2; this.w.game.toast('The curse calls its brood!', 'boss'); } }];
  }
}

class FingerBearer extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'claws', cd: 2.2, dur: 1.3, max: 3.6, weight: 3, run: () => this.combo(3, 1.0, 0.4, ['slash1', 'slash2', 'slash3'], 'slash', 3.4, 2.0) },
      { id: 'beam', cd: 6, dur: 1.8, min: 3, max: 16, weight: 2, run: () => {
        const dir = Math.atan2(this.t.x - e.x, this.t.z - e.z);
        this.anim('cast', 1.6);
        this.w.sfx('charge', e.x, e.z);
        this.line(dir, 16, 1.6, 2.0, 1.0, 0xff2a4a, 'beam', (x0, z0, x1, z1) => {
          this.w.fx.lightning(x0, 1.6, z0, x1, 1.0, z1, 0xff2a4a, 0.5);
          this.w.fx.lightning(x0, 1.6, z0, x1, 1.0, z1, 0xffd0d0, 0.18);
          this.w.fx.shake(0.4);
        });
      } },
      { id: 'spikes', cd: 7, dur: 1.6, weight: 2, run: () => {
        this.anim('slam', 1.2);
        for (let i = 0; i < 3; i++) {
          const a = rand(0, TAU), r = i === 0 ? 0 : rand(1.5, 3.5);
          const x = this.t.x + Math.sin(a) * r, z = this.t.z + Math.cos(a) * r;
          this.w.schedule(i * 0.2, () => {
            this.w.telegraph('circle', x, z, 1.8, 0.8, 0xff3a3a);
            this.w.schedule(0.8, () => { if (!e.alive) return; this.w.fx.spikes(x, z, 1.6, 0x3a4a3a, 9); this.w.sfx('roots', x, z); this.w.damageArea(e, x, z, 1.8, 1.4, { kind: 'skill' }); });
          });
        }
      } },
      { id: 'leap', cd: 8, dur: 1.5, min: 4, weight: 1, run: () => {
        const tx = this.t.x, tz = this.t.z;
        this.anim('slam', 1.2);
        this.slam(tx, tz, 3.2, 1.8, 1.0, 0xff3a3a, 'land');
        this.w.schedule(0.75, () => { if (e.alive) { this.w.fx.smoke(e.x, e.z, 0x333333, 10); e.place(tx, tz); } });
      } },
    ];
  }
  phases() {
    return [
      { at: 0.6, id: 'w1', run: () => { this.summonAdds('womb', 3, 4); this.w.game.toast('More curses hatch from the womb!', 'boss'); } },
      { at: 0.3, id: 'w2', run: () => { this.summonAdds('womb', 4, 4); this.e.enrage = 1.3; this.w.sfx('roar', this.e.x, this.e.z); } },
    ];
  }
}

class Mahito extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'blade', cd: 1.8, dur: 1.2, max: 3.4, weight: 3, run: () => this.combo(3, 0.95, 0.36, ['slash1', 'slash2', 'thrust'], 'slash', 3.2, 1.8) },
      { id: 'grab', cd: 7, dur: 1.4, max: 4, weight: 2, run: () => {
        this.anim('cast', 1.2);
        this.w.game.toast('Idle Transfiguration! Get away from his hands!', 'boss', 1.2);
        this.slam(e.x + Math.sin(e.facing) * 1.5, e.z + Math.cos(e.facing) * 1.5, 2.2, 3.0, 0.9, 0x7ac0dc, 'squish', { stun: 1.2 });
      } },
      { id: 'dash', cd: 5, dur: 1.2, min: 4, weight: 2, run: () => { this.charge(16, 0.45, 1.5, 0.55); } },
      { id: 'spikes', cd: 6, dur: 1.2, min: 2, max: 12, weight: 1.5, run: () => {
        this.anim('throw', 0.8);
        this.w.schedule(0.4, () => { if (e.alive) { this.w.sfx('squish', e.x, e.z); this.volley(7, 1.4, 'thorn', 11, 1.0, 0x9aa0b0); } });
      } },
      { id: 'blink', cd: 6, dur: 0.6, min: 6, weight: 1, run: () => this.teleportNear(2.5) },
    ];
  }
  phases() {
    return [
      { at: 0.7, id: 'adds', run: () => { this.summonAdds('transfigured', 3, 4); this.w.game.toast('"Let\'s play with your friends!"', 'boss'); } },
      { at: 0.4, id: 'adds2', run: () => { this.summonAdds('bloated', 2, 4); } },
      { at: 0.28, id: 'domain', run: () => { this.e.enrage = 1.25; this.domain('hands', 11, 7, 0.07, 'Domain Expansion: Self-Embodiment of Perfection'); } },
    ];
  }
}

class Todo extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'punches', cd: 1.6, dur: 1.2, max: 3, weight: 3, run: () => this.combo(3, 1.0, 0.33, ['punch1', 'punch2', 'kick'], 'punch', 2.6, 1.8) },
      { id: 'clap', cd: 5, dur: 1.1, max: 14, weight: 2.5, run: () => {
        // Boogie Woogie: swap places with the player, then strike
        this.anim('clap', 0.5);
        this.w.sfx('clap', e.x, e.z);
        this.w.fx.ring(e.x, e.z, 0xffffff, 2, 0.3);
        this.w.schedule(0.2, () => {
          if (!e.alive) return;
          const p = this.w.player;
          const px = p.x, pz = p.z;
          if (this.w.domainOwner === 'player') return;
          p.place(e.x, e.z);
          e.place(px, pz);
          this.w.fx.burst(px, 1, pz, 0xffffff, 16, 4, 0.2);
          this.w.fx.burst(p.x, 1, p.z, 0xffffff, 16, 4, 0.2);
          this.w.sfx('teleport', p.x, p.z);
          e.faceTowards(p.x, p.z, 1, 99);
        });
        this.w.schedule(0.45, () => { if (e.alive) this.combo(1, 1.3, 0.4, ['uppercut'], 'punch', 2.8, 1.6); });
      } },
      { id: 'rock', cd: 4.5, dur: 0.9, min: 4, weight: 1.5, run: () => { this.anim('throw', 0.8); this.w.schedule(0.35, () => { if (e.alive) { this.w.sfx('swingHeavy', e.x, e.z); this.volley(1, 0, 'orb', 13, 1.5, 0x8a7a6a); } }); } },
      { id: 'bf', cd: 9, dur: 1.4, max: 4, phase: 1, weight: 1.5, run: () => {
        this.anim('uppercut', 1.0);
        this.w.sfx('charge', e.x, e.z);
        this.slam(e.x + Math.sin(e.facing) * 1.4, e.z + Math.cos(e.facing) * 1.4, 2.2, 2.6, 0.8, 0xff2a3a, 'blackflash', { knock: 4 });
        this.w.schedule(0.8, () => { if (e.alive) this.w.fx.blackFlash(e.x + Math.sin(e.facing) * 1.4, 1.2, e.z + Math.cos(e.facing) * 1.4); });
      } },
    ];
  }
  phases() { return [{ at: 0.5, id: 'bf', run: () => { this.w.game.toast('"Now, BROTHER! Show me your Black Flash!"', 'boss'); this.e.enrage = 1.15; } }]; }
}

class Hanami extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'roots', cd: 4, dur: 1.4, weight: 3, run: () => {
        this.anim('slam', 1.1);
        const base = Math.atan2(this.t.x - e.x, this.t.z - e.z);
        for (const off of [-0.35, 0, 0.35]) this.line(base + off, 13, 1.3, 1.4, 0.9, 0x8aff6a, 'roots', (x0, z0, x1, z1) => {
          for (let i = 1; i <= 6; i++) { const k = i / 6; this.w.fx.spikes(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, 0.6, 0x6b4a2e, 3); }
        });
      } },
      { id: 'seeds', cd: 5, dur: 1.2, min: 3, weight: 2, run: () => {
        this.anim('cast', 1.0);
        this.w.schedule(0.4, () => { if (!e.alive) return; this.w.sfx('roots', e.x, e.z); this.volley(5, 1.2, 'seed', 9, 1.2, 0x9a7a4a); });
      } },
      { id: 'swipe', cd: 2, dur: 1.0, max: 3.5, weight: 2, run: () => this.combo(2, 1.2, 0.45, ['slash1', 'slash2'], 'roots', 3.4, 2.2) },
      { id: 'bloom', cd: 9, dur: 1.2, weight: 1, run: () => { this.anim('castUp', 1); this.w.sfx('flower', e.x, e.z); this.summonAdds('bud', 3, 3.5); } },
      { id: 'sea', cd: 12, dur: 2.4, phase: 1, min: 3, weight: 2, run: () => {
        const dir = Math.atan2(this.t.x - e.x, this.t.z - e.z);
        this.anim('cast', 2.2);
        this.w.game.toast('Ceremonial Sea of Light!', 'boss', 1.2);
        this.w.sfx('charge', e.x, e.z);
        this.line(dir, 18, 3.2, 3.2, 1.6, 0xfff0a0, 'beam', (x0, z0, x1, z1) => {
          this.w.fx.lightning(x0, 1.5, z0, x1, 1, z1, 0xfff4c0, 0.9);
          this.w.fx.lightning(x0, 1.5, z0, x1, 1, z1, 0xffffff, 0.3);
          this.w.fx.shake(0.6);
        });
      } },
    ];
  }
  phases() { return [{ at: 0.45, id: 'p2', run: () => { this.e.enrage = 1.2; this.w.game.toast('The flower on Hanami\'s shoulder begins to glow…', 'boss'); } }]; }
}

class Dagon extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'wave', cd: 4.5, dur: 1.3, weight: 3, run: () => { this.anim('slam', 1.0); this.w.schedule(0.6, () => { if (e.alive) { this.w.sfx('wave', e.x, e.z); this.ringBurst(14, 'water', 7, 1.2, 0x5ab0ff, rand(0, 1)); } }); } },
      { id: 'tentacle', cd: 2.5, dur: 1.2, max: 4.5, weight: 2, run: () => { this.anim('slam', 1.0); this.slam(e.x + Math.sin(e.facing) * 2, e.z + Math.cos(e.facing) * 2, 3, 1.6, 0.8, 0x5ab0ff, 'water'); } },
      { id: 'fish', cd: 9, dur: 1.0, weight: 1.5, run: () => { this.w.sfx('water', e.x, e.z); this.summonAdds('fish', 4, 3.5); } },
      { id: 'geyser', cd: 6, dur: 1.6, weight: 2, run: () => {
        for (let i = 0; i < 4; i++) this.w.schedule(i * 0.25, () => {
          const x = this.t.x + rand(-1.5, 1.5), z = this.t.z + rand(-1.5, 1.5);
          this.w.telegraph('circle', x, z, 1.6, 0.8, 0x5ab0ff);
          this.w.schedule(0.8, () => { if (!e.alive) return; this.w.fx.pillar(x, z, 1.2, 5, 0x6ac0ff, 0.6); this.w.sfx('water', x, z, 0.6); this.w.damageArea(e, x, z, 1.6, 1.3, { kind: 'skill' }); });
        });
      } },
    ];
  }
  phases() { return [{ at: 0.5, id: 'domain', run: () => { this.domain('sea', 12, 8, 0.06, 'Domain Expansion: Horizon of the Captivating Skandha'); this.summonAdds('fish', 4, 4); } }]; }
}

class Jogo extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'fireballs', cd: 3, dur: 1.0, min: 2, weight: 3, run: () => { this.anim('throw', 0.8); this.w.schedule(0.35, () => { if (e.alive) { this.w.sfx('fireball', e.x, e.z); this.volley(3, 0.6, 'fireball', 12, 1.3, 0xff6a1a); } }); } },
      { id: 'insects', cd: 7, dur: 1.0, weight: 2, run: () => { this.anim('castUp', 0.8); this.w.sfx('fire', e.x, e.z); this.ringBurst(8, 'ember', 6, 0.8, 0xffaa3a); this.volley(3, 1.2, 'ember', 7, 0.8, 0xffaa3a, 3); } },
      { id: 'eruption', cd: 6, dur: 1.8, weight: 2.5, run: () => {
        this.anim('slam', 1);
        for (let i = 0; i < 5; i++) this.w.schedule(i * 0.18, () => {
          const x = this.t.x + rand(-2.5, 2.5), z = this.t.z + rand(-2.5, 2.5);
          this.w.telegraph('circle', x, z, 1.7, 0.9, 0xff6a1a);
          this.w.schedule(0.9, () => { if (!e.alive) return; this.w.fx.pillar(x, z, 1.2, 6, 0xff5a10, 0.7); this.w.fx.embers(x, z, 1.5, 0xff8a2a, 12); this.w.sfx('fire', x, z, 0.6); this.w.damageArea(e, x, z, 1.7, 1.5, { kind: 'skill', dot: { mult: 0.15, dur: 3 } }); });
        });
      } },
      { id: 'punch', cd: 2, dur: 1.0, max: 3, weight: 2, run: () => this.combo(2, 1.2, 0.4, ['punch1', 'punch2'], 'fire', 2.6, 1.8) },
      { id: 'meteor', cd: 16, dur: 3.2, phase: 1, weight: 3, run: () => {
        this.anim('castUp', 3);
        this.w.game.toast('Maximum: METEOR! Get out of the shadow!', 'boss', 1.6);
        this.w.sfx('meteor', e.x, e.z);
        this.slam(e.x, e.z, 7.5, 4.0, 2.4, 0xff4a0a, 'explosion', { dot: { mult: 0.2, dur: 3 } });
        this.w.schedule(2.4, () => { if (e.alive) { this.w.fx.pillar(e.x, e.z, 6, 12, 0xff6a1a, 1.0); this.w.fx.embers(e.x, e.z, 7, 0xff8a2a, 40); this.w.fx.shake(1.0, 0.6); } });
      } },
    ];
  }
  phases() {
    return [
      { at: 0.55, id: 'p2', run: () => { this.w.game.toast('"Weaklings like you should just burn!"', 'boss'); this.e.enrage = 1.15; } },
      { at: 0.25, id: 'domain', run: () => { this.domain('coffin', 12, 8, 0.075, 'Domain Expansion: Coffin of the Iron Mountain'); } },
    ];
  }
}

class Sukuna extends BossBase {
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'cleave', cd: 1.8, dur: 1.1, max: 3.2, weight: 3, run: () => this.combo(3, 1.05, 0.33, ['slash1', 'slash2', 'slash3'], 'dismantle', 3, 2) },
      { id: 'dismantle', cd: 4, dur: 1.2, min: 2, weight: 3, run: () => {
        this.anim('slash2', 0.8);
        const base = Math.atan2(this.t.x - e.x, this.t.z - e.z);
        for (const off of [-0.5, -0.2, 0.2, 0.5]) this.line(base + off, 14, 0.9, 1.3, 0.65, 0xffffff, 'dismantle', (x0, z0, x1, z1) => {
          for (let i = 1; i <= 5; i++) { const k = i / 5; this.w.fx.slash(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, base + off + Math.PI / 2, 1.2, 0xffffff, 0.8, 0.5); }
        });
      } },
      { id: 'blink', cd: 4, dur: 0.7, min: 5, weight: 1.5, run: () => { this.teleportNear(2); this.w.schedule(0.2, () => { if (e.alive) this.combo(1, 1.3, 0.4, ['uppercut'], 'punch', 2.8, 1.8); }); } },
      { id: 'fuga', cd: 14, dur: 2.6, phase: 1, min: 3, weight: 3, run: () => {
        const dir = Math.atan2(this.t.x - e.x, this.t.z - e.z);
        this.anim('throw', 2.2);
        this.w.game.toast('"Open." — Fuga!', 'boss', 1.4);
        this.w.sfx('charge', e.x, e.z);
        this.w.sfx('fire', e.x, e.z);
        this.line(dir, 20, 2.6, 3.4, 1.6, 0xff5a10, 'explosion', (x0, z0, x1, z1) => {
          this.w.fx.lightning(x0, 1.4, z0, x1, 1, z1, 0xff6a1a, 0.9);
          for (let i = 1; i <= 8; i++) { const k = i / 8; this.w.fx.pillar(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, 1.4, 5, 0xff5a10, 0.8); }
          this.w.fx.shake(0.9, 0.5);
        }, { dot: { mult: 0.25, dur: 4 } });
      } },
    ];
  }
  phases() {
    return [
      { at: 0.65, id: 'p2', run: () => { this.w.game.toast('"Know your place, fool."', 'boss'); this.e.enrage = 1.15; } },
      { at: 0.35, id: 'domain', run: () => { this.e.enrage = 1.3; this.domain('shrine', 13, 9, 0.08, 'Domain Expansion: Malevolent Shrine'); } },
    ];
  }
}

class Mahoraga extends BossBase {
  hits: Record<string, number> = {};
  adapted = new Set<string>();
  moves(): Move[] {
    const e = this.e;
    return [
      { id: 'sword', cd: 1.6, dur: 1.2, max: 4, weight: 3, run: () => this.combo(3, 1.1, 0.38, ['slash1', 'slash2', 'thrust'], 'slash', 3.8, 2.0) },
      { id: 'leap', cd: 6, dur: 1.6, min: 4, weight: 2, run: () => {
        const tx = this.t.x, tz = this.t.z;
        this.anim('slam', 1.3);
        this.slam(tx, tz, 3.4, 2.0, 1.0, 0xffffff, 'land');
        this.w.schedule(0.8, () => { if (e.alive) { e.place(tx, tz); } });
      } },
      { id: 'charge', cd: 5, dur: 1.4, min: 5, weight: 1.5, run: () => this.charge(14, 0.6, 1.8, 0.6) },
      { id: 'quake', cd: 8, dur: 1.4, weight: 1.5, run: () => { this.anim('slam', 1.1); this.slam(e.x, e.z, 5, 1.8, 1.0, 0xd8b04a, 'shockwave'); } },
    ];
  }
  onHit(_dmg: number, _src: Actor | null) { /* adaptation handled in incomingMult */ }
  incomingMult(opts: DamageOpts) {
    const k = opts.kind ?? 'melee';
    this.hits[k] = (this.hits[k] ?? 0) + 1;
    if (!this.adapted.has(k) && this.hits[k] >= 14) {
      this.adapted.add(k);
      this.w.sfx('bell', this.e.x, this.e.z);
      this.w.fx.ring(this.e.x, this.e.z, 0xd8b04a, 3, 0.6);
      this.w.game.toast(`The wheel turns… Mahoraga has adapted to ${k === 'melee' ? 'your strikes' : k === 'proj' ? 'projectiles' : k === 'summon' ? 'shikigami' : 'your techniques'}!`, 'boss', 1.8);
    }
    return this.adapted.has(k) ? 0.35 : 1;
  }
}

export function createBoss(id: string, e: Enemy): BossScript | null {
  switch (id) {
    case 'glutton': return new Glutton(e);
    case 'fingerBearer': return new FingerBearer(e);
    case 'mahito': return new Mahito(e);
    case 'todo': return new Todo(e);
    case 'hanami': return new Hanami(e);
    case 'dagon': return new Dagon(e);
    case 'jogo': return new Jogo(e);
    case 'sukuna': return new Sukuna(e);
    case 'mahoraga': return new Mahoraga(e);
  }
  return null;
}

export { pick };
