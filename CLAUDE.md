# DemoDogs

An original top-down combat racer for phones, drawn with animated sprite stacks. pnpm workspace, TypeScript strict.

## Commands

| Command                                                         | What                                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                                      | Vite dev server (LAN-visible for phones)                                                                      |
| `pnpm check`                                                    | lint + format check + typecheck + tests with coverage. Run before every push                                  |
| `pnpm verify`                                                   | `check`, then build and `scripts/play-smoke.mjs` (headless Chromium at 844×390, screenshots in `captures/`)   |
| `pnpm dev`, then `/?dev`                                        | the test range: fire weapons at parked cars and props, slow time, read the counters                           |
| `/?dev&venue=knotwood`                                          | the test range on a race venue (a flyover and giant trees to break); BIG TREE plants one where you tap        |
| `/?perf`, or RECORD PERFORMANCE when paused                     | the performance recorder: saves a log of what each second cost on that device                                 |
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins. `pnpm play:net` races two headless phones (direct and relay)                |
| `pnpm overdraw [venue ...]`, OVERDRAW in `/?dev`                | fragments per pixel on every venue at 844×390 dpr 2, and heat maps (`captures/overdraw/`)                     |
| `pnpm look [out-dir]`                                           | the same race, blast and smoke shots at 844×390 dpr 2 plus 1:1 crops (`captures/look/`), for before/after     |
| `pnpm sky [out-dir] [venue] [sky ...]`, SKY in `/?dev`          | one race frame under every sky (`captures/sky/`); `/?sky=night` (dusk, rain, storm, snow), `/?light=flat`     |
| `pnpm res [out-dir] [venue ...]`, RESOLUTION when paused        | frame time at each resolution step (`captures/resolution/`); `?res=auto`, `full`, `low`                       |
| `pnpm slices [out-dir] [--video]`; `?slices=0` turns them off   | things built slice by slice (respawned cars, pickups, placed props), staged on the range (`captures/slices/`) |
| menu → TRACK CREATOR, or `/?edit`; `pnpm play:editor [out-dir]` | the track creator; the script builds, saves, loads and races a track by touch at 844×390 (`captures/editor/`) |
| `pnpm bones [out-dir] [--only=scene] [--frames]`                | moving parts staged on the range and on tracks: windmill, radar tower, flags, animals (`captures/bones/`)     |
| `pnpm format`                                                   | Prettier, write                                                                                               |
| `pnpm content:validate`                                         | resolve and validate every manifest                                                                           |
| `UPDATE_GOLDEN=1 pnpm vitest run --project content golden`      | regenerate golden hashes after an intended sim change                                                         |
| `pnpm deploy:pages`                                             | build and push `packages/client/dist` to `gh-pages`                                                           |
| Command                                                         | What                                                                                                          |
| -----------------------------------------------------------     | -----------------------------------------------------------------------------------------------------------   |
| `pnpm dev`                                                      | Vite dev server (LAN-visible for phones)                                                                      |
| `pnpm check`                                                    | lint + format check + typecheck + tests with coverage. Run before every push                                  |
| `pnpm verify`                                                   | `check`, then build and `scripts/play-smoke.mjs` (headless Chromium at 844×390, screenshots in `captures/`)   |
| `pnpm dev`, then `/?dev`                                        | the test range: fire weapons at parked cars and props, slow time, read the counters                           |
| `/?dev&venue=knotwood`                                          | the test range on a race venue (a flyover and giant trees to break); BIG TREE plants one where you tap        |
| `/?perf`, or RECORD PERFORMANCE when paused                     | the performance recorder: saves a log of what each second cost on that device                                 |
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins. `pnpm play:net` races two headless phones (direct and relay)                |
| `pnpm overdraw [venue ...]`, OVERDRAW in `/?dev`                | fragments per pixel on every venue at 844×390 dpr 2, and heat maps (`captures/overdraw/`)                     |
| `pnpm look [out-dir]`                                           | the same race, blast and smoke shots at 844×390 dpr 2 plus 1:1 crops (`captures/look/`), for before/after     |
| `pnpm sky [out-dir] [venue] [sky ...]`, SKY in `/?dev`          | one race frame under every sky (`captures/sky/`); `/?sky=night` (dusk, rain, storm, snow), `/?light=flat`     |
| `?mods=downpour,gale` (or `all`, `wild`), WORLD on the menu     | world modifiers (rain, gale, lightning, night ...); `pnpm world` shoots each one (`captures/world/`)          |
| `pnpm format`                                                   | Prettier, write                                                                                               |
| `pnpm content:validate`                                         | resolve and validate every manifest                                                                           |
| `UPDATE_GOLDEN=1 pnpm vitest run --project content golden`      | regenerate golden hashes after an intended sim change                                                         |
| `pnpm deploy:pages`                                             | build and push `packages/client/dist` to `gh-pages`                                                           |
| Command                                                         | What                                                                                                          |
| -----------------------------------------------------------     | -----------------------------------------------------------------------------------------------------------   |
| `pnpm dev`                                                      | Vite dev server (LAN-visible for phones)                                                                      |
| `pnpm check`                                                    | lint + format check + typecheck + tests with coverage. Run before every push                                  |
| `pnpm verify`                                                   | `check`, then build and `scripts/play-smoke.mjs` (headless Chromium at 844×390, screenshots in `captures/`)   |
| `pnpm dev`, then `/?dev`                                        | the test range: fire weapons at parked cars and props, slow time, read the counters                           |
| `/?dev&venue=knotwood`                                          | the test range on a race venue (a flyover and giant trees to break); BIG TREE plants one where you tap        |
| `/?perf`, or RECORD PERFORMANCE when paused                     | the performance recorder: saves a log of what each second cost on that device                                 |
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins. `pnpm play:net` races two headless phones (direct and relay)                |
| `pnpm overdraw [venue ...]`, OVERDRAW in `/?dev`                | fragments per pixel on every venue at 844×390 dpr 2, and heat maps (`captures/overdraw/`)                     |
| `pnpm look [out-dir]`                                           | the same race, blast and smoke shots at 844×390 dpr 2 plus 1:1 crops (`captures/look/`), for before/after     |
| `pnpm sky [out-dir] [venue] [sky ...]`, SKY in `/?dev`          | one race frame under every sky (`captures/sky/`); `/?sky=night` (dusk, rain, storm, snow), `/?light=flat`     |
| `pnpm life [out-dir] [--only=scene] [--venues=a,b]`             | boost tiles, ramps, animals and crops staged on the range and on real tracks (`captures/life/`)               |
| `pnpm format`                                                   | Prettier, write                                                                                               |
| `pnpm content:validate`                                         | resolve and validate every manifest                                                                           |
| `UPDATE_GOLDEN=1 pnpm vitest run --project content golden`      | regenerate golden hashes after an intended sim change                                                         |
| `pnpm deploy:pages`                                             | build and push `packages/client/dist` to `gh-pages`                                                           |
| Command                                                         | What                                                                                                          |
| -----------------------------------------------------------     | -----------------------------------------------------------------------------------------------------------   |
| `pnpm dev`                                                      | Vite dev server (LAN-visible for phones)                                                                      |
| `pnpm check`                                                    | lint + format check + typecheck + tests with coverage. Run before every push                                  |
| `pnpm verify`                                                   | `check`, then build and `scripts/play-smoke.mjs` (headless Chromium at 844×390, screenshots in `captures/`)   |
| `pnpm dev`, then `/?dev`                                        | the test range: fire weapons at parked cars and props, slow time, read the counters                           |
| `/?dev&venue=knotwood`                                          | the test range on a race venue (a flyover and giant trees to break); BIG TREE plants one where you tap        |
| `/?perf`, or RECORD PERFORMANCE when paused                     | the performance recorder: saves a log of what each second cost on that device                                 |
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins. `pnpm play:net` races two headless phones (direct and relay)                |
| `pnpm overdraw [venue ...]`, OVERDRAW in `/?dev`                | fragments per pixel on every venue at 844×390 dpr 2, and heat maps (`captures/overdraw/`)                     |
| `pnpm look [out-dir]`                                           | the same race, blast and smoke shots at 844×390 dpr 2 plus 1:1 crops (`captures/look/`), for before/after     |
| `pnpm sky [out-dir] [venue] [sky ...]`, SKY in `/?dev`          | one race frame under every sky (`captures/sky/`); `/?sky=night` (dusk, rain, storm, snow), `/?light=flat`     |
| `?mods=downpour,gale` (or `all`, `wild`), WORLD on the menu     | world modifiers (rain, gale, lightning, night ...); `pnpm world` shoots each one (`captures/world/`)          |
| `pnpm format`                                                   | Prettier, write                                                                                               |
| `pnpm content:validate`                                         | resolve and validate every manifest                                                                           |
| `UPDATE_GOLDEN=1 pnpm vitest run --project content golden`      | regenerate golden hashes after an intended sim change                                                         |
| `pnpm deploy:pages`                                             | build and push `packages/client/dist` to `gh-pages`                                                           |

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
- **Moving parts are bones in the look** (`rig` in shared/looks.ts; `rigLook` in content/src/rigs.ts builds the whole
  look from the bare part and its bones). They are for show only: the client moves them (render/bones.ts) from the
  clock, the wind and where the cars are, and the sim never knows. A hurt thing is drawn whole and stops.
- **Rules never read `world.player`**: in online play it is each screen's own car. Use `world.humans` / `isPlayer`.
- **The sim reports, the client shows.** Anything visual or audible is driven by a `SimEvent` or by reading world
  state; the sim holds no client state.
- **Original content only.** No names, characters, tracks or art from existing games.
- **Custom tracks are data, not content.** A track from the track creator is a `TrackFile` (shared/track-file.ts);
  `installTrack` (sim/custom.ts) turns it into a venue in a copy of the content. It names props by id and must keep
  loading when ids go: unknown ones are left out, never an error. Every prop is placeable; nothing is added per prop.
- Golden hashes change only on purpose: say why in the commit when you regenerate them.
