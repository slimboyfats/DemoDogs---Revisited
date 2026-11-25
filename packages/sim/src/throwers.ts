import { DT, GRAVITY } from '@demodogs/shared';
import type { LooseProp, StaticProp } from './entities';
import type { World } from './world';

/** A standing thing that throws (a prop with `thrower`), and the balls it has out. */
export interface Thrower {
  s: StaticProp;
  /** Seconds until it throws again. */
  t: number;
  /** Its balls (indices into `world.props`), oldest first. */
  balls: number[];
}

/** How fast a loose prop falls (things.ts), as a share of gravity. */
const FALL = 0.95;

/**
 * Throwers: every `every` seconds each one that still stands lobs a `ball` out of its mouth, the
 * way it faces give or take `spread`, to land `reach` art px away. It keeps `pool` balls out at
 * most: after that the oldest one, wherever it has rolled to, is the one it throws next. A ball
 * is an ordinary loose prop from the moment it leaves, so it lands, bounces and is knocked about
 * like any other.
 */
export function updateThrowers(w: World): void {
  // (scenery can be stood after the race is made: the range, the track creator)
  if (w.throwersSeen !== w.statics.length) {
    w.throwersSeen = w.statics.length;
    for (const s of w.statics)
      if (s.def.thrower && !w.throwers.some((t) => t.s === s))
        w.throwers.push({ s, t: s.def.thrower.every * (0.3 + 0.7 * w.rng.next()), balls: [] });
  }
  for (const T of w.throwers) {
    const s = T.s;
    if (s.down) continue;
    T.t -= DT;
    if (T.t > 0) continue;
    const D = s.def.thrower!;
    T.t += D.every;
    const def = w.content.prop.get(D.ball);
    if (!def || def.body !== 'loose') continue;
    const a = s.rot + (w.rng.next() - 0.5) * 2 * D.spread;
    const far = w.rng.range(D.reach[0], D.reach[1]);
    // up to `apex` above the mouth and down to the ground `far` away
    const g = GRAVITY * w.gravity * FALL;
    const vz = Math.sqrt(2 * g * D.apex);
    const time = (vz + Math.sqrt(vz * vz + 2 * g * D.mouth[1])) / g;
    const pace = far / time;
    let p: LooseProp | undefined;
    if (T.balls.length >= D.pool) p = w.props[T.balls.shift()!];
    if (!p || !p.alive) {
      p = {
        index: w.props.length,
        def,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: 0,
        spin: 0,
        alive: true,
        fuse: 0,
        owner: -1,
      };
      w.props.push(p);
    }
    T.balls.push(p.index);
    p.x = s.x + Math.cos(s.rot) * D.mouth[0];
    p.y = s.y + Math.sin(s.rot) * D.mouth[0];
    p.z = D.mouth[1];
    p.vx = Math.cos(a) * pace;
    p.vy = Math.sin(a) * pace;
    p.vz = vz;
    p.rot = a;
    p.spin = 6;
    w.emit({
      t: 'throw',
      prop: p.index,
      x: p.x,
      y: p.y,
      z: p.z,
      tx: p.x + Math.cos(a) * far,
      ty: p.y + Math.sin(a) * far,
      time,
    });
  }
}
