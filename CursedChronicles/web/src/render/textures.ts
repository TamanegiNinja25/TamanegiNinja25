// Procedurally painted tiling textures (ground materials) and the splat-map
// terrain material that blends them with crisp detail at any zoom level.
import * as THREE from 'three';
import { Rng, makeNoise2D, fbm, clamp } from '../core/util';

export type TileKind =
  | 'grass' | 'darkGrass' | 'dirt' | 'stone' | 'gravel' | 'asphalt' | 'concrete' | 'wood'
  | 'moss' | 'sand' | 'tile' | 'mud' | 'sewer' | 'flesh' | 'field' | 'void';

const cache = new Map<string, THREE.Texture>();

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function rgb(r: number, g: number, b: number) { return `rgb(${r | 0},${g | 0},${b | 0})`; }

/** Fill canvas pixel-by-pixel using a colour function (tileable via wrapped noise). */
function paintNoise(ctx: CanvasRenderingContext2D, size: number, fn: (u: number, v: number, n: (x: number, y: number) => number) => [number, number, number]) {
  const img = ctx.createImageData(size, size);
  const noise = makeNoise2D(size + 17);
  // tileable noise: blend 4 samples
  const tn = (x: number, y: number) => {
    const s = 8;
    const a = noise(x * s, y * s), b = noise((x - 1) * s, y * s), c = noise(x * s, (y - 1) * s), d = noise((x - 1) * s, (y - 1) * s);
    return a * (1 - x) * (1 - y) + b * x * (1 - y) + c * (1 - x) * y + d * x * y;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b] = fn(x / size, y / size, tn);
    const i = (y * size + x) * 4;
    img.data[i] = clamp(r, 0, 255); img.data[i + 1] = clamp(g, 0, 255); img.data[i + 2] = clamp(b, 0, 255); img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c: HTMLCanvasElement, key: string) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, t);
  return t;
}

export function tileTexture(kind: TileKind): THREE.Texture {
  const hit = cache.get(kind);
  if (hit) return hit;
  const S = 256;
  const c = canvas(S);
  const ctx = c.getContext('2d')!;
  const rng = new Rng(kind.length * 977 + kind.charCodeAt(0));
  switch (kind) {
    case 'grass': case 'darkGrass': case 'field': {
      const base = kind === 'grass' ? [86, 128, 58] : kind === 'darkGrass' ? [44, 70, 44] : [118, 140, 62];
      paintNoise(ctx, S, (u, v, n) => {
        const k = n(u, v) * 0.6 + n(u * 3 % 1, v * 3 % 1) * 0.4;
        return [base[0] * (0.8 + k * 0.4), base[1] * (0.8 + k * 0.4), base[2] * (0.8 + k * 0.35)];
      });
      for (let i = 0; i < 1600; i++) {
        const x = rng.next() * S, y = rng.next() * S, l = 3 + rng.next() * 6;
        const sh = rng.range(0.7, 1.35);
        ctx.strokeStyle = rgb(base[0] * sh, base[1] * sh * 1.05, base[2] * sh * 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-2, 2), y - l); ctx.stroke();
      }
      if (kind === 'grass') for (let i = 0; i < 25; i++) {
        ctx.fillStyle = rng.pick(['#f4f0d8', '#f0c8e0', '#f8e070']);
        ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, 1.4, 0, 7); ctx.fill();
      }
      break;
    }
    case 'dirt': case 'mud': case 'sand': {
      const base = kind === 'dirt' ? [122, 96, 70] : kind === 'mud' ? [96, 82, 68] : [196, 176, 136];
      paintNoise(ctx, S, (u, v, n) => {
        const k = n(u, v);
        return [base[0] * (0.85 + k * 0.3), base[1] * (0.85 + k * 0.3), base[2] * (0.85 + k * 0.3)];
      });
      for (let i = 0; i < 500; i++) {
        const s = rng.range(0.6, 1.3);
        ctx.fillStyle = rgb(base[0] * s, base[1] * s, base[2] * s);
        const r = rng.range(0.5, 2.2);
        ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, r, 0, 7); ctx.fill();
      }
      break;
    }
    case 'gravel': {
      ctx.fillStyle = '#8a857c'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 2600; i++) {
        const s = rng.range(0.6, 1.25);
        ctx.fillStyle = rgb(150 * s, 145 * s, 136 * s);
        const r = rng.range(1, 3);
        ctx.beginPath(); ctx.ellipse(rng.next() * S, rng.next() * S, r, r * 0.8, rng.next() * 3, 0, 7); ctx.fill();
      }
      break;
    }
    case 'stone': case 'tile': {
      // irregular stone pavers / square tiles
      ctx.fillStyle = kind === 'stone' ? '#4b4945' : '#5a5650'; ctx.fillRect(0, 0, S, S);
      const n = kind === 'stone' ? 4 : 4;
      const cell = S / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const off = kind === 'stone' && y % 2 ? cell / 2 : 0;
        const s = rng.range(0.85, 1.12);
        const base = kind === 'stone' ? [150, 146, 138] : [176, 170, 160];
        for (const ox of [0, -S]) {
          const gx = x * cell + off + ox;
          const grad = ctx.createLinearGradient(gx, y * cell, gx + cell, y * cell + cell);
          grad.addColorStop(0, rgb(base[0] * s * 1.08, base[1] * s * 1.08, base[2] * s * 1.08));
          grad.addColorStop(1, rgb(base[0] * s * 0.9, base[1] * s * 0.9, base[2] * s * 0.9));
          ctx.fillStyle = grad;
          const r = 6;
          ctx.beginPath();
          (ctx as any).roundRect ? (ctx as any).roundRect(gx + 2, y * cell + 2, cell - 4, cell - 4, r) : ctx.rect(gx + 2, y * cell + 2, cell - 4, cell - 4);
          ctx.fill();
        }
      }
      // weathering speckle
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(${rng.next() > 0.5 ? '255,255,255' : '0,0,0'},${rng.range(0.03, 0.09)})`;
        ctx.fillRect(rng.next() * S, rng.next() * S, rng.range(1, 3), rng.range(1, 3));
      }
      break;
    }
    case 'asphalt': {
      paintNoise(ctx, S, (u, v, n) => { const k = n(u, v) * 0.3 + 0.85; return [94 * k, 95 * k, 103 * k]; });
      for (let i = 0; i < 3000; i++) {
        const s = rng.range(0.6, 1.6);
        ctx.fillStyle = rgb(100 * s, 100 * s, 108 * s);
        ctx.fillRect(rng.next() * S, rng.next() * S, 1, 1);
      }
      ctx.strokeStyle = 'rgba(20,20,24,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); let x = rng.next() * S, y = rng.next() * S; ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += rng.range(-14, 14); y += rng.range(-14, 14); ctx.lineTo(x, y); }
        ctx.stroke();
      }
      break;
    }
    case 'concrete': case 'sewer': {
      const base = kind === 'concrete' ? [138, 138, 134] : [72, 82, 76];
      paintNoise(ctx, S, (u, v, n) => { const k = n(u, v) * 0.25 + 0.88; return [base[0] * k, base[1] * k, base[2] * k]; });
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rng.range(0.04, 0.12)})`;
        ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, rng.range(2, 12), 0, 7); ctx.fill();
      }
      if (kind === 'sewer') for (let i = 0; i < 20; i++) {
        ctx.fillStyle = `rgba(60,120,60,${rng.range(0.1, 0.25)})`;
        ctx.beginPath(); ctx.arc(rng.next() * S, rng.next() * S, rng.range(4, 18), 0, 7); ctx.fill();
      }
      break;
    }
    case 'wood': {
      const planks = 4;
      for (let p = 0; p < planks; p++) {
        const s = rng.range(0.85, 1.1);
        const y0 = (p * S) / planks;
        const g = ctx.createLinearGradient(0, y0, 0, y0 + S / planks);
        g.addColorStop(0, rgb(130 * s, 86 * s, 52 * s));
        g.addColorStop(1, rgb(108 * s, 70 * s, 42 * s));
        ctx.fillStyle = g; ctx.fillRect(0, y0, S, S / planks);
        ctx.strokeStyle = 'rgba(40,24,12,0.35)';
        for (let k = 0; k < 7; k++) {
          ctx.beginPath(); const yy = y0 + rng.next() * (S / planks);
          ctx.moveTo(0, yy);
          for (let x = 0; x <= S; x += 16) ctx.lineTo(x, yy + Math.sin(x * 0.05 + k) * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(20,10,4,0.6)'; ctx.fillRect(0, y0, S, 2);
      }
      break;
    }
    case 'moss': {
      paintNoise(ctx, S, (u, v, n) => {
        const k = n(u, v), k2 = n((u * 2) % 1, (v * 2) % 1);
        const m = k > 0.5 ? 1 : 0.7;
        return [52 * m + k2 * 30, 78 * m + k2 * 40, 40 * m + k2 * 18];
      });
      for (let i = 0; i < 200; i++) {
        ctx.fillStyle = rng.pick(['#5a4a32', '#3a5a2a', '#6a5a3a', '#7a8a3a']);
        ctx.beginPath(); ctx.ellipse(rng.next() * S, rng.next() * S, rng.range(1, 5), rng.range(1, 3), rng.next() * 3, 0, 7); ctx.fill();
      }
      break;
    }
    case 'flesh': {
      paintNoise(ctx, S, (u, v, n) => {
        const k = n(u, v);
        const vein = Math.abs(Math.sin(u * 40 + k * 8)) < 0.08 ? 0.55 : 1;
        return [150 * vein * (0.8 + k * 0.4), 60 * vein, 76 * vein];
      });
      break;
    }
    case 'void': {
      ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = `rgba(${rng.int(150, 255)},${rng.int(150, 255)},255,${rng.range(0.2, 1)})`;
        ctx.fillRect(rng.next() * S, rng.next() * S, 1, 1);
      }
      break;
    }
  }
  return finish(c, kind);
}

// ---------------------------------------------------------------------------
// Terrain: splat map (RGBA weights for 4 tile kinds) blended in the shader.
// ---------------------------------------------------------------------------

export class SplatPainter {
  size: number;
  data: Float32Array; // 4 weights per texel
  width: number;
  depth: number;
  constructor(width: number, depth: number, res = 4) {
    this.width = width; this.depth = depth;
    this.size = Math.ceil(Math.max(width, depth) * res);
    this.data = new Float32Array(this.size * this.size * 4);
    for (let i = 0; i < this.size * this.size; i++) this.data[i * 4] = 1;
  }
  private texel(x: number, z: number) {
    const u = (x + this.width / 2) / this.width, v = (z + this.depth / 2) / this.depth;
    return [Math.floor(u * this.size), Math.floor(v * this.size)];
  }
  /** Paint channel `ch` into a world-space rectangle with soft edges. */
  rect(ch: number, x: number, z: number, w: number, d: number, soft = 0.6, noiseAmt = 0.35) {
    const noise = makeNoise2D(ch * 31 + 7);
    const [x0, z0] = this.texel(x - w / 2 - soft, z - d / 2 - soft);
    const [x1, z1] = this.texel(x + w / 2 + soft, z + d / 2 + soft);
    for (let ty = Math.max(0, z0); ty <= Math.min(this.size - 1, z1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(this.size - 1, x1); tx++) {
        const wx = (tx / this.size) * this.width - this.width / 2;
        const wz = (ty / this.size) * this.depth - this.depth / 2;
        const dx = Math.abs(wx - x) - w / 2, dz = Math.abs(wz - z) - d / 2;
        const out = Math.max(dx, dz);
        const n = (fbm(noise, wx * 0.5, wz * 0.5, 3) - 0.5) * noiseAmt * 2;
        const a = clamp(1 - (out + n) / Math.max(0.01, soft), 0, 1);
        this.set(tx, ty, ch, a);
      }
    }
  }
  circle(ch: number, x: number, z: number, r: number, soft = 0.8, noiseAmt = 0.4) {
    const noise = makeNoise2D(ch * 17 + 3);
    const [x0, z0] = this.texel(x - r - soft, z - r - soft);
    const [x1, z1] = this.texel(x + r + soft, z + r + soft);
    for (let ty = Math.max(0, z0); ty <= Math.min(this.size - 1, z1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(this.size - 1, x1); tx++) {
        const wx = (tx / this.size) * this.width - this.width / 2;
        const wz = (ty / this.size) * this.depth - this.depth / 2;
        const dd = Math.hypot(wx - x, wz - z) - r;
        const n = (fbm(noise, wx * 0.4, wz * 0.4, 3) - 0.5) * noiseAmt * 2;
        const a = clamp(1 - (dd + n) / Math.max(0.01, soft), 0, 1);
        this.set(tx, ty, ch, a);
      }
    }
  }
  /** Path along a polyline. */
  path(ch: number, pts: [number, number][], width: number, soft = 0.5) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const steps = Math.ceil(len / (width * 0.3));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.circle(ch, ax + (bx - ax) * t, az + (bz - az) * t, width / 2, soft, 0.15);
      }
    }
  }
  /** Fill everything with a channel at given strength (base layer change). */
  fill(ch: number) {
    for (let i = 0; i < this.size * this.size; i++) {
      for (let c = 0; c < 4; c++) this.data[i * 4 + c] = c === ch ? 1 : 0;
    }
  }
  /** Noise-scatter a channel across the whole map (patchy variation). */
  patches(ch: number, scale: number, threshold: number, strength = 1) {
    const noise = makeNoise2D(ch * 101 + 11);
    for (let ty = 0; ty < this.size; ty++) for (let tx = 0; tx < this.size; tx++) {
      const wx = (tx / this.size) * this.width, wz = (ty / this.size) * this.depth;
      const n = fbm(noise, wx * scale, wz * scale, 4);
      const a = clamp((n - threshold) * 6, 0, 1) * strength;
      if (a > 0) this.set(tx, ty, ch, a, true);
    }
  }
  private set(tx: number, ty: number, ch: number, a: number, onlyBase = false) {
    const i = (ty * this.size + tx) * 4;
    if (onlyBase && this.data[i] < 0.5) return;
    for (let c = 0; c < 4; c++) {
      if (c === ch) this.data[i + c] = Math.max(this.data[i + c], a);
      else this.data[i + c] *= 1 - a;
    }
  }
  texture() {
    const n = this.size;
    const u8 = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      let s = 0;
      for (let c = 0; c < 4; c++) s += this.data[i * 4 + c];
      s = s || 1;
      for (let c = 0; c < 4; c++) u8[i * 4 + c] = Math.round((this.data[i * 4 + c] / s) * 255);
    }
    const t = new THREE.DataTexture(u8, n, n, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }
}

export function terrainMaterial(splat: THREE.Texture, kinds: [TileKind, TileKind, TileKind, TileKind], scales: [number, number, number, number], tint = 0xffffff) {
  const mat = new THREE.MeshLambertMaterial({ color: tint, map: splat });
  const tex = kinds.map(k => tileTexture(k));
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tex0 = { value: tex[0] };
    shader.uniforms.tex1 = { value: tex[1] };
    shader.uniforms.tex2 = { value: tex[2] };
    shader.uniforms.tex3 = { value: tex[3] };
    shader.uniforms.tscale = { value: new THREE.Vector4(...scales) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform sampler2D tex0; uniform sampler2D tex1; uniform sampler2D tex2; uniform sampler2D tex3;
uniform vec4 tscale;
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
vec4 sw = texture2D(map, vMapUv);
vec2 wp = vWPos.xz;
vec3 c0 = texture2D(tex0, wp * tscale.x).rgb;
vec3 c1 = texture2D(tex1, wp * tscale.y).rgb;
vec3 c2 = texture2D(tex2, wp * tscale.z).rgb;
vec3 c3 = texture2D(tex3, wp * tscale.w).rgb;
// break up tiling with a second, rotated lookup on the base layer
c0 = mix(c0, texture2D(tex0, mat2(0.8,-0.6,0.6,0.8) * wp * tscale.x * 0.37).rgb, 0.4);
vec3 tcol = c0 * sw.r + c1 * sw.g + c2 * sw.b + c3 * sw.a;
float var = 0.86 + 0.28 * vn(wp * 0.12) ;
diffuseColor.rgb *= tcol * var;
`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}
