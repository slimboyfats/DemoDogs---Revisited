import type { World } from '@demodogs/sim';
import { fmtTime, placeName } from '../render/hud';

export interface Results {
  title: string;
  sub: string;
  head: string[];
  rows: { me: boolean; cells: string[]; paint: string }[];
}

/** The result screen's text for a finished world (pure, so it can be tested). */
export function results(w: World): Results {
  const st = w.standings();
  const P = w.player;
  const place = st.indexOf(P) + 1;
  const alive = w.cars.filter((c) => !c.wrecked).length;
  let title: string;
  if (w.kind === 'race')
    title = P.finished ? (place === 1 ? 'YOU WIN!' : `${placeName(place)} PLACE`) : 'RACE OVER';
  else
    title =
      !P.wrecked && alive === 1
        ? 'LAST DOG STANDING!'
        : P.wrecked
          ? `SCRAPPED IN ${placeName(place)}`
          : `SURVIVED: ${placeName(place)}`;
  const sub = `${w.venue.meta.name} · ${w.kind === 'race' ? fmtTime(P.finished ? P.finishTime : w.raceTime) : `Score ${P.score}`}`;
  const head = ['#', 'Driver', w.kind === 'race' ? 'Time' : 'Status', 'Wrecks', 'Bots', 'Score'];
  const rows = st.map((c, i) => ({
    me: c === P,
    paint: c.paint,
    cells: [
      String(i + 1),
      `${c.name} · ${c.def.meta.name}`,
      w.kind === 'race'
        ? c.finished
          ? fmtTime(c.finishTime)
          : c.wrecked && w.knockout
            ? 'wrecked'
            : 'racing'
        : c.wrecked
          ? 'wrecked'
          : 'survived',
      String(c.wrecks),
      String(c.smashed),
      String(c.score),
    ],
  }));
  return { title, sub, head, rows };
}
