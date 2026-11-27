import { sizedId, type TrackFile } from '@demodogs/shared';
import { levelsIn, nearestSample, raisedBetween, surfaceBetween } from '../../game/track-edit';
import { PITCH } from '../../render/scene';
import { StackRenderer } from '../../render/stack';
import { DISPLAY } from '../../render/type';
import type { LevelBuilder, Pick } from './builder';
import { skyLabel } from './chrome';

/** The menus' own colours: navy ink, white, the one yellow, and red for what is taken away. */
const INK = '#0a1440';
const WHITE = '#fff';
const YEL = '#ffd60a';
const CYAN = '#22c3ff';
const RED = '#ff3d57';

let stacks: StackRenderer | null = null;

/**
 * The level builder's marks over the map, once a frame: the edge of the map, the road's line and
 * its points, what was put down by hand, what is picked and the handles it is shaped by, and
 * what is about to be put down. Everything is white with a navy line round it until it is picked
 * (yellow) or about to be taken away (red), so it reads on grass, snow and tarmac alike.
 */
export function paint(g: CanvasRenderingContext2D, b: LevelBuilder): void {
  const t = b.track!;
  const v = b.hooks.view();
  const k = v.dpr;
  const sq = Math.sin(PITCH);
  const sel = b.sel;
  const erasing = b.tool === 'erase';
  const all = erasing || b.tool === 'hand';
  const is = (p: Pick | null, kind: Pick['kind'], i: number): boolean =>
    p?.kind === kind && p.index === i;
  /** The colour of a thing's mark: picked, under an eraser, or neither. */
  const tone = (kind: Pick['kind'], i: number, plain = WHITE): string =>
    erasing && is(b.over, kind, i) ? RED : is(sel, kind, i) ? YEL : plain;
  const at = (x: number, y: number): [number, number] => b.toScreen(x, y);

  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';

  const disc = (x: number, y: number, r: number, fill: string, line = 3): void => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = line * k;
    g.stroke();
  };
  /** A line drawn twice: navy under, a colour over, so it shows on any ground. */
  const inked = (color: string, width: number, dash?: number[]): void => {
    g.setLineDash([]);
    g.strokeStyle = INK;
    g.lineWidth = (width + 3) * k;
    g.stroke();
    if (dash) g.setLineDash(dash.map((d) => d * k));
    g.strokeStyle = color;
    g.lineWidth = width * k;
    g.stroke();
    g.setLineDash([]);
  };
  /** A few words on a navy pill. */
  const tag = (text: string, x: number, y: number, fill = INK, ink = WHITE, px = 11): void => {
    if (!text) return;
    g.font = `italic 900 ${px * k}px ${DISPLAY}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = g.measureText(text).width + 12 * k;
    const hh = (px + 8) * k;
    g.beginPath();
    g.roundRect(x - w / 2, y - hh / 2, w, hh, hh / 2);
    g.fillStyle = fill;
    g.fill();
    if (fill !== INK) {
      g.strokeStyle = INK;
      g.lineWidth = 2.5 * k;
      g.stroke();
    }
    g.fillStyle = ink;
    g.fillText(text, x, y + 0.5 * k);
    g.textBaseline = 'alphabetic';
  };
  const arrow = (
    x: number,
    y: number,
    dx: number,
    dy: number,
    len: number,
    color: string,
  ): void => {
    const ex = x + dx * len;
    const ey = y + dy * len;
    const a = 7 * k;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    g.moveTo(ex - dx * a - dy * a * 0.7, ey - dy * a + dx * a * 0.7);
    g.lineTo(ex, ey);
    g.lineTo(ex - dx * a + dy * a * 0.7, ey - dy * a - dx * a * 0.7);
    inked(color, 2.5);
  };
  /** The way along the road at a sample of it, as the screen shows it. */
  const way = (a: number): [number, number] => {
    const ax = Math.cos(a);
    const ay = Math.sin(a) * sq;
    const al = Math.hypot(ax, ay) || 1;
    return [ax / al, ay / al];
  };

  // the edge of the map
  const [mx0, my0] = at(0, 0);
  const [mx1, my1] = at(t.size.w, t.size.h);
  g.beginPath();
  g.rect(mx0, my0, mx1 - mx0, my1 - my0);
  inked('rgba(255,255,255,0.9)', 1.5, [8, 7]);

  const bad = b.problems.length > 0;
  const T = b.road();
  if (b.tool === 'road' || all || bad) {
    // the road's line; while it is pulled about (or cannot be built), its width as well
    const moving = b.drag?.changed && b.drag.grab?.kind === 'point';
    const path = (): void => {
      g.beginPath();
      for (let i = 0; i <= T.n; i += 2) {
        const [x, y] = at(T.x[i % T.n]!, T.y[i % T.n]!);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };
    if (moving || bad) {
      path();
      g.strokeStyle = bad ? 'rgba(255,61,87,0.4)' : 'rgba(255,214,10,0.3)';
      g.lineWidth = t.road.width * v.scale * sq;
      g.stroke();
    }
    path();
    g.setLineDash([9 * k, 7 * k]);
    g.strokeStyle = bad ? RED : WHITE;
    g.lineWidth = 2 * k;
    g.stroke();
    g.setLineDash([]);
    // which way the race runs, from the start line
    const [sx, sy] = at(T.x[0]!, T.y[0]!);
    arrow(sx, sy, ...way(T.a[0]!), 36 * k, WHITE);
    t.road.points.forEach(([px, py], i) => {
      const [x, y] = at(px, py);
      const on = is(sel, 'point', i);
      disc(x, y, (on ? 13 : 10) * k, tone('point', i, i === 0 ? CYAN : WHITE));
      if (b.over && is(b.over, 'point', i) && !on && !erasing) {
        g.beginPath();
        g.arc(x, y, 15 * k, 0, Math.PI * 2);
        g.strokeStyle = WHITE;
        g.lineWidth = 2 * k;
        g.stroke();
      }
    });
    const [x0, y0] = at(t.road.points[0]![0], t.road.points[0]![1]);
    tag('START', x0, y0 - 24 * k);
  }

  if (b.tool === 'area' || all)
    t.areas.forEach((a, i) => {
      const [x, y] = at(a.x, a.y);
      const m = b.content.material.get(a.material);
      g.beginPath();
      g.ellipse(x, y, a.r * v.scale, a.r * v.scale * sq, 0, 0, Math.PI * 2);
      // an area being moved or not yet built shows where its ground will lie
      g.globalAlpha = 0.18;
      g.fillStyle = m?.colour ?? '#9fd0ff';
      g.fill();
      g.globalAlpha = 1;
      inked(tone('area', i), is(sel, 'area', i) ? 3 : 2, [9, 7]);
      disc(x, y, (is(sel, 'area', i) ? 11 : 8) * k, tone('area', i, CYAN));
      const what = [m?.meta.name.toUpperCase(), a.sky && skyLabel(a.sky)].filter(Boolean);
      tag(what.join(' · '), x, y - 22 * k);
    });

  if (b.tool === 'surface' || b.tool === 'raise' || all) {
    // a stretch of the road: a band along it, as wide as half the road
    const band = (
      a: number,
      e: number,
      color: string,
      edge: string,
      up = 0,
      slim = false,
    ): void => {
      g.beginPath();
      for (let i = a, first = true; ; i = (i + 1) % T.n, first = false) {
        const [x, y] = at(T.x[i]!, T.y[i]!);
        if (first) g.moveTo(x, y - up);
        else g.lineTo(x, y - up);
        if (i === e) break;
      }
      // (a raised stretch is plain in the ground already: a stripe down its middle marks it)
      const w = slim ? 5 * k : Math.max(8 * k, t.road.width * v.scale * sq * 0.5);
      g.lineCap = 'butt';
      g.strokeStyle = INK;
      g.lineWidth = w + (slim ? 4 : 8) * k;
      g.stroke();
      if (!slim) {
        g.strokeStyle = edge;
        g.lineWidth = w + 4 * k;
        g.stroke();
      }
      g.strokeStyle = color;
      g.lineWidth = w;
      g.stroke();
      g.lineCap = 'round';
    };
    const d = b.drag;
    if (b.tool !== 'surface') {
      t.raised.forEach((up, i) => {
        const a = nearestSample(T, up.x0, up.y0).i;
        const e = nearestSample(T, up.x1, up.y1).i;
        const on = is(sel, 'raised', i);
        const edge = tone('raised', i);
        if (on && d?.grip === 'lift' && !b.lifted) {
          // in hand where the ground cannot follow it yet: its shadow where it lies, and itself
          // as high above it as it will stand
          band(a, e, 'rgba(10,20,64,0.45)', 'rgba(10,20,64,0.45)');
          band(a, e, YEL, WHITE, up.height * v.scale * Math.cos(PITCH));
        } else band(a, e, on ? WHITE : edge === RED ? RED : '#ffe680', edge, 0, true);
        const L = levelsIn(T, up);
        if (on) {
          // the level in hand is the yellow of it; the picture in the panel says the rest
          const cut = [0, ...L.cuts, L.len];
          const j = Math.min(b.part, L.cuts.length);
          if (!(d?.grip === 'lift' && !b.lifted))
            band((a + cut[j]!) % T.n, (a + cut[j + 1]!) % T.n, YEL, YEL, 0, true);
        } else {
          // one not picked says how high it stands, once
          const mid = (a + Math.floor(L.len / 2)) % T.n;
          const [x, y] = at(T.x[mid]!, T.y[mid]!);
          tag(`↑ ${Math.max(...L.heights)}`, x, y, INK, WHITE, 10);
        }
      });
      if (b.tool === 'raise' && d?.mode === 'lay' && d.moved) {
        const up = raisedBetween(T, b.height, d.from, d.to);
        band(nearestSample(T, up.x0, up.y0).i, nearestSample(T, up.x1, up.y1).i, YEL, WHITE);
      }
    }
    if (b.tool !== 'raise') {
      t.surfaces.forEach((sf, i) => {
        const a = nearestSample(T, sf.x0, sf.y0).i;
        const e = nearestSample(T, sf.x1, sf.y1).i;
        const m = b.content.material.get(sf.material);
        band(a, e, m?.colour ?? '#888', tone('surface', i));
        const mid = (a + Math.floor(((e - a + T.n) % T.n) / 2)) % T.n;
        const [x, y] = at(T.x[mid]!, T.y[mid]!);
        tag((m?.meta.name ?? '').toUpperCase(), x, y);
      });
      if (b.tool === 'surface' && d?.mode === 'lay' && d.moved) {
        const sf = surfaceBetween(T, '', d.from, d.to);
        band(
          nearestSample(T, sf.x0, sf.y0).i,
          nearestSample(T, sf.x1, sf.y1).i,
          b.content.material.get(b.cat.surface)?.colour ?? '#888',
          YEL,
        );
      }
    }
  }

  if (b.stroke && b.stroke.length > 1) {
    g.beginPath();
    b.stroke.forEach(([px, py], i) => {
      const [x, y] = at(px, py);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.strokeStyle = 'rgba(255,214,10,0.35)';
    g.lineWidth = t.road.width * v.scale * sq;
    g.stroke();
    inked(WHITE, 3);
  }

  if (b.tool === 'place' || all)
    t.items.forEach((it, i) => {
      const [x, y] = at(it.x, it.y);
      const on = is(sel, 'item', i);
      const near = is(b.over, 'item', i);
      const r = Math.max(
        6 * k,
        (b.content.prop.get(it.prop)?.radius ?? 6) * (it.size ?? 1) * v.scale * 0.9,
      );
      g.beginPath();
      g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
      if (on || near) inked(tone('item', i), on ? 3 : 2);
      else {
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 1.5 * k;
        g.stroke();
      }
      if (on && !erasing) {
        // the ring its two handles sit on
        const ring = b.ring(it);
        g.beginPath();
        g.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        inked(YEL, 2, [7, 6]);
      } else if (!on) {
        // which way it faces
        g.beginPath();
        const [dx, dy] = way(it.rot);
        g.moveTo(x + dx * r, y + dy * r);
        g.lineTo(x + dx * (r + 7 * k), y + dy * (r + 7 * k));
        g.strokeStyle = near ? tone('item', i) : 'rgba(255,255,255,0.8)';
        g.lineWidth = 2 * k;
        g.stroke();
      }
    });

  if (b.tool === 'pool' || all)
    t.pools.forEach((p, i) => {
      const [x, y] = at(p.x, p.y);
      const on = is(sel, 'pool', i);
      g.beginPath();
      g.ellipse(x, y, p.r * v.scale, p.r * v.scale * sq, 0, 0, Math.PI * 2);
      inked(tone('pool', i, CYAN), on ? 3 : 1.5, [6, 5]);
      // a pool being moved has not been painted where it is going yet
      if (on) tag((b.content.material.get(p.material)?.meta.name ?? '').toUpperCase(), x, y);
    });

  if (b.tool === 'bridge' || all)
    t.bridges.forEach((br, i) => {
      const [x, y] = at(br.x, br.y);
      disc(x, y, (is(sel, 'bridge', i) ? 11 : 8) * k, tone('bridge', i, CYAN));
      tag('BRIDGE', x, y - 22 * k);
    });

  ghost(g, b);
  grips(g, b, disc);

  // what is in hand under a fingertip: a ring wide enough to be seen round it
  const d = b.drag;
  if (d?.touch && d.changed && d.mode === 'grab' && d.grab) {
    const o =
      d.grab.kind === 'point'
        ? t.road.points[d.grab.index]
        : d.grab.kind === 'item'
          ? [t.items[d.grab.index]?.x, t.items[d.grab.index]?.y]
          : null;
    if (o && o[0] !== undefined && o[1] !== undefined) {
      const [x, y] = at(o[0], o[1]);
      g.beginPath();
      g.arc(x, y, 34 * k, 0, Math.PI * 2);
      inked(YEL, 3);
    }
  }
  g.restore();
}

/**
 * What is about to be put down, drawn as itself where it would go: a thing on its way from the
 * catalogue, one being moved, or (with a mouse) the thing or pool in hand under the pointer.
 */
function ghost(g: CanvasRenderingContext2D, b: LevelBuilder): void {
  const t = b.track!;
  const s = b.s!;
  const v = b.hooks.view();
  const d = b.drag;
  const sq = Math.sin(PITCH);
  let thing: TrackFile['items'][number] | null = null;
  const sized = (prop: string): number => (b.content.prop.get(prop)?.critter ? 1 : b.size);
  if (b.carried) {
    const { prop, x, y } = b.carried;
    thing = { prop, x, y, rot: b.rotAt(x, y), size: sized(prop) };
  } else if (d?.changed && d.grab?.kind === 'item') thing = t.items[d.grab.index] ?? null;
  else if (!d && !b.pinch && b.hover && b.tool === 'place' && !b.over && !b.sel) {
    const [x, y] = b.hover;
    thing = { prop: b.cat.prop, x, y, rot: b.rotAt(x, y), size: sized(b.cat.prop) };
  }
  if (thing) {
    try {
      const R = (stacks ??= new StackRenderer(g));
      R.setView(v.scale, PITCH);
      R.begin(s.cam.x, s.cam.y, v.w, v.h);
      R.group(0);
      R.stack(b.art.prop(sizedId(thing.prop, thing.size)), thing.x, thing.y, 0, thing.rot, 0.8);
      R.flush();
    } catch {
      // a prop with nothing to draw: the ring below still shows where it goes
    }
    const [x, y] = b.toScreen(thing.x, thing.y);
    const r = Math.max(
      6 * v.dpr,
      (b.content.prop.get(thing.prop)?.radius ?? 6) * (thing.size ?? 1) * v.scale,
    );
    g.beginPath();
    g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
    g.strokeStyle = YEL;
    g.lineWidth = 2 * v.dpr;
    g.stroke();
  }
  if (!d && !b.pinch && b.hover && b.tool === 'pool' && !b.over && !b.sel) {
    const [x, y] = b.toScreen(...b.hover);
    const r = b.poolR * v.scale;
    g.beginPath();
    g.ellipse(x, y, r, r * sq, 0, 0, Math.PI * 2);
    g.globalAlpha = 0.55;
    g.fillStyle = b.content.material.get(b.cat.pool)?.colour ?? '#888';
    g.fill();
    g.globalAlpha = 1;
  }
}

/**
 * The handles of what is picked: round ones with arrows at the ends of a stretch and the edge
 * of a pool or an area, and a thing's own two (round to turn it, square to resize it).
 */
function grips(
  g: CanvasRenderingContext2D,
  b: LevelBuilder,
  disc: (x: number, y: number, r: number, fill: string, line?: number) => void,
): void {
  const k = b.hooks.view().dpr;
  const d = b.drag;
  const held = d?.mode === 'grip' ? d.grip : null;
  // a little arrowhead at (x, y) pointing along (dx, dy)
  const head = (x: number, y: number, dx: number, dy: number, r: number): void => {
    g.beginPath();
    g.moveTo(x + dx * r, y + dy * r);
    g.lineTo(x - dy * r * 0.8, y + dx * r * 0.8);
    g.lineTo(x + dy * r * 0.8, y - dx * r * 0.8);
    g.closePath();
    g.fillStyle = INK;
    g.fill();
  };
  for (const hd of b.grips()) {
    const on = held === hd.grip && (hd.part === undefined || hd.part === d?.part);
    const fill = on ? YEL : WHITE;
    if (hd.grip === 'turn') {
      disc(hd.x, hd.y, 14 * k, fill);
      // a turning arrow
      g.beginPath();
      g.arc(hd.x, hd.y, 6 * k, -Math.PI * 0.9, Math.PI * 0.55);
      g.strokeStyle = INK;
      g.lineWidth = 2.5 * k;
      g.stroke();
      head(hd.x - 6 * k, hd.y - 2 * k, 0.2, -1, 4.5 * k);
    } else if (hd.grip === 'size') {
      g.beginPath();
      g.roundRect(hd.x - 12 * k, hd.y - 12 * k, 24 * k, 24 * k, 5 * k);
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 3 * k;
      g.stroke();
      head(hd.x + 3 * k, hd.y + 3 * k, Math.SQRT1_2, Math.SQRT1_2, 5 * k);
      head(hd.x - 3 * k, hd.y - 3 * k, -Math.SQRT1_2, -Math.SQRT1_2, 5 * k);
    } else {
      // an end, or an edge: pulled the way its arrows point
      disc(hd.x, hd.y, (on ? 14 : 11) * k, fill, 2.5);
      head(hd.x + hd.dx * 3 * k, hd.y + hd.dy * 3 * k, hd.dx, hd.dy, 4.5 * k);
      head(hd.x - hd.dx * 3 * k, hd.y - hd.dy * 3 * k, -hd.dx, -hd.dy, 4.5 * k);
    }
  }
}
