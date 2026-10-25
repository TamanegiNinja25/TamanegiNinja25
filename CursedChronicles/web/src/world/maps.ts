// Every playable area, built from props and buildings. North is -Z (top of screen).
import { MapDef } from './MapBuilder';
import { PlayerState } from '../rpg/PlayerState';
import { QUEST_BY_ID } from '../data/story';

const done = (id: string) => (ps: PlayerState) => ps.questState(id)?.state === 'done';
const active = (id: string) => (ps: PlayerState) => !!ps.questState(id) && ps.questState(id)!.state !== 'done';
const objDone = (id: string, i: number) => (ps: PlayerState) => { const q = QUEST_BY_ID[id]; return !!ps.questState(id) && ps.objectiveDone(q, i); };

// ============================================================================
// Sugisawa Third High — night
// ============================================================================
const sugisawa: MapDef = {
  id: 'sugisawa', name: 'Sugisawa Third High', jp: '杉沢第三高校', size: [64, 72], night: true,
  lighting: { sky: 0x5a6aa0, ground: 0x22222e, hemiIntensity: 1.15, sun: 0xa8bcff, sunIntensity: 1.25, sunDir: [0.4, 1, -0.4], ambient: 0x7a8ab8, ambientIntensity: 0.3, playerLight: 2.2, fog: 0x101428, fogNear: 26, fogFar: 70, bg: 0x0a0c1a, bloom: 0.55, exposure: 1.0 },
  music: 'sugisawa', ambience: ['crickets', 'wind'], weather: 'none', levelRange: [1, 6],
  terrain: {
    kinds: ['darkGrass', 'tile', 'dirt', 'asphalt'], scales: [0.18, 0.22, 0.2, 0.15],
    paint: (p) => {
      p.rect(1, 0, 11, 34, 18, 0.5);        // courtyard
      p.rect(1, 0, 24, 6, 12, 0.4);         // gate path
      p.rect(1, 22, -6, 7, 26, 0.5);        // east passage
      p.rect(3, 0, 33, 64, 4, 0.3);         // street outside the gate
      p.circle(2, 0, -24, 12, 1.0);         // sports field track
      p.circle(0, 0, -24, 7, 0.6, 0.2);     // grass infield
      p.rect(1, -20, 6, 12, 18, 0.3);       // gym apron
      p.patches(2, 0.08, 0.62, 0.7);
    },
  },
  surfaces: ['grass', 'stone', 'dirt', 'concrete'],
  spawn: { x: 0, z: 27, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 11, 34, 18).keepClear(0, 24, 6, 12).keepClear(22, -6, 7, 26).keepClear(0, -24, 24, 24);
    b.building('schoolBuilding', 0, -6, 0);
    b.building('gym', -22, 8, 1);
    // gate + perimeter
    b.prop('wallConcrete', -5, 30.5, 0).prop('wallConcrete', 5, 30.5, 0);
    b.wall('wallConcrete', -32, 30.5, -7, 30.5).wall('wallConcrete', 7, 30.5, 32, 30.5);
    b.wall('wallConcrete', -32, -36, 32, -36).wall('wallConcrete', -32, -36, -32, 30.5).wall('wallConcrete', 32, -36, 32, 30.5);
    b.prop('streetLamp', -4, 28, Math.PI).prop('streetLamp', 4, 28, 0);
    b.row('streetLamp', -14, 18, 14, 18, 7, Math.PI / 2);
    b.prop('streetLamp', 19, 2, 0).prop('streetLamp', 25, -10, Math.PI);
    b.prop('floodLight', -12, -34, 0).prop('floodLight', 12, -34, 0);
    // courtyard dressing
    for (const x of [-12, -6, 6, 12]) b.prop('sakura', x, 15.5);
    b.prop('bench', -9, 8, 0).prop('bench', 9, 8, 0).prop('bench', 0, 14, Math.PI);
    b.prop('bikeRack', 12, 0.5, 0).prop('vendingRed', -8, 0.2, 0).prop('vendingBlue', -6.8, 0.2, 0);
    b.prop('signboard', 3, 21, 0).prop('postBox', -3, 30, 0);
    b.prop('carBlack', -9, 34, Math.PI / 2);
    // field
    b.prop('goal', 0, -33, 0).prop('goal', 0, -15, Math.PI);
    b.prop('bench', -12, -24, Math.PI / 2).prop('bench', 12, -24, -Math.PI / 2);
    b.scatter(['roundTree', 'darkTree', 'pine'], -27, -16, 8, 36, 10);
    b.scatter(['roundTree', 'darkTree'], 28, 14, 6, 26, 6);
    b.scatter(['bush', 'flowerBush'], 0, 18, 30, 4, 6);
    b.decor('grass', 0, -24, 60, 24, 70);
    b.decor('grass', -26, 10, 10, 40, 30);
    b.scatter(['rock1', 'rock3'], 25, -28, 10, 10, 4);
    // NPCs
    b.npc({ id: 'gojo', x: 3, z: 24, facing: Math.PI, cond: (ps) => ps.questState('m3')?.state !== 'done' });
    b.npc({ id: 'ijichi', x: -6, z: 27, facing: Math.PI, shop: 'travel', cond: done('m2') });
    // curses
    b.spawner({ enemies: [{ id: 'flyhead', w: 3 }, { id: 'crawler', w: 2 }], x: 0, z: 9, w: 28, d: 12, count: 7, respawn: 9, level: [1, 3] });
    b.spawner({ enemies: [{ id: 'crawler' }, { id: 'lanky' }], x: 23, z: -6, w: 6, d: 22, count: 5, respawn: 10, level: [3, 5] });
    b.spawner({ enemies: [{ id: 'lanky', w: 2 }, { id: 'flyhead' }, { id: 'crawler' }], x: -2, z: -24, w: 40, d: 18, count: 7, respawn: 11, level: [4, 6] });
    b.spawner({ enemies: [{ id: 'flyhead' }, { id: 'crawler' }], x: -26, z: -12, w: 8, d: 20, count: 4, respawn: 12, level: [2, 4] });
    b.boss({ id: 'glutton', x: 0, z: -24, r: 10, quest: 'm2', intro: [
      { who: 'narrator', text: 'Something enormous is crouched in the middle of the field, gnawing on a goalpost. Its belly opens like a second mouth.' },
      { who: 'player', text: 'Okay. That\'s… a lot of teeth.', only: ['yuji'] },
      { who: 'player', text: 'It already absorbed some of the finger\'s energy. Stay sharp.', only: ['megumi'] },
      { who: 'player', text: 'Ugh, it\'s drooling. I\'m going to nail its face shut.', only: ['nobara'] },
    ] });
    b.portal({ x: 0, z: 32.5, r: 2.2, to: 'hub', toX: 0, toZ: 26, label: 'Jujutsu High (Ijichi\'s car)', cond: 'm2', condText: 'Gojo: "Not yet! There\'s a finger to find first."' });
  },
};

// ============================================================================
// Tokyo Jujutsu High — hub town
// ============================================================================
const hub: MapDef = {
  id: 'hub', name: 'Tokyo Jujutsu High', jp: '東京都立呪術高等専門学校', size: [76, 80], night: false, town: true,
  lighting: { sky: 0xfff0e2, ground: 0x6a5a40, hemiIntensity: 1.3, sun: 0xffe0b4, sunIntensity: 2.8, sunDir: [-0.55, 0.85, 0.6], ambient: 0xffffff, ambientIntensity: 0.12, fog: 0xf0d4bc, fogNear: 46, fogFar: 120, bg: 0xf0c6a4, bloom: 0.35, exposure: 1.0 },
  music: 'hub', ambience: ['birds', 'wind', 'leaves'], weather: 'sakura', levelRange: [1, 50],
  terrain: {
    kinds: ['grass', 'stone', 'gravel', 'sand'], scales: [0.18, 0.2, 0.25, 0.2],
    paint: (p) => {
      p.rect(1, 0, 8, 5, 52, 0.4);           // main approach
      p.rect(1, 0, -16, 22, 8, 0.4);          // hall forecourt
      p.circle(2, 0, 2, 9, 0.8);              // plaza
      p.rect(1, -10, 4, 18, 3.5, 0.3);        // west path
      p.rect(1, 10, 4, 18, 3.5, 0.3);         // east path
      p.rect(3, 19, 14, 14, 12, 0.6);         // training ground
      p.rect(2, -18, -8, 8, 22, 0.5);
      p.rect(2, 19, -8, 8, 22, 0.5);
      p.patches(2, 0.07, 0.66, 0.5);
    },
  },
  surfaces: ['grass', 'stone', 'dirt', 'dirt'],
  spawn: { x: 0, z: 24, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 8, 6, 54).keepClear(0, -16, 24, 8).keepClear(0, 2, 18, 18).keepClear(19, 14, 15, 13).keepClear(-10, 4, 18, 4).keepClear(10, 4, 18, 4);
    b.building('templeHall', 0, -27, 0);
    b.building('dorm', -24, -6, 1);
    b.building('classroom', 25, -6, 3);
    b.building('infirmary', -22, 13, 1);
    b.building('pagoda', 26, -28, 0);
    b.building('koiPond', -20, 27, 0);
    b.building('storehouse', -26, -26, 0);
    b.prop('toriiBig', 0, 32, 0);
    b.prop('torii', 0, -18.5, 0);
    for (let z = 28; z >= -14; z -= 5) { b.prop('stoneLantern', -3.6, z); b.prop('stoneLantern', 3.6, z); }
    b.prop('bell', -14, -24, 0).prop('well', 9, -15, 0).prop('shrineSmall', -30, 4, Math.PI / 2);
    b.prop('signboard', 3, 8, -0.3);
    for (let i = 0; i < 4; i++) b.prop('trainingPost', 14 + i * 3, 19.5);
    b.prop('crate', 25, 18).prop('barrel', 26, 16.5).prop('crate', 25, 10, 0.4);
    b.prop('bench', -8, 9, 0).prop('bench', 8, 9, 0).prop('bench', -14, 22, Math.PI / 2);
    b.prop('carBlack', 8, 30, 0.2).prop('vendingRed', -6, 20, Math.PI / 2).prop('vendingWhite', -6, 21.2, Math.PI / 2);
    b.prop('paperLantern', -9, -18, 0).prop('paperLantern', 9, -18, Math.PI);
    // vegetation
    b.scatter('sakura', 0, 0, 70, 74, 18, { minDist: 4 });
    b.scatter(['bamboo'], -32, -10, 6, 30, 6);
    b.scatter(['cedar', 'pine'], 30, 18, 8, 26, 6);
    b.scatter(['flowerBush', 'bush'], 0, 0, 68, 70, 22);
    b.decor(['grass', 'fern'], 0, 0, 72, 76, 160);
    b.decor('lilyPad', -20, 27, 7, 5, 8);
    b.decor('koi', -20, 27, 6, 4, 6);
    b.border(['cedar', 'pine', 'roundTree', 'bamboo'], 1.5, 3, 1, [{ x: 0, z: 38, r: 4 }]);
    b.scatter('rock2', -30, 20, 8, 16, 3);
    // people
    b.npc({ id: 'gojo', x: 3, z: 3, facing: Math.PI * 0.9, cond: (ps) => ps.questState('m3')?.state === 'done' || active('m3')(ps) });
    b.npc({ id: 'yaga', x: 0, z: -16, facing: Math.PI, shop: 'workshop' });
    b.npc({ id: 'shoko', x: -16.5, z: 13, facing: -Math.PI / 2, shop: 'potions' });
    b.npc({ id: 'maki', x: 13, z: 11, facing: Math.PI, shop: 'armory' });
    b.npc({ id: 'panda', x: -13, z: 24, facing: Math.PI / 2 });
    b.npc({ id: 'inumaki', x: -12, z: 26.5, facing: Math.PI / 2 });
    b.npc({ id: 'ijichi', x: 6, z: 27.5, facing: Math.PI, shop: 'travel' });
    b.npc({ id: 'meimei', x: 20, z: -21, facing: Math.PI, shop: 'exchange', cond: done('m6') });
    b.npc({ id: 'yuji', x: -5, z: 6, facing: Math.PI / 3, cond: (ps) => ps.d.cls !== 'yuji' });
    b.npc({ id: 'megumi', x: -7, z: 3.5, facing: Math.PI / 2, cond: (ps) => ps.d.cls !== 'megumi' });
    b.npc({ id: 'nobara', x: -3.5, z: 2.5, facing: -Math.PI / 4, cond: (ps) => ps.d.cls !== 'nobara' });
    b.dummy(15.5, 14).dummy(19, 13).dummy(22.5, 14.5);
  },
};

// ============================================================================
// Eishu Juvenile Detention Center — rain
// ============================================================================
const eishu: MapDef = {
  id: 'eishu', name: 'Eishu Juvenile Detention Center', jp: '英集少年院', size: [64, 72], night: true,
  lighting: { sky: 0x5a6a76, ground: 0x22282c, hemiIntensity: 1.3, sun: 0xa0b4c4, sunIntensity: 1.1, sunDir: [-0.3, 1, -0.4], ambient: 0x7a8a96, ambientIntensity: 0.35, playerLight: 2.5, fog: 0x1a2428, fogNear: 20, fogFar: 56, bg: 0x10161a, bloom: 0.6, exposure: 1.05 },
  music: 'eishu', ambience: ['rain', 'hum'], weather: 'rain', levelRange: [7, 13],
  terrain: {
    kinds: ['concrete', 'asphalt', 'mud', 'flesh'], scales: [0.15, 0.15, 0.2, 0.2],
    paint: (p) => {
      p.fill(0);
      p.rect(1, 0, 14, 40, 26, 0.5);
      p.patches(2, 0.1, 0.6, 0.8);
      p.circle(3, 0, -24, 10, 3, 0.8);
    },
  },
  surfaces: ['concrete', 'concrete', 'dirt', 'flesh'],
  spawn: { x: 0, z: 29, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 14, 16, 30).keepClear(0, -24, 22, 22);
    b.building('prisonAdmin', -20, 16, 1);
    b.building('prisonBlock', 19, 14, 3);
    b.building('prisonBlock', -20, -2, 1);
    b.building('guardTower', -26, 30, 0);
    b.building('guardTower', 26, 30, 0);
    b.building('guardTower', 26, -6, 0);
    b.building('wombGrowth', 0, -24, 0);
    b.wall('wallBarbed', -32, 33, -4, 33).wall('wallBarbed', 4, 33, 32, 33);
    b.wall('wallBarbed', -32, -40, 32, -40).wall('wallBarbed', -32, -40, -32, 33).wall('wallBarbed', 32, -40, 32, 33);
    b.wall('wallBarbed', -32, -10, -4, -10).wall('wallBarbed', 4, -10, 32, -10);
    b.prop('floodLight', -10, 24, 0).prop('floodLight', 10, 4, 0).prop('floodLight', -6, -6, 0).prop('floodLight', 12, -14, 0);
    b.prop('fenceMetal', -2, 33, 0);
    b.prop('van', 6, 36, Math.PI / 2).prop('carBlack', -8, 36.5, Math.PI / 2);
    b.scatter(['cocoon'], 0, -24, 22, 18, 6, { minDist: 4 });
    b.scatter(['deadTree'], 0, 0, 56, 60, 8, { minDist: 5 });
    b.scatter(['barrel', 'crate', 'trafficCone', 'barricade'], 0, 10, 48, 30, 12);
    b.decor('grassDry', 0, 0, 60, 70, 60);
    for (let i = 0; i < 9; i++) b.water(-14 + (i % 3) * 14 + (i * 3.7 % 5), 22 - Math.floor(i / 3) * 12 + (i * 2.3 % 4), 2.5 + (i % 2), 1.8, 0x23303a, false);
    b.npc({ id: 'ijichi', x: -5, z: 29, facing: Math.PI, shop: 'travel' });
    b.spawner({ enemies: [{ id: 'womb', w: 2 }, { id: 'hound', w: 2 }], x: 0, z: 14, w: 36, d: 24, count: 8, respawn: 10, level: [7, 9] });
    b.spawner({ enemies: [{ id: 'hound' }, { id: 'wretch' }], x: 4, z: -1, w: 22, d: 10, count: 5, respawn: 11, level: [9, 11] });
    b.spawner({ enemies: [{ id: 'wretch', w: 2 }, { id: 'womb' }], x: 0, z: -24, w: 36, d: 20, count: 6, respawn: 12, level: [10, 12] });
    b.boss({ id: 'fingerBearer', x: 0, z: -25, r: 11, quest: 'm5', intro: [
      { who: 'narrator', text: 'The air in the inner block is thick and wet. The womb has burst — and something tall is unfolding from it.' },
      { who: 'narrator', text: 'It turns its head. Four eyes. All of them looking at you.' },
      { who: 'player', text: '…This is a Special Grade. Okay. Okay. We do this.', only: ['yuji'] },
      { who: 'player', text: 'If I fall back, it follows me out. No retreat then.', only: ['megumi'] },
      { who: 'player', text: 'My hands are shaking. Good. That means I\'m awake.', only: ['nobara'] },
    ] });
  },
};

// ============================================================================
// Kawasaki — city at dusk
// ============================================================================
const kawasaki: MapDef = {
  id: 'kawasaki', name: 'Kawasaki City', jp: '川崎市', size: [72, 76], night: false,
  lighting: { sky: 0xffd2b8, ground: 0x4a3a40, hemiIntensity: 1.25, sun: 0xffb888, sunIntensity: 2.1, sunDir: [0.75, 0.6, 0.3], ambient: 0xffe0d0, ambientIntensity: 0.2, fog: 0xc88070, fogNear: 30, fogFar: 78, bg: 0xd8906c, bloom: 0.55, exposure: 1.05 },
  music: 'kawasaki', ambience: ['city', 'wind'], weather: 'none', levelRange: [13, 18],
  terrain: {
    kinds: ['grass', 'concrete', 'dirt', 'asphalt'], scales: [0.18, 0.2, 0.2, 0.15],
    paint: (p) => {
      p.fill(1);
      p.rect(3, 0, 4, 72, 9, 0.2);
      p.rect(3, 0, -8, 9, 64, 0.2);
      p.rect(0, -20, 22, 26, 18, 0.6);
      p.rect(2, -20, 22, 8, 3, 0.4);
      p.rect(0, 22, 27, 30, 8, 0.6);
      p.patches(0, 0.15, 0.7, 0.4);
    },
  },
  surfaces: ['grass', 'concrete', 'dirt', 'concrete'],
  spawn: { x: 4, z: 29, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 4, 72, 10).keepClear(0, -8, 10, 64).keepClear(14, 22, 40, 8);
    b.building('theater', -16, -12, 0);
    b.building('shopRow', 17, -12, 0, { seed: 2 });
    b.building('apartment', -27, -30, 0);
    b.building('office', 15, -30, 0);
    b.building('shopRow', 31, -14, 3, { seed: 5 });
    b.building('house', -30, -10, 1, { seed: 3 });
    b.building('canal', 14, 22, 0);
    // road dressing
    for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) b.decal(x, 4, 2, 0.18, 0xf0f0e0);
    for (let z = -38; z <= 30; z += 4) if (Math.abs(z - 4) > 6) b.decal(0, z, 0.18, 2, 0xf0f0e0);
    b.crosswalk(-7, 4, 8, 3.5, Math.PI / 2).crosswalk(7, 4, 8, 3.5, Math.PI / 2).crosswalk(0, -3, 8, 3.5, 0).crosswalk(0, 11, 8, 3.5, 0);
    b.prop('trafficLight', -5.5, -1.5, 0).prop('trafficLight', 5.5, 9.5, Math.PI);
    b.row('utilityPole', -32, -1, 32, -1, 9, 0);
    b.row('streetLampWarm', -30, 10, 30, 10, 10, Math.PI);
    b.prop('carWhite', -14, 6.5, Math.PI / 2).prop('carRed', 18, 2, -Math.PI / 2).prop('van', 26, 6.5, Math.PI / 2).prop('carBlue', -3, -20, 0);
    b.prop('vendingRed', -8, -6, 0).prop('vendingWhite', -6.8, -6, 0).prop('vendingBlue', 9, -6, 0).prop('postBox', -4, -5.5, 0);
    b.prop('trafficCone', 2.5, -14).prop('trafficCone', 3.5, -15).prop('barricade', 3, -16.5, 0);
    // park + river
    b.scatter(['roundTree', 'autumnTree'], -20, 22, 24, 16, 9, { minDist: 3 });
    b.prop('bench', -24, 18, 0).prop('bench', -16, 26, Math.PI).prop('bench', 4, 18, Math.PI);
    b.scatter(['bush', 'flowerBush'], -20, 22, 24, 16, 6);
    b.decor('grass', -20, 22, 24, 16, 40);
    b.wall('fenceMetal', -6, 18.5, 34, 18.5, 2);
    b.border(['roundTree', 'autumnTree'], 1.5, 3.2, 1, [{ x: 0, z: 38, r: 6 }, { x: 0, z: 4, r: 6 }, { x: 36, z: 4, r: 6 }, { x: -36, z: 4, r: 6 }]);
    b.npc({ id: 'nanami', x: -10, z: -3.5, facing: Math.PI });
    b.npc({ id: 'junpei', x: 4, z: 17, facing: 0, pose: 'sit' });
    b.npc({ id: 'ijichi', x: 8, z: 29, facing: Math.PI, shop: 'travel' });
    b.spawner({ enemies: [{ id: 'transfigured', w: 2 }, { id: 'bloated' }], x: 0, z: 4, w: 60, d: 8, count: 8, respawn: 10, level: [13, 16] });
    b.spawner({ enemies: [{ id: 'leech' }, { id: 'transfigured' }], x: -20, z: 22, w: 22, d: 14, count: 5, respawn: 11, level: [13, 15] });
    b.spawner({ enemies: [{ id: 'bloated' }, { id: 'transfigured', w: 2 }, { id: 'leech' }], x: 0, z: -24, w: 10, d: 28, count: 6, respawn: 12, level: [15, 18] });
    b.portal({ x: -9, z: 25, r: 2, to: 'sewer', toX: 0, toZ: 18, label: 'Sewer entrance', cond: 'm7', condText: 'A rusted grate. You have no reason to go down there yet.' });
  },
};

// ============================================================================
// Kawasaki Sewers
// ============================================================================
const sewer: MapDef = {
  id: 'sewer', name: 'Kawasaki Underground', jp: '川崎地下水路', size: [48, 56], night: true,
  lighting: { sky: 0x5a7a6a, ground: 0x1a2a1e, hemiIntensity: 1.2, sun: 0x8aaa9a, sunIntensity: 0.8, sunDir: [0.2, 1, 0.2], ambient: 0x6a8a7a, ambientIntensity: 0.4, playerLight: 3, fog: 0x0a120e, fogNear: 16, fogFar: 46, bg: 0x050806, bloom: 0.7, exposure: 1.1 },
  music: 'sewer', ambience: ['drips', 'hum'], weather: 'drips', levelRange: [15, 19],
  terrain: {
    kinds: ['sewer', 'concrete', 'mud', 'tile'], scales: [0.2, 0.2, 0.2, 0.25],
    paint: (p) => { p.fill(0); p.patches(2, 0.12, 0.6, 0.7); p.circle(3, 0, -14, 10, 1.5, 0.5); },
  },
  surfaces: ['concrete', 'concrete', 'water', 'stone'],
  spawn: { x: 0, z: 20, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, -14, 22, 22);
    b.wall('wallConcrete', -24, 26, 24, 26).wall('wallConcrete', -24, -28, 24, -28).wall('wallConcrete', -24, -28, -24, 26).wall('wallConcrete', 24, -28, 24, 26);
    b.water(-12, 6, 6, 30, 0x2a4a2a).water(12, 6, 6, 30, 0x2a4a2a);
    for (const z of [18, 8, -2]) { b.prop('pipe', -12, z, Math.PI / 2); b.prop('pipe', 12, z, Math.PI / 2); }
    b.scatter(['barrel', 'crate'], 0, 4, 14, 26, 6);
    for (const [x, z] of [[-6, 16], [6, 6], [-6, -4], [6, -20], [-8, -22], [18, -20], [-18, -18]]) b.light(x, 2.6, z, 0x6aff9a, 6, 9, true);
    b.row('streetLamp', -20, 20, -20, -20, 10, Math.PI / 2);
    b.scatter('cocoon', 0, -14, 20, 16, 3, { minDist: 5 });
    b.npc({ id: 'nanami', x: 4, z: 21, facing: Math.PI, cond: active('m8') });
    b.spawner({ enemies: [{ id: 'leech', w: 2 }, { id: 'transfigured' }], x: 0, z: 6, w: 14, d: 26, count: 6, respawn: 11, level: [15, 18] });
    b.spawner({ enemies: [{ id: 'leech' }], x: 18, z: -6, w: 8, d: 30, count: 3, respawn: 14, level: [16, 18] });
    b.boss({ id: 'mahito', x: 0, z: -15, r: 10, quest: 'm8', intro: [
      { who: 'mahito', text: 'Oh! A sorcerer came all the way down here just for me? I\'m flattered.' },
      { who: 'mahito', text: 'Do you know what a soul is? I do. I can touch it. Reshape it. Isn\'t that the most fun thing in the world?' },
      { who: 'player', text: 'Junpei told me about you. You don\'t get to treat people like toys.', only: ['yuji'] },
      { who: 'player', text: 'You talk too much for something that\'s about to be exorcised.', only: ['megumi', 'nobara'] },
      { who: 'mahito', text: 'Let\'s find out what shape YOUR soul is!' },
    ] });
    b.portal({ x: 0, z: 23.5, r: 2, to: 'kawasaki', toX: -9, toZ: 22, label: 'Back to the surface' });
  },
};

// ============================================================================
// Kyoto Goodwill Event — forest
// ============================================================================
const kyoto: MapDef = {
  id: 'kyoto', name: 'Kyoto Goodwill Forest', jp: '京都姉妹校交流会', size: [78, 84], night: false,
  lighting: { sky: 0xdaf2ff, ground: 0x3a4a2a, hemiIntensity: 1.15, sun: 0xfff4d8, sunIntensity: 2.5, sunDir: [0.35, 1, 0.45], ambient: 0xe0ffe0, ambientIntensity: 0.12, fog: 0x9ac4a0, fogNear: 26, fogFar: 72, bg: 0xa4cfae, bloom: 0.4, exposure: 1.0 },
  music: 'kyoto', ambience: ['birds', 'leaves', 'wind'], weather: 'leaves', levelRange: [19, 26],
  terrain: {
    kinds: ['moss', 'dirt', 'grass', 'stone'], scales: [0.2, 0.22, 0.18, 0.2],
    paint: (p) => {
      p.path(1, [[0, 36], [-4, 22], [-12, 8], [-6, -6], [0, -20], [0, -30]], 4);
      p.path(1, [[-4, 22], [10, 12], [24, -2]], 3.4);
      p.circle(2, -14, 4, 8, 1.2);
      p.circle(2, 0, -27, 11, 1.4);
      p.circle(3, 24, -4, 4.5, 0.8);
      p.rect(3, -22, 26, 18, 10, 0.5);
      p.patches(2, 0.08, 0.6, 0.6);
    },
  },
  surfaces: ['grass', 'dirt', 'grass', 'stone'],
  spawn: { x: 0, z: 34, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 34, 6, 8).keepClear(-14, 4, 16, 16).keepClear(0, -27, 22, 22).keepClear(24, -4, 9, 9);
    // keep the paths clear
    for (const [x, z] of [[-4, 22], [-12, 8], [-6, -6], [0, -20], [10, 12], [2, 28], [-8, 15], [-9, 1], [-3, -13], [17, 5]]) b.keepClear(x, z, 5, 5);
    b.building('kyotoHall', -24, 28, 0);
    b.prop('toriiBlack', 0, 37, 0);
    b.prop('shrineSmall', 24, -6, 0).prop('stoneLantern', 21.5, -3).prop('stoneLantern', 26.5, -3);
    b.prop('torii', 24, -0.5, 0);
    b.scatter(['cedar', 'cedar', 'pine', 'roundTree'], 0, 0, 74, 80, 70, { minDist: 2.8 });
    b.scatter(['mossRock', 'rock2', 'log'], 0, 0, 70, 76, 14, { minDist: 3 });
    b.scatter(['bamboo'], 30, 24, 14, 22, 5);
    b.decor(['fern', 'grass'], 0, 0, 76, 82, 220);
    b.water(18, 18, 3, 16, 0x3a6a6a, false);
    b.border(['cedar', 'pine'], 1.5, 2.6, 1, [{ x: 0, z: 41, r: 4 }]);
    b.npc({ id: 'ijichi', x: 4, z: 34, facing: Math.PI, shop: 'travel' });
    b.npc({ id: 'miwa', x: -3, z: 30, facing: Math.PI });
    b.npc({ id: 'todo', x: -14, z: 4, facing: Math.PI, cond: done('m9') });
    b.pickup('miwaSword', 27, -9, 's_miwa');
    b.spawner({ enemies: [{ id: 'rootCurse' }, { id: 'bud', w: 2 }], x: 8, z: 14, w: 30, d: 16, count: 7, respawn: 11, level: [19, 21] });
    b.spawner({ enemies: [{ id: 'bud' }, { id: 'forestHound' }], x: -16, z: -12, w: 22, d: 16, count: 6, respawn: 12, level: [20, 23] });
    b.spawner({ enemies: [{ id: 'rootCurse' }, { id: 'forestHound' }, { id: 'bud' }], x: 14, z: -18, w: 22, d: 18, count: 6, respawn: 12, level: [22, 25] });
    b.boss({ id: 'todo', x: -14, z: 4, r: 8, quest: 'm9', intro: [
      { who: 'todo', text: 'So YOU are Tokyo\'s rumoured first-year. Before we fight, answer me one question.', emote: 'pointUp' },
      { who: 'todo', text: 'What kind of woman is your type?!' },
    ] });
    b.boss({ id: 'hanami', x: 0, z: -28, r: 11, quest: 'm10', cond: objDone('m10', 0), intro: [
      { who: 'hanami', text: '…Humans. You poison the earth and call it living. I only wish to return the land to those who came first.' },
      { who: 'hanami', text: 'Lie down. Let the flowers take you. It will not hurt — for long.' },
    ] });
  },
};

// ============================================================================
// Shibuya — Halloween night
// ============================================================================
const shibuya: MapDef = {
  id: 'shibuya', name: 'Shibuya', jp: '渋谷事変', size: [84, 84], night: true,
  lighting: { sky: 0x8a6aba, ground: 0x2a2036, hemiIntensity: 1.35, sun: 0xc0a0ff, sunIntensity: 1.1, sunDir: [0.3, 1, 0.2], ambient: 0xa08ac0, ambientIntensity: 0.38, playerLight: 2.5, fog: 0x1a0e2a, fogNear: 30, fogFar: 88, bg: 0x0e0818, bloom: 0.8, exposure: 1.05 },
  music: 'shibuya', ambience: ['crowd', 'city'], weather: 'ash', levelRange: [26, 45],
  terrain: {
    kinds: ['concrete', 'asphalt', 'tile', 'stone'], scales: [0.2, 0.15, 0.22, 0.2],
    paint: (p) => {
      p.fill(0);
      p.rect(1, 0, 0, 34, 34, 0.2);
      p.rect(1, 0, 0, 84, 10, 0.2);
      p.rect(1, 0, 0, 10, 84, 0.2);
      p.rect(2, 0, -24, 26, 10, 0.4);
      p.rect(3, -24, 22, 22, 18, 0.4);
      p.rect(3, 24, 22, 20, 18, 0.4);
    },
  },
  surfaces: ['concrete', 'concrete', 'stone', 'stone'],
  spawn: { x: 0, z: 36, facing: Math.PI },
  build: (b) => {
    b.keepClear(0, 0, 36, 36).keepClear(0, -24, 28, 12).keepClear(-24, 22, 24, 20).keepClear(24, 22, 22, 20).keepClear(0, 36, 10, 10);
    b.building('station', 0, -36, 0);
    for (const [x, s] of [[-30, 1], [-15, 2], [15, 3], [30, 4]] as const) b.building('skyscraper', x, -33, 0, { seed: s });
    b.building('shopRow', -36, -8, 1, { seed: 7 });
    b.building('shopRow', 36, -8, 3, { seed: 8 });
    b.building('apartment', -36, 6, 1);
    b.building('office', 36, 8, 3);
    // the scramble
    b.crosswalk(0, -15, 14, 4, 0).crosswalk(0, 15, 14, 4, 0).crosswalk(-15, 0, 14, 4, Math.PI / 2).crosswalk(15, 0, 14, 4, Math.PI / 2);
    b.crosswalk(0, 0, 26, 3, Math.PI / 4).crosswalk(0, 0, 26, 3, -Math.PI / 4);
    for (const [x, z, r] of [[-17, -17, 0], [17, -17, Math.PI / 2], [17, 17, Math.PI], [-17, 17, -Math.PI / 2]] as const) b.prop('trafficLight', x, z, r);
    b.prop('hachiko', -9, -22, Math.PI);
    b.prop('signPink', -22, -20, 0).prop('signCyan', 22, -20, 0).prop('signGold', -22, 14, Math.PI / 2).prop('signPurple', 22, 14, -Math.PI / 2);
    b.row('streetLamp', -40, 10, -20, 10, 7, Math.PI).row('streetLamp', 20, 10, 40, 10, 7, 0);
    b.prop('carWhite', -6, 7, 0.3).prop('carRed', 9, -8, 2.0).prop('van', -11, -6, 1.2).prop('carBlack', 12, 10, -0.6).prop('carBlue', 3, 22, 0.1);
    b.scatter(['pumpkin', 'trafficCone', 'barricade', 'crate'], 0, 0, 76, 76, 26, { minDist: 2.5 });
    b.scatter(['vendingRed', 'vendingBlue', 'vendingWhite'], 0, 0, 70, 30, 6);
    b.scatter(['roundTree'], -24, 26, 16, 10, 4, { minDist: 4 });
    b.scatter(['roundTree'], 24, 26, 16, 10, 4, { minDist: 4 });
    b.wall('wallConcrete', -42, 42, 42, 42).wall('wallConcrete', -42, -42, -42, 42).wall('wallConcrete', 42, -42, 42, 42);
    b.npc({ id: 'ijichi', x: 5, z: 36, facing: Math.PI, shop: 'travel' });
    b.npc({ id: 'civilian', model: 'civilianA', x: -6, z: 32, facing: 0.5 });
    b.npc({ id: 'civilian', model: 'civilianB', x: -30, z: 30, facing: 1.2 });
    b.npc({ id: 'civilian', model: 'civilianC', x: 30, z: 30, facing: -1.2 });
    b.npc({ id: 'gojo', x: -3, z: 34, facing: Math.PI, cond: done('m14') });
    b.spawner({ enemies: [{ id: 'veilAnchor' }], x: 0, z: 0, w: 60, d: 50, count: 3, respawn: 9999, level: [26, 26], cond: active('m11') });
    b.spawner({ enemies: [{ id: 'hand' }, { id: 'pumpkin' }, { id: 'shibuyaTransfig', w: 2 }], x: 0, z: 0, w: 34, d: 30, count: 9, respawn: 10, level: [26, 30] });
    b.spawner({ enemies: [{ id: 'fish', w: 2 }, { id: 'hand' }], x: 0, z: -22, w: 30, d: 10, count: 6, respawn: 11, level: [28, 31] });
    b.spawner({ enemies: [{ id: 'pumpkin' }, { id: 'shibuyaTransfig' }], x: -24, z: 22, w: 20, d: 16, count: 5, respawn: 12, level: [30, 34] });
    b.spawner({ enemies: [{ id: 'hand' }, { id: 'pumpkin' }], x: 24, z: 22, w: 20, d: 16, count: 5, respawn: 12, level: [31, 36] });
    b.boss({ id: 'dagon', x: 0, z: -24, r: 11, quest: 'm12', intro: [
      { who: 'dagon', text: '…' },
      { who: 'narrator', text: 'Seawater pours from the station exits. Something vast and red-lipped rises out of the flood, watching you with tiny black eyes.' },
    ] });
    b.boss({ id: 'jogo', x: 0, z: 0, r: 12, quest: 'm13', intro: [
      { who: 'jogo', text: 'You\'re the brats who killed Hanami\'s friends? Pathetic. Humans are a fake. Curses are the TRUE humans!' },
      { who: 'jogo', text: 'I\'ll burn you to ash, and the ash to nothing!' },
    ] });
    b.boss({ id: 'sukuna', x: -24, z: 22, r: 11, quest: 'm14', intro: [
      { who: 'sukuna', text: 'So. You\'re the one who has been collecting my fingers. Thank you for the delivery.' },
      { who: 'sukuna', text: 'I\'m in a good mood. I\'ll give you three seconds to entertain me. One.' },
      { who: 'player', text: 'You\'re not taking anyone else. Not today.' },
      { who: 'sukuna', text: 'Two… Oh, never mind. Come, brat. Show me what this era calls "strong".' },
    ] });
    b.boss({ id: 'mahoraga', x: 24, z: 22, r: 11, quest: 's_mahoraga', intro: [
      { who: 'narrator', text: 'A colossal figure crouches beneath a slowly turning golden wheel. As it rises, the wheel clicks once.' },
      { who: 'gojo', text: 'Remember: it adapts. Mix up your attacks — strikes, techniques, everything.' },
    ] });
  },
};

export const MAPS: Record<string, MapDef> = { sugisawa, hub, eishu, kawasaki, sewer, kyoto, shibuya };
/** Destinations Ijichi can drive to; `need` is the quest that must be accepted first. */
export const TRAVEL_LIST: { id: string; need?: string; level: string }[] = [
  { id: 'hub', need: 'm2', level: 'Town' },
  { id: 'sugisawa', level: 'Lv 1–6' },
  { id: 'eishu', need: 'm4', level: 'Lv 7–13' },
  { id: 'kawasaki', need: 'm6', level: 'Lv 13–19' },
  { id: 'kyoto', need: 'm9', level: 'Lv 19–26' },
  { id: 'shibuya', need: 'm11', level: 'Lv 26+' },
];
export function travelUnlocked(ps: PlayerState, id: string) {
  const t = TRAVEL_LIST.find(x => x.id === id);
  if (!t) return false;
  if (!t.need) return true;
  return !!ps.questState(t.need);
}
