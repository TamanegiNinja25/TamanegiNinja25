// The player-controlled sorcerer: movement, combos, skills, potions, dodge.
import * as THREE from 'three';
import { Actor } from './Actor';
import type { World } from '../world/World';
import { PlayerState } from '../rpg/PlayerState';
import { Input, Action } from '../core/Input';
import { buildCharacter } from '../render/models/characters';
import { wrapHumanoid } from '../render/models/model';
import { weaponMesh } from '../render/models/weapons';
import { ITEMS } from '../rpg/items';
import { SKILLS } from '../rpg/skills';
import { Caster } from '../world/api';
import { audio } from '../audio/Audio';
import { clamp } from '../core/util';

export class Player extends Actor implements Caster {
  ps: PlayerState;
  input: Input;
  comboIdx = 0;
  comboT = 0;
  attackT = 0;
  castT = 0;
  cds: Record<string, number> = {};
  potionCd = 0;
  dodgeCd = 0;
  dashS: { vx: number; vz: number; t: number } | null = null;
  lastDamageT = -99;
  private stepAcc = 0;
  private weaponObjs: THREE.Object3D[] = [];
  controlsLocked = false;
  domainFlash = 0;
  /** set when the player wants to talk/interact this frame */
  wantsInteract = false;

  constructor(world: World, ps: PlayerState, input: Input) {
    super(world);
    this.ps = ps;
    this.input = input;
    this.team = 'player';
    this.radius = 0.42;
    const m = wrapHumanoid(buildCharacter(ps.cls.model));
    this.setModel(m, 1);
    m.setStance?.(ps.cls.stance);
    this.refreshWeapon();
    ps.on((ev) => { if (ev === 'equip') this.refreshWeapon(); });
  }

  get atk() { return this.ps.stats.atk; }
  get def() { return this.ps.stats.def; }
  get critChance() { return this.ps.stats.crit; }
  get critMult() { return 1 + this.ps.stats.critDmg; }
  get level() { return this.ps ? this.ps.d.level : 1; }
  set level(_v: number) { /* derived from save */ }

  // hp is stored in the save data so it persists
  get hp() { return this.ps ? this.ps.d.hp : 1; }
  set hp(v: number) { if (this.ps) this.ps.d.hp = v; }
  get maxHp() { return this.ps ? this.ps.stats.maxHp : 1; }
  set maxHp(_v: number) { /* derived */ }

  refreshWeapon() {
    for (const o of this.weaponObjs) o.parent?.remove(o);
    this.weaponObjs = [];
    const it = this.ps.d.equip.weapon;
    const cls = this.ps.cls;
    const icon = it ? ITEMS[it.base].icon : { shape: cls.weaponModel, c1: '#cccccc', c2: '#888888' };
    const plus = it?.plus ?? 0;
    const shape = icon.shape === 'knife' ? 'knife' : cls.weaponModel === 'fist' ? 'fist' : icon.shape === 'spear' ? 'spear' : cls.weaponModel;
    const hand = this.model?.hand, handL = this.model?.handL;
    if (!hand) return;
    const w = weaponMesh(shape, icon.c1, icon.c2 ?? icon.c1, plus);
    if (shape === 'blade' || shape === 'spear' || shape === 'knife') { w.rotation.set(-0.35, 0, 0); w.position.set(0, -0.07, 0.02); }
    if (shape === 'hammer') { w.rotation.set(-0.2, 0, 0); w.position.set(0, -0.07, 0.0); }
    hand.add(w);
    this.weaponObjs.push(w);
    if (shape === 'fist' && handL) {
      const w2 = weaponMesh('fist', icon.c1, icon.c2 ?? icon.c1, plus);
      handL.add(w2);
      this.weaponObjs.push(w2);
    }
    if (shape === 'knife' && handL) {
      const w2 = weaponMesh('fist', '#e8dcc0', '#a89a7a', plus);
      handL.add(w2);
      this.weaponObjs.push(w2);
    }
  }

  // ------------------------------------------------------------------
  // Caster interface
  // ------------------------------------------------------------------

  dash(dirX: number, dirZ: number, dist: number, dur: number, invuln = false) {
    if (dist <= 0.01) return;
    const d = Math.hypot(dirX, dirZ) || 1;
    this.dashS = { vx: (dirX / d) * dist / dur, vz: (dirZ / d) * dist / dur, t: dur };
    this.facing = Math.atan2(dirX, dirZ);
    if (invuln) this.invulnT = Math.max(this.invulnT, dur + 0.1);
  }
  setInvuln(t: number) { this.invulnT = Math.max(this.invulnT, t); }
  addBuff(id: string, dur: number, stats: Record<string, number>) { this.ps.addBuff(id, dur, stats); }
  heal(amount: number) {
    const before = this.ps.d.hp;
    this.ps.d.hp = Math.min(this.ps.stats.maxHp, this.ps.d.hp + amount);
    const got = Math.round(this.ps.d.hp - before);
    // skip tiny lifesteal ticks so numbers stay readable
    if (got > 0 && got >= Math.max(8, this.ps.stats.maxHp * 0.03)) this.world.overlay.add(this.x, 2.2, this.z, '+' + got, '#6aff8a', 16);
  }

  // ------------------------------------------------------------------

  skillCd(id: string) { return this.cds[id] ?? 0; }

  update(dt: number) {
    const ps = this.ps;
    const st = ps.stats;
    this.updateStatus(dt);
    if (!this.alive) { this.syncModel(dt); return; }

    // regen
    ps.d.ce = Math.min(st.maxCe, ps.d.ce + st.ceRegen * dt);
    const outOfCombat = this.world.time - this.lastDamageT > 5;
    ps.d.hp = Math.min(st.maxHp, ps.d.hp + st.hpRegen * dt * (outOfCombat ? 4 : 1));

    for (const k in this.cds) if (this.cds[k] > 0) this.cds[k] = Math.max(0, this.cds[k] - dt);
    if (this.potionCd > 0) this.potionCd -= dt;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.comboIdx = 0; }
    if (this.attackT > 0) this.attackT -= dt;
    if (this.castT > 0) this.castT -= dt;

    const inp = this.input;
    const locked = this.controlsLocked || this.stunned;

    // dashing overrides movement
    if (this.dashS) {
      this.move(this.dashS.vx, this.dashS.vz, dt);
      this.dashS.t -= dt;
      if (Math.random() < 0.6) this.world.fx.burst(this.x, 0.9, this.z, this.ps.cls.id === 'megumi' ? 0x2a2a4a : 0x9ad0ff, 2, 1, 0.3, 0.3, this.ps.cls.id !== 'megumi');
      if (this.dashS.t <= 0) this.dashS = null;
    } else if (!locked) {
      const mx = inp.moveX, mz = inp.moveZ;
      const mag = Math.hypot(mx, mz);
      const busy = this.attackT > 0.05 || this.castT > 0;
      if (mag > 0.1) {
        const spd = st.moveSpd * (this.slowT > 0 ? this.slowMul : 1) * (busy ? 0.25 : 1) * clamp(mag, 0.35, 1);
        this.move((mx / mag) * spd, (mz / mag) * spd, dt);
        if (!busy) this.faceTowards(this.x + mx, this.z + mz, dt, 16);
        this.stepAcc += spd * dt;
        if (this.stepAcc > 1.15) { this.stepAcc = 0; audio.step(this.world.surfaceAt(this.x, this.z), { vol: 0.8 }); }
      }
    }

    if (!locked) this.handleActions();
    this.syncModel(dt);
  }

  private handleActions() {
    const inp = this.input;
    // interaction takes precedence when someone is close and no enemies are threatening
    if (inp.pressed('interact')) this.wantsInteract = true;
    const npcNear = this.world.interactableNear();
    const attackHeld = inp.isHeld('attack');
    const attackPressed = inp.pressed('attack');
    if (attackPressed && npcNear && !this.world.nearestTarget('enemy', this.x, this.z, 5)) {
      this.wantsInteract = true;
    } else if ((attackPressed || attackHeld) && this.attackT <= 0 && this.castT <= 0) {
      this.basicAttack();
    }
    const slots: Action[] = ['skill1', 'skill2', 'skill3', 'skill4', 'skill5'];
    slots.forEach((a, i) => { if (inp.pressed(a)) this.useSkillSlot(i); });
    if (inp.pressed('ultimate') || inp.pressed('skill6')) this.useSkillSlot(5);
    if (inp.pressed('potion1')) this.usePotion(0);
    if (inp.pressed('potion2')) this.usePotion(1);
    if (inp.pressed('dash')) this.dodge();
  }

  dodge() {
    if (this.dodgeCd > 0 || this.dashS || this.castT > 0.1) return;
    let dx = this.input.moveX, dz = this.input.moveZ;
    if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    this.dash(dx, dz, 4.2, 0.22, true);
    this.invulnT = Math.max(this.invulnT, 0.32);
    this.dodgeCd = 1.1;
    this.attackT = 0;
    this.model?.play('dash', 0.25);
    this.world.sfx('dash', this.x, this.z);
  }

  basicAttack() {
    const cls = this.ps.cls;
    const hit = cls.combo[this.comboIdx];
    const spd = this.ps.stats.atkSpd;
    const dur = hit.dur / spd;
    const range = hit.projectile ? hit.range : hit.range + 3;
    const t = this.world.nearestTarget('enemy', this.x, this.z, range);
    let dirX = Math.sin(this.facing), dirZ = Math.cos(this.facing);
    if (t) {
      const dx = t.x - this.x, dz = t.z - this.z;
      const d = Math.hypot(dx, dz) || 1;
      dirX = dx / d; dirZ = dz / d;
      this.facing = Math.atan2(dirX, dirZ);
      if (!hit.projectile && hit.lunge && d > hit.range * 0.75) {
        this.dash(dirX, dirZ, Math.min(hit.lunge + (d - hit.range) * 0.6, d - t.radius - 0.6), dur * 0.35);
      }
    } else if (Math.hypot(this.input.moveX, this.input.moveZ) > 0.2) {
      dirX = this.input.moveX; dirZ = this.input.moveZ;
      const d = Math.hypot(dirX, dirZ); dirX /= d; dirZ /= d;
      this.facing = Math.atan2(dirX, dirZ);
    }
    this.model?.play(hit.anim, dur);
    if (hit.swingSfx) this.world.sfx(hit.swingSfx, this.x, this.z, 0.8, 0.9 + Math.random() * 0.2);
    const idx = this.comboIdx;
    this.world.schedule(dur * 0.42, () => {
      if (!this.alive) return;
      const fdx = Math.sin(this.facing), fdz = Math.cos(this.facing);
      if (hit.projectile) {
        this.world.sfx('nail', this.x, this.z, 0.7, 1 + idx * 0.1);
        this.world.projectile({ x: this.x + fdx * 0.4, z: this.z + fdz * 0.4, dirX: fdx, dirZ: fdz, speed: 26, range: hit.range + 1, radius: 0.45, mult: hit.mult, visual: 'nail', team: 'player', opts: { kind: 'proj', mark: true }, fromCaster: this, homing: t ? 3 : 0 });
      } else {
        const color = this.ps.cls.id === 'megumi' ? 0xc8d0ff : this.ps.cls.id === 'nobara' ? 0xffd0a0 : 0xffffff;
        this.world.fx.slash(this.x + fdx * 0.3, this.z + fdz * 0.3, this.facing, hit.range * 0.75, color, hit.arc, idx === 1 ? 0.8 : idx === 2 ? -0.5 : -0.8);
        const n = this.world.damageCone(this, this.x, this.z, this.facing, hit.range, hit.arc, hit.mult, { kind: 'melee', knock: hit.knock ?? 0.6, hitSfx: hit.sfx, vsMarked: this.ps.cls.id === 'nobara' && idx === 2 ? 1.3 : undefined });
        if (n > 0 && idx === 2) this.world.fx.shake(0.15);
      }
    });
    this.attackT = dur * 0.82;
    this.comboIdx = (this.comboIdx + 1) % cls.combo.length;
    this.comboT = dur + 0.5;
  }

  useSkillSlot(i: number) {
    const id = this.ps.d.quick[i];
    if (!id) return;
    this.useSkill(id);
  }

  useSkill(id: string) {
    const s = SKILLS[id];
    const lv = this.ps.skillLevel(id);
    if (!s || lv <= 0 || !s.cast) return false;
    if (this.castT > 0.05 || this.dashS) return false;
    if (this.skillCd(id) > 0) { this.world.game.toast('Not ready yet', 'warn', 0.8); audio.play('error'); return false; }
    if (s.type === 'ultimate') {
      if (this.ps.d.domain < 100) { this.world.game.toast('Domain gauge not full', 'warn', 1); audio.play('error'); return false; }
    }
    const cost = s.ce?.(lv) ?? 0;
    if (this.ps.d.ce < cost) { this.world.game.toast('Not enough cursed energy', 'warn', 1); audio.play('error'); return false; }
    this.ps.d.ce -= cost;
    if (s.type === 'ultimate') this.ps.d.domain = 0;
    this.cds[id] = (s.cd?.(lv) ?? 5) * (1 - this.ps.stats.cdr);
    const t = this.world.nearestTarget('enemy', this.x, this.z, s.range ?? 8);
    if (t) this.facing = Math.atan2(t.x - this.x, t.z - this.z);
    this.model?.play(s.anim ?? 'cast', s.animDur ?? 0.4);
    this.castT = (s.animDur ?? 0.4) * 0.8;
    this.attackT = 0;
    this.comboIdx = 0;
    s.cast(this.world, this, lv, t, this.input.moveX, this.input.moveZ);
    this.ps.d.domain = Math.min(100, this.ps.d.domain + (s.type === 'ultimate' ? 0 : 2));
    if (s.type === 'ultimate') this.world.onPlayerUltimate(s.id);
    this.world.game.ui.hud?.flashSkill(id);
    return true;
  }

  usePotion(i: number) {
    const id = this.ps.d.potions[i];
    if (!id || this.potionCd > 0) return;
    if (this.ps.countItem(id) <= 0) { this.world.game.toast(`No ${ITEMS[id].name} left`, 'warn', 1); audio.play('error'); return; }
    this.useItem(id);
  }

  useItem(baseId: string) {
    const b = ITEMS[baseId];
    if (!b?.use) return false;
    if (b.use.warp) {
      if (this.world.inBossFight()) { this.world.game.toast('A curse is blocking the talisman!', 'warn'); return false; }
      this.ps.removeItem(baseId, 1);
      this.world.game.travel(b.use.warp);
      return true;
    }
    const st = this.ps.stats;
    if (b.use.hp && this.ps.d.hp >= st.maxHp && !b.use.ce) { this.world.game.toast('HP is already full', 'info', 0.8); return false; }
    if (b.use.ce && this.ps.d.ce >= st.maxCe && !b.use.hp) { this.world.game.toast('Cursed energy is already full', 'info', 0.8); return false; }
    this.ps.removeItem(baseId, 1);
    this.potionCd = 0.8;
    if (b.use.hp) this.heal(b.use.hp);
    if (b.use.hpPct) this.heal(st.maxHp * b.use.hpPct);
    if (b.use.ce) {
      this.ps.d.ce = Math.min(st.maxCe, this.ps.d.ce + b.use.ce);
      this.world.overlay.add(this.x, 2.4, this.z, '+' + b.use.ce + ' CE', '#6ab4ff', 15);
    }
    this.world.sfx('potion', this.x, this.z);
    this.world.fx.burst(this.x, 1.0, this.z, b.use.ce ? 0x6ab4ff : 0x6aff8a, 16, 2.5, 0.2, 0.8);
    this.world.fx.ring(this.x, this.z, b.use.ce ? 0x6ab4ff : 0x6aff8a, 1.4, 0.5);
    return true;
  }

  onHit(dmg: number) {
    this.lastDamageT = this.world.time;
    this.ps.d.domain = Math.min(100, this.ps.d.domain + (dmg / this.ps.stats.maxHp) * 40);
    audio.play('hurt', { vol: 0.7 });
    this.model?.hit();
    this.world.fx.flash('#ff0010', 0.18, 0.25);
  }
}
