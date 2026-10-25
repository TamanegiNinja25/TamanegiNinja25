// Projectiles for both teams: nails, knives, fireballs, water bolts, thorns…
import * as THREE from 'three';
import type { World } from '../world/World';
import type { Actor } from './Actor';
import { ProjectileSpec } from '../world/api';
import { G, PartBag } from '../render/geo';
import { toonMaterial } from '../render/toon';
import { angleDiff } from '../core/util';

const geoCache = new Map<string, THREE.BufferGeometry>();
const addMats = new Map<number, THREE.MeshBasicMaterial>();

function addMat(color: number) {
  let m = addMats.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    m.color.multiplyScalar(1.8);
    addMats.set(color, m);
  }
  return m;
}

function visualGeo(v: string, color: number) {
  const key = v + color;
  let g = geoCache.get(key);
  if (g) return g;
  const b = new PartBag();
  switch (v) {
    case 'nail':
      b.add(G.cyl(0.025, 0.025, 0.42, 6), 0xd8d8e0, { rot: [Math.PI / 2, 0, 0], glow: 0.3 });
      b.add(G.cyl(0.06, 0.06, 0.03, 8), 0xc0c0c8, { pos: [0, 0, -0.21], rot: [Math.PI / 2, 0, 0] });
      b.add(G.cone(0.025, 0.1, 6), 0xffffff, { pos: [0, 0, 0.26], rot: [Math.PI / 2, 0, 0], glow: 0.8 });
      break;
    case 'knife':
      b.add(G.box(0.08, 0.02, 0.5), 0xd8d8e0, { glow: 0.5 });
      b.add(G.box(0.03, 0.03, 0.5), 0xff3a3a, { pos: [0.04, 0, 0], glow: 1.2 });
      break;
    case 'seed':
      b.add(G.sphere(0.22, 10, 8), 0x7a5a3a, { colorFn: (_x, y, _z, c) => { if (Math.abs(y) < 0.03) c.setHex(0x4a3020); } });
      break;
    case 'thorn':
      b.add(G.cone(0.08, 0.6, 6), color || 0x4a6a2a, { rot: [Math.PI / 2, 0, 0], glow: 0.2 });
      break;
    case 'spit':
      b.add(G.sphere(0.18, 10, 8), color || 0x9ad04a, { glow: 0.5 });
      break;
    default:
      return null;
  }
  g = b.build();
  geoCache.set(key, g);
  return g;
}

export class Projectile {
  world: World;
  s: ProjectileSpec;
  x: number; z: number; y: number;
  vx: number; vz: number;
  traveled = 0;
  hit = new Set<number>();
  pierce: number;
  obj: THREE.Object3D;
  dead = false;
  t = 0;
  color: number;

  constructor(world: World, s: ProjectileSpec) {
    this.world = world;
    this.s = s;
    this.x = s.x; this.z = s.z; this.y = s.height ?? 1.0;
    const d = Math.hypot(s.dirX, s.dirZ) || 1;
    this.vx = (s.dirX / d) * s.speed; this.vz = (s.dirZ / d) * s.speed;
    this.pierce = s.pierce ?? 0;
    this.color = s.color ?? defaultColor(s.visual);
    const g = visualGeo(s.visual, this.color);
    if (g) {
      const m = new THREE.Mesh(g, toonMaterial());
      m.castShadow = false;
      this.obj = m;
    } else {
      const grp = new THREE.Group();
      const size = s.visual === 'fireball' ? 0.38 : s.visual === 'ember' ? 0.2 : s.visual === 'beam' ? 0.25 : s.visual === 'water' ? 0.32 : s.visual === 'blue' || s.visual === 'red' ? 0.5 : 0.28;
      const core = new THREE.Mesh(sphereGeo(), addMat(this.color));
      core.scale.setScalar(size);
      const inner = new THREE.Mesh(sphereGeo(), addMat(0xffffff));
      inner.scale.setScalar(size * 0.5);
      grp.add(core, inner);
      if (s.visual === 'beam') core.scale.set(size, size, size * 4);
      this.obj = grp;
    }
    this.obj.position.set(this.x, this.y, this.z);
    this.obj.rotation.y = Math.atan2(this.vx, this.vz);
    world.root.add(this.obj);
  }

  update(dt: number) {
    if (this.dead) return;
    const s = this.s;
    this.t += dt;
    // homing
    if (s.homing) {
      const t = s.team === 'player' ? this.world.nearestEnemyActor(this.x, this.z, 7) : this.world.player;
      if (t && t.alive) {
        const want = Math.atan2(t.x - this.x, t.z - this.z);
        const cur = Math.atan2(this.vx, this.vz);
        const nd = cur + Math.max(-s.homing * dt, Math.min(s.homing * dt, angleDiff(cur, want)));
        this.vx = Math.sin(nd) * s.speed; this.vz = Math.cos(nd) * s.speed;
      }
    }
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    this.traveled += s.speed * dt;
    if (this.world.col.blocked(nx, nz, 0.08) || this.traveled > s.range) { this.end(); return; }
    this.x = nx; this.z = nz;
    this.obj.position.set(this.x, this.y, this.z);
    this.obj.rotation.y = Math.atan2(this.vx, this.vz);
    if (s.visual === 'knife') this.obj.rotation.x += dt * 30;
    if (s.visual === 'seed') this.obj.rotation.x += dt * 12;
    this.trail();
    // hits
    const r = s.radius;
    const targets: Actor[] = s.team === 'player' ? this.world.enemies : this.world.hostileToEnemies();
    for (const t of targets) {
      if (!t.alive || this.hit.has(t.id)) continue;
      const rr = r + t.radius;
      if ((t.x - this.x) ** 2 + (t.z - this.z) ** 2 < rr * rr) {
        this.hit.add(t.id);
        const src = (s.fromCaster as unknown as Actor) ?? this.world.player;
        this.world.damageTargetActor(src, t, s.mult, { kind: 'proj', ...s.opts });
        s.onHit?.(this.x, this.z);
        this.world.fx.burst(this.x, this.y, this.z, this.color, 8, 3, 0.18, 0.3);
        if (this.pierce-- <= 0) { this.end(); return; }
      }
    }
  }

  private trail() {
    const v = this.s.visual;
    const fx = this.world.fx;
    if (v === 'fireball' || v === 'ember') fx.burst(this.x, this.y, this.z, this.t % 0.1 < 0.05 ? 0xff6a1a : 0xffc04a, 1, 0.8, v === 'ember' ? 0.15 : 0.3, 0.35);
    else if (v === 'water') fx.burst(this.x, this.y, this.z, 0x6ab0ff, 1, 1, 0.2, 0.3);
    else if (v === 'nail' || v === 'knife') { if (Math.random() < 0.6) fx.burst(this.x, this.y, this.z, v === 'knife' ? 0xff3a3a : 0xffd8a0, 1, 0.3, 0.1, 0.18); }
    else if (v === 'spit') { if (Math.random() < 0.3) fx.burst(this.x, this.y, this.z, 0x9ad04a, 1, 0.5, 0.12, 0.3, false); }
    else if (v === 'orb' || v === 'blue' || v === 'red') fx.burst(this.x, this.y, this.z, this.color, 1, 0.5, 0.25, 0.3);
  }

  end() {
    if (this.dead) return;
    this.dead = true;
    this.s.onEnd?.(this.x, this.z);
    if (this.s.visual === 'nail') this.world.sfx('tink', this.x, this.z, 0.3, 1 + Math.random() * 0.3);
    this.world.root.remove(this.obj);
  }
}

let _sphere: THREE.BufferGeometry | null = null;
function sphereGeo() { return _sphere ?? (_sphere = new THREE.SphereGeometry(1, 12, 8)); }

function defaultColor(v: string) {
  switch (v) {
    case 'fireball': return 0xff6a1a;
    case 'ember': return 0xffaa3a;
    case 'water': return 0x4a9aff;
    case 'blue': return 0x3a7aff;
    case 'red': return 0xff2a3a;
    case 'beam': return 0xff3a5a;
    case 'orb': return 0x9a6aff;
    default: return 0xffffff;
  }
}
