import { canHaunt, type Car, type World } from '@demodogs/sim';

/** Seconds the camera stays on a car that has just been scrapped (yours, or the one watched). */
export const LINGER = 1.4;

/** Is `c` out for good: scrapped where no tow truck brings it back? */
export function scrapped(w: World, c: Car): boolean {
  return c.wrecked && (w.knockout || w.mode.respawnSeconds === undefined);
}

/** This screen's own car has nothing left to do while the others carry on: scrapped, or home. */
export function sidelined(w: World): boolean {
  if (w.sandbox || w.phase !== 'race') return false;
  return w.player.finished || scrapped(w, w.player);
}

/** This screen's driver can drive the ghost of their car: it is scrapped for good and the race goes on. */
export function canGhost(w: World): boolean {
  return w.phase === 'race' && w.endT < 0 && canHaunt(w, w.player);
}

/** The cars worth watching: every other car still in it, the human drivers first. */
export function watchable(w: World): Car[] {
  return w.cars
    .filter((c) => c !== w.player && !scrapped(w, c))
    .sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || a.index - b.index);
}

/** One way of looking on: `k` times the driving zoom; `whole` fits the arena and holds still. */
export interface Zoom {
  label: string;
  k: number;
  whole: boolean;
}

/**
 * The zooms a spectator steps through. `viewW` by `viewH` is the ground the screen shows when
 * driving. A world small enough to fit on screen and still be read (a derby arena) gets a third
 * step that shows all of it.
 */
export function zooms(worldW: number, worldH: number, viewW: number, viewH: number): Zoom[] {
  const out: Zoom[] = [
    { label: 'CLOSE', k: 1, whole: false },
    { label: 'WIDE', k: 0.5, whole: false },
  ];
  const fit = Math.min(viewW / worldW, viewH / worldH);
  if (fit < 0.45 && fit >= 0.2) out.push({ label: 'WHOLE ARENA', k: fit, whole: true });
  return out;
}

/**
 * Who a sidelined player is watching. It only ever reads the world: which car the camera follows
 * is this screen's business, so an online race is the same race whoever is looking at what.
 */
export class Spectator {
  /** The camera has left this screen's own car. */
  active = false;
  /** The car being followed. */
  target: Car | null = null;
  /** Which of `zooms()` is on. */
  zoom = 0;
  private waited = 0;
  private gone = 0;

  reset(): void {
    this.active = false;
    this.target = null;
    this.zoom = 0;
    this.waited = this.gone = 0;
  }

  /** Once a frame, with the real seconds since the last one. */
  update(w: World, dt: number): void {
    if (!sidelined(w)) {
      if (this.active || this.waited > 0) this.reset();
      return;
    }
    if (!this.active) {
      // a race that is already ending goes straight to the results
      if (w.endT >= 0) return;
      this.waited += dt;
      if (this.waited < LINGER) return;
      const list = watchable(w);
      const first = list.find((c) => !c.finished) ?? list[0];
      if (!first) return;
      this.active = true;
      this.target = first;
      this.gone = 0;
    }
    const t = this.target;
    if (t && scrapped(w, t)) {
      // see it go up, then move on
      this.gone += dt;
      if (this.gone >= LINGER) this.next(w, 1);
    } else if (!t) this.next(w, 1);
  }

  /** Step to the next car (or the one before). With nobody left the camera goes back home. */
  next(w: World, dir: 1 | -1): void {
    if (!this.active) return;
    const list = watchable(w);
    this.gone = 0;
    if (list.length === 0) {
      this.target = null;
      return;
    }
    const i = this.target ? list.indexOf(this.target) : -1;
    const n = list.length;
    this.target = list[i < 0 ? (dir > 0 ? 0 : n - 1) : (i + dir + n) % n]!;
  }

  /** Step to the next zoom of `count`. */
  nextZoom(count: number): void {
    if (this.active) this.zoom = (this.zoom + 1) % Math.max(1, count);
  }
}
