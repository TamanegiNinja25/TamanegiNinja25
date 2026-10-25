// Shared RPG types.

export type ClassId = 'yuji' | 'megumi' | 'nobara';
export type Attr = 'str' | 'dex' | 'vit' | 'ce';
export type Slot = 'weapon' | 'outfit' | 'charm' | 'shoes';
export type ItemKind = Slot | 'consumable' | 'material' | 'quest';

export interface Stats {
  maxHp: number;
  maxCe: number;
  atk: number;
  def: number;
  crit: number;
  critDmg: number;
  atkSpd: number;
  moveSpd: number;
  ceRegen: number;
  hpRegen: number;
  evasion: number;
  skillPow: number;
  bfChance: number;
  dmgReduce: number;
  lifesteal: number;
  cdr: number;
  expBonus: number;
  goldBonus: number;
  summonPow: number;
  projPow: number;
}

export type StatKey = keyof Stats | Attr | 'hpPct' | 'atkPct' | 'cePct' | 'defPct';

export const STAT_LABEL: Record<string, string> = {
  maxHp: 'Max HP', maxCe: 'Max CE', atk: 'Attack', def: 'Defense', crit: 'Crit Rate', critDmg: 'Crit Damage',
  atkSpd: 'Attack Speed', moveSpd: 'Move Speed', ceRegen: 'CE Regen', hpRegen: 'HP Regen', evasion: 'Evasion',
  skillPow: 'Skill Power', bfChance: 'Black Flash', dmgReduce: 'Damage Reduction', lifesteal: 'Lifesteal', cdr: 'Cooldown Reduction',
  expBonus: 'EXP Bonus', goldBonus: 'Yen Bonus', summonPow: 'Shikigami Power', projPow: 'Projectile Power',
  str: 'STR', dex: 'DEX', vit: 'VIT', ce: 'CE', hpPct: 'Max HP', atkPct: 'Attack', cePct: 'Max CE', defPct: 'Defense',
};

/** Keys displayed as percentages. */
export const PCT_KEYS = new Set(['crit', 'critDmg', 'atkSpd', 'moveSpd', 'evasion', 'skillPow', 'bfChance', 'dmgReduce', 'lifesteal', 'cdr', 'expBonus', 'goldBonus', 'summonPow', 'projPow', 'hpPct', 'atkPct', 'cePct', 'defPct']);

export interface Affix { k: StatKey; v: number }

export interface ItemInstance {
  uid: number;
  base: string;
  rarity: 0 | 1 | 2 | 3;
  plus: number;
  affixes: Affix[];
  qty: number;
}

export interface QuestState {
  state: 'active' | 'ready' | 'done';
  progress: number[];
}

export interface SaveData {
  version: number;
  slot: number;
  cls: ClassId;
  level: number;
  exp: number;
  statPoints: number;
  skillPoints: number;
  attrs: Record<Attr, number>;
  skills: Record<string, number>;
  quick: (string | null)[];
  potions: (string | null)[];
  inventory: ItemInstance[];
  equip: Partial<Record<Slot, ItemInstance>>;
  gold: number;
  hp: number;
  ce: number;
  domain: number;
  map: string;
  x: number;
  z: number;
  quests: Record<string, QuestState>;
  flags: Record<string, number | string | boolean>;
  fingers: number;
  playTime: number;
  kills: number;
  uidCounter: number;
  savedAt: number;
}
