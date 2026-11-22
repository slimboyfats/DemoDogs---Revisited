# DemoDogs

An original top-down combat racer for phones, drawn with animated sprite stacks. pnpm workspace, TypeScript strict.

## Commands

| Command                                                    | What                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                 | Vite dev server (LAN-visible for phones)                                                                    |
| `pnpm check`                                               | lint + format check + typecheck + tests with coverage. Run before every push                                |
| `pnpm verify`                                              | `check`, then build and `scripts/play-smoke.mjs` (headless Chromium at 844×390, screenshots in `captures/`) |
| `pnpm dev`, then `/?dev`                                   | the test range: fire weapons at parked cars and props, slow time, read the counters                         |
| `pnpm format`                                              | Prettier, write                                                                                             |
| `pnpm content:validate`                                    | resolve and validate every manifest                                                                         |
| `UPDATE_GOLDEN=1 pnpm vitest run --project content golden` | regenerate golden hashes after an intended sim change                                                       |
| `pnpm deploy:pages`                                        | build and push `packages/client/dist` to `gh-pages`                                                         |

## Packages

| Package   | Owns                                                                                     | May import  |
| --------- | ---------------------------------------------------------------------------------------- | ----------- |
| `shared`  | schemas, `Controls`, `SimEvent`, look types, constants                                   | zod         |
| `sim`     | `World`, physics, damage, bots, weapons, race rules, scenery rules, AI kit               | shared      |
| `content` | the `core` pack (one folder per item), palette, shared parts, test helpers               | shared, sim |
| `client`  | pixel engine (WebGL2, from mudders) + canvas fallback, effects, HUD, input, audio, menus | all         |

## Hard rules

- **No GitHub Actions.** Checks run locally (`pnpm verify`); deploys run by hand.
- **Determinism:** sim and content never use `Math.random`, `Date`, `performance`, timers or the DOM. Randomness
  comes from `world.rng`; scenery uses the venue's own seed. ESLint enforces this.
- **The kernel never imports content** and never names a content id. Rules take ids from manifests.
- **Every item is a folder** `packages/content/core/<type>/<name>/` with `manifest.json`, a `<name>.test.ts`, and a
  `look.ts` if it is drawn (cars, props, weapons, bots) or `behaviour.ts` for AI. New ids go in `ids.lock.json`.
- **The sim reports, the client shows.** Anything visual or audible is driven by a `SimEvent` or by reading world
  state; the sim holds no client state.
- **Original content only.** No names, characters, tracks or art from existing games.
- Golden hashes change only on purpose: say why in the commit when you regenerate them.
