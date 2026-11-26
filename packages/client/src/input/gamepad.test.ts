import { describe, expect, it } from 'vitest';
import { padControls, padWay, Pads, PAD, type PadState } from './gamepad';

function pad(o: { axes?: number[]; down?: number[]; values?: Record<number, number> } = {}) {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const value = o.values?.[i] ?? (o.down?.includes(i) ? 1 : 0);
    return { pressed: value > 0.5, value };
  });
  return { axes: o.axes ?? [0, 0, 0, 0], buttons } satisfies PadState;
}

describe('driving by gamepad', () => {
  it('is nothing while the pad is left alone, even with a stick a little off centre', () => {
    expect(padControls(pad(), 0)).toBeNull();
    expect(padControls(pad({ axes: [0.1, -0.12] }), 0)).toBeNull();
  });

  it('drives where the left stick points, like the touch stick', () => {
    // the car faces right, the stick points down the screen: turn right, full gas
    const c = padControls(pad({ axes: [0, 1] }), 0)!;
    expect(c.steer).toBe(1);
    expect(c.throttle).toBe(1);
    // pointing the way it faces: straight on
    expect(padControls(pad({ axes: [1, 0] }), 0)!.steer).toBeCloseTo(0);
  });

  it('drives by the triggers too: gas and brake as pedals, the stick only steering', () => {
    const c = padControls(pad({ axes: [-0.6, 0.9], values: { [PAD.gasPedal]: 0.5 } }), 1)!;
    expect(c.throttle).toBe(0.5);
    expect(c.steer).toBeLessThan(0);
    expect(c.steer).toBeGreaterThan(-1);
    expect(c.brake).toBe(false);
    const b = padControls(pad({ values: { [PAD.brakePedal]: 1 }, down: [PAD.left] }), 0)!;
    expect(b).toMatchObject({ brake: true, throttle: 0, steer: -1 });
  });

  it('has buttons for boost and brake, and the d-pad as arrow keys', () => {
    expect(padControls(pad({ down: [0] }), 0)).toMatchObject({ boost: true, brake: false });
    expect(padControls(pad({ down: [1] }), 0)).toMatchObject({ brake: true });
    expect(padControls(pad({ down: [PAD.up, PAD.right] }), 2)).toMatchObject({
      throttle: 1,
      steer: 1,
    });
  });
});

describe('the gamepad, frame by frame', () => {
  it('is not there when switched off, or when the thing plugged in is no gamepad', () => {
    let on = false;
    const pads = new Pads(
      () => [null, pad({ down: [0] })],
      () => on,
    );
    pads.poll(0.016);
    expect(pads.state).toBeNull();
    expect(pads.controls(0)).toBeNull();
    on = true;
    expect(pads.poll(0.016).ok).toBe(true);
    expect(pads.controls(0)).toMatchObject({ boost: true });
    const odd = new Pads(
      () => [{ axes: [1, 1], buttons: [{ pressed: true, value: 1 }] }],
      () => true,
    );
    odd.poll(0.016);
    expect(odd.state).toBeNull();
  });

  it('fires once for each press of FIRE, however long it is held', () => {
    let now = pad({ down: [2] });
    const pads = new Pads(
      () => [now],
      () => true,
    );
    pads.poll(0.016);
    pads.poll(0.016);
    expect(pads.takeFire()).toBe(true);
    expect(pads.takeFire()).toBe(false);
    pads.poll(0.016);
    expect(pads.takeFire()).toBe(false);
    now = pad();
    pads.poll(0.016);
    now = pad({ down: [5] });
    pads.poll(0.016);
    expect(pads.takeFire()).toBe(true);
  });

  it('gives START and A as presses, and repeats a held way for the menus', () => {
    let now = pad({ down: [PAD.start, PAD.down] });
    const pads = new Pads(
      () => [now],
      () => true,
    );
    expect(pads.used).toBe(false);
    expect(pads.poll(0.016)).toEqual({ way: 'down', ok: false, back: false, start: true });
    expect(pads.used).toBe(true);
    expect(pads.poll(0.016)).toEqual({ way: null, ok: false, back: false, start: false });
    let steps = 0;
    for (let i = 0; i < 60; i++) if (pads.poll(1 / 60).way) steps++;
    // a second held: one after the wait, then several a second
    expect(steps).toBeGreaterThanOrEqual(4);
    expect(steps).toBeLessThanOrEqual(7);
    now = pad({ axes: [0.9, 0.2] });
    expect(pads.poll(0.016).way).toBe('right');
    expect(padWay(pad({ axes: [0.3, 0.3] }))).toBeNull();
    expect(padWay(pad({ axes: [0, -1] }))).toBe('up');
  });
});
