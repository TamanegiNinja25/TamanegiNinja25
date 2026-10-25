# Cursed Chronicles

A Zenonia-style action RPG for Android, set in the Jujutsu Kaisen universe.
It is a fan game, not affiliated with or endorsed by Gege Akutami, Shueisha or MAPPA.

Everything in it is generated in code: the cel-shaded 3D models, buildings, terrain,
skill icons, portraits, music and sound effects. The game has no external art or audio
files, so the APK is small and runs fully offline.

## Features

**Three playable classes, each with its own skill tree**

| Class | Style | Skills | Ultimate |
|---|---|---|---|
| Yuji Itadori | Close-range brawler | Divergent Fist, Manji Kick, Cursed Rush, Meteor Slam, Black Flash, Slaughter Demon | King of Curses: Malevolent Shrine |
| Megumi Fushiguro | Summoner and swordsman | Divine Dogs, Nue, Toad, Shadow Step, Max Elephant, Rabbit Escape | Domain Expansion: Chimera Shadow Garden |
| Nobara Kugisaki | Ranged nails and hammer | Hairpin, Nail Volley, Resonance, Hammer Smash, Straw Doll Curse, Cursed Nail Rain | Resonance: Thousand Nails |

Each class also has four passive skills. You get 5 stat points (STR / DEX / VIT / CE)
and 1 skill point per level, up to level 50.

**Zenonia-style RPG systems**
- Combo attacks, dodge with invulnerability frames, and five skill slots plus an ultimate.
- Black Flash crits (×2.5 damage, hit-stop and a damage "zone" buff).
- Loot in four rarities (Common, Graded, Special Grade, Cursed Tool) with random stats.
  Class weapons, outfits, charms and shoes.
- Infusion at Yaga's workshop raises gear from +1 to +10. Higher tiers can fail and
  drop a level.
- Shops for potions, gear and material exchange.
- Ijichi's car for fast travel between unlocked areas.
- Three save slots that save automatically.

**Story: five chapters, 14 main quests and 11 side quests**
1. Sugisawa High: the finger, the rooftop curse, Gojo.
2. Eishu Detention Center: the Finger Bearer.
3. Kawasaki: Nanami, Junpei and Mahito.
4. Kyoto Goodwill Event: Todo's "type" question and Hanami.
5. Shibuya Incident: Dagon, Jogo and the King of Curses. Optional fight: Mahoraga, who
   adapts to whatever damage you use.

Bosses have telegraphed attacks and phases, and can summon adds. Some cast a
**Domain Expansion** with sure-hit damage. If your domain gauge is full, cast your
ultimate inside an enemy domain to start a **domain clash** and shatter it.

**Visuals and sound**
- Cel-shaded models with outlines, rim light and glowing cursed energy, plus bloom.
- Seven hand-laid maps with weather (rain, sakura, ash, embers, fireflies).
- Day and night lighting with dynamic lights.
- Trees, roofs and walls fade out when they block the camera.
- Every movement has its own sound: footsteps change with the surface, and each hit,
  skill, shikigami and domain has a synthesized effect.
- Each zone has its own music theme and an ambience layer (rain, crickets, city, wind and more).

## Controls

Touch: use the floating joystick on the left and the action buttons on the right
(attack, five skills, ultimate, dodge, two potions, talk). Menu buttons are at the top right.

Keyboard (browser or a phone with a keyboard):

| Key | Action |
|---|---|
| WASD / arrows | Move |
| J / Space | Attack (combo) |
| 1–5 | Skills |
| R | Ultimate / domain |
| Shift | Dodge |
| Q / E | HP / CE potion |
| F / Enter | Talk / interact |
| I / K / L / M | Bag / skills / quests / map |
| Esc | Close menu / system menu |

On Android, Back closes menus. Press it twice to quit.

## Getting the APK

The GitHub Actions workflow `.github/workflows/cursed-chronicles-apk.yml` builds a debug
and a release APK on every push that touches `CursedChronicles/`. Download them from the
run's **CursedChronicles-apk** artifact. The release APK is signed with the debug key,
so you can sideload it directly ("Install unknown apps" must be allowed).

Requirements: Android 7.0 (API 24) or newer, with OpenGL ES 3.0. Landscape only.

## Building locally

```bash
cd CursedChronicles/web
npm ci
npm run typecheck
npm run build        # writes android/app/src/main/assets/www/game.js

cd ../android
./gradlew assembleDebug   # needs JDK 17 and the Android SDK (compileSdk 35)
```

For quick iteration in a desktop browser, run `npm run serve` and open http://localhost:8080.
Saves go to `localStorage`, under the same keys the app uses.

## Project layout

```
CursedChronicles/
  web/                  TypeScript + three.js game
    src/core/           input, math, noise
    src/render/         renderer, toon shaders, rigs, models, effects, weather, textures
    src/audio/          synthesized SFX, music sequencer, ambience
    src/rpg/            stats, classes, skills, items, enemies, player state
    src/world/          maps, map builder, collision, world simulation
    src/entities/       player, enemies, bosses, summons, projectiles, NPCs
    src/ui/             HUD, menus, dialogue, icons, portraits
    src/data/story.ts   quests and dialogue
  android/              WebView host app (Java, no third-party dependencies)
```
