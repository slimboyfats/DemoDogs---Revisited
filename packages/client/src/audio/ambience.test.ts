import { describe, expect, it } from 'vitest';
import { AMBIENT, STILL, WALTZ, birdCall, heard } from './ambience';

describe('ambience', () => {
  it('a thing is loud beside the car and gone at the edge of its reach', () => {
    expect(heard(0, 200)).toBe(1);
    expect(heard(200, 200)).toBe(0);
    expect(heard(400, 200)).toBe(0);
    expect(heard(50, 200)).toBeGreaterThan(heard(120, 200));
  });

  it('birds have different calls, all high and brief', () => {
    const shapes = new Set<number>();
    for (let k = 0; k < 4; k++) {
      const call = birdCall(k / 4 + 0.01, 0.5);
      shapes.add(call.length);
      for (const [f, at, dur] of call) {
        expect(f).toBeGreaterThan(2000);
        expect(f).toBeLessThan(6000);
        expect(at + dur).toBeLessThan(0.5);
      }
    }
    expect(shapes.size).toBeGreaterThan(2);
  });
});

describe('the place', () => {
  it('every kind of noise a thing can make is heard, and starts silent', () => {
    for (const k of AMBIENT) expect(STILL[k]).toBe(0);
  });

  it("the fairground organ's waltz sits over its bass and goes round to where it began", () => {
    for (const [tune, bass, chord] of WALTZ) {
      expect(tune).toBeGreaterThan(chord);
      expect(chord).toBeGreaterThan(bass);
    }
    expect(WALTZ[0]![1]).toBe(WALTZ[WALTZ.length - 1]![1]);
  });
});
