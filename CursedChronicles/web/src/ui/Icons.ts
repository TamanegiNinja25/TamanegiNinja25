// Procedurally painted icons for items and skills (cached data URLs).
import { IconSpec } from '../rpg/items';
import { SKILLS } from '../rpg/skills';

const cache = new Map<string, string>();

const SKILL_KANJI: Record<string, string> = {
  divergent: '逕', manji: '卍', rush: '連', slam: '撃', blackflash: '黒', slaughter: '屠', physique: '体', martial: '武', bfInstinct: '閃', unyielding: '忍', shrine: '魔',
  dogs: '犬', nue: '鵺', toad: '蟇', shadowStep: '影', elephant: '象', rabbits: '兎', reserves: '呪', bond: '絆', swordsman: '剣', insight: '十', garden: '庭',
  hairpin: '簪', volley: '釘', resonance: '共', smash: '槌', dollField: '芻', nailRain: '雨', nerves: '胆', nailcraft: '匠', grit: '根', feedback: '返', thousand: '千',
};

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
  x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
  x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
  x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b);
  x.closePath();
}

export function skillIcon(id: string, size = 96): string {
  const key = 's:' + id + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = SKILLS[id];
  const color = s?.color ?? '#ffffff';
  const c = canvas(size);
  const x = c.getContext('2d')!;
  const S = size;
  // background
  const g = x.createRadialGradient(S / 2, S * 0.42, S * 0.05, S / 2, S / 2, S * 0.7);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.6, '#120c1c');
  g.addColorStop(1, '#05040a');
  x.fillStyle = g;
  rr(x, 0, 0, S, S, S * 0.18);
  x.fill();
  // energy swirls
  x.save();
  x.translate(S / 2, S / 2);
  x.globalAlpha = 0.35;
  x.strokeStyle = color;
  x.lineWidth = S * 0.03;
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.arc(0, 0, S * (0.28 + i * 0.07), i * 1.7, i * 1.7 + Math.PI * 1.2);
    x.stroke();
  }
  x.restore();
  // accent per type
  if (s?.type === 'ultimate') {
    x.strokeStyle = '#ffd23a';
    x.lineWidth = S * 0.04;
    rr(x, S * 0.05, S * 0.05, S * 0.9, S * 0.9, S * 0.15);
    x.stroke();
  } else if (s?.type === 'passive') {
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.setLineDash([S * 0.05, S * 0.04]);
    x.lineWidth = S * 0.025;
    x.beginPath(); x.arc(S / 2, S / 2, S * 0.42, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]);
  }
  // kanji emblem
  const k = SKILL_KANJI[id] ?? '呪';
  x.font = `900 ${Math.round(S * 0.56)}px "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = S * 0.18;
  if (id === 'blackflash') {
    lightning(x, S * 0.12, S * 0.18, S * 0.88, S * 0.82, '#ff2a3a', S * 0.025);
    lightning(x, S * 0.85, S * 0.2, S * 0.2, S * 0.85, '#ff6a6a', S * 0.015);
    x.shadowColor = '#ff0020';
    x.shadowBlur = S * 0.22;
    x.lineWidth = S * 0.06;
    x.strokeStyle = '#ff2a3a';
    x.strokeText(k, S / 2, S * 0.53);
    x.fillStyle = '#050003';
    x.fillText(k, S / 2, S * 0.53);
  } else {
    x.fillStyle = '#ffffff';
    x.fillText(k, S / 2, S * 0.53);
  }
  x.shadowBlur = 0;
  // gloss
  const gl = x.createLinearGradient(0, 0, 0, S * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.18)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gl;
  rr(x, S * 0.04, S * 0.04, S * 0.92, S * 0.46, S * 0.15);
  x.fill();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

function lightning(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number) {
  x.strokeStyle = color;
  x.lineWidth = w;
  x.beginPath();
  x.moveTo(x0, y0);
  const n = 6;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    x.lineTo(x0 + (x1 - x0) * t + (i < n ? (Math.random() - 0.5) * (x1 - x0) * 0.25 : 0), y0 + (y1 - y0) * t + (i < n ? (Math.random() - 0.5) * (y1 - y0) * 0.25 : 0));
  }
  x.stroke();
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export function itemIcon(spec: IconSpec, size = 96): string {
  const key = 'i:' + spec.shape + spec.c1 + (spec.c2 ?? '') + size;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = canvas(size);
  const x = c.getContext('2d')!;
  const S = size;
  const c1 = spec.c1, c2 = spec.c2 ?? spec.c1;
  x.save();
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = S * 0.06;
  x.shadowOffsetY = S * 0.03;
  const outline = (w = 0.04) => { x.lineWidth = S * w; x.strokeStyle = '#0a0810'; x.stroke(); };
  const grad = (a: string, b: string, x0 = 0, y0 = 0, x1 = S, y1 = S) => { const g = x.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  switch (spec.shape) {
    case 'fist': {
      x.translate(S / 2, S / 2);
      x.rotate(-0.3);
      rr(x, -S * 0.26, -S * 0.2, S * 0.5, S * 0.42, S * 0.12);
      x.fillStyle = grad(shade(c1, 1.1), shade(c1, 0.7), -S * 0.2, -S * 0.2, S * 0.2, S * 0.2);
      x.fill(); outline();
      for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(-S * 0.16 + i * S * 0.105, -S * 0.2, S * 0.06, Math.PI, 0); x.fillStyle = shade(c1, 1.2); x.fill(); outline(0.025); }
      x.fillStyle = c2;
      for (let i = 0; i < 3; i++) { x.fillRect(-S * 0.26, -S * 0.02 + i * S * 0.08, S * 0.5, S * 0.035); }
      rr(x, -S * 0.3, -S * 0.02, S * 0.12, S * 0.18, S * 0.05); x.fillStyle = shade(c1, 0.95); x.fill(); outline(0.025);
      break;
    }
    case 'blade': case 'knife': case 'spear': {
      x.translate(S / 2, S / 2);
      x.rotate(-Math.PI / 4);
      const L = spec.shape === 'spear' ? 0.85 : spec.shape === 'knife' ? 0.55 : 0.75;
      x.beginPath();
      x.moveTo(-S * 0.045, -S * 0.1); x.lineTo(S * 0.045, -S * 0.1); x.lineTo(S * 0.035, -S * L * 0.62); x.lineTo(0, -S * L * 0.72); x.lineTo(-S * 0.035, -S * L * 0.62); x.closePath();
      x.fillStyle = grad('#ffffff', c1, -S * 0.05, 0, S * 0.05, 0); x.fill(); outline(0.025);
      x.fillStyle = c2; rr(x, -S * 0.13, -S * 0.12, S * 0.26, S * 0.05, S * 0.02); x.fill(); outline(0.02);
      x.fillStyle = '#2a1e1a'; rr(x, -S * 0.04, -S * 0.07, S * 0.08, S * 0.3, S * 0.03); x.fill(); outline(0.02);
      x.strokeStyle = c2; x.lineWidth = S * 0.015;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(-S * 0.04, -S * 0.04 + i * S * 0.06); x.lineTo(S * 0.04, -S * 0.01 + i * S * 0.06); x.stroke(); }
      break;
    }
    case 'hammer': {
      x.translate(S / 2, S / 2);
      x.rotate(-Math.PI / 4);
      x.fillStyle = grad('#9a7a5a', '#5a3a2a', -S * 0.03, 0, S * 0.03, 0);
      rr(x, -S * 0.035, -S * 0.15, S * 0.07, S * 0.5, S * 0.03); x.fill(); outline(0.02);
      x.fillStyle = grad(shade(c2, 1.3), shade(c2, 0.6), 0, -S * 0.35, 0, -S * 0.15);
      rr(x, -S * 0.22, -S * 0.36, S * 0.44, S * 0.2, S * 0.04); x.fill(); outline();
      x.fillStyle = c1; rr(x, -S * 0.26, -S * 0.34, S * 0.08, S * 0.16, S * 0.02); x.fill(); outline(0.02);
      break;
    }
    case 'uniform': {
      x.beginPath();
      x.moveTo(S * 0.3, S * 0.15); x.lineTo(S * 0.42, S * 0.12); x.lineTo(S * 0.5, S * 0.2); x.lineTo(S * 0.58, S * 0.12); x.lineTo(S * 0.7, S * 0.15);
      x.lineTo(S * 0.88, S * 0.38); x.lineTo(S * 0.76, S * 0.46); x.lineTo(S * 0.72, S * 0.4); x.lineTo(S * 0.72, S * 0.88); x.lineTo(S * 0.28, S * 0.88); x.lineTo(S * 0.28, S * 0.4); x.lineTo(S * 0.24, S * 0.46); x.lineTo(S * 0.12, S * 0.38); x.closePath();
      x.fillStyle = grad(shade(c1, 1.6), c1, 0, S * 0.1, 0, S * 0.9); x.fill(); outline();
      x.fillStyle = c2;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(S * 0.5, S * 0.32 + i * S * 0.13, S * 0.03, 0, Math.PI * 2); x.fill(); }
      break;
    }
    case 'charm': {
      x.translate(S / 2, S / 2);
      x.rotate(0.12);
      rr(x, -S * 0.17, -S * 0.36, S * 0.34, S * 0.72, S * 0.03);
      x.fillStyle = grad('#fffaf0', c1, 0, -S * 0.36, 0, S * 0.36); x.fill(); outline(0.03);
      x.fillStyle = c2;
      x.font = `900 ${S * 0.2}px serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowBlur = 0;
      x.fillText('呪', 0, -S * 0.15);
      x.fillText('封', 0, S * 0.12);
      x.strokeStyle = c2; x.lineWidth = S * 0.02; x.strokeRect(-S * 0.12, -S * 0.3, S * 0.24, S * 0.6);
      break;
    }
    case 'bead': {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath(); x.arc(S / 2 + Math.cos(a) * S * 0.3, S / 2 + Math.sin(a) * S * 0.3, S * 0.085, 0, Math.PI * 2);
        x.fillStyle = grad(shade(c2, 1.2), c1, 0, 0, S, S); x.fill(); outline(0.02);
      }
      break;
    }
    case 'eye': {
      x.beginPath(); x.ellipse(S / 2, S / 2, S * 0.38, S * 0.22, 0, 0, Math.PI * 2);
      x.fillStyle = '#f8fbff'; x.fill(); outline();
      const ig = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.18);
      ig.addColorStop(0, '#ffffff'); ig.addColorStop(0.4, c1); ig.addColorStop(1, '#1a4a8a');
      x.beginPath(); x.arc(S / 2, S / 2, S * 0.17, 0, Math.PI * 2); x.fillStyle = ig; x.fill();
      x.beginPath(); x.arc(S / 2, S / 2, S * 0.06, 0, Math.PI * 2); x.fillStyle = '#0a1020'; x.fill();
      break;
    }
    case 'shoes': {
      x.beginPath();
      x.moveTo(S * 0.15, S * 0.62); x.quadraticCurveTo(S * 0.18, S * 0.3, S * 0.4, S * 0.3); x.lineTo(S * 0.5, S * 0.45); x.quadraticCurveTo(S * 0.8, S * 0.48, S * 0.88, S * 0.65); x.lineTo(S * 0.88, S * 0.74); x.lineTo(S * 0.15, S * 0.74); x.closePath();
      x.fillStyle = grad(shade(c1, 1.1), shade(c1, 0.7), 0, S * 0.3, 0, S * 0.75); x.fill(); outline();
      x.fillStyle = c2; x.fillRect(S * 0.15, S * 0.66, S * 0.73, S * 0.08);
      x.strokeStyle = c2; x.lineWidth = S * 0.025;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(S * (0.38 + i * 0.06), S * 0.38 + i * S * 0.03); x.lineTo(S * (0.46 + i * 0.06), S * 0.42 + i * S * 0.03); x.stroke(); }
      break;
    }
    case 'potion': case 'potionCe': {
      const tall = spec.shape === 'potionCe';
      x.beginPath();
      if (tall) { rr(x, S * 0.36, S * 0.22, S * 0.28, S * 0.62, S * 0.1); }
      else { x.arc(S / 2, S * 0.6, S * 0.26, 0, Math.PI * 2); }
      x.fillStyle = 'rgba(220,235,255,0.35)'; x.fill(); outline();
      x.save(); x.clip();
      x.fillStyle = grad(shade(c1, 1.3), shade(c1, 0.7), 0, S * 0.4, 0, S * 0.9);
      x.fillRect(0, tall ? S * 0.42 : S * 0.52, S, S);
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.ellipse(S * 0.42, S * (tall ? 0.5 : 0.5), S * 0.05, S * 0.1, -0.4, 0, Math.PI * 2); x.fill();
      x.restore();
      x.fillStyle = '#8a6a4a'; rr(x, S * 0.42, S * (tall ? 0.12 : 0.24), S * 0.16, S * 0.12, S * 0.02); x.fill(); outline(0.02);
      x.fillStyle = c2; x.fillRect(S * 0.4, S * (tall ? 0.2 : 0.33), S * 0.2, S * 0.03);
      break;
    }
    case 'onigiri': {
      x.beginPath(); x.moveTo(S / 2, S * 0.15); x.quadraticCurveTo(S * 0.9, S * 0.75, S * 0.82, S * 0.82); x.lineTo(S * 0.18, S * 0.82); x.quadraticCurveTo(S * 0.1, S * 0.75, S / 2, S * 0.15);
      x.fillStyle = '#fafaf4'; x.fill(); outline();
      x.fillStyle = c2; x.fillRect(S * 0.32, S * 0.58, S * 0.36, S * 0.26);
      break;
    }
    case 'crystal': {
      x.beginPath(); x.moveTo(S / 2, S * 0.12); x.lineTo(S * 0.78, S * 0.42); x.lineTo(S * 0.6, S * 0.88); x.lineTo(S * 0.4, S * 0.88); x.lineTo(S * 0.22, S * 0.42); x.closePath();
      x.fillStyle = grad(c2, c1, S * 0.3, S * 0.1, S * 0.7, S * 0.9); x.fill(); outline();
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = S * 0.02;
      x.beginPath(); x.moveTo(S / 2, S * 0.12); x.lineTo(S / 2, S * 0.88); x.moveTo(S * 0.22, S * 0.42); x.lineTo(S * 0.78, S * 0.42); x.stroke();
      break;
    }
    case 'finger': {
      x.translate(S / 2, S / 2); x.rotate(-0.5);
      rr(x, -S * 0.1, -S * 0.38, S * 0.2, S * 0.76, S * 0.1);
      x.fillStyle = grad(shade(c1, 1.4), shade(c1, 0.6), -S * 0.1, 0, S * 0.1, 0); x.fill(); outline();
      x.fillStyle = '#0a0606'; rr(x, -S * 0.07, -S * 0.36, S * 0.14, S * 0.14, S * 0.05); x.fill();
      x.strokeStyle = '#2a0a0a'; x.lineWidth = S * 0.02;
      for (const y of [-S * 0.08, S * 0.12]) { x.beginPath(); x.moveTo(-S * 0.09, y); x.lineTo(S * 0.09, y); x.stroke(); }
      x.shadowColor = c2; x.shadowBlur = S * 0.2; x.strokeStyle = c2; x.lineWidth = S * 0.01; x.strokeRect(-S * 0.1, -S * 0.38, S * 0.2, S * 0.76);
      break;
    }
    case 'cotton': {
      x.fillStyle = c1;
      for (const [a, b, r] of [[0.4, 0.5, 0.18], [0.6, 0.45, 0.2], [0.5, 0.62, 0.2], [0.35, 0.65, 0.14], [0.66, 0.64, 0.15]]) { x.beginPath(); x.arc(S * a, S * b, S * r, 0, Math.PI * 2); x.fill(); }
      x.strokeStyle = c2; x.lineWidth = S * 0.03; x.beginPath(); x.arc(S / 2, S / 2, S * 0.3, 0.3, 2.5); x.stroke();
      break;
    }
    case 'leaf': {
      x.beginPath(); x.moveTo(S * 0.2, S * 0.8); x.quadraticCurveTo(S * 0.15, S * 0.2, S * 0.8, S * 0.2); x.quadraticCurveTo(S * 0.8, S * 0.8, S * 0.2, S * 0.8);
      x.fillStyle = grad(c2, c1); x.fill(); outline();
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = S * 0.02; x.beginPath(); x.moveTo(S * 0.22, S * 0.78); x.lineTo(S * 0.75, S * 0.25); x.stroke();
      break;
    }
    case 'ticket': {
      x.translate(S / 2, S / 2); x.rotate(-0.25);
      rr(x, -S * 0.36, -S * 0.2, S * 0.72, S * 0.4, S * 0.05);
      x.fillStyle = c1; x.fill(); outline();
      x.fillStyle = c2; x.font = `900 ${S * 0.16}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowBlur = 0;
      x.fillText('ADMIT', 0, 0);
      break;
    }
    default: {
      x.beginPath(); x.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2); x.fillStyle = c1; x.fill(); outline();
    }
  }
  x.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
