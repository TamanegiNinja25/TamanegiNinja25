// Base class for everything that moves, fights and can be hit.
import * as THREE from 'three';
import type { World } from '../world/World';
import { ModelHandle } from '../render/models/model';
import { setModelFlash } from '../render/rig';
import { approachAngle } from '../core/util';

let nextId = 1;

export abstract class Actor {
  id = nextId++;
  world: World;
  x = 0;
  z = 0;
  y = 0;
  facing = 0;
  radius = 0.45;
  team: 'player' | 'enemy' = 'enemy';
  model: ModelHandle | null = null;
  alive = true;
  protected _hp = 1;
  protected _maxHp = 1;
  protected _level = 1;
  get hp() { return this._hp; }
  set hp(v: number) { this._hp = v; }
  get maxHp() { return this._maxHp; }
  set maxHp(v: number) { this._maxHp = v; }
  get level() { return this._level; }
  set level(v: number) { this._level = v; }
  isBoss = false;
  noKnock = false;
  kx = 0;
  kz = 0;
  stunT = 0;
  slowT = 0;
  slowMul = 1;
  marked = 0;
  markT = 0;
  dotT = 0;
  dotDmg = 0;
  dotTick = 0;
  dotSrc: Actor | null = null;
  flashT = 0;
  invulnT = 0;
  scale = 1;
  /** visual-only extra height offset (flyers, jumps) */
  hover = 0;
  removed = false;
  lastHitT = -99;
  moveSpeed = 0;
  private lastX = 0;
  private lastZ = 0;

  constructor(world: World) { this.world = world; }

  abstract get atk(): number;
  abstract get def(): number;
  get critChance() { return 0.05; }
  get critMult() { return 1.5; }

  atkPower() { return this.atk; }

  get stunned() { return this.stunT > 0; }

  setModel(m: ModelHandle, scale = 1) {
    this.model = m;
    this.scale = scale;
    m.root.scale.setScalar(scale);
    this.world.root.add(m.root);
  }

  place(x: number, z: number) {
    this.x = x; this.z = z;
    this.lastX = x; this.lastZ = z;
  }

  /** Move with static collision. */
  move(vx: number, vz: number, dt: number) {
    const nx = this.x + vx * dt, nz = this.z + vz * dt;
    const [rx, rz] = this.world.col.resolve(nx, nz, this.radius);
    this.x = rx; this.z = rz;
  }

  faceTowards(tx: number, tz: number, dt = 1, rate = 14) {
    const target = Math.atan2(tx - this.x, tz - this.z);
    this.facing = approachAngle(this.facing, target, rate * dt);
  }

  updateStatus(dt: number) {
    if (this.stunT > 0) this.stunT -= dt;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowMul = 1; }
    if (this.markT > 0) { this.markT -= dt; if (this.markT <= 0) this.marked = 0; }
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.dotT > 0) {
      this.dotT -= dt;
      this.dotTick -= dt;
      if (this.dotTick <= 0) {
        this.dotTick = 0.5;
        if (this.dotSrc) this.world.applyDamageRaw(this.dotSrc, this, this.dotDmg, { kind: 'dot', noBF: true, quiet: true, color: '#c86aff' });
      }
    }
    // knockback decays
    if (Math.abs(this.kx) + Math.abs(this.kz) > 0.01) {
      this.move(this.kx, this.kz, dt);
      const d = Math.exp(-dt * 9);
      this.kx *= d; this.kz *= d;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.model) setModelFlash(this.model.rig, Math.max(0, this.flashT / 0.12) * 0.9, this.flashColor);
    }
  }
  flashColor = 0xffffff;

  knockback(fromX: number, fromZ: number, power: number) {
    if (this.noKnock || power <= 0) return;
    const dx = this.x - fromX, dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.kx += (dx / d) * power * 4;
    this.kz += (dz / d) * power * 4;
  }

  syncModel(dt: number) {
    if (!this.model) return;
    const moved = Math.hypot(this.x - this.lastX, this.z - this.lastZ) / Math.max(dt, 1e-4);
    this.lastX = this.x; this.lastZ = this.z;
    this.moveSpeed = this.moveSpeed * 0.7 + moved * 0.3;
    this.model.speed = this.stunned ? 0 : this.moveSpeed;
    this.model.root.position.set(this.x, this.y + this.hover, this.z);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt);
  }

  dispose() {
    if (this.model) {
      this.world.root.remove(this.model.root);
      const seen = new Set<THREE.BufferGeometry>();
      this.model.root.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData.shared && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
        const mm = m.material as THREE.Material | undefined;
        if (m.isMesh && m.userData.flashMat) (m.userData.flashMat as THREE.Material).dispose();
        void mm;
      });
    }
    this.removed = true;
  }

  abstract update(dt: number): void;
  onDeath(_killer: Actor | null) { /* override */ }
  onHit(_dmg: number, _src: Actor | null) { /* override */ }
}
