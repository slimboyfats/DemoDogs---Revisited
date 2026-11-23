import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUARD_KINDS } from '@demodogs/shared';
import { describe, expect, it } from 'vitest';
import { loadContent, loadLooks } from './index';
import { itemFolders } from './glob';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('content validate', () => {
  it('resolves: schemas, extends and references all hold', () => {
    expect(() => loadContent()).not.toThrow();
  });

  it('every item folder has a test', () => {
    const missing = itemFolders().filter(
      (f) => !existsSync(join(root, f, `${f.split('/').pop()}.test.ts`)),
    );
    expect(missing).toEqual([]);
  });

  it('ids are permanent: every locked id still exists, and every id is locked', () => {
    const lock: string[] = JSON.parse(readFileSync(join(root, 'core/ids.lock.json'), 'utf8'));
    const ids = itemFolders().map((f) => f.split('/').slice(-2).join('.'));
    expect(lock.filter((id) => !ids.includes(id))).toEqual([]);
    expect(ids.filter((id) => !lock.includes(id))).toEqual([]);
  });

  it('everything drawn has a look', () => {
    const C = loadContent();
    const looks = loadLooks();
    // a gun is part of the car, a slick is paint on the ground, smoke is cells, a pulse is all
    // sparks, a spray is a jet of single cells, a rail is a line of light, an arc is lightning and
    // a vortex is a swirl of cells, and a howl is dust, motes and bent air; the rest are drawn
    const bare = new Set([
      'gun',
      'slick',
      'smoke',
      'pulse',
      'spray',
      'rail',
      'arc',
      'vortex',
      'howl',
      // fleas are single cells, a ray is a line of light, a swap bolt is sparks, a trail is fire
      'swarm',
      'beam',
      'swap',
      'trail',
      // a twister is air and what it carries, a fissure is the ground itself, a frost is cells
      'twister',
      'fissure',
      'frost',
      // a pit is a hole: there is nothing to draw but the ground
      'pit',
    ]);
    const shown = [...C.weapon.values()].filter((w) => !bare.has(w.kind)).map((w) => w.id);
    // pickups that bolt something onto the car draw it
    const fitted = [...C.pickup.values()]
      .filter(
        (p) =>
          p.kind === 'blade' ||
          p.kind === 'springs' ||
          p.kind === 'collar' ||
          (GUARD_KINDS as readonly string[]).includes(p.kind),
      )
      .map((p) => p.id);
    const drawn = [...C.car.keys(), ...C.prop.keys(), ...C.bot.keys(), ...shown, ...fitted];
    expect(drawn.filter((id) => !looks.has(id))).toEqual([]);
    for (const id of looks.keys()) expect(drawn).toContain(id);
  });
});
