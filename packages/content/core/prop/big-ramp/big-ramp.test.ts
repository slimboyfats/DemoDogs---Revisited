import { describe, expect, it } from 'vitest';
import { padTest } from '../../../src/testing';

describe('prop.big-ramp', () => {
  it('throws a fast car into the air, and it lands again', () => {
    const r = padTest('prop.big-ramp', 160);
    expect(r.events).toContain('pad');
    expect(r.maxZ).toBeGreaterThan(22);
    expect(r.car.z).toBe(0);
  });
  it('does nothing to a car that creeps over it or comes up it the wrong way', () => {
    expect(padTest('prop.big-ramp', 30, 0, 0).maxZ).toBeLessThan(1);
    expect(padTest('prop.big-ramp', 160, Math.PI).maxZ).toBeLessThan(1);
  });
});
