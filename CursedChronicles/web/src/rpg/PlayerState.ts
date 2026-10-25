// Persistent player progression: stats, inventory, equipment, skills, quests and saving.
import { Attr, ClassId, ItemInstance, SaveData, Slot, Stats, StatKey } from './types';
import { CLASSES, LEVEL_CAP, expToNext } from './classes';
import { ITEMS, makeItem, itemStats, isGear, enhanceCost, getUidCounter, setUidCounter } from './items';
import { SKILLS, classSkills } from './skills';
import { QUESTS, QUEST_BY_ID, QuestDef, Objective } from '../data/story';

export const INV_SIZE = 48;
const SAVE_KEY = 'cursedChronicles.save.';
const SAVE_VERSION = 1;

type Listener = (ev: string, data?: any) => void;

export class PlayerState {
  d: SaveData;
  stats!: Stats;
  /** temporary buffs from skills: id -> {until, stats} */
  buffs = new Map<string, { until: number; stats: Record<string, number> }>();
  private listeners: Listener[] = [];
  time = 0;

  constructor(d: SaveData) {
    this.d = d;
    setUidCounter(d.uidCounter);
    this.recalc();
  }

  static fresh(cls: ClassId, slot: number): PlayerState {
    const c = CLASSES[cls];
    const d: SaveData = {
      version: SAVE_VERSION, slot, cls, level: 1, exp: 0, statPoints: 0, skillPoints: 1,
      attrs: { str: 0, dex: 0, vit: 0, ce: 0 }, skills: {}, quick: [null, null, null, null, null, null], potions: ['hpS', 'ceS'],
      inventory: [], equip: {}, gold: 200, hp: 1, ce: 1, domain: 0, map: 'sugisawa', x: 0, z: 22,
      quests: {}, flags: {}, fingers: 0, playTime: 0, kills: 0, uidCounter: 1, savedAt: 0,
    };
    const ps = new PlayerState(d);
    for (const g of c.startGear) {
      const it = makeItem(g, 0);
      const b = ITEMS[g];
      if (isGear(b)) ps.d.equip[b.kind as Slot] = it;
    }
    ps.addItem(makeItem('hpS', 0, 5));
    ps.addItem(makeItem('ceS', 0, 3));
    // first skill learned for free
    const first = classSkills(cls).find(s => s.row === 0 && s.col === 0)!;
    ps.d.skills[first.id] = 1;
    ps.d.skillPoints = 0;
    ps.d.quick[0] = first.id;
    ps.recalc();
    ps.d.hp = ps.stats.maxHp;
    ps.d.ce = ps.stats.maxCe;
    return ps;
  }

  on(fn: Listener) { this.listeners.push(fn); }
  emit(ev: string, data?: any) { for (const l of this.listeners) l(ev, data); }

  get cls() { return CLASSES[this.d.cls]; }

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------

  totalAttr(a: Attr) {
    const c = this.cls;
    const growth = Math.floor((this.d.level - 1) * (c.attrs[a] / 8));
    let v = c.attrs[a] + growth + this.d.attrs[a];
    for (const it of Object.values(this.d.equip)) if (it) v += itemStats(it)[a] ?? 0;
    return v;
  }

  recalc() {
    const c = this.cls;
    const L = this.d.level;
    const add: Partial<Record<StatKey, number>> = {};
    const push = (k: StatKey, v: number) => { add[k] = (add[k] ?? 0) + v; };
    for (const it of Object.values(this.d.equip)) if (it) for (const [k, v] of Object.entries(itemStats(it))) push(k as StatKey, v!);
    for (const [id, lv] of Object.entries(this.d.skills)) {
      const s = SKILLS[id];
      if (s?.passive && lv > 0) for (const [k, v] of Object.entries(s.passive(lv))) push(k as StatKey, v!);
    }
    for (const b of this.buffs.values()) for (const [k, v] of Object.entries(b.stats)) push(k as StatKey, v);
    const str = this.totalAttr('str'), dex = this.totalAttr('dex'), vit = this.totalAttr('vit'), ce = this.totalAttr('ce');
    const fingerBonus = 1 + this.d.fingers * 0.02;
    let atkFromAttr = 0;
    for (const [a, k] of Object.entries(c.atkScale)) atkFromAttr += ({ str, dex, vit, ce } as any)[a] * (k as number);
    const s: Stats = {
      maxHp: (c.base.hp + c.base.hpLv * (L - 1) + vit * 12 + (add.maxHp ?? 0)) * (1 + (add.hpPct ?? 0)) * fingerBonus,
      maxCe: (c.base.ce + c.base.ceLv * (L - 1) + ce * 6 + (add.maxCe ?? 0)) * (1 + (add.cePct ?? 0)),
      atk: (c.base.atk + c.base.atkLv * (L - 1) + atkFromAttr + (add.atk ?? 0)) * (1 + (add.atkPct ?? 0)) * fingerBonus,
      def: (c.base.def + c.base.defLv * (L - 1) + vit * 0.8 + (add.def ?? 0)) * (1 + (add.defPct ?? 0)),
      crit: Math.min(0.75, 0.05 + dex * 0.004 + (add.crit ?? 0)),
      critDmg: 0.5 + (add.critDmg ?? 0),
      atkSpd: Math.min(2, 1 + dex * 0.005 + (add.atkSpd ?? 0)),
      moveSpd: 5.4 * (1 + Math.min(0.5, add.moveSpd ?? 0)),
      ceRegen: 1.2 + ce * 0.06 + L * 0.06 + (add.ceRegen ?? 0),
      hpRegen: 0.4 + vit * 0.05 + (add.hpRegen ?? 0),
      evasion: Math.min(0.6, dex * 0.0018 + (add.evasion ?? 0)),
      skillPow: 1 + ce * 0.012 + (add.skillPow ?? 0),
      bfChance: Math.min(0.5, 0.02 + c.bfBonus + (add.bfChance ?? 0)),
      dmgReduce: Math.min(0.6, add.dmgReduce ?? 0),
      lifesteal: add.lifesteal ?? 0,
      cdr: Math.min(0.5, add.cdr ?? 0),
      expBonus: add.expBonus ?? 0,
      goldBonus: add.goldBonus ?? 0,
      summonPow: 1 + (add.summonPow ?? 0),
      projPow: 1 + (add.projPow ?? 0),
    };
    s.maxHp = Math.round(s.maxHp);
    s.maxCe = Math.round(s.maxCe);
    s.atk = Math.round(s.atk);
    s.def = Math.round(s.def);
    this.stats = s;
    if (this.d.hp > s.maxHp) this.d.hp = s.maxHp;
    if (this.d.ce > s.maxCe) this.d.ce = s.maxCe;
    this.emit('stats');
  }

  addBuff(id: string, dur: number, stats: Record<string, number>) {
    this.buffs.set(id, { until: this.time + dur, stats });
    this.recalc();
  }

  tick(dt: number) {
    this.time += dt;
    this.d.playTime += dt;
    let changed = false;
    for (const [k, b] of this.buffs) if (b.until <= this.time) { this.buffs.delete(k); changed = true; }
    if (changed) this.recalc();
  }

  // ------------------------------------------------------------------
  // Experience
  // ------------------------------------------------------------------

  gainExp(amount: number) {
    if (this.d.level >= LEVEL_CAP) return;
    amount = Math.round(amount * (1 + this.stats.expBonus));
    this.d.exp += amount;
    let leveled = false;
    while (this.d.level < LEVEL_CAP && this.d.exp >= expToNext(this.d.level)) {
      this.d.exp -= expToNext(this.d.level);
      this.d.level++;
      this.d.statPoints += 5;
      this.d.skillPoints += 1;
      leveled = true;
    }
    if (leveled) {
      this.recalc();
      this.d.hp = this.stats.maxHp;
      this.d.ce = this.stats.maxCe;
      this.emit('levelup', this.d.level);
    }
    this.emit('exp', amount);
  }

  spendStat(a: Attr, n = 1) {
    n = Math.min(n, this.d.statPoints);
    if (n <= 0) return false;
    this.d.attrs[a] += n;
    this.d.statPoints -= n;
    this.recalc();
    return true;
  }

  // ------------------------------------------------------------------
  // Skills
  // ------------------------------------------------------------------

  skillLevel(id: string) { return this.d.skills[id] ?? 0; }

  canLearn(id: string): string | null {
    const s = SKILLS[id];
    if (!s || s.cls !== this.d.cls) return 'Not your technique';
    const lv = this.skillLevel(id);
    if (lv >= s.max) return 'Max level';
    if (this.d.skillPoints <= 0) return 'No skill points';
    const reqLv = s.req + lv * (s.type === 'ultimate' ? 0 : 3);
    if (this.d.level < reqLv) return `Requires Lv ${reqLv}`;
    if (s.prereq && this.skillLevel(s.prereq[0]) < s.prereq[1]) return `Requires ${SKILLS[s.prereq[0]].name} Lv ${s.prereq[1]}`;
    return null;
  }

  learn(id: string) {
    if (this.canLearn(id)) return false;
    this.d.skills[id] = this.skillLevel(id) + 1;
    this.d.skillPoints--;
    const s = SKILLS[id];
    if ((s.type === 'active' || s.type === 'ultimate') && this.d.skills[id] === 1 && !this.d.quick.includes(id)) {
      const free = s.type === 'ultimate' ? 5 : this.d.quick.findIndex((q, i) => q === null && i < 5);
      if (free >= 0 && this.d.quick[free] === null) this.d.quick[free] = id;
    }
    this.recalc();
    this.emit('skills');
    return true;
  }

  // ------------------------------------------------------------------
  // Inventory
  // ------------------------------------------------------------------

  countItem(baseId: string) {
    let n = 0;
    for (const it of this.d.inventory) if (it.base === baseId) n += it.qty;
    return n;
  }

  addItem(it: ItemInstance): boolean {
    const b = ITEMS[it.base];
    if (b.stack && b.stack > 1) {
      const ex = this.d.inventory.find(i => i.base === it.base && i.qty < b.stack!);
      if (ex) {
        ex.qty = Math.min(b.stack, ex.qty + it.qty);
        this.emit('inventory');
        this.questCheckCollect();
        return true;
      }
    }
    if (this.d.inventory.length >= INV_SIZE) { this.emit('invFull'); return false; }
    this.d.inventory.push(it);
    this.emit('inventory');
    this.questCheckCollect();
    return true;
  }

  removeItem(baseId: string, qty: number) {
    for (let i = this.d.inventory.length - 1; i >= 0 && qty > 0; i--) {
      const it = this.d.inventory[i];
      if (it.base !== baseId) continue;
      const take = Math.min(qty, it.qty);
      it.qty -= take;
      qty -= take;
      if (it.qty <= 0) this.d.inventory.splice(i, 1);
    }
    this.emit('inventory');
    return qty <= 0;
  }

  removeInstance(uid: number) {
    const i = this.d.inventory.findIndex(x => x.uid === uid);
    if (i >= 0) this.d.inventory.splice(i, 1);
    this.emit('inventory');
  }

  canEquip(it: ItemInstance): string | null {
    const b = ITEMS[it.base];
    if (!isGear(b)) return 'Cannot equip';
    if (b.cls && b.cls !== this.d.cls) return `Only ${CLASSES[b.cls].name} can use this`;
    if (b.req > this.d.level) return `Requires Lv ${b.req}`;
    return null;
  }

  equip(uid: number) {
    const idx = this.d.inventory.findIndex(x => x.uid === uid);
    if (idx < 0) return false;
    const it = this.d.inventory[idx];
    if (this.canEquip(it)) return false;
    const slot = ITEMS[it.base].kind as Slot;
    const prev = this.d.equip[slot];
    this.d.inventory.splice(idx, 1);
    if (prev) this.d.inventory.splice(idx, 0, prev);
    this.d.equip[slot] = it;
    this.recalc();
    this.emit('equip', slot);
    this.emit('inventory');
    return true;
  }

  unequip(slot: Slot) {
    const it = this.d.equip[slot];
    if (!it || this.d.inventory.length >= INV_SIZE) return false;
    delete this.d.equip[slot];
    this.d.inventory.push(it);
    this.recalc();
    this.emit('equip', slot);
    this.emit('inventory');
    return true;
  }

  /** Infusion (enhancement). Returns 'ok' | 'fail' | 'down' | error string. */
  enhance(it: ItemInstance): string {
    if (it.plus >= 10) return 'Already at maximum infusion';
    const c = enhanceCost(it);
    if (this.d.gold < c.gold) return 'Not enough yen';
    if (this.countItem('fragment') < c.fragments) return 'Not enough Cursed Fragments';
    if (this.countItem('core') < c.cores) return 'Not enough Grade 1 Cores';
    this.d.gold -= c.gold;
    this.removeItem('fragment', c.fragments);
    if (c.cores) this.removeItem('core', c.cores);
    this.questProgress('enhance', '', 1);
    let res: string;
    if (Math.random() < c.rate) { it.plus++; res = 'ok'; }
    else if (it.plus >= 6 && Math.random() < 0.5) { it.plus--; res = 'down'; }
    else res = 'fail';
    this.recalc();
    this.emit('inventory');
    this.emit('gold');
    return res;
  }

  addGold(n: number) {
    this.d.gold += Math.round(n);
    this.emit('gold');
  }

  // ------------------------------------------------------------------
  // Quests
  // ------------------------------------------------------------------

  questState(id: string) { return this.d.quests[id]; }

  isAvailable(q: QuestDef) {
    if (this.d.quests[q.id]) return false;
    if (q.level && this.d.level < q.level) return false;
    if (q.prereq) for (const p of q.prereq) if (this.d.quests[p]?.state !== 'done') return false;
    return true;
  }

  /** Quests whose giver is this NPC and that could be offered (ignoring level for hint). */
  offersFor(npc: string) {
    return QUESTS.filter(q => q.giver === npc && this.isAvailable(q));
  }

  /** Active quests that this NPC turns in. */
  turnInsFor(npc: string) {
    return QUESTS.filter(q => {
      const st = this.d.quests[q.id];
      if (!st || st.state === 'done') return false;
      return (q.turnIn ?? q.giver) === npc;
    });
  }

  accept(id: string) {
    const q = QUEST_BY_ID[id];
    if (!q || this.d.quests[id]) return;
    this.d.quests[id] = { state: 'active', progress: q.objectives.map(() => 0) };
    this.emit('questAccept', q);
    // Collect objectives count what we already hold; reach objectives check the current map.
    this.questCheckCollect();
    this.questProgress('reach', this.d.map, 1);
    this.refreshQuest(id);
  }

  /** Generic progress event: kill/boss/talk/reach/enhance. */
  questProgress(type: string, target: string, n: number, map?: string) {
    for (const [id, st] of Object.entries(this.d.quests)) {
      if (st.state !== 'active') continue;
      const q = QUEST_BY_ID[id];
      if (!q) continue;
      let changed = false;
      q.objectives.forEach((o, i) => {
        // objectives are sequential: earlier unfinished objectives block later ones
        for (let k = 0; k < i; k++) if (!this.objectiveDone(q, k)) return;
        if (st.progress[i] >= objCount(o)) return;
        if (o.type === 'kill' && type === 'kill') {
          if ((o.target === 'any' || o.target.includes(target)) && (!o.map || o.map === map)) { st.progress[i] += n; changed = true; }
        } else if (o.type === 'boss' && type === 'boss' && o.target === target) { st.progress[i] = 1; changed = true; }
        else if (o.type === 'talk' && type === 'talk' && o.npc === target) { st.progress[i] = 1; changed = true; }
        else if (o.type === 'reach' && type === 'reach' && o.map === target) { st.progress[i] = 1; changed = true; }
        else if (o.type === 'enhance' && type === 'enhance') { st.progress[i] += n; changed = true; }
      });
      if (changed) this.refreshQuest(id);
    }
  }

  questCheckCollect() {
    for (const [id, st] of Object.entries(this.d.quests)) {
      if (st.state === 'done') continue;
      const q = QUEST_BY_ID[id];
      if (!q) continue;
      let changed = false;
      q.objectives.forEach((o, i) => {
        if (o.type === 'collect') {
          const have = Math.min(o.count, this.countItem(o.item));
          if (have !== st.progress[i]) { st.progress[i] = have; changed = true; }
        }
        if (o.type === 'pay') {
          const ok = this.d.gold >= o.gold ? 1 : 0;
          if (ok !== st.progress[i]) { st.progress[i] = ok; changed = true; }
        }
      });
      if (changed) this.refreshQuest(id);
    }
  }

  objectiveDone(q: QuestDef, i: number) {
    const st = this.d.quests[q.id];
    return !!st && st.progress[i] >= objCount(q.objectives[i]);
  }

  private refreshQuest(id: string) {
    const st = this.d.quests[id];
    const q = QUEST_BY_ID[id];
    if (!st || !q || st.state === 'done') return;
    const allDone = q.objectives.every((_, i) => this.objectiveDone(q, i));
    // a "talk" final objective to the turn-in NPC completes on talk directly
    const prev = st.state;
    st.state = allDone ? 'ready' : 'active';
    if (prev !== st.state && st.state === 'ready') this.emit('questReady', q);
    this.emit('quest', q);
  }

  complete(id: string) {
    const q = QUEST_BY_ID[id];
    const st = this.d.quests[id];
    if (!q || !st) return;
    st.state = 'done';
    for (const o of q.objectives) {
      if (o.type === 'collect' && ITEMS[o.item].questItem) this.removeItem(o.item, o.count);
      if (o.type === 'pay') this.addGold(-o.gold);
    }
    const r = q.rewards;
    if (r.fingers) { this.d.fingers += r.fingers; this.addItem(makeItem('finger', 0, r.fingers)); }
    for (const it of r.items ?? []) this.addItem(makeItem(it.id, it.rarity ?? 0, it.qty ?? 1));
    const ci = r.classItems?.[this.d.cls];
    if (ci) this.addItem(makeItem(ci, 1));
    this.addGold(r.gold);
    if (q.unlock) for (const u of q.unlock) this.d.flags['unlock_' + u] = true;
    this.emit('questDone', q);
    this.gainExp(r.exp);
    this.recalc();
  }

  activeQuests() {
    return QUESTS.filter(q => this.d.quests[q.id] && this.d.quests[q.id].state !== 'done');
  }

  /** The objective text for the HUD tracker (main quest first). */
  trackerText(): { name: string; text: string; ready: boolean } | null {
    const qs = this.activeQuests().sort((a, b) => (a.type === 'main' ? 0 : 1) - (b.type === 'main' ? 0 : 1));
    const q = qs[0];
    if (!q) {
      const next = QUESTS.find(x => x.type === 'main' && !this.d.quests[x.id]);
      if (next) {
        const lvlGate = next.level && this.d.level < next.level;
        return { name: next.name, text: lvlGate ? `Reach Lv ${next.level} — train and do side quests` : `Talk to ${npcName(next.giver)}`, ready: false };
      }
      return null;
    }
    const st = this.d.quests[q.id];
    if (st.state === 'ready') return { name: q.name, text: `Report to ${npcName(q.turnIn ?? q.giver)}`, ready: true };
    for (let i = 0; i < q.objectives.length; i++) {
      const o = q.objectives[i];
      if (!this.objectiveDone(q, i)) {
        const cnt = objCount(o);
        return { name: q.name, text: cnt > 1 ? `${o.label} (${st.progress[i]}/${cnt})` : o.label, ready: false };
      }
    }
    return { name: q.name, text: q.summary, ready: false };
  }

  // ------------------------------------------------------------------
  // Save / load
  // ------------------------------------------------------------------

  save() {
    this.d.uidCounter = getUidCounter();
    this.d.savedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY + this.d.slot, JSON.stringify(this.d));
      return true;
    } catch {
      return false;
    }
  }

  static load(slot: number): PlayerState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY + slot);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      if (!d || !d.cls) return null;
      d.slot = slot;
      // forward compatibility for older saves
      d.quick = d.quick ?? [null, null, null, null, null, null];
      while (d.quick.length < 6) d.quick.push(null);
      d.flags = d.flags ?? {};
      return new PlayerState(d);
    } catch {
      return null;
    }
  }

  static peek(slot: number): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY + slot);
      return raw ? JSON.parse(raw) as SaveData : null;
    } catch { return null; }
  }

  static erase(slot: number) {
    try { localStorage.removeItem(SAVE_KEY + slot); } catch { /* storage unavailable */ }
  }

  static useEnhanceCost = enhanceCost;
}

export function objCount(o: Objective) {
  if (o.type === 'kill' || o.type === 'collect' || o.type === 'enhance') return o.count;
  return 1;
}

import { NPC_NAMES } from '../data/story';
export function npcName(id: string) { return NPC_NAMES[id] ?? id; }
