import { describe, expect, it } from 'vitest';
import { padTest } from '../../../src/testing';

describe('prop.ramp', () => {
  it('throws a fast car into the air, and it lands again', () => {
    const r = padTest('prop.ramp', 160);
    expect(r.events).toContain('pad');
    expect(r.maxZ).toBeGreaterThan(12);
    expect(r.car.z).toBe(0);
  });
  it('does nothing to a car that creeps over it or comes up it the wrong way', () => {
    expect(padTest('prop.ramp', 30, 0, 0).maxZ).toBeLessThan(1);
    expect(padTest('prop.ramp', 160, Math.PI).maxZ).toBeLessThan(1);
  });
  it('stops a car that comes at its tall end from behind', () => {
    const r = padTest('prop.ramp', 160, Math.PI);
    expect(r.events).toContain('crash');
    expect(r.car.x).toBeLessThan(r.world.oval!.cx - 80);
  });
});
