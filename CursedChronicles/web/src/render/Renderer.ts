// Three.js renderer wrapper: camera rig, lighting, shadows, bloom and quality tiers.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { clamp, lerp } from '../core/util';
import { rim } from './toon';

export type Quality = 'low' | 'medium' | 'high';

export interface LightingPreset {
  sky: number;
  ground: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  sunDir: [number, number, number];
  ambient: number;
  ambientIntensity: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  bg: number;
  bloom: number;
  bloomThreshold?: number;
  exposure?: number;
  /** soft light that follows the player so characters stay readable at night */
  playerLight?: number;
}

export class Renderer {
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  quality: Quality = 'high';
  /** pooled point lights (fixed count so shaders never recompile) */
  pointLights: THREE.PointLight[] = [];
  playerLight: THREE.PointLight;
  target = new THREE.Vector3();
  camOffset = new THREE.Vector3(0, 13.6, 10.6);
  zoom = 1;
  private camPos = new THREE.Vector3();
  /** returns true when the camera's ground footprint is inside a solid object */
  cameraBlocked: ((x: number, z: number) => boolean) | null = null;
  private pitchK = 1;
  private shakeAmt = 0;
  private shakeT = 0;
  private bloomBase = 0.6;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 140);
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x40362c, 1.2);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.ambient = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.ambient);
    this.playerLight = new THREE.PointLight(0xe8ecff, 0, 10, 1.0);
    this.scene.add(this.playerLight);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.PointLight(0xffaa55, 0, 12, 1.6);
      this.pointLights.push(p);
      this.scene.add(p);
    }
    this.resize();
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const ratio = q === 'high' ? Math.min(dpr, 1.6) : q === 'medium' ? Math.min(dpr, 1.15) : Math.min(dpr, 0.8);
    this.gl.setPixelRatio(ratio);
    this.gl.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
    this.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
    this.setupComposer();
    this.resize();
  }

  private setupComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (this.quality === 'low') return;
    const composer = new EffectComposer(this.gl);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const res = new THREE.Vector2(Math.max(1, this.width / 2), Math.max(1, this.height / 2));
    this.bloom = new UnrealBloomPass(res, this.bloomBase, 0.55, 1.2);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private preset: LightingPreset | null = null;
  private domainKind: string | null = null;

  /** Re-light the whole scene while a domain expansion is active (null restores). */
  setDomain(kind: string | null) {
    if (kind === this.domainKind) return;
    this.domainKind = kind;
    const base = this.preset;
    if (!kind) { if (base) this.applyLighting(base, true); return; }
    const d = DOMAIN_LIGHT[kind];
    if (!d || !base) return;
    this.applyLighting({ ...base, ...d, playerLight: Math.max(2, base.playerLight ?? 0), bloom: base.bloom + 0.25 }, true);
  }

  applyLighting(p: LightingPreset, domain = false) {
    if (!domain) { this.preset = p; this.domainKind = null; }
    this.hemi.color.setHex(p.sky);
    this.hemi.groundColor.setHex(p.ground);
    this.hemi.intensity = p.hemiIntensity;
    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.sun.userData.dir = new THREE.Vector3(...p.sunDir).normalize();
    this.ambient.color.setHex(p.ambient);
    this.ambient.intensity = p.ambientIntensity;
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.scene.background = new THREE.Color(p.bg);
    this.bloomBase = p.bloom;
    if (this.bloom) {
      this.bloom.strength = p.bloom;
      this.bloom.threshold = p.bloomThreshold ?? 1.2;
    }
    this.gl.toneMappingExposure = p.exposure ?? 1.05;
    this.playerLight.intensity = p.playerLight ?? 0;
    // brighter rim on dark maps keeps silhouettes readable
    const night = (p.playerLight ?? 0) > 0;
    rim.uRim.value = night ? 0.32 : 0.12;
    rim.uRimColor.value.setHex(p.sky).lerp(new THREE.Color(0xffffff), 0.35);
  }

  /** Temporary bloom spike for big moments (domain expansions, black flash). */
  pulseBloom(extra: number) {
    if (this.bloom) this.bloom.strength = Math.max(this.bloom.strength, this.bloomBase + extra);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep a similar horizontal field of view on tall/narrow screens.
    this.camera.fov = w / h < 1.2 ? 52 : 36;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.bloom?.setSize(Math.max(1, w / 2), Math.max(1, h / 2));
  }

  shake(amount: number, time = 0.25) {
    this.shakeAmt = Math.max(this.shakeAmt, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  /** Snap camera to target instantly (map changes). */
  snap(x: number, z: number) {
    this.target.set(x, 0, z);
    this.pitchK = 1;
    this.camPos.copy(this.target).addScaledVector(this.camOffset, this.zoom);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target.x, 0.8, this.target.z);
  }

  updateCamera(dt: number, tx: number, tz: number, lookAheadX = 0, lookAheadZ = 0) {
    const k = 1 - Math.exp(-dt * 6);
    this.target.x = lerp(this.target.x, tx + lookAheadX, k);
    this.target.z = lerp(this.target.z, tz + lookAheadZ, k);
    // swing the camera more overhead when it would end up inside a building
    const ox = this.camOffset.x * this.zoom, oz = this.camOffset.z * this.zoom;
    const blocked = this.cameraBlocked?.(this.target.x + ox * this.pitchK, this.target.z + oz * this.pitchK) || this.cameraBlocked?.(this.target.x + ox * 0.6, this.target.z + oz * 0.6);
    this.pitchK = lerp(this.pitchK, blocked ? 0.35 : 1, 1 - Math.exp(-dt * (blocked ? 5 : 1.5)));
    this.camPos.set(this.target.x + ox * this.pitchK, this.target.y + this.camOffset.y * this.zoom * (1 + (1 - this.pitchK) * 0.15), this.target.z + oz * this.pitchK);
    this.camera.position.copy(this.camPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmt * clamp(this.shakeT / 0.25, 0, 1);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmt = 0;
    }
    this.camera.lookAt(this.target.x, 0.8, this.target.z);
    this.playerLight.position.set(tx, 4.5, tz + 2.5);
    // shadow camera follows the view target
    const d = (this.sun.userData.dir as THREE.Vector3) ?? new THREE.Vector3(0.5, 1, 0.3).normalize();
    this.sun.target.position.set(this.target.x, 0, this.target.z);
    this.sun.position.set(this.target.x + d.x * 40, d.y * 40, this.target.z + d.z * 40);
    if (this.bloom && this.bloom.strength > this.bloomBase) {
      this.bloom.strength = Math.max(this.bloomBase, this.bloom.strength - dt * 2.5);
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.gl.render(this.scene, this.camera);
  }

  /** Project a world point to screen pixels (CSS px). Returns false if behind camera. */
  project(v: THREE.Vector3, out: { x: number; y: number }) {
    const p = _proj.copy(v).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    return p.z < 1;
  }
}

const _proj = new THREE.Vector3();

const DOMAIN_LIGHT: Record<string, Partial<LightingPreset>> = {
  shrine: { sky: 0x6a0a14, ground: 0x200004, hemiIntensity: 1.2, sun: 0xff5a5a, sunIntensity: 1.5, ambient: 0xff6a6a, ambientIntensity: 0.25, fog: 0x2a0206, fogNear: 18, fogFar: 52, bg: 0x1a0002, exposure: 1.0 },
  womb: { sky: 0x6a0a14, ground: 0x200004, hemiIntensity: 1.2, sun: 0xff5a5a, sunIntensity: 1.5, ambient: 0xff6a6a, ambientIntensity: 0.25, fog: 0x2a0206, fogNear: 18, fogFar: 52, bg: 0x1a0002, exposure: 1.0 },
  shadow: { sky: 0x3a3a7a, ground: 0x05050a, hemiIntensity: 1.0, sun: 0x9a9aff, sunIntensity: 0.9, ambient: 0x6a6aaa, ambientIntensity: 0.3, fog: 0x05050c, fogNear: 14, fogFar: 42, bg: 0x020205, exposure: 1.05 },
  nails: { sky: 0x7a1424, ground: 0x1a0408, hemiIntensity: 1.2, sun: 0xff7a8a, sunIntensity: 1.3, ambient: 0xff8a9a, ambientIntensity: 0.25, fog: 0x1a0206, fogNear: 18, fogFar: 50, bg: 0x100002, exposure: 1.0 },
  void: { sky: 0x6a9aff, ground: 0x02020a, hemiIntensity: 1.2, sun: 0xb0e8ff, sunIntensity: 1.5, ambient: 0x9adfff, ambientIntensity: 0.3, fog: 0x02030a, fogNear: 20, fogFar: 60, bg: 0x000004, exposure: 1.05 },
  coffin: { sky: 0xff7a3a, ground: 0x401004, hemiIntensity: 1.3, sun: 0xff9a4a, sunIntensity: 2.0, ambient: 0xff8a4a, ambientIntensity: 0.3, fog: 0x401004, fogNear: 16, fogFar: 46, bg: 0x200800, exposure: 1.0 },
  sea: { sky: 0xcfeaff, ground: 0xe8d8a8, hemiIntensity: 1.5, sun: 0xffffff, sunIntensity: 2.6, ambient: 0xffffff, ambientIntensity: 0.2, fog: 0xbfe4ff, fogNear: 30, fogFar: 90, bg: 0x8ac4ff, exposure: 1.0 },
  hands: { sky: 0xa0a8b8, ground: 0x30343c, hemiIntensity: 1.3, sun: 0xd8e0e8, sunIntensity: 1.4, ambient: 0xc0c8d0, ambientIntensity: 0.3, fog: 0x2a2e36, fogNear: 18, fogFar: 50, bg: 0x1a1c22, exposure: 1.0 },
};
