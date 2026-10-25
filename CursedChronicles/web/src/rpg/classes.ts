// Playable sorcerer definitions: base stats, growth and basic-attack combos.
import { Attr, ClassId } from './types';

export interface ComboHit {
  anim: string;
  dur: number;
  mult: number;
  range: number;
  arc: number;          // radians of the hit cone
  sfx: string;
  swingSfx?: string;
  projectile?: 'nail';
  knock?: number;
  lunge?: number;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  model: string;
  stance: 'fist' | 'blade' | 'hammer';
  desc: string;
  base: { hp: number; hpLv: number; ce: number; ceLv: number; atk: number; atkLv: number; def: number; defLv: number };
  attrs: Record<Attr, number>;
  /** how attributes contribute to attack */
  atkScale: Partial<Record<Attr, number>>;
  bfBonus: number;
  combo: ComboHit[];
  startGear: string[];
  color: string;
  weaponModel: 'fist' | 'blade' | 'hammer';
}

export const CLASSES: Record<ClassId, ClassDef> = {
  yuji: {
    id: 'yuji', name: 'Yuji Itadori', title: 'The Vessel', model: 'yuji', stance: 'fist', color: '#ff7a9a',
    desc: 'Close-range brawler with monstrous physical strength. Fast combos, Divergent Fist and the highest Black Flash affinity. Ultimate: Sukuna takes the wheel.',
    base: { hp: 150, hpLv: 24, ce: 60, ceLv: 4, atk: 14, atkLv: 3.3, def: 6, defLv: 1.3 },
    attrs: { str: 9, dex: 6, vit: 8, ce: 3 },
    atkScale: { str: 2.0 },
    bfBonus: 0.03,
    combo: [
      { anim: 'punch1', dur: 0.26, mult: 0.9, range: 1.8, arc: 1.6, sfx: 'punch', swingSfx: 'swing', lunge: 0.6 },
      { anim: 'punch2', dur: 0.26, mult: 0.95, range: 1.8, arc: 1.6, sfx: 'punch', swingSfx: 'swing', lunge: 0.6 },
      { anim: 'kick', dur: 0.42, mult: 1.5, range: 2.2, arc: 2.2, sfx: 'kick', swingSfx: 'swingHeavy', knock: 2.5, lunge: 0.9 },
    ],
    startGear: ['wraps', 'uniform', 'sneakers'],
    weaponModel: 'fist',
  },
  megumi: {
    id: 'megumi', name: 'Megumi Fushiguro', title: 'Ten Shadows', model: 'megumi', stance: 'blade', color: '#7a8aff',
    desc: 'Shikigami summoner and swordsman. Divine Dogs, Nue, Toad and Max Elephant fight beside you. Ultimate: Domain Expansion — Chimera Shadow Garden.',
    base: { hp: 120, hpLv: 19, ce: 95, ceLv: 6.5, atk: 13, atkLv: 3.0, def: 5, defLv: 1.0 },
    attrs: { str: 6, dex: 7, vit: 5, ce: 9 },
    atkScale: { str: 1.3, ce: 0.8 },
    bfBonus: 0,
    combo: [
      { anim: 'slash1', dur: 0.3, mult: 1.0, range: 2.2, arc: 2.0, sfx: 'slash', swingSfx: 'swing', lunge: 0.4 },
      { anim: 'slash2', dur: 0.3, mult: 1.0, range: 2.2, arc: 2.4, sfx: 'slash', swingSfx: 'swing', lunge: 0.4 },
      { anim: 'thrust', dur: 0.4, mult: 1.4, range: 2.8, arc: 0.9, sfx: 'slash', swingSfx: 'swingHeavy', knock: 1.5, lunge: 1.0 },
    ],
    startGear: ['tanto', 'uniform', 'sneakers'],
    weaponModel: 'blade',
  },
  nobara: {
    id: 'nobara', name: 'Nobara Kugisaki', title: 'Straw Doll', model: 'nobara', stance: 'hammer', color: '#ffa04a',
    desc: 'Mid-range technician. Throws cursed nails, then detonates them with Hairpin and Resonance through her straw doll. Ultimate: Resonance — Thousand Nails.',
    base: { hp: 115, hpLv: 18, ce: 85, ceLv: 5.5, atk: 12, atkLv: 3.1, def: 4, defLv: 0.95 },
    attrs: { str: 6, dex: 9, vit: 5, ce: 6 },
    atkScale: { str: 1.4, dex: 0.7 },
    bfBonus: 0.01,
    combo: [
      { anim: 'throw', dur: 0.3, mult: 0.85, range: 9, arc: 0.6, sfx: 'nail', projectile: 'nail' },
      { anim: 'throw', dur: 0.3, mult: 0.85, range: 9, arc: 0.6, sfx: 'nail', projectile: 'nail' },
      { anim: 'hammer', dur: 0.45, mult: 1.35, range: 2.4, arc: 2.2, sfx: 'hammer', swingSfx: 'swingHeavy', knock: 2.2, lunge: 0.6 },
    ],
    startGear: ['carpHammer', 'uniform', 'sneakers'],
    weaponModel: 'hammer',
  },
};

export const LEVEL_CAP = 50;
export function expToNext(level: number) {
  return Math.floor(40 * Math.pow(level, 1.75) + 60 * level);
}
