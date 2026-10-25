// Ambient weather particles that follow the camera: rain, sakura, leaves, ash…
import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Weather as WeatherKind } from '../world/MapBuilder';
import { rand } from '../core/util';

export class Weather {
  kind: WeatherKind = 'none';
  private obj: THREE.Object3D | null = null;
  private pos: Float32Array | null = null;
  private vel: Float32Array | null = null;
  private n = 0;
  private t = 0;
  private box = 34;

  constructor(private r: Renderer) {}

  set(kind: WeatherKind, parent: THREE.Object3D) {
    this.dispose();
    this.kind = kind;
    if (kind === 'none') return;
    const B = this.box;
    if (kind === 'rain') {
      this.n = 700;
      this.pos = new Float32Array(this.n * 6);
      this.vel = new Float32Array(this.n);
      for (let i = 0; i < this.n; i++) this.resetRain(i, rand(0, 14));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const m = new THREE.LineBasicMaterial({ color: 0x9ab8d0, transparent: true, opacity: 0.45, depthWrite: false });
      this.obj = new THREE.LineSegments(g, m);
    } else {
      const cfg = this.cfg();
      this.n = cfg.n;
      this.pos = new Float32Array(this.n * 3);
      this.vel = new Float32Array(this.n * 3);
      const col = new Float32Array(this.n * 3);
      const c = new THREE.Color();
      for (let i = 0; i < this.n; i++) {
        this.pos[i * 3] = rand(-B / 2, B / 2); this.pos[i * 3 + 1] = rand(0, cfg.h); this.pos[i * 3 + 2] = rand(-B / 2, B / 2);
        this.vel[i * 3] = rand(-0.3, 0.3) + cfg.wind; this.vel[i * 3 + 1] = -rand(cfg.fall[0], cfg.fall[1]); this.vel[i * 3 + 2] = rand(-0.3, 0.3);
        c.setHex(cfg.colors[i % cfg.colors.length]);
        col.set([c.r, c.g, c.b], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uScale: { value: 500 }, uSize: { value: cfg.size }, uTime: { value: 0 } },
        vertexShader: `attribute vec3 color; varying vec3 vC; varying float vR; uniform float uScale; uniform float uSize; uniform float uTime;
          void main(){ vC = color; vR = fract(sin(float(gl_VertexID) * 12.9898) * 43758.5) * 6.283 + uTime * 2.0; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uScale / -mv.z; }`,
        fragmentShader: `varying vec3 vC; varying float vR;
          void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = mat2(c,-s,s,c) * p; p.x *= ${cfg.petal ? '2.2' : '1.0'};
            float d = length(p); if (d > 0.5) discard; gl_FragColor = vec4(vC, smoothstep(0.5, 0.2, d) * ${cfg.alpha.toFixed(2)}); }`,
      });
      this.obj = new THREE.Points(g, m);
    }
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 30;
    parent.add(this.obj);
  }

  private cfg() {
    switch (this.kind) {
      case 'sakura': return { n: 160, h: 14, fall: [0.5, 1.1] as [number, number], wind: 0.6, colors: [0xffc0d4, 0xffd8e4, 0xf8a8c0], size: 0.22, additive: false, petal: true, alpha: 0.95 };
      case 'leaves': return { n: 120, h: 14, fall: [0.6, 1.2] as [number, number], wind: 0.4, colors: [0x8ab04a, 0xd8a03a, 0x6a9a3a, 0xc8702a], size: 0.24, additive: false, petal: true, alpha: 0.95 };
      case 'ash': return { n: 220, h: 14, fall: [0.2, 0.7] as [number, number], wind: 0.3, colors: [0x5a5060, 0x3a3440, 0xff8a3a, 0x8a7a9a], size: 0.12, additive: false, petal: false, alpha: 0.8 };
      case 'embers': return { n: 160, h: 10, fall: [-1.2, -0.4] as [number, number], wind: 0.2, colors: [0xff8a2a, 0xffc04a, 0xff4a1a], size: 0.1, additive: true, petal: false, alpha: 1 };
      case 'fireflies': return { n: 70, h: 4, fall: [-0.1, 0.1] as [number, number], wind: 0, colors: [0xd8ff6a, 0xa8ff8a], size: 0.14, additive: true, petal: false, alpha: 1 };
      case 'drips': return { n: 60, h: 8, fall: [5, 8] as [number, number], wind: 0, colors: [0x7aa08a], size: 0.08, additive: false, petal: false, alpha: 0.7 };
      case 'confetti': return { n: 140, h: 14, fall: [0.8, 1.5] as [number, number], wind: 0.2, colors: [0xff4a8a, 0x4ad8ff, 0xffd04a, 0x9a6aff], size: 0.16, additive: false, petal: true, alpha: 0.95 };
      default: return { n: 1, h: 1, fall: [0, 0] as [number, number], wind: 0, colors: [0xffffff], size: 0, additive: false, petal: false, alpha: 0 };
    }
  }

  private resetRain(i: number, y: number) {
    const B = this.box;
    const x = this.r.target.x + rand(-B / 2, B / 2), z = this.r.target.z + rand(-B / 2, B / 2);
    const p = this.pos!;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z;
    p[i * 6 + 3] = x - 0.08; p[i * 6 + 4] = y + 0.7; p[i * 6 + 5] = z - 0.05;
    this.vel![i] = rand(16, 22);
  }

  update(dt: number, cx: number, cz: number) {
    if (!this.obj || !this.pos || !this.vel) return;
    this.t += dt;
    const B = this.box;
    if (this.kind === 'rain') {
      const p = this.pos;
      for (let i = 0; i < this.n; i++) {
        const dy = this.vel[i] * dt;
        p[i * 6 + 1] -= dy; p[i * 6 + 4] -= dy;
        p[i * 6] -= dy * 0.1; p[i * 6 + 3] -= dy * 0.1;
        if (p[i * 6 + 1] < 0) this.resetRain(i, 14);
      }
    } else {
      const p = this.pos, v = this.vel;
      const cfg = this.cfg();
      for (let i = 0; i < this.n; i++) {
        const sway = Math.sin(this.t * 1.3 + i) * 0.4;
        p[i * 3] += (v[i * 3] + sway) * dt;
        p[i * 3 + 1] += v[i * 3 + 1] * dt;
        p[i * 3 + 2] += v[i * 3 + 2] * dt;
        if (this.kind === 'fireflies') { p[i * 3 + 1] = 0.6 + Math.sin(this.t * 0.8 + i * 1.7) * 1.2 + 1.2; }
        // wrap around the camera target
        if (p[i * 3] < cx - B / 2) p[i * 3] += B; else if (p[i * 3] > cx + B / 2) p[i * 3] -= B;
        if (p[i * 3 + 2] < cz - B / 2) p[i * 3 + 2] += B; else if (p[i * 3 + 2] > cz + B / 2) p[i * 3 + 2] -= B;
        if (p[i * 3 + 1] < 0) p[i * 3 + 1] = cfg.h;
        if (p[i * 3 + 1] > cfg.h + 0.5) p[i * 3 + 1] = 0;
      }
      const m = (this.obj as THREE.Points).material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = this.t;
      m.uniforms.uScale.value = this.r.gl.getDrawingBufferSize(new THREE.Vector2()).y * this.r.camera.projectionMatrix.elements[5] * 0.5;
    }
    ((this.obj as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    if (this.obj) {
      this.obj.parent?.remove(this.obj);
      const o = this.obj as THREE.Points;
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.obj = null;
    this.pos = null;
    this.vel = null;
  }
}
