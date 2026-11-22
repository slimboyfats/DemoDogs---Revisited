# Adding content

Everything in the game is an item in a pack: `packages/content/core/<type>/<name>/`. The item's id is
`<type>.<name>` and must match its folder. Types: `car`, `venue`, `mode`, `weapon`, `pickup`, `prop`,
`bot`, `ai`. The schemas are in `packages/shared/src/manifests.ts`.

Each folder holds:

- `manifest.json`: the item's data, validated by its type's zod schema. `extends: "<id>"` starts from
  another item of the same type (shallow merge), e.g. `prop.pine` extends `prop.tree`.
- `look.ts` for anything drawn (cars, props, weapons, bots): a default-exported `LookModule`. Shapes are
  functions `(x, y, z) => material | null` over a small voxel block; materials come from
  `src/palette.ts` (cars and bots get `paint` and `trim` from their colour).
- `behaviour.ts` for AI: a default-exported `defineAi({ id, drive(world, car) })`.
- `<name>.test.ts`: at least one test that the item does what it says (`src/testing.ts` has helpers:
  `makeWorld`, `flatBench`, `propTest`, `runUntil`).

Then add the id to `core/ids.lock.json` (ids are never reused or renamed) and run `pnpm check`.
`src/validate.test.ts` fails if a folder is missing its test or look, an id does not match its folder,
or a reference points at nothing.

## Examples

- **A new car:** copy `car/pug`, change the stats (multipliers around 1.0), wheel positions and the body
  shape in `look.ts`. It appears in the garage automatically.
- **A new track:** copy `venue/kennel-loop`, give it a new `seed`, a `size` and the road's centre
  points (a closed Catmull-Rom curve), and pick scenery rules. It appears on the menu automatically.
- **A new prop:** set `body` (`static` or `loose`), `radius`, and for loose props `mass`, `breaksAt` or
  `explodesAt`. Use it from a venue's scenery rules.

If a change alters how a race plays out, the golden hashes in `golden.json` will fail: check the change
is intended, then regenerate with `UPDATE_GOLDEN=1`.
