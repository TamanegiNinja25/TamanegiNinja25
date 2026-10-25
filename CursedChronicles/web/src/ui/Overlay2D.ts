// 2D canvas overlay drawn on top of the 3D view: damage numbers, health bars,
// NPC quest markers and floating labels.
import * as THREE from 'three';
import { Renderer } from '../render/Renderer';

interface FloatText { x: number; y: number; z: number; txt: string; color: string; size: number; t: number; dur: number; vx: number; crit: boolean }

export interface BarInfo { x: number; y: number; z: number; hp: number; max: number; name?: string; color?: string; grade?: string; gradeColor?: string; elite?: boolean; marked?: number; stun?: boolean }
export interface MarkerInfo { x: number; y: number; z: number; kind: '!' | '?' | 'shop' | '…' | 'travel' | 'pickup'; name?: string; near?: boolean }

export class Overlay2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texts: FloatText[] = [];
  bars: BarInfo[] = [];
  markers: MarkerInfo[] = [];
  private v = new THREE.Vector3();
  private p = { x: 0, y: 0 };
  dpr = 1;
  time = 0;

  constructor(canvas: HTMLCanvasElement, private r: Renderer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
  }

  add(x: number, y: number, z: number, txt: string, color: string, size = 18, crit = false) {
    this.texts.push({ x, y, z, txt, color, size, t: 0, dur: crit ? 1.1 : 0.8, vx: (Math.random() - 0.5) * 0.8, crit });
    if (this.texts.length > 60) this.texts.shift();
  }

  clear() { this.texts = []; this.bars = []; this.markers = []; }

  draw(dt: number) {
    this.time += dt;
    const c = this.ctx;
    const d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(d, 0, 0, d, 0, 0);
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    // health bars
    for (const b of this.bars) {
      this.v.set(b.x, b.y, b.z);
      if (!this.r.project(this.v, this.p)) continue;
      const w = b.elite ? 64 : 46, h = b.elite ? 6 : 5;
      const x = this.p.x - w / 2, y = this.p.y;
      const k = Math.max(0, Math.min(1, b.hp / b.max));
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(x - 1, y - 1, w + 2, h + 2);
      const grad = c.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#ff5a6a'); grad.addColorStop(1, '#b0182c');
      c.fillStyle = grad;
      c.fillRect(x, y, w * k, h);
      if (b.name) {
        c.font = `600 ${b.elite ? 12 : 10}px system-ui, sans-serif`;
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        const label = b.grade ? `${b.name}` : b.name;
        c.strokeText(label, this.p.x, y - 9);
        c.fillStyle = b.gradeColor ?? '#fff';
        c.fillText(label, this.p.x, y - 9);
      }
      if (b.marked && b.marked > 0) {
        c.fillStyle = '#ff4a6a';
        c.font = 'bold 11px system-ui';
        c.fillText(`✦${b.marked}`, x + w + 12, y + 3);
      }
      if (b.stun) {
        c.fillStyle = '#ffe14a';
        c.font = 'bold 12px system-ui';
        const a = this.time * 6;
        for (let i = 0; i < 3; i++) c.fillText('★', this.p.x + Math.cos(a + i * 2.1) * 14, y - 22 + Math.sin(a + i * 2.1) * 4);
      }
    }

    // quest / shop markers
    for (const m of this.markers) {
      this.v.set(m.x, m.y, m.z);
      if (!this.r.project(this.v, this.p)) continue;
      const bob = Math.sin(this.time * 3) * 4;
      const y = this.p.y + bob;
      if (m.kind === '!' || m.kind === '?') {
        c.font = '900 30px system-ui, sans-serif';
        c.lineWidth = 5;
        c.strokeStyle = 'rgba(20,10,0,0.9)';
        c.strokeText(m.kind, this.p.x, y);
        c.fillStyle = m.kind === '!' ? '#ffd23a' : '#7affb0';
        c.shadowColor = c.fillStyle; c.shadowBlur = 12;
        c.fillText(m.kind, this.p.x, y);
        c.shadowBlur = 0;
      } else if (m.kind === 'pickup') {
        c.font = '900 22px system-ui';
        c.fillStyle = '#ffffff';
        c.shadowColor = '#9adfff'; c.shadowBlur = 14;
        c.fillText('✦', this.p.x, y);
        c.shadowBlur = 0;
      } else {
        c.font = '700 16px system-ui';
        c.fillStyle = m.kind === 'travel' ? '#7fdcff' : '#ffffff';
        c.fillText(m.kind === 'shop' ? '¥' : m.kind === 'travel' ? '⛩' : '…', this.p.x, y);
      }
      if (m.name && m.near) {
        c.font = '600 12px system-ui, sans-serif';
        c.lineWidth = 3;
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.strokeText(m.name, this.p.x, this.p.y + 22);
        c.fillStyle = '#fff';
        c.fillText(m.name, this.p.x, this.p.y + 22);
      }
    }

    // floating combat text
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.dur) { this.texts.splice(i, 1); continue; }
      const k = t.t / t.dur;
      this.v.set(t.x + t.vx * k, t.y + k * 1.4, t.z);
      if (!this.r.project(this.v, this.p)) continue;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.7 : k < 0.25 ? 1.3 - (k - 0.12) / 0.13 * 0.3 : 1;
      const size = t.size * pop;
      c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      c.font = `900 ${size}px "Arial Black", system-ui, sans-serif`;
      c.lineWidth = Math.max(3, size / 5);
      c.strokeStyle = t.color === '#ff2a3a' ? '#000' : 'rgba(10,6,16,0.9)';
      c.strokeText(t.txt, this.p.x, this.p.y);
      c.fillStyle = t.color;
      if (t.crit) { c.shadowColor = t.color; c.shadowBlur = 10; }
      c.fillText(t.txt, this.p.x, this.p.y);
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    }
    this.bars.length = 0;
    this.markers.length = 0;
  }
}
