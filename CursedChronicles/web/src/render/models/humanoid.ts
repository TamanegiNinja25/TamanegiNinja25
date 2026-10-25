// Parametric anime-style humanoid: one builder drives every sorcerer and NPC.
import * as THREE from 'three';
import { G, V3 } from '../geo';
import { RigBuilder, RigModel, resetPose } from '../rig';
import { TAU, clamp, lerp } from '../../core/util';

export type HairStyle =
  | 'yuji' | 'megumi' | 'nobara' | 'gojo' | 'nanami' | 'maki' | 'inumaki' | 'shoko' | 'todo'
  | 'yaga' | 'ijichi' | 'junpei' | 'meimei' | 'mahito' | 'geto' | 'miwa' | 'bald' | 'short' | 'bun' | 'long';

export type Outfit = 'uniform' | 'uniformHood' | 'uniformSkirt' | 'suit' | 'labcoat' | 'casual' | 'robe' | 'tank' | 'patchwork' | 'kimono' | 'uniformHigh';

export interface HumanoidSpec {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  eyes: number;
  outfit: Outfit;
  top: number;          // jacket / shirt colour
  bottom: number;       // trousers / skirt colour
  accent: number;       // buttons, trims
  shoes: number;
  inner?: number;       // hood / shirt / tie colour
  height?: number;      // 1 = standard
  bulk?: number;        // 1 = standard build
  head?: number;        // head size multiplier
  glasses?: 'round' | 'goggles' | 'shades' | 'blindfold' | 'none';
  extras?: ('scars' | 'stitches' | 'collar' | 'tie' | 'braid' | 'eyepatch' | 'mask' | 'facescar' | 'sukunaMarks' | 'cursedEyes' | 'gloves')[];
  outline?: number;
}

export interface Humanoid extends RigModel {
  spec: HumanoidSpec;
  /** bone used for weapons in the right hand */
  hand: THREE.Bone;
  handL: THREE.Bone;
  anim: HumanoidAnimator;
}

export function buildHumanoid(spec: HumanoidSpec): Humanoid {
  const H = spec.height ?? 1;
  const B = spec.bulk ?? 1;
  const HS = spec.head ?? 1;
  const r = new RigBuilder();

  const legLen = 0.42 * H;
  const hipY = legLen * 2 + 0.06;
  const torsoLen = 0.5 * H;
  const shoulderW = 0.2 * B;
  const headR = 0.215 * HS;

  r.bone('hips', 'root', [0, hipY, 0]);
  r.bone('spine', 'hips', [0, 0.05, 0]);
  r.bone('chest', 'spine', [0, torsoLen * 0.5, 0]);
  r.bone('neck', 'chest', [0, torsoLen * 0.45, 0]);
  r.bone('head', 'neck', [0, 0.06, 0]);
  for (const s of ['L', 'R'] as const) {
    const sx = s === 'L' ? 1 : -1;
    r.bone('armUp' + s, 'chest', [sx * (shoulderW + 0.04), torsoLen * 0.38, 0]);
    r.bone('armLow' + s, 'armUp' + s, [0, -0.27 * H, 0]);
    r.bone('hand' + s, 'armLow' + s, [0, -0.25 * H, 0]);
    r.bone('legUp' + s, 'hips', [sx * 0.105 * B, -0.03, 0]);
    r.bone('legLow' + s, 'legUp' + s, [0, -legLen, 0]);
    r.bone('foot' + s, 'legLow' + s, [0, -legLen + 0.04, 0]);
  }

  const { skin, top, bottom, accent, shoes } = spec;
  const inner = spec.inner ?? 0x222222;
  const isSkirt = spec.outfit === 'uniformSkirt';
  const isSuit = spec.outfit === 'suit';
  const longCoat = spec.outfit === 'labcoat' || spec.outfit === 'robe' || spec.outfit === 'kimono';

  // ---- Torso ----
  const torsoW = 0.21 * B;
  r.part('spine', G.capsuleUp(torsoW * 0.92, torsoLen * 0.6, 12), top, { pos: [0, -0.04, 0], scale: [1, 1, 0.72] });
  r.part('chest', G.ellipsoid(torsoW * 1.06, torsoLen * 0.42, torsoW * 0.78, 14, 10), top, { pos: [0, torsoLen * 0.18, 0] });
  // shoulders
  r.part('chest', G.ellipsoid(shoulderW + 0.06, 0.09, 0.13 * B, 12, 8), top, { pos: [0, torsoLen * 0.36, 0] });
  // pelvis
  r.part('hips', G.ellipsoid(torsoW * 0.95, 0.12, torsoW * 0.72, 12, 8), isSkirt ? bottom : (spec.outfit === 'tank' ? bottom : bottom), { pos: [0, 0.0, 0] });

  if (spec.outfit === 'uniform' || spec.outfit === 'uniformHood' || spec.outfit === 'uniformSkirt' || spec.outfit === 'uniformHigh') {
    // Jujutsu High jacket: dark navy with high collar, gold spiral buttons
    for (let i = 0; i < 4; i++) {
      r.part('chest', G.sphere(0.022, 8, 6), accent, { pos: [0.005, torsoLen * (0.28 - i * 0.13), torsoW * 0.8], glow: 0.25 });
    }
    r.part('neck', G.cyl(0.085, 0.1, spec.outfit === 'uniformHigh' ? 0.2 : 0.11, 14, false), top, { pos: [0, spec.outfit === 'uniformHigh' ? 0.06 : 0.0, 0] });
    if (spec.outfit === 'uniformHood') {
      // red hood draped behind the collar (Yuji)
      r.part('chest', G.ellipsoid(0.2, 0.11, 0.1, 12, 8), inner, { pos: [0, torsoLen * 0.42, -0.14] });
      r.part('chest', G.ellipsoid(0.17, 0.07, 0.06, 10, 6), inner, { pos: [0, torsoLen * 0.47, 0.11] });
    }
    // jacket hem flaring at the hips
    if (!isSkirt) r.part('hips', G.cyl(torsoW * 0.98, torsoW * 1.12, 0.16, 14, true), top, { pos: [0, -0.04, 0], scale: [1, 1, 0.78] });
  }
  if (isSuit) {
    r.part('chest', G.box(0.1, torsoLen * 0.42, 0.02), 0xf2f0ea, { pos: [0, torsoLen * 0.14, torsoW * 0.76], rot: [-0.12, 0, 0] });
    r.part('chest', G.box(0.045, torsoLen * 0.38, 0.03), inner, { pos: [0, torsoLen * 0.12, torsoW * 0.8], rot: [-0.12, 0, 0] });
    r.part('hips', G.cyl(torsoW * 0.98, torsoW * 1.1, 0.14, 14, true), top, { pos: [0, -0.03, 0], scale: [1, 1, 0.78] });
  }
  if (longCoat) {
    r.part('hips', G.cyl(torsoW * 1.0, torsoW * 1.45, 0.62 * H, 14, true), top, { pos: [0, -0.3 * H, 0], scale: [1, 1, 0.8] });
    if (spec.outfit !== 'labcoat') {
      // obi sash + collar trim
      r.part('spine', G.cyl(torsoW * 0.98, torsoW * 1.0, 0.12, 14), spec.accent, { pos: [0, 0.06, 0], scale: [1, 1, 0.76] });
      r.part('chest', G.box(0.05, torsoLen * 0.55, 0.02), spec.accent, { pos: [0.03, torsoLen * 0.15, torsoW * 0.76], rot: [-0.1, 0, 0.35] });
    }
  }
  if (spec.outfit === 'tank') {
    r.part('chest', G.ellipsoid(torsoW * 1.12, torsoLen * 0.3, torsoW * 0.85, 12, 8), skin, { pos: [0, torsoLen * 0.34, 0] });
  }
  if (spec.outfit === 'patchwork') {
    // Mahito: patchwork shirt with stitched seams
    for (let i = 0; i < 5; i++) r.part('chest', G.box(0.05, 0.008, 0.01), 0x6a6a7a, { pos: [0.04, torsoLen * (0.3 - i * 0.09), torsoW * 0.78], rot: [0, 0, 0.5] });
    r.part('chest', G.box(0.008, torsoLen * 0.45, 0.01), 0x6a6a7a, { pos: [0.04, torsoLen * 0.12, torsoW * 0.79] });
  }
  if (isSkirt) {
    r.part('hips', G.cyl(torsoW * 0.98, torsoW * 1.65, 0.3 * H, 16, true), bottom, { pos: [0, -0.12 * H, 0], scale: [1, 1, 0.85] });
  }
  if (spec.extras?.includes('tie')) {
    r.part('chest', G.box(0.05, torsoLen * 0.4, 0.025), inner, { pos: [0, torsoLen * 0.12, torsoW * 0.8], rot: [-0.1, 0, 0] });
  }

  // ---- Arms ----
  const armTop = isSuit || spec.outfit === 'casual' || spec.outfit === 'kimono' ? top : top;
  for (const s of ['L', 'R'] as const) {
    const bareArms = spec.outfit === 'tank';
    r.part('armUp' + s, G.limb(0.072 * B, 0.062 * B, 0.27 * H), bareArms ? skin : armTop);
    r.part('armLow' + s, G.limb(0.062 * B, 0.052 * B, 0.23 * H), bareArms ? skin : armTop);
    // cuff
    if (!bareArms) r.part('armLow' + s, G.cyl(0.066 * B, 0.07 * B, 0.05, 10), spec.outfit.startsWith('uniform') ? top : accent, { pos: [0, -0.2 * H, 0] });
    const gloves = spec.extras?.includes('gloves');
    r.part('hand' + s, G.ellipsoid(0.058, 0.07, 0.045, 10, 8), gloves ? 0x1c1c22 : skin, { pos: [0, -0.04, 0] });
    r.part('hand' + s, G.ellipsoid(0.022, 0.04, 0.022, 6, 5), gloves ? 0x1c1c22 : skin, { pos: [s === 'L' ? -0.04 : 0.04, -0.02, 0.025], rot: [0, 0, s === 'L' ? 0.6 : -0.6] });
  }

  // ---- Legs ----
  for (const s of ['L', 'R'] as const) {
    const legColor = isSkirt ? 0x1a1a1f : bottom; // stockings under skirt
    r.part('legUp' + s, G.limb(0.088 * B, 0.07 * B, legLen), legColor);
    r.part('legLow' + s, G.limb(0.07 * B, 0.058 * B, legLen - 0.02), legColor);
    // shoe
    r.part('foot' + s, G.ellipsoid(0.07, 0.055, 0.13, 10, 6), shoes, { pos: [0, -0.01, 0.045] });
    r.part('foot' + s, G.box(0.13, 0.025, 0.24), darken(shoes, 0.55), { pos: [0, -0.055, 0.04] });
  }

  // ---- Head ----
  r.part('neck', G.cyl(0.055, 0.06, 0.12, 10), skin, { pos: [0, 0.02, 0] });
  const hc: V3 = [0, headR * 0.95, 0.01];
  r.part('head', G.ellipsoid(headR * 0.94, headR * 1.02, headR * 0.98, 18, 14), skin, { pos: hc });
  // jaw / chin
  r.part('head', G.ellipsoid(headR * 0.62, headR * 0.5, headR * 0.6, 12, 8), skin, { pos: [0, headR * 0.5, headR * 0.28] });
  // ears
  r.part('head', G.ellipsoid(0.03, 0.05, 0.022, 8, 6), skin, { pos: [headR * 0.92, headR * 0.92, 0] });
  r.part('head', G.ellipsoid(0.03, 0.05, 0.022, 8, 6), skin, { pos: [-headR * 0.92, headR * 0.92, 0] });

  // eyes (large anime style, sitting on the face surface)
  const eyeY = hc[1] - headR * 0.08, eyeZ = headR * 0.9, eyeX = headR * 0.37;
  const glasses = spec.glasses ?? 'none';
  if (glasses !== 'blindfold') {
    for (const sx of [1, -1]) {
      const yaw = sx * 0.35;
      r.part('head', G.ellipsoid(0.05, 0.06, 0.022, 12, 8), 0xf9f7f2, { pos: [sx * eyeX, eyeY, eyeZ], rot: [0, yaw, 0] });
      r.part('head', G.ellipsoid(0.037, 0.05, 0.02, 12, 8), spec.eyes, { pos: [sx * eyeX * 0.98, eyeY - 0.004, eyeZ + 0.01], rot: [0, yaw, 0], glow: spec.extras?.includes('cursedEyes') ? 0.55 : 0.12, topColor: darken(spec.eyes, 0.55) });
      r.part('head', G.ellipsoid(0.018, 0.026, 0.01, 8, 6), 0x08080e, { pos: [sx * eyeX * 0.97, eyeY - 0.006, eyeZ + 0.02], rot: [0, yaw, 0] });
      r.part('head', G.sphere(0.011, 6, 4), 0xffffff, { pos: [sx * eyeX * 0.95 + 0.013, eyeY + 0.017, eyeZ + 0.027], glow: 0.25 });
      // upper lash line
      r.part('head', G.box(0.11, 0.016, 0.02), 0x15121a, { pos: [sx * eyeX, eyeY + 0.056, eyeZ + 0.004], rot: [0, yaw, sx * -0.1] });
      // brow
      r.part('head', G.box(0.075, 0.014, 0.014), darken(spec.hair, 0.6), { pos: [sx * eyeX, eyeY + 0.1, eyeZ - 0.005], rot: [0, yaw, sx * 0.12] });
    }
    if (spec.extras?.includes('sukunaMarks')) {
      for (const sx of [1, -1]) {
        r.part('head', G.box(0.07, 0.012, 0.012), 0x8a0d18, { pos: [sx * eyeX, eyeY - 0.075, eyeZ + 0.01], rot: [0, sx * 0.35, 0] });
        // second pair of eyes under the first
        r.part('head', G.ellipsoid(0.03, 0.016, 0.012), 0xff2a3a, { pos: [sx * (eyeX + 0.03), eyeY - 0.045, eyeZ - 0.01], rot: [0, sx * 0.5, 0], glow: 1.5 });
      }
    }
  }
  // nose + mouth
  r.part('head', G.ellipsoid(0.014, 0.02, 0.016, 6, 5), darken(skin, 0.9), { pos: [0, eyeY - 0.07, eyeZ + 0.03] });
  if (!spec.extras?.includes('collar') && !spec.extras?.includes('mask')) {
    r.part('head', G.box(0.055, 0.009, 0.012), 0x6a2a2a, { pos: [0, eyeY - 0.13, headR * 0.84] });
  }

  if (glasses === 'round' || glasses === 'shades' || glasses === 'goggles') {
    const lens = glasses === 'shades' ? 0x101014 : glasses === 'goggles' ? 0x2a2c34 : 0x9ad8ff;
    for (const sx of [1, -1]) {
      r.part('head', G.torus(0.045, 0.007, 5, 14), 0x222228, { pos: [sx * eyeX, eyeY, eyeZ + 0.035] });
      r.part('head', G.ellipsoid(0.042, glasses === 'goggles' ? 0.028 : 0.04, 0.006, 10, 6), lens, { pos: [sx * eyeX, eyeY, eyeZ + 0.035], glow: glasses === 'round' ? 0.25 : 0.05 });
    }
    r.part('head', G.box(0.06, 0.008, 0.008), 0x222228, { pos: [0, eyeY + 0.005, eyeZ + 0.04] });
  }
  if (glasses === 'blindfold') {
    r.part('head', G.cyl(headR * 1.0, headR * 1.0, 0.09, 18, false), 0x111116, { pos: [0, eyeY + 0.01, 0.012], scale: [1, 1, 0.98] });
  }
  if (spec.extras?.includes('eyepatch')) {
    r.part('head', G.ellipsoid(0.05, 0.05, 0.015), 0x111111, { pos: [eyeX, eyeY, eyeZ + 0.03] });
  }
  if (spec.extras?.includes('collar') || spec.extras?.includes('mask')) {
    // high zip collar covering the mouth (Inumaki)
    r.part('head', G.cyl(headR * 0.8, headR * 0.7, 0.16, 16, false), spec.extras?.includes('mask') ? 0x1a1a1a : spec.top, { pos: [0, headR * 0.45, 0.03] });
  }
  if (spec.extras?.includes('facescar') || spec.extras?.includes('scars')) {
    r.part('head', G.box(0.012, 0.11, 0.01), darken(skin, 0.6), { pos: [-eyeX - 0.01, eyeY - 0.02, eyeZ + 0.03], rot: [0, 0, 0.3] });
  }
  if (spec.extras?.includes('stitches')) {
    for (let i = 0; i < 6; i++) {
      r.part('head', G.box(0.03, 0.006, 0.006), 0x2a2030, { pos: [-headR * 0.5 + i * 0.012, eyeY - 0.02 - i * 0.03, eyeZ + 0.02 - i * 0.004], rot: [0, 0, 0.6] });
    }
    r.part('head', G.box(0.008, 0.2, 0.008), 0x2a2030, { pos: [-headR * 0.42, eyeY - 0.05, eyeZ + 0.02], rot: [0, 0, 0.5] });
  }

  buildHair(r, spec, headR, hc);

  const model = r.build({ outline: spec.outline ?? 0.018 });
  const hm = model as Humanoid;
  hm.spec = spec;
  hm.hand = model.bones.handR;
  hm.handL = model.bones.handL;
  hm.anim = new HumanoidAnimator(hm);
  return hm;
}

const _dirQ = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
function eulerFromDir(dx: number, dy: number, dz: number): V3 {
  const d = new THREE.Vector3(dx, dy, dz).normalize();
  _dirQ.setFromUnitVectors(_up, d);
  const e = new THREE.Euler().setFromQuaternion(_dirQ);
  return [e.x, e.y, e.z];
}

/** Spherical helper: polar angle `pol` from the crown (0 = top), azimuth `az` from the front (+z). */
function sph(pol: number, az: number): V3 {
  return [Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)];
}

function buildHair(r: RigBuilder, spec: HumanoidSpec, headR: number, hc: V3) {
  const c = spec.hair;
  const R = headR * 1.06;
  const hi = lighten(c, 1.3);
  /** Partial sphere shell: polar range [p0,p1], azimuth centred on the back. */
  const shell = (p0: number, p1: number, backSpan: number, col = c, scale = 1.0, yOff = 0) => {
    const span = Math.min(Math.PI * 2, backSpan);
    // three's phi=0 is -x; front (+z) is phi = PI/2, back is 3PI/2.
    const g = new THREE.SphereGeometry(R * scale, 20, 12, 1.5 * Math.PI - span / 2, span, p0, p1 - p0);
    r.part('head', g, col, { pos: [hc[0], hc[1] + yOff, hc[2] - 0.005], topColor: lighten(col, 1.2) });
  };
  /** Cone spike rooted on the scalp, pointing along (surface normal + bias). */
  const spike = (pol: number, az: number, len: number, w: number, bias: V3 = [0, 0, 0], col = c, rootDepth = 0.75) => {
    const n = sph(pol, az);
    const d: V3 = [n[0] + bias[0], n[1] + bias[1], n[2] + bias[2]];
    const L = Math.hypot(d[0], d[1], d[2]);
    const u: V3 = [d[0] / L, d[1] / L, d[2] / L];
    const base: V3 = [n[0] * R * rootDepth, n[1] * R * rootDepth, n[2] * R * rootDepth];
    const ctr: V3 = [hc[0] + base[0] + u[0] * len * 0.5, hc[1] + base[1] + u[1] * len * 0.5, hc[2] + base[2] + u[2] * len * 0.5];
    r.part('head', G.cone(w, len, 6), col, { pos: ctr, rot: eulerFromDir(u[0], u[1], u[2]), topColor: hi });
  };
  /** Flat lock of hair (bang) hanging from the hairline. */
  const lock = (az: number, len: number, w: number, tiltOut = 0.5, col = c, pol = 0.95) => {
    const n = sph(pol, az);
    const d: V3 = [n[0] * tiltOut, -1, n[2] * tiltOut];
    const L = Math.hypot(d[0], d[1], d[2]);
    const u: V3 = [d[0] / L, d[1] / L, d[2] / L];
    const ctr: V3 = [hc[0] + n[0] * R * 0.98 + u[0] * len * 0.45, hc[1] + n[1] * R * 0.98 + u[1] * len * 0.45, hc[2] + n[2] * R * 0.98 + u[2] * len * 0.45];
    const g = G.cone(w, len, 6);
    g.rotateX(Math.PI); // point down
    g.scale(1, 1, 0.45);
    const e = eulerFromDir(-u[0], -u[1], -u[2]);
    r.part('head', g, col, { pos: ctr, rot: [e[0], e[1] + az * 0, e[2]], topColor: hi });
  };

  const TAUh = Math.PI * 2;
  switch (spec.hairStyle) {
    case 'yuji': {
      shell(0, 1.05, TAUh);                       // pink crown
      shell(1.0, 1.75, Math.PI * 1.25, 0x3a2626, 0.985); // dark undercut sides/back
      for (let i = 0; i < 12; i++) spike(0.35 + (i % 3) * 0.22, (i / 12) * TAUh, 0.13 + (i % 2) * 0.03, 0.05, [0, 0.9, 0]);
      for (let i = 0; i < 4; i++) spike(0.08, (i / 4) * TAUh, 0.12, 0.05, [0, 1.2, 0]);
      for (let i = -2; i <= 2; i++) spike(0.75, i * 0.3, 0.1, 0.04, [0, -0.2, 0.6]);
      break;
    }
    case 'megumi': {
      shell(0, 1.3, TAUh, c, 1.02);
      shell(1.2, 1.95, Math.PI * 1.3, c, 1.0);
      for (let i = 0; i < 22; i++) {
        const pol = 0.25 + (i % 4) * 0.3;
        const az = (i / 22) * TAUh + (i % 2) * 0.15;
        spike(pol, az, 0.17 + ((i * 7) % 5) * 0.025, 0.06, [0, 0.35, -0.25]);
      }
      for (let i = 0; i < 5; i++) spike(0.05, i * 1.25, 0.16, 0.055, [0, 0.6, -0.4]);
      for (let i = -3; i <= 3; i++) lock(i * 0.24, 0.13 - Math.abs(i) * 0.01, 0.035, 0.55, c, 0.9);
      break;
    }
    case 'nobara': {
      shell(0, 1.2, TAUh, c, 1.03);
      shell(0.9, 2.25, Math.PI * 1.45, c, 1.05);
      // flared ends at chin height
      for (let i = 0; i < 9; i++) {
        const az = Math.PI - 1.25 + (i / 8) * 2.5;
        const n = sph(2.15, az);
        r.part('head', G.ellipsoid(0.07, 0.05, 0.05, 8, 6), c, { pos: [hc[0] + n[0] * R * 1.08, hc[1] + n[1] * R * 1.05, hc[2] + n[2] * R * 1.08] });
      }
      // side-swept fringe
      for (let i = 0; i < 6; i++) lock(-0.75 + i * 0.25, 0.15 - i * 0.012, 0.045, 0.5, c, 0.85);
      break;
    }
    case 'gojo': {
      shell(0, 1.2, TAUh, c, 1.02);
      shell(1.1, 1.8, Math.PI * 1.3, c, 1.0);
      for (let i = 0; i < 20; i++) {
        const pol = 0.2 + (i % 4) * 0.25;
        const az = (i / 20) * TAUh;
        spike(pol, az, 0.2 + (i % 3) * 0.05, 0.065, [0, 0.9, -0.3]);
      }
      for (let i = -2; i <= 2; i++) spike(0.7, i * 0.3, 0.17, 0.05, [0, 1.3, 0.1]);
      break;
    }
    case 'nanami': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.7, Math.PI * 1.3, c, 1.0);
      r.part('head', G.ellipsoid(R * 0.75, R * 0.18, R * 0.5), c, { pos: [hc[0] - 0.05, hc[1] + R * 0.68, hc[2] + R * 0.45], rot: [0.45, 0, 0.25], topColor: hi });
      for (let i = 0; i < 3; i++) lock(0.3 + i * 0.2, 0.09, 0.03, 0.6, c, 0.85);
      break;
    }
    case 'maki': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.9, Math.PI * 1.3, c, 1.0);
      r.part('head', G.ellipsoid(0.06, 0.16, 0.06), c, { pos: [hc[0], hc[1] + R * 0.25, hc[2] - R * 1.1], rot: [-0.45, 0, 0], topColor: hi });
      for (let i = -3; i <= 3; i++) lock(i * 0.22, 0.12, 0.035, 0.55, c, 0.88);
      break;
    }
    case 'inumaki': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.75, Math.PI * 1.3, c, 1.0);
      for (let i = 0; i < 12; i++) spike(0.3 + (i % 3) * 0.25, (i / 12) * TAUh, 0.12, 0.055, [0, 0.5, 0]);
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.11, 0.035, 0.6, c, 0.88);
      break;
    }
    case 'shoko': {
      shell(0, 1.25, TAUh, c, 1.03);
      shell(0.9, 2.5, Math.PI * 1.4, c, 1.05);
      r.part('head', G.ellipsoid(R * 0.95, R * 0.9, R * 0.45), c, { pos: [hc[0], hc[1] - R * 0.95, hc[2] - R * 0.6], topColor: hi });
      for (let i = -2; i <= 3; i++) lock(i * 0.22, 0.14, 0.035, 0.5, c, 0.85);
      break;
    }
    case 'todo': {
      shell(0, 1.15, TAUh, c, 1.01);
      shell(1.0, 1.6, Math.PI * 1.3, c, 1.0);
      r.part('head', G.ellipsoid(0.075, 0.12, 0.075), c, { pos: [hc[0], hc[1] + R * 1.05, hc[2] - R * 0.35], topColor: hi });
      r.part('head', G.torus(0.055, 0.016, 6, 12), 0x8a2a2a, { pos: [hc[0], hc[1] + R * 0.9, hc[2] - R * 0.33], rot: [Math.PI / 2, 0, 0] });
      break;
    }
    case 'yaga': {
      shell(0, 0.9, TAUh, c, 1.0);
      shell(0.8, 1.5, Math.PI * 1.2, c, 0.99);
      r.part('head', G.ellipsoid(0.05, 0.05, 0.04), c, { pos: [0, hc[1] - R * 0.62, hc[2] + R * 0.62] });
      break;
    }
    case 'ijichi': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.7, Math.PI * 1.3, c, 1.0);
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.14, 0.04, 0.5, c, 0.85);
      break;
    }
    case 'junpei': {
      shell(0, 1.3, TAUh, c, 1.03);
      shell(1.1, 2.0, Math.PI * 1.4, c, 1.03);
      for (let i = -3; i <= 3; i++) lock(i * 0.2 - 0.15, 0.2 - Math.abs(i) * 0.01, 0.045, 0.45, c, 0.82);
      break;
    }
    case 'meimei': {
      shell(0, 1.25, TAUh, c, 1.03);
      shell(1.0, 1.9, Math.PI * 1.4, c, 1.03);
      for (let i = 0; i < 8; i++) r.part('head', G.ellipsoid(0.05, 0.065, 0.05), c, { pos: [0.02, hc[1] - 0.1 - i * 0.09, hc[2] - R * 1.0 - i * 0.012], topColor: hi });
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.12, 0.035, 0.5, c, 0.86);
      break;
    }
    case 'mahito': {
      shell(0, 1.25, TAUh, c, 1.03);
      shell(1.0, 2.4, Math.PI * 1.3, c, 1.05);
      for (const sx of [1, -1]) r.part('head', G.ellipsoid(0.04, 0.17, 0.04), c, { pos: [hc[0] + sx * R * 0.82, hc[1] - R * 0.7, hc[2] + R * 0.35], topColor: hi });
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.14, 0.035, 0.5, c, 0.86);
      break;
    }
    case 'geto': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.8, Math.PI * 1.3, c, 1.0);
      r.part('head', G.sphere(0.08, 10, 8), c, { pos: [0, hc[1] + R * 0.5, hc[2] - R * 0.95] });
      r.part('head', G.ellipsoid(0.03, 0.15, 0.02), c, { pos: [hc[0] - R * 0.55, hc[1] - R * 0.1, hc[2] + R * 0.82], rot: [0, 0, -0.1] });
      break;
    }
    case 'miwa': {
      shell(0, 1.25, TAUh, c, 1.03);
      shell(0.95, 2.6, Math.PI * 1.45, c, 1.05);
      for (let i = -3; i <= 3; i++) lock(i * 0.22, 0.13, 0.035, 0.5, c, 0.86);
      break;
    }
    case 'bun': {
      shell(0, 1.25, TAUh, c, 1.02);
      shell(1.1, 1.8, Math.PI * 1.3, c, 1.0);
      r.part('head', G.sphere(0.085, 10, 8), c, { pos: [0, hc[1] + R * 0.75, hc[2] - R * 0.75], topColor: hi });
      break;
    }
    case 'long': {
      shell(0, 1.25, TAUh, c, 1.03);
      shell(0.95, 2.6, Math.PI * 1.4, c, 1.05);
      r.part('head', G.ellipsoid(R * 0.95, R * 1.0, R * 0.4), c, { pos: [hc[0], hc[1] - R * 1.05, hc[2] - R * 0.6], topColor: hi });
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.12, 0.035, 0.5, c, 0.86);
      break;
    }
    case 'short':
      shell(0, 1.2, TAUh, c, 1.02);
      shell(1.1, 1.7, Math.PI * 1.3, c, 1.0);
      for (let i = -2; i <= 2; i++) lock(i * 0.25, 0.09, 0.035, 0.6, c, 0.88);
      break;
    case 'bald':
      break;
  }
}

export function darken(hex: number, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c.getHex();
}
export function lighten(hex: number, f: number) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f + 0.02); c.g = Math.min(1, c.g * f + 0.02); c.b = Math.min(1, c.b * f + 0.02);
  return c.getHex();
}

// ------------------------------------------------------------------------
// Procedural animation
// ------------------------------------------------------------------------

export type ActionName =
  | 'punch1' | 'punch2' | 'punch3' | 'kick' | 'spinKick' | 'uppercut' | 'slam' | 'dash'
  | 'slash1' | 'slash2' | 'slash3' | 'thrust' | 'spin'
  | 'throw' | 'cast' | 'castUp' | 'summon' | 'hammer' | 'clap' | 'hit' | 'die' | 'victory'
  | 'channel' | 'domain' | 'pointUp' | 'wave' | 'bow' | 'sit';

export class HumanoidAnimator {
  m: Humanoid;
  walkPhase = 0;
  speed = 0;          // current move speed (units/s)
  action: ActionName | null = null;
  actionT = 0;        // 0..1 progress
  actionDur = 0.3;
  hitT = 0;
  dead = false;
  deadT = 0;
  idleT = Math.random() * 10;
  stance: 'fist' | 'blade' | 'hammer' | 'none' = 'none';
  lean = 0;
  blend = 0;          // smooths in/out of actions

  constructor(m: Humanoid) { this.m = m; }

  play(a: ActionName, dur: number) {
    this.action = a;
    this.actionT = 0;
    this.actionDur = Math.max(0.05, dur);
  }

  update(dt: number) {
    const m = this.m;
    resetPose(m);
    const b = m.bones;
    this.idleT += dt;
    const sp = this.speed;
    const moving = sp > 0.3;
    if (moving) this.walkPhase += dt * (4 + sp * 1.55);
    const run = clamp(sp / 6, 0, 1);
    const ph = this.walkPhase;

    // ---- locomotion ----
    if (moving && !this.dead) {
      const sw = Math.sin(ph);
      const amp = lerp(0.55, 0.95, run);
      b.legUpL.rotation.x = sw * amp;
      b.legUpR.rotation.x = -sw * amp;
      b.legLowL.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.3 + 0.1;
      b.legLowR.rotation.x = Math.max(0, Math.cos(ph)) * amp * 1.3 + 0.1;
      b.armUpL.rotation.x = -sw * amp * 0.8;
      b.armUpR.rotation.x = sw * amp * 0.8;
      b.armLowL.rotation.x = -0.4 - run * 0.7;
      b.armLowR.rotation.x = -0.4 - run * 0.7;
      b.hips.position.y += Math.abs(Math.cos(ph)) * 0.05 * (0.5 + run);
      b.spine.rotation.x = 0.08 + run * 0.18;
      b.hips.rotation.y = sw * 0.12;
      b.chest.rotation.y = -sw * 0.18;
      b.head.rotation.x = -0.05 - run * 0.1;
    } else if (!this.dead) {
      // idle breathing + guard stance
      const br = Math.sin(this.idleT * 2.2);
      b.chest.rotation.x = br * 0.025;
      b.hips.position.y -= 0.01 + br * 0.006;
      b.armUpL.rotation.z = 0.12 + br * 0.02;
      b.armUpR.rotation.z = -0.12 - br * 0.02;
      if (this.stance === 'fist') {
        b.legUpL.rotation.x = -0.25; b.legLowL.rotation.x = 0.35;
        b.legUpR.rotation.x = 0.2; b.legLowR.rotation.x = 0.25;
        b.armUpL.rotation.x = -0.7; b.armLowL.rotation.x = -1.6;
        b.armUpR.rotation.x = -0.4; b.armLowR.rotation.x = -1.8;
        b.hips.position.y -= 0.04;
        b.chest.rotation.y = 0.2;
      } else if (this.stance === 'blade') {
        b.armUpR.rotation.x = -0.4; b.armLowR.rotation.x = -0.6;
        b.legUpL.rotation.x = -0.15; b.legUpR.rotation.x = 0.15;
      } else if (this.stance === 'hammer') {
        b.armUpR.rotation.x = -0.15; b.armLowR.rotation.x = -0.9;
        b.armUpL.rotation.x = -0.2; b.armLowL.rotation.x = -0.4;
      }
      b.head.rotation.y = Math.sin(this.idleT * 0.4) * 0.15;
    }

    // ---- actions ----
    if (this.action && !this.dead) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) { this.action = null; this.actionT = 0; }
      else this.applyAction(this.action, this.actionT);
    }

    // ---- hit flinch ----
    if (this.hitT > 0) {
      this.hitT -= dt;
      const k = Math.max(0, this.hitT / 0.25);
      b.spine.rotation.x -= k * 0.35;
      b.head.rotation.x -= k * 0.3;
      b.armUpL.rotation.z += k * 0.5;
      b.armUpR.rotation.z -= k * 0.5;
    }

    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 2.2);
      const k = this.deadT;
      b.hips.rotation.x = -k * 1.45;
      b.hips.position.y = lerp(m.rest.hips.pos.y, 0.22, k);
      b.armUpL.rotation.z = k * 1.2; b.armUpR.rotation.z = -k * 1.2;
      b.legUpL.rotation.x = k * 0.3;
      b.head.rotation.x = -k * 0.4;
    }
  }

  private applyAction(a: ActionName, t: number) {
    const b = this.m.bones;
    // windup (0..0.35) -> strike (0.35..0.6) -> recover
    const wind = clamp(t / 0.35, 0, 1);
    const strike = clamp((t - 0.3) / 0.25, 0, 1);
    const rec = clamp((t - 0.6) / 0.4, 0, 1);
    const pose = (w: number, s: number) => (t < 0.3 ? w * wind : lerp(w, s, strike)) * (1 - rec) + 0;
    switch (a) {
      case 'punch1': case 'punch3': {
        const R = a === 'punch1';
        const up = R ? b.armUpR : b.armUpL, low = R ? b.armLowR : b.armLowL;
        up.rotation.x = pose(-0.2, -1.55);
        low.rotation.x = pose(-1.9, -0.05);
        up.rotation.z = (R ? 1 : -1) * pose(0, 0.15);
        b.chest.rotation.y = (R ? 1 : -1) * pose(-0.5, 0.55);
        b.spine.rotation.x = pose(0, 0.2);
        b.legUpL.rotation.x = -0.3 * (1 - rec); b.legUpR.rotation.x = 0.3 * (1 - rec);
        break;
      }
      case 'punch2': {
        b.armUpL.rotation.x = pose(-0.2, -1.55);
        b.armLowL.rotation.x = pose(-1.9, -0.05);
        b.chest.rotation.y = pose(0.5, -0.55);
        b.spine.rotation.x = pose(0, 0.2);
        break;
      }
      case 'kick': {
        b.legUpR.rotation.x = pose(0.3, -1.6);
        b.legLowR.rotation.x = pose(1.4, 0.05);
        b.spine.rotation.x = pose(0, -0.3);
        b.armUpL.rotation.x = pose(0, -0.6);
        b.armUpR.rotation.z = pose(0, -0.8);
        break;
      }
      case 'spinKick': {
        b.hips.rotation.y = t * TAU;
        b.legUpR.rotation.z = -1.3 * Math.sin(t * Math.PI);
        b.legUpR.rotation.x = -0.4 * Math.sin(t * Math.PI);
        b.armUpL.rotation.z = 1.0 * Math.sin(t * Math.PI);
        b.armUpR.rotation.z = -1.0 * Math.sin(t * Math.PI);
        b.hips.position.y += 0.2 * Math.sin(t * Math.PI);
        break;
      }
      case 'uppercut': {
        b.armUpR.rotation.x = pose(0.4, -2.9);
        b.armLowR.rotation.x = pose(-2.0, -0.4);
        b.legUpL.rotation.x = pose(0.4, -0.2);
        b.legLowL.rotation.x = pose(0.8, 0.1);
        b.hips.position.y += pose(-0.12, 0.15);
        b.spine.rotation.x = pose(0.3, -0.3);
        break;
      }
      case 'slam': {
        b.armUpL.rotation.x = pose(-2.9, -0.9);
        b.armUpR.rotation.x = pose(-2.9, -0.9);
        b.armLowL.rotation.x = pose(-0.4, -0.1);
        b.armLowR.rotation.x = pose(-0.4, -0.1);
        b.hips.position.y += pose(0.25, -0.22);
        b.spine.rotation.x = pose(-0.3, 0.6);
        b.legUpL.rotation.x = pose(-0.4, -0.9); b.legLowL.rotation.x = pose(0.6, 1.2);
        b.legUpR.rotation.x = pose(-0.4, 0.4); b.legLowR.rotation.x = pose(0.6, 0.9);
        break;
      }
      case 'dash': {
        b.spine.rotation.x = 0.5;
        b.armUpR.rotation.x = -1.5; b.armLowR.rotation.x = -0.1;
        b.armUpL.rotation.x = 0.8; b.armLowL.rotation.x = -0.6;
        b.legUpL.rotation.x = -0.9; b.legLowL.rotation.x = 1.0;
        b.legUpR.rotation.x = 0.6; b.legLowR.rotation.x = 0.4;
        break;
      }
      case 'slash1': case 'slash3': {
        const k = a === 'slash1' ? 1 : -1;
        b.armUpR.rotation.x = pose(-2.6, -0.6);
        b.armUpR.rotation.z = pose(-0.6 * k, 0.6 * k);
        b.armLowR.rotation.x = pose(-0.6, -0.2);
        b.chest.rotation.y = pose(0.6 * k, -0.7 * k);
        b.spine.rotation.x = pose(-0.1, 0.25);
        break;
      }
      case 'slash2': {
        b.armUpR.rotation.x = pose(-1.4, -1.4);
        b.armUpR.rotation.z = pose(-1.2, 0.9);
        b.armLowR.rotation.x = pose(-0.3, -0.1);
        b.chest.rotation.y = pose(0.9, -0.9);
        break;
      }
      case 'thrust': {
        b.armUpR.rotation.x = pose(-0.6, -1.6);
        b.armLowR.rotation.x = pose(-1.6, 0);
        b.spine.rotation.x = pose(-0.1, 0.3);
        b.legUpL.rotation.x = pose(0, -0.6); b.legLowL.rotation.x = pose(0, 0.5);
        break;
      }
      case 'spin': {
        b.hips.rotation.y = t * TAU * 1.5;
        b.armUpR.rotation.z = -1.4; b.armUpL.rotation.z = 1.4;
        b.armUpR.rotation.x = -0.2;
        break;
      }
      case 'throw': {
        b.armUpR.rotation.x = pose(-3.0, -1.3);
        b.armLowR.rotation.x = pose(-1.2, -0.1);
        b.chest.rotation.y = pose(0.5, -0.4);
        b.armUpL.rotation.x = pose(-1.0, 0.3);
        b.spine.rotation.x = pose(-0.15, 0.25);
        break;
      }
      case 'hammer': {
        b.armUpR.rotation.x = pose(-3.1, -0.8);
        b.armLowR.rotation.x = pose(-0.9, -0.1);
        b.armUpL.rotation.x = pose(-1.2, -0.7);
        b.armLowL.rotation.x = pose(-1.0, -0.5);
        b.spine.rotation.x = pose(-0.25, 0.45);
        b.legUpL.rotation.x = pose(0, -0.5); b.legLowL.rotation.x = pose(0, 0.5);
        break;
      }
      case 'cast': {
        b.armUpL.rotation.x = pose(-0.8, -1.5);
        b.armUpR.rotation.x = pose(-0.8, -1.5);
        b.armUpL.rotation.z = pose(0, -0.25);
        b.armUpR.rotation.z = pose(0, 0.25);
        b.armLowL.rotation.x = pose(-1.0, -0.1);
        b.armLowR.rotation.x = pose(-1.0, -0.1);
        break;
      }
      case 'castUp': {
        b.armUpR.rotation.x = pose(-1.5, -3.0);
        b.armLowR.rotation.x = pose(-0.6, 0);
        b.armUpL.rotation.z = pose(0.3, 0.5);
        b.head.rotation.x = pose(0, -0.4);
        break;
      }
      case 'summon': {
        // hand-sign: hands together in front of chest
        b.armUpL.rotation.x = -0.9; b.armUpR.rotation.x = -0.9;
        b.armUpL.rotation.z = -0.55; b.armUpR.rotation.z = 0.55;
        b.armLowL.rotation.x = -1.3; b.armLowR.rotation.x = -1.3;
        b.armLowL.rotation.z = -0.3; b.armLowR.rotation.z = 0.3;
        b.head.rotation.x = 0.15;
        b.hips.position.y -= 0.05 * Math.sin(t * Math.PI);
        break;
      }
      case 'clap': {
        const c = Math.sin(t * Math.PI);
        b.armUpL.rotation.x = -1.4; b.armUpR.rotation.x = -1.4;
        b.armUpL.rotation.z = -0.6 * c; b.armUpR.rotation.z = 0.6 * c;
        b.armLowL.rotation.x = -0.3; b.armLowR.rotation.x = -0.3;
        break;
      }
      case 'channel': {
        const w = Math.sin(this.idleT * 18) * 0.05;
        b.armUpL.rotation.x = -0.6 + w; b.armUpR.rotation.x = -0.6 - w;
        b.armUpL.rotation.z = 0.7; b.armUpR.rotation.z = -0.7;
        b.armLowL.rotation.x = -0.8; b.armLowR.rotation.x = -0.8;
        b.hips.position.y -= 0.08;
        b.legUpL.rotation.x = -0.3; b.legLowL.rotation.x = 0.5; b.legUpR.rotation.x = -0.3; b.legLowR.rotation.x = 0.5;
        b.legUpL.rotation.z = 0.25; b.legUpR.rotation.z = -0.25;
        break;
      }
      case 'domain': {
        // Hand sign raised to the face
        const k = clamp(t * 4, 0, 1);
        b.armUpR.rotation.x = -1.7 * k; b.armLowR.rotation.x = -1.4 * k;
        b.armUpR.rotation.z = 0.35 * k;
        b.armUpL.rotation.x = -1.2 * k; b.armLowL.rotation.x = -1.6 * k;
        b.armUpL.rotation.z = -0.4 * k;
        b.head.rotation.x = -0.1 * k;
        break;
      }
      case 'pointUp': {
        b.armUpR.rotation.x = -2.8; b.armLowR.rotation.x = -0.1;
        break;
      }
      case 'wave': {
        b.armUpR.rotation.z = -2.5; b.armLowR.rotation.z = Math.sin(t * TAU * 3) * 0.5;
        break;
      }
      case 'bow': {
        b.spine.rotation.x = Math.sin(t * Math.PI) * 0.8;
        break;
      }
      case 'victory': {
        const k = Math.sin(t * Math.PI);
        b.armUpR.rotation.x = -2.9 * k;
        b.armUpL.rotation.z = 0.4 * k;
        b.hips.position.y += 0.15 * k;
        break;
      }
      case 'hit': {
        const k = Math.sin(t * Math.PI);
        b.spine.rotation.x = -0.4 * k;
        b.head.rotation.x = -0.35 * k;
        break;
      }
      case 'sit': {
        b.legUpL.rotation.x = -1.5; b.legUpR.rotation.x = -1.5;
        b.legLowL.rotation.x = 1.5; b.legLowR.rotation.x = 1.5;
        b.hips.position.y -= 0.4;
        break;
      }
      case 'die':
        break;
    }
  }
}
