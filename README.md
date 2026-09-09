# Dungeon Crawler

Dungeon Crawler is a touch-friendly browser game prototype. The current
playable artifact is a small, procedurally generated cave built with Phaser and
wrapped in a React/Vite application.

## Current player experience

Each run creates a new cave, places the hero in the first room, and fills the
other rooms with enemies and loot. The loop is:

1. Explore the generated rooms and tunnels. The map is a 72×72 connected cave
   with eroded edges and a few loops, so there is usually more than one way
   around.
2. Move with the keyboard or the on-screen virtual joystick. The hero, Wren,
   is a fully animated pixel-art sprite: walking faces down, up, left or
   right, and every action (sword, spell, flinch, knockback, death) has its
   own animation.
3. Fight with the sword (free, close range, wide arc) or throw fireballs
   (costs mana, medium range, small blast radius). Both snap toward the nearest
   enemy that is already roughly in front of you, which makes touch aiming
   forgiving.
4. Collect silver coins (1), gold coins (5), gems (25) and food (heals 30).
   Slain enemies scatter coins, rarely food, and sometimes a gem. Treasure
   chests take three hits to break and always hold a gem plus a handful of
   coins, sometimes food.
5. The stairs down are behind a locked iron gate. One enemy on the floor,
   the one farthest from where you start, carries the key (a bobbing key icon
   floats above it). Kill it, pick up the key, and walk into the gate to
   unlock it. Before each new floor a merchant screen offers three random
   items (see **The merchant** below). From depth 5 a wandering merchant with
   two random items can also be found somewhere in the cave. Arriving on a
   floor grants full mana plus a little health.
6. When health reaches zero the run ends and the overlay shows depth, coins and
   kills with a **Try Again** button.

The hero starts each run with 100 health, 100 mana, 20 armor and 0 coins.
Armor reduces incoming damage (20 armor is roughly a 25% cut) and has a 50%
chance of losing a point on each hit, so it wears down over a run. After a hit
the hero is invulnerable for 0.7 s and blinks. Mana regenerates at 4 per
second at all times.

| Attack | Cost | Damage | Reach | Notes |
| --- | --- | --- | --- | --- |
| Sword | none | 15 | ~1.5 tiles, 140° arc | 280 ms cooldown, alternating swing direction, slows movement to 45% while swinging |
| Fireball | 20 mana | 25 | ~6.5 tiles, 40 px blast | 380 ms cooldown, explodes on walls, enemies, or at max range |

### Cave eras

Every three floors the cave changes character. Depths 1–3 are the base
slate cave (8 floor and 8 wall tiles). Depths 4–6 add the **grotto** set
(mushroom clusters, shallow water, vines, wet pebbles; vine-draped, dripping
and crystal-studded walls, mossy brick faces). Depths 7–9 add the **ember
depths** (ash, glowing cracks, scorched slabs; obsidian with embers, charred
bricks, bone-embedded rock). Depth 10+ adds the **ancient ruins** (rune
slabs, carved tiles, broken mosaic; rune bricks, carved pillars, skull
niches). Each era mixes its own tiles with a little of the previous one.
`tileEra()`, `pickFloorTile(depth)` and `pickWallTile(context, depth)` in
`textures.ts` do the selection; there are 18 floor and 18 wall tiles in all.

### The hero: Wren

Wren is a hooded ranger-mage: teal hood and cloak, glowing cyan eyes in the
hood's shadow, a crimson scarf whose tail flutters with movement, a leather
tunic with a gold buckle, a bronze pauldron over the sword arm, and a
steel-blue rune gauntlet on the casting hand that lights up for spells.

The sprite sheet is generated procedurally by `src/game/hero/heroSheet.ts`,
which has no Phaser dependency: it paints 32×32 frames into an RGBA buffer
from a small pose model (bob, lean, leg/arm offsets, sword angle, glow, eyes,
scarf flutter, flash, dust). `heroTexture.ts` turns that buffer into a canvas
texture with nearest-neighbour filtering and registers one Phaser animation
per (action, direction).

| Animation | Frames | FPS | Directions | Notes |
| --- | --- | --- | --- | --- |
| idle | 4 | 4 | down, up, side | Breathing bob, scarf drift, blink |
| walk | 6 | 10 | down, up, side | Stride cycle with arm swing |
| sword | 5 | 24 | down, up, side | Wind-up, sweep across the body, recover; hit lands on frame 3 |
| cast | 5 | 16 | down, up, side | Gauntlet rises, gathers light, releases |
| hurt | 3 | 24 | down, up, side | White flash, flinch away from the attacker |
| knockback | 3 | 16 | down, up, side | Leaning back, feet braced, dust while sliding |
| death | 7 | 8 | down | Clutch, kneel, topple, lie still; holds the last frame |

"Side" faces right; the game flips it for left. `Player.ts` keeps a free
aiming angle for the hit cone and snaps it to one of the four directions for
the sprite. One-shot actions lock facing until they finish; the hero faces
the attacker when hit so the flinch and skid read correctly.

Run `pnpm --filter @workspace/dungeon-crawler run hero:export` to write
`public/sprites/hero.png`, `hero.json` (Phaser JSON-hash atlas) and a 4×
`hero-preview.png`. Those files are the template for hand-made or generated
art: keep the frame names, positions and 32×32 size, then switch
`installHero()` to `scene.load.atlas(...)` and nothing else changes.

### The merchant

Taking the stairs pauses the game and opens the shop with **three** items
drawn at random from the catalog below (Repair Armor is only in the pool
when armor is damaged). From depth 5 a **wandering merchant** stands in a
random room; walking into him opens a two-item stall rolled once per floor,
and leaving returns you to the cave (step away and back to reopen it). Coins
carry across the whole run. Everything sold is defined in
`src/game/shop.ts` (`rollOffers` does the stocking); the React storefront in
`src/components/ShopUI.tsx` only renders the offered items and dispatches
purchase intents, and Phaser applies them.

| Item | Effect per purchase | Levels | Price |
| --- | --- | --- | --- |
| Weapon | Next sword tier: Rusty 15 → Iron 22 → Steel 30 → Runed 40 → Dragonfang 55 damage, then Dragonfang +N | unlimited | 90, 200, 380, 650, then ×1.3 |
| Armor | Next armor tier: Padded 20 → Leather 35 → Chain 55 → Plate 80 → Mithril 110 max armor, then Mithril +N; fully repaired | unlimited | 70, 160, 300, 520, then ×1.3 |
| Repair Armor | Restores armor to its maximum | — | 1.5 coins per missing point (min 5) |
| Vitality | +20 max health, heals 20 | unlimited | 45 + 30 per level, ×1.1 per level |
| Focus | +2 mana regeneration per second | unlimited | 40 + 25 per level, ×1.1 per level |
| Far Sight | +1.5 tiles of fireball range | unlimited | 40 + 30 per level, ×1.1 per level |
| Luck | +4% chance a coin is gold, +3% gem chance, +6% chance of an extra coin | unlimited | 55 + 35 per level, ×1.1 per level |
| Strength | +15% sword and fireball damage | unlimited | 60 + 40 per level, ×1.1 per level |

Nothing maxes out. After the last named weapon or armor tier, purchases
continue as "+1", "+2"... enchantments (+7 damage or +25 max armor each,
price ×1.3 per level). Repeatable upgrades have no cap; their price is a
linear base compounded by 10% per level. Luck never hands out coins directly,
it only nudges the drop odds.

`derive(run)` in `shop.ts` turns the run state into the numbers gameplay
reads (max health, mana regen, spell lifetime, sword damage/range/cooldown,
spell damage, gold chance, gem chance, extra-drop chance). Player, GameScene and Fireball all
read from it, so adding a new upgrade means adding one entry to the catalog
and one line to `derive`.

### Enemies

Fourteen kinds, defined in `src/game/enemyTypes.ts` and introduced as you go
deeper. Each has a distinct attack style (`Enemy.ts` implements the
behaviours); the scene owns everything that needs world knowledge
(projectiles, blasts, summons, teleport targets) and reacts to events the
enemy raises.

| Kind | From depth | Health | Damage | Style |
| --- | --- | --- | --- | --- |
| Slime | 1 | 30 | 8 | Wanders, chases when within ~5 tiles |
| Bat | 1 | 18 | 5 | Weaves side to side while chasing, long sight |
| Skeleton | 1 | 60 | 14 | Heavy: hard to knock back, drops the most coins |
| Spitter | 1 | 40 | 6 contact, 9 per bolt | Rooted; spits a bolt every 1.7 s while in sight |
| Tusker | 2 | 55 | 16 (×1.5 charging) | Winds up, then charges in a straight line; dazed if it hits a wall |
| Goblin Archer | 3 | 35 | 6 contact, 10 per arrow | Keeps 4–7 tiles away and fires fast arrows |
| Fusecap | 3 | 22 | 22 blast | Runs at you, lights its fuse, explodes in a 58 px radius; kill it first |
| Wraith | 4 | 45 | 11 | Drifts straight through walls, fading in and out |
| Cave Spider | 4 | 40 | 12 | Closes in, then pounces from mid range |
| Cultist | 5 | 50 | 8 contact, 9 per bolt | Fires a three-bolt fan; blinks away when hit or approached |
| Stone Golem | 6 | 180 | 18 contact, 24 slam | Very slow and heavy; ground-slam shockwave when you are close |
| Great Slime | 6 | 75 | 12 | Splits into two slimes on death |
| Bone Warden | 7 | 90 | 16 | Shield blocks 75% of damage from the front; flank it |
| Bone Totem | 8 | 70 | 5 | Rooted; summons bats (up to three alive) while you are in sight |

Enemies scale from the floor they are introduced on: +22% health, +2 damage
and +5% speed per floor (speed caps at 160%), and shooters gain 2 bolt damage
and fire a little faster. Newly unlocked kinds get a spawn-weight boost for
two floors so each new face shows up promptly, and the first-floor kinds thin
out as the roster grows. Damaged enemies show a small health bar; blocked
hits show "blocked" in grey.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` | Touch and drag anywhere in the lower half of the screen |
| Sword | `Space` or `J` | Tap or hold the red sword button |
| Fireball | `F`, `K`, `E` or `Shift` | Tap or hold the blue flame button |
| Pause and show stats | `Esc` or `P` | Tap the pause button on the header bar |
| Restart after death | `R` or `Enter` | Tap **Try Again** |

The touch joystick is dynamic: its origin appears where the first touch lands
in the lower half of the screen and it has a small dead zone. Holding either
action button repeats the action at its cooldown rate. The buttons sit in a
layer above the movement surface so the two never compete for a pointer. The
joystick affordance and the desktop keyboard legend switch automatically based
on whether the device has a coarse (touch) pointer.

The HUD is rendered by React. A single header bar holds the health and mana
meters with their current values, armor, coins, depth, the key indicator and
a pause button, so the cave stays visible underneath on a phone. Below it are
a floor banner on entry, a transient status line (for example "Floor
cleared! Find the stairs."), and the game-over overlay.

### Pause menu and the 3D hero

Pausing freezes the whole scene (physics, enemy thinking, tweens and timers)
and opens the character sheet: vitals (health, mana, armor, coins, depth,
kills, key), combat numbers from `derive()` (sword damage, reach and swing
time, fireball damage, range and cost, mana regen, gold, gem and extra-coin
odds) and every upgrade track with its level. **New run** restarts from
depth 1.

Beside the sheet stands a 3D Wren, modelled from smooth primitives (capsules, spheres, lathes and bevelled blade profiles) with physically based materials, an environment map and cast shadows, in
`src/game/hero/heroModel.ts` with three.js (loaded on first open, so it is
not part of the gameplay bundle) and rendered by `HeroModel.tsx`. Drag to
turn it. Everything the merchant sells shows on the model:

| Purchase | On the model |
| --- | --- |
| Weapon tier | The sword in hand: rusty short blade, iron, steel longsword with a fuller, runed blade with glowing runes, then the curved ember-lit Dragonfang; each +N enchantment adds drifting embers |
| Armor tier | Garments over the tunic: crossed leather straps and bracers, a studded chainmail shirt, plate with tassets, knee plates and a second pauldron, then luminous mithril with rune lines; +N enchantments glow harder |
| Vitality | A heart amulet on the chest, larger per level |
| Focus | Mana crystals orbiting the rune gauntlet, one per level up to six; the gauntlet rune burns brighter |
| Far Sight | A gold circlet on the hood with an amber eye gem |
| Luck | Clover charms hanging from the belt, one per level up to five |
| Strength | Red bands wrapped round the sword arm, one per level up to four |

The model is rebuilt only when gear changes (`gearSignature()`), and falls
back to the 2D sprite when WebGL is unavailable.

## Why Phaser

Phaser ([phaser.io](https://phaser.io/)) supplies the browser-oriented 2D game
runtime that this prototype needs without requiring the project to implement
its own frame loop, camera, sprite lifecycle, tilemap rendering, or collision
system. It is a good fit for a small action game that must run in a browser
and remain responsive on touch devices.

Phaser currently owns:

- The game scene and frame-by-frame update loop.
- Procedural dungeon creation and tilemap rendering.
- Placeholder textures (`src/game/textures.ts`), the hero, enemies, fireball,
  pickups and stairs, plus slash, particle and floating-text feedback.
- Arcade Physics movement, world bounds, wall collision, enemy collision,
  projectile collision and pickup/exit overlap detection.
- Player resources, combat rules, enemy AI and floor progression.
- The camera that follows the player, a screen-space vignette, and a zoom that
  keeps roughly eleven tiles visible across the short side of any screen.

React currently owns:

- The application shell and route at `/`.
- Mounting and destroying the Phaser game instance.
- The HUD, floor banner, status line, death screen, restart button, sword and
  fireball buttons, and the touch joystick.
- React state for values received from the game.

### React/Phaser bridge

`GamePage` dynamically imports Phaser, creates a game with the configuration
from `src/game/GameConfig.ts`, and mounts it into a full-screen container. In
development it also exposes the game as `window.__phaserGame` for debugging.
`GameScene` and `GameUI` communicate through browser `CustomEvent`s declared
in `src/game/events.ts`:

| Event | Direction | Purpose |
| --- | --- | --- |
| `game-init` | Phaser → React | Sends the full run state when a floor starts |
| `game-update` | Phaser → React | Sends run state changes (throttled to ~8/s) |
| `game-level` | Phaser → React | Announces the current depth for the floor banner |
| `game-message` | Phaser → React | Short status text such as "Floor cleared" |
| `game-over` | Phaser → React | The hero died; show the death screen |
| `game-shop` | Phaser → React | A shop opened or its stock changed; carries the run state and the session (`floor` or `cave`, plus the offered item ids) |
| `game-pause` | React → Phaser | Pause menu opened or closed; the scene pauses or resumes entirely |
| `game-attack` | React → Phaser | Requests a sword swing |
| `game-spell` | React → Phaser | Requests a fireball |
| `game-buy` | React → Phaser | Requests a purchase by item id |
| `game-shop-leave` | React → Phaser | Leaves the merchant and starts the next floor |
| `game-restart` | React → Phaser | Starts a fresh run at depth 1 |
| `game-joystick` | React → Phaser | Sends a normalized movement vector from -1 to 1 |

The run state (`RunState`) holds health, mana, armor, coins, depth, kills,
upgrade levels and the current weapon and armor tiers. While the merchant is
open the scene stays alive but paused so purchases mutate the live state; on
leaving, it is passed through `scene.restart({ run })` so progress survives
the regenerated floor.

This keeps the simulation and rendering in Phaser while leaving browser UI
layout and touch interaction in React.

## Dungeon generation

`DungeonGenerator` creates a 72-by-72 tile grid (sized by the scene) where
`0` is wall and `1` is floor, in six steps:

1. Scatter up to `12 + depth` (capped by board area, about 23) non-overlapping
   rooms, 5 to 11 tiles a side, with a two-tile gap between rooms.
2. Join each new room to the nearest earlier room with a 2-wide L-shaped
   tunnel, then add a few extra tunnels so the layout has loops.
3. Erode the walls for two passes: wall tiles with many floor neighbours crumble
   into floor, which gives the rooms and tunnels a cave-like outline.
4. Flood-fill from the start room and fill in any floor that is unreachable, so
   every floor tile is guaranteed walkable. The BFS distance field is kept on
   the generator as `distance`.
5. Put the exit in the room farthest from the start by walking distance.
6. Seed each non-start room with enemies (1 to 2 at depth 1, more deeper and
   in the exit room, capped at 5) and loot: usually 1 to 3 coins (one in four
   is gold, the rest silver), sometimes a gem, occasionally food (15% per
   room). Nothing spawns within four tiles of the hero, and at least one piece
   of food is guaranteed per floor. One chest per six rooms, plus one, lands in
   a random non-start room. The enemy farthest from the start by walking
   distance is marked as the key holder. From depth 5 a merchant is placed in
   a random room that is neither the start nor the exit room.

Enemy kinds are rolled by depth-gated weight from `enemyTypes.ts`.

## Repository orientation

This repository is a pnpm workspace containing multiple artifacts:

```text
artifacts/
├── dungeon-crawler/   # Playable web artifact; preview/deploy path: /
├── api-server/        # Separate Express API artifact; preview path: /api
└── mockup-sandbox/    # Design/component preview artifact
```

The Dungeon Crawler's main files are:

- `artifacts/dungeon-crawler/src/game/GameScene.ts` — Phaser scene: map
  build, spawning, collisions, combat resolution, pickups, floor progression,
  camera, keyboard input, and the React event bridge.
- `artifacts/dungeon-crawler/src/game/DungeonGenerator.ts` — rooms, tunnels,
  erosion, reachability, exit placement, enemy and item spawn tables.
- `artifacts/dungeon-crawler/src/game/Player.ts` — hero sprite: movement,
  four-way facing, animation state (idle/walk/sword/cast/hurt/knockback/
  death), spell casting, armor-reduced damage and knockback.
- `artifacts/dungeon-crawler/src/game/hero/heroSheet.ts` — procedural pixel
  art for Wren: palette, pose model and every frame of every animation.
- `artifacts/dungeon-crawler/src/game/hero/heroTexture.ts` — builds the hero
  canvas texture and registers the Phaser animations.
- `artifacts/dungeon-crawler/scripts/export-hero-sheet.ts` — writes the sheet
  to `public/sprites/` as PNG + JSON atlas (`pnpm run hero:export`).
- `artifacts/dungeon-crawler/src/game/enemyTypes.ts` — the bestiary: stats,
  depth gating and spawn weights for all fourteen kinds.
- `artifacts/dungeon-crawler/src/game/Enemy.ts` — the behaviour routines
  (chase, flutter, stationary, charger, kiter, bomber, phase, leaper,
  teleporter, slam, shield, summoner) and the events they raise.
- `artifacts/dungeon-crawler/src/game/Fireball.ts` — the spell projectile and
  its explosion.
- `artifacts/dungeon-crawler/src/game/textures.ts` — placeholder art for the
  environment, enemies, pickups and effects, generated at runtime.
- `artifacts/dungeon-crawler/src/game/shop.ts` — merchant catalog, purchase
  rules, and `derive()` for upgrade-adjusted hero stats.
- `artifacts/dungeon-crawler/src/game/events.ts` — event names and the
  `RunState` shape shared by Phaser and React.
- `artifacts/dungeon-crawler/src/game/GameConfig.ts` — Phaser renderer,
  Arcade Physics, responsive resize scaling, and scene configuration.
- `artifacts/dungeon-crawler/src/pages/GamePage.tsx` — Phaser mount lifecycle
  and React overlay placement.
- `artifacts/dungeon-crawler/src/components/GameUI.tsx` — HUD, banners,
  death flow, hold-to-repeat action buttons, and dynamic touch joystick.
- `artifacts/dungeon-crawler/src/components/ShopUI.tsx` — the merchant
  screen shown between floors.
- `artifacts/dungeon-crawler/src/components/PauseMenu.tsx` — the pause
  screen: full character sheet next to the 3D hero.
- `artifacts/dungeon-crawler/src/components/HeroModel.tsx` — mounts the
  lazily loaded three.js hero viewer.
- `artifacts/dungeon-crawler/src/game/hero/heroModel.ts` — the 3D Wren:
  body, garments per armor tier, sword per weapon tier, and one visible
  ornament per upgrade track.
- `artifacts/dungeon-crawler/src/index.css` — dark game shell, typography,
  full-screen layout, and touch/scroll constraints.
- `artifacts/dungeon-crawler/vite.config.ts` — Vite root, aliases, base path,
  plugins, and runtime port configuration.

The package manifest at
`artifacts/dungeon-crawler/package.json` is the source of truth for the
Dungeon Crawler's package scripts and dependencies. Phaser and three.js
(pause-menu hero only, code-split) are its runtime dependencies; React, Vite,
Tailwind CSS, and the UI dependencies are part of the browser shell.

## Development

The workspace expects Node.js 24 and pnpm. From the repository root:

```sh
pnpm install
pnpm --filter @workspace/dungeon-crawler run dev
```

The dungeon package's Vite configuration requires both `PORT` and `BASE_PATH`
to be present at startup. Replit's configured Dungeon Crawler workflow
supplies those values. For a manual local run, provide them explicitly, for
example:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/dungeon-crawler run dev
```

Useful validation and build commands:

```sh
# Dungeon Crawler only
pnpm --filter @workspace/dungeon-crawler run typecheck
pnpm --filter @workspace/dungeon-crawler run build

# All workspace libraries and artifacts
pnpm run typecheck
pnpm run build
```

The root `build` script runs the root typecheck first and then runs available
package build scripts. The dungeon package also exposes
`pnpm --filter @workspace/dungeon-crawler run serve` for serving its built
output with Vite preview.

## API relationship

`artifacts/api-server` is a separate Express 5 artifact, not a gameplay
service. Its current route surface is the health check at `/api/healthz`; the
Dungeon Crawler does not call it. There is no server-side game state,
progression, persistence, or coin synchronization in the current prototype.

Run the API independently when working on that artifact:

```sh
pnpm --filter @workspace/api-server run dev
```

The API workflow uses the `PORT` environment variable and the project
configuration lists `DATABASE_URL` as a required environment value. Use the
workspace's environment/secrets configuration rather than putting connection
values in source or documentation. API `dev` builds the server before
starting it; its lower-level scripts are also available from
`artifacts/api-server/package.json`.

## Prototype boundaries and gotchas

- Enemy, pickup and environment visuals are placeholders drawn in
  `src/game/textures.ts`; directional textures face right (angle 0) and are
  rotated at runtime. The hero is real pixel art (see **The hero: Wren**)
  and its texture alone uses nearest-neighbour filtering. `pixelArt` stays
  off in `GameConfig.ts` so the placeholders keep rotating smoothly.
- Progression is frontend-only and resets with a new run. There is no
  persistence, account system, backend progression, or saved run. Upgrades
  bought at the merchant last for the current run only.
- Phaser 4 Arcade physics groups re-apply their defaults (velocity, bounce,
  world-bounds collision) to any object added to them. Set physics flags via
  the group config, or after `group.add(...)`, never only in a constructor.
  `Fireball.launch()` exists for exactly this reason.
- Phaser 4 replaced `setTintFill(color)` with
  `setTint(color).setTintMode(Phaser.TintModes.FILL)`; `clearTint()` restores
  the multiply mode.
- Enemy pathing is deliberately simple: they steer straight at the hero and
  can get stuck on walls. That is acceptable for the prototype and doubles as
  a way to fight from cover.
- Keep browser scrolling, overscroll and zooming disabled during gameplay.
  The viewport meta sets `user-scalable=no`, the global styles put
  `touch-action: none` on `html`, `body` and `#root` (browsers intersect the
  value across every ancestor of the touched element), and `GamePage`
  swallows pinch gestures and a second tap within 300 ms because iOS Safari
  ignores the meta tag. The shop overlay opts back into vertical panning with
  an inline `touch-action: pan-y`.
- Phaser and React must be cleaned up together. `GamePage` destroys the Phaser
  instance on unmount, and `GameScene` removes its window event listeners on
  shutdown.
