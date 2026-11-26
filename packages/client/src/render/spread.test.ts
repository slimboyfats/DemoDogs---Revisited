import { describe, expect, it } from 'vitest';
import { Spread } from './spread';

/** A clock that a job moves on by what it costs. */
const clock = () => {
  let t = 0;
  return { now: () => t, cost: (ms: number) => () => void (t += ms) };
};

describe('Spread', () => {
  it('does work in the order asked, a few milliseconds a tick', () => {
    const S = new Spread<string>();
    const c = clock();
    const done: number[] = [];
    for (let i = 0; i < 6; i++)
      S.later('a', () => {
        done.push(i);
        c.cost(2)();
      });
    expect(S.work(c.now, 3)).toBe(2);
    expect(done).toEqual([0, 1]);
    expect(S.waiting).toBe(4);
    while (S.waiting) S.work(c.now, 3);
    expect(done).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('always does at least one job, however long it takes', () => {
    const S = new Spread<string>();
    const c = clock();
    S.later('a', c.cost(40));
    S.later('a', c.cost(40));
    expect(S.work(c.now, 2)).toBe(1);
    expect(S.work(c.now, 2)).toBe(1);
    expect(S.work(c.now, 2)).toBe(0);
  });

  it('is given more time the more there is waiting', () => {
    const S = new Spread<string>();
    const c = clock();
    for (let i = 0; i < 24; i++) S.later('a', c.cost(1));
    // 24 waiting, 8 to a crowd: four times the tick's share
    expect(S.work(c.now, 2)).toBe(8);
  });

  it('settles what waits for one thing at once, and leaves the rest in order', () => {
    const S = new Spread<string>();
    const c = clock();
    const done: string[] = [];
    for (const k of ['a1', 'b1', 'a2', 'c1', 'b2']) S.later(k[0]!, () => done.push(k));
    S.settle('b');
    expect(done).toEqual(['b1', 'b2']);
    S.settle('b');
    expect(S.waiting).toBe(3);
    S.work(c.now, 1);
    expect(done).toEqual(['b1', 'b2', 'a1', 'a2', 'c1']);
  });

  it('gives a big job a tick of its own', () => {
    const S = new Spread<string>();
    const c = clock();
    const done: string[] = [];
    S.later('a', () => done.push('small 1'));
    S.later('a', () => done.push('big 1'), true);
    S.later('a', () => done.push('big 2'), true);
    S.later('a', () => done.push('small 2'));
    S.later('a', () => done.push('small 3'));
    const ticks: number[] = [];
    while (S.waiting) ticks.push(S.work(c.now, 5));
    expect(ticks).toEqual([1, 1, 1, 2]);
    expect(done).toEqual(['small 1', 'big 1', 'big 2', 'small 2', 'small 3']);
  });

  it('takes jobs asked for by a job', () => {
    const S = new Spread<string>();
    const c = clock();
    const done: string[] = [];
    S.later('a', () => {
      done.push('first');
      S.later('a', () => done.push('second'));
    });
    S.work(c.now, 1);
    S.work(c.now, 1);
    expect(done).toEqual(['first', 'second']);
    expect(S.waiting).toBe(0);
  });
});
