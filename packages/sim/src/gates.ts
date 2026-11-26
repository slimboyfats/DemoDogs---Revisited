import { DT } from '@demodogs/shared';
import type { StaticProp } from './entities';
import type { World } from './world';

/**
 * Gates (props with a `gate`, see shared/pieces.ts): solid things that sink into the ground to let
 * cars by and rise again. One with a `period` keeps a beat; one without stands until a switch
 * plate within reach is pressed (pads.ts), then lies down for its `open` seconds. Down, it is
 * `down` like anything knocked over: out of the way of cars, shots and blasts. It never rises
 * onto a car, but waits until none is over it.
 */

/** Does gate `s` want to be down now? */
export function gateOpen(w: World, s: StaticProp, t = w.time): boolean {
  const G = s.def.gate!;
  if (G.period > 0) {
    const p = (((t / G.period + G.shift) % 1) + 1) % 1;
    return p < G.open / G.period;
  }
  return (s.openT ?? 0) > 0;
}

/** Open every switched gate within `reach` of (x, y) for its own time; how many it opened. */
export function pressSwitch(w: World, x: number, y: number, reach: number): number {
  let n = 0;
  for (const s of w.gates) {
    if (s.def.gate!.period > 0 || Math.hypot(s.x - x, s.y - y) > reach) continue;
    s.openT = s.def.gate!.open;
    n++;
  }
  return n;
}

/** One tick of the gates: down when they want to be, up again once nothing is over them. */
export function updateGates(w: World): void {
  for (const s of w.gates) {
    if (s.openT !== undefined && s.openT > 0) s.openT = Math.max(0, s.openT - DT);
    if (gateOpen(w, s)) {
      s.down = true;
      continue;
    }
    if (!s.down) continue;
    const r = s.def.radius + 12;
    if (w.cars.some((c) => !c.wrecked && Math.abs(c.x - s.x) < r && Math.abs(c.y - s.y) < r))
      continue;
    s.down = false;
  }
}
