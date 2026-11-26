import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { describe, expect, it } from 'vitest';
import type { World } from '@demodogs/sim';
import { makeWorld, testContent } from './testing';

/**
 * The simulation's speed and its exact results, venue by venue: `pnpm bench:sim`.
 *
 * Every venue is raced for 40 s with all cars on autopilot. The table says what a tick costs; the
 * fingerprint is every number in the world, so a change that is only meant to make the sim faster
 * can be shown to have changed nothing (`SIM_BENCH_OUT=file.json` writes them, `SIM_BENCH_REF=`
 * compares with a file written before). `SIM_BENCH_PROF=1` prints where the time goes.
 */
const on = !!process.env.SIM_BENCH;
const TICKS = 60 * 40;
/** What the world keeps only to be quick: no part of a race's result. */
const SCRATCH = new Set(['cells', 'cols', 'rows', 'widest', 'freeNear', 'stood', 'drove']);

/** What a world works out once, as it is built: the road's distance grid and the lie of the land. */
function builtHash(w: World): string {
  let h = 0x811c9dc5;
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  const all = (a: ArrayLike<number> | null | undefined) => {
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      f[0] = a[i]!;
      h = Math.imul(h ^ u[0]!, 0x01000193);
    }
  };
  all(w.grid?.dist);
  all(w.grid?.near);
  all(w.relief?.hills);
  all(w.relief?.bank);
  all(w.relief?.plat);
  all(w.relief?.slip);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Every number, flag and string that hangs off the world's lists, as one hash. */
export function fingerprint(w: World): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  const f = new Float64Array(1);
  const u = new Uint32Array(f.buffer);
  const num = (v: number) => {
    f[0] = v;
    h1 = Math.imul(h1 ^ u[0]!, 0x01000193);
    h2 = Math.imul(h2 ^ u[1]!, 0x85ebca6b) ^ (h1 >>> 13);
  };
  const seen = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (typeof v === 'number') num(v);
    else if (typeof v === 'boolean') num(v ? 1 : 2);
    else if (typeof v === 'string') for (let i = 0; i < v.length; i++) num(v.charCodeAt(i));
    else if (v === null || v === undefined) num(-7);
    else if (typeof v === 'object' && depth < 4) {
      if (ArrayBuffer.isView(v)) return;
      if (seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) {
        num(v.length);
        for (const x of v) walk(x, depth + 1);
      } else
        for (const k of Object.keys(v).sort()) {
          // manifests and the content are the same for every run
          if (k === 'def' || k === 'content' || k === 'behaviour' || k === 'weapon') continue;
          if (k === 'restX' || k === 'restY' || k === 'restN') continue;
          walk((v as Record<string, unknown>)[k], depth + 1);
        }
    }
  };
  const W = w as unknown as Record<string, unknown>;
  for (const k of Object.keys(W).sort()) {
    const v = W[k];
    if (k === 'content' || k === 'venue' || k === 'mode' || k === 'rng' || k === 'events') continue;
    if (k === 'track' || k === 'grid' || k === 'relief' || SCRATCH.has(k)) continue;
    walk(v, 0);
  }
  for (const s of w.rng.state()) num(s);
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

describe.skipIf(!on)('sim bench', () => {
  it('races every venue', async () => {
    const venues = [...testContent().venue.keys()].sort();
    const prof = process.env.SIM_BENCH_PROF ? new Session() : null;
    const post = (m: string) =>
      new Promise<unknown>((res, rej) =>
        prof!.post(m as 'Profiler.stop', (e, r) => (e ? rej(e) : res(r))),
      );
    if (prof) {
      prof.connect();
      await post('Profiler.enable');
      await post('Profiler.start');
    }
    const out: Record<string, { ms: number; worst: number; build: number; print: string }> = {};
    let total = 0;
    for (const venue of venues) {
      // (built twice: the first build of a venue also pays for parsing its manifests)
      makeWorld({ venue, seed: 7, autopilot: true });
      const b0 = performance.now();
      const w = makeWorld({ venue, seed: 7, autopilot: true });
      const build = performance.now() - b0;
      let worst = 0;
      const t0 = performance.now();
      for (let i = 0; i < TICKS; i++) {
        const a = performance.now();
        w.step();
        w.takeEvents();
        worst = Math.max(worst, performance.now() - a);
      }
      const ms = (performance.now() - t0) / TICKS;
      total += ms;
      out[venue] = { ms, worst, build, print: fingerprint(w) + w.hash() + builtHash(w) };
    }
    const rows = venues.map(
      (v) =>
        `${v.padEnd(28)} ${(out[v]!.ms * 1000).toFixed(0).padStart(6)} us/tick  worst ${out[v]!.worst.toFixed(2).padStart(6)} ms  build ${out[v]!.build.toFixed(0).padStart(4)} ms  ${out[v]!.print}`,
    );
    const built = venues.reduce((s, v) => s + out[v]!.build, 0) / venues.length;
    rows.push(
      `${'mean'.padEnd(28)} ${((total / venues.length) * 1000).toFixed(0).padStart(6)} us/tick  ${' '.repeat(16)}  build ${built.toFixed(0).padStart(4)} ms`,
    );
    console.log(rows.join('\n'));
    if (prof) {
      const { profile } = (await post('Profiler.stop')) as {
        profile: {
          nodes: {
            id: number;
            callFrame: { functionName: string; url: string; lineNumber: number };
            hitCount?: number;
          }[];
        };
      };
      const self = new Map<string, number>();
      let all = 0;
      for (const n of profile.nodes) {
        const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
        self.set(k, (self.get(k) ?? 0) + (n.hitCount ?? 0));
        all += n.hitCount ?? 0;
      }
      console.log(
        [...self]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 45)
          .map(([k, v]) => `${((v / all) * 100).toFixed(1).padStart(5)}%  ${k}`)
          .join('\n'),
      );
    }
    if (process.env.SIM_BENCH_OUT)
      writeFileSync(process.env.SIM_BENCH_OUT, JSON.stringify(out, null, 2));
    if (process.env.SIM_BENCH_REF) {
      const { readFileSync } = await import('node:fs');
      const ref = JSON.parse(readFileSync(process.env.SIM_BENCH_REF, 'utf8')) as typeof out;
      const off = venues.filter((v) => ref[v] && ref[v].print !== out[v]!.print);
      expect(off, 'venues whose result changed').toEqual([]);
    }
  }, 600_000);
});
