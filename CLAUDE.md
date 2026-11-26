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
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins, `?lag=160&jitter=120` a bad link. `pnpm play:net`: 2 phones                 |
| `pnpm overdraw [venue ...]`, OVERDRAW in `/?dev`                | fragments per pixel on every venue at 844×390 dpr 2, and heat maps (`captures/overdraw/`)                     |
| `pnpm look [out-dir]`                                           | the same race, blast and smoke shots at 844×390 dpr 2 plus 1:1 crops (`captures/look/`), for before/after     |
| `pnpm speed [out-dir] [--frames] [--only=scene]`                | what slows a car (off road, hill, mud road, damage) and the speedometer naming it (`captures/speed/`)         |
| `pnpm sky [out-dir] [venue] [sky ...]`, SKY in `/?dev`          | one race frame under every sky (`captures/sky/`); `/?sky=night` (dusk, rain, storm, snow), `/?light=flat`     |
| `/?sky=mist` (`dawn`, `fog-night`), `?mods=pea-soup`, `?fog=0`  | ground fog; `pnpm chase out knotwood dawn` films cars ploughing through it, `pnpm sky out venue mist` a frame |
| `pnpm chase [out-dir] [venue] [sky] [--seconds=8]`              | a night chase to judge the feel by: beams, tail lamps, tracks and spray in one clip (`captures/chase/`)       |
| `pnpm traced [out-dir] [venue ...]`; `?gi=0`, `?flames=0`       | the traced light on, off and as a field by day, dusk and night, and its cost (`captures/traced/`)             |
| `pnpm ground [out-dir] [venue ...] [--maps]`                    | every venue's painted ground as one picture, a close-up and a race frame (`captures/ground/`)                 |
| `pnpm bridge [out-dir] [--only=scene] [--frames]`               | knocks the legs out from under the overpass and the flyover and shoots the collapse (`captures/bridge/`)      |
| `pnpm res [out-dir] [venue ...]`, RESOLUTION when paused        | frame time at each resolution step (`captures/resolution/`); `?res=auto`, `full`, `low`                       |
| `pnpm perf:start [venue ...]`; `STEPS=1`, `FRAMES=240`          | what a race's load and first frames cost the page: stalling GL calls, slowest frames, heap                    |
| `pnpm slices [out-dir] [--video]`; `?slices=0` turns them off   | things built slice by slice, and tall scenery seen through when it hides your car (`captures/slices/`)        |
| menu → TRACK CREATOR, or `/?edit`; `pnpm play:editor [out-dir]` | the track creator; the script builds, shares and races a track by touch (`PORTRAIT=1` puts the phone upright) |
| `pnpm bones [out-dir] [--only=scene] [--frames]`                | moving parts staged on the range and on tracks: windmill, radar tower, flags, animals (`captures/bones/`)     |
| `pnpm bumps [out-dir] [--only=scene] [--frames]`                | cars on ramps, speed bumps, dips, potholes, a hill and a flyover, to see how they lie (`captures/bumps/`)     |
| `pnpm cars [out-dir] [car ...] [--only=scene] [--frames]`       | the cars in a row by day and night, with every add-on at three sizes, and driven (`captures/cars/`)           |
| `pnpm tracks [out-dir] [venue ...] [--map] [--at=0,0.5]`        | every venue's whole map as the game draws it, and race frames at points round the road (`captures/tracks/`)   |
| `pnpm audio [out-dir] [--video] [--only=scene]`, `?tape=40`     | tapes the game's sound in step with its ticks: a WAV and spectrogram a scene, an mp4 (`captures/audio/`)      |
| `pnpm tricks [out-dir] [--frames] [--only=scene]`               | the ten tricks out of the Bag of Tricks crate, each staged on the range (`captures/tricks/`)                  |
| `pnpm ui [out-dir] [--portrait]`                                | the menus, settings sheet, pause menu, race HUD and results at 844×390, or upright (`captures/ui/`)           |
| `/?lesson`, menu → DRIVING LESSON; `pnpm play:lesson [out-dir]` | the driving lesson a new player is offered; the script takes it by touch (`--portrait`, `--frames`)           |
| `pnpm bots [out-dir] [venue ...] [--seeds=1,2,3]`               | the bot lab: bots race every venue alone; laps, knocks, stuck time and shots counted (`captures/bots/`)       |
| `pnpm bots:clip [out-dir] [--venue=x] [--seconds=30]`           | a clip of a race driven by bots alone, camera wide (`captures/bots/`); slow, a minute a second                |
| `pnpm hitboxes [dir]`; `?hitboxes=heights`; `hitboxes:bake`     | hit shapes drawn over cars, scenery, guns and roads (`captures/hitboxes/`); bake them from the looks          |
| `pnpm bench:sim`; `SIM_BENCH_OUT=f.json`, then `SIM_BENCH_REF=` | what a sim tick and building a track cost on every venue, and a fingerprint to prove a change changed nothing |
| `pnpm perf:fight [venue ...]`; `SECONDS=20`, `PROFILE=1`        | what a derby's heaviest ticks cost the page: worst tick, garbage a tick, collections, texels sent             |
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
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins, `?lag=160&jitter=120` a bad link. `pnpm play:net`: 2 phones                 |
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
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins, `?lag=160&jitter=120` a bad link. `pnpm play:net`: 2 phones                 |
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
| `pnpm dev` (also starts the lobby server), menu → ONLINE        | online races; `?room=CODE` joins, `?lag=160&jitter=120` a bad link. `pnpm play:net`: 2 phones                 |
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
- **A piece of a stack can have a finish of its own** (`Finish` in shared/looks.ts: matte, paint, metal, chrome,
  glass, glow). A shape function returns `finished('paintr', 'metal')`, or a part is wrapped in `withFinish` /
  `finishBox`; the name is the colour's with `@finish` after it. Without one a material shines as the palette's
  `GLOSS` and `GLOWS` lists say. A material named for fire or light (fire, flame, ember, lava, lamp, light, glow,
  neon, torch in its name) gives light off without being listed, so do not name a dull colour that way. Looks only: the client reads it when it builds the strip (`shineOf`).
- **Tricks are pickups that go off when picked up** (`TRICK_KINDS` in shared/manifests.ts, sim/tricks.ts,
  `Car.tricks`): they come out of one crate, `pickup.bag-of-tricks`, which rolls its `kits` by their own odds, so a
  new trick is a pickup folder and a line in that list, not a line in every venue. The client's side is
  render/tricks-fx.ts (one `trick` SimEvent: on, off, use).
- **Rival drivers are built from the AI kit** (sim/ai-kit.ts): `thingsAhead` gathers what is in the way and what is
  worth having as plain `Thing`s (a place, a size, a weight), `pickPath` / `pickHeading` weigh a fan of ways past
  them, `cornerSpeed` reads the racing line (sim/line.ts, `world.line`), `recover` backs out of trouble, and
  `wantsFire` / `wantsBoost` decide about what a car carries. They read kinds and numbers off manifests and never a
  content id, so a new car, weapon, prop or venue needs nothing there; a new kind of thing left lying on the ground
  is one more loop in `thingsAhead`, and a new kind of weapon says when to fire in its own `...Wants`. What kind of
  driver a rival is (`styles` in the AI manifest: ACE, BULLY, HOARDER, BLOCKER, WILD) goes by its name, and how
  hard the field is (`DIFFICULTY` in shared/constants.ts, the RIVALS button) is a `World` option, normal online.
  Judge a change to the drivers with `pnpm bots` before and after.
- **What is hit is what is drawn.** Every rule that asks whether two things touch asks `sim/shapes.ts` (`carGap`,
  `propGap`, `thingGap`, `propTouch`, `carsGap`), never a distance between middles. A car's hull comes from its own
  body and `size`. A prop's `hit` is a circle, a box, or `parts`: pieces with a foot and a top (`z`), baked from the
  look's slices by `pnpm hitboxes:bake`, a hitbox a slice stacked as the slices are, so run it after a standing
  prop's or a car's look changes (`hitboxes.test.ts` fails when a shape no longer fits). A rule says how high the thing
  it asks about is (a car `c.z` to its roof, a rocket `ROCKET_HIGH`). `radius` stays for layout, blasts and drivers.
  A car bumps with its one hull, and a shot meets its body slice by slice (`carPoint`, the car manifest's `hit`).
  The HITBOXES view (`render/hitbox-view.ts`) draws these same shapes: a new thing that can be hit is drawn there too.
- **Rules never read `world.player`**: in online play it is each screen's own car. Use `world.humans` / `isPlayer`.
- **The sim reports, the client shows.** Anything visual or audible is driven by a `SimEvent` or by reading world
  state; the sim holds no client state.
- **Original content only.** No names, characters, tracks or art from existing games.
- **Custom tracks are data, not content.** A track from the track creator is a `TrackFile` (shared/track-file.ts);
  `installTrack` (sim/custom.ts) turns it into a venue in a copy of the content. It names props by id and must keep
  loading when ids go: unknown ones are left out, never an error. Every prop is placeable; nothing is added per prop.
- **The ground is painted in the shader**, as fine as the screen is (client `render/pixel/ground-paint-glsl.ts`,
  from what `render/ground-paint.ts` gathers: the noise, the road's line, what is nearest). The ground canvas holds
  only marks laid over it (decals in `render/ground.ts`, skids, scorches), clear where there are none. The same
  painter for a map, one texel to the art pixel, is `render/terrain.ts`: the canvas fallback and `?ground=map` use
  it, so a change to how the ground looks is made in both. A venue's `colors.terrain` (grass, dirt, sand, snow,
  gravel, paved) and `colors.road` (tarmac, dirt) pick the look; both are optional and looks only, so the sim never
  reads them. Light is smooth and shadows soft-edged; `?light=bands` is the older dithered look.
- **The look is bright and plain** (`groundMode.bright`, `#define BRIGHT` in the painter): sunny colours, a mown
  lawn, one flat pale tarmac with whole white lines, bold kerbs, no grit or specks, lighter shadows. The worn, gritty
  look it replaced is `?look=classic`; a change to the ground is made for both.
- **The ground has height** where a venue has `relief` (hills under the road, sheer terraces beyond it): `Relief`
  (sim/relief.ts) is the one height map. The sim uses it for slopes, faces a car cannot climb and edges it drives off;
  every other height in the sim stays relative to the ground under it. The client keeps the ground canvas a flat map
  and draws it raised through a picture-to-ground map baked once (`render/relief-map.ts`); stacks, particles and
  shadows lift themselves by the same heights in their shaders. The canvas fallback draws the ground flat.
  A venue's `track.raised` (`from`, `to`, `height`; the track creator's ELEVATE tool writes it as `raised` in the
  `TrackFile`) lifts a stretch of road into a platform in that same height map, with a ramp at each end and steep
  sides, so nothing else needs to know about it. The platform is wider than the road (`SHOULDER`), its edges are
  railed with the venue's `track.rail` (open where an on-ramp joins), and the ways back up are on-ramps beside it
  that climb in the road's own direction and merge (`lanesOf`), never ramps across it.
- **A course is a venue with one big idea**, and its pieces are plain props, so the track creator places them all.
  A shortcut is a run of path pieces (a pad of kind `road`: `prop.dirt-track`, `prop.boardwalk`, `prop.cobbles`,
  `prop.rickety-boards`, its `skin` saying what it is laid in; kept in `w.paths`): the ground under one is road to
  the sim (grip, speed, no off-course countdown) and scenery rules keep off it. A pad's `wobble` makes it loose
  underfoot: as fast as road, but a car on it wags and rocks (`wobbleAt`, `Car.sway`). The client draws a run of
  them as a road, not as pieces (render/ways.ts joins the pieces that follow one another into one smoothed line,
  and the ground's painter lays a road surface along it, `wayOver`, forking out from under the main road); a piece
  is drawn as its own stack only where the ground is not painted in the shader, or it was put down after the
  ground was made. On the big courses it is a secret way. Its jump is two props
  with a `leap` (`prop.jump-takeoff`, `prop.jump-landing`): each is raised ground in the one height map, square and
  sheer-sided, laid before anything else from the venue's `place` rules (sim/leaps.ts); the takeoff throws a car off
  its lip, and a takeoff with a landing ahead is a gap scenery keeps out of (`leapGaps`). A gap of 150 px is cleared
  with boost and not without (`secret-ways.test.ts`). The client draws no stack for them: their tops are part of
  the way the painter lays (a hazard band at the drop, arrows up the takeoff) and their faces are painted by the
  ground's shader, in the look of the way each joins (a path's skin, the road's tarmac or dirt, else rock;
  render/leaps.ts paints the top on the ground canvas only for a piece on no way). A way can be shut by a `gate` (`prop.pop-bollard` keeps a
  beat; `prop.switch-bollard` sinks for a few seconds when a `switch` pad near it, `prop.floor-switch`, is driven
  over; `prop.piston-block` has a `wave`, so a row rises one after another and its gap moves; sim/gates.ts, `down` while sunk) or by `prop.blast-wall` (`material.cracked-rock`: only a blast breaks it).
  `prop.secret-crate` (`gives`) is a yellow crate that hands over all it lists (a boost refill and rockets). A
  secret way is medium hard: its gate stands across the takeoff, up where the ramp's sides are too high to climb,
  so there is no way round it, and a pool is laid under the gap (`pools`, the smallest one the gap's middle lies
  in: `w.pits`). A car that comes down in it has fallen short (`plunge`, sim/rescue.ts) and is put back where it
  left the road: a path is part of the course, but `Car.onIdx` is the last of the road itself. A
  pad of kind `vent` (`prop.geyser`) throws a car up on a beat; a prop with `bounce` (`prop.bumper`) throws a car
  back harder than it came. A venue's own `laps` beats the mode's (the big courses run 2). Relief `outfield: false`
  raises the banks only inside the road's loop (a mountain to drive round), as `infield: false` does outside it.
  Sights stand close beside the road (about 50 px off its edge), since that is all a phone shows. Every built-in
  track opens in the track creator as a copy (`trackFromVenue` in sim/custom.ts, COPY THIS TRACK on the tracks screen).
- **Ground fog is sheets and a small fluid** (client `render/pixel/fog.ts`; `Atmosphere.fog`, the skies `mist`,
  `dawn`, `fog-night`, a modifier's `sky.fog`). `FogPass` draws a few flat sheets a little over the ground after the
  stacks, each tested against their depth, so things stand in it; `FogFluid` is stable fluids on a coarse grid over
  the whole map, stepped to the race's clock, stirred by cars, rockets and blasts. Looks only: the sim never knows,
  and a new thing that should push the fog is one more `put` in `PixelScene.stir`.
- **Rule numbers tuned by hand are in one list** (`TUNABLES` in shared/tuning.ts): the DEV SETTINGS pane (menu and
  pause menu) draws a slider for each, a `World` takes them as `tuning`, and a rule reads `world.tuning`. A new one is
  an entry in that list and a read in its rule. They are saved on the device and never used in an online race, so
  every screen runs the same one. Defaults are the game's own values: tests and golden hashes run on those.
- **Cars lie with the ground.** The sim works out how each car lies (`pitch`, `bank` in sim/mounds.ts) from the
  ground under its nose, tail and sides: the relief, the shapes in the road (props with a `mound`: speed bump, dip,
  pothole, the ramps' wedges) and the climb of a deck. The client tips the whole car as one thing (`lying` in
  render/stacks.ts, `tilt` on the stack sink): whatever is queued for a car between `tilt(lie)` and `tilt(null)` goes
  with it at the car's size, so new gear on a car needs nothing of its own.
- **Tests stand on venues of their own.** `makeWorld`, `bench` and `flatBench` (content/src/testing.ts) default to
  `venue.bench` and `venue.bench-pit` (content/src/fixtures/), which are not in the game and never change, so a
  built-in track can be rebuilt without touching tests. A test about a real venue names it.
- **Nothing is done for the first time in a race.** Shaders start building when the page opens (`prelink` in
  pixel/gl.ts: a new pass adds its sources to its file's `*_PROGRAMS` list; `compile` keeps every program, so never
  delete one). A race's art is built on workers behind the loader (render/art-pool.ts; the same `Art` runs there),
  and `PixelScene.prepare` lays the ground, packs every strip of the world into the atlas and draws one frame with
  every pass in it before the race is shown. A strip is built with its lighting bytes (`Strip.aux`) and the part of
  each slice that has anything in it (`Strip.trim`, all that is drawn); what changes a strip's shape goes through
  `edit` in render/strips.ts, which clears the one and notes what changed (`Strip.touched`) for the atlas.
- **A fight's heavy work is spread over ticks.** What a hit, a wreck or a scar does to a strip (dents, blowing a
  body apart, dropping what hangs loose, charring) is looks only, so effects queue it on `heavy` (a `Spread`,
  render/spread.ts: about 2 ms a tick, more when a crowd waits, never two big jobs in one tick) and `settle` a strip
  before anything reads it whole (a respawn, a weld). Effects throw their dice with `roll` (render/dice.ts), never
  `Math.random`, which makes garbage on every call; a loop that lets go many cells fills `Cells.q` and calls `one`,
  or calls `spray`, and spent particles go back to a pool. Judge a change there with `pnpm perf:fight`.
- **The menus wear one look** (client `theme.css`, loaded after `styles.css`): paper cards and sunny buttons with
  an ink line and a hard shadow, dark words on light. A new screen is built from the pieces it lists (`.panel`,
  `.events button`, `.row button`, `.go`, `.quiet`, `.slide`, `.tog`) and wears it without rules of its own. The HUD
  drawn on the canvas (`render/hud.ts`) uses the same ink, paper and sun. Every setting lives on the one SETTINGS
  sheet (`#settings`, `ui/settings.ts`: RACE, VIEW, SOUND, HUD, DEV), wired by class, and it sits beside a paused race so a
  slider's doing is seen. The race is laid out for a phone on its side and upright (`zoomSides`, the portrait block
  in `theme.css`); nothing forces landscape.
- **The driving lesson is a test range, not a mode.** It runs on a lawn of its own (`withSchool` in content, like
  `withRange`) as a sandbox world; the steps and what each waits for are `game/lesson.ts` (pure, tested), and
  `ui/tutor.ts` shows them and puts the crate and the targets down with the range's own tools. The sim knows nothing
  of it. It is offered once to a device that has never played (`offerLesson`), never to a driven browser, and SKIP
  is always on screen. A new control is taught by adding a step there.
- Golden hashes change only on purpose: say why in the commit when you regenerate them.
