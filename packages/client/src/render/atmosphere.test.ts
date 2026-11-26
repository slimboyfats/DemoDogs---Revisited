import { describe, expect, it } from 'vitest';
import { Atmosphere, LAMPS_AT, SKIES, skyOver } from './atmosphere';
import { SUN } from './cast';

const sky = (name: string): Atmosphere => {
  const a = new Atmosphere();
  Object.assign(a, SKIES[name]);
  a.snap();
  return a;
};

describe('Atmosphere', () => {
  it('leaves flat open ground its painted colour by day', () => {
    const a = sky('day');
    for (const v of a.ground) expect(v).toBeGreaterThan(0.97);
    for (const v of a.ground) expect(v).toBeLessThan(1.06);
    expect(a.plain).toBe(true);
    expect(a.lamps).toBe(false);
  });

  it('puts the sun where the cast shadows say it is', () => {
    const a = sky('day');
    expect(Math.hypot(a.dir[0]!, a.dir[1]!, a.dir[2]!)).toBeCloseTo(1, 5);
    // shadows are thrown along SUN, so the sun is the other way
    expect(a.dir[0]! * SUN[0] + a.dir[1]! * SUN[1]).toBeLessThan(0);
    expect(a.dir[2]).toBeGreaterThan(0);
  });

  it('darkens to night, brings the lamps on and fades the sun shadows', () => {
    const d = sky('day');
    const n = sky('night');
    expect(n.ground[0]).toBeLessThan(d.ground[0]! * 0.5);
    // night is blue
    expect(n.amb[2]).toBeGreaterThan(n.amb[0]! * 1.5);
    expect(n.lamps).toBe(true);
    expect(n.glow).toBe(1);
    expect(n.shade).toBeLessThan(d.shade);
    expect(SKIES.dusk!.dark).toBeGreaterThanOrEqual(LAMPS_AT);
  });

  it('follows its targets over time rather than jumping', () => {
    const a = sky('day');
    a.dark = 1;
    a.snow = 1;
    a.update(0.1);
    expect(a.now.dark).toBeGreaterThan(0);
    expect(a.now.dark).toBeLessThan(0.5);
    // snow settles more slowly than the light changes
    expect(a.now.snow).toBeLessThan(a.now.dark);
    for (let i = 0; i < 400; i++) a.update(0.1);
    expect(a.now.dark).toBe(1);
    expect(a.now.snow).toBe(1);
  });

  it('lets fog in and lifts it slowly, for a sky or for a modifier that asks', () => {
    const a = sky('day');
    expect(a.now.fog).toBe(0);
    a.fog = SKIES.dawn!.fog;
    a.update(0.1);
    expect(a.now.fog).toBeGreaterThan(0);
    expect(a.now.fog).toBeLessThan(0.2);
    for (let i = 0; i < 400; i++) a.update(0.1);
    expect(a.now.fog).toBe(1);
    // a sky without fog clears it; a modifier's ask holds it there
    Object.assign(a, SKIES.day);
    a.ask.fog = 0.6;
    for (let i = 0; i < 400; i++) a.update(0.1);
    expect(a.now.fog).toBeCloseTo(0.6, 5);
    // every sky says how much fog, so changing sky always sets it
    for (const k of Object.values(SKIES)) expect(k.fog).toBeGreaterThanOrEqual(0);
  });

  it('is flat on request: every texel its painted colour, no lamps', () => {
    const a = sky('night');
    a.flat = true;
    a.update(0);
    expect([...a.amb]).toEqual([1, 1, 1]);
    expect([...a.sun]).toEqual([0, 0, 0]);
    expect(a.lamps).toBe(false);
    expect(a.plain).toBe(true);
  });
  it('moves every shadow and the lit side with a sun moved by hand', () => {
    const a = sky('day');
    const len = Math.hypot(a.reach[0]!, a.reach[1]!);
    a.sunTurn = Math.PI;
    a.sunLong = 3;
    a.update(0);
    // turned half way round: shadows fall the other way, three times as long as things are tall
    expect(a.reach[0]! * SUN[0] + a.reach[1]! * SUN[1]).toBeLessThan(0);
    expect(Math.hypot(a.reach[0]!, a.reach[1]!)).toBeCloseTo(3, 5);
    expect(a.dir[0]! * a.reach[0]! + a.dir[1]! * a.reach[1]!).toBeLessThan(0);
    a.sunLong = null;
    a.update(0);
    expect(Math.hypot(a.reach[0]!, a.reach[1]!)).toBeCloseTo(len, 5);
  });
});

describe('a weather area', () => {
  it('lays its weather over the sky the race has and never takes the dark away', () => {
    expect(skyOver(SKIES.night!, SKIES.snow!)).toEqual(SKIES['snow-night']);
    expect(skyOver(SKIES['snow-night']!, SKIES.snow!)).toEqual(SKIES['snow-night']);
    expect(skyOver(SKIES.day!, SKIES.snow!)).toEqual(SKIES.snow);
    expect(skyOver(SKIES.day!, SKIES.storm!)).toEqual(SKIES.storm);
    expect(skyOver(SKIES.night!, SKIES.rain!)).toEqual({ dark: 1, wet: 1, snow: 0 });
  });
});
