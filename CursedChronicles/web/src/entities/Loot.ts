// Dropped yen and items, plus quest pickups and map portals.
import * as THREE from 'three';
import type { World } from '../world/World';
import { ItemInstance } from '../rpg/types';
import { ITEMS, RARITY_COLOR, itemName, makeItem } from '../rpg/items';
import { G, PartBag } from '../render/geo';
import { toonMaterial } from '../render/toon';
import { audio } from '../audio/Audio';
import { formatNum } from '../core/util';

let coinGeo: THREE.BufferGeometry | null = null;
let bagGeo: THREE.BufferGeometry | null = null;

function coins() {
  if (coinGeo) return coinGeo;
  const b = new PartBag();
  for (let i = 0; i < 4; i++) b.add(G.cyl(0.13, 0.13, 0.04, 14), 0xf0c040, { pos: [(i % 2) * 0.12 - 0.06, 0.03 + i * 0.045, (i % 3) * 0.05], glow: 0.35, topColor: 0xfff0a0 });
  coinGeo = b.build();
  return coinGeo;
}
function bag() {
  if (bagGeo) return bagGeo;
  const b = new PartBag();
  b.add(G.ellipsoid(0.22, 0.2, 0.22), 0xe8dcc0, { pos: [0, 0.2, 0], glow: 0.15 });
  b.add(G.cyl(0.06, 0.1, 0.1, 8), 0xe8dcc0, { pos: [0, 0.42, 0] });
  b.add(G.torus(0.08, 0.02, 4, 10), 0xc83a3a, { pos: [0, 0.38, 0], rot: [Math.PI / 2, 0, 0] });
  bagGeo = b.build();
  return bagGeo;
}

export class Loot {
  world: World;
  x: number; z: number; y = 0.5; vy = 4;
  gold = 0;
  item: ItemInstance | null = null;
  obj: THREE.Group;
  dead = false;
  t = 0;
  magnet = false;
  vx: number; vz: number;
  beam: THREE.Mesh | null = null;

  constructor(world: World, x: number, z: number, gold: number, item: ItemInstance | null) {
    this.world = world;
    this.x = x; this.z = z;
    this.gold = gold;
    this.item = item;
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
    this.vx = Math.cos(a) * s; this.vz = Math.sin(a) * s;
    this.obj = new THREE.Group();
    const mesh = new THREE.Mesh(item ? bag() : coins(), toonMaterial());
    mesh.castShadow = true;
    this.obj.add(mesh);
    if (item) {
      const r = item.rarity;
      const col = new THREE.Color(RARITY_COLOR[r]);
      const glowM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), glowM);
      halo.position.y = 0.22;
      this.obj.add(halo);
      if (r >= 1 || ITEMS[item.base].kind === 'quest') {
        const bm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, r >= 2 ? 6 : 3, 10, 1, true), bm);
        this.beam.position.y = r >= 2 ? 3 : 1.5;
        this.obj.add(this.beam);
      }
      if (r >= 2) audio.play('rare', { vol: 0.6 });
    }
    this.obj.position.set(x, this.y, z);
    world.root.add(this.obj);
  }

  update(dt: number) {
    if (this.dead) return;
    this.t += dt;
    const p = this.world.player;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.t > 0.5 && (d < 2.6 || (this.gold > 0 && d < 5))) this.magnet = true;
    if (this.magnet && p.alive) {
      const s = 10 + this.t * 2;
      this.x += (p.x - this.x) / Math.max(d, 0.01) * Math.min(d, s * dt);
      this.z += (p.z - this.z) / Math.max(d, 0.01) * Math.min(d, s * dt);
      this.y += (1.0 - this.y) * Math.min(1, dt * 8);
      if (d < 0.5) this.pickup();
    } else if (this.y > 0.05 || this.vy > 0) {
      this.vy -= 14 * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt; this.z += this.vz * dt;
      if (this.y <= 0.05) { this.y = 0.05; this.vy = 0; this.vx = 0; this.vz = 0; }
    }
    this.obj.position.set(this.x, this.y + Math.sin(this.t * 3) * 0.05, this.z);
    this.obj.children[0].rotation.y += dt * 2;
    if (this.t > 120) this.remove();
  }

  pickup() {
    const ps = this.world.player.ps;
    if (this.gold > 0) {
      const g = Math.round(this.gold * (1 + ps.stats.goldBonus));
      ps.addGold(g);
      audio.play('coin', { vol: 0.5, pitch: 0.95 + Math.random() * 0.1 });
      this.world.overlay.add(this.x, 1.8, this.z, `+¥${formatNum(g)}`, '#ffd84a', 13);
    }
    if (this.item) {
      if (!ps.addItem(this.item)) { this.magnet = false; this.t = 0; this.world.game.toast('Inventory full!', 'warn'); return; }
      audio.play('pickup');
      const b = ITEMS[this.item.base];
      this.world.game.toast(`${itemName(this.item)}${this.item.qty > 1 ? ' ×' + this.item.qty : ''}`, 'item', 1.6, RARITY_COLOR[this.item.rarity], b.icon);
    }
    this.remove();
  }

  remove() {
    this.dead = true;
    this.world.root.remove(this.obj);
    this.obj.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== coinGeo && m.geometry !== bagGeo) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
  }
}

/** Glowing quest pickup spot (e.g. Miwa's katana). */
export class Pickup {
  obj: THREE.Group;
  taken = false;
  constructor(public world: World, public x: number, public z: number, public item: string, public quest: string) {
    this.obj = new THREE.Group();
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    m.position.y = 0.8;
    this.obj.add(m);
    this.obj.position.set(x, 0, z);
    world.root.add(this.obj);
  }
  visible() {
    const st = this.world.player.ps.questState(this.quest);
    return !this.taken && !!st && st.state === 'active' && this.world.player.ps.countItem(this.item) === 0;
  }
  update(dt: number) {
    const v = this.visible();
    this.obj.visible = v;
    if (!v) return;
    this.obj.children[0].rotation.y += dt * 2;
    this.obj.children[0].position.y = 0.8 + Math.sin(this.world.time * 3) * 0.15;
    if (Math.random() < 0.2) this.world.fx.burst(this.x, 0.5, this.z, 0xbfefff, 1, 1, 0.15, 0.6);
    const p = this.world.player;
    if (Math.hypot(p.x - this.x, p.z - this.z) < 1.2) {
      this.taken = true;
      p.ps.addItem(makeItem(this.item, 0, 1));
      audio.play('rare');
      this.world.game.toast(`Found ${ITEMS[this.item].name}!`, 'item', 2, '#bfefff', ITEMS[this.item].icon);
    }
  }
}

export interface PortalDef { x: number; z: number; r: number; to: string; toX: number; toZ: number; label: string; cond?: string; condText?: string; rot?: number }

export class Portal {
  obj: THREE.Group;
  ring: THREE.Mesh;
  constructor(public world: World, public d: PortalDef) {
    this.obj = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a6aff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 8, 32), mat);
    this.ring.position.y = 1.4;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ color: 0x3a2a8a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    disc.position.y = 1.4;
    const floor = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5, 32), new THREE.MeshBasicMaterial({ color: 0x8a6aff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.05;
    this.obj.add(this.ring, disc, floor);
    this.obj.position.set(d.x, 0, d.z);
    this.obj.rotation.y = d.rot ?? 0;
    world.root.add(this.obj);
  }
  update(dt: number) {
    this.ring.rotation.z += dt * 1.5;
    if (Math.random() < 0.3) this.world.fx.burst(this.d.x + (Math.random() - 0.5) * 2, 0.2, this.d.z + (Math.random() - 0.5) * 2, 0x9a7aff, 1, 0.6, 0.15, 1.0);
  }
}
