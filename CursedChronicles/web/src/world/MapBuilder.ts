// Turns a declarative map definition into instanced meshes, colliders, lights,
// spawners, NPCs and portals.
import * as THREE from 'three';
import { getProp } from '../render/models/props';
import { getBuilding, buildingMesh, waterMaterial, BuildOpts } from '../render/models/buildings';
import { outlineMaterial, toonMaterial } from '../render/toon';
import { SplatPainter, TileKind, terrainMaterial } from '../render/textures';
import { CollisionWorld } from './Collision';
import { Rng, TAU } from '../core/util';
import { LightingPreset, Quality } from '../render/Renderer';
import { AmbLayer } from '../audio/Music';
import { NpcDef } from '../entities/NPC';
import { PortalDef } from '../entities/Loot';
import { Line } from '../data/story';
import { Surface } from '../audio/Audio';
import { PlayerState } from '../rpg/PlayerState';

export interface SpawnerDef {
  enemies: { id: string; w?: number }[];
  x: number; z: number; w: number; d: number;
  count: number;
  respawn: number;
  level?: [number, number];
  cond?: (ps: PlayerState) => boolean;
}

export interface BossDef {
  id: string;
  x: number; z: number;
  r: number;
  quest?: string;
  intro?: Line[];
  cond?: (ps: PlayerState) => boolean;
  repeatable?: boolean;
  level?: number;
}

export interface LightSrc { x: number; y: number; z: number; color: number; intensity: number; range: number; flicker?: boolean }

export type Weather = 'rain' | 'sakura' | 'fireflies' | 'embers' | 'leaves' | 'ash' | 'none' | 'confetti' | 'drips';

export interface MapDef {
  id: string;
  name: string;
  jp: string;
  size: [number, number];
  night: boolean;
  lighting: LightingPreset;
  music: string;
  ambience: AmbLayer[];
  weather: Weather;
  terrain: { kinds: [TileKind, TileKind, TileKind, TileKind]; scales: [number, number, number, number]; paint: (p: SplatPainter) => void; tint?: number };
  surfaces: [Surface, Surface, Surface, Surface];
  spawn: { x: number; z: number; facing?: number };
  build: (b: MapBuilder) => void;
  levelRange: [number, number];
  town?: boolean;
}

export interface MapRuntime {
  def: MapDef;
  npcs: NpcDef[];
  portals: PortalDef[];
  spawners: SpawnerDef[];
  bosses: BossDef[];
  pickups: { item: string; x: number; z: number; quest: string }[];
  lights: LightSrc[];
  dummies: { x: number; z: number }[];
  splat: SplatPainter;
  water: { x: number; z: number; w: number; d: number }[];
}

export class MapBuilder {
  inst = new Map<string, THREE.Matrix4[]>();
  group = new THREE.Group();
  rt: MapRuntime;
  rng: Rng;
  avoid: { x0: number; z0: number; x1: number; z1: number }[] = [];
  occupied: { x: number; z: number; r: number }[] = [];

  constructor(public def: MapDef, public col: CollisionWorld, public quality: Quality, splat: SplatPainter) {
    this.rng = new Rng(def.id.length * 7919 + def.size[0]);
    this.rt = { def, npcs: [], portals: [], spawners: [], bosses: [], pickups: [], lights: [], dummies: [], splat, water: [] };
  }

  get night() { return this.def.night; }

  prop(name: string, x: number, z: number, rotY = 0, scale = 1) {
    const d = getProp(name);
    let a = this.inst.get(name);
    if (!a) { a = []; this.inst.set(name, a); }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, scale, scale));
    a.push(m);
    if (d.collide?.r) this.col.addCircle(x, z, d.collide.r * scale);
    if (d.collide?.box) {
      const q = Math.round(rotY / (Math.PI / 2)) & 1;
      const [w, dd] = d.collide.box;
      this.col.addBox(x, z, (q ? dd : w) * scale, (q ? w : dd) * scale);
    }
    if (d.light) {
      const off = name.startsWith('streetLamp') ? new THREE.Vector3(0.8, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : name === 'paperLantern' ? new THREE.Vector3(0.5, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY) : new THREE.Vector3();
      this.rt.lights.push({ x: x + off.x, y: d.light.y * scale, z: z + off.z, color: d.light.color, intensity: d.light.intensity, range: d.light.range, flicker: d.light.flicker });
    }
    this.occupied.push({ x, z, r: (d.collide?.r ?? 0.5) * scale + 0.3 });
    return this;
  }

  /** Scatter props in a rect, avoiding paths/buildings and each other. */
  scatter(names: string | string[], x: number, z: number, w: number, d: number, count: number, opts: { minDist?: number; scale?: [number, number]; noAvoid?: boolean; seed?: number } = {}) {
    const list = Array.isArray(names) ? names : [names];
    const rng = opts.seed !== undefined ? new Rng(opts.seed) : this.rng;
    const minD = opts.minDist ?? 1.5;
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 25) {
      tries++;
      const px = x + (rng.next() - 0.5) * w, pz = z + (rng.next() - 0.5) * d;
      if (!opts.noAvoid && this.avoid.some(a => px > a.x0 && px < a.x1 && pz > a.z0 && pz < a.z1)) continue;
      if (this.occupied.some(o => (o.x - px) ** 2 + (o.z - pz) ** 2 < (o.r + minD * 0.5) ** 2)) continue;
      const s = opts.scale ? opts.scale[0] + rng.next() * (opts.scale[1] - opts.scale[0]) : 1;
      this.prop(rng.pick(list), px, pz, rng.next() * TAU, s);
      placed++;
    }
    return this;
  }

  /** Decorative scatter with no collision (grass, ferns, lily pads). */
  decor(names: string | string[], x: number, z: number, w: number, d: number, count: number, scale: [number, number] = [0.8, 1.3]) {
    const list = Array.isArray(names) ? names : [names];
    for (let i = 0; i < count; i++) {
      const px = x + (this.rng.next() - 0.5) * w, pz = z + (this.rng.next() - 0.5) * d;
      if (this.avoid.some(a => px > a.x0 && px < a.x1 && pz > a.z0 && pz < a.z1)) continue;
      const name = this.rng.pick(list);
      let a = this.inst.get(name);
      if (!a) { a = []; this.inst.set(name, a); }
      const s = scale[0] + this.rng.next() * (scale[1] - scale[0]);
      a.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.next() * TAU), new THREE.Vector3(s, s, s)));
    }
    return this;
  }

  /** Mark an area as no-scatter (paths, plazas). */
  keepClear(x: number, z: number, w: number, d: number) {
    this.avoid.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    return this;
  }

  row(name: string, x0: number, z0: number, x1: number, z1: number, spacing: number, rotY?: number) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / spacing));
    const rot = rotY ?? Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.prop(name, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot);
    }
    return this;
  }

  /** Continuous wall/fence from segment props (each prop 'len' wide along its local X). */
  wall(name: string, x0: number, z0: number, x1: number, z1: number, segLen = 4) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / segLen));
    const ang = Math.atan2(z1 - z0, x1 - x0);
    const d = getProp(name);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      let a = this.inst.get(name);
      if (!a) { a = []; this.inst.set(name, a); }
      const sx = len / n / segLen;
      a.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang), new THREE.Vector3(sx, 1, 1)));
    }
    const thick = (d.collide?.box?.[1] ?? 0.4);
    if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) + thick, thick);
    else this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, thick, Math.abs(z1 - z0) + thick);
    return this;
  }

  /** Building rotated in quarter turns (0..3); door faces +Z when q=0. */
  building(name: string, x: number, z: number, q = 0, o: BuildOpts = {}) {
    const def = getBuilding(name, { night: this.night, ...o });
    const mesh = buildingMesh(def, this.quality);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = q * Math.PI / 2;
    this.group.add(mesh);
    for (const c of def.colliders) {
      const cx = q === 0 ? c.x : q === 1 ? c.z : q === 2 ? -c.x : -c.z;
      const cz = q === 0 ? c.z : q === 1 ? -c.x : q === 2 ? -c.z : c.x;
      const w = q % 2 ? c.d : c.w, d = q % 2 ? c.w : c.d;
      this.col.addBox(x + cx, z + cz, w, d);
      this.keepClear(x + cx, z + cz, w + 2, d + 2);
    }
    for (const l of def.lights ?? []) {
      const v = new THREE.Vector3(...l.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), q * Math.PI / 2);
      this.rt.lights.push({ x: x + v.x, y: v.y, z: z + v.z, color: l.color, intensity: l.intensity, range: l.range });
    }
    return this;
  }

  water(x: number, z: number, w: number, d: number, color = 0x2a6a8a, block = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), waterMaterial(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.07, z);
    this.group.add(m);
    if (block) this.col.addBox(x, z, w - 0.4, d - 0.4);
    this.rt.water.push({ x, z, w, d });
    this.keepClear(x, z, w + 1, d + 1);
    return this;
  }

  /** Flat painted decal (road markings, crosswalks, tatami...). */
  decal(x: number, z: number, w: number, d: number, color: number, rotY = 0, opacity = 0.9, y = 0.025) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.set(-Math.PI / 2, 0, rotY);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.group.add(m);
    return this;
  }

  crosswalk(x: number, z: number, len: number, width: number, rotY = 0) {
    const n = Math.floor(len / 0.9);
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * (len / n);
      const ox = Math.cos(rotY) * o, oz = -Math.sin(rotY) * o;
      this.decal(x + ox, z + oz, 0.45, width, 0xf0f0ea, rotY, 0.85);
    }
    return this;
  }

  light(x: number, y: number, z: number, color: number, intensity: number, range: number, flicker = false) {
    this.rt.lights.push({ x, y, z, color, intensity, range, flicker });
    return this;
  }

  npc(d: NpcDef) { this.rt.npcs.push(d); return this; }
  portal(p: PortalDef) { this.rt.portals.push(p); this.keepClear(p.x, p.z, 4, 4); return this; }
  spawner(s: SpawnerDef) { this.rt.spawners.push(s); return this; }
  boss(b: BossDef) { this.rt.bosses.push(b); return this; }
  pickup(item: string, x: number, z: number, quest: string) { this.rt.pickups.push({ item, x, z, quest }); return this; }
  dummy(x: number, z: number) { this.rt.dummies.push({ x, z }); return this; }

  /** Tree/wall border around the map edge. */
  border(names: string[], inset = 1.5, spacing = 2.4, jitter = 0.8, skip: { x: number; z: number; r: number }[] = []) {
    const [W, D] = this.def.size;
    const hw = W / 2 - inset, hd = D / 2 - inset;
    const pts: [number, number][] = [];
    for (let x = -hw; x <= hw; x += spacing) { pts.push([x, -hd]); pts.push([x, hd]); }
    for (let z = -hd + spacing; z < hd; z += spacing) { pts.push([-hw, z]); pts.push([hw, z]); }
    for (const [x, z] of pts) {
      if (skip.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 < s.r * s.r)) continue;
      const jx = (this.rng.next() - 0.5) * jitter, jz = (this.rng.next() - 0.5) * jitter;
      this.prop(this.rng.pick(names), x + jx, z + jz, this.rng.next() * TAU, 0.9 + this.rng.next() * 0.4);
      // second, outer row for density
      const ox = x + Math.sign(x) * (Math.abs(x) >= hw - 0.01 ? 2 : 0), oz = z + Math.sign(z) * (Math.abs(z) >= hd - 0.01 ? 2 : 0);
      if (ox !== x || oz !== z) this.prop(this.rng.pick(names), ox + jz, oz + jx, this.rng.next() * TAU, 1 + this.rng.next() * 0.3);
    }
    return this;
  }

  /** Finalise instanced meshes. */
  finish() {
    for (const [name, mats] of this.inst) {
      const d = getProp(name);
      const im = new THREE.InstancedMesh(d.geo, toonMaterial(), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = d.shadow !== false && this.quality !== 'low';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      if (d.outline !== false && this.quality !== 'low') {
        const om = new THREE.InstancedMesh(d.geo, outlineMaterial(d.outline ?? 0.02), mats.length);
        mats.forEach((m, i) => om.setMatrixAt(i, m));
        om.computeBoundingSphere();
        this.group.add(om);
      }
    }
    return this.rt;
  }
}

export function buildTerrain(def: MapDef, splat: SplatPainter) {
  const [W, D] = def.size;
  const ext = 40; // ground continues past the playable edge
  const g = new THREE.PlaneGeometry(W + ext * 2, D + ext * 2, 1, 1);
  g.rotateX(-Math.PI / 2);
  // UVs so that splat texel (u,v) maps to world (x,z) with v increasing southward
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getZ(i) + D / 2) / D);
  const tex = splat.texture();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = terrainMaterial(tex, def.terrain.kinds, def.terrain.scales, def.terrain.tint ?? 0xffffff);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}
