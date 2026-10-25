// Full-screen menus (status, bag, skills, quests, map, system) and the shop,
// infusion workshop and travel windows.
import type { Game } from '../Game';
import { el, escapeHtml, formatNum } from '../core/util';
import { itemIcon, skillIcon } from './Icons';
import { ITEMS, RARITY_COLOR, RARITY_NAME, itemName, itemStats, formatStat, isGear, sellPrice, enhanceCost, makeItem, ItemBase, uniquesForLevel } from '../rpg/items';
import { Attr, ItemInstance, Slot, StatKey, PCT_KEYS } from '../rpg/types';
import { SKILLS, classSkills } from '../rpg/skills';
import { CLASSES, expToNext } from '../rpg/classes';
import { QUESTS, QUEST_BY_ID } from '../data/story';
import { MAPS, TRAVEL_LIST, travelUnlocked } from '../world/maps';
import { audio } from '../audio/Audio';
import { music } from '../audio/Music';
import { INV_SIZE, objCount } from '../rpg/PlayerState';

const TABS: [string, string, string][] = [['status', '状', 'Status'], ['bag', '袋', 'Bag'], ['skills', '術', 'Skills'], ['quests', '任', 'Quests'], ['map', '図', 'Map'], ['system', '設', 'System']];
const SLOT_NAMES: Record<Slot, string> = { weapon: 'Weapon', outfit: 'Uniform', charm: 'Charm', shoes: 'Shoes' };
const KIND_NAME: Record<string, string> = { weapon: 'Weapon', outfit: 'Uniform', charm: 'Charm', shoes: 'Shoes', consumable: 'Consumable', material: 'Material', quest: 'Quest Item' };

export class Menus {
  root: HTMLDivElement;
  private body: HTMLDivElement;
  private tabsEl: HTMLDivElement;
  tab = 'status';
  open = false;
  private selItem: number | null = null;
  private selSlot: Slot | null = null;
  private selSkill: string | null = null;
  private selQuest: string | null = null;
  private bagFilter: 'all' | 'gear' | 'use' | 'mat' = 'all';
  // shop state
  shop: { kind: string; npc: string } | null = null;
  private shopTab: 'buy' | 'sell' = 'buy';

  constructor(private game: Game, parent: HTMLElement) {
    this.root = el('div', 'menu hidden');
    const frame = el('div', 'menu-frame');
    this.tabsEl = el('div', 'menu-tabs');
    for (const [id, k, label] of TABS) {
      const b = el('button', 'menu-tab', `<span class="k">${k}</span><span class="l">${label}</span>`);
      b.dataset.tab = id;
      b.addEventListener('click', () => { audio.play('tab'); this.show(id); });
      this.tabsEl.appendChild(b);
    }
    const close = el('button', 'menu-close', '✕');
    close.addEventListener('click', () => this.close());
    this.body = el('div', 'menu-body');
    frame.append(this.tabsEl, close, this.body);
    this.root.appendChild(frame);
    parent.appendChild(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      // stopImmediatePropagation keeps Game's hotkey listener from reopening the system menu
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    });
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  show(tab: string) {
    this.shop = null;
    this.tab = tab;
    this.open = true;
    this.root.classList.remove('hidden');
    this.root.classList.remove('shop-mode');
    this.game.setState('menu');
    this.render();
  }

  openShop(kind: string, npc: string) {
    this.shop = { kind, npc };
    this.shopTab = 'buy';
    this.open = true;
    this.selItem = null;
    this.root.classList.remove('hidden');
    this.root.classList.add('shop-mode');
    this.game.setState('menu');
    audio.play('open');
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('hidden');
    audio.play('close');
    this.game.setState('play');
  }

  refresh() { if (this.open) this.render(); }

  private render() {
    for (const b of Array.from(this.tabsEl.children) as HTMLElement[]) b.classList.toggle('active', b.dataset.tab === this.tab && !this.shop);
    if (this.shop) {
      if (this.shop.kind === 'workshop') this.body.innerHTML = this.renderWorkshop();
      else if (this.shop.kind === 'travel') this.body.innerHTML = this.renderTravel();
      else this.body.innerHTML = this.renderShop();
      return;
    }
    switch (this.tab) {
      case 'status': this.body.innerHTML = this.renderStatus(); break;
      case 'bag': this.body.innerHTML = this.renderBag(); break;
      case 'skills': this.body.innerHTML = this.renderSkills(); break;
      case 'quests': this.body.innerHTML = this.renderQuests(); break;
      case 'map': this.body.innerHTML = this.renderMap(); this.drawWorldMap(); break;
      case 'system': this.body.innerHTML = this.renderSystem(); this.bindSystem(); break;
    }
  }

  // ------------------------------------------------------------------
  // Status
  // ------------------------------------------------------------------
  private renderStatus() {
    const ps = this.game.ps!;
    const d = ps.d, st = ps.stats, c = CLASSES[d.cls];
    const need = expToNext(d.level);
    const attrs: [Attr, string, string][] = [['str', 'STR', 'Physical power'], ['dex', 'DEX', 'Crit, speed, evasion'], ['vit', 'VIT', 'HP and defence'], ['ce', 'CE', 'Cursed energy and skill power']];
    const rows = attrs.map(([a, n, h]) => `<div class="attr"><div class="attr-n">${n}<small>${h}</small></div><div class="attr-v">${ps.totalAttr(a)}</div>
      ${d.statPoints > 0 ? `<button class="btn small" data-act="stat" data-a="${a}" data-n="1">+1</button><button class="btn small" data-act="stat" data-a="${a}" data-n="5">+5</button>` : ''}</div>`).join('');
    const sv = (k: keyof typeof st, label: string, fmt: 'n' | 'p' | 'r' = 'n') => `<div class="stat"><span>${label}</span><b>${fmt === 'p' ? (st[k] * 100).toFixed(1) + '%' : fmt === 'r' ? st[k].toFixed(1) + '/s' : formatNum(st[k] as number)}</b></div>`;
    const mins = Math.floor(d.playTime / 60);
    return `<div class="status">
      <div class="status-left">
        <div class="big-portrait" style="background-image:url(${this.game.portraits.get(c.model)})"></div>
        <div class="st-name" style="color:${c.color}">${c.name}</div>
        <div class="st-title">${c.title} · Lv ${d.level}</div>
        <div class="xp"><div class="xp-fill" style="width:${d.level >= 50 ? 100 : (d.exp / need * 100).toFixed(1)}%"></div><span>${d.level >= 50 ? 'MAX LEVEL' : `${formatNum(d.exp)} / ${formatNum(need)} EXP`}</span></div>
        <div class="fingers">Sukuna's Fingers <b>${d.fingers} / 20</b><small>+${d.fingers * 2}% ATK and Max HP</small></div>
        <div class="misc">Curses exorcised: <b>${formatNum(d.kills)}</b> · Play time: <b>${Math.floor(mins / 60)}h ${mins % 60}m</b></div>
      </div>
      <div class="status-right">
        <div class="panel-title">Attributes ${d.statPoints > 0 ? `<span class="pts">${d.statPoints} points</span>` : ''}</div>
        ${rows}
        <div class="panel-title">Combat</div>
        <div class="stats">
          ${sv('maxHp', 'Max HP')}${sv('maxCe', 'Max CE')}${sv('atk', 'Attack')}${sv('def', 'Defense')}
          ${sv('crit', 'Crit Rate', 'p')}${sv('critDmg', 'Crit Damage', 'p')}${sv('bfChance', 'Black Flash', 'p')}${sv('atkSpd', 'Attack Speed', 'p')}
          ${sv('evasion', 'Evasion', 'p')}${sv('dmgReduce', 'Damage Reduction', 'p')}${sv('skillPow', 'Skill Power', 'p')}${sv('cdr', 'Cooldown Reduction', 'p')}
          ${sv('ceRegen', 'CE Regen', 'r')}${sv('hpRegen', 'HP Regen', 'r')}${sv('lifesteal', 'Lifesteal', 'p')}${sv('summonPow', 'Shikigami Power', 'p')}
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------
  // Bag
  // ------------------------------------------------------------------
  private itemCell(it: ItemInstance | undefined, attrs: string, extra = '') {
    if (!it) return `<div class="cell empty" ${attrs}>${extra}</div>`;
    const b = ITEMS[it.base];
    return `<div class="cell r${it.rarity}" ${attrs}><img src="${itemIcon(b.icon, 72)}" alt="">${it.qty > 1 ? `<span class="qty">${it.qty}</span>` : ''}${it.plus ? `<span class="plus">+${it.plus}</span>` : ''}</div>`;
  }

  private renderBag() {
    const ps = this.game.ps!;
    const d = ps.d;
    const slots: Slot[] = ['weapon', 'outfit', 'charm', 'shoes'];
    const eq = slots.map(s => `<div class="eq-slot"><div class="eq-label">${SLOT_NAMES[s]}</div>${this.itemCell(d.equip[s], `data-act="selslot" data-slot="${s}"`, `<span class="ph">${SLOT_NAMES[s][0]}</span>`).replace('class="cell', `class="cell ${this.selSlot === s ? 'sel' : ''}`)}</div>`).join('');
    const filt = (it: ItemInstance) => {
      const k = ITEMS[it.base].kind;
      if (this.bagFilter === 'gear') return isGear(ITEMS[it.base]);
      if (this.bagFilter === 'use') return k === 'consumable';
      if (this.bagFilter === 'mat') return k === 'material' || k === 'quest';
      return true;
    };
    const items = d.inventory.filter(filt);
    const cells: string[] = [];
    for (let i = 0; i < Math.max(INV_SIZE, items.length); i++) {
      const it = items[i];
      cells.push(it ? this.itemCell(it, `data-act="selitem" data-uid="${it.uid}"`).replace('class="cell', `class="cell ${this.selItem === it.uid ? 'sel' : ''}`) : `<div class="cell empty"></div>`);
    }
    let detail = '<div class="detail-empty">Select an item</div>';
    const sel = this.selItem !== null ? d.inventory.find(x => x.uid === this.selItem) : this.selSlot ? d.equip[this.selSlot] : undefined;
    if (sel) detail = this.itemDetail(sel, !!this.selSlot);
    const fb = (id: string, label: string) => `<button class="chip ${this.bagFilter === id ? 'on' : ''}" data-act="filter" data-f="${id}">${label}</button>`;
    return `<div class="bag">
      <div class="bag-left">
        <div class="panel-title">Equipment</div>
        <div class="equip">${eq}</div>
        <div class="detail">${detail}</div>
      </div>
      <div class="bag-right">
        <div class="bag-head"><div class="filters">${fb('all', 'All')}${fb('gear', 'Gear')}${fb('use', 'Consumables')}${fb('mat', 'Materials')}</div><div class="cap">${d.inventory.length}/${INV_SIZE} · ¥${formatNum(d.gold)}</div></div>
        <div class="grid">${cells.join('')}</div>
      </div>
    </div>`;
  }

  private statLines(it: ItemInstance) {
    const s = itemStats(it);
    const b = ITEMS[it.base];
    const base = new Set(Object.keys(b.stats ?? {}));
    return Object.entries(s).map(([k, v]) => `<div class="${base.has(k) ? 'base' : 'affix'}">${formatStat(k as StatKey, v!)}</div>`).join('');
  }

  private compare(it: ItemInstance) {
    const ps = this.game.ps!;
    const b = ITEMS[it.base];
    if (!isGear(b)) return '';
    const cur = ps.d.equip[b.kind as Slot];
    if (!cur || cur.uid === it.uid) return '';
    const a = itemStats(it), c = itemStats(cur);
    const keys = new Set([...Object.keys(a), ...Object.keys(c)]);
    const out: string[] = [];
    for (const k of keys) {
      const diff = (a[k as StatKey] ?? 0) - (c[k as StatKey] ?? 0);
      if (Math.abs(diff) < 1e-6) continue;
      const pct = PCT_KEYS.has(k);
      const txt = pct ? (diff * 100).toFixed(1) + '%' : String(Math.round(diff * 10) / 10);
      out.push(`<span class="${diff > 0 ? 'up' : 'down'}">${formatStat(k as StatKey, Math.abs(diff)).replace(/\+.*/, '')}${diff > 0 ? '▲' : '▼'}${txt.replace('-', '')}</span>`);
    }
    return out.length ? `<div class="cmp"><small>vs equipped:</small> ${out.join(' ')}</div>` : '';
  }

  private itemDetail(it: ItemInstance, equipped: boolean) {
    const ps = this.game.ps!;
    const b = ITEMS[it.base];
    const err = isGear(b) ? ps.canEquip(it) : null;
    const actions: string[] = [];
    if (isGear(b)) {
      if (equipped) actions.push(`<button class="btn" data-act="unequip" data-slot="${b.kind}">Unequip</button>`);
      else actions.push(`<button class="btn primary" data-act="equip" data-uid="${it.uid}" ${err ? 'disabled' : ''}>Equip</button>`);
    }
    if (b.kind === 'consumable') {
      actions.push(`<button class="btn primary" data-act="use" data-id="${b.id}">Use</button>`);
      if (!b.use?.warp) actions.push(`<button class="btn" data-act="pot" data-id="${b.id}" data-i="0">Set Slot 1</button><button class="btn" data-act="pot" data-id="${b.id}" data-i="1">Set Slot 2</button>`);
    }
    if (!equipped && !b.questItem) actions.push(`<button class="btn danger" data-act="discard" data-uid="${it.uid}">Discard</button>`);
    return `<div class="item-detail">
      <div class="id-head"><img src="${itemIcon(b.icon, 96)}" class="r${it.rarity}"><div>
        <div class="id-name" style="color:${RARITY_COLOR[it.rarity]}">${escapeHtml(itemName(it))}${it.qty > 1 ? ` ×${it.qty}` : ''}</div>
        <div class="id-sub">${RARITY_NAME[it.rarity]} ${KIND_NAME[b.kind]}${b.cls ? ' · ' + CLASSES[b.cls].name.split(' ')[0] : ''}${b.req > 1 ? ` · Lv ${b.req}` : ''}</div>
      </div></div>
      <div class="id-stats">${this.statLines(it)}</div>
      ${this.compare(it)}
      ${b.desc ? `<div class="id-desc">${escapeHtml(b.desc)}</div>` : ''}
      ${err ? `<div class="id-err">${err}</div>` : ''}
      <div class="id-actions">${actions.join('')}</div>
    </div>`;
  }

  // ------------------------------------------------------------------
  // Skills
  // ------------------------------------------------------------------
  private renderSkills() {
    const ps = this.game.ps!;
    const d = ps.d;
    const list = classSkills(d.cls);
    const grid: string[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const s = list.find(x => x.row === row && x.col === col);
        if (!s) { grid.push('<div class="sk empty"></div>'); continue; }
        const lv = ps.skillLevel(s.id);
        const can = !ps.canLearn(s.id);
        grid.push(`<div class="sk ${lv ? 'learned' : 'locked'} ${this.selSkill === s.id ? 'sel' : ''} ${s.type}" data-act="selskill" data-id="${s.id}">
          <img src="${skillIcon(s.id, 80)}"><div class="sk-lv">${lv}/${s.max}</div>${can ? '<div class="sk-up">▲</div>' : ''}<div class="sk-n">${escapeHtml(s.name.replace(/^.*?: /, ''))}</div></div>`);
      }
    }
    let detail = '<div class="detail-empty">Select a technique</div>';
    const s = this.selSkill ? SKILLS[this.selSkill] : null;
    if (s) {
      const lv = ps.skillLevel(s.id);
      const err = ps.canLearn(s.id);
      const cur = lv > 0 ? s.desc(lv) : '';
      const next = lv < s.max ? s.desc(lv + 1) : '';
      const slotBtns = s.type === 'active' && lv > 0 ? [0, 1, 2, 3, 4].map(i => `<button class="btn small ${d.quick[i] === s.id ? 'on' : ''}" data-act="quick" data-id="${s.id}" data-i="${i}">${i + 1}</button>`).join('') : s.type === 'ultimate' && lv > 0 ? `<button class="btn small ${d.quick[5] === s.id ? 'on' : ''}" data-act="quick" data-id="${s.id}" data-i="5">ULT</button>` : '';
      detail = `<div class="skill-detail">
        <div class="id-head"><img src="${skillIcon(s.id, 96)}"><div><div class="id-name" style="color:${s.color}">${escapeHtml(s.name)}</div>
        <div class="id-sub">${s.type === 'passive' ? 'Passive' : s.type === 'ultimate' ? 'Ultimate' : 'Active'} · Lv ${lv}/${s.max}${s.ce && s.type === 'active' ? ` · CE ${s.ce(Math.max(1, lv))}` : ''}${s.cd && s.type !== 'passive' ? ` · CD ${s.cd(Math.max(1, lv))}s` : ''}</div></div></div>
        ${cur ? `<div class="sd-cur"><b>Current</b>${escapeHtml(cur)}</div>` : ''}
        ${next ? `<div class="sd-next"><b>${lv ? 'Next level' : 'Learn'}</b>${escapeHtml(next)}</div>` : ''}
        <div class="sd-req">${s.prereq ? `Requires ${SKILLS[s.prereq[0]].name} Lv ${s.prereq[1]} · ` : ''}Unlocks at Lv ${s.req}</div>
        <div class="id-actions"><button class="btn primary" data-act="learn" data-id="${s.id}" ${err ? 'disabled' : ''}>${lv ? 'Level up' : 'Learn'}</button>${err && lv < s.max ? `<span class="id-err">${err}</span>` : ''}</div>
        ${slotBtns ? `<div class="slots"><small>Quick slot:</small> ${slotBtns}</div>` : ''}
      </div>`;
    }
    return `<div class="skills">
      <div class="skills-left"><div class="panel-title">${CLASSES[d.cls].title} Techniques <span class="pts">${d.skillPoints} SP</span></div><div class="sk-grid">${grid.join('')}</div></div>
      <div class="skills-right">${detail}</div>
    </div>`;
  }

  // ------------------------------------------------------------------
  // Quests
  // ------------------------------------------------------------------
  private renderQuests() {
    const ps = this.game.ps!;
    const act = QUESTS.filter(q => ps.questState(q.id) && ps.questState(q.id)!.state !== 'done');
    const done = QUESTS.filter(q => ps.questState(q.id)?.state === 'done');
    const avail = QUESTS.filter(q => ps.isAvailable(q));
    if (!this.selQuest && act.length) this.selQuest = act[0].id;
    const row = (q: typeof QUESTS[0], cls: string) => `<div class="q-row ${cls} ${this.selQuest === q.id ? 'sel' : ''}" data-act="selquest" data-id="${q.id}"><span class="q-type ${q.type}">${q.type === 'main' ? '本' : '依'}</span>${escapeHtml(q.name)}${ps.questState(q.id)?.state === 'ready' ? ' <b class="rdy">✔</b>' : ''}</div>`;
    let detail = '<div class="detail-empty">No quest selected</div>';
    const q = this.selQuest ? QUEST_BY_ID[this.selQuest] : null;
    if (q) {
      const st = ps.questState(q.id);
      const objs = q.objectives.map((o, i) => {
        const n = objCount(o);
        const pr = st ? Math.min(n, st.progress[i] ?? 0) : 0;
        const ok = st?.state === 'done' || pr >= n;
        return `<div class="obj ${ok ? 'ok' : ''}">${ok ? '✔' : '◇'} ${escapeHtml(o.label)}${n > 1 ? ` (${pr}/${n})` : ''}</div>`;
      }).join('');
      const r = q.rewards;
      const items = [...(r.items ?? []).map(i => `${ITEMS[i.id].name}${(i.qty ?? 1) > 1 ? ' ×' + i.qty : ''}`), ...(r.classItems?.[ps.d.cls] ? [ITEMS[r.classItems[ps.d.cls]!].name] : []), ...(r.fingers ? ["Sukuna's Finger"] : [])];
      detail = `<div class="quest-detail">
        <div class="id-name">${escapeHtml(q.name)}</div>
        <div class="id-sub">${q.type === 'main' ? `Main story · Chapter ${q.chapter}` : 'Side request'} · ${escapeHtml((q.turnIn ?? q.giver) === q.giver ? 'From ' + this.npcName(q.giver) : this.npcName(q.giver) + ' → ' + this.npcName(q.turnIn!))}</div>
        <div class="q-sum">${escapeHtml(q.summary)}</div>
        <div class="objs">${objs}</div>
        <div class="rewards"><b>Rewards</b> ${formatNum(r.exp)} EXP · ¥${formatNum(r.gold)}${items.length ? ' · ' + items.map(escapeHtml).join(', ') : ''}</div>
        ${!st ? `<div class="id-err">Talk to ${escapeHtml(this.npcName(q.giver))} to accept${q.level ? ` (Lv ${q.level})` : ''}.</div>` : ''}
      </div>`;
    }
    return `<div class="quests">
      <div class="quests-left">
        <div class="panel-title">Active</div>${act.map(q => row(q, 'qa')).join('') || '<div class="none">None</div>'}
        ${avail.length ? `<div class="panel-title">Available</div>${avail.map(q => row(q, 'qv')).join('')}` : ''}
        <div class="panel-title">Completed</div>${done.map(q => row(q, 'qd')).join('') || '<div class="none">None yet</div>'}
      </div>
      <div class="quests-right">${detail}</div>
    </div>`;
  }

  private npcName(id: string) { return ({ gojo: 'Gojo', yaga: 'Yaga', shoko: 'Shoko', maki: 'Maki', panda: 'Panda', inumaki: 'Inumaki', ijichi: 'Ijichi', nanami: 'Nanami', junpei: 'Junpei', todo: 'Todo', miwa: 'Miwa', meimei: 'Mei Mei' } as Record<string, string>)[id] ?? id; }

  // ------------------------------------------------------------------
  // Map
  // ------------------------------------------------------------------
  private renderMap() {
    const ps = this.game.ps!;
    const cur = MAPS[ps.d.map];
    const list = TRAVEL_LIST.map(t => {
      const ok = travelUnlocked(ps, t.id);
      const m = MAPS[t.id];
      return `<div class="map-row ${ok ? '' : 'locked'} ${t.id === ps.d.map ? 'here' : ''}"><b>${m.name}</b><small>${m.jp} · ${t.level}</small>${t.id === ps.d.map ? '<span class="here-tag">YOU ARE HERE</span>' : ok ? '' : '<span>🔒</span>'}</div>`;
    }).join('');
    return `<div class="mapview"><canvas class="world-map" width="640" height="440"></canvas><div class="map-side"><div class="panel-title">${cur.name}</div><div class="id-sub">${cur.jp}</div>${list}<div class="hint">Travel between areas with Ijichi's car (⛩ marker), or use a Return Talisman.</div></div></div>`;
  }

  private drawWorldMap() {
    const c = this.body.querySelector('.world-map') as HTMLCanvasElement;
    if (!c) return;
    const x = c.getContext('2d')!;
    const ps = this.game.ps!;
    const g = x.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#0c1428'); g.addColorStop(1, '#05070e');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    // stylised Honshu coastline
    x.fillStyle = '#1a2a24';
    x.strokeStyle = '#3a5a4a'; x.lineWidth = 3;
    x.beginPath();
    const coast = [[90, 400], [150, 330], [230, 300], [300, 260], [380, 250], [430, 200], [470, 140], [520, 80], [575, 40], [610, 60], [590, 130], [560, 200], [520, 260], [470, 300], [420, 340], [360, 370], [290, 400], [200, 420], [110, 430]];
    x.moveTo(coast[0][0], coast[0][1]);
    for (const [a, b] of coast) x.lineTo(a, b);
    x.closePath(); x.fill(); x.stroke();
    const nodes: Record<string, [number, number]> = { sugisawa: [560, 110], hub: [430, 296], eishu: [500, 240], kawasaki: [392, 342], sewer: [395, 345], kyoto: [240, 350], shibuya: [462, 330] };
    const labelOff: Record<string, [number, number, CanvasTextAlign]> = { sugisawa: [0, -16, 'center'], hub: [-14, -10, 'right'], eishu: [14, 4, 'left'], kawasaki: [-14, 16, 'right'], kyoto: [0, -16, 'center'], shibuya: [14, 18, 'left'] };
    x.strokeStyle = 'rgba(160,140,255,0.4)'; x.setLineDash([6, 6]); x.lineWidth = 2;
    for (const id of ['sugisawa', 'eishu', 'kawasaki', 'kyoto', 'shibuya']) { x.beginPath(); x.moveTo(...nodes.hub); x.lineTo(...nodes[id]); x.stroke(); }
    x.setLineDash([]);
    for (const [id, [nx, ny]] of Object.entries(nodes)) {
      if (id === 'sewer') continue;
      const ok = travelUnlocked(ps, id);
      const here = ps.d.map === id || (ps.d.map === 'sewer' && id === 'kawasaki');
      x.beginPath(); x.arc(nx, ny, here ? 11 : 8, 0, Math.PI * 2);
      x.fillStyle = here ? '#ffd23a' : ok ? '#b08aff' : '#3a3a4a'; x.fill();
      x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke();
      const [lx, ly, al] = labelOff[id] ?? [0, -16, 'center'];
      x.fillStyle = ok ? '#fff' : '#777'; x.font = 'bold 15px sans-serif'; x.textAlign = al;
      x.fillText(MAPS[id].name, nx + lx, ny + ly);
    }
    x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '13px serif'; x.textAlign = 'left';
    x.fillText('呪術地図 — Jujutsu Map', 16, 26);
  }

  // ------------------------------------------------------------------
  // System
  // ------------------------------------------------------------------
  private renderSystem() {
    const s = this.game.settings;
    const sl = (id: string, label: string, v: number) => `<label class="set"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(v * 100)}" data-set="${id}"></label>`;
    const q = (v: string, l: string) => `<button class="chip ${s.quality === v ? 'on' : ''}" data-act="quality" data-q="${v}">${l}</button>`;
    const z = (v: number, l: string) => `<button class="chip ${s.zoom === v ? 'on' : ''}" data-act="zoom" data-z="${v}">${l}</button>`;
    return `<div class="system">
      <div class="sys-col">
        <div class="panel-title">Game</div>
        <button class="btn primary wide" data-act="save">Save Game</button>
        <button class="btn wide" data-act="title">Save &amp; Return to Title</button>
        <div class="panel-title">Controls</div>
        <div class="help">Touch: drag the left half of the screen to move. Tap or hold <b>攻</b> to attack (it becomes <b>話</b> to talk). Skills sit around it, <b>回避</b> dodges, the gold-rimmed button is your Ultimate.<br>Keyboard: WASD move · J/Space attack · 1–5 skills · R ultimate · Shift dodge · Q/E potions · F talk · I/K/L/M menus · Esc close.</div>
      </div>
      <div class="sys-col">
        <div class="panel-title">Audio</div>
        ${sl('music', 'Music', s.music)}${sl('sfx', 'Effects', s.sfx)}${sl('amb', 'Ambience', s.amb)}
        <div class="panel-title">Graphics</div>
        <div class="chips">${q('low', 'Low')}${q('medium', 'Medium')}${q('high', 'High')}</div>
        <div class="panel-title">Camera</div>
        <div class="chips">${z(0.8, 'Near')}${z(1, 'Normal')}${z(1.25, 'Far')}</div>
        <div class="credits">Cursed Chronicles is an unofficial, non-commercial fan game inspired by Jujutsu Kaisen and Zenonia. All models, sounds and music are procedurally generated. Jujutsu Kaisen © Gege Akutami / Shueisha.</div>
      </div>
    </div>`;
  }

  private bindSystem() {
    for (const inp of Array.from(this.body.querySelectorAll('input[data-set]')) as HTMLInputElement[]) {
      inp.addEventListener('input', () => {
        const v = +inp.value / 100;
        (this.game.settings as any)[inp.dataset.set!] = v;
        this.game.applySettings();
      });
    }
  }

  // ------------------------------------------------------------------
  // Shops
  // ------------------------------------------------------------------
  private stock(kind: string): ItemBase[] {
    const ps = this.game.ps!;
    const L = ps.d.level;
    const all = Object.values(ITEMS);
    if (kind === 'potions') return ['hpS', 'hpM', 'hpL', 'ceS', 'ceM', 'ceL', 'onigiri', 'warp'].map(id => ITEMS[id]).filter(b => b.req <= L + 3);
    if (kind === 'armory') return all.filter(b => isGear(b) && !b.unique && b.req <= L + 4 && (!b.cls || b.cls === ps.d.cls)).sort((a, b) => a.req - b.req);
    if (kind === 'exchange') return [ITEMS.core, ITEMS.fragment, ...uniquesForLevel(L).filter(b => !b.cls || b.cls === ps.d.cls)];
    return [];
  }

  private price(b: ItemBase) {
    if (this.shop?.kind === 'exchange') return b.id === 'core' ? 900 : b.id === 'fragment' ? 60 : b.price * 3;
    return b.price;
  }

  private renderShop() {
    const ps = this.game.ps!;
    const kind = this.shop!.kind;
    const title = kind === 'potions' ? "Shoko's Infirmary" : kind === 'armory' ? "Maki's Armory" : "Mei Mei's Exchange";
    const sub = kind === 'potions' ? 'Remedies, tonics and talismans' : kind === 'armory' ? 'Cursed tools and gear' : 'Rare goods. Rarer prices.';
    let rows = '';
    if (this.shopTab === 'buy') {
      rows = this.stock(kind).map(b => {
        const p = this.price(b);
        const lock = b.req > ps.d.level + (kind === 'armory' ? 0 : 3);
        const stack = (b.stack ?? 1) > 1;
        return `<div class="shop-row ${lock ? 'locked' : ''}"><img src="${itemIcon(b.icon, 64)}" class="r${b.unique ? 3 : 0}"><div class="sr-info"><b style="color:${b.unique ? RARITY_COLOR[3] : '#fff'}">${escapeHtml(b.name)}</b><small>${escapeHtml(b.desc ?? this.statSummary(b))}${b.req > 1 ? ` · Lv ${b.req}` : ''}</small></div>
          <div class="sr-price">¥${formatNum(p)}</div>
          <button class="btn small primary" data-act="buy" data-id="${b.id}" data-n="1" ${ps.d.gold < p ? 'disabled' : ''}>Buy</button>${stack ? `<button class="btn small" data-act="buy" data-id="${b.id}" data-n="10" ${ps.d.gold < p * 10 ? 'disabled' : ''}>×10</button>` : ''}</div>`;
      }).join('');
    } else {
      rows = ps.d.inventory.filter(it => !ITEMS[it.base].questItem).map(it => {
        const b = ITEMS[it.base];
        const p = sellPrice(it);
        return `<div class="shop-row"><img src="${itemIcon(b.icon, 64)}" class="r${it.rarity}"><div class="sr-info"><b style="color:${RARITY_COLOR[it.rarity]}">${escapeHtml(itemName(it))}${it.qty > 1 ? ' ×' + it.qty : ''}</b><small>${RARITY_NAME[it.rarity]} ${KIND_NAME[b.kind]}</small></div>
          <div class="sr-price">¥${formatNum(p)}</div><button class="btn small" data-act="sell" data-uid="${it.uid}" data-n="1">Sell</button>${it.qty > 1 ? `<button class="btn small" data-act="sell" data-uid="${it.uid}" data-n="${it.qty}">All</button>` : ''}</div>`;
      }).join('') || '<div class="none">Nothing to sell.</div>';
    }
    return `<div class="shop">
      <div class="shop-head"><div class="shop-portrait" style="background-image:url(${this.game.portraits.get(this.shop!.npc)})"></div><div><div class="id-name">${title}</div><div class="id-sub">${sub}</div></div>
        <div class="shop-gold">¥${formatNum(ps.d.gold)}</div></div>
      <div class="chips"><button class="chip ${this.shopTab === 'buy' ? 'on' : ''}" data-act="shoptab" data-t="buy">Buy</button><button class="chip ${this.shopTab === 'sell' ? 'on' : ''}" data-act="shoptab" data-t="sell">Sell</button></div>
      <div class="shop-list">${rows}</div>
    </div>`;
  }

  private statSummary(b: ItemBase) {
    return Object.entries(b.stats ?? {}).map(([k, v]) => formatStat(k as StatKey, v!)).join(', ');
  }

  private renderWorkshop() {
    const ps = this.game.ps!;
    const gear: ItemInstance[] = [...Object.values(ps.d.equip).filter(Boolean) as ItemInstance[], ...ps.d.inventory.filter(it => isGear(ITEMS[it.base]))];
    if (this.selItem === null && gear.length) this.selItem = gear[0].uid;
    const sel = gear.find(g => g.uid === this.selItem);
    const list = gear.map(it => this.itemCell(it, `data-act="wsel" data-uid="${it.uid}"`).replace('class="cell', `class="cell ${this.selItem === it.uid ? 'sel' : ''}`)).join('');
    let detail = '<div class="detail-empty">No equipment to infuse</div>';
    if (sel) {
      const c = enhanceCost(sel);
      const maxed = sel.plus >= 10;
      const preview = maxed ? '' : (() => { const nx = { ...sel, plus: sel.plus + 1 }; return `<div class="ws-next"><b>After infusion</b>${this.statLines(nx)}</div>`; })();
      detail = `<div class="item-detail">
        <div class="id-head"><img src="${itemIcon(ITEMS[sel.base].icon, 96)}" class="r${sel.rarity}"><div><div class="id-name" style="color:${RARITY_COLOR[sel.rarity]}">${escapeHtml(itemName(sel))}</div><div class="id-sub">Infusion +${sel.plus} / +10</div></div></div>
        <div class="id-stats">${this.statLines(sel)}</div>${preview}
        ${maxed ? '<div class="id-desc">This item cannot hold any more cursed energy.</div>' : `<div class="ws-cost">
          <div>Success rate <b>${Math.round(c.rate * 100)}%</b>${sel.plus >= 6 ? ' <small class="warn">(failure may drop a level)</small>' : ''}</div>
          <div>Cost <b>¥${formatNum(c.gold)}</b> (have ¥${formatNum(ps.d.gold)})</div>
          <div>Cursed Fragments <b>${c.fragments}</b> (have ${ps.countItem('fragment')})</div>
          ${c.cores ? `<div>Grade 1 Cores <b>${c.cores}</b> (have ${ps.countItem('core')})</div>` : ''}
        </div><div class="id-actions"><button class="btn primary" data-act="infuse" data-uid="${sel.uid}">Infuse</button></div>`}
      </div>`;
    }
    return `<div class="shop workshop">
      <div class="shop-head"><div class="shop-portrait" style="background-image:url(${this.game.portraits.get('yaga')})"></div><div><div class="id-name">Yaga's Workshop</div><div class="id-sub">Weave cursed energy into your equipment</div></div></div>
      <div class="ws-body"><div class="grid small">${list}</div><div class="detail">${detail}</div></div>
    </div>`;
  }

  private renderTravel() {
    const ps = this.game.ps!;
    const rows = TRAVEL_LIST.map(t => {
      const ok = travelUnlocked(ps, t.id);
      const m = MAPS[t.id];
      const here = ps.d.map === t.id;
      return `<div class="shop-row ${ok ? '' : 'locked'}"><div class="travel-kanji">${m.jp.slice(0, 2)}</div><div class="sr-info"><b>${m.name}</b><small>${m.jp} · ${t.level}</small></div>
        ${here ? '<span class="here-tag">HERE</span>' : `<button class="btn small primary" data-act="travel" data-id="${t.id}" ${ok ? '' : 'disabled'}>${ok ? 'Go' : 'Locked'}</button>`}</div>`;
    }).join('');
    return `<div class="shop travel"><div class="shop-head"><div class="shop-portrait" style="background-image:url(${this.game.portraits.get('ijichi')})"></div><div><div class="id-name">Ijichi's Car</div><div class="id-sub">"P-please fasten your seatbelt."</div></div></div><div class="shop-list">${rows}</div></div>`;
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) { if (e.target === this.root) this.close(); return; }
    const ps = this.game.ps!;
    const a = t.dataset.act!;
    const uid = t.dataset.uid ? +t.dataset.uid : null;
    switch (a) {
      case 'stat': ps.spendStat(t.dataset.a as Attr, +(t.dataset.n ?? 1)); audio.play('click'); break;
      case 'selitem': this.selItem = uid; this.selSlot = null; audio.play('click', { vol: 0.5 }); break;
      case 'selslot': this.selSlot = t.dataset.slot as Slot; this.selItem = null; audio.play('click', { vol: 0.5 }); break;
      case 'filter': this.bagFilter = t.dataset.f as any; break;
      case 'equip': if (uid !== null && ps.equip(uid)) { audio.play('equip'); this.selItem = null; } break;
      case 'unequip': if (ps.unequip(t.dataset.slot as Slot)) { audio.play('equip', { pitch: 0.8 }); this.selSlot = null; } break;
      case 'use': {
        const ok = this.game.world.player.useItem(t.dataset.id!);
        if (ok && ITEMS[t.dataset.id!].use?.warp) { this.close(); return; }
        break;
      }
      case 'pot': ps.d.potions[+t.dataset.i!] = t.dataset.id!; audio.play('equip'); this.game.toast(`${ITEMS[t.dataset.id!].name} set to potion slot ${+t.dataset.i! + 1}`, 'info'); break;
      case 'discard': {
        const it = ps.d.inventory.find(x => x.uid === uid);
        if (it && confirm(`Discard ${itemName(it)}?`)) { ps.removeInstance(it.uid); this.selItem = null; }
        break;
      }
      case 'selskill': this.selSkill = t.dataset.id!; audio.play('click', { vol: 0.5 }); break;
      case 'learn': if (ps.learn(t.dataset.id!)) { audio.play('skillUp'); } else audio.play('error'); break;
      case 'quick': {
        const i = +t.dataset.i!;
        const id = t.dataset.id!;
        const prev = ps.d.quick.indexOf(id);
        if (prev >= 0) ps.d.quick[prev] = null;
        ps.d.quick[i] = id;
        audio.play('equip');
        break;
      }
      case 'selquest': this.selQuest = t.dataset.id!; audio.play('click', { vol: 0.5 }); break;
      case 'save': this.game.save(true); break;
      case 'title': this.game.save(false); this.close(); this.game.toTitle(); return;
      case 'quality': this.game.settings.quality = t.dataset.q as any; this.game.settings.autoQ = false; this.game.applySettings(); break;
      case 'zoom': this.game.settings.zoom = +t.dataset.z!; this.game.applySettings(); break;
      case 'shoptab': this.shopTab = t.dataset.t as any; break;
      case 'buy': {
        const b = ITEMS[t.dataset.id!];
        const n = +(t.dataset.n ?? 1);
        const p = this.price(b) * n;
        if (ps.d.gold < p) { audio.play('error'); break; }
        const it = makeItem(b.id, 0, n);
        if (!ps.addItem(it)) { audio.play('error'); this.game.toast('Inventory full!', 'warn'); break; }
        ps.addGold(-p);
        ps.questCheckCollect();
        audio.play('buy');
        break;
      }
      case 'sell': {
        const it = ps.d.inventory.find(x => x.uid === uid);
        if (!it) break;
        const n = Math.min(it.qty, +(t.dataset.n ?? 1));
        const per = sellPrice({ ...it, qty: 1 });
        if (n >= it.qty) ps.removeInstance(it.uid); else { it.qty -= n; ps.emit('inventory'); }
        ps.addGold(per * n);
        audio.play('coin');
        break;
      }
      case 'wsel': this.selItem = uid; audio.play('click', { vol: 0.5 }); break;
      case 'infuse': {
        const gear = [...Object.values(ps.d.equip), ...ps.d.inventory].find(x => x && x.uid === uid) as ItemInstance | undefined;
        if (!gear) break;
        const res = ps.enhance(gear);
        if (res === 'ok') { audio.play('enhanceOk'); this.game.toast(`Infusion succeeded! ${itemName(gear)}`, 'good', 2); this.game.world.player.refreshWeapon(); }
        else if (res === 'fail') { audio.play('enhanceFail'); this.game.toast('The cursed energy dispersed… infusion failed.', 'warn', 2); }
        else if (res === 'down') { audio.play('enhanceFail'); this.game.toast(`Backlash! ${itemName(gear)} lost a level.`, 'warn', 2); this.game.world.player.refreshWeapon(); }
        else { audio.play('error'); this.game.toast(res, 'warn'); }
        break;
      }
      case 'travel': this.close(); this.game.travel(t.dataset.id!); return;
    }
    this.render();
    void music;
  }
}
