// Static prop library. Each prop is one merged geometry rendered with instancing.
import * as THREE from 'three';
import { G, PartBag, V3 } from '../geo';
import { Rng, TAU } from '../../core/util';
import { darken, lighten } from './humanoid';

export interface PropDef {
  geo: THREE.BufferGeometry;
  /** circle collider radius, or axis-aligned box [w, d] (rotated with the prop in 90° steps) */
  collide?: { r?: number; box?: [number, number] };
  light?: { y: number; color: number; intensity: number; range: number; flicker?: boolean };
  outline?: number | false;
  shadow?: boolean;
  /** sway in wind (vertex shader not used; just a hint for future) */
  doubleSided?: boolean;
}

type Builder = () => PropDef;

function tree(canopy: number[], trunk = 0x5a3e2a, h = 2.2, r = 1.2, seed = 1): PropDef {
  const b = new PartBag();
  const rng = new Rng(seed);
  b.add(G.cyl(0.14, 0.24, h, 8), trunk, { pos: [0, h / 2, 0], topColor: darken(trunk, 0.8) });
  for (let i = 0; i < 3; i++) {
    const a = rng.next() * TAU;
    b.add(G.cyl(0.04, 0.08, 0.8, 5), trunk, { pos: [Math.sin(a) * 0.3, h * 0.75, Math.cos(a) * 0.3], rot: [Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8] });
  }
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rng.next();
    const rr = i === 0 ? 0 : r * 0.55;
    const s = r * (i === 0 ? 0.9 : rng.range(0.55, 0.75));
    const col = canopy[i % canopy.length];
    b.add(G.icosa(s, 1), col, { pos: [Math.sin(a) * rr, h + r * 0.35 + (i === 0 ? r * 0.3 : rng.range(-0.2, 0.3)), Math.cos(a) * rr], topColor: lighten(col, 1.12) });
  }
  return { geo: b.build(), collide: { r: 0.35 }, outline: 0.03, shadow: true };
}

function pine(h = 3.2, col = 0x2e5a3a, seed = 2): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.12, 0.2, h * 0.5, 7), 0x4a3424, { pos: [0, h * 0.25, 0] });
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const rr = 1.3 * (1 - t * 0.7);
    b.add(G.cone(rr, h * 0.42, 9), i % 2 ? col : darken(col, 0.88), { pos: [0, h * 0.35 + i * h * 0.2, 0], topColor: lighten(col, 1.3) });
  }
  void seed;
  return { geo: b.build(), collide: { r: 0.35 }, outline: 0.03, shadow: true };
}

function cedar(): PropDef {
  const b = new PartBag();
  const h = 7;
  b.add(G.cyl(0.18, 0.32, h * 0.6, 8), 0x5a3a26, { pos: [0, h * 0.3, 0], topColor: 0x3a2618 });
  for (let i = 0; i < 6; i++) {
    const rr = 1.5 * (1 - i / 7);
    b.add(G.cone(rr, 1.8, 9), i % 2 ? 0x24452c : 0x2c5434, { pos: [0, 2.6 + i * 0.85, 0], topColor: 0x4a7a4a });
  }
  return { geo: b.build(), collide: { r: 0.45 }, outline: 0.035, shadow: true };
}

function bamboo(seed = 3): PropDef {
  const b = new PartBag();
  const rng = new Rng(seed);
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-0.6, 0.6), z = rng.range(-0.6, 0.6), h = rng.range(3.5, 5.5);
    const lean: V3 = [rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08)];
    b.add(G.cyl(0.05, 0.06, h, 6), 0x7aa04a, { pos: [x, h / 2, z], rot: lean, colorFn: (_x, y, _z, c) => { if (Math.abs(((y + 50) % 0.6) - 0.3) < 0.025) c.setHex(0x4a6a2a); } });
    for (let k = 0; k < 3; k++) b.add(G.ellipsoid(0.35, 0.03, 0.08), 0x5a8a3a, { pos: [x + rng.range(-0.3, 0.3), h * rng.range(0.6, 1), z + rng.range(-0.3, 0.3)], rot: [0, rng.next() * 3, rng.range(-0.4, 0.4)], topColor: 0x8ab85a });
  }
  return { geo: b.build(), collide: { r: 0.5 }, outline: 0.015, shadow: true };
}

function deadTree(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.1, 0.25, 2.6, 7), 0x3a3230, { pos: [0, 1.3, 0] });
  const rng = new Rng(9);
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * TAU, y = rng.range(1.2, 2.5);
    b.add(G.cyl(0.02, 0.07, 1.1, 5), 0x3a3230, { pos: [Math.sin(a) * 0.4, y + 0.3, Math.cos(a) * 0.4], rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] });
  }
  return { geo: b.build(), collide: { r: 0.3 }, outline: 0.02, shadow: true };
}

function rock(seed: number, s = 1, col = 0x7a7670): PropDef {
  const b = new PartBag();
  const rng = new Rng(seed);
  const g = G.dodeca(0.6 * s);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rng.range(0.85, 1.2), p.getY(i) * 0.7, p.getZ(i) * rng.range(0.85, 1.2));
  g.computeVertexNormals();
  b.add(g, col, { pos: [0, 0.25 * s, 0], topColor: lighten(col, 1.2) });
  if (seed % 2) b.add(G.dodeca(0.3 * s), darken(col, 0.9), { pos: [0.55 * s, 0.1 * s, 0.2 * s] });
  return { geo: b.build(), collide: { r: 0.6 * s }, outline: 0.02, shadow: true };
}

function mossRock(): PropDef {
  const r = rock(5, 1.3, 0x6a6e62);
  const b = new PartBag();
  b.addBaked(r.geo);
  b.add(G.ellipsoid(0.7, 0.18, 0.6), 0x4a6a32, { pos: [0, 0.65, 0], topColor: 0x6a8a3a });
  return { geo: b.build(), collide: { r: 0.8 }, outline: 0.02, shadow: true };
}

function stoneLantern(): PropDef {
  const b = new PartBag();
  const c = 0x8e8a82;
  b.add(G.cyl(0.32, 0.38, 0.15, 8), c, { pos: [0, 0.075, 0] });
  b.add(G.cyl(0.1, 0.12, 0.7, 8), c, { pos: [0, 0.5, 0] });
  b.add(G.cyl(0.3, 0.22, 0.12, 6), c, { pos: [0, 0.9, 0] });
  b.add(G.box(0.36, 0.3, 0.36), c, { pos: [0, 1.11, 0] });
  b.add(G.box(0.2, 0.18, 0.4), 0xffcf7a, { pos: [0, 1.11, 0], glow: 1.4 });
  b.add(G.box(0.4, 0.18, 0.2), 0xffcf7a, { pos: [0, 1.11, 0], glow: 1.4 });
  b.add(G.cone(0.42, 0.3, 6), c, { pos: [0, 1.42, 0], topColor: lighten(c, 1.15) });
  b.add(G.sphere(0.07, 8, 6), c, { pos: [0, 1.62, 0] });
  return { geo: b.build(), collide: { r: 0.35 }, outline: 0.015, shadow: true, light: { y: 1.1, color: 0xffb05a, intensity: 6, range: 7 } };
}

function paperLantern(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.04, 0.05, 2.2, 6), 0x2a1a12, { pos: [0, 1.1, 0] });
  b.add(G.box(0.6, 0.05, 0.05), 0x2a1a12, { pos: [0.25, 2.15, 0] });
  b.add(G.ellipsoid(0.22, 0.3, 0.22, 12, 10), 0xff6a3a, { pos: [0.5, 1.75, 0], glow: 1.6, colorFn: (_x, y, _z, c) => { if (Math.abs(y) % 0.1 < 0.012) c.setHex(0x6a1a10); } });
  return { geo: b.build(), collide: { r: 0.15 }, outline: 0.012, shadow: false, light: { y: 1.75, color: 0xff7a40, intensity: 5, range: 7 } };
}

function streetLamp(color = 0xdfe8ff): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.06, 0.09, 4.2, 8), 0x3a3e46, { pos: [0, 2.1, 0] });
  b.add(G.box(0.9, 0.08, 0.1), 0x3a3e46, { pos: [0.4, 4.15, 0] });
  b.add(G.box(0.42, 0.12, 0.24), 0x2a2e34, { pos: [0.8, 4.08, 0] });
  b.add(G.box(0.36, 0.04, 0.18), color, { pos: [0.8, 4.0, 0], glow: 2.5 });
  return { geo: b.build(), collide: { r: 0.15 }, outline: 0.012, shadow: true, light: { y: 3.8, color, intensity: 10, range: 11 } };
}

function floodLight(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.1, 0.14, 6, 8), 0x4a4e56, { pos: [0, 3, 0] });
  b.add(G.box(1.2, 0.5, 0.3), 0x2a2e34, { pos: [0, 6, 0] });
  b.add(G.box(1.1, 0.4, 0.05), 0xf4f8ff, { pos: [0, 6, 0.16], glow: 2.5 });
  return { geo: b.build(), collide: { r: 0.2 }, outline: 0.015, shadow: true, light: { y: 5.5, color: 0xe8f0ff, intensity: 20, range: 16 } };
}

function vending(color = 0xd84040): PropDef {
  const b = new PartBag();
  b.add(G.box(1.0, 1.9, 0.75), color, { pos: [0, 0.95, 0], topColor: lighten(color, 1.15) });
  b.add(G.box(0.86, 1.0, 0.04), 0xcfe6ff, { pos: [0, 1.25, 0.38], glow: 0.3 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    b.add(G.cyl(0.05, 0.05, 0.18, 6), [0x3a8ad8, 0xe8c040, 0x40b060, 0xe05a5a, 0xf0f0f0][c], { pos: [-0.32 + c * 0.16, 0.95 + r * 0.3, 0.37], glow: 0.25 });
  }
  b.add(G.box(0.5, 0.15, 0.06), 0x111111, { pos: [0, 0.35, 0.38] });
  return { geo: b.build(), collide: { box: [1.0, 0.8] }, outline: 0.012, shadow: true, light: { y: 1.3, color: 0xcfe8ff, intensity: 2, range: 4 } };
}

function bench(): PropDef {
  const b = new PartBag();
  const w = 0x8a5a36;
  for (let i = 0; i < 3; i++) b.add(G.box(1.8, 0.06, 0.14), w, { pos: [0, 0.45, -0.15 + i * 0.16] });
  for (let i = 0; i < 2; i++) b.add(G.box(1.8, 0.14, 0.05), w, { pos: [0, 0.75 + i * 0.18, -0.3], rot: [-0.15, 0, 0] });
  for (const sx of [-0.75, 0.75]) b.add(G.box(0.08, 0.45, 0.5), 0x2a2a30, { pos: [sx, 0.22, 0] });
  return { geo: b.build(), collide: { box: [1.8, 0.6] }, outline: 0.012, shadow: true };
}

function fenceWood(): PropDef {
  const b = new PartBag();
  const c = 0x6e4a2e;
  for (let i = 0; i < 2; i++) b.add(G.box(0.12, 1.2, 0.12), c, { pos: [-1 + i * 2, 0.6, 0] });
  for (let i = 0; i < 2; i++) b.add(G.box(2.0, 0.1, 0.06), c, { pos: [0, 0.45 + i * 0.45, 0] });
  return { geo: b.build(), collide: { box: [2, 0.25] }, outline: 0.01, shadow: true };
}

function fenceMetal(): PropDef {
  const b = new PartBag();
  const c = 0x5a6068;
  for (let i = 0; i < 2; i++) b.add(G.cyl(0.04, 0.04, 2.2, 6), c, { pos: [-1 + i * 2, 1.1, 0] });
  b.add(G.box(2.0, 0.04, 0.04), c, { pos: [0, 2.15, 0] });
  b.add(G.box(2.0, 0.04, 0.04), c, { pos: [0, 0.1, 0] });
  for (let i = 0; i < 12; i++) b.add(G.box(0.015, 2.0, 0.015), 0x7a8088, { pos: [-0.92 + i * 0.167, 1.1, 0], rot: [0, 0, 0.5] });
  for (let i = 0; i < 12; i++) b.add(G.box(0.015, 2.0, 0.015), 0x7a8088, { pos: [-0.92 + i * 0.167, 1.1, 0], rot: [0, 0, -0.5] });
  return { geo: b.build(), collide: { box: [2, 0.25] }, outline: false, shadow: true };
}

function wallConcrete(h = 3, barbed = false, col = 0x8a8a86): PropDef {
  const b = new PartBag();
  b.add(G.box(4, h, 0.4), col, { pos: [0, h / 2, 0], topColor: lighten(col, 1.1), colorFn: (x, y, _z, c) => { if (Math.abs(((x + 10) % 1.0)) < 0.03) c.multiplyScalar(0.85); void y; } });
  b.add(G.box(4.05, 0.15, 0.5), darken(col, 0.85), { pos: [0, h, 0] });
  if (barbed) {
    for (let i = 0; i < 3; i++) b.add(G.cyl(0.03, 0.03, 0.8, 4), 0x3a3a3a, { pos: [-1.5 + i * 1.5, h + 0.4, 0] });
    // razor-wire coil: thin tilted loops along the top
    for (let i = 0; i < 12; i++) b.add(G.torus(0.22, 0.01, 3, 12), 0x8a8a8a, { pos: [-1.85 + i * 0.335, h + 0.5, 0], rot: [0, Math.PI / 2, 0.35] });
  }
  return { geo: b.build(), collide: { box: [4, 0.5] }, outline: 0.01, shadow: true };
}

function wallStone(): PropDef {
  const b = new PartBag();
  b.add(G.box(4, 1.6, 0.6), 0xd8d4c8, { pos: [0, 0.8, 0] });
  b.add(G.box(4.1, 0.3, 0.9), 0x3a3e4a, { pos: [0, 1.75, 0], topColor: 0x5a5e6a });
  b.add(G.box(4, 0.4, 0.7), 0x7a766e, { pos: [0, 0.2, 0] });
  return { geo: b.build(), collide: { box: [4, 0.7] }, outline: 0.012, shadow: true };
}

function torii(scale = 1, col = 0xc8302a): PropDef {
  const b = new PartBag();
  const s = scale;
  for (const sx of [-1.6, 1.6]) {
    b.add(G.cyl(0.18 * s, 0.22 * s, 4.2 * s, 12), col, { pos: [sx * s, 2.1 * s, 0] });
    b.add(G.cyl(0.26 * s, 0.26 * s, 0.35 * s, 12), 0x1a1a1a, { pos: [sx * s, 0.17 * s, 0] });
  }
  b.add(G.box(4.4 * s, 0.25 * s, 0.32 * s), col, { pos: [0, 3.4 * s, 0] });
  const top = G.box(5.4 * s, 0.32 * s, 0.45 * s);
  const p = top.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (x * x) * 0.012 / s); }
  top.computeVertexNormals();
  b.add(top, col, { pos: [0, 4.05 * s, 0] });
  b.add(G.box(5.6 * s, 0.14 * s, 0.5 * s), 0x1a1a1a, { pos: [0, 4.28 * s, 0], colorFn: undefined });
  b.add(G.box(0.25 * s, 0.6 * s, 0.25 * s), col, { pos: [0, 3.72 * s, 0] });
  return { geo: b.build(), collide: { r: 0 }, outline: 0.02, shadow: true };
}

function shrineSmall(): PropDef {
  const b = new PartBag();
  b.add(G.box(1.4, 0.3, 1.2), 0x7a766e, { pos: [0, 0.15, 0] });
  b.add(G.box(1.0, 0.9, 0.8), 0x8a5a36, { pos: [0, 0.75, 0] });
  b.add(G.box(0.6, 0.6, 0.05), 0x2a1a12, { pos: [0, 0.75, 0.41] });
  const roof = G.cyl(0.02, 1.0, 0.6, 4);
  roof.rotateY(Math.PI / 4);
  b.add(roof, 0x2e3440, { pos: [0, 1.5, 0], scale: [1.1, 1, 1.0], topColor: 0x4a5060 });
  b.add(G.box(0.12, 0.08, 0.12), 0xe0b84e, { pos: [0, 1.82, 0], glow: 0.3 });
  b.add(G.torus(0.3, 0.04, 6, 14), 0xe8dcc0, { pos: [0, 1.2, 0.45] });
  return { geo: b.build(), collide: { box: [1.4, 1.2] }, outline: 0.012, shadow: true };
}

function bell(): PropDef {
  const b = new PartBag();
  for (const sx of [-1, 1]) b.add(G.box(0.2, 3, 0.2), 0x5a3a24, { pos: [sx * 1.0, 1.5, 0] });
  b.add(G.box(2.6, 0.2, 0.3), 0x5a3a24, { pos: [0, 3.0, 0] });
  const roof = G.cyl(0.05, 1.9, 0.8, 4); roof.rotateY(Math.PI / 4);
  b.add(roof, 0x2e3440, { pos: [0, 3.5, 0], scale: [1, 1, 0.6] });
  b.add(G.lathe([[0, 0], [0.45, 0], [0.42, 0.2], [0.34, 0.8], [0.15, 0.95], [0, 1.0]], 14), 0x8a7a40, { pos: [0, 1.6, 0], topColor: 0x5a6a3a });
  return { geo: b.build(), collide: { box: [2.4, 0.6] }, outline: 0.015, shadow: true };
}

function car(color: number, seed = 1): PropDef {
  const b = new PartBag();
  const c = color;
  b.add(G.box(1.8, 0.6, 4.0), c, { pos: [0, 0.6, 0], topColor: lighten(c, 1.1) });
  b.add(G.box(1.6, 0.55, 2.0), c, { pos: [0, 1.15, -0.2] });
  b.add(G.box(1.62, 0.42, 1.9), 0x1a2a3a, { pos: [0, 1.17, -0.2], glow: 0.05 });
  b.add(G.box(1.5, 0.4, 0.04), 0x2a3a4a, { pos: [0, 1.15, 0.82], rot: [0.5, 0, 0] });
  for (const sx of [-0.85, 0.85]) for (const sz of [-1.3, 1.3]) b.add(G.cyl(0.33, 0.33, 0.25, 12), 0x141414, { pos: [sx, 0.33, sz], rot: [0, 0, Math.PI / 2] });
  for (const sx of [-0.6, 0.6]) {
    b.add(G.box(0.35, 0.15, 0.05), 0xfff4d8, { pos: [sx, 0.7, 2.01], glow: 1.2 });
    b.add(G.box(0.35, 0.15, 0.05), 0xd02020, { pos: [sx, 0.7, -2.01], glow: 0.8 });
  }
  void seed;
  return { geo: b.build(), collide: { box: [1.9, 4.1] }, outline: 0.012, shadow: true };
}

function van(): PropDef {
  const b = new PartBag();
  b.add(G.box(2.0, 1.9, 4.6), 0xe8e8e4, { pos: [0, 1.2, 0] });
  b.add(G.box(1.9, 0.7, 0.05), 0x1a2a3a, { pos: [0, 1.6, 2.31] });
  b.add(G.box(2.02, 0.2, 4.62), 0x3a6ad8, { pos: [0, 1.0, 0] });
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.5, 1.5]) b.add(G.cyl(0.36, 0.36, 0.26, 12), 0x141414, { pos: [sx, 0.36, sz], rot: [0, 0, Math.PI / 2] });
  return { geo: b.build(), collide: { box: [2.1, 4.7] }, outline: 0.012, shadow: true };
}

function blackSedan(): PropDef { return car(0x14141a); }

function trafficCone(): PropDef {
  const b = new PartBag();
  b.add(G.box(0.45, 0.05, 0.45), 0xe85a1a, { pos: [0, 0.025, 0] });
  b.add(G.cone(0.18, 0.7, 10), 0xf06a2a, { pos: [0, 0.38, 0], colorFn: (_x, y, _z, c) => { if (y > 0 && y < 0.12) c.setHex(0xf0f0f0); } });
  return { geo: b.build(), collide: { r: 0.25 }, outline: 0.01, shadow: true };
}

function barricade(): PropDef {
  const b = new PartBag();
  for (const sx of [-0.8, 0.8]) b.add(G.box(0.1, 1.0, 0.5), 0xe8e8e8, { pos: [sx, 0.5, 0] });
  b.add(G.box(1.9, 0.3, 0.06), 0xf0d020, { pos: [0, 0.8, 0], colorFn: (x, _y, _z, c) => { if (Math.floor((x + 5) * 3) % 2) c.setHex(0x111111); } });
  return { geo: b.build(), collide: { box: [1.9, 0.5] }, outline: 0.01, shadow: true };
}

function pumpkinProp(): PropDef {
  const b = new PartBag();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    b.add(G.ellipsoid(0.16, 0.26, 0.16), 0xe2781e, { pos: [Math.sin(a) * 0.18, 0.26, Math.cos(a) * 0.18], topColor: 0xf09a3a });
  }
  for (const sx of [-0.1, 0.1]) b.add(G.cone(0.06, 0.1, 3), 0xffd04a, { pos: [sx, 0.32, 0.31], rot: [Math.PI / 2, 0, 0], glow: 2.4 });
  b.add(G.ellipsoid(0.13, 0.035, 0.03), 0xffd04a, { pos: [0, 0.18, 0.32], glow: 2.4 });
  b.add(G.cyl(0.03, 0.04, 0.15, 6), 0x4a6a2a, { pos: [0, 0.55, 0] });
  return { geo: b.build(), collide: { r: 0.35 }, outline: 0.012, shadow: true, light: { y: 0.4, color: 0xff9a2a, intensity: 3, range: 4 } };
}

function crate(): PropDef {
  const b = new PartBag();
  b.add(G.box(1, 1, 1), 0x9a7448, { pos: [0, 0.5, 0], colorFn: (x, y, z, c) => { if (Math.abs(x) > 0.42 || Math.abs(y) > 0.42 || Math.abs(z) > 0.42) c.setHex(0x6a4a2a); } });
  return { geo: b.build(), collide: { box: [1, 1] }, outline: 0.01, shadow: true };
}

function barrel(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.4, 0.4, 1.1, 14), 0x3a5a8a, { pos: [0, 0.55, 0], colorFn: (_x, y, _z, c) => { if (Math.abs(y) > 0.4 || Math.abs(y) < 0.05) c.setHex(0x2a3a5a); } });
  return { geo: b.build(), collide: { r: 0.42 }, outline: 0.01, shadow: true };
}

function bush(col = 0x3a6a32): PropDef {
  const b = new PartBag();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    b.add(G.icosa(0.45, 1), col, { pos: [Math.sin(a) * 0.3, 0.35, Math.cos(a) * 0.3], topColor: lighten(col, 1.3) });
  }
  return { geo: b.build(), collide: { r: 0.5 }, outline: 0.02, shadow: true };
}

function flowerBush(): PropDef {
  const b = new PartBag();
  const r = bush(0x3e6e3a);
  b.addBaked(r.geo);
  const rng = new Rng(4);
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * TAU, rr = rng.range(0.2, 0.6);
    b.add(G.sphere(0.07, 6, 4), rng.pick([0xf06a9a, 0xf8e070, 0xffffff, 0xb06af0]), { pos: [Math.sin(a) * rr, rng.range(0.5, 0.75), Math.cos(a) * rr], glow: 0.1 });
  }
  return { geo: b.build(), collide: { r: 0.5 }, outline: 0.02, shadow: true };
}

function grassTuft(col = 0x5a8a3a): PropDef {
  const b = new PartBag();
  const rng = new Rng(8);
  for (let i = 0; i < 7; i++) {
    const a = rng.next() * TAU;
    b.add(G.cone(0.04, rng.range(0.3, 0.5), 3), col, { pos: [Math.sin(a) * 0.12, 0.18, Math.cos(a) * 0.12], rot: [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)], topColor: lighten(col, 1.4) });
  }
  return { geo: b.build(), outline: false, shadow: false };
}

function fern(): PropDef {
  const b = new PartBag();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    b.add(G.ellipsoid(0.08, 0.02, 0.5), 0x3a7a3a, { pos: [Math.sin(a) * 0.35, 0.2, Math.cos(a) * 0.35], rot: [0.5 * Math.cos(a) * 0, a, 0], topColor: 0x6aa04a });
  }
  return { geo: b.build(), outline: false, shadow: false };
}

function log(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.35, 0.38, 3.2, 10), 0x5a4030, { pos: [0, 0.35, 0], rot: [0, 0, Math.PI / 2], topColor: 0x6a5040 });
  b.add(G.cyl(0.3, 0.3, 0.02, 10), 0xb0905a, { pos: [1.61, 0.35, 0], rot: [0, 0, Math.PI / 2] });
  b.add(G.ellipsoid(0.6, 0.1, 0.3), 0x4a6a32, { pos: [0.3, 0.68, 0] });
  return { geo: b.build(), collide: { box: [3.2, 0.8] }, outline: 0.015, shadow: true };
}

function sakura(): PropDef { return tree([0xf6b8cc, 0xf2a2bc, 0xfad0dc], 0x4a3028, 2.3, 1.35, 11); }
function roundTree(): PropDef { return tree([0x4a8a3a, 0x3e7a34, 0x5a9a44], 0x5a3e2a, 2.0, 1.25, 12); }
function autumnTree(): PropDef { return tree([0xd8682a, 0xe0902a, 0xc84a2a], 0x4a3226, 2.1, 1.25, 13); }
function darkTree(): PropDef { return tree([0x2a3a34, 0x24322c, 0x34443a], 0x2a2220, 2.4, 1.3, 14); }

function postBox(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.25, 0.25, 1.2, 14), 0xd82a2a, { pos: [0, 0.6, 0] });
  b.add(G.hemi(0.27, 14, 6), 0xd82a2a, { pos: [0, 1.2, 0] });
  b.add(G.box(0.3, 0.04, 0.05), 0x111111, { pos: [0, 0.95, 0.25] });
  return { geo: b.build(), collide: { r: 0.28 }, outline: 0.012, shadow: true };
}

function utilityPole(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.12, 0.16, 7, 8), 0x8a8478, { pos: [0, 3.5, 0] });
  for (let i = 0; i < 2; i++) b.add(G.box(1.6, 0.08, 0.08), 0x5a5650, { pos: [0, 6.2 + i * 0.45, 0] });
  b.add(G.cyl(0.18, 0.18, 0.5, 8), 0x6a6a64, { pos: [0.3, 5.5, 0] });
  return { geo: b.build(), collide: { r: 0.2 }, outline: 0.012, shadow: true };
}

function trafficLight(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.08, 0.1, 4.4, 8), 0x4a4e56, { pos: [0, 2.2, 0] });
  b.add(G.box(1.6, 0.08, 0.08), 0x4a4e56, { pos: [0.75, 4.3, 0] });
  b.add(G.box(1.0, 0.35, 0.3), 0x2a2e34, { pos: [1.3, 4.05, 0] });
  b.add(G.sphere(0.1, 8, 6), 0x40e060, { pos: [0.98, 4.05, 0.16], glow: 2 });
  b.add(G.sphere(0.1, 8, 6), 0x403020, { pos: [1.3, 4.05, 0.16] });
  b.add(G.sphere(0.1, 8, 6), 0x402020, { pos: [1.62, 4.05, 0.16] });
  return { geo: b.build(), collide: { r: 0.15 }, outline: 0.01, shadow: true };
}

function trainingPost(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.18, 0.2, 1.8, 10), 0x9a7a4a, { pos: [0, 0.9, 0], colorFn: (_x, y, _z, c) => { if (Math.abs(y) % 0.3 < 0.04) c.setHex(0xe8dcc0); } });
  b.add(G.box(1.0, 0.12, 0.12), 0x9a7a4a, { pos: [0, 1.3, 0] });
  return { geo: b.build(), collide: { r: 0.25 }, outline: 0.012, shadow: true };
}

function goal(): PropDef {
  const b = new PartBag();
  for (const sx of [-2.5, 2.5]) b.add(G.cyl(0.06, 0.06, 2.2, 8), 0xf0f0f0, { pos: [sx, 1.1, 0] });
  b.add(G.cyl(0.06, 0.06, 5, 8), 0xf0f0f0, { pos: [0, 2.2, 0], rot: [0, 0, Math.PI / 2] });
  return { geo: b.build(), collide: { r: 0 }, outline: false, shadow: true };
}

function bikeRack(): PropDef {
  const b = new PartBag();
  b.add(G.box(4, 0.06, 0.06), 0x9aa0a8, { pos: [0, 0.3, 0] });
  for (let i = 0; i < 5; i++) {
    b.add(G.torus(0.3, 0.025, 4, 14), 0x2a2a2a, { pos: [-1.6 + i * 0.8, 0.32, 0.3], rot: [0, Math.PI / 2, 0] });
    b.add(G.torus(0.3, 0.025, 4, 14), 0x2a2a2a, { pos: [-1.6 + i * 0.8, 0.32, -0.6], rot: [0, Math.PI / 2, 0] });
    b.add(G.box(0.04, 0.04, 0.9), [0x3a8ad8, 0xd84a4a, 0xe8e8e8, 0x4ab04a, 0x2a2a2a][i], { pos: [-1.6 + i * 0.8, 0.6, -0.15] });
  }
  return { geo: b.build(), collide: { box: [4, 1.4] }, outline: false, shadow: true };
}

function cocoon(): PropDef {
  const b = new PartBag();
  b.add(G.ellipsoid(0.7, 1.2, 0.7, 14, 12), 0xb0607a, { pos: [0, 1.0, 0], colorFn: (x, y, z, c) => { if (Math.sin(x * 12 + y * 8) * Math.cos(z * 10) > 0.7) c.setHex(0x6a1a2e); } });
  b.add(G.ellipsoid(0.3, 0.5, 0.1), 0xe8a0b0, { pos: [0, 1.1, 0.6], glow: 0.5 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    b.add(G.limb(0.08, 0.04, 1.0), 0x8a3a4a, { pos: [Math.sin(a) * 0.5, 0.8, Math.cos(a) * 0.5], rot: [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0] });
  }
  return { geo: b.build(), collide: { r: 0.8 }, outline: 0.02, shadow: true, light: { y: 1.2, color: 0xff4a6a, intensity: 4, range: 6 } };
}

function pipe(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.35, 0.35, 4, 12), 0x5a6a62, { pos: [0, 0.4, 0], rot: [0, 0, Math.PI / 2] });
  for (const sx of [-1.8, 1.8]) b.add(G.cyl(0.42, 0.42, 0.15, 12), 0x4a5a52, { pos: [sx, 0.4, 0], rot: [0, 0, Math.PI / 2] });
  return { geo: b.build(), collide: { box: [4, 0.8] }, outline: 0.012, shadow: true };
}

function billboardSign(color: number, w = 2.4, h = 1.4): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.08, 0.08, 3.2, 6), 0x3a3a3a, { pos: [0, 1.6, 0] });
  b.add(G.box(w + 0.1, h + 0.1, 0.15), 0x1a1a1e, { pos: [0, 3.6, 0] });
  b.add(G.box(w, h, 0.05), color, { pos: [0, 3.6, 0.09], glow: 1.8, colorFn: (x, y, _z, c) => { if (Math.abs(y) < 0.12 || Math.abs(x) > w / 2 - 0.12) c.multiplyScalar(0.55); } });
  return { geo: b.build(), collide: { r: 0.2 }, outline: 0.012, shadow: true, light: { y: 3.6, color, intensity: 6, range: 8 } };
}

function hachiko(): PropDef {
  const b = new PartBag();
  const bronze = 0x6a5a3a;
  b.add(G.box(1.4, 1.2, 1.0), 0x8a8478, { pos: [0, 0.6, 0] });
  b.add(G.ellipsoid(0.25, 0.25, 0.45), bronze, { pos: [0, 1.5, 0], topColor: 0x8a7a4a });
  b.add(G.ellipsoid(0.17, 0.17, 0.2), bronze, { pos: [0, 1.85, 0.35] });
  b.add(G.ellipsoid(0.08, 0.08, 0.12), bronze, { pos: [0, 1.8, 0.55] });
  for (const sx of [-0.1, 0.1]) b.add(G.cone(0.06, 0.15, 4), bronze, { pos: [sx, 2.03, 0.3] });
  for (const sx of [-0.12, 0.12]) b.add(G.cyl(0.05, 0.05, 0.4, 6), bronze, { pos: [sx, 1.35, 0.3] });
  return { geo: b.build(), collide: { box: [1.4, 1.0] }, outline: 0.015, shadow: true };
}

function well(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.7, 0.75, 0.8, 14, true), 0x8a8478, { pos: [0, 0.4, 0] });
  b.add(G.cyl(0.62, 0.62, 0.05, 14), 0x1a2a3a, { pos: [0, 0.5, 0], glow: 0.05 });
  for (const sx of [-0.7, 0.7]) b.add(G.box(0.1, 1.8, 0.1), 0x5a3a24, { pos: [sx, 1.1, 0] });
  const roof = G.cyl(0.02, 1.1, 0.5, 4); roof.rotateY(Math.PI / 4);
  b.add(roof, 0x3a3226, { pos: [0, 2.2, 0], scale: [1, 1, 0.8] });
  return { geo: b.build(), collide: { r: 0.8 }, outline: 0.012, shadow: true };
}

function signboard(): PropDef {
  const b = new PartBag();
  for (const sx of [-0.5, 0.5]) b.add(G.cyl(0.05, 0.05, 1.6, 6), 0x5a3a24, { pos: [sx, 0.8, 0] });
  b.add(G.box(1.4, 0.9, 0.08), 0x8a6a4a, { pos: [0, 1.25, 0] });
  for (let i = 0; i < 3; i++) b.add(G.box(1.1, 0.05, 0.02), 0xe8dcc0, { pos: [0, 1.45 - i * 0.18, 0.05] });
  return { geo: b.build(), collide: { box: [1.4, 0.3] }, outline: 0.01, shadow: true };
}

function wire(): PropDef {
  // barrier anchor (Shibuya veil node) - a cursed stake with talismans
  const b = new PartBag();
  b.add(G.cyl(0.12, 0.2, 2.4, 6), 0x1a1a22, { pos: [0, 1.2, 0] });
  for (let i = 0; i < 4; i++) b.add(G.box(0.2, 0.4, 0.02), 0xf0e6c8, { pos: [Math.sin(i * 1.57) * 0.18, 1.6 - i * 0.2, Math.cos(i * 1.57) * 0.18], rot: [0, i * 1.57, 0], glow: 0.2 });
  b.add(G.octa(0.3), 0x8a2aff, { pos: [0, 2.6, 0], glow: 2 });
  return { geo: b.build(), collide: { r: 0.3 }, outline: 0.012, shadow: true, light: { y: 2.6, color: 0x9a4aff, intensity: 6, range: 7 } };
}

function stairs(): PropDef {
  const b = new PartBag();
  for (let i = 0; i < 5; i++) b.add(G.box(4, 0.2, 0.6), 0x8a8478, { pos: [0, 0.1 + i * 0.0, -i * 0.6], topColor: 0xa8a49a });
  return { geo: b.build(), outline: false, shadow: false };
}

function lilyPad(): PropDef {
  const b = new PartBag();
  b.add(G.cyl(0.35, 0.35, 0.02, 12), 0x3a7a3a, { pos: [0, 0.03, 0], topColor: 0x5a9a4a });
  b.add(G.sphere(0.08, 6, 4), 0xf4b0d0, { pos: [0.1, 0.08, 0.05], glow: 0.2 });
  return { geo: b.build(), outline: false, shadow: false };
}

function koi(): PropDef {
  const b = new PartBag();
  b.add(G.ellipsoid(0.08, 0.04, 0.25), 0xf07a2a, { pos: [0, 0.05, 0], colorFn: (_x, _y, z, c) => { if (Math.sin(z * 30) > 0.4) c.setHex(0xffffff); } });
  return { geo: b.build(), outline: false, shadow: false };
}

function dummyPost(): PropDef { return trainingPost(); }

export const PROP_BUILDERS: Record<string, Builder> = {
  sakura, roundTree, autumnTree, darkTree, pine: () => pine(), pineDark: () => pine(3.6, 0x1e3a2a, 5), cedar, bamboo: () => bamboo(),
  deadTree, rock1: () => rock(1), rock2: () => rock(2, 1.5), rock3: () => rock(3, 0.7), mossRock,
  stoneLantern, paperLantern, streetLamp: () => streetLamp(), streetLampWarm: () => streetLamp(0xffc880), floodLight,
  vendingRed: () => vending(0xd84040), vendingBlue: () => vending(0x3a6ad8), vendingWhite: () => vending(0xe8e8e8),
  bench, fenceWood, fenceMetal, wallConcrete: () => wallConcrete(), wallBarbed: () => wallConcrete(4, true, 0x7a7a76), wallStone,
  torii: () => torii(1), toriiBig: () => torii(1.6), toriiBlack: () => torii(1, 0x1e1e22), shrineSmall, bell,
  carRed: () => car(0xb83030), carWhite: () => car(0xe8e8e4), carBlue: () => car(0x2e5aa8), carBlack: blackSedan, van,
  trafficCone, barricade, pumpkin: pumpkinProp, crate, barrel, bush: () => bush(), flowerBush, grass: () => grassTuft(), grassDry: () => grassTuft(0x8a8a4a), fern, log,
  postBox, utilityPole, trafficLight, trainingPost, dummyPost, goal, bikeRack, cocoon, pipe,
  signPink: () => billboardSign(0xff4aa8), signCyan: () => billboardSign(0x2ae0ff), signGold: () => billboardSign(0xffc02a, 2.0, 1.0), signPurple: () => billboardSign(0x9a4aff),
  hachiko, well, signboard, veilAnchor: wire, stairs, lilyPad, koi,
};

const built = new Map<string, PropDef>();
export function getProp(name: string): PropDef {
  let d = built.get(name);
  if (!d) {
    const b = PROP_BUILDERS[name];
    if (!b) throw new Error('Unknown prop ' + name);
    d = b();
    built.set(name, d);
  }
  return d;
}
