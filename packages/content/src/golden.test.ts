import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { makeWorld, runUntil } from './testing';

/**
 * Determinism: each venue, run for 40 s with every car on autopilot, must land on the recorded
 * state hash. If a change is meant to alter results, regenerate with `UPDATE_GOLDEN=1 pnpm test`
 * and say so in the PR.
 */
const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden.json');
const golden: Record<string, string> = JSON.parse(readFileSync(file, 'utf8'));
const runs: [string, string][] = [
  ['venue.kennel-loop', 'car.mutt'],
  ['venue.scrapyard-run', 'car.whippet'],
  ['venue.the-pit', 'car.bruiser'],
];

describe('golden hashes', () => {
  const fresh: Record<string, string> = {};
  for (const [venue, car] of runs) {
    it(`${venue} is deterministic`, () => {
      const hashes = [1, 2].map(() => {
        const w = makeWorld({ venue, car, seed: 7, autopilot: true });
        runUntil(w, () => false, 60 * 40);
        return w.hash();
      });
      expect(hashes[0]).toBe(hashes[1]);
      fresh[venue] = hashes[0]!;
      if (!process.env.UPDATE_GOLDEN) expect(hashes[0]).toBe(golden[venue]);
    });
  }
  it('writes golden.json when asked', () => {
    if (process.env.UPDATE_GOLDEN) writeFileSync(file, `${JSON.stringify(fresh, null, 2)}\n`);
  });
});
