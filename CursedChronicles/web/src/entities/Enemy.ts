// Cursed spirits: generic AI for every archetype plus hooks for boss scripts.
import * as THREE from 'three';
import { Actor } from './Actor';
import type { World } from '../world/World';
import { EnemyDef, enemyStats, GRADE_COLOR } from '../rpg/enemies';
import { buildCreature, CreatureKind } from '../render/models/creatures';
import { buildCharacter } from '../render/models/characters';
import { wrapHumanoid, ModelHandle } from '../render/models/model';
import { getProp } from '../render/models/props';
import { toonMaterial, outlineMaterial } from '../render/toon';
import { RigModel } from '../render/rig';
import { BossScript, createBoss } from './Bosses';
import { angleDiff, rand } from '../core/util';

export interface SpawnerRef { alive: number; onDeath(e: Enemy): void }

function staticModel(propName: string): ModelHandle {
  const def = getProp(propName);
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(def.geo, toonMaterial());
  mesh.castShadow = true;
  mesh.userData.shared = true;
  const ol = new THREE.Mesh(def.geo, outlineMaterial(0.015));
  ol.userData.shared = true;
  const pivot = new THREE.Group();
  pivot.add(mesh, ol);
  root.add(pivot);
  const rig = { root, mesh: mesh as any, bones: { body: pivot as any }, rest: { body: { pos: new THREE.Vector3(), rot: new THREE.Euler() } }, height: 2.5 } as unknown as RigModel;
  let t = 0, dead = false, hitT = 0;
  return {
    root, rig, height: 2.5, speed: 0, dead,
    update(dt) { t += dt; if (hitT > 0) hitT -= dt; pivot.rotation.z = hitT > 0 ? Math.sin(t * 60) * 0.05 : 0; if (this.dead) { pivot.scale.y = Math.max(0.05, pivot.scale.y - dt * 2); } },
    play() { /* static */ },
    hit() { hitT = 0.2; },
    die() { this.dead = true; },
    revive() { this.dead = false; pivot.scale.y = 1; },
  };
}

export function buildEnemyModel(def: EnemyDef): ModelHandle {
  if (def.model.startsWith('char:')) return wrapHumanoid(buildCharacter(def.model.slice(5)));
  if (def.model.startsWith('static:')) return staticModel(def.model.slice(7));
  return buildCreature(def.model as CreatureKind);
}

export class Enemy extends Actor {
  d: EnemyDef;
  st: ReturnType<typeof enemyStats>;
  state: 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'return' | 'dead' = 'idle';
  stateT = 0;
  atkCd = 0;
  homeX = 0;
  homeZ = 0;
  aggro = false;
  target: Actor | null = null;
  spawner: SpawnerRef | null = null;
  wanderT = 0;
  wx = 0;
  wz = 0;
  deathT = 0;
  boss: BossScript | null = null;
  enrage = 1;
  atkMul = 1;
  defMul = 1;
  zigT = Math.random() * 10;
  lungeV: { x: number; z: number; t: number } | null = null;
  hitPlayerThisLunge = false;
  /** damage taken per source skill (Mahoraga adaptation) */
  adapt: Record<string, number> = {};
  noLoot = false;
  questTag?: string;

  constructor(world: World, def: EnemyDef, x: number, z: number, level?: number) {
    super(world);
    this.d = def;
    this.st = enemyStats(def, level);
    this.level = this.st.level;
    this.maxHp = this.st.hp;
    this.hp = this.st.hp;
    this.radius = def.radius * def.scale * 0.9;
    this.noKnock = !!def.noKnock;
    this.isBoss = def.ai === 'boss';
    this.place(x, z);
    this.homeX = x; this.homeZ = z;
    this.facing = rand(0, Math.PI * 2);
    this.setModel(buildEnemyModel(def), def.scale);
    this.atkCd = rand(0.5, 1.5);
    if (def.boss) this.boss = createBoss(def.boss, this);
  }

  get atk() { return this.st.atk * this.enrage * this.atkMul; }
  get def() { return this.st.def * this.defMul; }
  get gradeColor() { return GRADE_COLOR[this.d.grade]; }

  update(dt: number) {
    this.updateStatus(dt);
    if (!this.alive) {
      this.deathT += dt;
      if (this.deathT > 1.1 && this.model) this.model.root.position.y -= dt * 1.2;
      if (this.deathT > 2.0) this.dispose();
      else this.syncDead(dt);
      return;
    }
    const p = this.world.player;
    const dToP = Math.hypot(p.x - this.x, p.z - this.z);
    // sleep when far away
    if (dToP > 38 && !this.isBoss) {
      if (this.model) this.model.root.visible = false;
      return;
    }
    if (this.model) this.model.root.visible = true;

    if (this.atkCd > 0) this.atkCd -= dt;
    this.stateT += dt;

    if (this.lungeV) {
      this.move(this.lungeV.x, this.lungeV.z, dt);
      this.lungeV.t -= dt;
      if (this.lungeV.t <= 0) this.lungeV = null;
    }

    if (this.stunned) { this.syncModel(dt); return; }
    if (this.d.ai === 'dummy') { this.syncModel(dt); return; }

    if (this.boss && this.boss.update(dt)) { this.syncModel(dt); return; }
    this.think(dt, dToP);
    this.syncModel(dt);
  }

  private syncDead(dt: number) {
    if (!this.model) return;
    this.model.update(dt);
  }

  /** Pick the closest hostile (player or a shikigami). */
  pickTarget(range: number): Actor | null {
    const p = this.world.player;
    let best: Actor | null = p.alive ? p : null;
    let bd = best ? Math.hypot(p.x - this.x, p.z - this.z) : Infinity;
    for (const s of this.world.summons) {
      if (!s.alive || !s.targetable) continue;
      const d = Math.hypot(s.x - this.x, s.z - this.z);
      if (d < bd - 1.5) { bd = d; best = s; }
    }
    return bd <= range ? best : (this.aggro && best && bd < range * 2.2 ? best : null);
  }

  think(dt: number, dToP: number) {
    const d = this.d;
    const spd = d.speed * (this.slowT > 0 ? this.slowMul : 1) * (this.enrage > 1 ? 1.2 : 1);
    if (this.state === 'windup' || this.state === 'strike' || this.state === 'recover') {
      this.runAttack(dt);
      return;
    }
    const t = this.pickTarget(d.aggro);
    if (t && !this.aggro) {
      this.aggro = true;
      if (d.voice && Math.random() < 0.6) this.world.sfx(d.voice, this.x, this.z, 0.6, 0.8 + Math.random() * 0.4);
    }
    this.target = t;
    if (!t) {
      // wander near home / return
      const home = Math.hypot(this.homeX - this.x, this.homeZ - this.z);
      if (home > 18 || this.state === 'return') {
        this.state = home > 1.5 ? 'return' : 'idle';
        if (this.state === 'return') {
          this.moveToward(this.homeX, this.homeZ, spd * 1.2, dt);
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25 * dt);
        }
        this.aggro = false;
        return;
      }
      this.state = 'idle';
      this.aggro = false;
      this.wanderT -= dt;
      if (this.wanderT <= 0 && spd > 0) {
        this.wanderT = rand(2, 5);
        const a = rand(0, Math.PI * 2), r = rand(0, 4);
        this.wx = this.homeX + Math.cos(a) * r; this.wz = this.homeZ + Math.sin(a) * r;
      }
      if (spd > 0 && Math.hypot(this.wx - this.x, this.wz - this.z) > 0.5 && this.wanderT > 1) this.moveToward(this.wx, this.wz, spd * 0.4, dt);
      return;
    }
    // leash
    if (Math.hypot(this.homeX - this.x, this.homeZ - this.z) > 26 && !this.isBoss) { this.state = 'return'; this.target = null; return; }
    this.state = 'chase';
    const dist = Math.hypot(t.x - this.x, t.z - this.z);
    const a = d.attack;
    if (d.ai === 'ranged' || d.ai === 'stationary') {
      this.faceTowards(t.x, t.z, dt, 6);
      if (dist < a.range && this.atkCd <= 0 && !this.world.col.segmentHit(this.x, this.z, t.x, t.z, 0.15)) { this.beginAttack(); return; }
      if (spd > 0) {
        if (dist > a.range * 0.85) this.moveToward(t.x, t.z, spd, dt);
        else if (dist < a.range * 0.45) this.moveToward(this.x * 2 - t.x, this.z * 2 - t.z, spd * 0.8, dt);
        else {
          // strafe
          const side = Math.sin(this.zigT += dt) > 0 ? 1 : -1;
          const nx = -(t.z - this.z) / dist * side, nz = (t.x - this.x) / dist * side;
          this.move(nx * spd * 0.5, nz * spd * 0.5, dt);
        }
      }
      return;
    }
    const reach = a.range + t.radius * 0.5;
    if (dist <= reach && this.atkCd <= 0) { this.beginAttack(); return; }
    if (dist > reach * 0.8) {
      let tx = t.x, tz = t.z;
      if (d.ai === 'flyer') {
        this.zigT += dt * 3;
        const px = -(t.z - this.z) / dist, pz = (t.x - this.x) / dist;
        tx += px * Math.sin(this.zigT) * 2.5; tz += pz * Math.sin(this.zigT) * 2.5;
      }
      this.moveToward(tx, tz, spd * (d.ai === 'charger' && dist > 4 ? 1.25 : 1), dt);
    } else {
      this.faceTowards(t.x, t.z, dt, 8);
    }
    void dToP;
  }

  moveToward(tx: number, tz: number, spd: number, dt: number) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    this.move((dx / d) * spd, (dz / d) * spd, dt);
    this.faceTowards(tx, tz, dt, 10);
  }

  beginAttack() {
    const a = this.d.attack;
    this.state = 'windup';
    this.stateT = 0;
    this.hitPlayerThisLunge = false;
    const dur = a.windup + 0.3;
    if (a.anim) this.model?.play(a.anim, dur);
    else this.model?.play('attack', dur);
    if (a.kind === 'aoe') this.world.telegraph('circle', this.x, this.z, (a.radius ?? 2.5) * Math.max(1, this.d.scale * 0.8), a.windup, 0xff3a3a);
    if (a.kind === 'explode') {
      this.flashColor = 0xff3030;
      this.world.telegraph('circle', this.x, this.z, a.radius ?? 2.4, a.windup, 0xff6a2a);
      this.world.sfx('charge', this.x, this.z, 0.5, 1.5);
    }
  }

  private runAttack(dt: number) {
    const a = this.d.attack;
    const t = this.target;
    if (this.state === 'windup') {
      if (t && a.kind !== 'explode') this.faceTowards(t.x, t.z, dt, a.kind === 'projectile' ? 8 : 4);
      if (a.kind === 'explode') { this.flashT = 0.12 * (0.5 + 0.5 * Math.sin(this.stateT * 30)); }
      if (this.stateT >= a.windup) {
        this.state = 'strike';
        this.stateT = 0;
        this.strike();
      }
    } else if (this.state === 'strike') {
      if (this.lungeV && !this.hitPlayerThisLunge) {
        const p = this.world.player;
        if (Math.hypot(p.x - this.x, p.z - this.z) < this.radius + p.radius + 0.5) {
          this.hitPlayerThisLunge = true;
          this.world.damageTargetActor(this, p, a.mult, { kind: 'melee', hitSfx: a.sfx });
        }
      }
      if (this.stateT > 0.25) { this.state = 'recover'; this.stateT = 0; }
    } else if (this.state === 'recover') {
      if (this.stateT > 0.35) { this.state = 'chase'; this.atkCd = a.cd * rand(0.85, 1.2) / (this.enrage > 1 ? 1.3 : 1); }
    }
  }

  private strike() {
    const a = this.d.attack;
    const w = this.world;
    const t = this.target;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    switch (a.kind) {
      case 'melee': {
        if (a.sfx) w.sfx('swing', this.x, this.z, 0.5);
        w.damageCone(this, this.x, this.z, this.facing, a.range * Math.max(1, this.d.scale * 0.7) + 0.3, 1.6, a.mult, { kind: 'melee', hitSfx: a.sfx });
        break;
      }
      case 'lunge': {
        this.lungeV = { x: fx * 9, z: fz * 9, t: 0.2 };
        if (a.sfx) w.sfx(a.sfx, this.x, this.z, 0.5);
        break;
      }
      case 'projectile': {
        if (!t) break;
        const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 1;
        w.sfx(a.sfx ?? 'swing', this.x, this.z, 0.6);
        w.projectile({ x: this.x + fx * 0.5, z: this.z + fz * 0.5, dirX: dx / d, dirZ: dz / d, speed: a.projSpeed ?? 10, range: a.range + 3, radius: 0.4, mult: a.mult, visual: a.proj ?? 'orb', color: a.color, team: 'enemy', fromCaster: this as any, opts: { kind: 'proj' } });
        break;
      }
      case 'aoe': {
        const r = (a.radius ?? 2.5) * Math.max(1, this.d.scale * 0.8);
        w.sfx(a.sfx ?? 'shockwave', this.x, this.z, 0.7);
        w.fx.shockwave(this.x, this.z, r, 0xd08a5a);
        w.damageArea(this, this.x, this.z, r, a.mult, { kind: 'melee', knock: 1.5 });
        break;
      }
      case 'explode': {
        const r = a.radius ?? 2.4;
        w.sfx('explosion', this.x, this.z);
        w.fx.shockwave(this.x, this.z, r, 0xff6a3a);
        w.fx.burst(this.x, 0.6, this.z, 0xc8607a, 30, 7, 0.35, 0.7, false);
        w.fx.burst(this.x, 0.6, this.z, 0xff8a4a, 20, 6, 0.3, 0.5);
        w.damageArea(this, this.x, this.z, r, a.mult, { kind: 'melee', knock: 2.5 });
        this.hp = 0;
        w.kill(this, null);
        break;
      }
    }
  }

  onHit(dmg: number, src: Actor | null) {
    if (!this.aggro) { this.aggro = true; this.target = src ?? this.world.player; }
    this.model?.hit();
    this.flashT = 0.12;
    this.flashColor = 0xffffff;
    // interrupt weak enemies' windups on big hits
    if (!this.isBoss && this.state === 'windup' && dmg > this.maxHp * 0.25 && this.d.attack.kind !== 'explode') { this.state = 'recover'; this.stateT = 0; }
    this.boss?.onHit?.(dmg, src);
  }

  /** small helper for boss scripts */
  angleTo(x: number, z: number) { return Math.abs(angleDiff(this.facing, Math.atan2(x - this.x, z - this.z))); }
}
