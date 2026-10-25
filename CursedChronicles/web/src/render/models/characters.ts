// Character appearance specs for every sorcerer, NPC and human boss.
import * as THREE from 'three';
import { G } from '../geo';
import { RigBuilder } from '../rig';
import { buildHumanoid, Humanoid, HumanoidAnimator, HumanoidSpec } from './humanoid';

const NAVY = 0x1b1f33;
const GOLD = 0xe0b84e;

export const SPECS: Record<string, HumanoidSpec> = {
  yuji: {
    skin: 0xf3c9a6, hair: 0xf28da0, hairStyle: 'yuji', eyes: 0x7a4128, outfit: 'uniformHood',
    top: NAVY, bottom: NAVY, accent: GOLD, shoes: 0xd23a3a, inner: 0xc3262f, bulk: 1.05,
  },
  megumi: {
    skin: 0xf1d3b8, hair: 0x15171f, hairStyle: 'megumi', eyes: 0x2f5866, outfit: 'uniform',
    top: 0x181b2b, bottom: 0x181b2b, accent: GOLD, shoes: 0x16161a,
  },
  nobara: {
    skin: 0xf7d5bb, hair: 0xd9773a, hairStyle: 'nobara', eyes: 0x8c5a2e, outfit: 'uniformSkirt',
    top: NAVY, bottom: NAVY, accent: GOLD, shoes: 0x4a2e22, height: 0.95, bulk: 0.9,
  },
  gojo: {
    skin: 0xf6dcc8, hair: 0xf3f6fb, hairStyle: 'gojo', eyes: 0x7fdcff, outfit: 'uniformHigh',
    top: 0x12141f, bottom: 0x12141f, accent: 0x12141f, shoes: 0x0e0e12, glasses: 'blindfold', height: 1.14,
  },
  nanami: {
    skin: 0xf0cfb0, hair: 0xe9d07b, hairStyle: 'nanami', eyes: 0x5a6a3a, outfit: 'suit',
    top: 0xd2c9ab, bottom: 0xd2c9ab, accent: 0xd2c9ab, shoes: 0x3a2a22, inner: 0xc7973a,
    glasses: 'goggles', height: 1.1, bulk: 1.18, extras: ['tie'],
  },
  maki: {
    skin: 0xf2d4b8, hair: 0x2b4a3c, hairStyle: 'maki', eyes: 0x6a5a2a, outfit: 'uniform',
    top: NAVY, bottom: NAVY, accent: GOLD, shoes: 0x1a1a1e, glasses: 'round',
  },
  inumaki: {
    skin: 0xf3d8c2, hair: 0xe9e6de, hairStyle: 'inumaki', eyes: 0x7a6aa0, outfit: 'uniformHigh',
    top: NAVY, bottom: NAVY, accent: NAVY, shoes: 0x1a1a1e, extras: ['collar'], height: 0.96,
  },
  shoko: {
    skin: 0xf1d6c0, hair: 0x5a3b2c, hairStyle: 'shoko', eyes: 0x4a3a32, outfit: 'labcoat',
    top: 0xeeeeea, bottom: 0x24242a, accent: 0xdddddd, shoes: 0x1e1e22, inner: 0x2a2a30,
  },
  yaga: {
    skin: 0xd9b090, hair: 0x2a2420, hairStyle: 'yaga', eyes: 0x222222, outfit: 'casual',
    top: 0x2a2a2e, bottom: 0x22222a, accent: 0x2a2a2e, shoes: 0x111111, glasses: 'shades', height: 1.12, bulk: 1.4,
  },
  ijichi: {
    skin: 0xf0d4bc, hair: 0x2a2620, hairStyle: 'ijichi', eyes: 0x333333, outfit: 'suit',
    top: 0x1f1f25, bottom: 0x1f1f25, accent: 0x1f1f25, shoes: 0x111111, inner: 0x2c2c38,
    glasses: 'round', bulk: 0.9, extras: ['tie'],
  },
  todo: {
    skin: 0xd8a882, hair: 0x2c201a, hairStyle: 'todo', eyes: 0x3a2a20, outfit: 'tank',
    top: 0xf0f0ea, bottom: 0x2c2c3a, accent: 0x2c2c3a, shoes: 0x16161a, height: 1.16, bulk: 1.5, extras: ['facescar'],
  },
  meimei: {
    skin: 0xf4dccb, hair: 0xe4e0db, hairStyle: 'meimei', eyes: 0x6a6a7a, outfit: 'robe',
    top: 0x15151b, bottom: 0x15151b, accent: 0x15151b, shoes: 0x0f0f12, height: 1.06,
  },
  junpei: {
    skin: 0xefd6c4, hair: 0x2a2a34, hairStyle: 'junpei', eyes: 0x3a3a48, outfit: 'casual',
    top: 0x23232b, bottom: 0x23232b, accent: 0x23232b, shoes: 0x2a2a30,
  },
  miwa: {
    skin: 0xf6dccb, hair: 0x5f8fd8, hairStyle: 'miwa', eyes: 0x3a5a9a, outfit: 'suit',
    top: 0x22242c, bottom: 0x22242c, accent: 0x22242c, shoes: 0x111111, inner: 0x3a5a9a, height: 0.95, bulk: 0.88,
  },
  mahito: {
    skin: 0xdcdcd2, hair: 0x7f8fa6, hairStyle: 'mahito', eyes: 0x7ac0dc, outfit: 'patchwork',
    top: 0x2b2a35, bottom: 0x2b2a35, accent: 0x2b2a35, shoes: 0x1a1a20, extras: ['stitches', 'cursedEyes'], height: 1.04,
  },
  sukuna: {
    skin: 0xf0c4a2, hair: 0xe57b90, hairStyle: 'yuji', eyes: 0xff2a3a, outfit: 'kimono',
    top: 0xeeeae0, bottom: 0xeeeae0, accent: 0x111111, shoes: 0x1a1a1a, height: 1.35, bulk: 1.35,
    extras: ['sukunaMarks', 'cursedEyes'],
  },
  civilianA: { skin: 0xf0d0b0, hair: 0x2a2420, hairStyle: 'short', eyes: 0x333333, outfit: 'casual', top: 0x5a6a8a, bottom: 0x2a2e3a, accent: 0x5a6a8a, shoes: 0x333333 },
  civilianB: { skin: 0xe8c8a8, hair: 0x6a4a30, hairStyle: 'long', eyes: 0x4a3020, outfit: 'casual', top: 0xb05a6a, bottom: 0x302a2a, accent: 0xb05a6a, shoes: 0x3a2a2a, bulk: 0.9 },
  civilianC: { skin: 0xd8b090, hair: 0x111111, hairStyle: 'bun', eyes: 0x222222, outfit: 'suit', top: 0x3a3a40, bottom: 0x3a3a40, accent: 0x3a3a40, shoes: 0x111111, inner: 0x7a2a2a, extras: ['tie'] },
  student: { skin: 0xf0d4bc, hair: 0x2a2018, hairStyle: 'short', eyes: 0x333333, outfit: 'uniformHigh', top: 0x1a1a22, bottom: 0x1a1a22, accent: GOLD, shoes: 0x222222 },
};

export function buildCharacter(id: string): Humanoid {
  if (id === 'panda') return buildPanda();
  const spec = SPECS[id] ?? SPECS.civilianA;
  const h = buildHumanoid(spec);
  if (id === 'sukuna') addSukunaArms(h);
  return h;
}

/** Panda: same skeleton as a humanoid so the shared animator drives him. */
function buildPanda(): Humanoid {
  const r = new RigBuilder();
  const hipY = 0.78;
  r.bone('hips', 'root', [0, hipY, 0]);
  r.bone('spine', 'hips', [0, 0.05, 0]);
  r.bone('chest', 'spine', [0, 0.3, 0]);
  r.bone('neck', 'chest', [0, 0.32, 0]);
  r.bone('head', 'neck', [0, 0.05, 0]);
  for (const s of ['L', 'R'] as const) {
    const sx = s === 'L' ? 1 : -1;
    r.bone('armUp' + s, 'chest', [sx * 0.38, 0.2, 0]);
    r.bone('armLow' + s, 'armUp' + s, [0, -0.28, 0]);
    r.bone('hand' + s, 'armLow' + s, [0, -0.26, 0]);
    r.bone('legUp' + s, 'hips', [sx * 0.2, -0.05, 0]);
    r.bone('legLow' + s, 'legUp' + s, [0, -0.36, 0]);
    r.bone('foot' + s, 'legLow' + s, [0, -0.3, 0]);
  }
  const W = 0xf4f2ee, K = 0x18181c;
  r.part('spine', G.ellipsoid(0.42, 0.42, 0.36, 18, 14), W, { pos: [0, 0.18, 0] });
  r.part('chest', G.ellipsoid(0.46, 0.3, 0.38, 18, 12), K, { pos: [0, 0.12, 0] });
  r.part('neck', G.cyl(0.18, 0.22, 0.1, 12), W);
  r.part('head', G.ellipsoid(0.3, 0.27, 0.27, 18, 14), W, { pos: [0, 0.24, 0] });
  for (const sx of [1, -1]) {
    r.part('head', G.sphere(0.1, 10, 8), K, { pos: [sx * 0.22, 0.46, -0.02] });
    r.part('head', G.ellipsoid(0.075, 0.06, 0.03, 10, 6), K, { pos: [sx * 0.11, 0.27, 0.24], rot: [0, 0, sx * 0.4] });
    r.part('head', G.sphere(0.022, 6, 5), 0xffffff, { pos: [sx * 0.11, 0.28, 0.265], glow: 0.1 });
  }
  r.part('head', G.ellipsoid(0.11, 0.08, 0.09, 10, 8), W, { pos: [0, 0.16, 0.22] });
  r.part('head', G.ellipsoid(0.04, 0.03, 0.03, 8, 6), K, { pos: [0, 0.2, 0.31] });
  // scar
  r.part('head', G.box(0.012, 0.12, 0.012), 0x8a6a6a, { pos: [-0.16, 0.3, 0.2], rot: [0, 0, 0.4] });
  for (const s of ['L', 'R'] as const) {
    r.part('armUp' + s, G.limb(0.13, 0.12, 0.28), K);
    r.part('armLow' + s, G.limb(0.12, 0.11, 0.24), K);
    r.part('hand' + s, G.sphere(0.12, 10, 8), K, { pos: [0, -0.05, 0] });
    r.part('legUp' + s, G.limb(0.16, 0.14, 0.36), K);
    r.part('legLow' + s, G.limb(0.14, 0.13, 0.28), K);
    r.part('foot' + s, G.ellipsoid(0.14, 0.08, 0.18, 10, 6), K, { pos: [0, 0, 0.04] });
  }
  const m = r.build({ outline: 0.02 }) as Humanoid;
  m.spec = SPECS.civilianA;
  m.hand = m.bones.handR;
  m.handL = m.bones.handL;
  m.anim = new HumanoidAnimator(m);
  return m;
}

/** Heian-era Sukuna gets a second pair of arms; we mirror the main arm poses onto them. */
function addSukunaArms(h: Humanoid) {
  const extra = new THREE.Group();
  const mat = h.mesh.material as THREE.Material;
  for (const s of ['L', 'R'] as const) {
    const sx = s === 'L' ? 1 : -1;
    const r = new RigBuilder();
    r.bone('up', 'root', [0, 0, 0]);
    r.bone('low', 'up', [0, -0.35, 0]);
    r.part('up', G.limb(0.09, 0.08, 0.35), 0xeeeae0);
    r.part('low', G.limb(0.08, 0.065, 0.3), 0xf0c4a2);
    r.part('low', G.ellipsoid(0.07, 0.085, 0.055), 0xf0c4a2, { pos: [0, -0.33, 0] });
    for (let i = 0; i < 2; i++) r.part('low', G.box(0.13, 0.012, 0.012), 0x111111, { pos: [0, -0.12 - i * 0.06, 0.06] });
    const arm = r.build({ outline: 0.02 });
    arm.root.position.set(sx * 0.3, -0.12, -0.02);
    arm.root.userData.side = s;
    arm.root.userData.rig = arm;
    h.bones.chest.add(arm.root);
    void mat;
  }
  void extra;
  const orig = h.anim.update.bind(h.anim);
  h.anim.update = (dt: number) => {
    orig(dt);
    h.bones.chest.children.forEach(c => {
      const rig = c.userData.rig;
      if (!rig) return;
      const s = c.userData.side as 'L' | 'R';
      const src = h.bones['armUp' + s], srcLow = h.bones['armLow' + s];
      rig.bones.up.rotation.set(src.rotation.x * 0.7 - 0.4, 0, src.rotation.z + (s === 'L' ? 0.5 : -0.5));
      rig.bones.low.rotation.set(srcLow.rotation.x * 0.8 - 0.5, 0, 0);
    });
  };
}
