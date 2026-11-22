# DemoDogs

A top-down combat racer for phones, drawn entirely with **animated sprite stacks**. Ram rivals until they fall to
bits, flatten wandering scrap bots for boost, grab crates for rockets and mines, and either win the race or be the
last car running in the derby bowl.

Open `index.html` in a browser, or serve the folder with any static server (`python3 -m http.server`). There is no
build step and nothing to install. On a phone, play in landscape; "Add to Home Screen" runs it full screen.

## Modes

| Venue | Mode | What happens |
| --- | --- | --- |
| Kennel Loop | Race, 3 laps | Grass verges, tyre walls on the bends, cones and crates by the road |
| Scrapyard Run | Race, 3 laps | Tighter, twistier track lined with rusted car husks |
| The Pit | Derby | Six cars in a walled bowl. Last car running wins, or highest score when the clock runs out |

Four cars, each with its own handling: **Mutt** (pickup, all-rounder), **Whippet** (muscle car, fastest and
fragile), **Bruiser** (van, heavy and tough) and **Pug** (buggy, quick and nimble).

## Controls

- **Touch:** drag anywhere on the left half. Push the way you want to go: the car turns to face it, and the further
  you push the harder it accelerates. On the right: **BRAKE** (reverse when stopped, handbrake slide at speed),
  **BOOST** (nitro) and **FIRE** (uses your pickup).
- **Keyboard:** arrows or WASD, Space to boost, X to fire, P or Esc to pause.

## How the sprite stacks are animated

Every car, bot, tree and prop is a stack of flat pixel slices drawn bottom to top (`js/stack.js`). They are made to
move in several ways:

- **Cars** are several stacks: a body, four wheels, two bumpers and a roof piece. Front wheels turn with the
  steering and the tyre tread cycles as the car rolls. Each body slice is offset a little more than the one below,
  so the car leans into corners, squats under power and dives on the brakes.
- **Damage is real:** every car owns its own copy of its body strip, and hits punch dents into it, crushing the top
  layers where they land. Bumpers and roof parts break off and tumble away as loose stacks. A wrecked car is charred.
- **Scrap bots** walk on the reference kit's gait and two-bone leg IK (`js/rig.js`), with planted feet.
- **Trees sway** slice by slice; pickups spin and bob; mines blink.
- Static scenery (tyres, rocks, husks, walls) is drawn once per angle into a canvas and reused, so a long tyre wall
  costs one draw per object instead of one per slice.

All art is generated at load time from small shape functions in `js/art.js`, and all sound is synthesised with Web
Audio in `js/audio.js`, so there are no image or sound files.

## Files

| Path | What |
| --- | --- |
| `index.html`, `style.css` | the page, touch controls and menus |
| `js/stack.js` | sprite-stack renderer with a camera and depth groups (adapted from the reference kit) |
| `js/rig.js` | walking gait and two-bone IK, from the reference kit, unchanged |
| `js/art.js` | every stack: cars, props, scenery, bots; dents and charring |
| `js/tracks.js` | the venues; track curves and the road distance grid |
| `js/game.js` | driving, collisions, damage, AI, weapons, race and derby rules, camera, HUD |
| `js/input.js`, `js/audio.js` | touch and keyboard; synthesised sound |

Testing hooks: `index.html?start=kennel|scrapyard|pit&car=mutt|whippet|bruiser|pug` skips the menu, and adding
`&autoplay` lets the computer drive your car.

## Credits

The sprite-stack technique, `js/rig.js` and the basis of `js/stack.js` come from
[loktar00/sprite-stack-animation](https://github.com/loktar00/sprite-stack-animation) (MIT). See
`THIRD_PARTY_NOTICES.md`.
