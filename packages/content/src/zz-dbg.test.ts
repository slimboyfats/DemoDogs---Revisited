import { it } from 'vitest';
import { makeWorld } from './testing';
it('dbg', () => {
  for (const venue of (process.env.V ?? 'venue.scrapyard-run').split(',')) {
    const w = makeWorld({ venue, seed: 2, autopilot: true, laps: 99 });
    const rev = w.cars.map(() => false);
    const where: Record<string, number> = {};
    let cc = 0;
    for (let t = 0; t < 60 * 154; t++) {
      w.step();
      for (const e of w.takeEvents())
        if (e.t === 'crash') {
          const near = w.cars.filter((c) => Math.hypot(c.x - e.x, c.y - e.y) < 22).length;
          if (near >= 2) cc++;
          else {
            const cc = w.cars
              .slice()
              .sort(
                (a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y),
              )[0]!;
            const TT = w.track!;
            const lat =
              -(cc.x - TT.x[cc.idx]!) * Math.sin(TT.a[cc.idx]!) +
              (cc.y - TT.y[cc.idx]!) * Math.cos(TT.a[cc.idx]!);
            const k =
              'plat' +
              Math.round(w.relief?.platAt(cc.x, cc.y) ?? 0) +
              ' lat' +
              Math.round(lat / 10) * 10 +
              ' z' +
              Math.round(cc.z) +
              ' frac' +
              (cc.idx / TT.n).toFixed(2) +
              ' loose:' +
              w.props
                .filter((p) => p.alive && Math.hypot(p.x - e.x, p.y - e.y) < 20)
                .map((p) => p.def.id)
                .join('+');
            where[k] = (where[k] ?? 0) + 1;
          }
        }
      for (const c of w.cars) {
        const b = (c.ai?.revT ?? 0) > 0;
        if (b && !rev[c.index]) {
          const s = w
            .near(c.x, c.y, 30)
            .filter((s) => !s.down && s.def.solid && Math.hypot(s.x - c.x, s.y - c.y) < 30)
            .map((s) => s.def.id);
          console.log(
            venue,
            'REV t',
            w.time.toFixed(1),
            c.name,
            'idx',
            c.idx,
            'pos',
            c.x | 0,
            c.y | 0,
            'z',
            c.z | 0,
            'deck',
            c.deck,
            'off',
            c.offroad,
            'near',
            [...new Set(s)].join(' '),
            'h',
            c.h.toFixed(2),
            'Ta',
            w.track!.a[c.idx]!.toFixed(2),
            'lat',
            (
              -(c.x - w.track!.x[c.idx]!) * Math.sin(w.track!.a[c.idx]!) +
              (c.y - w.track!.y[c.idx]!) * Math.cos(w.track!.a[c.idx]!)
            ).toFixed(0),
            'hole',
            c.hole,
            'pit',
            c.pit,
            'held',
            c.held,
            'pace',
            c.pace,
            'size',
            c.size,
            'sunk',
            (c as any).sunk,
            'wpn',
            w.cars.map((o) => o.weapon?.id).join(),
            'thr',
            c.throttle,
            'vf',
            c.vf | 0,
            'ground',
            w.relief?.at(c.x, c.y),
            'cars',
            w.cars
              .filter((o) => o !== c && Math.hypot(o.x - c.x, o.y - c.y) < 30)
              .map((o) => o.name + (o.wrecked ? '(w)' : ''))
              .join(' '),
          );
        }
        rev[c.index] = b;
      }
    }
    console.log(
      venue,
      'car-car',
      cc,
      'world',
      JSON.stringify(
        Object.entries(where)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12),
      ),
    );
  }
});
