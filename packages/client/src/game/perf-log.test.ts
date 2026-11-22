import { describe, expect, it } from 'vitest';
import {
  PerfRecorder,
  SlowWatch,
  perfFileName,
  stallDetail,
  watchGl,
  type PerfContext,
} from './perf-log';

const ctx =
  (over: Partial<PerfContext> = {}): (() => PerfContext) =>
  () => ({
    phase: 'race',
    quality: '1.00',
    cells: 1200,
    particles: 80,
    voxels: 40,
    slices: 900,
    fires: 2,
    pools: 1,
    fallen: 0,
    note: 'venue.kennel-loop car.mutt',
    heap: 0,
    ...over,
  });

/** Feed `seconds` of frames `ms` apart. */
function run(rec: PerfRecorder, from: number, seconds: number, ms: number, c = ctx()): number {
  let now = from;
  const end = from + seconds * 1000;
  while (now < end) {
    now += ms;
    rec.frame(now, ms, 1, 0.5, 0.2, 1.5, 0.3, ms, c);
  }
  return now;
}

describe('PerfRecorder', () => {
  it('writes one row per second with the frame rate of that second', () => {
    const rec = new PerfRecorder({ game: 'demodogs', cores: 8 });
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    const at = run(rec, 0, 3, 20);
    run(rec, at, 2, 50);
    const text = rec.report();
    expect(text.startsWith('# demodogs performance log v1\ngame: demodogs\ncores: 8\n')).toBe(true);
    expect(text).toContain('seconds: 5\n');
    const rows = text.split('## every second\n')[1]!.split('\n\nEND')[0]!.trim().split('\n');
    const head = rows[0]!.split(',');
    expect(rows).toHaveLength(6);
    const col = (row: number, name: string): string =>
      rows[row]!.split(',')[head.indexOf(name)] ?? '';
    expect(col(1, 'fps')).toBe('50');
    expect(col(5, 'fps')).toBe('20');
    expect(col(1, 'cells')).toBe('1200');
    expect(col(1, 'phase')).toBe('race');
    expect(rec.seconds).toBe(5);
    expect(text.endsWith('END\n')).toBe(true);
  });

  it('puts the slowest seconds first, lists long frames and keeps commas out of the columns', () => {
    const rec = new PerfRecorder({});
    rec.frame(0, 0, 0, 0, 0, 0, 0, 0, ctx());
    const at = run(rec, 0, 2, 20);
    run(rec, at, 2, 100, ctx({ note: 'a, b' }));
    const text = rec.report();
    const slowest = text.split('## slowest seconds\n')[1]!.split('\n')[1]!;
    expect(slowest.split(',')[1]).toBe('10');
    expect(slowest.endsWith('a  b')).toBe(true);
    expect(text).toContain('## frames over 50 ms');
    expect(text).toContain('>250: 0%');
  });

  it('shows marks, stalls, events, draw calls and the heap', () => {
    const rec = new PerfRecorder({});
    rec.stall(5, 'longtask', 80, 'early');
    rec.frame(1000, 0, 0, 0, 0, 0, 0, 0, ctx());
    rec.mark(1500);
    rec.stall(1600, 'longtask', 120, 'script 100');
    rec.note(1700, 'quality', 'effects thinned, a bit');
    rec.drew(300);
    const at = run(rec, 1000, 1, 20, ctx({ heap: 40 }));
    run(rec, at, 1, 20, ctx({ heap: 30 }));
    const text = rec.report();
    expect(text).toContain('marked slow by the player at: 0.5');
    expect(text).toContain('SLOW-NOW');
    expect(text).toContain('browser stalls: 1, longest 120 ms');
    expect(text).toContain('0.7,quality,effects thinned  a bit');
    expect(text).toContain('draw calls/frame');
    expect(text).toContain('1 drops (garbage collections seen)');
  });

  it('an empty recording still reports', () => {
    const text = new PerfRecorder({ a: 1 }).report();
    expect(text).toContain('seconds: 0');
    expect(text).toContain('## events (t, kind, detail)\nnone');
  });
});

describe('stallDetail', () => {
  it('reads the cause out of a long animation frame entry', () => {
    expect(stallDetail({ duration: 80, startTime: 0 })).toBe('');
    const d = stallDetail({
      duration: 120,
      startTime: 100,
      blockingDuration: 70,
      styleAndLayoutStart: 200,
      scripts: [
        { duration: 20, invoker: 'a/b.js' },
        {
          duration: 60,
          invoker: 'x/frame',
          sourceFunctionName: 'frame',
          sourceURL: 'https://h/assets/index-1.js?v=2',
          sourceCharPosition: 77,
          forcedStyleAndLayoutDuration: 3,
        },
      ],
    });
    expect(d).toBe(
      'blocking 70 script 80 style+layout 20 longest frame 60 at index-1.js:77 from frame forced layout 3',
    );
  });
});

describe('perfFileName', () => {
  it('is sortable by date', () => {
    expect(perfFileName(new Date(2026, 10, 2, 6, 5))).toBe('demodogs-perf-20261102-0605.txt');
  });
});

describe('SlowWatch', () => {
  it('speaks up when frames turn slow, and not again for a while', () => {
    const w = new SlowWatch();
    let now = 0;
    let fired = 0;
    for (let i = 0; i < 300; i++) if (w.frame((now += 16), 16)) fired++;
    expect(fired).toBe(0);
    for (let i = 0; i < 60; i++) if (w.frame((now += 40), 40)) fired++;
    expect(fired).toBe(1);
    for (let i = 0; i < 400; i++) if (w.frame((now += 40), 40)) fired++;
    expect(fired).toBeGreaterThan(1);
    expect(fired).toBeLessThan(5);
  });
});

describe('watchGl', () => {
  it('counts draw calls and times links, then puts the context back', () => {
    const calls: string[] = [];
    class Gl {
      LINK_STATUS = 1;
      drawArrays(): void {
        calls.push('arrays');
      }
      drawElements(): void {}
      drawArraysInstanced(): void {
        calls.push('instanced');
      }
      drawElementsInstanced(): void {}
      drawRangeElements(): void {}
      linkProgram(): void {
        calls.push('link');
      }
      getProgramParameter(): boolean {
        return true;
      }
    }
    const gl = new Gl();
    const linked: number[] = [];
    let t = 0;
    const w = watchGl(
      gl as unknown as WebGL2RenderingContext,
      (ms) => linked.push(ms),
      () => (t += 5),
    );
    gl.drawArrays();
    gl.drawArraysInstanced();
    gl.linkProgram();
    expect(w.take()).toBe(2);
    expect(w.take()).toBe(0);
    expect(linked).toEqual([5]);
    w.stop();
    expect(Object.keys(gl)).toEqual(['LINK_STATUS']);
    expect(calls).toEqual(['arrays', 'instanced', 'link']);
  });
});
