# Dungeon Crawler

Dungeon Crawler is a touch-friendly browser game prototype. The current
playable artifact is a small, procedurally generated cave built with Phaser and
wrapped in a React/Vite application.

## Current player experience

Each run creates a new cave, places the player in the first room, and
populates later rooms with some enemies and coin pickups. The current loop is:

1. Explore the generated rooms and connecting tunnels.
2. Move with the keyboard or the on-screen virtual joystick.
3. Collect coins, worth 5 coins per pickup.
4. Fight nearby enemies with the sword attack.
5. Survive as long as possible, then restart after death.

The player starts each run with 100 health, 100 mana, 20 armor, and 0 coins.
Enemy contact removes 5 health and knocks the player backward. A sword swing
costs 10 mana and deals 15 damage to enemies in a short forward cone; enemies
start with 30 health. Mana regenerates over time. When health reaches zero,
the game pauses and the React overlay shows a death screen with the collected
coin total and a **Try Again** button. Restarting resets the resources and
generates a new cave.

### Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` | Touch and drag anywhere in the lower half of the screen |
| Attack | `Space` | Tap the **ATTACK** button |
| Restart after death | — | Tap **Try Again** |

The touch joystick is dynamic: its origin appears where the first touch lands.
It overrides keyboard movement while it is active. The attack button is in a
separate layer above the movement surface so the two controls do not compete
for the same pointer event.

The HUD is rendered by React. It shows health, mana, coins, and armor, plus a
short status hint during play and the game-over overlay after death.

## Why Phaser

Phaser ([phaser.io](https://phaser.io/)) supplies the browser-oriented 2D game
runtime that this prototype needs without requiring the project to implement
its own frame loop, camera, sprite lifecycle, tilemap rendering, or collision
system. It is a good fit for a small action game that must run in a browser
and remain responsive on touch devices.

Phaser currently owns:

- The game scene and frame-by-frame update loop.
- Procedural dungeon creation and tilemap rendering.
- Placeholder textures, player/enemy/coin sprites, and sword-slash feedback.
- Arcade Physics movement, world bounds, wall collision, enemy collision, and
  coin overlap detection.
- Player resources and combat rules.
- The camera that follows the player and the game canvas resize behavior.

React currently owns:

- The application shell and route at `/`.
- Mounting and destroying the Phaser game instance.
- The HUD, death screen, restart button, attack button, and touch joystick.
- React state for values received from the game.

### React/Phaser bridge

`GamePage` dynamically imports Phaser, creates a game with the configuration
from `src/game/GameConfig.ts`, and mounts it into a full-screen container.
`GameScene` and `GameUI` communicate through browser `CustomEvent`s rather
than sharing React state directly:

| Event | Direction | Purpose |
| --- | --- | --- |
| `game-init` | Phaser → React | Sends initial health, mana, coins, and armor |
| `game-update` | Phaser → React | Sends resource changes and lets the HUD detect death |
| `game-attack` | React → Phaser | Requests a sword swing |
| `game-restart` | React → Phaser | Resets resources and restarts the scene |
| `game-joystick` | React → Phaser | Sends a normalized movement vector from -1 to 1 |

This keeps the simulation and rendering in Phaser while leaving browser UI
layout and touch interaction in React.

## Dungeon generation

`DungeonGenerator` creates a 50-by-50 tile grid where `0` is wall and `1` is
floor. It makes up to 15 non-overlapping rooms with random widths and heights
between 5 and 10 tiles, then connects accepted rooms with L-shaped tunnels.
The tunnels are widened by one tile in their respective direction so the
result is navigable.

The first room's center becomes `startPos`. The last accepted room's center is
stored as `endPos`, but it is currently only generated data: there is no end
marker, win check, or victory UI. Reaching that position does not finish the
run.

Enemies and items are placed in rooms after the starting room. Each later room
has a 30% chance of an enemy in its center and a 50% chance of a coin pickup at
a random interior position.

## Repository orientation

This repository is a pnpm workspace containing multiple artifacts:

```text
artifacts/
├── dungeon-crawler/   # Playable web artifact; preview/deploy path: /
├── api-server/        # Separate Express API artifact; preview path: /api
└── mockup-sandbox/    # Design/component preview artifact
```

The Dungeon Crawler's main files are:

- `artifacts/dungeon-crawler/src/game/GameScene.ts` — Phaser scene,
  placeholder textures, input, movement, combat, collisions, resources, and
  the React event bridge.
- `artifacts/dungeon-crawler/src/game/DungeonGenerator.ts` — room, tunnel,
  start/end position, enemy, and item generation.
- `artifacts/dungeon-crawler/src/game/GameConfig.ts` — Phaser renderer,
  Arcade Physics, responsive resize scaling, and scene configuration.
- `artifacts/dungeon-crawler/src/pages/GamePage.tsx` — Phaser mount lifecycle
  and React overlay placement.
- `artifacts/dungeon-crawler/src/components/GameUI.tsx` — HUD, death flow,
  attack control, and dynamic touch joystick.
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

- Visuals are intentionally placeholders. `GameScene.preload()` draws simple
  colored textures for the player, enemies, coin, walls, floor, and slash
  effect; there is no production art pipeline in the game yet.
- Progression is frontend-only and resets with a scene restart. There is no
  persistence, account system, backend progression, or saved run.
- `armor` is displayed in the HUD but is not currently applied to incoming
  damage.
- Coins are awarded by collecting pickups only. Defeating an enemy does not
  currently award coins.
- The generated `endPos` has no gameplay behavior, so the prototype has a
  survival/death loop rather than a completed level objective.
- Enemy behavior is intentionally simple: enemies bounce within the world and
  occasionally move toward the player when nearby.
- Keep browser scrolling and overscroll disabled during gameplay. The global
  styles use `overflow: hidden`, `overscroll-behavior: none`, and
  `touch-action: none` so the lower-half movement surface can reliably receive
  touch input.
- Phaser and React must be cleaned up together. `GamePage` destroys the Phaser
  instance on unmount, and `GameScene` removes its window event listeners on
  shutdown.