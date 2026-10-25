// Renders character head-shots from the actual 3D models for dialogue and HUD.
import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { buildCharacter } from '../render/models/characters';
import { buildCreature, CreatureKind } from '../render/models/creatures';
import { wrapHumanoid, ModelHandle } from '../render/models/model';
import { occlusion } from '../render/toon';

const BG: Record<string, [string, string]> = {
  yuji: ['#ff7a9a', '#2a0c18'], megumi: ['#5a6aff', '#0c0c24'], nobara: ['#ff9a4a', '#2a1208'], gojo: ['#7fdcff', '#08182a'],
  nanami: ['#e8d07a', '#201a08'], sukuna: ['#ff2a3a', '#200004'], mahito: ['#7ac0dc', '#0c1a20'], hanami: ['#8aff6a', '#0c200c'],
  jogo: ['#ff7a2a', '#2a0c04'], dagon: ['#ff6a4a', '#04142a'], todo: ['#ffb05a', '#201008'], panda: ['#ffffff', '#1a1a1a'],
};

const CREATURE_IDS = new Set(['hanami', 'jogo', 'dagon', 'mahoraga']);

export class Portraits {
  private cache = new Map<string, string>();
  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
  constructor(private r: Renderer) {
    this.rt = new THREE.WebGLRenderTarget(192, 192);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    const key = new THREE.DirectionalLight(0xfff4e8, 2.6);
    key.position.set(1.5, 2.5, 3);
    const rim = new THREE.DirectionalLight(0x9ab8ff, 1.6);
    rim.position.set(-2, 1.5, -2);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x404050, 1.4));
  }

  get(id: string): string {
    const hit = this.cache.get(id);
    if (hit) return hit;
    let model: ModelHandle;
    try {
      model = CREATURE_IDS.has(id) ? buildCreature(id as CreatureKind) : wrapHumanoid(buildCharacter(id === 'civilian' ? 'civilianA' : id === 'student' ? 'student' : id));
    } catch {
      return '';
    }
    model.update(0.016);
    this.scene.add(model.root);
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    const h = box.max.y;
    const headY = id === 'dagon' ? h * 0.8 : id === 'panda' ? h * 0.82 : h * 0.87;
    const dist = id === 'dagon' ? 4.5 : id === 'panda' ? 2.6 : 1.9 * (h / 1.75);
    this.cam.position.set(0.25 * dist / 2, headY + 0.05, dist);
    this.cam.lookAt(0, headY - 0.02, 0);
    const gl = this.r.gl;
    const prevTarget = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    const occ = occlusion.uOccOn.value;
    occlusion.uOccOn.value = 0;
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.scene, this.cam);
    occlusion.uOccOn.value = occ;
    const px = new Uint8Array(192 * 192 * 4);
    gl.readRenderTargetPixels(this.rt, 0, 0, 192, 192, px);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevClear, prevAlpha);
    this.scene.remove(model.root);
    model.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.shared) m.geometry.dispose(); });

    const c = document.createElement('canvas');
    c.width = c.height = 192;
    const x = c.getContext('2d')!;
    const [a, b] = BG[id] ?? ['#9a7aff', '#100c1c'];
    const g = x.createRadialGradient(96, 80, 10, 96, 96, 130);
    g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, '#000');
    x.fillStyle = g;
    x.fillRect(0, 0, 192, 192);
    const img = x.createImageData(192, 192);
    for (let row = 0; row < 192; row++) img.data.set(px.subarray((191 - row) * 192 * 4, (192 - row) * 192 * 4), row * 192 * 4);
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 192;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    x.drawImage(tmp, 0, 0);
    const url = c.toDataURL();
    this.cache.set(id, url);
    return url;
  }
}
