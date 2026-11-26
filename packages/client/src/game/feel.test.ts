import { describe, expect, it } from 'vitest';
import { cuesOf, Feel, FEEL_DEFAULT, fitFeel, hitStop, Shaker, SWING_TOP } from './feel';

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => m.set(k, v),
  };
}

function buzzer() {
  const log: { pattern: number[]; at: number }[] = [];
  const pad: { ms: number; strong: number }[] = [];
  const b = {
    t: 0,
    log,
    pad,
    out: {
      vibrate: (pattern: number[]) => void log.push({ pattern, at: b.t }),
      rumble: (ms: number, strong: number) => void pad.push({ ms, strong }),
      now: () => b.t,
    },
  };
  return b;
}

describe('feel settings', () => {
  it('start as the game is made, and are remembered', () => {
    const store = memory();
    const a = new Feel(store);
    expect(a.setup).toEqual(FEEL_DEFAULT);
    a.set({ shake: 1.5, buzz: 0, pad: false });
    expect(new Feel(store).setup).toEqual({ shake: 1.5, stop: 1, buzz: 0, pad: false });
  });

  it('make sense of nonsense', () => {
    expect(fitFeel({ shake: 99, stop: -3, buzz: 'loud', pad: 1 })).toEqual({
      shake: 2,
      stop: 0,
      buzz: 1,
      pad: true,
    });
    expect(fitFeel(null)).toEqual(FEEL_DEFAULT);
  });
});

describe('the buzz', () => {
  it('is longer for a bigger blow, and never very long', () => {
    const b = buzzer();
    const f = new Feel(memory(), b.out);
    f.thump(3);
    b.t = 1000;
    f.thump(10);
    b.t = 2000;
    f.thump(500);
    const [small, big, huge] = b.log.map((l) => l.pattern[0]!);
    expect(small).toBeLessThan(big!);
    expect(huge).toBeLessThanOrEqual(130);
    expect(b.pad).toHaveLength(3);
    expect(b.pad[1]!.strong).toBeGreaterThan(b.pad[0]!.strong);
  });

  it('is silent when turned off, shorter when turned down', () => {
    const b = buzzer();
    const f = new Feel(memory(), b.out);
    f.set({ buzz: 0 });
    f.thump(10);
    f.cue('wreck');
    expect(b.log).toHaveLength(0);
    expect(b.pad).toHaveLength(0);
    f.set({ buzz: 0.5 });
    f.thump(10);
    expect(b.log[0]!.pattern[0]).toBe(46);
  });

  it('does not drone through a hail of blows, or cut a long buzz short', () => {
    const b = buzzer();
    const f = new Feel(memory(), b.out);
    f.cue('wreck');
    for (b.t = 10; b.t < 200; b.t += 16) f.thump(4);
    expect(b.log).toHaveLength(1);
    b.t = 400;
    f.thump(4);
    expect(b.log).toHaveLength(2);
  });

  it('ticks for this car’s pickups and its wreck, and for GO', () => {
    expect(
      cuesOf(
        [
          { t: 'pickup', car: 2, x: 0, y: 0, label: '', kind: 'nitro' },
          { t: 'pickup', car: 0, x: 0, y: 0, label: '', kind: 'nitro' },
          { t: 'wreck', car: 0, by: 1 },
          { t: 'wreck', car: 3, by: 0 },
          { t: 'go' },
        ],
        0,
      ),
    ).toEqual(['pickup', 'wreck', 'go']);
  });
});

describe('hit-stop', () => {
  it('leaves small knocks alone and holds longer for bigger ones, a blink at most', () => {
    expect(hitStop(3)).toBe(0);
    expect(hitStop(5)).toBeGreaterThan(0.03);
    expect(hitStop(12)).toBeGreaterThan(hitStop(6));
    expect(hitStop(1000)).toBeLessThanOrEqual(0.115 + 1e-9);
  });
});

describe('the shake', () => {
  /** The furthest the picture gets, and where it is at the end. */
  function run(s: Shaker, seconds: number, rumble = 0, level = 1) {
    let far = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      s.step(1 / 60, rumble, level);
      far = Math.max(far, Math.hypot(s.x, s.y));
    }
    return { far, end: Math.hypot(s.x, s.y) };
  }

  it('kicks the way the blow went and comes to rest within half a second', () => {
    const s = new Shaker();
    s.kick(10, 1, 0);
    s.step(1 / 60, 0, 1);
    expect(s.x).toBeGreaterThan(0.5);
    expect(Math.abs(s.y)).toBeLessThan(1e-9);
    const r = run(s, 0.5);
    // ten is a wreck: about three art pixels of swing
    expect(r.far).toBeGreaterThan(2.2);
    expect(r.far).toBeLessThan(3.6);
    expect(r.end).toBeLessThan(0.1);
  });

  it('follows the slider: off is still, double is double', () => {
    const off = new Shaker();
    off.kick(10);
    expect(run(off, 0.3, 8, 0).far).toBe(0);
    const one = new Shaker();
    one.kick(8, 0, 1);
    const two = new Shaker();
    two.kick(8, 0, 1);
    expect(run(two, 0.3, 0, 2).far).toBeCloseTo(run(one, 0.3, 0, 1).far * 2, 5);
  });

  it('rattles while the ground shakes, and never throws the picture far', () => {
    const quake = new Shaker();
    expect(run(quake, 1, 10).far).toBeGreaterThan(0.4);
    const mad = new Shaker();
    for (let i = 0; i < 40; i++) mad.kick(999, 1, 0);
    expect(run(mad, 0.5, 999, 2).far).toBeLessThanOrEqual(SWING_TOP * Math.SQRT2);
  });
});
