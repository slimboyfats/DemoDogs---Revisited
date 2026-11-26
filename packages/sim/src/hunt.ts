import { DT, type PickupManifest } from '@demodogs/shared';
import { explode } from './damage';
import type { Car, Hunter } from './entities';
import { standings } from './race';
import type { World } from './world';

/**
 * The hunting rocket: a catch-up item for the back of the field. It leaves the car that opened
 * the crate, climbs over everything and flies up the road, past the whole pack, to whoever is in
 * front. There it comes down: the car it lands on is thrown by the blast and its engine dies for
 * a moment, and so is anybody driving beside it. Nothing stops it on the way (it flies too high
 * to hit); a shield or a car that cannot be hurt takes the blast and keeps its engine.
 *
 * With no road to follow (a derby, the test range) it flies straight at the nearest rival.
 */

/** How high it cruises, and how fast it climbs there (art px, px/s). */
export const HUNT_HIGH = 30;
const CLIMB = 70;
/** How much road ahead of it it steers at, and how near the car in front it starts to come down. */
const LOOK = 60;
const DIVE_AT = 150;
/** Seconds it flies before it burns out, and how slow it is with no road under it. */
const LIFE = 30;
const LOOSE = 0.55;

/** The car it is after: whoever is in front that is still racing, bar the one that sent it. */
function quarry(w: World, owner: number): Car | null {
  const from = w.cars[owner]!;
  if (w.kind === 'race' && w.track)
    return standings(w).find((o) => o.index !== owner && !o.wrecked && !o.finished) ?? null;
  let best: Car | null = null;
  let bd = Infinity;
  for (const o of w.cars) {
    if (o.index === owner || o.wrecked) continue;
    const d = Math.hypot(o.x - from.x, o.y - from.y);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Car c opened a hunting rocket: off it goes. False if there is nobody to send it after. */
export function launchHunter(w: World, c: Car, def: PickupManifest): Car | null {
  const tg = quarry(w, c.index);
  if (!tg) return null;
  w.hunters.push({
    x: c.x,
    y: c.y,
    z: c.z + 6,
    h: c.h,
    v: Math.max(def.speed ?? 480, Math.hypot(c.vx, c.vy) + 120),
    owner: c.index,
    def,
    idx: c.idx,
    age: 0,
    dive: -1,
  });
  w.emit({ t: 'catchup', what: 'hunt', car: c.index, by: c.index, id: def.id, x: c.x, y: c.y });
  return tg;
}

function over(w: World, H: Hunter, what: 'hunt-hit' | 'hunt-off', car: number): void {
  w.emit({ t: 'catchup', what, car, by: H.owner, id: H.def.id, x: H.x, y: H.y });
}

export function updateHunters(w: World): void {
  const T = w.kind === 'race' ? w.track : null;
  for (let i = w.hunters.length - 1; i >= 0; i--) {
    const H = w.hunters[i]!;
    H.age += DT;
    let tg = H.dive >= 0 ? w.cars[H.dive]! : quarry(w, H.owner);
    if (tg && (tg.wrecked || (tg.finished && H.dive < 0))) tg = null;
    if (!tg || H.age > LIFE) {
      w.hunters.splice(i, 1);
      over(w, H, 'hunt-off', -1);
      continue;
    }
    const d = Math.hypot(tg.x - H.x, tg.y - H.y);
    let ax = tg.x;
    let ay = tg.y;
    let v = H.v;
    if (H.dive < 0) {
      let near = d < DIVE_AT * 0.8;
      if (T) {
        // along the road: on to the next sample while that one is the nearer
        for (let k = 0; k < 12; k++) {
          const j = (H.idx + 1) % T.n;
          if (
            Math.hypot(T.x[j]! - H.x, T.y[j]! - H.y) >
            Math.hypot(T.x[H.idx]! - H.x, T.y[H.idx]! - H.y)
          )
            break;
          H.idx = j;
        }
        const road = (((T.s[tg.idx]! - T.s[H.idx]!) % T.len) + T.len) % T.len;
        if (road < DIVE_AT) near = true;
        const j = (H.idx + Math.ceil(LOOK / T.step)) % T.n;
        ax = T.x[j]!;
        ay = T.y[j]!;
      } else v *= LOOSE;
      if (near) {
        H.dive = tg.index;
        w.emit({
          t: 'catchup',
          what: 'hunt-lock',
          car: tg.index,
          by: H.owner,
          id: H.def.id,
          x: tg.x,
          y: tg.y,
        });
        ax = tg.x;
        ay = tg.y;
      } else H.z = Math.min(HUNT_HIGH + tg.deck, H.z + CLIMB * DT);
    }
    const step = v * DT;
    if (H.dive >= 0) {
      if (d <= step + 4) {
        H.x = tg.x;
        H.y = tg.y;
        w.hunters.splice(i, 1);
        // (a car that cannot be hurt, or one in a bubble, keeps its engine)
        if (tg.invuln <= 0 && tg.shield <= 0) {
          const time = H.def.seconds ?? 1.2;
          tg.stall = Math.max(tg.stall ?? 0, time);
          w.emit({ t: 'stall', car: tg.index, by: H.owner, time });
        }
        over(w, H, 'hunt-hit', tg.index);
        explode(w, tg.x, tg.y, H.def.factor ?? 1, w.cars[H.owner] ?? null, tg.deck);
        continue;
      }
      // down onto its roof by the time it gets there
      H.z += (tg.z + 5 - H.z) * Math.min(1, step / d);
    }
    H.h = Math.atan2(ay - H.y, ax - H.x);
    H.x += Math.cos(H.h) * step;
    H.y += Math.sin(H.h) * step;
  }
}
