# Dungeon Crawler

Dungeon Crawler is a touch-friendly browser game prototype. The current
playable artifact is a small, procedurally generated cave built with Phaser and
wrapped in a React/Vite application.

## Current player experience

Each run creates a new cave, places the hero in the first room, and fills the
other rooms with enemies and loot. The loop is:

1. Explore the generated rooms and tunnels. The map is a connected cave with
   eroded edges and a few loops, so there is usually more than one way around.
2. Move with the keyboard or the on-screen virtual joystick. The hero turns to
   face the direction of travel; the visor and the sword show which way they
   are heading.
3. Fight with the sword (free, close range, wide arc) or throw fireballs
   (costs mana, medium range, small blast radius). Both snap toward the nearest
   enemy that is already roughly in front of you, which makes touch aiming
   forgiving.
4. Collect coins (5), gems (25) and food (heals 30). Slain enemies scatter
   coins, sometimes food, and skeletons occasionally drop a gem.
5. Find the gold-framed stairs to descend. Each floor is bigger, has more and
   tougher enemies, and grants full mana plus a little health on arrival.
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

### Enemies

| Kind | Health | Speed | Damage | Behaviour |
| --- | --- | --- | --- | --- |
| Slime | 30 | slow | 8 | Wanders, chases when within ~5 tiles |
| Bat | 18 | fast | 5 | Weaves side to side while chasing, long sight |
| Skeleton | 60 | medium | 14 | Heavy: hard to knock back, drops the most coins |

Health scales by 18% and damage by 1.5 per floor. Enemies stop after each hit
and recoil, so contact never drains health continuously. Damaged enemies show
a small health bar.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` | Touch and drag anywhere in the lower half of the screen |
| Sword | `Space` or `J` | Tap or hold the red sword button |
| Fireball | `F`, `K`, `E` or `Shift` | Tap or hold the blue flame button |
| Restart after death | `R` or `Enter` | Tap **Try Again** |

The touch joystick is dynamic: its origin appears where the first touch lands
in the lower half of the screen and it has a small dead zone. Holding either
action button repeats the action at its cooldown rate. The buttons sit in a
layer above the movement surface so the two never compete for a pointer. The
joystick affordance and the desktop keyboard legend switch automatically based
on whether the device has a coarse (touch) pointer.

The HUD is rendered by React. It shows health and mana bars with numbers,
coins, armor, current depth, a floor banner on entry, a transient status line
(for example "Floor cleared! Find the stairs."), and the game-over overlay.

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
| `game-attack` | React → Phaser | Requests a sword swing |
| `game-spell` | React → Phaser | Requests a fireball |
| `game-restart` | React → Phaser | Starts a fresh run at depth 1 |
| `game-joystick` | React → Phaser | Sends a normalized movement vector from -1 to 1 |

The run state (`RunState`) holds health, mana, armor, coins, depth and kills.
It is passed through `scene.restart({ run })` when descending so progress
survives the regenerated floor.

This keeps the simulation and rendering in Phaser while leaving browser UI
layout and touch interaction in React.

## Dungeon generation

`DungeonGenerator` creates a 50-by-50 tile grid where `0` is wall and `1` is
floor, in six steps:

1. Scatter up to `9 + depth` (max 16) non-overlapping rooms, 5 to 11 tiles a
   side, with a two-tile gap between rooms.
2. Join each new room to the nearest earlier room with a 2-wide L-shaped
   tunnel, then add a few extra tunnels so the layout has loops.
3. Erode the walls for two passes: wall tiles with many floor neighbours crumble
   into floor, which gives the rooms and tunnels a cave-like outline.
4. Flood-fill from the start room and fill in any floor that is unreachable, so
   every floor tile is guaranteed walkable. The BFS distance field is kept on
   the generator as `distance`.
5. Put the exit in the room farthest from the start by walking distance.
6. Seed each non-start room with enemies (1 to 2 at depth 1, more deeper and
   in the exit room, capped at 5) and loot: usually 1 to 3 coins, sometimes a
   gem, sometimes food. Nothing spawns within four tiles of the hero, and at
   least one piece of food is guaranteed per floor.

Enemy kinds are rolled by weight; skeletons become more common with depth.

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
- `artifacts/dungeon-crawler/src/game/Player.ts` — hero sprite with facing,
  sword swing animation, spell casting, armor-reduced damage and knockback.
- `artifacts/dungeon-crawler/src/game/Enemy.ts` — enemy stats per kind and
  the wander/chase/stunned state machine.
- `artifacts/dungeon-crawler/src/game/Fireball.ts` — the spell projectile and
  its explosion.
- `artifacts/dungeon-crawler/src/game/textures.ts` — all placeholder art,
  generated at runtime. Swap these for real sprites without touching gameplay.
- `artifacts/dungeon-crawler/src/game/events.ts` — event names and the
  `RunState` shape shared by Phaser and React.
- `artifacts/dungeon-crawler/src/game/GameConfig.ts` — Phaser renderer,
  Arcade Physics, responsive resize scaling, and scene configuration.
- `artifacts/dungeon-crawler/src/pages/GamePage.tsx` — Phaser mount lifecycle
  and React overlay placement.
- `artifacts/dungeon-crawler/src/components/GameUI.tsx` — HUD, banners,
  death flow, hold-to-repeat action buttons, and dynamic touch joystick.
- `artifacts/dungeon-crawler/src/index.css` — dark game shell, typography,
  full-screen layout, and touch/scroll constraints.
- `artifacts/dungeon-crawler/vite.config.ts` — Vite root, aliases, base path,
  plugins, and runtime port configuration.

The package manifest at
`artifacts/dungeon-crawler/package.json` is the source of truth for the
Dungeon Crawler's package scripts and dependencies. Phaser is its runtime
dependency; React, Vite, Tailwind CSS, and the UI dependencies are part of the
browser shell.

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

- Visuals are intentionally placeholders. `src/game/textures.ts` draws simple
  vector shapes; every directional texture faces right (angle 0) and is
  rotated at runtime. `pixelArt` is off in `GameConfig.ts` so these rotate
  smoothly; turn it on when pixel sprites arrive.
- Progression is frontend-only and resets with a new run. There is no
  persistence, account system, backend progression, saved run, or shop yet.
  Coins and gems accumulate so a shop can be added between floors.
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
- Keep browser scrolling and overscroll disabled during gameplay. The global
  styles use `overflow: hidden`, `overscroll-behavior: none`, and
  `touch-action: none` so the lower-half movement surface can reliably receive
  touch input.
- Phaser and React must be cleaned up together. `GamePage` destroys the Phaser
  instance on unmount, and `GameScene` removes its window event listeners on
  shutdown.
