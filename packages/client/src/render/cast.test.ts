import { describe, expect, it } from 'vitest';
import type { StaticProp, World } from '@demodogs/sim';
import { ShadowMap, SUN } from './cast';
import type { Strip } from './stack';

/** A solid block strip: w x h art px, `layers` tall, at res 1. */
function block(w: number, h: number, layers: number): { strip: Strip; px: Uint8ClampedArray } {
  const px = new Uint8ClampedArray(w * layers * h * 4).fill(255);
  const strip = {
    img: { width: w * layers, height: h },
    cw: w,
    ch: h,
    n: layers,
    res: 1,
    cols: layers,
  } as unknown as Strip;
  return { strip, px };
}

const prop = (x: number, y: number, lift?: number): StaticProp =>
  ({ x, y, rot: 0, lift, def: { radius: 2 } }) as unknown as StaticProp;

describe('ShadowMap', () => {
  it('throws a tall thing’s shadow away from the sun, as long as it is tall', () => {
    const b = block(2, 2, 20);
    const s = prop(20, 20);
    const m = new ShadowMap(
      64,
      64,
      () => b.strip,
      () => b.px,
    );
    m.build([s]);
    const at = (x: number, y: number) => m.mask[Math.floor(y) * 64 + Math.floor(x)];
    expect(at(20, 20)).toBe(255);
    expect(at(20 + 19 * SUN[0], 20 + 19 * SUN[1])).toBe(255);
    expect(at(20 + 25 * SUN[0] + 3, 20 + 25 * SUN[1] + 3)).toBe(0);
  });

  it('a thing up off the ground throws its shadow off to one side, not at its foot', () => {
    const b = block(2, 2, 4);
    const s = prop(20, 20, 30);
    const m = new ShadowMap(
      64,
      64,
      () => b.strip,
      () => b.px,
    );
    m.build([s]);
    expect(m.mask[20 * 64 + 20]).toBe(0);
    const x = Math.floor(20 + 31 * SUN[0]);
    const y = Math.floor(20 + 31 * SUN[1]);
    expect(m.mask[y * 64 + x]).toBe(255);
  });

  it('takes the shadow away when the thing comes down', () => {
    const b = block(2, 2, 20);
    const s = prop(20, 20);
    const m = new ShadowMap(
      64,
      64,
      () => b.strip,
      () => b.px,
    );
    m.build([s]);
    m.dirty = null;
    s.down = true;
    m.update({ near: () => [s] } as unknown as World);
    expect(m.mask.some((v) => v > 0)).toBe(false);
    expect(m.dirty).not.toBeNull();
  });
});
