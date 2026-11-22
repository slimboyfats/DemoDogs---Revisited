# Architecture

```
shared  ←  sim  ←  content  ←  client
(types)   (rules)  (the pack)  (pixels, sound, input)
```

## The tick

The client runs `requestAnimationFrame`, but the world only ever advances in fixed 1/60 s ticks
(`game/session.ts`, at most five per frame). Each tick:

1. `Input.read(heading)` turns keys and the touch stick into `Controls` (the mapping is the pure
   `input/controls.ts`, unit tested).
2. `World.step(controls)` moves everything: countdown, each car (AI behaviours drive the rivals),
   car-car and car-world collisions, lap tracking, bots, loose props, pickups, rockets and mines,
   then the derby clock and the end of the race.
3. `world.takeEvents()` hands the client what happened. `render/effects.ts` turns each event into
   dents on the car's own body strip, flying debris, sparks, smoke, scorch marks on the ground,
   floating words, screen shake and synth sounds.
4. `Effects.afterStep()` does the per-tick client work that is not an event: bot walk rigs, skid marks,
   smoke from damaged cars, aging particles.

The world is deterministic: the same venue, car, seed and inputs give the same race, and
`World.hash()` checks it. `packages/content/src/golden.test.ts` runs an all-AI race on every venue and
compares hashes, so a behaviour change shows up as a failing golden.

## The sim (`packages/sim`)

| File         | What                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `world.ts`   | `World`: builds the venue (track samples, distance grid or oval, scenery, field, pickups, bots), `step`, events, hash |
| `physics.ts` | arcade drift driving, walls, statics, car-car impulses, shoving props                                                 |
| `damage.ts`  | damage, part loss, wrecks, respawn, explosions                                                                        |
| `things.ts`  | scrap bots, loose props, pickups, weapons                                                                             |
| `race.ts`    | lap progress, finishing, standings                                                                                    |
| `scenery.ts` | the venue's scenery rules (bend walls, scatter, roadside groups, rings ...)                                           |
| `content.ts` | resolves packs: `extends`, schema validation, cross-references                                                        |
| `ai-kit.ts`  | helpers AI behaviours share                                                                                           |

## Content (`packages/content`)

Every item is a folder found by `import.meta.glob`, so adding a folder registers it. See
`docs/CONTENT.md`.

## The client (`packages/client`)

| File                | What                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `render/stack.ts`   | the sprite-stack renderer: camera, depth groups, slices, baked images |
| `render/strips.ts`  | looks to slice strips, with baked shading; dents and charring         |
| `render/art.ts`     | the strip bank: props, cars and bots per paint                        |
| `render/rig.ts`     | the bots' walk: distance-driven gait and two-bone IK                  |
| `render/ground.ts`  | the ground canvas: grass, road, kerbs, start grid, derby bowl         |
| `render/scene.ts`   | draws a world: ground, shadows, every stack, particles, words         |
| `render/effects.ts` | client-only state driven by sim events                                |
| `render/hud.ts`     | place, laps, score, bars, minimap, standings, centre messages         |
| `game/session.ts`   | one race: world + effects + camera + fixed-step loop                  |
| `ui/`               | garage turntable and results                                          |
| `audio/sound.ts`    | Web Audio synth                                                       |
| `main.ts`           | screens, menus and the frame loop                                     |

## Renderers

`main.ts` picks one renderer per page load. Both draw the same `queueStacks` list (`render/stacks.ts`),
and words and the HUD go on a flat overlay canvas above either one.

- **Pixel engine (default):** `render/pixel/`. Its core comes from mudders' pixel engine: `gl.ts`, `batch.ts`
  (`QuadBatch`), the quad shaders and `Lights` are copied from `mudders/packages/client/src/render/pixel/`.
  On top of that, these sprite-stack addons make it a fake-3D engine:
  - `stack-atlas.ts` packs every slice strip into one texture. A redrawn strip (a dent, charring) is uploaded again
    in place.
  - `stack-batch.ts` and `stack-shaders.ts` draw every slice as one instanced quad in a single draw call. Each
    corner gets its true depth along the view direction (`y·cos(pitch) + z·sin(pitch)`), so the depth buffer
    replaces sorting. Slices are lit by the frame's point lights in dithered bands, and fade with screen-door
    dither.
  - `ground-layer.ts` draws the ground canvas as a texture and uploads only the box painted that frame.
  - `pixel-scene.ts` puts it together: ground, shadows (`QuadBatch` discs), stacks, then particles with
    mudders' stipple and solid pixel-blob shapes.
- **Canvas (fallback):** `render/scene.ts` and `render/stack.ts`. This is 2D canvas drawing with a per-frame sort
  and baked static props. It is used when WebGL2 is missing or with `?renderer=canvas`.

## Art and breaking (`render/strips.ts`, `render/voxels.ts`)

A look is a shape function; `build` samples it into voxels, shades them, and lays the slices out in a strip.
Scenery, bots and weapons are built at `DETAIL` (3 texels to the art pixel); cars, wheels and bumpers at
`CAR_DETAIL` (6). Sampling and shading are cached per part, so another paint colour only recolours.

A strip keeps its pixels in memory (`Strip.px`). Dents, shattering and charring edit those pixels; the pixel
engine uploads them straight to the atlas, and the canvas renderer brings the strip's canvas up to date only
when it draws from it (`settle`). `dentVoxels` punches a crater and returns what came off as blocks.
`detachNear` then looks only around the crater for pieces no longer joined to the floor of the part.
`shatterVoxels` with `detachVoxels` (the whole part) is used once, when a car is wrecked. Loose blocks
(`voxels.ts`) fly, split into 2, 4 or 8 when they land hard, down to `CRUMB`, and are painted into the ground
when they stop.

## Loading and the test range

`Session.load` builds a session a piece at a time (world, ground, each car, scenery, bots) and reports each
step, which `main.ts` shows on the loader with a running count of pixels built.

The test range (`?dev`, or TEST RANGE on the menu) is a world made with `sandbox: true`: no countdown, no
end, and the rivals are parked. `ui/dev-panel.ts` gives tools that tap the world: rocket, mine, blast, hit,
wreck, mend, move a car, put down any prop, pan the camera, and slow or stop time. Every tool calls a function
in `sim/src/range.ts`, which goes through the same `explode`, `damage` and `wreck` as a race, so the range
shows what a race would do. Scripts can use the same tools as `window.__dd.dev.use(x, y, 'blast')`.

## Career

`client/src/game/career.ts` holds the career as pure rules over a plain, JSON-saved state: the car
shop (cars sorted by their manifest `price`), upgrades, repairs, trade-ins, the one-race black
market kit, the loan shark, three race tiers, the ladder and the final. `raceSetup` turns the state
into a field of named rivals and the player's `Setup`; `settle` turns a finished race into a payout
and the next state. `ui/career-screen.ts` only draws the state and calls those functions.

The sim knows nothing of the career. It takes what a career race needs as plain `WorldOptions`:
`field` (named `Entrant`s with upgrades and a fixed skill), `player` (a `Setup`: upgrade levels,
starting health, ram and fuel multipliers, a loaded weapon) and `knockout` (a wreck is out for good,
and the race ends when the player is wrecked or is the last car running). A car's effective stats
live in `car.stats`, the type's stats with `TUNE_STEP` applied per upgrade level.

## Materials, pools and breaking scenery

`material` is a content type. A material lies on the ground in pools (`world.spills`: oil takes
grip, fuel burns, water quenches and bogs) and is what scenery is made of (`strength` against
blast, impact and heat). A static prop with `integrity` is told `batter()` by blasts, rams and
fire; the sim emits `chip` where it was struck and `fall` when it comes down, and the client cuts
the same voxels it cuts out of cars. The `build` scenery rule puts buildings up piece by piece
(`group`, `bears`); one that has lost half its walls comes down whole.

## Fire and smoke

`render/pixel/cells.ts` is mudders' way of drawing fire: single cells (`Bang`, `Fire`, `Wisp`)
carried by rings of turning air, each burning down a colour ramp on its own clock. `Effects.fireball`
lets go the bang and feeds the fire over a third of a second; `flame()` and `plume()` are clutches
of the same cells. `Effects.quality` thins all of it; the frame loop lowers it by itself when
frames run slow (`SlowWatch`).

## The performance recorder

`game/perf-log.ts`, from mudders. RECORD PERFORMANCE on the pause menu, REC in the test range, or
`?perf` in the address starts it; stopping shares or downloads `demodogs-perf-<date>.txt`: one row
per second with frame times, sim, effects and draw CPU, counts of cells, voxels and slices, long
frames, browser stalls and events. Ask for that file when a device runs slow.
