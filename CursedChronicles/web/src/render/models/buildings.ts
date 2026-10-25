// Building models. Each building is a single merged mesh (plus optional sign
// planes) with box colliders expressed in its local frame.
import * as THREE from 'three';
import { G, PartBag, V3 } from '../geo';
import { Rng, TAU } from '../../core/util';
import { darken, lighten } from './humanoid';
import { toonMaterial, outlineMaterial } from '../toon';

export interface Rect { x: number; z: number; w: number; d: number }
export interface BuildingDef {
  geo: THREE.BufferGeometry;
  colliders: Rect[];
  lights?: { pos: V3; color: number; intensity: number; range: number }[];
  /** extra meshes (signs with canvas text, glass) */
  extras?: () => THREE.Object3D[];
  outline?: number | false;
  height: number;
}

export interface BuildOpts { night?: boolean; seed?: number }

// ---------- helpers ----------

/** Hip roof with upturned corners (Japanese style). */
function hipRoof(b: PartBag, w: number, d: number, h: number, y: number, col: number, lift = 0.35, ridge = true) {
  const g = new THREE.CylinderGeometry(0.0001, Math.SQRT1_2, 1, 4, 3, false);
  g.rotateY(Math.PI / 4);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), yy = p.getY(i), z = p.getZ(i);
    // corner lift: stronger at the bottom ring and at the corners
    const bottom = (0.5 - yy);
    const corner = Math.abs(x) * Math.abs(z) * 4;
    p.setXYZ(i, x * w, yy * h + bottom * bottom * corner * lift * 2.2 + bottom * bottom * lift * 0.6, z * d);
  }
  g.computeVertexNormals();
  b.add(g, col, { pos: [0, y + h / 2, 0], topColor: lighten(col, 1.25), colorFn: (_x, yy, _z, c) => { if (Math.abs((yy * 10 + 10) % 1) < 0.12) c.multiplyScalar(0.8); } });
  if (ridge) b.add(G.box(Math.max(0.2, w - d) * 0.9 + 0.3, 0.18, 0.3), darken(col, 0.7), { pos: [0, y + h * 0.98, 0] });
}

/** Gabled roof (triangular prism) along X. */
function gableRoof(b: PartBag, w: number, d: number, h: number, y: number, col: number) {
  const g = G.extrude([[-d / 2, 0], [d / 2, 0], [0, h]], w);
  g.rotateY(Math.PI / 2);
  b.add(g, col, { pos: [0, y, 0], topColor: lighten(col, 1.2), colorFn: (x, _y, _z, c) => { if (Math.abs((x * 2.5 + 100) % 1) < 0.1) c.multiplyScalar(0.82); } });
  b.add(G.box(w + 0.2, 0.14, 0.18), darken(col, 0.7), { pos: [0, y + h, 0] });
}

/** Grid of windows on a wall facing +Z at z, from x0..x1, rows at given ys. */
function windows(b: PartBag, x0: number, x1: number, ys: number[], z: number, ww: number, wh: number, frame: number, glass: number, night: boolean, rng: Rng, spacing = 1.6, rotY = 0) {
  const n = Math.max(1, Math.floor((x1 - x0) / spacing));
  const step = (x1 - x0) / n;
  const m = new THREE.Matrix4().makeRotationY(rotY);
  for (const y of ys) for (let i = 0; i < n; i++) {
    const x = x0 + step * (i + 0.5);
    const lit = night && rng.chance(0.45);
    const gc = lit ? rng.pick([0xffe6a8, 0xfff2d0, 0xcfe4ff]) : glass;
    b.add(G.box(ww + 0.14, wh + 0.14, 0.08), frame, { pos: [x, y, z] }, m);
    b.add(G.box(ww, wh, 0.1), gc, { pos: [x, y, z + 0.01], glow: lit ? 0.75 : 0.05 }, m);
    b.add(G.box(0.05, wh, 0.12), frame, { pos: [x, y, z + 0.02] }, m);
  }
}

function signPlane(text: string, w: number, h: number, color: string, bg = 'rgba(0,0,0,0)', font = 'bold 96px sans-serif', glow = true) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.max(64, Math.round(512 * h / w));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = font;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 24; }
  ctx.fillStyle = color;
  let size = parseInt(font.match(/(\d+)px/)?.[1] ?? '96');
  while (ctx.measureText(text).width > c.width * 0.9 && size > 12) { size -= 4; ctx.font = font.replace(/\d+px/, size + 'px'); }
  ctx.fillText(text, c.width / 2, c.height / 2);
  if (glow) ctx.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: !glow });
  if (glow) m.color.setScalar(1.6);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  return mesh;
}

// ---------- buildings ----------

function templeHall(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const W = 14, D = 10;
  const wood = 0x6a2e22, plaster = 0xeee8da, beam = 0x3a2218, stone = 0x8a867c;
  b.add(G.box(W + 2, 0.8, D + 2), stone, { pos: [0, 0.4, 0], topColor: lighten(stone, 1.1) });
  for (let i = 0; i < 5; i++) b.add(G.box(4, 0.2, 0.5), stone, { pos: [0, 0.1 + i * 0.16, D / 2 + 1.0 + (4 - i) * 0.35] });
  b.add(G.box(W + 1.2, 0.2, D + 1.2), 0x5a3a26, { pos: [0, 0.9, 0] }); // veranda floor
  b.add(G.box(W, 3.4, D), plaster, { pos: [0, 2.7, 0] });
  // pillars & beams
  for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) b.add(G.cyl(0.18, 0.2, 3.6, 10), wood, { pos: [-W / 2 - 0.3 + i * (W + 0.6) / 6, 2.7, sz * (D / 2 + 0.3)] });
  for (let i = 1; i < 4; i++) for (const sx of [-1, 1]) b.add(G.cyl(0.18, 0.2, 3.6, 10), wood, { pos: [sx * (W / 2 + 0.3), 2.7, -D / 2 + i * D / 4] });
  for (const y of [1.2, 4.2]) {
    b.add(G.box(W + 0.8, 0.25, 0.3), beam, { pos: [0, y, D / 2 + 0.05] });
    b.add(G.box(W + 0.8, 0.25, 0.3), beam, { pos: [0, y, -D / 2 - 0.05] });
    b.add(G.box(0.3, 0.25, D + 0.8), beam, { pos: [W / 2 + 0.05, y, 0] });
    b.add(G.box(0.3, 0.25, D + 0.8), beam, { pos: [-W / 2 - 0.05, y, 0] });
  }
  // lattice doors on the front
  for (let i = 0; i < 4; i++) {
    const x = -4.5 + i * 3;
    b.add(G.box(2.2, 2.6, 0.08), o.night ? 0xffd8a0 : 0xd8cfb8, { pos: [x, 2.5, D / 2 + 0.02], glow: o.night ? 0.8 : 0 });
    for (let k = 0; k < 5; k++) b.add(G.box(0.04, 2.6, 0.1), beam, { pos: [x - 1 + k * 0.5, 2.5, D / 2 + 0.05] });
    for (let k = 0; k < 6; k++) b.add(G.box(2.2, 0.04, 0.1), beam, { pos: [x, 1.3 + k * 0.48, D / 2 + 0.05] });
  }
  // brackets (tokyō) under the eaves
  for (let i = 0; i <= 8; i++) b.add(G.box(0.3, 0.3, 0.9), wood, { pos: [-W / 2 + i * W / 8, 4.5, D / 2 + 0.5] });
  hipRoof(b, W + 4.5, D + 4.5, 3.4, 4.5, 0x30353f, 0.5);
  b.add(G.box(W + 2, 1.2, 1.6), 0x30353f, { pos: [0, 7.6, 0] });
  // ornamental ridge ends (shachihoko-like)
  for (const sx of [-1, 1]) b.add(G.cone(0.3, 0.9, 6), 0xd8b04a, { pos: [sx * (W / 2 + 0.6), 8.5, 0], rot: [0, 0, sx * -0.5], glow: 0.2 });
  // offering box + rope + bell
  b.add(G.box(2.4, 0.9, 0.9), 0x5a3a26, { pos: [0, 1.45, D / 2 + 1.4] });
  b.add(G.torus(1.6, 0.12, 6, 20, Math.PI), 0xe8dcb8, { pos: [0, 4.0, D / 2 + 0.6], rot: [0, 0, Math.PI] });
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: W + 2, d: D + 2 }], height: 9, outline: 0.03 };
}

function pagoda(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const wood = 0x7a2a22, plaster = 0xeee8da;
  b.add(G.box(7, 0.8, 7), 0x8a867c, { pos: [0, 0.4, 0] });
  let y = 0.8;
  for (let i = 0; i < 5; i++) {
    const s = 5 - i * 0.6;
    const h = 2.0 - i * 0.12;
    b.add(G.box(s, h, s), i === 0 ? plaster : wood, { pos: [0, y + h / 2, 0] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.cyl(0.12, 0.12, h, 8), wood, { pos: [sx * s / 2, y + h / 2, sz * s / 2] });
    b.add(G.box(s * 0.35, h * 0.6, 0.05), o.night ? 0xffcf8a : 0x3a2218, { pos: [0, y + h / 2, s / 2 + 0.03], glow: o.night ? 1.0 : 0 });
    y += h;
    hipRoof(b, s + 2.6, s + 2.6, 1.1, y - 0.2, 0x2e333c, 0.55, false);
    y += 0.7;
  }
  b.add(G.cyl(0.08, 0.12, 4, 8), 0xc8a040, { pos: [0, y + 1.8, 0], glow: 0.3 });
  for (let i = 0; i < 9; i++) b.add(G.torus(0.28 - i * 0.012, 0.05, 6, 12), 0xc8a040, { pos: [0, y + 0.6 + i * 0.32, 0], rot: [Math.PI / 2, 0, 0], glow: 0.2 });
  b.add(G.sphere(0.25, 10, 8), 0xe0c060, { pos: [0, y + 4, 0], glow: 0.6 });
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: 7, d: 7 }], height: y + 4, outline: 0.03 };
}

function woodHouse(o: BuildOpts, W = 12, D = 6, floors = 2, wall = 0xe8e0cc, roofCol = 0x3a3e48, sign?: string): BuildingDef {
  const b = new PartBag();
  const rng = new Rng((o.seed ?? 1) * 31 + W);
  const wood = 0x5a3624;
  const fh = 3;
  b.add(G.box(W + 0.6, 0.5, D + 0.6), 0x8a867c, { pos: [0, 0.25, 0] });
  for (let f = 0; f < floors; f++) {
    b.add(G.box(W, fh, D), wall, { pos: [0, 0.5 + f * fh + fh / 2, 0] });
    b.add(G.box(W + 0.2, 0.25, D + 0.2), wood, { pos: [0, 0.5 + f * fh + fh, 0] });
    for (let i = 0; i <= Math.round(W / 3); i++) for (const sz of [-1, 1]) b.add(G.box(0.22, fh, 0.22), wood, { pos: [-W / 2 + i * W / Math.round(W / 3), 0.5 + f * fh + fh / 2, sz * D / 2] });
    windows(b, -W / 2 + 0.6, W / 2 - 0.6, [0.5 + f * fh + 1.7], D / 2 + 0.06, 1.0, 1.0, wood, 0x2a3440, !!o.night, rng, 2.2);
    windows(b, -W / 2 + 0.6, W / 2 - 0.6, [0.5 + f * fh + 1.7], -D / 2 - 0.06, 1.0, 1.0, wood, 0x2a3440, !!o.night, rng, 2.2, Math.PI);
    if (f > 0) {
      // balcony rail
      b.add(G.box(W, 0.08, 0.08), wood, { pos: [0, 0.5 + f * fh + 0.9, D / 2 + 0.7] });
      b.add(G.box(W, 0.12, 0.8), wood, { pos: [0, 0.5 + f * fh + 0.05, D / 2 + 0.4] });
      for (let i = 0; i <= W * 2; i++) b.add(G.box(0.05, 0.85, 0.05), wood, { pos: [-W / 2 + i * 0.5, 0.5 + f * fh + 0.5, D / 2 + 0.7] });
    }
  }
  // entrance
  b.add(G.box(1.8, 2.3, 0.1), 0x3a2218, { pos: [0, 1.65, D / 2 + 0.05] });
  b.add(G.box(2.6, 0.12, 1.2), roofCol, { pos: [0, 2.95, D / 2 + 0.6], rot: [0.2, 0, 0] });
  gableRoof(b, W + 1.2, D + 1.6, 2.2, 0.5 + floors * fh, roofCol);
  const extras = sign ? () => {
    const s = signPlane(sign, 3, 0.8, '#3a2218', '#e8dcc0', 'bold 80px serif', false);
    s.position.set(0, 0.5 + floors * fh - 0.4, D / 2 + 0.12);
    return [s];
  } : undefined;
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: W + 0.6, d: D + 0.6 }], height: 0.5 + floors * fh + 2.2, extras, outline: 0.025 };
}

function infirmary(o: BuildOpts): BuildingDef {
  const d = woodHouse(o, 8, 6, 1, 0xf2f0ea, 0x4a5a6a, '医務室  INFIRMARY');
  const b = new PartBag();
  b.addBaked(d.geo);
  b.add(G.box(0.9, 0.3, 0.1), 0xd82a3a, { pos: [2.6, 3.0, 3.1], glow: 0.8 });
  b.add(G.box(0.3, 0.9, 0.1), 0xd82a3a, { pos: [2.6, 3.0, 3.1], glow: 0.8 });
  return { ...d, geo: b.build() };
}

function concreteBlock(o: BuildOpts, W: number, D: number, floors: number, col: number, opts: { rooftopFence?: boolean; sign?: string; signColor?: string; glass?: number; bands?: number; ac?: boolean; entrance?: boolean; clock?: boolean } = {}): BuildingDef {
  const b = new PartBag();
  const rng = new Rng((o.seed ?? 3) * 17 + W * 3 + floors);
  const fh = 3.2;
  const H = floors * fh + 0.4;
  b.add(G.box(W, H, D), col, { pos: [0, H / 2, 0], topColor: lighten(col, 1.06) });
  for (let f = 1; f <= floors; f++) {
    b.add(G.box(W + 0.15, 0.22, D + 0.15), opts.bands ?? darken(col, 0.82), { pos: [0, f * fh + 0.1, 0] });
  }
  const glass = opts.glass ?? 0x34465a;
  const ys = Array.from({ length: floors }, (_, f) => f * fh + 1.8);
  windows(b, -W / 2 + 0.8, W / 2 - 0.8, ys.slice(opts.entrance ? 1 : 0), D / 2 + 0.05, 1.4, 1.5, darken(col, 0.6), glass, !!o.night, rng, 2.1);
  windows(b, -W / 2 + 0.8, W / 2 - 0.8, ys, -D / 2 - 0.05, 1.4, 1.5, darken(col, 0.6), glass, !!o.night, rng, 2.1, Math.PI);
  windows(b, -D / 2 + 0.8, D / 2 - 0.8, ys, W / 2 + 0.05, 1.4, 1.5, darken(col, 0.6), glass, !!o.night, rng, 2.1, Math.PI / 2);
  windows(b, -D / 2 + 0.8, D / 2 - 0.8, ys, -W / 2 - 0.05, 1.4, 1.5, darken(col, 0.6), glass, !!o.night, rng, 2.1, -Math.PI / 2);
  if (opts.entrance) {
    b.add(G.box(4, 2.6, 0.1), o.night ? 0xcfe0ff : 0x3a4a5a, { pos: [0, 1.3, D / 2 + 0.06], glow: o.night ? 0.35 : 0.05 });
    b.add(G.box(5.2, 0.25, 2.2), darken(col, 0.7), { pos: [0, 3.0, D / 2 + 1.0] });
    for (const sx of [-2.4, 2.4]) b.add(G.box(0.2, 3, 0.2), darken(col, 0.7), { pos: [sx, 1.5, D / 2 + 2.0] });
  }
  b.add(G.box(W + 0.3, 0.5, D + 0.3), darken(col, 0.85), { pos: [0, H + 0.25, 0] });
  if (opts.rooftopFence) {
    for (let i = 0; i <= W; i += 1) for (const sz of [-1, 1]) b.add(G.box(0.05, 1.4, 0.05), 0x7a8088, { pos: [-W / 2 + i, H + 1.2, sz * (D / 2 - 0.1)] });
    for (const sz of [-1, 1]) b.add(G.box(W, 0.06, 0.06), 0x7a8088, { pos: [0, H + 1.9, sz * (D / 2 - 0.1)] });
    b.add(G.box(3, 2.4, 3), col, { pos: [W / 2 - 3, H + 1.2, 0] }); // stairwell
  }
  if (opts.ac) for (let i = 0; i < 4; i++) b.add(G.box(1.2, 0.8, 1), 0xc8c8c4, { pos: [-W / 2 + 2 + i * (W - 4) / 3, H + 0.8, rng.range(-D / 4, D / 4)] });
  if (opts.clock) {
    b.add(G.cyl(0.9, 0.9, 0.15, 20), 0xf4f4f0, { pos: [0, H - 1.4, D / 2 + 0.1], rot: [Math.PI / 2, 0, 0], glow: o.night ? 0.6 : 0 });
    b.add(G.box(0.08, 0.7, 0.05), 0x111111, { pos: [0, H - 1.15, D / 2 + 0.2] });
    b.add(G.box(0.5, 0.08, 0.05), 0x111111, { pos: [0.2, H - 1.4, D / 2 + 0.2] });
  }
  const extras = opts.sign ? () => {
    const s = signPlane(opts.sign!, Math.min(W * 0.6, 10), 1.2, opts.signColor ?? '#ffffff');
    s.position.set(0, H - 0.6, D / 2 + 0.15);
    return [s];
  } : undefined;
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: W, d: D }], height: H + 2, extras, outline: 0.02 };
}

function gym(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const W = 16, D = 12, H = 6;
  const rng = new Rng(5);
  b.add(G.box(W, H, D), 0xd8d4c8, { pos: [0, H / 2, 0] });
  const roof = new THREE.CylinderGeometry(D / 2 + 0.4, D / 2 + 0.4, W + 0.6, 24, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.35, 1);
  b.add(roof, 0x4a6a8a, { pos: [0, H, 0], topColor: 0x6a8aaa });
  windows(b, -W / 2 + 1, W / 2 - 1, [H - 1.5], D / 2 + 0.05, 1.8, 1.2, 0x5a5a5a, 0x34465a, !!o.night, rng, 2.4);
  windows(b, -W / 2 + 1, W / 2 - 1, [H - 1.5], -D / 2 - 0.05, 1.8, 1.2, 0x5a5a5a, 0x34465a, !!o.night, rng, 2.4, Math.PI);
  b.add(G.box(3.5, 2.8, 0.1), 0x4a5a6a, { pos: [0, 1.4, D / 2 + 0.06] });
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: W, d: D }], height: H + 2, outline: 0.02 };
}

function prisonBlock(o: BuildOpts): BuildingDef {
  const d = concreteBlock(o, 18, 8, 2, 0x8c8e8a, { ac: true, bands: 0x6a6c68 });
  const b = new PartBag();
  b.addBaked(d.geo);
  // bars over windows
  for (let i = 0; i < 40; i++) b.add(G.box(0.05, 1.6, 0.05), 0x2a2a2a, { pos: [-8.2 + i * 0.42, 1.8 + (i % 2) * 0, 4.12] });
  for (let i = 0; i < 40; i++) b.add(G.box(0.05, 1.6, 0.05), 0x2a2a2a, { pos: [-8.2 + i * 0.42, 5.0, 4.12] });
  b.add(G.box(3, 3, 0.1), 0x3a3e44, { pos: [0, 1.5, 4.08] });
  return { ...d, geo: b.build() };
}

function guardTower(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.box(0.3, 7, 0.3), 0x5a5e66, { pos: [sx * 1.2, 3.5, sz * 1.2] });
  b.add(G.box(3.4, 0.3, 3.4), 0x4a4e56, { pos: [0, 7, 0] });
  b.add(G.box(3.2, 2.2, 3.2), 0x7a7e86, { pos: [0, 8.2, 0] });
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const m = new THREE.Matrix4().makeRotationY(r);
    b.add(G.box(2.6, 0.9, 0.08), o.night ? 0xfff0c0 : 0x34465a, { pos: [0, 8.6, 1.62], glow: o.night ? 1.2 : 0 }, m);
  }
  b.add(G.box(3.8, 0.3, 3.8), 0x3a3e46, { pos: [0, 9.45, 0] });
  b.add(G.box(0.8, 0.5, 0.6), 0x2a2e34, { pos: [0, 9.9, 1.2] });
  b.add(G.box(0.6, 0.4, 0.05), 0xffffff, { pos: [0, 9.9, 1.52], glow: 2.5 });
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: 3, d: 3 }], height: 10.5, lights: [{ pos: [0, 9.5, 2], color: 0xe8f0ff, intensity: 16, range: 16 }], outline: 0.02 };
}

const SHOP_SIGNS = ['ラーメン', 'カフェ', '本屋', '薬局', '居酒屋', 'コンビニ', '寿司', '花屋', 'ゲーム', 'カラオケ'];
const SIGN_COLORS = ['#ff5a7a', '#5ae0ff', '#ffd04a', '#9a7aff', '#7aff9a', '#ff9a4a'];

function shopRow(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const rng = new Rng((o.seed ?? 1) * 97 + 7);
  const N = 3, SW = 5, D = 6;
  const names: string[] = [];
  const colors: string[] = [];
  for (let i = 0; i < N; i++) {
    const x = -SW + i * SW;
    const floors = rng.int(2, 3);
    const H = floors * 3;
    const col = rng.pick([0xd8cfc0, 0xb8b0a4, 0xe8e0d0, 0xa4a8ac, 0xc8b8a0]);
    b.add(G.box(SW - 0.1, H, D), col, { pos: [x, H / 2, 0], topColor: lighten(col, 1.05) });
    b.add(G.box(SW - 0.4, 2.4, 0.1), o.night ? 0xffe8c0 : 0x3a4a5a, { pos: [x, 1.3, D / 2 + 0.05], glow: o.night ? 1.0 : 0.05 });
    const aw = rng.pick([0xc83a3a, 0x3a7ac8, 0x3a9a5a, 0xe0a030, 0x6a3a9a]);
    const awn = G.box(SW - 0.3, 0.1, 1.4);
    b.add(awn, aw, { pos: [x, 2.85, D / 2 + 0.65], rot: [0.3, 0, 0], colorFn: (xx, _y, _z, c) => { if (Math.floor((xx + 10) * 2.5) % 2) c.setHex(0xf4f0e8); } });
    windows(b, x - SW / 2 + 0.5, x + SW / 2 - 0.5, Array.from({ length: floors - 1 }, (_, f) => 4.6 + f * 3), D / 2 + 0.05, 1.2, 1.2, 0x5a5a5a, 0x34465a, !!o.night, rng, 2.2);
    b.add(G.box(SW - 0.1, 0.3, D + 0.1), darken(col, 0.8), { pos: [x, H + 0.15, 0] });
    names.push(rng.pick(SHOP_SIGNS));
    colors.push(rng.pick(SIGN_COLORS));
    // vertical sign post
    b.add(G.box(0.7, 2.6, 0.2), 0x1a1a1e, { pos: [x + SW / 2 - 0.6, 4.6, D / 2 + 0.5] });
  }
  const extras = () => names.map((n, i) => {
    const s = signPlane(n, 2.6, 0.7, colors[i], 'rgba(10,10,14,0.85)', 'bold 110px sans-serif', !!o.night);
    s.position.set(-SW + i * SW, 3.45, D / 2 + 0.12);
    return s;
  });
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: SW * N, d: D }], height: 9, extras, outline: 0.02 };
}

function theater(o: BuildOpts): BuildingDef {
  const d = concreteBlock(o, 14, 9, 3, 0x6a5a6a, { sign: 'CINEMA 映画館', signColor: '#ffcf5a', entrance: true });
  const b = new PartBag();
  b.addBaked(d.geo);
  // marquee bulbs
  for (let i = 0; i < 24; i++) b.add(G.sphere(0.08, 6, 4), 0xffe08a, { pos: [-6 + i * 0.52, 3.6, 5.6], glow: o.night ? 2.2 : 0.4 });
  for (let i = 0; i < 3; i++) b.add(G.box(1.6, 2.2, 0.08), [0x8a2a5a, 0x2a5a8a, 0x5a8a2a][i], { pos: [-4.5 + i * 4.5, 6.4, 4.56], glow: 0.6 });
  return { ...d, geo: b.build() };
}

function apartment(o: BuildOpts): BuildingDef {
  const d = concreteBlock(o, 12, 8, 4, 0xc8c0b4, { ac: true });
  const b = new PartBag();
  b.addBaked(d.geo);
  for (let f = 1; f < 4; f++) {
    b.add(G.box(11.6, 0.15, 1.2), 0xa8a094, { pos: [0, f * 3.2 + 0.1, 4.6] });
    b.add(G.box(11.6, 1.0, 0.08), 0x8a8478, { pos: [0, f * 3.2 + 0.65, 5.2] });
  }
  return { ...d, geo: b.build() };
}

function skyscraper(o: BuildOpts): BuildingDef {
  const rng = new Rng((o.seed ?? 1) * 131 + 5);
  const floors = rng.int(7, 11);
  const col = rng.pick([0x3a3e48, 0x4a4e5a, 0x2e323c, 0x5a5048, 0x403a4a]);
  const W = rng.pick([10, 12, 14]);
  const sign = rng.pick(['SHIBUYA 109', 'ネオン', 'ゲームセンター', 'HALLOWEEN', 'MUSIC', '渋谷', 'カラオケ', 'TOWER', 'Q-FRONT']);
  const signColor = rng.pick(['#ff4aa8', '#2ae0ff', '#ffd02a', '#a04aff', '#ff6a3a']);
  const d = concreteBlock(o, W, 10, floors, col, { glass: 0x1e2a3a, bands: darken(col, 0.7), sign, signColor });
  const b = new PartBag();
  b.addBaked(d.geo);
  // vertical neon strips at corners
  const nc = new THREE.Color(signColor).getHex();
  for (const sx of [-1, 1]) b.add(G.box(0.15, floors * 3.2, 0.15), nc, { pos: [sx * (W / 2 + 0.05), floors * 1.6, 5.05], glow: 2.0 });
  // big screen
  if (rng.chance(0.6)) b.add(G.box(W * 0.55, 4, 0.1), rng.pick([0x4a8aff, 0xff4a8a, 0x8aff4a]), { pos: [0, floors * 3.2 - 5, 5.12], glow: 1.6 });
  return { ...d, geo: b.build(), lights: [{ pos: [0, 6, 7], color: nc, intensity: 10, range: 14 }] };
}

function station(o: BuildOpts): BuildingDef {
  const d = concreteBlock(o, 30, 10, 2, 0xb8b4a8, { sign: '渋谷駅  SHIBUYA STA.', signColor: '#ffffff', entrance: true, glass: 0x2a3a4a });
  return { ...d, lights: [{ pos: [0, 4, 7], color: 0xdfe8ff, intensity: 12, range: 14 }] };
}

function schoolBuilding(o: BuildOpts): BuildingDef {
  return concreteBlock(o, 32, 9, 4, 0xe2ddd0, { rooftopFence: true, entrance: true, clock: true, bands: 0xbab4a4, sign: '杉沢第三高校', signColor: '#2a2a2a' });
}

function kyotoHall(o: BuildOpts): BuildingDef {
  const d = templeHall(o);
  return d;
}

function koiPond(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const R = 4.5;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU;
    const rr = R + Math.sin(a * 3) * 0.4;
    b.add(G.dodeca(0.5 + (i % 3) * 0.1), 0x8a867c, { pos: [Math.sin(a) * rr, 0.15, Math.cos(a) * rr * 0.75], topColor: 0xa8a49a });
  }
  // arched red bridge across
  const arch = 12;
  for (let i = 0; i < arch; i++) {
    const t = i / (arch - 1);
    const y = Math.sin(t * Math.PI) * 0.9 + 0.3;
    b.add(G.box(0.7, 0.12, 1.6), 0x8a5a36, { pos: [-R + t * 2 * R, y, 0], rot: [0, 0, Math.cos(t * Math.PI) * -0.35] });
    for (const sz of [-0.8, 0.8]) b.add(G.box(0.08, 0.6, 0.08), 0xc8302a, { pos: [-R + t * 2 * R, y + 0.35, sz] });
  }
  for (const sz of [-0.8, 0.8]) for (let i = 0; i < arch - 1; i++) {
    const t0 = i / (arch - 1), t1 = (i + 1) / (arch - 1);
    const y0 = Math.sin(t0 * Math.PI) * 0.9 + 0.95, y1 = Math.sin(t1 * Math.PI) * 0.9 + 0.95;
    const len = Math.hypot(2 * R / (arch - 1), y1 - y0);
    b.add(G.box(len, 0.08, 0.1), 0xc8302a, { pos: [-R + (t0 + t1) * R, (y0 + y1) / 2, sz], rot: [0, 0, Math.atan2(y1 - y0, 2 * R / (arch - 1))] });
  }
  void o;
  const extras = () => {
    const water = new THREE.Mesh(new THREE.CircleGeometry(R, 32), waterMaterial(0x2a6a7a));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(1, 0.75, 1);
    water.position.y = 0.08;
    return [water];
  };
  return { geo: b.build(), colliders: [{ x: 0, z: -2.0, w: R * 2, d: 2.6 }, { x: 0, z: 2.0, w: R * 2, d: 2.6 }], height: 2, extras, outline: 0.015 };
}

function canal(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const L = 40, W = 6;
  for (const sz of [-1, 1]) {
    b.add(G.box(L, 1.2, 0.5), 0x5a625c, { pos: [0, -0.2, sz * (W / 2 + 0.25)], topColor: 0x7a827c });
    for (let i = 0; i < 8; i++) b.add(G.cyl(0.4, 0.4, 0.3, 12), 0x2a3230, { pos: [-L / 2 + 3 + i * 5, 0, sz * (W / 2 + 0.02)], rot: [Math.PI / 2, 0, 0] });
  }
  void o;
  const extras = () => {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(L, W), waterMaterial(0x3a5a3a, 0.85));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.15;
    return [water];
  };
  return { geo: b.build(), colliders: [{ x: 0, z: 0, w: L, d: W }], height: 1, extras, outline: false };
}

function wombGrowth(o: BuildOpts): BuildingDef {
  const b = new PartBag();
  const rng = new Rng(77);
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * TAU, r = rng.range(1, 6);
    b.add(G.ellipsoid(rng.range(0.6, 1.4), rng.range(0.3, 1.2), rng.range(0.6, 1.4), 12, 10), rng.pick([0xa04a5a, 0x8a3a4a, 0xb85a6a]), { pos: [Math.sin(a) * r, 0.1, Math.cos(a) * r], colorFn: (x, y, z, c) => { if (Math.sin(x * 9 + z * 7) * Math.cos(y * 12) > 0.75) c.setHex(0x4a0a1a); } });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    b.add(G.limb(0.25, 0.08, 4), 0x8a3a4a, { pos: [Math.sin(a) * 7, 3.5, Math.cos(a) * 7], rot: [Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4] });
  }
  void o;
  return { geo: b.build(), colliders: [], height: 4, outline: 0.02 };
}

// ---------- registry ----------

const BUILDERS: Record<string, (o: BuildOpts) => BuildingDef> = {
  templeHall, kyotoHall, pagoda, infirmary, gym, prisonBlock, guardTower, shopRow, theater, apartment, skyscraper, station, schoolBuilding, koiPond, canal, wombGrowth,
  dorm: (o) => woodHouse(o, 12, 6, 2, 0xece4d2, 0x3a3e48, '寮  DORMITORY'),
  classroom: (o) => woodHouse(o, 14, 7, 2, 0xe8e2d4, 0x2e3a4a, '教室棟  CLASSROOMS'),
  house: (o) => woodHouse(o, 8, 6, 2, 0xd8d0c0, 0x5a3a2a),
  storehouse: (o) => woodHouse(o, 6, 5, 1, 0xf0ece0, 0x2a2e36),
  prisonAdmin: (o) => concreteBlock(o, 14, 9, 3, 0x9a9c98, { entrance: true, sign: '英集少年院', signColor: '#1a1a1a', bands: 0x7a7c78 }),
  office: (o) => concreteBlock(o, 12, 9, 5, 0x9aa4ae, { glass: 0x2a3a4e, ac: true }),
};

const cache = new Map<string, BuildingDef>();
export function getBuilding(name: string, o: BuildOpts = {}): BuildingDef {
  const key = name + ':' + (o.night ? 1 : 0) + ':' + (o.seed ?? 0);
  let d = cache.get(key);
  if (!d) {
    const f = BUILDERS[name];
    if (!f) throw new Error('Unknown building ' + name);
    d = f(o);
    cache.set(key, d);
  }
  return d;
}

export function buildingMesh(def: BuildingDef, quality: 'low' | 'medium' | 'high') {
  const g = new THREE.Group();
  const m = new THREE.Mesh(def.geo, toonMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  if (def.outline !== false && quality !== 'low') {
    const o = new THREE.Mesh(def.geo, outlineMaterial(def.outline ?? 0.02));
    g.add(o);
  }
  if (def.extras) for (const e of def.extras()) g.add(e);
  return g;
}

let waterMats: THREE.ShaderMaterial[] = [];
export function waterMaterial(color = 0x2a6a8a, opacity = 0.8) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying vec3 vW;
      void main(){
        float a = sin(vW.x*2.3 + uTime*1.3) * sin(vW.z*1.9 - uTime*1.1);
        float b = sin((vW.x+vW.z)*4.1 - uTime*2.0) * 0.5;
        float s = smoothstep(0.7, 1.0, a*0.6 + b*0.5);
        vec3 c = uColor * (0.88 + 0.12*a) + vec3(0.55,0.7,0.8) * s * 0.22;
        gl_FragColor = vec4(c, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  waterMats.push(m);
  return m;
}
export function tickWater(t: number) {
  waterMats = waterMats.filter(m => { m.uniforms.uTime.value = t; return true; });
}
export function clearWaterMaterials() {
  for (const m of waterMats) m.dispose();
  waterMats = [];
}
