// Skill trees for the three first-years. Each active skill is a small script
// that talks to the world through WorldAPI.
import { ClassId, StatKey } from './types';
import { Caster, Target, WorldAPI } from '../world/api';

export interface SkillDef {
  id: string;
  cls: ClassId;
  name: string;
  type: 'active' | 'passive' | 'ultimate';
  req: number;
  max: number;
  prereq?: [string, number];
  row: number;
  col: number;
  desc: (lv: number) => string;
  ce?: (lv: number) => number;
  cd?: (lv: number) => number;
  anim?: string;
  animDur?: number;
  range?: number;
  passive?: (lv: number) => Partial<Record<StatKey, number>>;
  cast?: (w: WorldAPI, c: Caster, lv: number, t: Target | null, dx: number, dz: number) => void;
  color: string;
}

const m = (base: number, lv: number) => base * (1 + 0.16 * (lv - 1));
const pct = (v: number) => Math.round(v * 100) + '%';

/** Direction toward a target or the caster's facing. */
function aim(c: Caster, t: Target | null, dx: number, dz: number) {
  if (t) {
    const ax = t.x - c.x, az = t.z - c.z;
    const d = Math.hypot(ax, az) || 1;
    return { x: ax / d, z: az / d, dist: d };
  }
  const d = Math.hypot(dx, dz);
  if (d > 0.1) return { x: dx / d, z: dz / d, dist: 4 };
  return { x: Math.sin(c.facing), z: Math.cos(c.facing), dist: 4 };
}

export const SKILLS: Record<string, SkillDef> = {};
function reg(s: SkillDef) { SKILLS[s.id] = s; }

// ===========================================================================
// Yuji Itadori
// ===========================================================================

reg({
  id: 'divergent', cls: 'yuji', name: 'Divergent Fist', type: 'active', req: 1, max: 5, row: 0, col: 0, color: '#6ab8ff',
  desc: lv => `Dash and strike for ${pct(m(1.5, lv))} ATK; cursed energy lands a beat later for another ${pct(m(1.1, lv))} in an area.`,
  ce: lv => 10 + lv * 2, cd: () => 4, anim: 'punch1', animDur: 0.45, range: 5,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    c.dash(a.x, a.z, Math.min(2.6, Math.max(0.5, a.dist - 1.2)), 0.14);
    w.sfx('divergent', c.x, c.z);
    w.schedule(0.14, () => {
      w.fx.slash(c.x, c.z, Math.atan2(a.x, a.z), 1.6, 0xbfe4ff, 1.4);
      w.damageCone(c, c.x, c.z, Math.atan2(a.x, a.z), 2.4, 1.7, m(1.5, lv), { kind: 'skill', knock: 0.8 });
    });
    w.schedule(0.33, () => {
      const px = c.x + a.x * 1.4, pz = c.z + a.z * 1.4;
      w.fx.shockwave(px, pz, 2.2, 0x6ab8ff);
      w.fx.burst(px, 1, pz, 0x8ad0ff, 26, 6, 0.35);
      w.fx.light(px, 1, pz, 0x6ab8ff, 14, 0.3);
      w.fx.shake(0.25);
      w.damageArea(c, px, pz, 2.1, m(1.1, lv), { kind: 'skill', knock: 2 });
    });
  },
});

reg({
  id: 'manji', cls: 'yuji', name: 'Manji Kick', type: 'active', req: 3, max: 5, row: 0, col: 1, color: '#ffb05a',
  desc: lv => `Whirling kick hits everything around you for ${pct(m(1.35, lv))} ATK and knocks enemies back.`,
  ce: lv => 12 + lv * 2, cd: () => 6, anim: 'spinKick', animDur: 0.5,
  cast: (w, c, lv) => {
    w.sfx('swingHeavy', c.x, c.z);
    w.schedule(0.18, () => {
      w.fx.ring(c.x, c.z, 0xffd08a, 2.9, 0.35, 0.5);
      w.fx.slash(c.x, c.z, c.facing, 2.4, 0xffe0b0, Math.PI * 2, 0);
      w.sfx('kick', c.x, c.z);
      w.damageArea(c, c.x, c.z, 2.9, m(1.35, lv), { kind: 'skill', knock: 3.5 });
    });
  },
});

reg({
  id: 'rush', cls: 'yuji', name: 'Cursed Rush', type: 'active', req: 6, max: 5, row: 1, col: 0, prereq: ['divergent', 2], color: '#ff6a6a',
  desc: lv => `A six-hit barrage, each blow dealing ${pct(m(0.48, lv))} ATK.`,
  ce: lv => 18 + lv * 2, cd: () => 8, anim: 'channel', animDur: 0.75, range: 3,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const dir = Math.atan2(a.x, a.z);
    for (let i = 0; i < 6; i++) {
      w.schedule(i * 0.11, () => {
        c.model?.play(i % 2 ? 'punch2' : 'punch1', 0.12);
        w.fx.slash(c.x + a.x * 0.8, c.z + a.z * 0.8, dir + (Math.random() - 0.5), 1.0, 0xffc0c0, 1.2, Math.random() * 2 - 1);
        w.sfx('punch', c.x, c.z, 0.6, 0.9 + Math.random() * 0.3);
        w.damageCone(c, c.x, c.z, dir, 2.5, 1.5, m(0.48, lv), { kind: 'skill', quiet: i % 2 === 1 });
      });
    }
  },
});

reg({
  id: 'slam', cls: 'yuji', name: 'Meteor Slam', type: 'active', req: 10, max: 5, row: 1, col: 1, prereq: ['manji', 2], color: '#ff9a3a',
  desc: lv => `Leap and smash the ground: ${pct(m(2.2, lv))} ATK in a wide radius and stuns for 1.2s.`,
  ce: lv => 26 + lv * 3, cd: () => 12, anim: 'slam', animDur: 0.62, range: 4,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    c.dash(a.x, a.z, Math.min(3, Math.max(0, a.dist - 0.5)), 0.32, true);
    w.sfx('swingHeavy', c.x, c.z);
    w.schedule(0.34, () => {
      w.sfx('shockwave', c.x, c.z);
      w.fx.shockwave(c.x, c.z, 4.2, 0xffb070);
      w.fx.spikes(c.x, c.z, 3.5, 0x8a7a6a, 14);
      w.fx.smoke(c.x, c.z, 0xb0a090, 16);
      w.fx.shake(0.55, 0.35);
      w.fx.hitstop(0.06);
      w.damageArea(c, c.x, c.z, 4.2, m(2.2, lv), { kind: 'skill', stun: 1.2, knock: 2 });
    });
  },
});

reg({
  id: 'blackflash', cls: 'yuji', name: 'Black Flash', type: 'active', req: 15, max: 5, row: 2, col: 0, prereq: ['rush', 3], color: '#ff2a3a',
  desc: lv => `Distort space with cursed energy: a guaranteed Black Flash for ${pct(m(1.9, lv))} ATK ×2.5.`,
  ce: lv => 32 + lv * 3, cd: () => 15, anim: 'uppercut', animDur: 0.55, range: 4,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    c.dash(a.x, a.z, Math.min(2.2, Math.max(0, a.dist - 1.1)), 0.12);
    w.sfx('charge', c.x, c.z, 0.6);
    w.schedule(0.2, () => {
      w.damageCone(c, c.x, c.z, Math.atan2(a.x, a.z), 2.6, 1.3, m(1.9, lv), { kind: 'skill', bf: true, knock: 4 });
    });
  },
});

reg({
  id: 'slaughter', cls: 'yuji', name: 'Slaughter Demon', type: 'active', req: 20, max: 5, row: 2, col: 1, prereq: ['slam', 2], color: '#c84aff',
  desc: lv => `Hurl a cursed knife that pierces up to 4 enemies for ${pct(m(1.8, lv))} ATK and makes them bleed.`,
  ce: lv => 16 + lv * 2, cd: () => 7, anim: 'throw', animDur: 0.36, range: 12,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    w.sfx('nail', c.x, c.z, 0.8, 0.6);
    w.schedule(0.12, () => w.projectile({ x: c.x, z: c.z, dirX: a.x, dirZ: a.z, speed: 22, range: 14, radius: 0.55, mult: m(1.8, lv), pierce: 4, visual: 'knife', team: 'player', opts: { kind: 'skill', dot: { mult: m(0.25, lv), dur: 4 } }, fromCaster: c }));
  },
});

reg({ id: 'physique', cls: 'yuji', name: 'Superhuman Physique', type: 'passive', req: 2, max: 5, row: 0, col: 2, color: '#ffd06a', desc: lv => `Max HP +${lv * 8}%.`, passive: lv => ({ hpPct: lv * 0.08 }) });
reg({ id: 'martial', cls: 'yuji', name: 'Martial Arts', type: 'passive', req: 8, max: 5, row: 1, col: 2, color: '#ffa06a', desc: lv => `Attack +${lv * 6}%, attack speed +${lv * 2}%.`, passive: lv => ({ atkPct: lv * 0.06, atkSpd: lv * 0.02 }) });
reg({ id: 'bfInstinct', cls: 'yuji', name: 'Black Flash Instinct', type: 'passive', req: 14, max: 5, row: 2, col: 2, prereq: ['martial', 2], color: '#ff3a4a', desc: lv => `Black Flash chance +${(lv * 1.4).toFixed(1)}%. Landing one restores ${lv * 4} CE.`, passive: lv => ({ bfChance: lv * 0.014 }) });
reg({ id: 'unyielding', cls: 'yuji', name: 'Unyielding Will', type: 'passive', req: 22, max: 5, row: 3, col: 0, color: '#9adfff', desc: lv => `Damage taken -${lv * 3}%, HP regen +${lv}/s.`, passive: lv => ({ dmgReduce: lv * 0.03, hpRegen: lv }) });

reg({
  id: 'shrine', cls: 'yuji', name: 'King of Curses: Malevolent Shrine', type: 'ultimate', req: 25, max: 1, row: 3, col: 2, color: '#ff1a2a',
  desc: () => 'Ultimate. Sukuna takes over for 8 seconds: his domain opens and Dismantle and Cleave shred every enemy nearby. Needs a full Domain gauge.',
  ce: () => 0, cd: () => 60, anim: 'domain', animDur: 1.2,
  cast: (w, c) => {
    w.sfx('domain', c.x, c.z);
    w.domain('shrine', c.x, c.z, 13, 8.5);
    c.setInvuln(9);
    c.addBuff('sukuna', 9, { atkPct: 0.3 });
    for (let i = 0; i < 30; i++) {
      w.schedule(1.3 + i * 0.24, () => {
        const ts = w.targetsNear('enemy', c.x, c.z, 13);
        for (const tg of ts.slice(0, 6)) {
          w.fx.slash(tg.x, tg.z, Math.random() * Math.PI * 2, 1.3, 0xffffff, 0.6, Math.random() * 2 - 1, 1);
          w.damageTarget(c, tg, i % 5 === 4 ? 1.4 : 0.55, { kind: 'domain', noBF: true, quiet: true, color: '#ff4a5a' });
        }
        if (ts.length) w.sfx('dismantle', c.x, c.z, 0.7, 0.8 + Math.random() * 0.5);
      });
    }
  },
});

// ===========================================================================
// Megumi Fushiguro
// ===========================================================================

reg({
  id: 'dogs', cls: 'megumi', name: 'Divine Dogs', type: 'active', req: 1, max: 5, row: 0, col: 0, color: '#e8e8f4',
  desc: lv => `Summon the white and black Divine Dogs for ${14 + lv * 2}s. Each bites for ${pct(m(0.55, lv))} ATK.`,
  ce: lv => 18 + lv * 2, cd: () => 16, anim: 'summon', animDur: 0.6,
  cast: (w, c, lv) => {
    w.sfx('summon', c.x, c.z);
    const sx = Math.cos(c.facing), sz = -Math.sin(c.facing);
    for (const [k, s] of [['dogWhite', 1], ['dogBlack', -1]] as const) {
      const x = c.x + sx * s * 1.4, z = c.z + sz * s * 1.4;
      w.fx.sigil(x, z, 1.2, 0x2a2a4a, 0.8);
      w.fx.smoke(x, z, 0x15151f, 14);
      w.summon(k, x, z, { dur: 14 + lv * 2, power: m(0.55, lv), owner: c });
    }
    w.schedule(0.4, () => w.sfx('bark', c.x, c.z));
  },
});

reg({
  id: 'nue', cls: 'megumi', name: 'Nue', type: 'active', req: 3, max: 5, row: 0, col: 1, color: '#8ae0ff',
  desc: lv => `Call the owl shikigami Nue to dive three times, each strike a ${pct(m(1.3, lv))} ATK lightning burst.`,
  ce: lv => 16 + lv * 2, cd: () => 9, anim: 'castUp', animDur: 0.5, range: 12,
  cast: (w, c, lv) => {
    w.sfx('summon', c.x, c.z, 0.7);
    w.schedule(0.3, () => w.sfx('screech', c.x, c.z, 0.6, 1.3));
    w.summon('nue', c.x, c.z - 1, { dur: 4.5, power: m(1.3, lv), owner: c });
  },
});

reg({
  id: 'toad', cls: 'megumi', name: 'Toad', type: 'active', req: 6, max: 5, row: 1, col: 0, prereq: ['dogs', 2], color: '#7ac06a',
  desc: lv => `Toad's tongue lashes up to 4 enemies for ${pct(m(1.0, lv))} ATK and binds them for ${(1.5 + lv * 0.2).toFixed(1)}s.`,
  ce: lv => 14 + lv * 2, cd: () => 8, anim: 'summon', animDur: 0.5, range: 9,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const x = c.x + a.x * 1.6, z = c.z + a.z * 1.6;
    w.sfx('croak', x, z);
    w.fx.smoke(x, z, 0x15151f, 12);
    w.summon('toad', x, z, { dur: 1.6, power: m(1.0, lv), owner: c });
    w.schedule(0.35, () => {
      const ts = w.targetsNear('enemy', x, z, 9).slice(0, 4);
      w.sfx('tongue', x, z);
      for (const tg of ts) {
        w.fx.lightning(x, 0.6, z, tg.x, 0.8, tg.z, 0xd84a6a, 0.12);
        w.damageTarget(c, tg, m(1.0, lv), { kind: 'skill', stun: 1.5 + lv * 0.2 });
      }
    });
  },
});

reg({
  id: 'shadowStep', cls: 'megumi', name: 'Shadow Step', type: 'active', req: 10, max: 5, row: 1, col: 1, prereq: ['nue', 2], color: '#5a5aaa',
  desc: lv => `Sink into your shadow and resurface 6m ahead, cutting everything on the path for ${pct(m(1.3, lv))} ATK.`,
  ce: lv => 10 + lv * 2, cd: () => 6, anim: 'dash', animDur: 0.3,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const x0 = c.x, z0 = c.z;
    w.sfx('shadow', c.x, c.z);
    w.fx.smoke(x0, z0, 0x101018, 18);
    w.fx.sigil(x0, z0, 1.1, 0x15151f, 0.6);
    c.dash(a.x, a.z, 6, 0.2, true);
    w.schedule(0.2, () => {
      w.fx.smoke(c.x, c.z, 0x101018, 18);
      w.fx.slash(c.x, c.z, Math.atan2(a.x, a.z), 2, 0x9a9aff, 1.5);
      w.damageLine(c, x0, z0, c.x, c.z, 1.6, m(1.3, lv), { kind: 'skill' });
    });
  },
});

reg({
  id: 'elephant', cls: 'megumi', name: 'Max Elephant', type: 'active', req: 15, max: 5, row: 2, col: 0, prereq: ['toad', 3], color: '#7ab0ff',
  desc: lv => `Drop Max Elephant on the enemy: ${pct(m(2.6, lv))} ATK in a huge area, then a torrent of water slows survivors.`,
  ce: lv => 38 + lv * 3, cd: () => 18, anim: 'summon', animDur: 0.7, range: 10,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const d = Math.min(a.dist, 7);
    const x = c.x + a.x * d, z = c.z + a.z * d;
    w.sfx('summon', x, z);
    w.fx.sigil(x, z, 3, 0x1a1a2a, 1.4);
    w.summon('elephant', x, z, { dur: 2.2, power: m(2.6, lv), owner: c });
    w.schedule(0.2, () => w.sfx('elephant', x, z));
    w.schedule(0.65, () => {
      w.sfx('water', x, z);
      w.sfx('land', x, z);
      w.fx.shockwave(x, z, 4.8, 0x8ac8ff);
      w.fx.burst(x, 0.5, z, 0x6ab0ff, 50, 8, 0.4, 1.0, false);
      w.fx.shake(0.6, 0.4);
      w.damageArea(c, x, z, 4.8, m(2.6, lv), { kind: 'skill', slow: { mult: 0.5, dur: 3 }, knock: 2 });
    });
  },
});

reg({
  id: 'rabbits', cls: 'megumi', name: 'Rabbit Escape', type: 'active', req: 20, max: 5, row: 2, col: 1, prereq: ['shadowStep', 2], color: '#ffffff',
  desc: lv => `A flood of rabbits: +50% evasion for 5s while enemies around you are slowed and nibbled for ${pct(m(0.3, lv))} ATK per tick.`,
  ce: lv => 20 + lv * 2, cd: () => 20, anim: 'summon', animDur: 0.5,
  cast: (w, c, lv) => {
    w.sfx('rabbits', c.x, c.z);
    c.addBuff('rabbit', 5, { evasion: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      w.summon('rabbit', c.x + Math.sin(a) * 1.5, c.z + Math.cos(a) * 1.5, { dur: 5, power: m(0.15, lv), owner: c });
    }
    for (let i = 0; i < 10; i++) w.schedule(0.5 * i, () => {
      w.damageArea(c, c.x, c.z, 3.5, m(0.3, lv), { kind: 'skill', slow: { mult: 0.6, dur: 0.6 }, quiet: true });
    });
  },
});

reg({ id: 'reserves', cls: 'megumi', name: 'Shadow Reserves', type: 'passive', req: 2, max: 5, row: 0, col: 2, color: '#6a6aff', desc: lv => `Max CE +${lv * 8}%, CE regen +${(lv * 0.4).toFixed(1)}/s.`, passive: lv => ({ cePct: lv * 0.08, ceRegen: lv * 0.4 }) });
reg({ id: 'bond', cls: 'megumi', name: 'Shikigami Bond', type: 'passive', req: 8, max: 5, row: 1, col: 2, color: '#c0c0ff', desc: lv => `Shikigami damage +${lv * 10}%.`, passive: lv => ({ summonPow: lv * 0.1 }) });
reg({ id: 'swordsman', cls: 'megumi', name: 'Swordsmanship', type: 'passive', req: 14, max: 5, row: 2, col: 2, prereq: ['bond', 2], color: '#d0d8e8', desc: lv => `Attack +${lv * 5}%, crit rate +${lv}%.`, passive: lv => ({ atkPct: lv * 0.05, crit: lv * 0.01 }) });
reg({ id: 'insight', cls: 'megumi', name: 'Ten Shadows Insight', type: 'passive', req: 22, max: 5, row: 3, col: 0, color: '#8a8aff', desc: lv => `Cooldowns -${lv * 4}%, skill power +${lv * 4}%.`, passive: lv => ({ cdr: lv * 0.04, skillPow: lv * 0.04 }) });

reg({
  id: 'garden', cls: 'megumi', name: 'Domain Expansion: Chimera Shadow Garden', type: 'ultimate', req: 25, max: 1, row: 3, col: 2, color: '#3a3aaa',
  desc: () => 'Ultimate. Flood the area with shadow for 10s: enemies are slowed and impaled by shadow spikes, two more Divine Dogs join you and your attack rises 30%. Needs a full Domain gauge.',
  ce: () => 0, cd: () => 60, anim: 'domain', animDur: 1.2,
  cast: (w, c) => {
    w.sfx('domain', c.x, c.z);
    w.domain('shadow', c.x, c.z, 12, 10.5);
    c.addBuff('garden', 11, { atkPct: 0.3, evasion: 0.2 });
    w.schedule(1.3, () => {
      for (const [k, s] of [['dogWhite', 1], ['dogBlack', -1]] as const) w.summon(k, c.x + s * 2, c.z + 1, { dur: 10, power: 0.9, owner: c });
      w.sfx('bark', c.x, c.z);
    });
    for (let i = 0; i < 19; i++) w.schedule(1.4 + i * 0.5, () => {
      const ts = w.targetsNear('enemy', c.x, c.z, 12);
      for (const tg of ts.slice(0, 8)) {
        w.fx.spikes(tg.x, tg.z, 0.8, 0x101018, 4);
        w.damageTarget(c, tg, 0.5, { kind: 'domain', noBF: true, slow: { mult: 0.5, dur: 0.6 }, quiet: true, color: '#9a9aff' });
      }
    });
  },
});

// ===========================================================================
// Nobara Kugisaki
// ===========================================================================

reg({
  id: 'hairpin', cls: 'nobara', name: 'Hairpin', type: 'active', req: 1, max: 5, row: 0, col: 0, color: '#ff7a4a',
  desc: lv => `Throw four nails that hit for ${pct(m(0.7, lv))} ATK each, then detonate for ${pct(m(0.65, lv))} ATK in a small area.`,
  ce: lv => 12 + lv * 2, cd: () => 5, anim: 'throw', animDur: 0.4, range: 10,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const base = Math.atan2(a.x, a.z);
    w.sfx('nail', c.x, c.z);
    for (let i = 0; i < 4; i++) {
      const ang = base + (i - 1.5) * 0.16;
      w.schedule(0.1 + i * 0.03, () => w.projectile({
        x: c.x, z: c.z, dirX: Math.sin(ang), dirZ: Math.cos(ang), speed: 24, range: 10, radius: 0.45, mult: m(0.7, lv), visual: 'nail', team: 'player', opts: { kind: 'skill', mark: true }, fromCaster: c,
        onEnd: (x, z) => w.schedule(0.3, () => {
          w.fx.burst(x, 0.8, z, 0xff6a3a, 16, 5, 0.3);
          w.fx.ring(x, z, 0xff8a4a, 1.4, 0.25, 0.3);
          w.fx.light(x, 1, z, 0xff6a3a, 8, 0.2);
          w.sfx('explosion', x, z, 0.5, 1.4);
          w.damageArea(c, x, z, 1.5, m(0.65, lv), { kind: 'skill', quiet: true });
        }),
      }));
    }
  },
});

reg({
  id: 'volley', cls: 'nobara', name: 'Nail Volley', type: 'active', req: 3, max: 5, row: 0, col: 1, color: '#d8d8e0',
  desc: lv => `Fire eight nails at nearby enemies for ${pct(m(0.5, lv))} ATK each, marking them for Resonance.`,
  ce: lv => 14 + lv * 2, cd: () => 6, anim: 'throw', animDur: 0.6, range: 11,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    for (let i = 0; i < 8; i++) w.schedule(i * 0.06, () => {
      const ts = w.targetsNear('enemy', c.x, c.z, 11);
      const tg = ts.length ? ts[i % Math.min(4, ts.length)] : null;
      let ax = a.x, az = a.z;
      if (tg) { const d = Math.hypot(tg.x - c.x, tg.z - c.z) || 1; ax = (tg.x - c.x) / d; az = (tg.z - c.z) / d; }
      const j = (Math.random() - 0.5) * 0.1;
      w.sfx('nail', c.x, c.z, 0.5, 1 + Math.random() * 0.3);
      w.projectile({ x: c.x, z: c.z, dirX: Math.sin(Math.atan2(ax, az) + j), dirZ: Math.cos(Math.atan2(ax, az) + j), speed: 26, range: 12, radius: 0.4, mult: m(0.5, lv), visual: 'nail', team: 'player', opts: { kind: 'skill', mark: true }, fromCaster: c, homing: 4 });
    });
  },
});

reg({
  id: 'resonance', cls: 'nobara', name: 'Resonance', type: 'active', req: 6, max: 5, row: 1, col: 0, prereq: ['hairpin', 2], color: '#ff2a5a',
  desc: lv => `Drive a nail into the straw doll: every nail-marked enemy takes ${pct(m(2.4, lv))} ATK, ignoring defense. With no marks, hits the nearest foe for ${pct(m(1.4, lv))}.`,
  ce: lv => 22 + lv * 3, cd: () => 10, anim: 'hammer', animDur: 0.5, range: 16,
  cast: (w, c, lv) => {
    w.sfx('hammer', c.x, c.z);
    w.fx.sigil(c.x, c.z, 1.3, 0xff2a5a, 0.7);
    w.schedule(0.22, () => {
      const ts = w.targetsNear('enemy', c.x, c.z, 16);
      const marked = ts.filter(tg => tg.marked > 0);
      w.sfx('resonance', c.x, c.z);
      if (marked.length) {
        for (const tg of marked) {
          w.fx.spikes(tg.x, tg.z, 0.6, 0x111111, 5);
          w.fx.burst(tg.x, 1, tg.z, 0xff2a5a, 18, 5, 0.3);
          w.damageTarget(c, tg, m(2.4, lv), { kind: 'skill', ignoreDef: true, consumeMark: true });
        }
      } else if (ts.length) {
        w.fx.spikes(ts[0].x, ts[0].z, 0.6, 0x111111, 5);
        w.damageTarget(c, ts[0], m(1.4, lv), { kind: 'skill', ignoreDef: true });
      }
    });
  },
});

reg({
  id: 'smash', cls: 'nobara', name: 'Hammer Smash', type: 'active', req: 10, max: 5, row: 1, col: 1, prereq: ['volley', 2], color: '#c8a05a',
  desc: lv => `Bring the hammer down in front of you for ${pct(m(2.0, lv))} ATK, stunning for 0.9s. Marked enemies take 50% more.`,
  ce: lv => 16 + lv * 2, cd: () => 7, anim: 'hammer', animDur: 0.5, range: 3,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    w.sfx('swingHeavy', c.x, c.z);
    w.schedule(0.24, () => {
      const px = c.x + a.x * 1.4, pz = c.z + a.z * 1.4;
      w.sfx('hammer', px, pz, 1, 0.7);
      w.sfx('shockwave', px, pz, 0.6);
      w.fx.shockwave(px, pz, 2.6, 0xffc070);
      w.fx.spikes(px, pz, 1.8, 0x7a6a5a, 8);
      w.fx.shake(0.4);
      w.damageCone(c, c.x, c.z, Math.atan2(a.x, a.z), 3.2, 1.9, m(2.0, lv), { kind: 'skill', stun: 0.9, knock: 3, vsMarked: 1.5 });
    });
  },
});

reg({
  id: 'dollField', cls: 'nobara', name: 'Straw Doll Curse', type: 'active', req: 15, max: 5, row: 2, col: 0, prereq: ['resonance', 3], color: '#d8b05a',
  desc: lv => `Plant a cursed straw doll: for 5s enemies inside take ${pct(m(0.45, lv))} ATK every half second, are slowed and marked.`,
  ce: lv => 28 + lv * 3, cd: () => 14, anim: 'hammer', animDur: 0.45, range: 9,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const d = Math.min(a.dist, 6);
    const x = c.x + a.x * d, z = c.z + a.z * d;
    w.sfx('doll', x, z);
    w.fx.sigil(x, z, 3.2, 0xd84a3a, 5.2);
    w.summon('doll', x, z, { dur: 5, power: 0, owner: c });
    for (let i = 0; i < 10; i++) w.schedule(0.3 + i * 0.5, () => {
      w.fx.embers(x, z, 3, 0xff4a3a, 6);
      w.damageArea(c, x, z, 3.2, m(0.45, lv), { kind: 'skill', mark: true, slow: { mult: 0.55, dur: 0.6 }, quiet: true });
    });
  },
});

reg({
  id: 'nailRain', cls: 'nobara', name: 'Cursed Nail Rain', type: 'active', req: 20, max: 5, row: 2, col: 1, prereq: ['smash', 2], color: '#9a9aaa',
  desc: lv => `Twelve cursed nails rain down around the target, each exploding for ${pct(m(0.8, lv))} ATK.`,
  ce: lv => 36 + lv * 3, cd: () => 16, anim: 'castUp', animDur: 0.5, range: 11,
  cast: (w, c, lv, t, dx, dz) => {
    const a = aim(c, t, dx, dz);
    const d = Math.min(a.dist, 8);
    const cx = c.x + a.x * d, cz = c.z + a.z * d;
    w.fx.sigil(cx, cz, 4.5, 0xff4a6a, 2);
    for (let i = 0; i < 12; i++) w.schedule(0.3 + i * 0.12, () => {
      const r = Math.random() * 4, an = Math.random() * Math.PI * 2;
      const x = cx + Math.sin(an) * r, z = cz + Math.cos(an) * r;
      w.fx.lightning(x, 9, z, x, 0, z, 0xffd0d0, 0.06);
      w.fx.burst(x, 0.4, z, 0xff6a4a, 12, 5, 0.25);
      w.sfx('hammer', x, z, 0.4, 1.4);
      w.damageArea(c, x, z, 1.4, m(0.8, lv), { kind: 'skill', mark: true, quiet: true });
    });
  },
});

reg({ id: 'nerves', cls: 'nobara', name: 'Steel Nerves', type: 'passive', req: 2, max: 5, row: 0, col: 2, color: '#ffd04a', desc: lv => `Crit rate +${lv * 3}%, crit damage +${lv * 6}%.`, passive: lv => ({ crit: lv * 0.03, critDmg: lv * 0.06 }) });
reg({ id: 'nailcraft', cls: 'nobara', name: 'Nail Craft', type: 'passive', req: 8, max: 5, row: 1, col: 2, color: '#d0d0d8', desc: lv => `Projectile damage +${lv * 8}%.`, passive: lv => ({ projPow: lv * 0.08 }) });
reg({ id: 'grit', cls: 'nobara', name: 'Country Grit', type: 'passive', req: 14, max: 5, row: 2, col: 2, prereq: ['nailcraft', 2], color: '#8ad06a', desc: lv => `Max HP +${lv * 7}%, defense +${lv * 5}%.`, passive: lv => ({ hpPct: lv * 0.07, defPct: lv * 0.05 }) });
reg({ id: 'feedback', cls: 'nobara', name: 'Cursed Feedback', type: 'passive', req: 22, max: 5, row: 3, col: 0, color: '#ff4a8a', desc: lv => `Lifesteal +${lv * 2}%, skill power +${lv * 4}%.`, passive: lv => ({ lifesteal: lv * 0.02, skillPow: lv * 0.04 }) });

reg({
  id: 'thousand', cls: 'nobara', name: 'Resonance: Thousand Nails', type: 'ultimate', req: 25, max: 1, row: 3, col: 2, color: '#ff0a4a',
  desc: () => 'Ultimate. Mark every enemy in sight and drive five waves of Resonance through them, ignoring defense. The final wave is a guaranteed Black Flash. Needs a full Domain gauge.',
  ce: () => 0, cd: () => 60, anim: 'domain', animDur: 1.2,
  cast: (w, c) => {
    w.sfx('domain', c.x, c.z);
    w.domain('nails', c.x, c.z, 14, 5);
    c.setInvuln(5);
    for (let i = 0; i < 5; i++) w.schedule(1.3 + i * 0.6, () => {
      const ts = w.targetsNear('enemy', c.x, c.z, 14);
      w.sfx(i === 4 ? 'blackflash' : 'resonance', c.x, c.z, i === 4 ? 1 : 0.7);
      for (const tg of ts) {
        w.fx.spikes(tg.x, tg.z, 0.7, 0x111111, 4);
        w.damageTarget(c, tg, 1.6, { kind: 'domain', ignoreDef: true, bf: i === 4, noBF: i !== 4, quiet: i !== 4 });
      }
    });
  },
});

export function classSkills(cls: ClassId) {
  return Object.values(SKILLS).filter(s => s.cls === cls);
}
