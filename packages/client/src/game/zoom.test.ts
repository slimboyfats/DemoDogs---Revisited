import { describe, expect, it } from 'vitest';
import { CameraZoom, UPRIGHT, VIEWS, ZOOM_MODES, driveScale, zoomSides, zoomStops } from './zoom';

const store = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

const SCREENS = [
  [780, 1688],
  [390, 844],
  [1080, 1920],
  [1440, 2560],
  [660, 1400],
  [1170, 1300],
] as const;

describe('camera zoom', () => {
  it('normal is the race camera as it was', () => {
    // a phone on its side at two canvas pixels per CSS pixel, and a desktop window
    expect(driveScale(VIEWS.normal, 780, 1688)).toBe(4.5);
    expect(driveScale(VIEWS.normal, 1080, 1920)).toBe(6);
    // every screen: the rule it replaced
    for (let short = 300; short < 2200; short += 31)
      for (const ratio of [1, 1.4, 1.78, 2.16])
        expect(driveScale(VIEWS.normal, short, short * ratio)).toBe(
          Math.max(2, Math.round(Math.min(short / 175, (short * ratio) / 310) * 2) / 2),
        );
  });

  it('close shows less and wide shows more, on every screen', () => {
    for (const [short, long] of SCREENS) {
      const [c, n, w] = ZOOM_MODES.map((m) => driveScale(VIEWS[m], short, long));
      expect(c).toBeGreaterThan(n!);
      expect(n).toBeGreaterThan(w!);
    }
  });

  it('keeps art pixels on whole or half canvas pixels', () => {
    for (const m of ZOOM_MODES)
      for (let short = 330; short < 2200; short += 37) {
        const k = driveScale(VIEWS[m], short, short * 2.1);
        expect(k * 2).toBe(Math.round(k * 2));
        expect(k).toBeGreaterThanOrEqual(1.5);
      }
  });

  it('the slider has a stop for every sharp scale from close to wide', () => {
    expect(zoomStops(780, 1688)).toEqual([6, 5.5, 5, 4.5, 4, 3.5, 3]);
    expect(zoomStops(390, 844)).toEqual([3, 2.5, 2, 1.5]);
  });

  it('every stop of the slider can be picked, and comes back as picked', () => {
    for (const [short, long] of SCREENS) {
      const stops = zoomStops(short, long);
      const s = store();
      const z = new CameraZoom(s);
      for (let i = 0; i < stops.length; i++) {
        z.setStop(i, short, long);
        expect(z.scale(short, long)).toBe(stops[i]);
        expect(z.stop(short, long)).toBe(i);
        const again = new CameraZoom(s);
        expect(again.scale(short, long)).toBe(stops[i]);
      }
      z.setStop(99, short, long);
      expect(z.stop(short, long)).toBe(stops.length - 1);
      z.setStop(-4, short, long);
      expect(z.stop(short, long)).toBe(0);
    }
  });

  it('starts at normal; the button steps round the names and saves', () => {
    const s = store();
    const z = new CameraZoom(s);
    expect(z.name(780, 1688)).toBe('normal');
    z.next();
    expect(z.name(780, 1688)).toBe('wide');
    expect(new CameraZoom(s).name(780, 1688)).toBe('wide');
    z.next();
    expect(z.name(780, 1688)).toBe('close');
    z.next();
    expect(z.view).toBe(VIEWS.normal);
    // from between two names, the button goes to the next one out
    z.setStop(2, 780, 1688);
    expect(z.name(780, 1688)).toBeNull();
    z.next();
    expect(z.name(780, 1688)).toBe('normal');
  });

  it('a stop that a name gives is kept as that name on any screen', () => {
    const s = store();
    const z = new CameraZoom(s);
    z.setStop(0, 780, 1688);
    z.setStop(3, 780, 1688);
    expect(z.view).toBe(VIEWS.normal);
    expect(new CameraZoom(s).name(1080, 1920)).toBe('normal');
  });

  it('the address picks one for a visit; nonsense is ignored', () => {
    const s = store({ 'demodogs.zoom': 'close' });
    expect(new CameraZoom(s, 'wide').view).toBe(VIEWS.wide);
    expect(new CameraZoom(s, 'huge').view).toBe(VIEWS.close);
    expect(new CameraZoom(s, '200').view).toBe(200);
    expect(new CameraZoom(store({ 'demodogs.zoom': 'huge' })).view).toBe(VIEWS.normal);
    expect(new CameraZoom(store({ 'demodogs.zoom': '9000' })).view).toBe(VIEWS.normal);
    expect(new CameraZoom().view).toBe(VIEWS.normal);
  });

  it('works where nothing can be saved', () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error('no');
      },
      setItem: (): void => {
        throw new Error('no');
      },
    };
    const z = new CameraZoom(broken);
    expect(z.view).toBe(VIEWS.normal);
    z.next();
    expect(z.view).toBe(VIEWS.wide);
  });

  it('an upright phone sees more across than one on its side sees up', () => {
    expect(zoomSides(1688, 780)).toEqual([780, 1688]);
    const [short, long] = zoomSides(780, 1688);
    expect(short).toBeCloseTo(780 / UPRIGHT);
    expect(long).toBe(1688);
    const side = driveScale(VIEWS.normal, 780, 1688);
    const up = driveScale(VIEWS.normal, short, long);
    expect(up).toBeLessThan(side);
    // art pixels across the upright screen: well over the road's width and its verges
    expect(780 / up).toBeGreaterThan(210);
    // and the slider still has stops to pick from
    expect(zoomStops(short, long).length).toBeGreaterThan(2);
  });
});
