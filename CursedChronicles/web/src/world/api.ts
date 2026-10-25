// Interfaces shared between skills, AI and the world, kept separate to avoid
// circular imports.

export interface DamageOpts {
  kind?: 'melee' | 'skill' | 'proj' | 'summon' | 'dot' | 'domain';
  crit?: boolean;
  bf?: boolean;
  noBF?: boolean;
  ignoreDef?: boolean;
  knock?: number;
  stun?: number;
  slow?: { mult: number; dur: number };
  mark?: boolean;
  dot?: { mult: number; dur: number };
  color?: string;
  hitSfx?: string;
  /** damage multiplier vs nail-marked targets */
  vsMarked?: number;
  consumeMark?: boolean;
  /** suppress the per-hit spark */
  quiet?: boolean;
}

export interface Target {
  id: number;
  x: number;
  z: number;
  y: number;
  radius: number;
  alive: boolean;
  team: 'player' | 'enemy';
  marked: number;
  isBoss: boolean;
}

/** Anything that can deal damage. */
export interface DamageSource {
  x: number;
  z: number;
  level: number;
  team: 'player' | 'enemy';
  atkPower(): number;
}

export interface Caster extends DamageSource {
  facing: number;
  dash(dirX: number, dirZ: number, dist: number, dur: number, invuln?: boolean): void;
  setInvuln(t: number): void;
  addBuff(id: string, dur: number, stats: Record<string, number>): void;
  heal(amount: number): void;
  model: { play(a: string, d: number): void } | null;
}

export interface ProjectileSpec {
  x: number; z: number; y?: number;
  dirX: number; dirZ: number;
  speed: number;
  range: number;
  radius: number;
  mult: number;
  pierce?: number;
  visual: 'nail' | 'knife' | 'fireball' | 'orb' | 'seed' | 'water' | 'spit' | 'beam' | 'slash' | 'blue' | 'red' | 'thorn' | 'ember';
  color?: number;
  opts?: DamageOpts;
  team: 'player' | 'enemy';
  homing?: number;
  onHit?: (x: number, z: number) => void;
  onEnd?: (x: number, z: number) => void;
  fromCaster?: Caster;
  gravity?: boolean;
  /** world y it travels at */
  height?: number;
}

export interface FxAPI {
  ring(x: number, z: number, color: number, radius: number, dur?: number, width?: number): void;
  burst(x: number, y: number, z: number, color: number, count?: number, speed?: number, size?: number, life?: number, additive?: boolean): void;
  slash(x: number, z: number, dir: number, radius: number, color: number, arc?: number, tilt?: number, y?: number): void;
  shockwave(x: number, z: number, radius: number, color: number): void;
  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, width?: number): void;
  pillar(x: number, z: number, radius: number, height: number, color: number, dur?: number): void;
  sigil(x: number, z: number, radius: number, color: number, dur?: number): void;
  blackFlash(x: number, y: number, z: number): void;
  flash(color: string, alpha: number, dur?: number): void;
  shake(a: number, t?: number): void;
  hitstop(t: number): void;
  smoke(x: number, z: number, color?: number, count?: number): void;
  text(x: number, y: number, z: number, txt: string, color: string, size?: number): void;
  embers(x: number, z: number, radius: number, color: number, count?: number): void;
  spikes(x: number, z: number, radius: number, color: number, count?: number): void;
  light(x: number, y: number, z: number, color: number, intensity: number, dur: number, range?: number): void;
}

export interface WorldAPI {
  time: number;
  fx: FxAPI;
  sfx(name: string, x?: number, z?: number, vol?: number, pitch?: number): void;
  damageArea(src: DamageSource, x: number, z: number, r: number, mult: number, opts?: DamageOpts): number;
  damageCone(src: DamageSource, x: number, z: number, dir: number, range: number, arc: number, mult: number, opts?: DamageOpts): number;
  damageLine(src: DamageSource, x0: number, z0: number, x1: number, z1: number, width: number, mult: number, opts?: DamageOpts): number;
  damageTarget(src: DamageSource, t: Target, mult: number, opts?: DamageOpts): void;
  projectile(p: ProjectileSpec): void;
  summon(kind: string, x: number, z: number, opts: { dur: number; power: number; owner: Caster }): void;
  schedule(delay: number, fn: () => void): void;
  targetsNear(team: 'player' | 'enemy', x: number, z: number, r: number): Target[];
  nearestTarget(team: 'player' | 'enemy', x: number, z: number, r: number): Target | null;
  domain(kind: 'shrine' | 'shadow' | 'nails' | 'void' | 'coffin' | 'womb', x: number, z: number, r: number, dur: number): void;
  blocked(x: number, z: number, r: number): boolean;
}
