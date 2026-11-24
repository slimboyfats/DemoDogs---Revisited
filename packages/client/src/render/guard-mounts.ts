import type { Car, World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import type { StackSink } from './stacks';

/**
 * Where each guard is bolted to a car, drawn from its own pickup's look. Every place is read off
 * the car's body: roof gear stands on the highest part of the centre line, the tank on the bonnet
 * and the decoy rack on the boot, at whatever height that car has there.
 */
export function queueGuards(
  R: StackSink,
  art: Art,
  w: World,
  fx: Effects,
  c: Car,
  alpha: number,
  k = c.size,
  up = k,
  base = c.z,
): void {
  const G = c.guards;
  const D = c.def;
  const hl = D.body.halfLength;
  const hw = D.body.halfWidth;
  // a car that has grown or shrunk is laid out `k` times as far from its middle and stands `up`
  // times as tall, and what is bolted to it goes with it
  const cs = Math.cos(c.h) * k;
  const sn = Math.sin(c.h) * k;
  /** `h` art px above the ground under the car, at the car's own size. */
  const high = (h: number): number => base + h * up;
  // leaning with the body: the higher up, the further over
  const put = (id: string, lx: number, ly: number, z: number, rot = c.h, lean = 0): void => {
    const o = c.roll * lean;
    R.stack(
      art.prop(id),
      c.x + cs * lx - sn * (ly + o),
      c.y + sn * lx + cs * (ly + o),
      z,
      rot,
      alpha,
    );
  };
  /** On top of the body at (lx, ly). */
  const onBody = (id: string, lx: number, ly: number, rot = c.h): void =>
    put(id, lx, ly, high(0.6 + c.bounce + art.carHeight(D.id, lx, ly)), rot, 0.8);

  const roof = art.carRoof(D.id);
  if (G.flak) onBody(G.flak.def.id, roof + 0.8, 0, fx.guards.aim(c));
  if (G.bond) onBody(G.bond.def.id, roof - 2.4, 2.1);
  if (G.jam) onBody(G.jam.def.id, roof - 2.4, -2.1);
  if (G.decoy) onBody(G.decoy.def.id, -hl + 2.8, 0);
  if (G.soak) onBody(G.soak.def.id, hl - 4.4, 0);
  if (G.mirror)
    // plates all the way round: both flanks, and across the nose and the tail
    for (const side of [-1, 1]) {
      put(G.mirror.def.id, -0.5, side * (hw + 0.35), high(0.2 + c.bounce));
      put(G.mirror.def.id, side * (hl + 0.4), 0, high(0.2 + c.bounce), c.h + Math.PI / 2);
    }
  if (G.sweep) {
    // the feelers quiver, and whip when they have just touched something
    const q = Math.sin(w.time * 31 + c.index) * (0.03 + fx.guards.twitch(c) * 0.25);
    put(G.sweep.def.id, hl + 4.3, 0, high(0.8 + c.bounce), c.h + q);
  }
  if (G.earth) {
    // the chain drags on the ground behind and snakes with the car's speed
    const v = Math.min(1, Math.hypot(c.vx, c.vy) / 120);
    const q = Math.sin(w.time * 14 + c.index * 2) * 0.16 * v;
    const lx = -hl - 4.2;
    const o = Math.sin(q) * 4.5;
    R.stack(
      art.prop(G.earth.def.id),
      c.x + cs * lx - sn * o,
      c.y + sn * lx + cs * o,
      Math.max(c.deck, base - 1.2 * up),
      c.h - q,
      alpha,
    );
  }
  if (G.anchor) {
    // claws ride clear of the ground until something shoves the car, then slam down
    const lift = 1.8 * (1 - fx.guards.bite(c));
    for (const wh of D.wheels)
      for (const side of [-1, 1])
        put(
          G.anchor.def.id,
          wh[0] * 0.92,
          side * (hw + 0.7),
          high(lift),
          side > 0 ? c.h : c.h + Math.PI,
        );
  }
  if (G.pads)
    for (const end of [-1, 1]) put(G.pads.def.id, end * (hl + 1), 0, high(0.5 + c.bounce));
}

/** Decoys on the ground: a squeaky ball, bouncing and spinning. */
export function queueDecoys(R: StackSink, art: Art, w: World): void {
  for (const d of w.decoys)
    if (R.visible(d.x, d.y, 6, 20)) {
      R.group(d.y);
      R.stack(art.squeaky, d.x, d.y, d.z + d.up, d.t * 9 + d.id);
    }
}
