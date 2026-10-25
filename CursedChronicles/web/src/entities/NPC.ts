// Friendly characters: quest givers, shopkeepers, classmates and civilians.
import type { World } from '../world/World';
import { buildCharacter } from '../render/models/characters';
import { wrapHumanoid, ModelHandle } from '../render/models/model';
import { approachAngle, rand } from '../core/util';
import { NPC_NAMES } from '../data/story';
import { PlayerState } from '../rpg/PlayerState';

export interface NpcDef {
  id: string;
  model?: string;
  x: number;
  z: number;
  facing?: number;
  shop?: 'potions' | 'armory' | 'workshop' | 'exchange' | 'travel';
  cond?: (ps: PlayerState) => boolean;
  name?: string;
  pose?: string;
}

export class NPC {
  model: ModelHandle;
  x: number;
  z: number;
  facing: number;
  t = rand(0, 5);
  emoteT = rand(4, 9);
  radius = 0.5;
  constructor(public world: World, public d: NpcDef) {
    this.model = wrapHumanoid(buildCharacter(d.model ?? d.id));
    this.x = d.x; this.z = d.z;
    this.facing = d.facing ?? 0;
    this.model.root.position.set(this.x, 0, this.z);
    this.model.root.rotation.y = this.facing;
    world.root.add(this.model.root);
    if (d.id === 'gojo') this.model.setStance?.('none');
  }
  get id() { return this.d.id; }
  get name() { return this.d.name ?? NPC_NAMES[this.d.id] ?? this.d.id; }

  update(dt: number) {
    this.t += dt;
    const p = this.world.player;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (dist < 5) this.facing = approachAngle(this.facing, Math.atan2(p.x - this.x, p.z - this.z), dt * 4);
    else this.facing = approachAngle(this.facing, this.d.facing ?? 0, dt * 2);
    this.emoteT -= dt;
    if (this.emoteT <= 0) {
      this.emoteT = rand(6, 12);
      if (dist < 6 && Math.random() < 0.5) this.model.play('wave', 1.0);
    }
    if (this.d.pose === 'sit') this.model.play('sit', 0.5);
    this.model.speed = 0;
    this.model.root.rotation.y = this.facing;
    if (dist < 40) this.model.update(dt);
  }

  dispose() { this.world.root.remove(this.model.root); }
}
