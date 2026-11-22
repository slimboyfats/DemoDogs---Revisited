import type { SimEvent } from '@demodogs/shared';
import { cloudReach, type World } from '@demodogs/sim';
import { CKind, type Cells } from './pixel/cells';

/**
 * What the client shows of things dropped behind cars: smoke clouds as banks of single fog cells
 * (read from world.clouds every tick), and the bang and sparks of a tyre going on a tack.
 * Purely visual; uses Math.random.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Smoke-screen greys: from a cool dark grey to a pale one, each cell picks one. */
const FOG = [0x5d6066, 0x777a80, 0x8d9096, 0xa4a6aa, 0xb8babd];

/** Cells a cloud lets go each tick per square art px of its area, and how long each lasts. */
const DENSITY = 0.0075;
const CELL_LIFE: [number, number] = [1.6, 2.6];

export interface DropFxHost {
  readonly cells: Cells;
  quality: number;
  spark(x: number, y: number, z: number, sp?: number): void;
  puff(x: number, y: number, z: number, kind: 'smoke' | 'dust', vx?: number, vy?: number): void;
}

/** Once a tick: keep every smoke cloud fed with fog so that it stays thick until it goes. */
export function feedClouds(fx: DropFxHost, w: World): void {
  for (const c of w.clouds) {
    const r = cloudReach(c);
    if (r < 1) continue;
    // the first moment it billows out of the pot: a burst, thrown outwards
    const fresh = c.t < 0.35;
    const n = Math.round(Math.PI * r * r * DENSITY * fx.quality * (fresh ? 3 : 1));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * r;
      const out = fresh ? rand(20, 50) : rand(0, 6);
      fx.cells.add(
        CKind.Fog,
        c.x + Math.cos(a) * d,
        c.y + Math.sin(a) * d,
        rand(0, 6),
        Math.cos(a) * out,
        Math.sin(a) * out,
        rand(0, 6),
        rand(CELL_LIFE[0], CELL_LIFE[1]),
        FOG[Math.floor(Math.random() * FOG.length)]!,
      );
    }
  }
}

/** A tyre went on a tack: a spray of sparks and a puff of rubber smoke. Returns true if handled. */
export function dropEvent(fx: DropFxHost, w: World, e: SimEvent): boolean {
  if (e.t !== 'puncture') return false;
  const c = w.cars[e.car];
  for (let i = 0; i < 6; i++) fx.spark(e.x, e.y, 1, 30);
  for (let i = 0; i < 3; i++) fx.puff(e.x, e.y, 1, 'smoke', (c?.vx ?? 0) * 0.3, (c?.vy ?? 0) * 0.3);
  return true;
}
