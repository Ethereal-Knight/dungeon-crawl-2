# Dungeon Crawler

A touch-friendly Phaser dungeon crawler prototype with generated cave rooms, sword combat, and a first-pass mobile HUD.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dungeon-crawler/src/game/` — Phaser scene, cave generator, and game configuration
- `artifacts/dungeon-crawler/src/components/GameUI.tsx` — responsive HUD and touch controls
- `artifacts/dungeon-crawler/src/pages/GamePage.tsx` — game mount and React/Phaser bridge
- `artifacts/dungeon-crawler/src/index.css` — game shell and HUD styling

## Architecture decisions

- The first slice is a frontend-only Phaser game; progression and persistence are intentionally deferred.
- The cave is generated from a tile grid with rooms and tunnels so wall collision stays deterministic and easy to replace with authored maps later.
- Phaser owns game rules and rendering while React owns the overlay HUD and touch input bridge.

## Product

- Generates a navigable cave with rooms, tunnels, enemies, and collectible coins.
- Supports keyboard movement plus a mobile virtual joystick.
- Supports a sword swing with nearby enemy hit detection, knockback, damage feedback, and coins on defeat.
- Shows health, mana regeneration, armor, coins, and a restart/new-run action.

## User preferences

- Use simple placeholder graphics until the game mechanics are working; replace them later with generated artwork.
- Prioritize touch-screen-friendly controls.

## Gotchas

- The dungeon artifact is the deployable web app at `/`; the API server is not used by the game yet.
- Keep browser scrolling disabled during gameplay so pointer/touch input remains in the game surface.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
