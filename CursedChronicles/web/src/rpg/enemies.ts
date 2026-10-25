// Cursed spirit roster. Stats scale with level and grade; bosses add patterns
// implemented in entities/Boss.ts.

export type AiKind = 'melee' | 'ranged' | 'flyer' | 'bomber' | 'stationary' | 'charger' | 'boss' | 'dummy';

export interface EnemyAttack {
  kind: 'melee' | 'lunge' | 'projectile' | 'explode' | 'aoe';
  range: number;
  cd: number;
  windup: number;
  mult: number;
  radius?: number;
  proj?: 'spit' | 'thorn' | 'water' | 'orb' | 'seed' | 'fireball' | 'ember';
  projSpeed?: number;
  anim?: string;
  sfx?: string;
  color?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  grade: 4 | 3 | 2 | 1 | 0;
  model: string;      // creature kind or 'char:<id>'
  scale: number;
  level: number;
  hpMul: number;
  atkMul: number;
  defMul: number;
  speed: number;
  radius: number;
  ai: AiKind;
  attack: EnemyAttack;
  aggro: number;
  boss?: string;      // boss script id
  drops?: { item: string; chance: number }[];
  voice?: string;     // sfx on aggro
  deathSfx?: string;
  flying?: boolean;
  noKnock?: boolean;
}

export const GRADE_NAME = ['Special Grade', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'];
export const GRADE_COLOR = ['#ff3a4a', '#ff9a3a', '#c07aff', '#5ab4ff', '#d8d8d8'];

const E: Record<string, EnemyDef> = {};
function reg(d: EnemyDef) { E[d.id] = d; }

const melee = (range: number, cd: number, mult = 1, anim = 'punch1', sfx = 'hit'): EnemyAttack => ({ kind: 'melee', range, cd, windup: 0.42, mult, anim, sfx });

// ---- Sugisawa (Lv 1-6) ----
reg({ id: 'flyhead', name: 'Fly Head', grade: 4, model: 'flyhead', scale: 1, level: 1, hpMul: 0.7, atkMul: 0.9, defMul: 0.5, speed: 3.6, radius: 0.45, ai: 'flyer', attack: { ...melee(1.3, 1.4, 1, 'bite', 'screech'), kind: 'lunge' }, aggro: 9, voice: 'screech', flying: true, drops: [{ item: 'cotton', chance: 0.3 }] });
reg({ id: 'crawler', name: 'Crawling Curse', grade: 4, model: 'crawler', scale: 1, level: 2, hpMul: 0.8, atkMul: 1, defMul: 0.8, speed: 2.6, radius: 0.55, ai: 'melee', attack: melee(1.4, 1.6, 1.1, 'bite', 'hit'), aggro: 8, voice: 'growl', drops: [{ item: 'cotton', chance: 0.3 }] });
reg({ id: 'lanky', name: 'Lanky Curse', grade: 3, model: 'lanky', scale: 1.1, level: 4, hpMul: 1.1, atkMul: 1.2, defMul: 1, speed: 2.4, radius: 0.5, ai: 'melee', attack: melee(2.2, 1.8, 1.25, 'slash1', 'slash'), aggro: 9, voice: 'growl', drops: [{ item: 'cotton', chance: 0.35 }] });
reg({ id: 'glutton', name: 'Gluttonous Curse', grade: 2, model: 'glutton', scale: 1.9, level: 6, hpMul: 16, atkMul: 1.4, defMul: 1.3, speed: 2.2, radius: 1.4, ai: 'boss', boss: 'glutton', attack: melee(3.2, 1.8, 1.4, 'slam', 'punch'), aggro: 16, voice: 'roar', noKnock: true });

// ---- Eishu Detention (Lv 7-12) ----
reg({ id: 'womb', name: 'Womb Spawn', grade: 3, model: 'womb', scale: 1, level: 7, hpMul: 0.7, atkMul: 2.4, defMul: 0.6, speed: 3.0, radius: 0.5, ai: 'bomber', attack: { kind: 'explode', range: 1.4, cd: 1, windup: 0.8, mult: 2.4, radius: 2.4, sfx: 'explosion' }, aggro: 9, voice: 'squish' });
reg({ id: 'hound', name: 'Cursed Hound', grade: 3, model: 'hound', scale: 1.1, level: 8, hpMul: 0.9, atkMul: 1.1, defMul: 0.9, speed: 5.0, radius: 0.55, ai: 'charger', attack: { ...melee(1.6, 1.3, 1.1, 'bite', 'growl'), kind: 'lunge' }, aggro: 11, voice: 'growl', drops: [{ item: 'residue', chance: 0.25 }] });
reg({ id: 'wretch', name: 'Hollow Wretch', grade: 2, model: 'wretch', scale: 1.15, level: 10, hpMul: 1.6, atkMul: 1.25, defMul: 1.4, speed: 2.5, radius: 0.6, ai: 'melee', attack: melee(2.0, 1.7, 1.3, 'slash2', 'slash'), aggro: 9, voice: 'growl', drops: [{ item: 'residue', chance: 0.35 }] });
reg({ id: 'fingerBearer', name: 'Finger Bearer', grade: 0, model: 'fingerBearer', scale: 1.7, level: 13, hpMul: 18, atkMul: 1.5, defMul: 1.5, speed: 3.0, radius: 1.1, ai: 'boss', boss: 'fingerBearer', attack: melee(3.0, 1.5, 1.4, 'slash1', 'slash'), aggro: 18, voice: 'roar', noKnock: true });

// ---- Kawasaki (Lv 13-19) ----
reg({ id: 'transfigured', name: 'Transfigured Human', grade: 3, model: 'transfigured', scale: 1, level: 13, hpMul: 1.0, atkMul: 1.1, defMul: 1, speed: 2.9, radius: 0.5, ai: 'ranged', attack: { kind: 'projectile', range: 8, cd: 2.2, windup: 0.5, mult: 1, proj: 'spit', projSpeed: 9, anim: 'throw', sfx: 'squish', color: 0xa0d04a }, aggro: 10, voice: 'growl', drops: [{ item: 'filmTicket', chance: 0.3 }] });
reg({ id: 'bloated', name: 'Bloated Transfigured', grade: 2, model: 'bloated', scale: 1.15, level: 15, hpMul: 2.0, atkMul: 1.4, defMul: 1.2, speed: 2.0, radius: 0.75, ai: 'melee', attack: { kind: 'aoe', range: 2.2, cd: 2.4, windup: 0.7, mult: 1.5, radius: 2.6, anim: 'slam', sfx: 'shockwave' }, aggro: 9, voice: 'growl', drops: [{ item: 'filmTicket', chance: 0.3 }] });
reg({ id: 'leech', name: 'Sewer Leech', grade: 3, model: 'leech', scale: 1.1, level: 14, hpMul: 1.1, atkMul: 1.15, defMul: 1, speed: 3.4, radius: 0.55, ai: 'charger', attack: { ...melee(1.6, 1.5, 1.15, 'bite', 'squish'), kind: 'lunge' }, aggro: 9, voice: 'squish' });
reg({ id: 'mahito', name: 'Mahito', grade: 0, model: 'char:mahito', scale: 1.15, level: 19, hpMul: 22, atkMul: 1.55, defMul: 1.5, speed: 4.6, radius: 0.7, ai: 'boss', boss: 'mahito', attack: melee(2.4, 1.2, 1.4, 'slash1', 'slash'), aggro: 18, voice: 'roar', noKnock: true });

// ---- Kyoto (Lv 19-26) ----
reg({ id: 'rootCurse', name: 'Root Curse', grade: 2, model: 'rootCurse', scale: 1.1, level: 19, hpMul: 1.8, atkMul: 1.2, defMul: 1.5, speed: 0, radius: 0.7, ai: 'stationary', attack: { kind: 'projectile', range: 9, cd: 1.9, windup: 0.45, mult: 1.1, proj: 'thorn', projSpeed: 12, sfx: 'roots', color: 0x9aff6a }, aggro: 10, voice: 'roots', drops: [{ item: 'kelp', chance: 0.4 }] });
reg({ id: 'bud', name: 'Cursed Bud', grade: 3, model: 'bud', scale: 1.1, level: 20, hpMul: 0.9, atkMul: 1.1, defMul: 0.9, speed: 3.6, radius: 0.45, ai: 'melee', attack: { ...melee(1.3, 1.3, 1.1, 'bite', 'flower'), kind: 'lunge' }, aggro: 9, voice: 'flower', drops: [{ item: 'kelp', chance: 0.3 }] });
reg({ id: 'forestHound', name: 'Grade 1 Hound', grade: 1, model: 'hound', scale: 1.35, level: 22, hpMul: 1.8, atkMul: 1.35, defMul: 1.3, speed: 5.4, radius: 0.65, ai: 'charger', attack: { ...melee(1.8, 1.4, 1.3, 'bite', 'growl'), kind: 'lunge' }, aggro: 12, voice: 'growl' });
reg({ id: 'todo', name: 'Aoi Todo', grade: 1, model: 'char:todo', scale: 1.1, level: 22, hpMul: 12, atkMul: 1.4, defMul: 1.4, speed: 4.4, radius: 0.7, ai: 'boss', boss: 'todo', attack: melee(2.2, 1.0, 1.3, 'punch1', 'punch'), aggro: 18, voice: 'clap', noKnock: true });
reg({ id: 'hanami', name: 'Hanami', grade: 0, model: 'hanami', scale: 1.5, level: 26, hpMul: 24, atkMul: 1.6, defMul: 1.6, speed: 3.2, radius: 1.0, ai: 'boss', boss: 'hanami', attack: melee(2.8, 1.4, 1.4, 'slash2', 'roots'), aggro: 18, voice: 'roar', noKnock: true });

// ---- Shibuya (Lv 26-36) ----
reg({ id: 'hand', name: 'Grasping Curse', grade: 2, model: 'hand', scale: 1.2, level: 26, hpMul: 1.6, atkMul: 1.25, defMul: 1.3, speed: 3.2, radius: 0.7, ai: 'melee', attack: melee(2.0, 1.6, 1.35, 'grab', 'punch'), aggro: 10, voice: 'growl', drops: [{ item: 'veilTag', chance: 0.25 }] });
reg({ id: 'pumpkin', name: 'Jack-o\'-Curse', grade: 2, model: 'pumpkin', scale: 1.1, level: 27, hpMul: 1.4, atkMul: 1.2, defMul: 1.1, speed: 2.8, radius: 0.55, ai: 'ranged', attack: { kind: 'projectile', range: 9, cd: 2, windup: 0.5, mult: 1.2, proj: 'ember', projSpeed: 10, sfx: 'fireball', color: 0xff8a2a }, aggro: 10, voice: 'fire', flying: true, drops: [{ item: 'veilTag', chance: 0.25 }] });
reg({ id: 'fish', name: 'Shikigami Fish', grade: 3, model: 'fish', scale: 1.2, level: 28, hpMul: 0.9, atkMul: 0.95, defMul: 1, speed: 5.5, radius: 0.45, ai: 'flyer', attack: { ...melee(1.4, 1.2, 1.1, 'bite', 'water'), kind: 'lunge' }, aggro: 12, voice: 'squish', flying: true });
reg({ id: 'shibuyaTransfig', name: 'Transfigured Horde', grade: 2, model: 'transfigured', scale: 1.15, level: 29, hpMul: 1.5, atkMul: 1.3, defMul: 1.2, speed: 3.3, radius: 0.55, ai: 'melee', attack: melee(1.8, 1.4, 1.3, 'slash1', 'hit'), aggro: 10, voice: 'growl' });
reg({ id: 'dagon', name: 'Dagon', grade: 0, model: 'dagon', scale: 1.5, level: 30, hpMul: 26, atkMul: 1.65, defMul: 1.7, speed: 2.4, radius: 1.5, ai: 'boss', boss: 'dagon', attack: melee(3.2, 1.6, 1.4, 'slam', 'water'), aggro: 20, voice: 'roar', noKnock: true });
reg({ id: 'jogo', name: 'Jogo', grade: 0, model: 'jogo', scale: 1.3, level: 33, hpMul: 28, atkMul: 1.7, defMul: 1.7, speed: 3.4, radius: 0.8, ai: 'boss', boss: 'jogo', attack: melee(2.4, 1.4, 1.4, 'punch1', 'fire'), aggro: 20, voice: 'fire', noKnock: true });
reg({ id: 'sukuna', name: 'Ryomen Sukuna', grade: 0, model: 'char:sukuna', scale: 1.15, level: 36, hpMul: 38, atkMul: 1.8, defMul: 1.8, speed: 5.0, radius: 0.8, ai: 'boss', boss: 'sukuna', attack: melee(2.6, 1.0, 1.5, 'slash1', 'dismantle'), aggro: 22, voice: 'roar', noKnock: true });
reg({ id: 'mahoraga', name: 'Divine General Mahoraga', grade: 0, model: 'mahoraga', scale: 2.0, level: 45, hpMul: 50, atkMul: 2.0, defMul: 2.0, speed: 4.2, radius: 1.2, ai: 'boss', boss: 'mahoraga', attack: melee(3.4, 1.3, 1.6, 'slash1', 'slash'), aggro: 22, voice: 'roar', noKnock: true });

// ---- Objects ----
reg({ id: 'veilAnchor', name: 'Veil Anchor', grade: 2, model: 'static:veilAnchor', scale: 1, level: 26, hpMul: 3, atkMul: 0, defMul: 1, speed: 0, radius: 0.5, ai: 'dummy', attack: melee(0, 99, 0), aggro: 0, noKnock: true, drops: [{ item: 'veilTag', chance: 1 }] });

// ---- Training ----
reg({ id: 'dummy', name: 'Cursed Corpse (Training)', grade: 4, model: 'dummy', scale: 1.0, level: 1, hpMul: 6, atkMul: 0, defMul: 0, speed: 0, radius: 0.5, ai: 'dummy', attack: melee(0, 99, 0), aggro: 0 });

export const ENEMIES = E;

export function enemyStats(d: EnemyDef, levelOverride?: number) {
  const L = levelOverride ?? d.level;
  const gradeHp = [1.0, 1.6, 1.25, 1.0, 0.75][d.grade];
  return {
    level: L,
    hp: Math.round((34 + 20 * Math.pow(L, 1.32)) * d.hpMul * gradeHp),
    atk: Math.round((7 + 3.3 * L) * d.atkMul),
    def: Math.round((2 + 1.6 * L) * d.defMul),
    exp: Math.round((8 + 5 * Math.pow(L, 1.25)) * (d.ai === 'boss' ? 14 : 1) * [2, 1.8, 1.4, 1.1, 1][d.grade] * (d.hpMul > 2 ? 1 : d.hpMul)),
    gold: Math.round((4 + 2.5 * L) * (d.ai === 'boss' ? 12 : 1)),
  };
}
