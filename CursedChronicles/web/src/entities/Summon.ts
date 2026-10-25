// Megumi's shikigami and Nobara's straw doll: allied actors with simple AI.
import * as THREE from 'three';
import { Actor } from './Actor';
import type { World } from '../world/World';
import { Caster } from '../world/api';
import { buildCreature, CreatureKind } from '../render/models/creatures';
import { ModelHandle } from '../render/models/model';
import { G, PartBag } from '../render/geo';
import { toonMaterial, outlineMaterial } from '../render/toon';
import { RigModel } from '../render/rig';
import { rand } from '../core/util';

function dollModel(): ModelHandle {
  const b = new PartBag();
  b.add(G.cyl(0.03, 0.03, 1.2, 6), 0x5a3a24, { pos: [0, 0.6, 0] });
  b.add(G.ellipsoid(0.22, 0.32, 0.16), 0xc8a85a, { pos: [0, 1.0, 0], colorFn: (x, y, _z, c) => { if (Math.sin(y * 60 + x * 8) > 0.8) c.setHex(0x9a7a3a); } });
  b.add(G.sphere(0.16, 10, 8), 0xc8a85a, { pos: [0, 1.42, 0] });
  b.add(G.box(0.6, 0.08, 0.08), 0xb0904a, { pos: [0, 1.1, 0] });
  b.add(G.cyl(0.015, 0.015, 0.5, 5), 0xd0d0d8, { pos: [0, 1.05, 0.2], rot: [Math.PI / 2, 0, 0], glow: 0.4 });
  b.add(G.sphere(0.04, 6, 4), 0xff2a3a, { pos: [-0.06, 1.45, 0.14], glow: 1.5 });
  b.add(G.sphere(0.04, 6, 4), 0xff2a3a, { pos: [0.06, 1.45, 0.14], glow: 1.5 });
  const geo = b.build();
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const m = new THREE.Mesh(geo, toonMaterial()); m.castShadow = true;
  const o = new THREE.Mesh(geo, outlineMaterial(0.015));
  pivot.add(m, o); root.add(pivot);
  let t = 0;
  const rig = { root, mesh: m, bones: {}, rest: {}, height: 1.6 } as unknown as RigModel;
  return {
    root, rig, height: 1.6, speed: 0, dead: false,
    update(dt) { t += dt; pivot.rotation.z = Math.sin(t * 10) * 0.05; pivot.scale.setScalar(this.dead ? Math.max(0.01, pivot.scale.x - dt * 3) : Math.min(1, t * 4)); },
    play() { /* static */ }, hit() { /* static */ }, die() { this.dead = true; }, revive() { this.dead = false; },
  };
}

export class Summon extends Actor {
  kind: string;
  owner: Caster;
  life: number;
  power: number;
  atkCd = 0;
  targetable = false;
  dives = 0;
  state = 0;
  stateT = 0;
  tgt: Actor | null = null;
  struck = false;

  constructor(world: World, kind: string, x: number, z: number, owner: Caster, dur: number, power: number) {
    super(world);
    this.kind = kind;
    this.owner = owner;
    this.life = dur;
    this.power = power;
    this.team = 'player';
    this.place(x, z);
    this.facing = owner.facing;
    let m: ModelHandle;
    let scale = 1;
    if (kind === 'doll') m = dollModel();
    else {
      m = buildCreature(kind as CreatureKind);
      if (kind === 'elephant') scale = 1.3;
      if (kind === 'toad') scale = 1.2;
    }
    this.setModel(m, scale);
    this.targetable = kind === 'dogWhite' || kind === 'dogBlack' || kind === 'rabbit';
    this.radius = kind === 'elephant' ? 1.6 : kind === 'rabbit' ? 0.25 : 0.45;
    this.maxHp = this.hp = Math.max(50, (world.player.maxHp ?? 100) * (kind === 'rabbit' ? 0.08 : 0.45));
    if (kind === 'elephant') this.hover = 7;
    if (kind === 'nue') this.hover = 0.6;
    this.atkCd = rand(0.1, 0.4);
  }

  get atk() { return this.owner.atkPower() * this.power; }
  get def() { return this.world.player.def * 0.6; }

  update(dt: number) {
    this.updateStatus(dt);
    this.life -= dt;
    this.stateT += dt;
    if (this.life <= 0 || !this.alive) {
      this.world.fx.smoke(this.x, this.z, 0x15151f, 10);
      this.dispose();
      return;
    }
    if (this.atkCd > 0) this.atkCd -= dt;
    switch (this.kind) {
      case 'dogWhite': case 'dogBlack': this.dogAI(dt); break;
      case 'nue': this.nueAI(dt); break;
      case 'elephant': this.hover = Math.max(0, this.hover - dt * 14); break;
      case 'rabbit': this.rabbitAI(dt); break;
      default: break;
    }
    this.syncModel(dt);
  }

  private dogAI(dt: number) {
    const o = this.owner;
    const t = this.world.nearestEnemyActor(o.x, o.z, 13);
    if (t) {
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d > 1.4 + t.radius) {
        const s = 7.5;
        this.move((t.x - this.x) / d * s, (t.z - this.z) / d * s, dt);
        this.faceTowards(t.x, t.z, dt, 12);
      } else {
        this.faceTowards(t.x, t.z, dt, 12);
        if (this.atkCd <= 0) {
          this.atkCd = 0.75;
          this.model?.play('bite', 0.35);
          this.world.schedule(0.15, () => {
            if (!this.alive || !t.alive) return;
            this.world.sfx('bark', this.x, this.z, 0.35, this.kind === 'dogWhite' ? 1.2 : 0.9);
            this.world.damageTargetActor(this, t, 1, { kind: 'summon', hitSfx: 'hit' });
          });
        }
      }
    } else {
      const d = Math.hypot(o.x - this.x, o.z - this.z);
      if (d > 2.5) {
        const s = Math.min(9, d * 2);
        this.move((o.x - this.x) / d * s, (o.z - this.z) / d * s, dt);
        this.faceTowards(o.x, o.z, dt, 10);
      }
    }
  }

  private nueAI(dt: number) {
    // states: 0 seek, 1 dive, 2 leave
    if (this.state === 0) {
      if (!this.tgt || !this.tgt.alive) this.tgt = this.world.nearestEnemyActor(this.owner.x, this.owner.z, 13);
      const t = this.tgt;
      if (!t || this.dives >= 3) { this.state = 2; this.stateT = 0; return; }
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d > 0.6) { const s = 12; this.move((t.x - this.x) / d * s, (t.z - this.z) / d * s, dt); this.faceTowards(t.x, t.z, dt, 10); }
      if (d < 1.2 && this.stateT > 0.35) { this.state = 1; this.stateT = 0; this.struck = false; this.model?.play('dive', 0.5); }
    } else if (this.state === 1) {
      if (!this.struck && this.stateT > 0.25) {
        this.struck = true;
        const x = this.x, z = this.z;
        this.world.fx.lightning(x, 3, z, x + rand(-0.3, 0.3), 0, z + rand(-0.3, 0.3), 0x9ae6ff, 0.18);
        this.world.fx.lightning(x, 3, z, x + rand(-1, 1), 0, z + rand(-1, 1), 0xffffff, 0.08);
        this.world.fx.ring(x, z, 0x9ae6ff, 2, 0.3);
        this.world.fx.burst(x, 0.5, z, 0x9ae6ff, 14, 5, 0.2);
        this.world.sfx('lightning', x, z, 0.8);
        this.world.damageArea(this, x, z, 2.0, 1, { kind: 'summon', stun: 0.4 });
      }
      if (this.stateT > 0.6) { this.dives++; this.state = 0; this.stateT = 0; this.tgt = null; }
    } else {
      this.hover += dt * 6;
      if (this.stateT > 0.6) this.life = 0;
    }
  }

  private rabbitAI(dt: number) {
    if (this.stateT > 0.5) {
      this.stateT = 0;
      const a = rand(0, Math.PI * 2), r = rand(0.5, 3);
      this.tgt = null;
      (this as any).hopX = this.owner.x + Math.cos(a) * r;
      (this as any).hopZ = this.owner.z + Math.sin(a) * r;
    }
    const hx = (this as any).hopX ?? this.x, hz = (this as any).hopZ ?? this.z;
    const d = Math.hypot(hx - this.x, hz - this.z);
    if (d > 0.2) { this.move((hx - this.x) / d * 6, (hz - this.z) / d * 6, dt); this.faceTowards(hx, hz, dt, 12); }
    this.hover = Math.abs(Math.sin(this.world.time * 12 + this.id)) * 0.25;
  }
}
