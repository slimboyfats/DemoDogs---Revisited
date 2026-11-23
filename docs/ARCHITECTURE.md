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

## Terrain: craters and patches

A blast of any size digs a pit (`dig` in `damage.ts`, kept in `World.craters`): wider in open
ground than in a road, and a second blast in the same pit widens it instead of adding one. `footing`
reports a pit as its third value; a car in one loses some grip and speed, and one that drops in fast
is thrown up off the far lip. The sim reports it with a `crater` event and the client paints the pit
into the ground cell by cell and throws clods and dust.

The `patches` scenery rule lays pools of a material (mud, tar, ice) on the road, off it or anywhere
when the venue is built. They are ordinary `Spill`s marked `fixed`: they give the same footing and
burn the same way, but no event is sent for them (the client paints them when it builds the
ground) and they are never cleared to make room for new pools.

## Trees and leaves

A static prop with a `crown` is a tree: everything outside its bare trunk is leaf, and
`StaticProp.leaves` runs from 1 (full) to 0 (bare). `shed` in `damage.ts` takes leaves off and
reports it with a `strip` event: a blast's pressure does it out to 2.6 times its damage radius
(less the higher the crown's `hold`), its heat may set a near crown alight (`flash`), fire burns
the crown off before the wood goes, and a ram shakes leaves loose.

The client peels that share of the tree's own copy of its art off, an art pixel at a time, from
the outside in and from the side facing the blast (`stripCrown`), and lets each one go as a
`CKind.Leaf` cell: flung out, braking, then fluttering down on the wind and flipping between a
light and a dark face. Where a leaf lands it is painted into the ground and stays. Now and then a
leaf lets go of a tree near the player by itself.

## World modifiers (`sim/src/modifiers.ts`, `client/src/render/weather-fx.ts`)

A modifier is a content item (`modifier.<name>`) that changes a whole race: rain, a gale, lightning,
night, low gravity, quakes, a rising flood, falling scrap, oil on the road, tinder-dry ground. A
world is made with a list of them (`WorldOptions.modifiers`, sorted so every screen adds them in the
same order); any number run together. `World.mods` holds one `Mod` each, and four numbers the rest of
the sim reads: `grip` (tyres), `gravity` (cars, loose things, embers), `blindPace` (how much slower
rivals drive when they cannot see) and `wind`. `updateModifiers` runs each kind's rule once a tick,
drawing only from `world.rng`. A world with no modifiers draws nothing from it and hashes as it
always did, so the golden hashes do not know modifiers exist.

Events with a warning (a bolt, falling scrap, a quake) are queued as `Pending` and announced with an
`omen` event, so there is something to see and dodge before `bolt`, `skyfall` or `quake` lands. What
they do, they do through the rules already there: `explode`, `batter`, `crater`, `spill`, blazes.

Online, the host's picks ride in the room's `lobby` and `start` messages (`mods`), and a guest's
screen shows them. The menu keeps the last picks in `localStorage`; `WILD` there, or `?mods=wild`,
draws two or three from the race's seed. `?mods=downpour,gale` or `?mods=all` sets them from the URL.

The client shows all of it from events and world state (`WeatherFx`, owned by `Effects`):

- Rain, wind-blown grit, rising embers and the glints on flood water are stateless: each cell's place
  is a hash of its number and the time (after mudders' ambient layers), so nothing is stored or
  stepped. Counts scale with `Effects.quality`.
- A bolt is mudders' sky bolt: a jagged channel walked down from far above the screen with a few
  branches, flickering in hard steps (its `BOLT_FLICK` table).
- Darkness and storm tints are one pass over the finished picture (`pixel/dusk.ts`): a full-screen
  multiply by the modifier's `tint`, lifted by up to 14 lights in banded, dithered steps: a cone for
  each car's headlamps (`lamps`), a pool round each fire, a flash for a bolt or blast.
- Wind sets `WIND` (leaves, smoke, grit and swaying crowns lean with it) and low gravity sets
  `PULL.g`, so debris hangs as long as the cars do.

`scripts/capture-world.mjs` takes one staged shot of each (`pnpm world`).

## Online play (`packages/signal`, `client/src/net`, `client/src/ui/online.ts`)

Set up the way mudders does it: a small lobby server on Render, peers talking directly.

- **Lobby server** (`packages/signal`, ported from mudders): Hono + WebSocket. Identities that
  survive a dropped socket, rooms with 6-character codes, the WebRTC offer/answer/ICE relay, and a
  WebSocket data relay for players who can't reach each other directly. `GET /health`, `GET /stats`.
  Rooms live in memory. Deployed from `render.yaml` (Render Blueprint, free plan); the client finds
  it at `VITE_SIGNAL_URL`, else `/signal` on its own origin in dev (Vite proxies it to :8787), else
  `https://demodogs-signal.onrender.com`.
- **Links** (`net/rtc.ts`, `net/link.ts`, from mudders): star around the host. The host dials each
  guest over WebRTC with public STUN; if the data channel isn't open in 5 s both switch to the
  server relay. `?relay=1` forces the relay, `?ice=none` skips STUN (tests on one machine).
- **Lockstep** (`net/lockstep.ts`): only controls cross the wire (14 bits each, `packControls`).
  The host stamps every change with the tick it applies before and sends guests `tick {upTo, log}`
  30 times a second; guests never run past `upTo`, so there is no prediction or rollback. Guests
  trail the host by half a round trip and feel their own steering after a whole one. Fire is a
  press: its bit drops after the tick it was stamped in. Every 120 ticks guests send `world.hash()`;
  a mismatch (or a change stamped in a guest's past) makes the host send `start` again and the guest
  rebuilds and fast-forwards. A guest that drops and comes back gets the log from where it was.
  Bandwidth is about 1–2 kB/s per guest whatever is exploding.
- **Several humans in one world**: `WorldOptions.humans` adds drivers on seats 1, 2, …;
  `world.humans` lists them by seat and `stepSeats(controls[])` drives them. `you` picks which seat
  `world.player` points at, the car this screen follows. **Rules never read `world.player`**:
  it differs between peers. Race end, knockout and derby rules, and the racer AI's rubber band, use
  `world.humans` (a race ends when every human is home, or `FINISH_GRACE` s after the first).
  With one human everything is as before, so golden hashes are unchanged.
- **Cross-browser determinism**: engines disagree in the last bit of `Math.sin`/`cos`/`atan2`/
  `exp`/`hypot` (Safari vs Chrome). `sim/src/dmath.ts` has fdlibm ports built only from exactly
  rounded operations; an online race installs them over `Math` before building its world
  (`net/det-math.ts`). Single-player keeps the native ones.
- **Join check**: guests send the protocol version and a hash of the manifests and AI code; the
  host refuses a mismatch with "reload the page". The server refuses another protocol version.
- `node scripts/play-net.mjs [relay] [seconds]` (after `pnpm build`): a local lobby server and two
  headless phones race; fails if the guest's world drifts from the host's.
- **Not yet**: host migration (the host leaving ends the room), a hidden host tab stalls the race
  (phones stop the page), and guests feel a round trip of input delay (no prediction).
