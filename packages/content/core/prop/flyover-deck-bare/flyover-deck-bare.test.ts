import { describe, expect, it } from 'vitest';
import { NO_CONTROLS } from '@demodogs/shared';
import { World, installTrack, newTrack, type Content } from '@demodogs/sim';
import { loadContent } from '../../../src/index';
import { put, startRace } from '../../../src/testing';

const C: Content = loadContent();

/** A track with one bridge on it, with rails or without, and the player parked up on its middle. */
function bridged(rails: boolean) {
  const t = newTrack(C.venue.get('venue.kennel-loop')!, 'bare', 'Bare');
  const flat = installTrack(C, t);
  const T0 = new World({ content: flat.content, venue: flat.venue, car: 'car.mutt', seed: 1 })
    .track!;
  const m = Math.floor(T0.n * 0.4);
  t.bridges.push({ x: Math.round(T0.x[m]!), y: Math.round(T0.y[m]!), length: 200, rails });
  const made = installTrack(C, t);
  const w = startRace(
    new World({ content: made.content, venue: made.venue, car: 'car.mutt', seed: 1, rivals: 0 }),
  );
  const T = w.track!;
  let top = 0;
  for (let i = 0; i < T.n; i++) if (w.deckAt(i) > w.deckAt(top)) top = i;
  const c = w.player;
  // across the road, to drive at its edge
  put(c, T.x[top]!, T.y[top]!, T.a[top]! + Math.PI / 2, 120);
  c.z = w.deckAt(top);
  return { w, c, top, high: w.deckAt(top) };
}

describe('prop.flyover-deck-bare', () => {
  it('a bridge with no rails is laid in it, and one with rails in the railed deck', () => {
    const bare = bridged(false).w;
    expect(bare.statics.some((s) => s.def.id === 'prop.flyover-deck-bare')).toBe(true);
    expect(bare.statics.some((s) => s.def.id === 'prop.flyover-deck')).toBe(false);
    expect(bridged(true).w.statics.some((s) => s.def.id === 'prop.flyover-deck')).toBe(true);
  });

  it('rails keep a car on the deck; with none it drives off the edge and falls to the ground', () => {
    const kept = bridged(true);
    for (let n = 0; n < 90; n++) kept.w.step({ ...NO_CONTROLS, throttle: 1 });
    expect(kept.c.deck).toBeGreaterThan(4);
    expect(kept.c.z).toBeCloseTo(kept.high, 0);

    const { w, c, high } = bridged(false);
    let fell = false;
    let nose = 0;
    for (let n = 0; n < 90; n++) {
      w.step({ ...NO_CONTROLS, throttle: 1 });
      if (c.deck === 0 && c.z > 2) {
        fell = true;
        nose = Math.min(nose, c.pitch);
      }
    }
    expect(high).toBeGreaterThan(10);
    expect(fell).toBe(true);
    // the nose goes down as it falls, and it ends on the ground
    expect(nose).toBeLessThan(-0.1);
    expect(c.z).toBe(0);
    expect(c.deck).toBe(0);
  });
});
