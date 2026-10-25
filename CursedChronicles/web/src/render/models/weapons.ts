// Held weapon meshes, tinted by the equipped item's colours.
import * as THREE from 'three';
import { G, PartBag } from '../geo';
import { toonMaterial, outlineMaterial } from '../toon';

const cache = new Map<string, THREE.BufferGeometry>();

function css(c: string) { return new THREE.Color(c).getHex(); }

export function weaponGeometry(kind: string, c1: string, c2: string, plus: number) {
  const key = kind + c1 + c2 + (plus >= 7 ? 'g' : '');
  let g = cache.get(key);
  if (g) return g;
  const b = new PartBag();
  const a = css(c1), bcol = css(c2);
  const glow = plus >= 7 ? 0.6 : plus >= 4 ? 0.25 : 0;
  switch (kind) {
    case 'blade': case 'spear': {
      const len = kind === 'spear' ? 1.25 : 0.85;
      b.add(G.cyl(0.025, 0.028, 0.22, 8), 0x1a1a22, { pos: [0, 0, 0.0] });
      b.add(G.box(0.16, 0.025, 0.06), bcol, { pos: [0, 0, 0.12], rot: [Math.PI / 2, 0, 0] });
      b.add(G.box(0.05, 0.012, len), a, { pos: [0, 0, 0.13 + len / 2], glow });
      b.add(G.cone(0.025, 0.12, 4), a, { pos: [0, 0, 0.13 + len + 0.05], rot: [Math.PI / 2, 0, 0], glow });
      if (kind === 'spear') b.add(G.cone(0.05, 0.25, 4), bcol, { pos: [0, 0, 0.13 + len + 0.15], rot: [Math.PI / 2, 0, 0], glow: 0.3 });
      break;
    }
    case 'knife': {
      b.add(G.cyl(0.025, 0.028, 0.16, 8), 0x1a1a1a);
      b.add(G.box(0.05, 0.01, 0.36), a, { pos: [0, 0, 0.26], glow: Math.max(glow, 0.15) });
      b.add(G.box(0.012, 0.012, 0.36), bcol, { pos: [0.022, 0, 0.26], glow: 0.8 });
      break;
    }
    case 'hammer': {
      b.add(G.cyl(0.025, 0.03, 0.55, 8), 0x7a5a3a, { pos: [0, 0, 0.18], rot: [Math.PI / 2, 0, 0] });
      b.add(G.box(0.12, 0.12, 0.24), bcol, { pos: [0, 0, 0.46], rot: [0, Math.PI / 2, 0], glow });
      b.add(G.cyl(0.07, 0.07, 0.05, 10), a, { pos: [0.13, 0, 0.46], rot: [0, 0, Math.PI / 2], glow });
      break;
    }
    case 'fist': default: {
      // knuckle wraps around the hand
      b.add(G.torus(0.06, 0.02, 6, 12), a, { pos: [0, -0.05, 0], rot: [Math.PI / 2, 0, 0], glow });
      b.add(G.torus(0.055, 0.018, 6, 12), bcol, { pos: [0, -0.1, 0], rot: [Math.PI / 2, 0, 0], glow: glow + 0.1 });
      break;
    }
  }
  g = b.build();
  cache.set(key, g);
  return g;
}

export function weaponMesh(kind: string, c1: string, c2: string, plus: number) {
  const geo = weaponGeometry(kind, c1, c2, plus);
  const group = new THREE.Group();
  const m = new THREE.Mesh(geo, toonMaterial());
  m.castShadow = true;
  m.userData.shared = true;
  const o = new THREE.Mesh(geo, outlineMaterial(0.012));
  o.userData.shared = true;
  group.add(m, o);
  return group;
}
