import { describe, expect, it } from 'vitest';
import { toControls, type RawInput } from './controls';

const idle = (): RawInput => ({
  up: false,
  down: false,
  left: false,
  right: false,
  stick: { active: false, mag: 0, angle: 0 },
  brake: false,
  boost: false,
  fire: false,
});

describe('toControls', () => {
  it('does nothing with nothing pressed', () => {
    expect(toControls(idle(), 0)).toEqual({
      steer: 0,
      throttle: 0,
      brake: false,
      boost: false,
      fire: false,
    });
  });

  it('keys drive and steer directly', () => {
    const c = toControls({ ...idle(), up: true, left: true }, 1.2);
    expect(c.throttle).toBe(1);
    expect(c.steer).toBe(-1);
    expect(toControls({ ...idle(), down: true }, 0).brake).toBe(true);
  });

  it('the stick turns the car towards where it points', () => {
    const right = toControls({ ...idle(), stick: { active: true, mag: 1, angle: 0.3 } }, 0);
    expect(right.steer).toBeGreaterThan(0);
    expect(right.throttle).toBe(1);
    const left = toControls({ ...idle(), stick: { active: true, mag: 1, angle: -0.3 } }, 0);
    expect(left.steer).toBeLessThan(0);
  });

  it('wraps the angle the short way round', () => {
    const c = toControls({ ...idle(), stick: { active: true, mag: 1, angle: -3 } }, 3);
    expect(c.steer).toBeGreaterThan(0);
  });

  it('ignores a stick inside the dead zone', () => {
    expect(toControls({ ...idle(), stick: { active: true, mag: 0.1, angle: 1 } }, 0).throttle).toBe(
      0,
    );
  });

  it('reverses straight when pointing back with the brake held', () => {
    expect(
      toControls({ ...idle(), brake: true, stick: { active: true, mag: 1, angle: Math.PI } }, 0)
        .steer,
    ).toBe(0);
  });
});
