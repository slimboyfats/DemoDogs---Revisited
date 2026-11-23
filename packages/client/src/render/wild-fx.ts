import { DT, type SimEvent } from '@demodogs/shared';
import { flailAt, type World } from '@demodogs/sim';
import type { Art } from './art';
import type { Effects } from './effects';
import { CKind } from './pixel/cells';
import { HAZE } from './pixel/particles';
import type { StackSink } from './stacks';
import type { Sound } from '../audio/sound';

/**
 * How the five wild arms look and sound, and they are meant to be seen from across the map: the
 * twister is a funnel of the ground's own dust that carries off every loose cell near it, the
 * flail is a ball on a chain of cells with sparks streaming off it, the bone comes down burning
 * onto a shadow that grows under it, the fissure is painted into the ground as it opens and
 * throws the earth up, and the cold snap is a ring of white cells and a frosted road.
 */

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(l: readonly T[]): T => l[(Math.random() * l.length) | 0]!;

const CHAIN = [0xc4c7cd, 0x6b6e74, 0xf0f3f7, 0x3d4048] as const;
const ICE = [0xffffff, 0xd8f0ff, 0xa6d8f0, 0x7fc8f0] as const;
const BONE = [0xf2f2f2, 0xd6d7cf, 0xa9aaa2] as const;

type Mine = Extract<SimEvent, { t: 'crack' | 'frost' | 'meteor' | 'pit' | 'trap' | 'fill' }>;

const tone = (hex: string) => parseInt(hex.slice(1), 16);

function pip(fx: Effects, x: number, y: number, z: number, rgb: number, size = 0.8): void {
  fx.emit('pip', x, y, z, 0, 0, 0, 0.03, size, rgb);
}

/** Carry one loose thing round a whirl and in towards it, and lift it. */
function whirl(
  p: { x: number; y: number; z: number; vz: number },
  x: number,
  y: number,
  R: number,
  k: number,
): void {
  const dx = x - p.x;
  const dy = y - p.y;
  if (Math.abs(dx) > R || Math.abs(dy) > R) return;
  const d = Math.hypot(dx, dy);
  if (d > R || d < 2) return;
  const s = (k * (0.4 + 1.6 * (1 - d / R)) * DT) / d;
  p.x += (dx * 0.6 - dy) * s;
  p.y += (dy * 0.6 + dx) * s;
  p.vz += 90 * (1 - d / R) * DT;
}

export function wildEvent(fx: Effects, w: World, e: Mine, S: Sound): void {
  const P = w.player;
  const earth = [tone(w.venue.colors.dirt), tone(w.venue.colors.ground2), 0x2a1c12] as const;
  switch (e.t) {
    case 'pit': {
      // the hole: black at the bottom, its far wall lit, a pale lip of thrown-up earth round it
      const r = e.r;
      const k = 5 + ((Math.random() * 3) | 0);
      const ph = rand(0, TAU);
      fx.paintGround(e.x, e.y, r * 1.4 + 2, (g) => {
        g.globalAlpha = 1;
        for (let py = Math.floor(e.y - r * 1.4); py <= e.y + r * 1.4; py++)
          for (let px = Math.floor(e.x - r * 1.4); px <= e.x + r * 1.4; px++) {
            const dx = px + 0.5 - e.x;
            const dy = py + 0.5 - e.y;
            const a = Math.atan2(dy, dx);
            const edge = r * (0.94 + 0.05 * Math.sin(a * k + ph) + 0.03 * Math.sin(a * 11 - ph));
            const d = Math.hypot(dx, dy) / edge;
            if (d > 1.3) continue;
            if (d > 1) {
              // the spoil heap: thick by the hole, thinning out
              if (Math.random() > (1.3 - d) / 0.3 + 0.15) continue;
              g.fillStyle =
                Math.random() < 0.5 ? '#c9ae84' : Math.random() < 0.5 ? '#a58a63' : '#7c6446';
            } else {
              // looked at from above and a little in front: the far wall shows, the near one does not
              const wall = (-dy / edge + 1) / 2;
              const depth = 1 - d;
              g.fillStyle =
                d > 0.93
                  ? '#1c130c'
                  : wall > 0.55 && depth < 0.42
                    ? ['#7a5a3a', '#684a2e', '#523822', '#3a2616'][
                        Math.min(3, (depth / 0.105) | 0)
                      ]!
                    : depth < 0.12
                      ? '#120c08'
                      : '#050403';
            }
            g.fillRect(px, py, 1, 1);
          }
      });
      // and the earth that came out of it: a fountain of clods, thrown back the way it was dug
      for (let i = 0; i < 90 * Math.max(0.5, fx.quality); i++) {
        const a = rand(0, TAU);
        const s = rand(20, 110);
        fx.emit(
          'pip',
          e.x + Math.cos(a) * rand(0, r),
          e.y + Math.sin(a) * rand(0, r),
          1,
          Math.cos(a) * s,
          Math.sin(a) * s,
          rand(90, 260),
          rand(0.4, 1.1),
          Math.random() < 0.35 ? 2 : 1.2,
          pick(earth),
        );
      }
      for (let i = 0; i < 8; i++) fx.puff(e.x + rand(-r, r), e.y + rand(-r, r), 1, 'dust');
      fx.plume(e.x, e.y, 2, 7, earth[0], 70);
      if (Math.hypot(e.x - P.x, e.y - P.y) < 200) fx.shake = Math.max(fx.shake, 7);
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.thud(v);
      return;
    }
    case 'trap': {
      const c = w.cars[e.car]!;
      for (let i = 0; i < 40 * Math.max(0.5, fx.quality); i++) {
        const a = rand(0, TAU);
        fx.emit(
          'pip',
          e.x + Math.cos(a) * rand(4, 12),
          e.y + Math.sin(a) * rand(4, 12),
          1,
          Math.cos(a) * rand(20, 90),
          Math.sin(a) * rand(20, 90),
          rand(60, 170),
          rand(0.3, 0.8),
          1.2,
          pick(earth),
        );
      }
      for (let i = 0; i < 6; i++) fx.puff(c.x + rand(-8, 8), c.y + rand(-8, 8), 2, 'dust');
      fx.text(
        e.x,
        e.y,
        c === P ? 'IN THE PIT!' : 'PITTED!',
        c === P ? '#ff6a3d' : '#ffd24a',
        c === P,
      );
      if (c === P) fx.shake = Math.max(fx.shake, 12);
      const v = fx.vol(e.x, e.y);
      if (v > 0) S.thud(v);
      return;
    }
    case 'fill': {
      // it slumps in on itself: loose earth where the hole was
      const r = e.r * 1.3;
      const rgb = earth[0];
      fx.paintGround(e.x, e.y, r + 2, (g) => {
        g.globalAlpha = 1;
        for (let py = Math.floor(e.y - r); py <= e.y + r; py++)
          for (let px = Math.floor(e.x - r); px <= e.x + r; px++) {
            const d = Math.hypot(px + 0.5 - e.x, py + 0.5 - e.y) / r;
            if (d > 1 || (d > 0.85 && Math.random() < 0.5)) continue;
            const s = rand(0.72, 0.98);
            g.fillStyle = `rgb(${(((rgb >> 16) & 255) * s) | 0},${(((rgb >> 8) & 255) * s) | 0},${((rgb & 255) * s) | 0})`;
            g.fillRect(px, py, 1, 1);
          }
      });
      for (let i = 0; i < 8; i++)
        fx.puff(e.x + rand(-r, r) * 0.7, e.y + rand(-r, r) * 0.7, 1, 'dust');
      return;
    }
    case 'crack': {
      // the split itself: a ragged black line with a pale broken lip, painted into the ground
      const cs = Math.cos(e.h);
      const sn = Math.sin(e.h);
      fx.paintGround(e.x, e.y, 16, (g) => {
        for (let s = -8; s <= 8; s += 0.5) {
          const off = Math.sin(s * 1.9 + e.x * 0.3) * 1.6 + rand(-0.5, 0.5);
          const wide = 1.4 + Math.random() * 1.2;
          for (let o = -wide - 1.5; o <= wide + 1.5; o += 1) {
            const lip = Math.abs(o) > wide;
            if (lip && Math.random() < 0.5) continue;
            g.fillStyle = lip ? 'rgba(190,170,140,0.55)' : 'rgba(8,6,5,0.95)';
            g.fillRect(
              Math.floor(e.x + cs * s - sn * (off + o)),
              Math.floor(e.y + sn * s + cs * (off + o)),
              1,
              1,
            );
          }
        }
      });
      // the earth goes up either side of it: clods as flying cells, and a wall of dust
      for (let i = 0; i < 22 * fx.quality; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        fx.emit(
          'pip',
          e.x + rand(-5, 5),
          e.y + rand(-5, 5),
          1,
          -sn * side * rand(10, 70) + cs * rand(-25, 25),
          cs * side * rand(10, 70) + sn * rand(-25, 25),
          rand(60, 190),
          rand(0.35, 0.8),
          Math.random() < 0.3 ? 1.6 : 1,
          pick(earth),
        );
      }
      for (let i = 0; i < 4; i++) fx.puff(e.x + rand(-4, 4), e.y + rand(-4, 4), 1, 'dust');
      fx.plume(e.x, e.y, 2, 4, earth[0], 50);
      if (Math.hypot(e.x - P.x, e.y - P.y) < 160) fx.shake = Math.max(fx.shake, 6);
      const v = fx.vol(e.x, e.y);
      if (v > 0 && Math.random() < 0.5) S.thud(v);
      return;
    }
    case 'frost': {
      fx.flashes.push({ x: e.x, y: e.y, r: e.r * 1.3, life: 0.3, max: 0.3, rgb: 0xc8ecff });
      fx.ripples.push({
        x: e.x,
        y: e.y,
        z: 0,
        t: 0,
        dur: 0.5,
        maxR: e.r * 1.2,
        width: 12,
        strength: 1,
      });
      // a ring of white cells racing out over the ground, and a bank of freezing mist behind it
      const v0 = e.r / 0.35;
      for (let i = 0; i < 220 * fx.quality; i++) {
        const a = rand(0, TAU);
        const v = v0 * rand(0.75, 1.05);
        fx.emit(
          'spark',
          e.x,
          e.y,
          rand(0.5, 3),
          Math.cos(a) * v,
          Math.sin(a) * v,
          rand(0, 40),
          rand(0.3, 0.42),
          1,
          pick(ICE),
        );
      }
      for (let i = 0; i < 140 * fx.quality; i++) {
        const a = rand(0, TAU);
        const d = e.r * Math.sqrt(Math.random());
        fx.cells.add(
          CKind.Wisp,
          e.x + Math.cos(a) * d,
          e.y + Math.sin(a) * d,
          rand(0, 5),
          Math.cos(a) * 20,
          Math.sin(a) * 20,
          rand(2, 14),
          rand(1.2, 2.8),
          pick(ICE),
        );
      }
      // rime on the ground: white specks, thick round the car and thinning to the edge
      fx.paintGround(e.x, e.y, e.r + 2, (g) => {
        for (let i = 0; i < e.r * e.r * 0.5; i++) {
          const a = rand(0, TAU);
          const d = e.r * Math.random();
          g.fillStyle = Math.random() < 0.5 ? 'rgba(235,248,255,0.6)' : 'rgba(170,215,240,0.45)';
          g.fillRect(Math.floor(e.x + Math.cos(a) * d), Math.floor(e.y + Math.sin(a) * d), 1, 1);
        }
      });
      if (e.car !== P.index && Math.hypot(e.x - P.x, e.y - P.y) < e.r)
        fx.text(P.x, P.y, 'FROZEN!', '#a6fbff', true);
      const v = fx.vol(e.x, e.y);
      if (v > 0) {
        S.hiss(v, false);
        S.pop(v);
      }
      return;
    }
    case 'meteor': {
      // it has landed (the blast is its own event): the air rings, and the bone flies to bits
      fx.ripples.push(
        { x: e.x, y: e.y, z: 0, t: 0, dur: 0.9, maxR: 190, width: 26, strength: 1.6 },
        { x: e.x, y: e.y, z: 0, t: -0.1, dur: 0.7, maxR: 110, width: 12, strength: 1 },
      );
      fx.flashes.push({ x: e.x, y: e.y, r: 150, life: 0.35, max: 0.35, rgb: 0xfff0c0 });
      for (let i = 0; i < 90 * fx.quality; i++) {
        const a = rand(0, TAU);
        const v = rand(40, 260);
        fx.emit(
          'pip',
          e.x,
          e.y,
          rand(1, 6),
          Math.cos(a) * v,
          Math.sin(a) * v,
          rand(80, 320),
          rand(0.5, 1.3),
          Math.random() < 0.3 ? 2 : 1.2,
          pick(BONE),
        );
      }
      fx.shake = Math.max(fx.shake, Math.hypot(e.x - P.x, e.y - P.y) < 260 ? 16 : 7);
      S.boom(1);
      return;
    }
  }
}

export function wildTick(fx: Effects, w: World, S: Sound): void {
  const W = w.wild;
  const q = fx.quality;
  const now = w.time;
  const dust = [
    tone(w.venue.colors.dirt),
    tone(w.venue.colors.ground2),
    0x9a8a70,
    0x6a6660,
  ] as const;

  for (const t of W.twisters) {
    const R = t.def.radius ?? 46;
    const k = Math.min(1, t.age / 0.5, t.t / 0.6);
    // everything loose in the air goes round with it: fire, smoke, leaves, sparks, bits of car
    fx.cells.swirl(t.x, t.y, R * 1.3, 220 * k, DT);
    for (const p of fx.fx) if (p.kind !== 'pip') whirl(p, t.x, t.y, R * 1.3, 200 * k);
    for (const v of fx.voxels) whirl(v, t.x, t.y, R * 1.3, 240 * k);
    for (const d of fx.debris) whirl(d, t.x, t.y, R * 1.3, 180 * k);
    // the funnel: a column of the ground's own dust, narrow at the foot and wide at the top,
    // every cell going round; the column leans and snakes as it goes
    // drawn solid, in three spiral arms, so it reads as one turning thing from across the map
    const H = 84 * k;
    // not thinned on a slow phone: a twister you cannot see is a cheat
    for (let z = 0; z < H; z += 2.2) {
      const lean = Math.sin(now * 2.3 + z * 0.06) * z * 0.16;
      const r = 3 + z * 0.3 + Math.sin(now * 5 + z * 0.3) * 1.2;
      const n = Math.max(3, Math.ceil(r * 0.85));
      // only the near wall is drawn: it hides the far one
      for (let i = 0; i < n; i++) {
        const u = (i + Math.random()) / n;
        const a = u * Math.PI;
        // three bands wind up the wall and go round with it
        const turn = (a + now * 12 - z * 0.14) / (TAU / 3);
        const f = turn - Math.floor(turn);
        const edge = Math.sin(a);
        const rgb = f < 0.3 ? 0xf4ecdc : f < 0.55 ? pick(dust) : edge < 0.45 ? 0x2a2420 : 0x5a4e44;
        fx.emit(
          'pip',
          t.x + Math.cos(a) * r + lean,
          t.y + edge * r * 0.5,
          z + rand(-1, 1),
          0,
          0,
          0,
          0.018,
          2.6,
          rgb,
        );
      }
    }
    // and loose dust thrown off the top of it for the wind to take
    for (let i = 0; i < 10 * q * k; i++) {
      const a = rand(0, TAU);
      const z = H * rand(0.5, 1);
      const r = 3 + z * 0.42;
      fx.cells.add(
        CKind.Wisp,
        t.x + Math.cos(a) * r,
        t.y + Math.sin(a) * r * 0.5,
        z,
        -Math.sin(a) * 90,
        Math.cos(a) * 90,
        rand(5, 30),
        rand(0.6, 1.4),
        pick(dust),
      );
    }
    // the skirt: dust and grit torn off the ground all round its foot and drawn in
    for (let i = 0; i < 14 * q * k; i++) {
      const a = rand(0, TAU);
      const d = R * rand(0.35, 1);
      fx.emit(
        'pip',
        t.x + Math.cos(a) * d,
        t.y + Math.sin(a) * d,
        rand(0.5, 3),
        -Math.sin(a) * 120 - Math.cos(a) * 70,
        Math.cos(a) * 120 - Math.sin(a) * 70,
        rand(10, 70),
        rand(0.3, 0.6),
        1,
        pick(dust),
      );
    }
    if (w.tick % 24 === 0) {
      const v = fx.vol(t.x, t.y);
      if (v > 0) S.whoosh(v);
    }
  }

  for (const f of W.flails) {
    const c = w.cars[f.car]!;
    const [x, y] = flailAt(w, f);
    const z = c.z + 4;
    // the chain: links in two tones, so you can see it is one
    const n = Math.ceil((f.def.reach ?? 17) / 0.8);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pip(fx, c.x + (x - c.x) * u, c.y + (y - c.y) * u, z, CHAIN[(i >> 1) & 3]!, 0.9);
    }
    // the ball leaves a streak of hot cells along the arc it has just swung through
    const sp = f.def.speed ?? 8;
    const R = f.def.reach ?? 17;
    for (let i = 1; i <= 10; i++) {
      const a = f.a - i * 0.07 * (sp / 8);
      fx.emit(
        'spark',
        c.x + Math.cos(a) * R + rand(-1, 1),
        c.y + Math.sin(a) * R + rand(-1, 1),
        z + rand(0, 3),
        0,
        0,
        rand(0, 20),
        0.05 + (10 - i) * 0.012,
        1,
        i < 4 ? 0xffffff : i < 7 ? 0xffd070 : 0xff8030,
      );
    }
    if (w.tick % 14 === 0) {
      const v = fx.vol(c.x, c.y);
      if (v > 0) S.whoosh(v * 0.6);
    }
  }

  for (const b of W.bones) {
    const k = 1 - Math.max(0, b.t / b.from);
    const locked = b.t <= (b.def.fuse ?? 0.6);
    // its shadow: a dark disc that grows under it, ringed red, then white once it has locked
    const r = 5 + 14 * k;
    for (let i = 0; i < r * r * 2.4 * q; i++) {
      const a = rand(0, TAU);
      const d = r * Math.sqrt(Math.random());
      pip(fx, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d * 0.9, 0.4, 0x0c0a08, 1);
    }
    const n = Math.ceil(30 * q);
    for (let i = 0; i < n; i++) {
      const a = now * 4 + (i / n) * TAU;
      pip(
        fx,
        b.x + Math.cos(a) * (r + 3),
        b.y + Math.sin(a) * (r + 3),
        0.6,
        locked ? 0xffffff : i & 1 ? 0xff2a2a : 0xff9a3a,
        1.2,
      );
    }
    // and the bone, burning as it comes: fire wrapped round it, a tail of smoke up the sky
    const z = boneHeight(b.t);
    if (z < 260) {
      for (let i = 0; i < 5 * q; i++)
        fx.flame(b.x + rand(-8, 8), b.y + rand(-3, 3), z + rand(0, 10), 5, 0, 0, rand(60, 140));
      fx.plume(b.x + rand(-6, 6), b.y, z + 14, 5, HAZE, 80);
      for (let i = 0; i < 3; i++) fx.ember(b.x + rand(-9, 9), b.y, z + 8);
    }
  }
}

function boneHeight(t: number): number {
  return t * 300;
}

export function queueWild(R: StackSink, art: Art, w: World): void {
  const W = w.wild;
  for (const f of W.flails) {
    const c = w.cars[f.car]!;
    const [x, y] = flailAt(w, f);
    if (!R.visible(x, y, 8, 14)) continue;
    R.group(y);
    R.stack(art.prop(f.def.id), x, y, c.z, f.a * 2.5);
  }
  for (const b of W.bones) {
    const z = boneHeight(b.t);
    if (z > 260 || !R.visible(b.x, b.y, 14, z + 12)) continue;
    R.group(b.y);
    R.stack(art.prop(b.def.id), b.x, b.y, z, 0.4 + b.t * 3);
  }
}

export function wildLights(
  L: { add(x: number, y: number, r: number, k: number, rgb: number): void },
  w: World,
): void {
  for (const b of w.wild.bones) {
    const k = 1 - Math.max(0, b.t / b.from);
    L.add(b.x, b.y, 30 + 60 * k, 0.4 + 0.6 * k, 0xff8030);
  }
  for (const f of w.wild.flails) {
    const [x, y] = flailAt(w, f);
    L.add(x, y, 14, 0.6, 0xffc060);
  }
}
