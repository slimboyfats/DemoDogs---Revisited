import { describe, expect, it } from 'vitest';
import {
  CHEER,
  CHEERS,
  LESSON_KEY,
  Lesson,
  STEPS,
  layout,
  offerLesson,
  words,
  type Lawn,
  type Seen,
} from './lesson';

const LAWN: Lawn = { cx: 580, cy: 450, rx: 500, ry: 380 };
const inside = (p: { x: number; y: number }) =>
  ((p.x - LAWN.cx) / LAWN.rx) ** 2 + ((p.y - LAWN.cy) / LAWN.ry) ** 2 < 0.9 ** 2;
const car = (o: Partial<Seen> = {}): Seen => ({
  x: 580,
  y: 450,
  h: 0,
  brake: false,
  charge: 0,
  boosting: false,
  armed: false,
  wrecks: 0,
  ...o,
});
/** Run the lesson until something changes (at most `max` seconds). */
function until(L: Lesson, seen: Seen, max = 5): string | null {
  for (let t = 0; t < max; t += 1 / 60) {
    const c = L.update(seen, 1 / 60);
    if (c) return c;
  }
  return null;
}
/** Sit through the cheer to the next step. */
const next = (L: Lesson, seen: Seen) => until(L, seen, CHEER + 0.1);

describe('where a step puts its things', () => {
  it('straight ahead of the car when there is room', () => {
    const [a] = layout(car(), LAWN, [[100, 0]]);
    expect(a!.x).toBeCloseTo(680);
    expect(a!.y).toBeCloseTo(450);
  });

  it('to the right is to the right of the way the car faces', () => {
    const [a] = layout(car({ h: Math.PI / 2 }), LAWN, [[100, 30]]);
    expect(a!.x).toBeCloseTo(550);
    expect(a!.y).toBeCloseTo(550);
  });

  it('never through the fence, wherever the car is and whichever way it faces', () => {
    const places: [number, number][] = [
      [130, 0],
      [260, 64],
      [390, -30],
    ];
    for (let i = 0; i < 16; i++)
      for (let k = 0; k < 16; k++) {
        const t = (i / 16) * Math.PI * 2;
        const from = car({
          x: LAWN.cx + Math.cos(t) * LAWN.rx * 0.93,
          y: LAWN.cy + Math.sin(t) * LAWN.ry * 0.93,
          h: (k / 16) * Math.PI * 2,
        });
        for (const p of layout(from, LAWN, places)) expect(inside(p)).toBe(true);
      }
  });

  it('on a lawn too small for them they are pulled inside it', () => {
    const tiny: Lawn = { cx: 100, cy: 100, rx: 60, ry: 60 };
    for (const p of layout(car({ x: 150, y: 100 }), tiny, [[400, 0]]))
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThanOrEqual(60);
  });
});

describe('the driving lesson', () => {
  it('goes through its six steps, each done by doing it, and then is over', () => {
    const L = new Lesson(LAWN, car());
    expect(L.step).toBe('drive');
    expect(L.spots).toHaveLength(3);

    // the rings, in order: the second one does not count before the first
    expect(L.update(car(L.spots[1]), 0.1)).toBeNull();
    expect(L.update(car(L.spots[0]), 0.1)).toBe('ring');
    expect(L.progress).toBeCloseTo(1 / 3);
    expect(L.update(car(L.spots[1]), 0.1)).toBe('ring');
    expect(L.update(car(L.spots[2]), 0.1)).toBe('cheer');
    expect(L.cheer).toBeGreaterThan(0);
    expect(next(L, car())).toBe('step');

    // brake: held for a while, and letting go does not undo what was held
    expect(L.step).toBe('brake');
    expect(until(L, car(), 2)).toBeNull();
    L.update(car({ brake: true }), 0.4);
    L.update(car(), 1);
    expect(L.progress).toBeGreaterThan(0.5);
    expect(L.update(car({ brake: true }), 0.4)).toBe('cheer');
    expect(next(L, car())).toBe('step');

    expect(L.step).toBe('boost');
    expect(until(L, car({ brake: true }), 2)).toBeNull();
    expect(until(L, car({ boosting: true }), 2)).toBe('cheer');
    expect(next(L, car())).toBe('step');

    // the drift: held until it has earned its burst, done when it is let go
    expect(L.step).toBe('drift');
    expect(until(L, car({ brake: true }), 2)).toBeNull();
    expect(L.update(car({ charge: 0.3 }), 0.1)).toBeNull();
    // (let go too soon: nothing earned)
    expect(L.update(car(), 0.1)).toBeNull();
    expect(L.update(car({ charge: 0.7 }), 0.1)).toBeNull();
    expect(L.progress).toBeGreaterThan(0.8);
    expect(L.update(car(), 0.1)).toBe('cheer');
    expect(next(L, car())).toBe('step');

    // the crate: one thing put down ahead, done when the car is armed
    expect(L.step).toBe('crate');
    expect(L.spots).toHaveLength(1);
    expect(until(L, car(), 2)).toBeNull();
    expect(L.update(car({ armed: true }), 0.1)).toBe('cheer');
    expect(next(L, car({ armed: true }))).toBe('step');

    expect(L.step).toBe('fire');
    expect(L.spots).toHaveLength(2);
    expect(until(L, car({ armed: true }), 3)).toBeNull();
    expect(L.update(car({ wrecks: 1 }), 0.1)).toBe('cheer');
    expect(next(L, car())).toBe('done');
    expect(L.over).toBe(true);
    expect(L.step).toBeNull();
    expect(L.update(car(), 1)).toBeNull();
  });

  it('hands over more rockets when they all went wide, as often as it takes', () => {
    const L = new Lesson(LAWN, car(), STEPS.indexOf('fire'));
    expect(L.step).toBe('fire');
    expect(until(L, car({ armed: true }), 3)).toBeNull();
    expect(until(L, car(), 3)).toBe('rearm');
    expect(L.missed).toBe(true);
    expect(until(L, car({ armed: true }), 3)).toBeNull();
    expect(until(L, car(), 3)).toBe('rearm');
    expect(until(L, car({ wrecks: 1 }), 1)).toBe('cheer');
  });

  it('can begin at any step, and never past the last', () => {
    expect(new Lesson(LAWN, car(), 2).step).toBe('boost');
    expect(new Lesson(LAWN, car(), 99).step).toBe('fire');
    expect(new Lesson(LAWN, car(), -3).step).toBe('drive');
  });
});

describe('what the card says', () => {
  it('has words and a cheer for every step, for thumbs and for keys', () => {
    for (const s of STEPS) {
      for (const keys of [false, true]) {
        const w = words(s, keys);
        expect(w.title.length).toBeGreaterThan(3);
        expect(w.title).toBe(w.title.toUpperCase());
        expect(w.sub.length).toBeGreaterThan(10);
      }
      expect(CHEERS[s]).toMatch(/!$/);
    }
  });

  it('names the button for thumbs and the key for a keyboard', () => {
    expect(words('boost', false).title).toBe('HOLD BOOST');
    expect(words('boost', true).title).toContain('SPACE');
    expect(words('fire', false).title).toContain('FIRE');
    expect(words('fire', true).title).toContain('X');
    expect(words('fire', false, true).sub).not.toBe(words('fire', false).sub);
  });
});

describe('offering the lesson', () => {
  const store = (o: Record<string, string>) => ({
    getItem: (k: string) => o[k] ?? null,
    key: (i: number) => Object.keys(o)[i] ?? null,
    length: Object.keys(o).length,
  });

  it('is for somebody new, once', () => {
    expect(offerLesson(store({}))).toBe(true);
    expect(offerLesson(store({ 'demodogs.keyHints': '1' }))).toBe(true);
    expect(offerLesson(store({ [LESSON_KEY]: '1' }))).toBe(false);
  });

  it('is not for a device that has already played', () => {
    expect(offerLesson(store({ 'dd-career-v1': '{}' }))).toBe(false);
    expect(offerLesson(store({ 'dd-best-venue.the-pit': '120' }))).toBe(false);
  });

  it('is not made where nothing can be kept, or the store will not be read', () => {
    expect(offerLesson(undefined)).toBe(false);
    expect(
      offerLesson({
        getItem: () => {
          throw new Error('locked');
        },
        key: () => null,
        length: 0,
      }),
    ).toBe(false);
  });
});
