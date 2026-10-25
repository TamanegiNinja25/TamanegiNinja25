// Item database, random affix rolling, rarity, enhancement and naming.
import { Affix, ClassId, ItemInstance, ItemKind, Slot, StatKey, STAT_LABEL, PCT_KEYS } from './types';
import { Rng, pick, rand, randInt } from '../core/util';

export interface IconSpec { shape: string; c1: string; c2?: string; glyph?: string }

export interface ItemBase {
  id: string;
  name: string;
  kind: ItemKind;
  cls?: ClassId;
  req: number;
  stats?: Partial<Record<StatKey, number>>;
  price: number;
  icon: IconSpec;
  desc?: string;
  stack?: number;
  /** consumable effect */
  use?: { hp?: number; ce?: number; hpPct?: number; regen?: number; warp?: string; buff?: string };
  /** uniques: fixed rarity 3 with these affixes */
  unique?: Affix[];
  /** cannot be sold/dropped */
  questItem?: boolean;
}

const W = (id: string, name: string, cls: ClassId, req: number, atk: number, price: number, shape: string, c1: string, c2: string, extra: Partial<ItemBase> = {}): ItemBase =>
  ({ id, name, kind: 'weapon', cls, req, stats: { atk }, price, icon: { shape, c1, c2 }, ...extra });

const A = (id: string, name: string, kind: Slot, req: number, stats: Partial<Record<StatKey, number>>, price: number, shape: string, c1: string, c2: string, extra: Partial<ItemBase> = {}): ItemBase =>
  ({ id, name, kind, req, stats, price, icon: { shape, c1, c2 }, ...extra });

export const ITEMS: Record<string, ItemBase> = {};
function reg(...items: ItemBase[]) { for (const i of items) ITEMS[i.id] = i; }

// ---- Weapons ----
reg(
  W('wraps', 'Training Wraps', 'yuji', 1, 6, 40, 'fist', '#e8dcc0', '#a89a7a'),
  W('ironKnuckle', 'Iron Knuckles', 'yuji', 7, 16, 320, 'fist', '#9aa4ae', '#5a646e'),
  W('cursedKnuckle', 'Cursed Knuckles', 'yuji', 14, 30, 1100, 'fist', '#6a4a9a', '#e05aff'),
  W('grade1Fist', 'Grade 1 Gauntlets', 'yuji', 22, 48, 2800, 'fist', '#3a3a48', '#ff5a4a'),
  W('sgFist', 'Special Grade Gauntlets', 'yuji', 30, 70, 6200, 'fist', '#1a1a22', '#ff2a3a'),
  W('slaughterDemon', 'Slaughter Demon', 'yuji', 18, 44, 5000, 'knife', '#2a2a30', '#ff3a3a', { unique: [{ k: 'crit', v: 0.08 }, { k: 'bfChance', v: 0.03 }, { k: 'str', v: 8 }], desc: 'A cursed knife Gojo handed you. Black Flash comes easier when it is in your hand.' }),
  W('bfWraps', 'Wraps of the Black Flash', 'yuji', 32, 86, 12000, 'fist', '#111111', '#ff2a2a', { unique: [{ k: 'bfChance', v: 0.07 }, { k: 'critDmg', v: 0.4 }, { k: 'str', v: 14 }, { k: 'atkSpd', v: 0.1 }], desc: 'Cursed energy lands 0.000001 seconds after the blow.' }),

  W('tanto', 'Practice Tanto', 'megumi', 1, 6, 40, 'blade', '#c8ccd4', '#5a4a3a'),
  W('wakizashi', 'Steel Wakizashi', 'megumi', 7, 16, 320, 'blade', '#d8dce4', '#2a2a3a'),
  W('shadowBlade', 'Shadow Blade', 'megumi', 14, 30, 1100, 'blade', '#3a3a5a', '#8a7aff'),
  W('cursedKatana', 'Cursed Katana', 'megumi', 22, 48, 2800, 'blade', '#e8e8f0', '#3a2a6a'),
  W('spiritEdge', 'Spirit Edge', 'megumi', 30, 70, 6200, 'blade', '#bfefff', '#1a3a5a'),
  W('invertedSpear', 'Inverted Spear of Heaven', 'megumi', 26, 62, 9000, 'spear', '#d8d8e0', '#9a2a4a', { unique: [{ k: 'crit', v: 0.1 }, { k: 'atkPct', v: 0.12 }, { k: 'ce', v: 8 }], desc: 'A cursed tool that nullifies techniques it touches.' }),
  W('dragonBone', 'Dragon-Bone', 'megumi', 34, 90, 13000, 'blade', '#e8e0c8', '#4a3a2a', { unique: [{ k: 'summonPow', v: 0.25 }, { k: 'atkPct', v: 0.15 }, { k: 'critDmg', v: 0.35 }, { k: 'ce', v: 12 }], desc: 'Stores the force of impact and releases it as a burst.' }),

  W('carpHammer', 'Carpenter Hammer', 'nobara', 1, 6, 40, 'hammer', '#9a7a5a', '#8a8a92'),
  W('ironMallet', 'Iron Mallet', 'nobara', 7, 16, 320, 'hammer', '#7a5a3a', '#aab0b8'),
  W('cursedHammer', 'Cursed Hammer', 'nobara', 14, 30, 1100, 'hammer', '#5a3a2a', '#ff7a3a'),
  W('dollHammer', 'Straw Doll Hammer', 'nobara', 22, 48, 2800, 'hammer', '#c8a85a', '#4a2a1a'),
  W('resMallet', 'Resonance Mallet', 'nobara', 30, 70, 6200, 'hammer', '#2a2a3a', '#ff4a8a'),
  W('heirloom', 'Kugisaki Heirloom Hammer', 'nobara', 18, 44, 5000, 'hammer', '#d8b04a', '#5a2a1a', { unique: [{ k: 'projPow', v: 0.15 }, { k: 'dex', v: 8 }, { k: 'crit', v: 0.05 }], desc: 'Grandma would be proud. Probably.' }),
  W('crownNail', 'Hairpin Crown', 'nobara', 34, 90, 13000, 'hammer', '#ff4a6a', '#f0e0c0', { unique: [{ k: 'projPow', v: 0.3 }, { k: 'skillPow', v: 0.2 }, { k: 'bfChance', v: 0.04 }, { k: 'dex', v: 14 }], desc: 'Every nail sings in resonance.' }),
);

// ---- Armour / accessories ----
reg(
  A('uniform', 'Student Uniform', 'outfit', 1, { def: 4, maxHp: 20 }, 50, 'uniform', '#1d2236', '#e0b84e'),
  A('reinUniform', 'Reinforced Uniform', 'outfit', 7, { def: 10, maxHp: 60 }, 360, 'uniform', '#20283e', '#e0b84e'),
  A('g2Uniform', 'Grade 2 Field Uniform', 'outfit', 14, { def: 18, maxHp: 130 }, 1200, 'uniform', '#242a44', '#6ac0ff'),
  A('g1Uniform', 'Grade 1 Field Uniform', 'outfit', 22, { def: 28, maxHp: 240 }, 3000, 'uniform', '#1a1a2a', '#c07aff'),
  A('sgCoat', 'Special Grade Coat', 'outfit', 30, { def: 42, maxHp: 400 }, 6500, 'uniform', '#0e0e16', '#ff5a7a'),
  A('gojoJacket', "Gojo's Spare Jacket", 'outfit', 28, { def: 40, maxHp: 350 }, 11000, 'uniform', '#12141f', '#7fdcff', { unique: [{ k: 'cePct', v: 0.25 }, { k: 'ceRegen', v: 2 }, { k: 'dmgReduce', v: 0.08 }], desc: "It's way too long in the sleeves. Smells faintly of sweets." }),

  A('talisman', 'Paper Talisman', 'charm', 1, { maxCe: 15 }, 60, 'charm', '#f0e6c8', '#c83a3a'),
  A('wardCharm', 'Ward Charm', 'charm', 8, { maxCe: 35, ceRegen: 0.5 }, 420, 'charm', '#e8dcb8', '#3a6ac8'),
  A('cursedBead', 'Cursed Bead', 'charm', 15, { maxCe: 60, crit: 0.03 }, 1300, 'bead', '#6a3a9a', '#ff9aff'),
  A('vowCharm', 'Binding Vow Charm', 'charm', 23, { maxCe: 90, skillPow: 0.08 }, 3200, 'charm', '#2a2a3a', '#ffd04a'),
  A('sixEyes', 'Six Eyes Shard', 'charm', 32, { maxCe: 150, ceRegen: 2 }, 14000, 'eye', '#7fdcff', '#ffffff', { unique: [{ k: 'cdr', v: 0.15 }, { k: 'crit', v: 0.08 }, { k: 'ce', v: 14 }], desc: 'A sliver of perception beyond limits.' }),

  A('sneakers', 'Sneakers', 'shoes', 1, { moveSpd: 0.02, def: 1 }, 40, 'shoes', '#e8e8e8', '#d83a3a'),
  A('runShoes', 'Running Shoes', 'shoes', 8, { moveSpd: 0.04, def: 3 }, 380, 'shoes', '#3a6ad8', '#ffffff'),
  A('cursedTreads', 'Cursed Treads', 'shoes', 15, { moveSpd: 0.06, def: 6, evasion: 0.02 }, 1250, 'shoes', '#3a2a4a', '#9a6aff'),
  A('shadowSteps', 'Shadow Steps', 'shoes', 23, { moveSpd: 0.08, def: 10, evasion: 0.03 }, 3100, 'shoes', '#111118', '#6a6aff'),
  A('flashBoots', 'Flash Boots', 'shoes', 31, { moveSpd: 0.11, def: 15, evasion: 0.05 }, 6300, 'shoes', '#1a1a1a', '#ffd04a'),
);

// ---- Consumables / materials / quest ----
reg(
  { id: 'hpS', name: "Shoko's Salve", kind: 'consumable', req: 1, price: 30, icon: { shape: 'potion', c1: '#ff4a5a', c2: '#ffd0d4' }, use: { hp: 150 }, stack: 99, desc: 'Restores 150 HP.' },
  { id: 'hpM', name: 'Reverse Cursed Tonic', kind: 'consumable', req: 10, price: 120, icon: { shape: 'potion', c1: '#ff2a6a', c2: '#ffffff' }, use: { hp: 500 }, stack: 99, desc: 'Restores 500 HP.' },
  { id: 'hpL', name: 'Ieiri Special', kind: 'consumable', req: 22, price: 380, icon: { shape: 'potion', c1: '#ff0a4a', c2: '#ffe08a' }, use: { hp: 1400 }, stack: 99, desc: 'Restores 1400 HP.' },
  { id: 'ceS', name: 'CE Candy', kind: 'consumable', req: 1, price: 35, icon: { shape: 'potionCe', c1: '#4a8aff', c2: '#d0e4ff' }, use: { ce: 60 }, stack: 99, desc: 'Restores 60 cursed energy.' },
  { id: 'ceM', name: 'CE Ampoule', kind: 'consumable', req: 10, price: 140, icon: { shape: 'potionCe', c1: '#2a6aff', c2: '#ffffff' }, use: { ce: 180 }, stack: 99, desc: 'Restores 180 cursed energy.' },
  { id: 'ceL', name: 'CE Elixir', kind: 'consumable', req: 22, price: 420, icon: { shape: 'potionCe', c1: '#6a2aff', c2: '#ffe08a' }, use: { ce: 450 }, stack: 99, desc: 'Restores 450 cursed energy.' },
  { id: 'onigiri', name: 'Tuna Mayo Onigiri', kind: 'consumable', req: 1, price: 60, icon: { shape: 'onigiri', c1: '#f4f4f0', c2: '#1a2a1a' }, use: { hpPct: 0.35, regen: 1 }, stack: 99, desc: 'Restores 35% HP. Inumaki approves.' },
  { id: 'warp', name: 'Return Talisman', kind: 'consumable', req: 1, price: 80, icon: { shape: 'charm', c1: '#f0e6c8', c2: '#3a8aff' }, use: { warp: 'hub' }, stack: 20, desc: 'Teleports you back to Tokyo Jujutsu High.' },
  { id: 'fragment', name: 'Cursed Fragment', kind: 'material', req: 1, price: 25, icon: { shape: 'crystal', c1: '#9a4aff', c2: '#ffb0ff' }, stack: 999, desc: 'Residue of an exorcised curse. Used to infuse equipment.' },
  { id: 'core', name: 'Grade 1 Core', kind: 'material', req: 1, price: 400, icon: { shape: 'crystal', c1: '#ff3a5a', c2: '#ffd0a0' }, stack: 999, desc: 'A dense knot of cursed energy. Needed for +6 and above.' },
  { id: 'finger', name: "Sukuna's Finger", kind: 'quest', req: 1, price: 0, icon: { shape: 'finger', c1: '#6a2a2a', c2: '#ff3a3a' }, questItem: true, stack: 20, desc: 'A Special Grade cursed object. Twenty exist.' },
  { id: 'cotton', name: 'Cursed Cotton', kind: 'quest', req: 1, price: 0, icon: { shape: 'cotton', c1: '#f0f0f0', c2: '#9a6aff' }, questItem: true, stack: 99, desc: 'Panda wants this for... reasons.' },
  { id: 'residue', name: 'Curse Residue', kind: 'quest', req: 1, price: 0, icon: { shape: 'crystal', c1: '#3a8a5a', c2: '#a0ffc0' }, questItem: true, stack: 99, desc: 'A sample for Shoko\'s research.' },
  { id: 'kelp', name: 'Kelp Leaf', kind: 'quest', req: 1, price: 0, icon: { shape: 'leaf', c1: '#2a5a2a', c2: '#6aa04a' }, questItem: true, stack: 99, desc: 'Konbu!' },
  { id: 'miwaSword', name: "Miwa's Katana", kind: 'quest', req: 1, price: 0, icon: { shape: 'blade', c1: '#c8ccd4', c2: '#3a5a9a' }, questItem: true, stack: 1, desc: 'Kasumi Miwa lost it somewhere in the forest.' },
  { id: 'veilTag', name: 'Veil Talisman', kind: 'quest', req: 1, price: 0, icon: { shape: 'charm', c1: '#2a2a3a', c2: '#9a4aff' }, questItem: true, stack: 99, desc: 'Torn from a barrier anchor.' },
  { id: 'filmTicket', name: 'Cinema Ticket Stub', kind: 'quest', req: 1, price: 0, icon: { shape: 'ticket', c1: '#ffd04a', c2: '#8a2a2a' }, questItem: true, stack: 99, desc: 'Found near the scene of the incident.' },
);

export const RARITY_NAME = ['Common', 'Graded', 'Special Grade', 'Cursed Tool'];
export const RARITY_COLOR = ['#e8e8e8', '#5ab4ff', '#c07aff', '#ff9a3a'];

const AFFIX_POOL: { k: StatKey; lo: number; hi: number; perLv: number }[] = [
  { k: 'str', lo: 1, hi: 3, perLv: 0.18 },
  { k: 'dex', lo: 1, hi: 3, perLv: 0.18 },
  { k: 'vit', lo: 1, hi: 3, perLv: 0.18 },
  { k: 'ce', lo: 1, hi: 3, perLv: 0.18 },
  { k: 'maxHp', lo: 10, hi: 25, perLv: 6 },
  { k: 'maxCe', lo: 5, hi: 15, perLv: 2.5 },
  { k: 'atkPct', lo: 0.02, hi: 0.05, perLv: 0.002 },
  { k: 'def', lo: 1, hi: 4, perLv: 0.6 },
  { k: 'crit', lo: 0.01, hi: 0.025, perLv: 0.0008 },
  { k: 'critDmg', lo: 0.05, hi: 0.12, perLv: 0.004 },
  { k: 'atkSpd', lo: 0.02, hi: 0.05, perLv: 0.0012 },
  { k: 'moveSpd', lo: 0.02, hi: 0.04, perLv: 0.0006 },
  { k: 'ceRegen', lo: 0.2, hi: 0.5, perLv: 0.04 },
  { k: 'bfChance', lo: 0.005, hi: 0.012, perLv: 0.0003 },
  { k: 'lifesteal', lo: 0.01, hi: 0.02, perLv: 0.0005 },
  { k: 'skillPow', lo: 0.03, hi: 0.06, perLv: 0.002 },
  { k: 'goldBonus', lo: 0.05, hi: 0.12, perLv: 0.003 },
  { k: 'expBonus', lo: 0.03, hi: 0.08, perLv: 0.002 },
];

let uidCounter = 1;
export function setUidCounter(n: number) { uidCounter = Math.max(uidCounter, n); }
export function getUidCounter() { return uidCounter; }

export function makeItem(baseId: string, rarity: 0 | 1 | 2 | 3 = 0, qty = 1, rng?: Rng): ItemInstance {
  const base = ITEMS[baseId];
  if (!base) throw new Error('Unknown item ' + baseId);
  const inst: ItemInstance = { uid: uidCounter++, base: baseId, rarity: base.unique ? 3 : rarity, plus: 0, affixes: [], qty };
  if (base.unique) inst.affixes = base.unique.map(a => ({ ...a }));
  else if (isGear(base) && rarity > 0) {
    const n = rarity === 1 ? randInt(1, 2) : randInt(2, 3);
    const pool = [...AFFIX_POOL];
    for (let i = 0; i < n && pool.length; i++) {
      const idx = rng ? Math.floor(rng.next() * pool.length) : randInt(0, pool.length - 1);
      const a = pool.splice(idx, 1)[0];
      const raw = (rng ? rng.range(a.lo, a.hi) : rand(a.lo, a.hi)) + a.perLv * base.req;
      const v = a.lo >= 1 ? Math.round(raw * (rarity === 2 ? 1.3 : 1)) : Math.round(raw * (rarity === 2 ? 1.3 : 1) * 1000) / 1000;
      inst.affixes.push({ k: a.k, v });
    }
  }
  return inst;
}

export function isGear(b: ItemBase) { return b.kind === 'weapon' || b.kind === 'outfit' || b.kind === 'charm' || b.kind === 'shoes'; }

/** Base stats including rarity scaling and enhancement. */
export function itemStats(it: ItemInstance): Partial<Record<StatKey, number>> {
  const b = ITEMS[it.base];
  const out: Partial<Record<StatKey, number>> = {};
  const rMul = [1, 1.1, 1.25, 1.35][it.rarity];
  const eMul = 1 + it.plus * 0.09 + (it.plus >= 7 ? (it.plus - 6) * 0.05 : 0);
  for (const [k, v] of Object.entries(b.stats ?? {})) {
    const key = k as StatKey;
    const scaled = PCT_KEYS.has(key) || key === 'ceRegen' ? v * (1 + (rMul - 1) * 0.5) : v * rMul * eMul;
    out[key] = (out[key] ?? 0) + (PCT_KEYS.has(key) ? scaled : Math.round(scaled));
  }
  for (const a of it.affixes) out[a.k] = (out[a.k] ?? 0) + a.v;
  return out;
}

export function itemName(it: ItemInstance) {
  const b = ITEMS[it.base];
  return (it.plus > 0 ? `+${it.plus} ` : '') + b.name;
}

export function formatStat(k: StatKey, v: number) {
  const label = STAT_LABEL[k] ?? k;
  if (PCT_KEYS.has(k)) return `${label} +${(v * 100).toFixed(v * 100 < 10 && v * 100 % 1 ? 1 : 0)}%`;
  if (k === 'ceRegen' || k === 'hpRegen') return `${label} +${v.toFixed(1)}/s`;
  return `${label} +${Math.round(v)}`;
}

export function sellPrice(it: ItemInstance) {
  const b = ITEMS[it.base];
  if (b.questItem) return 0;
  return Math.max(1, Math.floor(b.price * 0.3 * (1 + it.rarity * 0.6) * (1 + it.plus * 0.25)));
}

export const ENHANCE_RATE = [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28];
export function enhanceCost(it: ItemInstance) {
  const b = ITEMS[it.base];
  return {
    gold: Math.floor((60 + b.req * 25) * (it.plus + 1) * (1 + it.rarity * 0.3)),
    fragments: 1 + Math.floor(it.plus * 1.5),
    cores: it.plus >= 5 ? it.plus - 4 : 0,
    rate: ENHANCE_RATE[it.plus] ?? 0,
  };
}

/** Pick a random gear base appropriate for a level (and optionally class). */
export function randomGear(level: number, cls?: ClassId) {
  const pool = Object.values(ITEMS).filter(b => isGear(b) && !b.unique && b.req <= level + 2 && b.req >= level - 12 && (!b.cls || !cls || b.cls === cls || Math.random() < 0.25));
  if (!pool.length) return null;
  return pick(pool).id;
}

export function rollRarity(bonus = 0): 0 | 1 | 2 {
  const r = Math.random();
  if (r < 0.035 + bonus * 0.5) return 2;
  if (r < 0.22 + bonus) return 1;
  return 0;
}

export function uniquesForLevel(level: number) {
  return Object.values(ITEMS).filter(b => b.unique && b.req <= level + 3);
}
