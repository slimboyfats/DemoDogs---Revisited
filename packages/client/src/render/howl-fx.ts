import { DT, type SimEvent } from '@demodogs/shared';
import type { World } from '@demodogs/sim';
import type { Effects } from './effects';
import type { Sound } from '../audio/sound';

/**
 * How a howl's shockwave looks and sounds. The sim reports the wave going out and each thing it
 * throws; the front itself is read from `world.howls` every tick and laid down as a wall of dust
 * with a thin ring of plasma motes over it. The air bending round the front is a screen effect:
 * each wave adds lens rings to `ripples`, which the pixel scene hands to its post pass (see
 * POST_FS in pixel/post.ts).
 *
 * After mudders' effects.ts: `Ripple`, the shockwave's `portal` front and `pressureWave`.
 */

/** A ring of bent air spreading over the ground: a lens band the post pass moves pixels with. */
export interface Ripple {
  x: number;
  y: number;
  z: number;
  /** Seconds since it started (negative: not yet), and how long it runs. */
  t: number;
  dur: number;
  /** Radius it reaches, and the band's width, art px. */
  maxR: number;
  width: number;
  strength: number;
}

type HowlEvent = Extract<SimEvent, { t: 'howl' | 'hurl' }>;

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Mudders' shockwave plasma tones: electric blues and violets. */
const PORTAL = [0x3a5cff, 0x4a8cff, 0x6a4cff, 0x9a5cff, 0x40b8ff] as const;
const pick = () => PORTAL[(Math.random() * PORTAL.length) | 0]!;

export function howlEvent(fx: Effects, w: World, e: HowlEvent, S: Sound): void {
  if (e.t === 'howl') {
    // the approved moving-pixel lens: a wide band racing out past the wave, a tighter one behind
    fx.ripples.push(
      { x: e.x, y: e.y, z: e.z, t: 0, dur: 0.95, maxR: e.r * 1.7, width: 22, strength: 1.4 },
      { x: e.x, y: e.y, z: e.z, t: -0.08, dur: 0.8, maxR: e.r * 1.05, width: 10, strength: 0.8 },
    );
    fx.flashes.push({ x: e.x, y: e.y, r: e.r * 0.9, life: 0.22, max: 0.22, rgb: 0xa8b8ff });
    // the air is punched out of the middle: a low burst of dust and a few hot motes
    for (let i = 0; i < 26 * fx.quality; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 220);
      fx.emit(
        'spark',
        e.x,
        e.y,
        e.z + rand(2, 7),
        Math.cos(a) * v,
        Math.sin(a) * v,
        rand(20, 90),
        rand(0.2, 0.5),
        1,
        pick(),
      );
    }
    const d = Math.hypot(e.x - w.player.x, e.y - w.player.y);
    fx.shake = Math.max(fx.shake, d < e.r * 1.5 ? 9 : 4);
    const v = fx.vol(e.x, e.y);
    if (v > 0) S.howl(v);
    return;
  }
  // something thrown: grit kicked up where it stood, sparks torn off it the way it goes
  const n = e.what === 'car' ? 6 : e.what === 'prop' ? 2 : 1;
  for (let i = 0; i < n * fx.quality; i++)
    fx.puff(e.x, e.y, e.z + 1, 'dust', e.dx * rand(20, 70), e.dy * rand(20, 70));
  if (e.what !== 'bot')
    for (let i = 0; i < n; i++)
      fx.emit(
        'spark',
        e.x,
        e.y,
        e.z + 3,
        e.dx * rand(60, 200) + rand(-30, 30),
        e.dy * rand(60, 200) + rand(-30, 30),
        rand(30, 110),
        rand(0.2, 0.5),
        1,
        e.what === 'shot' ? pick() : 0xffc060,
      );
  if (e.what === 'car') {
    if (e.car === w.player.index) fx.shake = Math.max(fx.shake, 10);
    const v = fx.vol(e.x, e.y);
    if (v > 0) S.whoosh(v);
  }
}

/** Per tick: every front throws up its wall of dust and ring of motes, and the lens rings age. */
export function howlTick(fx: Effects, w: World): void {
  for (const p of w.howls) {
    const k = p.r / p.max;
    // thinner as it spreads: the same dust over a longer front
    const n = Math.ceil((10 + p.r * 0.5) * fx.quality);
    const speed = p.def.speed ?? 420;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const r = p.r - rand(0, 5);
      const x = p.x + cs * r;
      const y = p.y + sn * r;
      if (Math.random() < 0.22)
        fx.puff(x, y, p.z + rand(0, 2), 'dust', cs * speed * 0.12, sn * speed * 0.12);
      if (Math.random() < 0.7 * (1 - k * 0.6))
        fx.emit(
          'spark',
          x,
          y,
          p.z + rand(0.5, 5),
          cs * speed * rand(0.2, 0.5),
          sn * speed * rand(0.2, 0.5),
          rand(-10, 50),
          rand(0.1, 0.3),
          1,
          pick(),
        );
    }
  }
  for (let i = fx.ripples.length - 1; i >= 0; i--) {
    const r = fx.ripples[i]!;
    r.t += DT;
    if (r.t >= r.dur) fx.ripples.splice(i, 1);
  }
}
