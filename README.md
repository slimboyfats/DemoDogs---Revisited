# DemoDogs

A top-down combat racer for phones, drawn entirely with **animated sprite stacks**. Ram rivals until they fall to
bits, flatten wandering scrap bots for boost, grab crates for rockets and mines, and either win the race or be the
last car running in the derby bowl.

```sh
pnpm install
pnpm dev          # http://localhost:5173, also on your LAN for a phone
pnpm verify       # lint, format, typecheck, tests, then a phone-size browser smoke test
```

Needs Node 22 and pnpm. On a phone, play in landscape; "Add to Home Screen" runs it full screen.
`pnpm deploy:pages` builds and publishes to the `gh-pages` branch. There are no GitHub Actions.

## Modes

| Venue         | Mode         | What happens                                                                               |
| ------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Kennel Loop   | Race, 3 laps | Grass verges, tyre walls on the bends, cones and crates by the road                        |
| Scrapyard Run | Race, 3 laps | Tighter, twistier track lined with rusted car husks                                        |
| The Pit       | Derby        | Six cars in a walled bowl. Last car running wins, or highest score when the clock runs out |

Four cars, each with its own handling: **Mutt** (pickup, all-rounder), **Whippet** (muscle car, fastest and
fragile), **Bruiser** (van, heavy and tough) and **Pug** (buggy, quick and nimble).

## Controls

- **Touch:** drag anywhere on the left half. Push the way you want to go: the car turns to face it, and the further
  you push the harder it accelerates. On the right: **BRAKE** (reverse when stopped, handbrake slide at speed),
  **BOOST** (nitro) and **FIRE** (uses your pickup).
- **Keyboard:** arrows or WASD, Space to boost, X to fire, P or Esc to pause.
- **Names:** the other drivers' names float over their cars. Tab, or **NAMES** on the pause menu, turns them off
  and on.
- **Scrapped?** When your car is out for good and the others carry on (any derby, or you are home first in an
  online race), the camera moves on: tap anywhere or press Tab for the next car, **ZOOM** or Z to pull back, as far
  as the whole arena in a derby. Offline, **SKIP** or Enter goes straight to the results.

## How the sprite stacks are animated

Every car, bot, tree and prop is a stack of flat pixel slices drawn bottom to top
(`packages/client/src/render/stack.ts`). They are made to move in several ways:

- **Cars** are several stacks: a body, four wheels, two bumpers and a roof piece. Front wheels turn with the
  steering and the tyre tread cycles as the car rolls. Each body slice is offset a little more than the one below,
  so the car leans into corners, squats under power and dives on the brakes.
- **Damage is real:** every car owns its own copy of its body strip, and hits punch dents into it, crushing the top
  layers where they land. Bumpers and roof parts break off and tumble away as loose stacks. A wrecked car is charred.
- **Scrap bots** walk on the reference kit's gait and two-bone leg IK (`render/rig.ts`), with planted feet.
- **Trees sway** slice by slice; pickups spin and bob; mines blink.
- Static scenery is drawn once per angle into a canvas and reused, so a long tyre wall costs one draw per object.

All art is generated at load time from shape functions in each item's `look.ts`, and all sound is synthesised with
Web Audio, so there are no image or sound files.

## How the code is laid out

A pnpm workspace with four packages, structured like mudders:

| Package            | What                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared`  | Types every package uses: zod manifest schemas, controls, sim events, look types, constants                                               |
| `packages/sim`     | The deterministic simulation: driving, collisions, damage, bots, weapons, race and derby rules. No DOM, no `Math.random`                  |
| `packages/content` | The `core` pack: one folder per car, venue, mode, weapon, pickup, prop, bot and AI, each with a manifest, a look or behaviour, and a test |
| `packages/client`  | Vite app: the sprite-stack renderer, effects, HUD, menus, touch input and synth audio                                                     |

The sim never draws or plays anything; it emits events (`hit`, `wreck`, `explode`, `smash` ...) that the client
turns into dents, debris, sparks and sound. See `docs/ARCHITECTURE.md` and, to add a car, track or prop,
`docs/CONTENT.md`.

Testing hooks: `?start=kennel-loop|scrapyard-run|the-pit&car=mutt|whippet|bruiser|pug&seed=7` skips the menu, and
adding `&autoplay` lets the computer drive your car. `window.__dd` exposes the running session.

## Credits

The sprite-stack technique, the walk rig (`render/rig.ts`) and the basis of `render/stack.ts` come from
[loktar00/sprite-stack-animation](https://github.com/loktar00/sprite-stack-animation) (MIT). See
`THIRD_PARTY_NOTICES.md`.
