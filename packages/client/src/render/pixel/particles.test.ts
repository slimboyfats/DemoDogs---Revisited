import { describe, expect, it } from 'vitest';
import { Shape } from './batch';
import { FLAME_RAMP, SOOT, drawParticle, shade, stepParticle, type Particle } from './particles';

const DT = 1 / 60;
const make = (kind: Particle['kind'], over: Partial<Particle> = {}): Particle => ({
  kind,
  x: 0,
  y: 0,
  z: 4,
  vx: 0,
  vy: 0,
  vz: 0,
  life: 1,
  max: 1,
  size: 6,
  rgb: SOOT,
  ...over,
});

interface Drawn {
  size: number;
  rgb: number;
  alpha: number;
  shape: number;
}
function draw(p: Particle): { normal: Drawn[]; glow: Drawn[] } {
  const normal: Drawn[] = [];
  const glow: Drawn[] = [];
  drawParticle(
    p,
    (_x, _y, _z, size, rgb, alpha, shape) => normal.push({ size, rgb, alpha, shape }),
    (_x, _y, _z, size, rgb, alpha, shape) => glow.push({ size, rgb, alpha, shape }),
  );
  return { normal, glow };
}

describe('particles', () => {
  it('burn out when their life is up', () => {
    const p = make('flame', { life: 0.1, max: 0.1 });
    let ticks = 0;
    while (stepParticle(p, DT)) ticks++;
    expect(ticks).toBeGreaterThan(3);
    expect(ticks).toBeLessThan(8);
  });

  it('fire and smoke rise, sparks fall and bounce on the ground', () => {
    const flame = make('flame');
    const plume = make('plume', { life: 2, max: 2 });
    const spark = make('spark', { vz: 20 });
    let low = 99;
    for (let i = 0; i < 40; i++) {
      stepParticle(flame, DT);
      stepParticle(plume, DT);
      stepParticle(spark, DT);
      low = Math.min(low, spark.z);
    }
    expect(flame.z).toBeGreaterThan(8);
    expect(plume.z).toBeGreaterThan(5);
    expect(low).toBe(0);
    expect(spark.z).toBeGreaterThanOrEqual(0);
  });

  it('a smoke column leans downwind more the older it gets', () => {
    const p = make('plume', { life: 2, max: 2 });
    for (let i = 0; i < 30; i++) stepParticle(p, DT);
    const early = p.x;
    for (let i = 0; i < 30; i++) stepParticle(p, DT);
    expect(early).toBeGreaterThan(0);
    expect(p.x - early).toBeGreaterThan(early);
  });

  it('a fireball cell brakes hard in the air', () => {
    const p = make('flame', { vx: 120 });
    for (let i = 0; i < 30; i++) stepParticle(p, DT);
    expect(p.vx).toBeLessThan(15);
    expect(p.x).toBeLessThan(30);
  });

  it('flame steps down the fire ramp in hard bands and shrinks', () => {
    const seen: number[] = [];
    const sizes: number[] = [];
    for (const life of [0.95, 0.7, 0.45, 0.1]) {
      const d = draw(make('flame', { life })).normal[0]!;
      seen.push(d.rgb);
      sizes.push(d.size);
      expect(d.shape).toBe(Shape.Pixel);
      expect(Number.isInteger(d.size)).toBe(true);
    }
    expect(seen).toEqual([...FLAME_RAMP]);
    expect(sizes[3]).toBeLessThan(sizes[0]!);
    // only the hot half glows
    expect(draw(make('flame', { life: 0.9 })).glow).toHaveLength(1);
    expect(draw(make('flame', { life: 0.2 })).glow).toHaveLength(0);
  });

  it('smoke is solid when dense, then pales and thins into dither', () => {
    const young = draw(make('plume', { life: 0.8 })).normal[0]!;
    const old = draw(make('plume', { life: 0.1 })).normal[0]!;
    expect(young.shape).toBe(Shape.Solid);
    expect(young.rgb).toBe(SOOT);
    expect(old.shape).toBe(Shape.Pixel);
    expect(old.rgb).toBe(shade(SOOT, 1.55));
    expect(old.size).toBeGreaterThan(young.size);
    expect(old.alpha).toBeLessThan(1);
  });

  it('sparks and embers are single additive cells', () => {
    for (const kind of ['spark', 'ember'] as const) {
      const d = draw(make(kind, { life: 0.95 }));
      expect(d.normal).toHaveLength(0);
      expect(d.glow[0]!.size).toBe(1);
    }
  });
});
