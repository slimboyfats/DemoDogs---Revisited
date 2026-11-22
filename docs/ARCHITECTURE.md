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
