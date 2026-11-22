import { describe, expect, it } from 'vitest';
import { CarSchema, PropSchema, VenueSchema } from './manifests';

const meta = { name: 'X', description: 'Y', since: 'core@0.1.0' };

describe('manifest schemas', () => {
  it('accepts a car and rejects stats out of range', () => {
    const car = {
      id: 'car.test',
      schemaVersion: 1,
      meta,
      paint: '#ff0000',
      stats: { speed: 1, accel: 1, grip: 1, mass: 1, armor: 1 },
      body: { halfLength: 11, halfWidth: 5.5 },
      wheels: [
        [7, 5],
        [-7, 5],
      ],
      top: { x: 0, z: 7 },
    };
    expect(CarSchema.safeParse(car).success).toBe(true);
    expect(CarSchema.safeParse({ ...car, stats: { ...car.stats, speed: 3 } }).success).toBe(false);
    expect(CarSchema.safeParse({ ...car, id: 'prop.test' }).success).toBe(false);
  });

  it('fills prop defaults', () => {
    const p = PropSchema.parse({ id: 'prop.x', schemaVersion: 1, meta, body: 'static', radius: 4 });
    expect(p.solid).toBe(true);
    expect(p.hardness).toBe(1);
    expect(p.sway).toBe(false);
  });

  it('rejects unknown scenery rules', () => {
    const v = {
      id: 'venue.x',
      schemaVersion: 1,
      meta,
      mode: 'mode.race',
      seed: 1,
      size: { w: 800, h: 600 },
      colors: { ground: '#000000', ground2: '#000000', dirt: '#000000', outside: '#000000' },
      scenery: [{ rule: 'volcano' }],
      bots: { bot: 'bot.x', count: 1 },
      pickups: ['pickup.x'],
    };
    expect(VenueSchema.safeParse(v).success).toBe(false);
    expect(VenueSchema.safeParse({ ...v, scenery: [] }).success).toBe(true);
  });
});
