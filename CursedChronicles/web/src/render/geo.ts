// Geometry helpers: primitive builders and a "part" merger that bakes colour,
// glow and (optionally) skin bindings into one buffer so a whole character or
// building renders in a single draw call.
import * as THREE from 'three';

export type V3 = [number, number, number];

export interface PartOpts {
  pos?: V3;
  rot?: V3;
  scale?: V3 | number;
  /** 0..1+ self-illumination: drives the glow term in the toon shader (and bloom). */
  glow?: number;
  /** Optional per-vertex colour function (receives local position before transform). */
  colorFn?: (x: number, y: number, z: number, out: THREE.Color) => void;
  /** Smooth vertical gradient: colour at the top of the part's local bounds. */
  topColor?: number;
}

export interface Part {
  geo: THREE.BufferGeometry;
  bone: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

export function partMatrix(o: PartOpts) {
  const p = o.pos ?? [0, 0, 0];
  const r = o.rot ?? [0, 0, 0];
  const s = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _s.set(s[0], s[1], s[2]);
  _p.set(p[0], p[1], p[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/**
 * Prepare a primitive for merging: apply transform, add colour/glow attributes,
 * and strip anything else so attribute sets line up.
 */
export function bakePart(src: THREE.BufferGeometry, color: number, o: PartOpts = {}, extraMatrix?: THREE.Matrix4) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  // Non-indexed keeps merging trivial; parts are small so the cost is fine.
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const glow = new Float32Array(n);
  _c.setHex(color);
  let minY = Infinity, maxY = -Infinity;
  if (o.topColor !== undefined) {
    for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    _c2.setHex(o.topColor);
  }
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (o.colorFn) {
      tmp.copy(_c);
      o.colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), tmp);
    } else if (o.topColor !== undefined) {
      const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 0;
      tmp.copy(_c).lerp(_c2, t);
    } else tmp.copy(_c);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    glow[i] = o.glow ?? 0;
  }
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  g.applyMatrix4(partMatrix(o));
  if (extraMatrix) g.applyMatrix4(extraMatrix);
  return g;
}

/** Merge baked, non-indexed parts. If `bones` is given, rigid skin attributes are added. */
export function mergeParts(parts: { geo: THREE.BufferGeometry; bone?: number }[], skinned = false) {
  let total = 0;
  for (const p of parts) total += p.geo.getAttribute('position').count;
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const glow = new Float32Array(total);
  const skinIndex = skinned ? new Uint16Array(total * 4) : null;
  const skinWeight = skinned ? new Float32Array(total * 4) : null;
  let o = 0;
  for (const p of parts) {
    const g = p.geo;
    const n = g.getAttribute('position').count;
    position.set((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, o * 3);
    normal.set((g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, o * 3);
    color.set((g.getAttribute('color') as THREE.BufferAttribute).array as Float32Array, o * 3);
    glow.set((g.getAttribute('glow') as THREE.BufferAttribute).array as Float32Array, o);
    if (skinIndex && skinWeight) {
      for (let i = 0; i < n; i++) {
        skinIndex[(o + i) * 4] = p.bone ?? 0;
        skinWeight[(o + i) * 4] = 1;
      }
    }
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  if (skinIndex && skinWeight) {
    out.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    out.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// ---- Primitive shorthands (all centred at origin unless noted) ----

export const G = {
  sphere: (r = 1, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs),
  ellipsoid: (rx: number, ry: number, rz: number, ws = 14, hs = 10) => {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    return g;
  },
  hemi: (r = 1, ws = 14, hs = 6) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2),
  /** Capsule along Y from y=0 to y=len (base at origin) */
  capsuleUp: (r: number, len: number, seg = 10) => {
    const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, seg);
    g.translate(0, len / 2, 0);
    return g;
  },
  /** Capsule hanging down from origin to y=-len (for limbs) */
  limb: (r1: number, r2: number, len: number, seg = 10) => {
    // tapered limb: cylinder with spherical caps
    const parts: THREE.BufferGeometry[] = [];
    const cyl = new THREE.CylinderGeometry(r1, r2, len, seg, 1, true);
    cyl.translate(0, -len / 2, 0);
    const top = new THREE.SphereGeometry(r1, seg, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const bot = new THREE.SphereGeometry(r2, seg, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    bot.translate(0, -len, 0);
    parts.push(cyl.toNonIndexed(), top.toNonIndexed(), bot.toNonIndexed());
    return concat(parts);
  },
  cyl: (rt: number, rb: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  box: (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d),
  torus: (r: number, t: number, rs = 6, ts = 14, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  ring: (ri: number, ro: number, seg = 24) => new THREE.RingGeometry(ri, ro, seg),
  plane: (w: number, h: number) => new THREE.PlaneGeometry(w, h),
  lathe: (pts: [number, number][], seg = 14) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg),
  icosa: (r: number, d = 0) => new THREE.IcosahedronGeometry(r, d),
  dodeca: (r: number) => new THREE.DodecahedronGeometry(r, 0),
  octa: (r: number) => new THREE.OctahedronGeometry(r, 0),
  /** Extruded 2D shape (points in XY), depth along Z, centred on Z. */
  extrude: (pts: [number, number][], depth: number, bevel = 0) => {
    const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
};

/** Concatenate non-indexed geometries with only position+normal. */
export function concat(gs: THREE.BufferGeometry[]) {
  let total = 0;
  for (const g of gs) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, o * 3);
    nor.set((g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** Collects static coloured parts and merges them into one mesh-ready geometry. */
export class PartBag {
  parts: { geo: THREE.BufferGeometry }[] = [];
  add(geo: THREE.BufferGeometry, color: number, o: PartOpts = {}, extra?: THREE.Matrix4) {
    this.parts.push({ geo: bakePart(geo, color, o, extra) });
    return this;
  }
  /** Add a part that's already baked (e.g. copied from another bag). */
  addBaked(g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const c = g.clone();
    if (m) c.applyMatrix4(m);
    this.parts.push({ geo: c });
  }
  get empty() { return this.parts.length === 0; }
  build() { return mergeParts(this.parts, false); }
}

export function mat4(pos: V3 = [0, 0, 0], rotY = 0, scale = 1) {
  return partMatrix({ pos, rot: [0, rotY, 0], scale });
}

export { _m as tmpMatrix };
