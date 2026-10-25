// Visual effects: GPU-friendly particle pools, slashes, shockwaves, lightning,
// ground sigils, black flash and full domain expansion spheres.
import * as THREE from 'three';
import { Renderer } from './Renderer';
import { FxAPI } from '../world/api';
import { G } from './geo';
import { toonMaterial } from './toon';
import { TAU, rand } from '../core/util';

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

class ParticlePool {
  n: number;
  points: THREE.Points;
  pos: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array;
  vel: Float32Array; life: Float32Array; max: Float32Array; grav: Float32Array; drag: Float32Array; s0: Float32Array; s1: Float32Array;
  cursor = 0;
  mat: THREE.ShaderMaterial;
  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float psize; attribute float palpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC = color; vA = palpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = psize * uScale / max(0.1, -mv.z); }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vC, vA * a ${additive ? '' : '* 0.85'}); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, s0: number, s1: number, life: number, grav: number, drag: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.s0[i] = s0; this.s1[i] = s1;
    this.size[i] = s0; this.alpha[i] = 1;
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02 && this.grav[i] > 0) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9;
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('psize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('palpha') as THREE.BufferAttribute).needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

// ---------------------------------------------------------------------------
// Transient effect objects
// ---------------------------------------------------------------------------

interface Transient { obj: THREE.Object3D; t: number; dur: number; update(k: number, dt: number): void; dispose?(): void }

const SLASH_VS = `attribute vec2 ab; varying vec2 vAB; void main(){ vAB = ab; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SLASH_FS = `uniform vec3 uColor; uniform float uT; varying vec2 vAB;
  void main(){
    float head = uT * 1.6;
    float along = vAB.x;
    float vis = smoothstep(head, head - 0.35, along) * smoothstep(head - 1.2, head - 0.6, along);
    float across = 1.0 - abs(vAB.y * 2.0 - 1.0);
    float core = pow(across, 3.0);
    float a = vis * (core * 1.2 + across * 0.4) * (1.0 - smoothstep(0.7, 1.0, uT));
    gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.6) * 1.6, a);
  }`;

function arcGeometry(r: number, width: number, arc: number, seg = 24) {
  const pos: number[] = [], ab: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const a = -arc / 2 + arc * t;
    const w = width * Math.sin(t * Math.PI) * 0.9 + width * 0.1;
    for (let j = 0; j < 2; j++) {
      const rr = r + (j === 0 ? -w / 2 : w / 2);
      pos.push(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      ab.push(t, j);
    }
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('ab', new THREE.Float32BufferAttribute(ab, 2));
  g.setIndex(idx);
  return g;
}

let sigilTex: THREE.Texture | null = null;
function sigilTexture() {
  if (sigilTex) return sigilTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.translate(256, 256);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff';
  x.shadowColor = '#fff'; x.shadowBlur = 8;
  x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 240, 0, TAU); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 212, 0, TAU); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 120, 0, TAU); x.stroke();
  // runes around the ring
  x.font = 'bold 34px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const runes = '呪術廻戦領域展開黒閃縛';
  for (let i = 0; i < 16; i++) {
    x.save(); x.rotate((i / 16) * TAU); x.fillText(runes[i % runes.length], 0, -226 + 0); x.restore();
  }
  // star
  x.lineWidth = 3; x.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i * 2 / 6) * TAU; x.lineTo(Math.sin(a) * 200, -Math.cos(a) * 200); }
  x.stroke();
  x.beginPath();
  for (let i = 0; i <= 6; i++) { const a = ((i * 2 + 1) / 6) * TAU; x.lineTo(Math.sin(a) * 200, -Math.cos(a) * 200); }
  x.stroke();
  x.font = 'bold 120px serif'; x.fillText('呪', 0, 6);
  sigilTex = new THREE.CanvasTexture(c);
  sigilTex.colorSpace = THREE.SRGBColorSpace;
  return sigilTex;
}

const DOMAIN_FS = `uniform float uTime; uniform int uKind; uniform float uFade; varying vec3 vP; varying vec3 vN;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vP);
  float el = d.y; float az = atan(d.x, d.z);
  vec2 uv = vec2(az * 2.0, el * 4.0);
  vec3 c;
  if (uKind == 0) { // Malevolent Shrine: blood sky
    float s = fbm(uv * 1.5 + vec2(0.0, uTime * 0.1));
    c = mix(vec3(0.12, 0.0, 0.01), vec3(0.55, 0.02, 0.04), smoothstep(0.0, 0.9, 1.0 - el) * s);
    c += vec3(1.0, 0.1, 0.1) * smoothstep(0.03, 0.0, abs(el - 0.08)) * 0.8;
    c += vec3(0.6, 0.0, 0.0) * step(0.985, h(floor(uv * 40.0) + floor(uTime * 8.0))) ;
  } else if (uKind == 1) { // Chimera Shadow Garden
    float s = fbm(uv * 2.0 + vec2(uTime * 0.05, -uTime * 0.08));
    c = vec3(0.01, 0.01, 0.03) + vec3(0.18, 0.12, 0.45) * pow(s, 3.0) * 2.0;
  } else if (uKind == 2) { // Thousand Nails
    float lines = smoothstep(0.96, 1.0, sin(az * 40.0 + uTime));
    c = mix(vec3(0.08, 0.0, 0.02), vec3(0.4, 0.02, 0.08), fbm(uv + uTime * 0.1)) + vec3(0.9, 0.1, 0.2) * lines * 0.5;
  } else if (uKind == 3) { // Unlimited Void
    float st = step(0.996, h(floor(uv * 90.0)));
    float neb = fbm(uv * 1.2 + uTime * 0.03);
    c = vec3(0.0, 0.0, 0.02) + vec3(0.3, 0.5, 1.0) * pow(neb, 3.0) * 1.4 + vec3(1.0) * st * 1.5;
  } else if (uKind == 4) { // Coffin of the Iron Mountain
    float s = fbm(uv * 2.0 + vec2(0.0, -uTime * 0.2));
    float crack = smoothstep(0.48, 0.5, s) * smoothstep(0.52, 0.5, s);
    c = mix(vec3(0.9, 0.25, 0.02), vec3(0.08, 0.03, 0.02), smoothstep(-0.2, 0.6, el)) + vec3(1.0, 0.5, 0.1) * crack * 2.0;
  } else if (uKind == 5) { // Horizon of the Captivating Skandha
    c = mix(vec3(0.95, 0.85, 0.6), vec3(0.2, 0.55, 0.9), smoothstep(-0.05, 0.25, el));
    c = mix(c, vec3(0.1, 0.4, 0.7), smoothstep(0.02, 0.0, abs(el - 0.02)) * 0.8);
  } else { // Self-Embodiment of Perfection
    float cell = n2(uv * 6.0 + uTime * 0.2);
    c = mix(vec3(0.15, 0.17, 0.22), vec3(0.75, 0.78, 0.82), smoothstep(0.55, 0.75, cell));
  }
  gl_FragColor = vec4(c, uFade);
}`;

const FLOOR_FS = `uniform float uTime; uniform int uKind; uniform float uFade; uniform float uR; varying vec3 vP;
void main(){
  float r = length(vP.xz) / uR;
  float rip = sin(r * 40.0 - uTime * 4.0) * 0.5 + 0.5;
  vec3 c;
  if (uKind == 0) c = vec3(0.25, 0.0, 0.02) + vec3(0.5, 0.02, 0.04) * rip * 0.4;
  else if (uKind == 1) c = vec3(0.0, 0.0, 0.01) + vec3(0.1, 0.06, 0.25) * rip * 0.5;
  else if (uKind == 2) c = vec3(0.18, 0.0, 0.03) + vec3(0.4, 0.0, 0.1) * rip * 0.4;
  else if (uKind == 3) c = vec3(0.0, 0.0, 0.05) + vec3(0.2, 0.3, 0.8) * rip * 0.3;
  else if (uKind == 4) c = vec3(0.35, 0.08, 0.0) + vec3(0.9, 0.3, 0.0) * rip * 0.6;
  else if (uKind == 5) c = vec3(0.85, 0.78, 0.55) + vec3(0.1, 0.3, 0.5) * rip * 0.3;
  else c = vec3(0.3, 0.32, 0.36) + vec3(0.3) * rip * 0.3;
  float edge = smoothstep(1.0, 0.95, r);
  gl_FragColor = vec4(c, uFade * edge * 0.92);
}`;

export const DOMAIN_KIND: Record<string, number> = { shrine: 0, shadow: 1, nails: 2, void: 3, coffin: 4, sea: 5, hands: 6, womb: 0 };

export class Effects implements FxAPI {
  r: Renderer;
  root = new THREE.Group();
  add: ParticlePool;
  norm: ParticlePool;
  private items: Transient[] = [];
  private slashMat: THREE.ShaderMaterial;
  private tmpC = new THREE.Color();
  onText: ((x: number, y: number, z: number, txt: string, color: string, size: number) => void) | null = null;
  onHitstop: ((t: number) => void) | null = null;
  dynLights: { x: number; y: number; z: number; color: number; intensity: number; range: number; t: number; dur: number }[] = [];
  domainActive: { kind: string; x: number; z: number; r: number; until: number; obj: THREE.Object3D } | null = null;
  time = 0;
  private flashEl = document.getElementById('fx-flash') as HTMLDivElement | null;
  quality = 1;

  constructor(r: Renderer) {
    this.r = r;
    this.add = new ParticlePool(1800, true);
    this.norm = new ParticlePool(900, false);
    this.root.add(this.add.points, this.norm.points);
    this.slashMat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uT: { value: 0 } }, vertexShader: SLASH_VS, fragmentShader: SLASH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }

  attach(scene: THREE.Object3D) { scene.add(this.root); }

  clear() {
    for (const it of this.items) { this.root.remove(it.obj); it.dispose?.(); }
    this.items = [];
    this.add.clear(); this.norm.clear();
    this.dynLights = [];
    this.domainActive = null;
  }

  private push(obj: THREE.Object3D, dur: number, update: (k: number, dt: number) => void, dispose?: () => void) {
    this.root.add(obj);
    this.items.push({ obj, t: 0, dur, update, dispose });
  }

  update(dt: number) {
    this.time += dt;
    const sc = this.r.gl.getDrawingBufferSize(new THREE.Vector2()).y * this.r.camera.projectionMatrix.elements[5] * 0.5;
    this.add.mat.uniforms.uScale.value = sc;
    this.norm.mat.uniforms.uScale.value = sc;
    this.add.update(dt);
    this.norm.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      it.update(k, dt);
      if (it.t >= it.dur) {
        this.root.remove(it.obj);
        it.dispose?.();
        this.items.splice(i, 1);
      }
    }
    for (let i = this.dynLights.length - 1; i >= 0; i--) {
      const l = this.dynLights[i];
      l.t += dt;
      if (l.t >= l.dur) this.dynLights.splice(i, 1);
    }
    if (this.domainActive && this.time > this.domainActive.until) this.domainActive = null;
  }

  // ------------------------------------------------------------------
  // FxAPI
  // ------------------------------------------------------------------

  burst(x: number, y: number, z: number, color: number, count = 12, speed = 4, size = 0.25, life = 0.5, additive = true) {
    const pool = additive ? this.add : this.norm;
    const c = this.tmpC.setHex(color);
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, e = rand(-0.3, 1);
      const s = speed * rand(0.3, 1);
      pool.spawn(x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + 1, Math.sin(a) * s * Math.cos(e), c, size * rand(0.6, 1.3), 0, life * rand(0.6, 1.2), 6, 3);
    }
  }

  smoke(x: number, z: number, color = 0x888888, count = 10) {
    const c = this.tmpC.setHex(color);
    count = Math.ceil(count * this.quality);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = rand(0.5, 2);
      this.norm.spawn(x + rand(-0.4, 0.4), rand(0.1, 0.8), z + rand(-0.4, 0.4), Math.cos(a) * s, rand(0.6, 1.8), Math.sin(a) * s, c, rand(0.4, 0.7), rand(1.0, 1.6), rand(0.6, 1.1), -0.5, 2);
    }
  }

  embers(x: number, z: number, radius: number, color: number, count = 8) {
    const c = this.tmpC.setHex(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, r = Math.random() * radius;
      this.add.spawn(x + Math.cos(a) * r, 0.1, z + Math.sin(a) * r, rand(-0.3, 0.3), rand(1.5, 3.5), rand(-0.3, 0.3), c, rand(0.08, 0.18), 0.02, rand(0.6, 1.2), -0.5, 1);
    }
  }

  ring(x: number, z: number, color: number, radius: number, dur = 0.4, width = 0.25) {
    const g = new THREE.RingGeometry(0.85, 1, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    void width;
    this.push(mesh, dur, (k) => {
      const s = radius * (0.3 + 0.7 * Math.sqrt(k));
      mesh.scale.set(s, s, s);
      m.opacity = (1 - k) * 0.9;
    }, () => { g.dispose(); m.dispose(); });
  }

  shockwave(x: number, z: number, radius: number, color: number) {
    this.ring(x, z, color, radius, 0.45);
    this.ring(x, z, 0xffffff, radius * 0.7, 0.3);
    const g = G.cyl(1, 1, 0.6, 32, true);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 0.3, z);
    this.push(mesh, 0.35, (k) => {
      const s = radius * (0.2 + 0.8 * k);
      mesh.scale.set(s, 1 - k * 0.8, s);
      m.opacity = (1 - k) * 0.6;
    }, () => { g.dispose(); m.dispose(); });
    const c = this.tmpC.setHex(color);
    const n = Math.ceil(24 * this.quality);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      this.norm.spawn(x + Math.cos(a) * 0.6, 0.2, z + Math.sin(a) * 0.6, Math.cos(a) * radius * 2.2, rand(0.5, 1.5), Math.sin(a) * radius * 2.2, this.tmpC.setHex(0x9a8a7a), rand(0.35, 0.6), 1.0, 0.6, 0, 4);
      this.add.spawn(x, 0.4, z, Math.cos(a) * radius * 3, rand(1, 3), Math.sin(a) * radius * 3, c.setHex(color), 0.2, 0, 0.35, 4, 5);
    }
    this.light(x, 1, z, color, 10, 0.25, radius * 3);
  }

  slash(x: number, z: number, dir: number, radius: number, color: number, arc = 2.2, tilt = 0, y = 1.0) {
    const g = arcGeometry(radius, radius * 0.45, arc);
    const m = this.slashMat.clone();
    m.uniforms.uColor.value = new THREE.Color(color);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, dir, tilt * 0.6, 'YXZ');
    this.push(mesh, 0.22, (k) => { m.uniforms.uT.value = k; }, () => { g.dispose(); m.dispose(); });
  }

  lightning(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, width = 0.12) {
    const segs = 10;
    const pts: THREE.Vector3[] = [];
    const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const j = i === 0 || i === segs ? 0 : len * 0.08;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t + rand(-j, j), y0 + (y1 - y0) * t + rand(-j, j), z0 + (z1 - z0) * t + rand(-j, j)));
    }
    const cam = this.r.camera.position;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const p = pts[i];
      const next = pts[Math.min(segs, i + 1)], prev = pts[Math.max(0, i - 1)];
      const dir = new THREE.Vector3().subVectors(next, prev).normalize();
      const view = new THREE.Vector3().subVectors(cam, p).normalize();
      const side = new THREE.Vector3().crossVectors(dir, view).normalize().multiplyScalar(width);
      pos.push(p.x - side.x, p.y - side.y, p.z - side.z, p.x + side.x, p.y + side.y, p.z + side.z);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    m.color.multiplyScalar(2.2);
    const mesh = new THREE.Mesh(g, m);
    this.push(mesh, 0.18, (k) => { m.opacity = 1 - k; }, () => { g.dispose(); m.dispose(); });
    this.light((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color, 8, 0.15, 8);
  }

  pillar(x: number, z: number, radius: number, height: number, color: number, dur = 0.6) {
    const g = G.cyl(radius, radius, height, 20, true);
    g.translate(0, height / 2, 0);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, 0, z);
    this.push(mesh, dur, (k) => {
      mesh.scale.set(1 + k * 0.4, 1, 1 + k * 0.4);
      m.opacity = Math.sin(k * Math.PI) * 0.8;
    }, () => { g.dispose(); m.dispose(); });
    this.light(x, height * 0.4, z, color, 12, dur, 10);
  }

  sigil(x: number, z: number, radius: number, color: number, dur = 1) {
    const g = new THREE.PlaneGeometry(radius * 2.2, radius * 2.2);
    const m = new THREE.MeshBasicMaterial({ map: sigilTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const dark = (color & 0xff) + ((color >> 8) & 0xff) + ((color >> 16) & 0xff) < 160;
    if (dark) { m.blending = THREE.NormalBlending; m.color.setHex(color === 0 ? 0x111111 : color); }
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.push(mesh, dur, (k) => {
      mesh.rotation.z = k * 2;
      const s = Math.min(1, k * 6);
      mesh.scale.set(s, s, s);
      m.opacity = (k < 0.8 ? 1 : (1 - k) * 5) * (dark ? 0.85 : 0.9);
    }, () => { g.dispose(); m.dispose(); });
  }

  spikes(x: number, z: number, radius: number, color: number, count = 8) {
    const geos: THREE.BufferGeometry[] = [];
    const g = new THREE.BufferGeometry();
    const parts: number[] = [];
    void geos; void parts;
    const group = new THREE.Group();
    const mat = toonMaterial();
    const cone = G.cone(0.12, 1, 5);
    // build colour attribute once per call
    const cg = cone.toNonIndexed();
    const n = cg.getAttribute('position').count;
    const col = new Float32Array(n * 3), glow = new Float32Array(n);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cg.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    const meshes: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, r = Math.random() * radius;
      const mesh = new THREE.Mesh(cg, mat);
      mesh.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      mesh.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
      mesh.userData.h = rand(0.5, 1.3);
      mesh.castShadow = true;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.push(group, 0.7, (k) => {
      const up = k < 0.2 ? k / 0.2 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      for (const m of meshes) { m.scale.set(1, Math.max(0.01, up * m.userData.h), 1); m.position.y = up * m.userData.h * 0.5 - 0.1; }
    }, () => { cg.dispose(); g.dispose(); cone.dispose(); });
  }

  blackFlash(x: number, y: number, z: number) {
    // black core + red discharge
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU, e = rand(-0.5, 0.9), l = rand(1.6, 3.2);
      const ex = x + Math.cos(a) * Math.cos(e) * l, ey = y + Math.sin(e) * l, ez = z + Math.sin(a) * Math.cos(e) * l;
      this.lightning(x, y, z, ex, Math.max(0.1, ey), ez, i % 2 ? 0xff1a2a : 0xff5a3a, 0.09);
    }
    const g = G.sphere(1, 16, 12);
    const m = new THREE.MeshBasicMaterial({ color: 0x050002, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    this.push(mesh, 0.28, (k) => { const s = 0.3 + k * 1.6; mesh.scale.set(s, s, s); m.opacity = (1 - k) * 0.85; }, () => { g.dispose(); m.dispose(); });
    const c = this.tmpC;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, e = rand(-0.4, 1), s = rand(4, 11);
      this.add.spawn(x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s, Math.sin(a) * s * Math.cos(e), c.setHex(i % 3 ? 0xff1a30 : 0xffffff), rand(0.12, 0.3), 0, rand(0.25, 0.55), 4, 4);
      this.norm.spawn(x, y, z, Math.cos(a) * s * 0.6, Math.sin(e) * s * 0.6, Math.sin(a) * s * 0.6, c.setHex(0x050005), rand(0.3, 0.6), 0.9, rand(0.3, 0.6), 0, 5);
    }
    this.ring(x, z, 0xff1a2a, 4, 0.4);
    this.light(x, y, z, 0xff1a2a, 30, 0.35, 14);
    this.flash('#1a0004', 0.55, 0.12);
    this.shake(0.7, 0.35);
    this.hitstop(0.11);
    this.r.pulseBloom(1.2);
    this.text(x, y + 1.6, z, 'BLACK FLASH', '#ff2a3a', 30);
  }

  flash(color: string, alpha: number, dur = 0.2) {
    const el = this.flashEl;
    if (!el) return;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(alpha);
    void el.offsetWidth;
    el.style.transition = `opacity ${dur}s ease-out`;
    el.style.opacity = '0';
  }

  shake(a: number, t = 0.25) { this.r.shake(a, t); }
  hitstop(t: number) { this.onHitstop?.(t); }
  text(x: number, y: number, z: number, txt: string, color: string, size = 18) { this.onText?.(x, y, z, txt, color, size); }

  light(x: number, y: number, z: number, color: number, intensity: number, dur: number, range = 8) {
    this.dynLights.push({ x, y, z, color, intensity, range, t: 0, dur });
    if (this.dynLights.length > 6) this.dynLights.shift();
  }

  /** Ground warning: a ring/strip that fills up until the attack lands. */
  telegraph(shape: 'circle' | 'line', x: number, z: number, size: number, dur: number, color: number, dir = 0, width = 1) {
    const group = new THREE.Group();
    const edgeM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const fillM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    let fill: THREE.Mesh;
    const geos: THREE.BufferGeometry[] = [];
    if (shape === 'circle') {
      const rg = new THREE.RingGeometry(0.93, 1, 48); geos.push(rg);
      const edge = new THREE.Mesh(rg, edgeM);
      edge.scale.setScalar(size);
      const cg = new THREE.CircleGeometry(1, 40); geos.push(cg);
      fill = new THREE.Mesh(cg, fillM);
      group.add(edge, fill);
      group.rotation.x = -Math.PI / 2;
      group.position.set(x, 0.05, z);
    } else {
      const pg = new THREE.PlaneGeometry(width, size); pg.translate(0, size / 2, 0); geos.push(pg);
      const edge = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      const fg = new THREE.PlaneGeometry(width, 1); fg.translate(0, 0.5, 0); geos.push(fg);
      fill = new THREE.Mesh(fg, fillM);
      group.add(edge, fill);
      const holder = new THREE.Group();
      group.rotation.x = -Math.PI / 2;
      holder.add(group);
      holder.rotation.y = dir;
      holder.position.set(x, 0.05, z);
      group.rotation.z = Math.PI;
      this.push(holder, dur, (k) => { fill.scale.y = Math.max(0.001, size * k); fillM.opacity = 0.25 + k * 0.35; edgeM.opacity = 0.5 + 0.4 * Math.sin(k * 30); }, () => { geos.forEach(g => g.dispose()); edgeM.dispose(); fillM.dispose(); });
      return;
    }
    this.push(group, dur, (k) => { fill.scale.setScalar(Math.max(0.001, size * k)); fillM.opacity = 0.2 + k * 0.35; edgeM.opacity = 0.55 + 0.4 * Math.sin(k * 30); }, () => { geos.forEach(g => g.dispose()); edgeM.dispose(); fillM.dispose(); });
  }

  // ------------------------------------------------------------------
  // Domains
  // ------------------------------------------------------------------

  domain(kind: string, x: number, z: number, r: number, dur: number) {
    const k = DOMAIN_KIND[kind] ?? 0;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const uniforms = { uTime: { value: 0 }, uKind: { value: k }, uFade: { value: 0 }, uR: { value: r } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(r, 48, 24, 0, TAU, 0, Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms, side: THREE.BackSide, transparent: true, depthWrite: false,
        vertexShader: `varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: DOMAIN_FS,
      }),
    );
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(r, 64),
      new THREE.ShaderMaterial({
        uniforms, transparent: true, depthWrite: false,
        vertexShader: `varying vec3 vP; void main(){ vP = vec3(position.x, 0.0, position.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: FLOOR_FS,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.04;
    floor.renderOrder = 2;
    group.add(dome, floor);
    // Domain-specific set pieces
    if (kind === 'shrine') group.add(shrineModel(r));
    if (kind === 'nails') group.add(nailRing(r));
    const intro = 1.1;
    this.sigil(x, z, 2.5, kind === 'shadow' ? 0x111122 : kind === 'void' ? 0x7fdcff : 0xff2a3a, intro + 0.3);
    this.flash(kind === 'void' ? '#bfefff' : kind === 'shadow' ? '#000000' : '#30000a', 0.65, 0.9);
    this.r.pulseBloom(1.5);
    const total = dur;
    this.domainActive = { kind, x, z, r, until: this.time + total, obj: group };
    let lit = false;
    this.push(group, total, (kk, dt) => {
      const t = kk * total;
      uniforms.uTime.value += dt;
      const grow = Math.min(1, Math.max(0, (t - intro * 0.4) / (intro * 0.6)));
      group.scale.set(0.05 + grow * 0.95, 0.05 + grow * 0.95, 0.05 + grow * 0.95);
      uniforms.uFade.value = t < intro * 0.4 ? 0 : t > total - 0.5 ? (total - t) / 0.5 : 1;
      if (!lit && t > intro * 0.45) { lit = true; this.r.setDomain(kind); }
      group.children.forEach(c => { if (c.userData.spin) c.rotation.y += dt * c.userData.spin; });
      if (t > intro && Math.random() < 0.3) {
        const a = Math.random() * TAU, rr = Math.random() * r * 0.9;
        const col = kind === 'shrine' ? 0xff2a2a : kind === 'shadow' ? 0x6a5aff : kind === 'void' ? 0x9ad8ff : 0xff4a6a;
        this.add.spawn(x + Math.cos(a) * rr, 0.1, z + Math.sin(a) * rr, 0, rand(1, 3), 0, this.tmpC.setHex(col), rand(0.1, 0.25), 0, 1.2, -0.3, 0.5);
      }
    }, () => {
      dome.geometry.dispose(); (dome.material as THREE.Material).dispose();
      floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
      if (this.domainActive?.obj === group) this.domainActive = null;
      if (lit) this.r.setDomain(null);
    });
    this.shake(0.4, 0.6);
  }

  /** Shatter the current domain early (domain clash). */
  breakDomain() {
    const d = this.domainActive;
    if (!d) return;
    const it = this.items.find(i => i.obj === d.obj);
    if (it) it.t = Math.max(it.t, it.dur - 0.45);
    this.domainActive = null;
    this.burst(d.x, 2, d.z, 0xffffff, 60, 12, 0.3, 0.8);
  }
}

function shrineModel(r: number) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a0204 });
  const red = new THREE.MeshBasicMaterial({ color: 0x8a0a12 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), mat);
  base.position.set(0, 1.5, -r * 0.75);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2, 4), red);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.3, 1, 0.7);
  roof.position.set(0, 4, -r * 0.75);
  // gaping mouths on the shrine pillars
  for (const sx of [-2, 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 8), mat);
    p.position.set(sx, 2, -r * 0.75 + 1.6);
    g.add(p);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 6, 12), new THREE.MeshBasicMaterial({ color: 0xff2a3a }));
    mouth.position.set(sx, 3, -r * 0.75 + 1.95);
    g.add(mouth);
  }
  for (let i = 0; i < 12; i++) {
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8c8b0 }));
    const a = (i / 12) * Math.PI - Math.PI / 2;
    skull.position.set(Math.sin(a) * 4, 0.3, -r * 0.75 + Math.cos(a) * 2.5);
    g.add(skull);
  }
  g.add(base, roof);
  return g;
}

function nailRing(r: number) {
  const g = new THREE.Group();
  g.userData.spin = 0.6;
  const mat = new THREE.MeshBasicMaterial({ color: 0xd0d0d8 });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    const nail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.2, 5), mat);
    nail.position.set(Math.sin(a) * r * 0.7, 2.5 + Math.sin(i * 1.7) * 0.6, Math.cos(a) * r * 0.7);
    nail.rotation.set(Math.PI / 2, a, 0);
    g.add(nail);
  }
  const doll = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 4, 8), new THREE.MeshBasicMaterial({ color: 0xb08a4a }));
  doll.position.set(0, 2, -r * 0.8);
  g.add(doll);
  return g;
}
