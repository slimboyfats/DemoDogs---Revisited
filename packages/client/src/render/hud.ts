import { ADDON_KINDS, BASE_SPEED, GUARD_KINDS, HELD } from '@demodogs/shared';
import { haunting, rescueIn, type Car, type World } from '@demodogs/sim';
import type { Effects } from './effects';
import { DIAL_DEFAULT, dialSpot, type DialSetup } from '../game/speedo';
import { BODY, DISPLAY } from './type';

const TAU = Math.PI * 2;
/** The HUD's colours, the menus' own (theme.css): an ink line round everything, paper and sun. */
const INK = '#0a1440';
const SUN = '#ffd60a';

/** The guards a car carries, as the HUD names them: seconds left, or uses left. */
export function guardLabels(c: Car): string[] {
  const out: string[] = [];
  for (const k of GUARD_KINDS) {
    const g = c.guards[k];
    if (!g) continue;
    const name = g.def.meta.name.toUpperCase();
    out.push(g.def.seconds !== undefined ? `${name} ${Math.ceil(g.t)}s` : `${name} x${g.n}`);
  }
  return out;
}

export function placeName(n: number): string {
  return n + (n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH');
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** What the speedometer says is holding the car back, most telling first. */
const HELD_SAYS: [number, string][] = [
  [HELD.wet, 'WADING'],
  [HELD.hot, 'IN THE LAVA!'],
  [HELD.sticky, 'STUCK IN THE MUCK'],
  [HELD.rough, 'OFF ROAD'],
  [HELD.hill, 'UPHILL'],
  [HELD.fresh, 'FINDING ITS FEET'],
  [HELD.weighed, 'WEIGHED DOWN'],
  [HELD.hurt, 'DAMAGED'],
];

/** How far a dial at the bottom is lifted to clear the spectator's bar (CSS px). */
const WATCH_BAR = 66;

/** The words for what is holding a car back (`Car.held`), most telling first. */
export function heldLabels(held: number): string[] {
  return HELD_SAYS.filter(([bit]) => held & bit).map(([, say]) => say);
}

/** The speed the dial shows for a car, in its own made-up units (px/s, near enough km/h). */
export function dialSpeed(c: Car): number {
  return Math.round(Math.hypot(c.vx, c.vy));
}

interface Mini {
  cv: HTMLCanvasElement;
  k: number;
}

type Paint = string | CanvasGradient;

/** A place's colours, top to bottom: gold, silver and bronze for the first three. */
const PLACE: readonly (readonly [string, string, string])[] = [
  ['#fff8b8', '#ffd60a', '#ff9d1c'],
  ['#ffffff', '#dfe7f3', '#9fb0c8'],
  ['#ffe3c2', '#f2a566', '#c56d2c'],
  ['#ffffff', '#e2f3ff', '#9fd4ff'],
];
/** The start lights' colours as the countdown runs: red, amber, green. */
const LIGHTS: readonly (readonly [string, string, string])[] = [
  ['#d8ffc9', '#6bd65a', '#2f9d3a'],
  ['#fff8b8', '#ffd60a', '#ff9d1c'],
  ['#ffd0c9', '#ff6b5b', '#d1321f'],
];

/** The small signs on the gauges, each drawn in a box of 24. */
const SIGNS = {
  shield: 'M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z',
  bolt: 'M14.2 1.8L4.6 13.4h5.6L8.6 22.2l10.8-12.4h-6.2z',
  star: 'M12 2l3 6.5 7 .9-5.2 4.8 1.4 7-6.2-3.5-6.2 3.5 1.4-7L2 9.4l7-.9z',
  shell: 'M8.5 22V9.5c0-3 1.6-5.6 3.5-7.5 1.9 1.9 3.5 4.5 3.5 7.5V22z',
} as const;
type Sign = keyof typeof SIGNS;

/** The race HUD drawn on the game canvas: place, laps or cars left, score, bars, the minimap. */
export class Hud {
  private mini: Mini | null = null;
  /**
   * What this race is being run for, in a few words beside the clock (a tournament's target time,
   * the car with the bounty on it), or null for none.
   */
  aim: ((w: World) => { text: string; colour: string } | null) | null = null;

  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  private signs: Partial<Record<Sign, Path2D>> = {};
  private sign(k: Sign): Path2D {
    return (this.signs[k] ??= new Path2D(SIGNS[k]));
  }

  /** The place last shown and when it changed, so the numeral jumps as a car is passed. */
  private placeWas = 0;
  private placeAt = -1e9;
  /** The message last shown and when it came up, so it lands with a bounce. */
  private msgWas = '';
  private msgLeft = 0;
  private msgAt = -1e9;

  /** Rebuild the minimap for a world and screen size. */
  layout(w: World, dpr: number): void {
    const size = Math.round(
      Math.min(150, Math.max(90, Math.min(innerWidth, innerHeight) * 0.3)) * dpr,
    );
    const k = size / Math.max(w.w, w.h);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w.w * k) + 8;
    cv.height = Math.ceil(w.h * k) + 8;
    const g = cv.getContext('2d')!;
    // a dark glass plate with round corners, an ink line round it and a pale one inside that
    const e = 1.5 * dpr;
    g.beginPath();
    g.roundRect(e, e, cv.width - e * 2, cv.height - e * 2, 10 * dpr);
    const glass = g.createLinearGradient(0, 0, 0, cv.height);
    glass.addColorStop(0, 'rgba(23,48,154,0.74)');
    glass.addColorStop(1, 'rgba(10,20,64,0.6)');
    g.fillStyle = glass;
    g.fill();
    g.lineWidth = e * 2;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.roundRect(e * 2.6, e * 2.6, cv.width - e * 5.2, cv.height - e * 5.2, 8 * dpr);
    g.lineWidth = dpr;
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.stroke();
    g.translate(4, 4);
    const T = w.track;
    if (T) {
      g.beginPath();
      for (let i = 0; i < T.n; i++) {
        if (i) g.lineTo(T.x[i]! * k, T.y[i]! * k);
        else g.moveTo(T.x[i]! * k, T.y[i]! * k);
      }
      g.closePath();
      g.lineJoin = 'round';
      const lw = Math.max(2.4 * dpr, w.road * k * 0.6);
      g.strokeStyle = INK;
      g.lineWidth = lw + 2.4 * dpr;
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = lw;
      g.stroke();
      // the line: a red bar across the road where a lap starts
      if (T.n > 1) {
        const dx = T.x[1]! - T.x[0]!;
        const dy = T.y[1]! - T.y[0]!;
        const d = Math.hypot(dx, dy) || 1;
        const nx = (-dy / d) * (lw * 0.5 + 1.6 * dpr);
        const ny = (dx / d) * (lw * 0.5 + 1.6 * dpr);
        g.beginPath();
        g.moveTo(T.x[0]! * k - nx, T.y[0]! * k - ny);
        g.lineTo(T.x[0]! * k + nx, T.y[0]! * k + ny);
        g.lineCap = 'round';
        g.strokeStyle = INK;
        g.lineWidth = 4 * dpr;
        g.stroke();
        g.strokeStyle = '#ff5b4a';
        g.lineWidth = 2 * dpr;
        g.stroke();
      }
    }
    const O = w.oval;
    if (O) {
      g.beginPath();
      g.ellipse(O.cx * k, O.cy * k, O.rx * k, O.ry * k, 0, 0, TAU);
      g.fillStyle = 'rgba(255,248,230,0.6)';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2 * dpr;
      g.stroke();
    }
    this.mini = { cv, k };
  }

  /** `focus` is the car the readouts are about: this screen's own, or the one being watched. */
  draw(w: World, fx: Effects, W: number, H: number, u: number, focus: Car = w.player): void {
    const ctx = this.ctx;
    const P = focus;
    const now = performance.now() / 1000;
    const pad = 12 * u;
    const left = pad + 56 * u;
    const font = (px: number) => `italic 900 ${Math.round(px * u)}px ${DISPLAY}`;
    const fine = (px: number) => `700 ${Math.round(px * u)}px ${BODY}`;
    const small = font(13);
    /** Top to bottom through three colours, over `h` about `y`. */
    const shade = (c: readonly [string, string, string], y: number, h: number): CanvasGradient => {
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0.12, c[0]);
      g.addColorStop(0.55, c[1]);
      g.addColorStop(0.95, c[2]);
      return g;
    };
    const text = (
      t: string,
      x: number,
      y: number,
      f: string,
      col: Paint = '#fff',
      align: CanvasTextAlign = 'left',
    ) => {
      ctx.font = f;
      ctx.textAlign = align;
      // an ink line round every letter, with round corners, and a hard shadow under the big ones
      let px = Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 12);
      if (align === 'center') {
        // words across the middle are made to fit a narrow (upright) screen
        const over = ctx.measureText(t).width / (W - 28 * u);
        if (over > 1) {
          px = Math.floor(px / over);
          ctx.font = `italic 900 ${px}px ${DISPLAY}`;
        }
      }
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3.5 * u, px * 0.24);
      ctx.strokeStyle = INK;
      if (px >= 18 * u) ctx.strokeText(t, x, y + px * 0.1);
      ctx.strokeText(t, x, y);
      ctx.fillStyle = col;
      ctx.fillText(t, x, y);
    };
    /** Words with no line round them, for a plate that is dark already. */
    const plain = (
      t: string,
      x: number,
      y: number,
      f: string,
      col: Paint = '#fff',
      align: CanvasTextAlign = 'left',
    ) => {
      ctx.font = f;
      ctx.textAlign = align;
      ctx.fillStyle = col;
      ctx.fillText(t, x, y);
    };
    /** Numbers that tick over without the rest shuffling about: every digit as wide as a 0. */
    const ticking = (t: string, x: number, y: number, f: string, col: Paint, mid = false) => {
      ctx.font = f;
      const cell = ctx.measureText('0').width;
      let wide = 0;
      for (const ch of t) wide += ch >= '0' && ch <= '9' ? cell : ctx.measureText(ch).width;
      let at = mid ? x - wide / 2 : x;
      ctx.textAlign = 'center';
      ctx.fillStyle = col;
      for (const ch of t) {
        const cw = ch >= '0' && ch <= '9' ? cell : ctx.measureText(ch).width;
        ctx.fillText(ch, at + cw / 2, y);
        at += cw;
      }
      return wide;
    };
    /** A plate leaning forward, as if at speed: an ink line, filled. */
    const plate = (x: number, y: number, bw: number, bh: number, fill: Paint, line = 2 * u) => {
      const lean = bh * 0.26;
      ctx.beginPath();
      ctx.moveTo(x + lean, y);
      ctx.lineTo(x + bw + lean, y);
      ctx.lineTo(x + bw, y + bh);
      ctx.lineTo(x, y + bh);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.fillStyle = fill;
      ctx.fill();
      if (line > 0) {
        ctx.lineWidth = line;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    };
    const DARK = 'rgba(10,20,64,0.74)';
    /** One of the small signs, `size` across with its middle at (x, y), with an ink line round it. */
    const sign = (k: Sign, x: number, y: number, size: number, col: Paint) => {
      ctx.save();
      ctx.translate(x - size / 2, y - size / 2);
      ctx.scale(size / 24, size / 24);
      ctx.lineJoin = 'round';
      ctx.lineWidth = (2.6 * u * 24) / size;
      ctx.strokeStyle = INK;
      ctx.stroke(this.sign(k));
      ctx.fillStyle = col;
      ctx.fill(this.sign(k));
      ctx.restore();
    };
    /** A pill: round ends, an ink line, filled. */
    const pill = (x: number, y: number, bw: number, bh: number, fill: Paint, line = 2 * u) => {
      ctx.beginPath();
      ctx.roundRect(x, y, bw, bh, bh / 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = line;
      ctx.strokeStyle = INK;
      ctx.stroke();
    };
    /** A gauge: a leaning slot, lit as far as `v` in its colours, its sign on a stud at its head. */
    const bar = (y: number, v: number, cols: readonly [string, string], what: Sign) => {
      const x = left + 11 * u;
      const bw = 128 * u;
      const bh = 13 * u;
      plate(x, y, bw, bh, DARK, 2.4 * u);
      const k = Math.min(1, Math.max(0, v));
      const lean = bh * 0.26;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + lean + u, y + u);
      ctx.lineTo(x + bw + lean - u, y + u);
      ctx.lineTo(x + bw - u, y + bh - u);
      ctx.lineTo(x + u, y + bh - u);
      ctx.closePath();
      ctx.clip();
      if (k > 0) {
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, cols[0]);
        g.addColorStop(1, cols[1]);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, (bw + lean) * k, bh);
        // light along the top of it, and a bright edge where it ends
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(x, y + 1.5 * u, (bw + lean) * k, 3 * u);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x + (bw + lean) * k - 2 * u, y, 2 * u, bh);
      }
      // notched in quarters
      ctx.fillStyle = 'rgba(10,20,64,0.5)';
      for (let i = 1; i < 4; i++) ctx.fillRect(x + ((bw + lean) * i) / 4, y, 1.4 * u, bh);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(left + 8 * u, y + bh / 2, 10 * u, 0, TAU);
      ctx.fillStyle = '#17309a';
      ctx.fill();
      ctx.lineWidth = 2.4 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      sign(what, left + 8 * u, y + bh / 2, 13 * u, cols[0]);
    };
    /** A small plate with a sign, what it counts and the count. Returns where the next one goes. */
    const chip = (
      x: number,
      y: number,
      what: Sign,
      name: string,
      n: string,
      col: Paint,
    ): number => {
      ctx.font = fine(8.5);
      const nw = ctx.measureText(name).width;
      ctx.font = font(13);
      const vw = ctx.measureText(n).width;
      const bw = 20 * u + nw + 4 * u + vw + 8 * u;
      const bh = 16 * u;
      plate(x, y, bw, bh, DARK);
      sign(what, x + 11 * u, y + bh / 2, 11 * u, col);
      ctx.textBaseline = 'middle';
      plain(name, x + 20 * u, y + bh / 2 + 0.5 * u, fine(8.5), '#b9c8e6');
      plain(n, x + 24 * u + nw, y + bh / 2 + 0.5 * u, font(13), col);
      ctx.textBaseline = 'top';
      return x + bw + 6 * u;
    };

    ctx.textBaseline = 'top';
    const st = w.standings();
    /**
     * The place (or how many are left) as one big numeral with its ending small beside it, set at
     * a tilt, in gold, silver or bronze; it jumps when it changes. Returns where it ends.
     */
    const numeral = (n: number, tail: string, cols: readonly [string, string, string]): number => {
      if (n !== this.placeWas) {
        if (this.placeWas) this.placeAt = now;
        this.placeWas = n;
      }
      const age = now - this.placeAt;
      const pop = age < 0.4 ? 1 + 0.45 * Math.sin((age / 0.4) * Math.PI) * (1 - age / 0.4) : 1;
      const big = font(44);
      const sub = font(tail.length > 2 ? 15 : 19);
      ctx.font = big;
      const nw = ctx.measureText(String(n)).width;
      ctx.font = sub;
      const tw = ctx.measureText(tail).width;
      const cy = pad + 20 * u;
      ctx.save();
      ctx.translate(left + nw / 2, cy);
      ctx.rotate(-0.07);
      ctx.scale(pop, pop);
      ctx.textBaseline = 'middle';
      text(String(n), -nw / 2, 2 * u, big, shade(cols, 0, 36 * u));
      text(tail, nw / 2 + 3 * u, -7 * u, sub, shade(cols, -7 * u, 16 * u));
      ctx.restore();
      ctx.textBaseline = 'top';
      return left + nw + tw + 12 * u;
    };
    /** The clock on a plate of its own. */
    const clock = (x: number, y: number, t: string, col: string): void => {
      ctx.font = font(14);
      const bw = ctx.measureText('0').width * (t.length - 2) + 22 * u;
      plate(x, y, bw, 17 * u, DARK);
      ctx.textBaseline = 'middle';
      ticking(t, x + 9 * u, y + 9 * u, font(14), col);
      ctx.textBaseline = 'top';
    };
    if (w.kind === 'race') {
      const place = st.indexOf(P) + 1;
      const x = numeral(place, placeName(place).slice(-2), PLACE[Math.min(place, 4) - 1]!);
      // the lap on a white plate with a chequered end, the clock under it
      const lap = `${Math.min(Math.max(P.lap, 1), w.laps)}/${w.laps}`;
      ctx.font = font(15);
      const lw = ctx.measureText(lap).width;
      ctx.font = fine(9);
      const tw = ctx.measureText('LAP').width;
      const bw = 12 * u + tw + 5 * u + lw + 20 * u;
      plate(
        x,
        pad + 2 * u,
        bw,
        19 * u,
        shade(['#ffffff', '#f3f6ff', '#d9e3ff'], pad + 11 * u, 19 * u),
      );
      // (a chequered end: two columns of squares, leaning as the plate leans)
      ctx.fillStyle = INK;
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 2; c++)
          if ((r + c) % 2 === 0)
            ctx.fillRect(
              x + bw - 10 * u + c * 4 * u + (2.5 - r) * 1.6 * u,
              pad + 4 * u + r * 5 * u,
              4 * u,
              5 * u,
            );
      ctx.textBaseline = 'middle';
      plain('LAP', x + 10 * u, pad + 12 * u, fine(9), '#66709a');
      plain(lap, x + 14 * u + tw, pad + 12 * u, font(15), INK);
      ctx.textBaseline = 'top';
      clock(x - 3 * u, pad + 25 * u, fmtTime(w.raceTime), '#fff');
      // a tournament's aim for this round, beside the lap
      const aim = this.aim?.(w);
      if (aim) text(aim.text, x + bw + 12 * u, pad + 4 * u, small, aim.colour);
    } else {
      const n = w.cars.filter((c) => !c.wrecked).length;
      const x = numeral(n, 'LEFT', PLACE[n <= 2 ? 0 : 3]!);
      clock(
        x,
        pad + 12 * u,
        fmtTime(Math.max(0, w.timeLeft)),
        w.timeLeft < 20 ? '#ff8f80' : '#fff',
      );
    }
    // (watching, the gauges are the watched car's, so they wear its name)
    const watching = P !== w.player;
    const low = P.hp <= 25;
    bar(
      pad + 51 * u,
      P.hp / 100,
      P.hp > 50
        ? ['#a8f59a', '#3fbf45']
        : !low
          ? ['#ffe680', '#f0a01c']
          : // (nearly scrap: the bar beats)
            Math.sin(now * 11) > 0
            ? ['#ffb0a6', '#ff4a38']
            : ['#ff8f80', '#d1321f'],
      'shield',
    );
    bar(
      pad + 69 * u,
      P.nitro,
      P.boosting ? ['#ffffff', '#6fd0ff'] : ['#9be0ff', '#2f8fe6'],
      'bolt',
    );
    let cx = left - 2 * u;
    cx = chip(cx, pad + 88 * u, 'star', 'SCORE', String(P.score), SUN);
    // (this screen's own rounds are beside its FIRE button; a watched car's are here)
    if (P.gun && watching)
      cx = chip(
        cx,
        pad + 88 * u,
        'shell',
        'AMMO',
        String(P.rounds),
        P.rounds > 0 ? '#fff' : '#ff8f80',
      );
    if (watching) text(P.name, cx + 2 * u, pad + 90 * u, small, '#7fe0ff');
    // what is bolted on: the blade's seconds left, the leaps left in the springs
    const fitted = [
      P.blade ? `BLADE ${Math.ceil(P.blade.t)}s` : '',
      P.springs && P.springs.n > 0 ? `SPRINGS x${P.springs.n}` : '',
      ...guardLabels(P),
      // catch-up items at work on the car, its own or a rival's doing
      P.morph ? `${P.morph.def.kind === 'grow' ? 'BIG' : 'RUNT'} ${Math.ceil(P.morph.t)}s` : '',
      P.wind ? `WIND ${Math.ceil(P.wind.t)}s` : '',
      P.collar ? `COLLARED ${Math.ceil(P.collar.t)}s` : '',
      // tricks at work on the car, its own or a rival's doing
      ...trickLabels(P),
      // add-ons that run down or get used up; the rest can be seen on the car
      ...ADDON_KINDS.map((k) => {
        const f = P.fit[k];
        if (!f || (f.t <= 0 && f.n <= 0)) return '';
        const name = f.def.meta.name.toUpperCase();
        return f.t > 0 ? `${name} ${Math.ceil(f.t)}s` : f.n > 1 ? `${name} x${f.n}` : name;
      }),
    ]
      .filter(Boolean)
      .join('  ');
    if (fitted) text(fitted, left, pad + 108 * u, font(12), SUN);

    const m = this.mini;
    if (m) {
      const mx = W - m.cv.width - pad;
      const my = pad;
      ctx.drawImage(m.cv, mx, my);
      for (const c of w.cars) {
        if (c.wrecked && w.kind === 'derby') continue;
        const x = mx + 4 + c.x * m.k;
        const y = my + 4 + c.y * m.k;
        const me = c === w.player;
        if (me) {
          // this screen's own car: a ring that breathes round it, so it is found at a glance
          ctx.beginPath();
          ctx.arc(x, y, (6.2 + Math.sin(now * 5) * 1.1) * u, 0, TAU);
          ctx.lineWidth = 1.6 * u;
          ctx.strokeStyle = SUN;
          ctx.stroke();
        }
        // round dots with an ink line; this screen's own car bigger and white
        ctx.beginPath();
        ctx.arc(x, y, (me ? 4 : 2.8) * u, 0, TAU);
        ctx.fillStyle = me ? '#fff' : c.paint;
        ctx.fill();
        ctx.lineWidth = (me ? 1.8 : 1.3) * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        if (c === focus && !me) {
          // the car being watched wears a ring
          ctx.strokeStyle = '#7fe0ff';
          ctx.lineWidth = 1.6 * u;
          ctx.beginPath();
          ctx.arc(x, y, 5.6 * u, 0, TAU);
          ctx.stroke();
        }
      }
      // standings under the minimap: a leaning plate a car, its place on a tab of its own colour
      let y = pad + m.cv.height + 6 * u;
      const rw = Math.min(104 * u, m.cv.width - 4 * u);
      const rh = 12 * u;
      const rx = W - pad - rw - rh * 0.26;
      ctx.textBaseline = 'middle';
      // (six rows: of a bigger field, the six round this screen's car; fewer on a phone on its
      // side, where the FIRE button is not far under the map, and none where two would not fit)
      const room = W > H ? Math.floor((H - 205 * u - y) / (14 * u)) : 6;
      const rows = room < 2 ? 0 : Math.min(6, room);
      const from = Math.max(
        0,
        Math.min(st.length - rows, st.indexOf(focus ?? w.player) - (rows >> 1)),
      );
      for (let i = from; i < Math.min(from + rows, st.length); i++) {
        const c = st[i]!;
        const me = c === w.player;
        const out = c.wrecked && w.kind === 'derby';
        plate(
          rx,
          y,
          rw,
          rh,
          me ? SUN : c === focus ? '#7fe0ff' : out ? 'rgba(10,20,64,0.42)' : DARK,
          1.6 * u,
        );
        plate(rx, y, 15 * u, rh, out ? '#8d95a6' : c.paint, 1.6 * u);
        ctx.font = font(10);
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.6 * u;
        ctx.strokeStyle = INK;
        ctx.strokeText(String(i + 1), rx + 9 * u, y + rh / 2 + 0.5 * u);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(i + 1), rx + 9 * u, y + rh / 2 + 0.5 * u);
        plain(
          `${c.name}${out ? ' ✕' : ''}`,
          rx + 21 * u,
          y + rh / 2 + 0.5 * u,
          font(10),
          me || c === focus ? INK : out ? '#b9bfcc' : '#fff',
        );
        y += 14 * u;
      }
      ctx.textBaseline = 'top';
    }

    // what the world is doing: a chip for each modifier that is on
    if (w.mods.length) {
      ctx.font = font(10.5);
      const gap = 6 * u;
      const widths = w.mods.map((m) => ctx.measureText(m.def.label).width + 16 * u);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      w.mods.forEach((m, i) => {
        const bw = widths[i]!;
        pill(x, pad, bw, 17 * u, m.def.colour);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.roundRect(x + 4 * u, pad + 2.5 * u, bw - 8 * u, 4 * u, 2 * u);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.fillText(m.def.label, x + bw / 2, pad + 9.5 * u);
        x += bw + gap;
      });
      ctx.textBaseline = 'top';
    }

    // big centre messages
    ctx.textBaseline = 'middle';
    /** Words across the middle that land with a bounce: `age` seconds since they came up. */
    const shout = (
      t: string,
      y: number,
      px: number,
      cols: readonly [string, string, string],
      age: number,
      tilt = -0.035,
    ) => {
      const k = Math.min(1, age / 0.22);
      // (out past its size and back, like something thrown down)
      const pop = age < 0 ? 1 : 1 + (1 - k) * (1 - k) * 0.9 - Math.sin(k * Math.PI) * 0.08;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(tilt);
      ctx.scale(pop, pop);
      ctx.globalAlpha = Math.min(1, 0.25 + k);
      text(t, 0, 0, font(px), shade(cols, 0, px * u * 0.85), 'center');
      ctx.restore();
    };
    if (w.phase === 'countdown') {
      const n = Math.ceil(w.countdown);
      if (n <= 3) shout(String(n), H * 0.36, 84, LIGHTS[Math.max(1, n) - 1]!, n - w.countdown, 0);
      else {
        // the venue's name on a ribbon across the screen before the lights
        const name = w.venue.meta.name.toUpperCase();
        ctx.font = font(30);
        const bw = Math.min(W - 40 * u, ctx.measureText(name).width + 70 * u);
        plate(W / 2 - bw / 2 - 6 * u, H * 0.36 - 22 * u + 5 * u, bw, 46 * u, SUN, 0);
        plate(W / 2 - bw / 2 - 6 * u, H * 0.36 - 23 * u, bw, 46 * u, '#12227a', 3 * u);
        text(name, W / 2, H * 0.36 - 3 * u, font(30), '#fff', 'center');
        ctx.textBaseline = 'middle';
        plain(
          w.kind === 'race' ? `RACE · ${w.laps} LAPS` : 'DERBY · LAST CAR RUNNING',
          W / 2,
          H * 0.36 + 15 * u,
          fine(10),
          SUN,
          'center',
        );
      }
    }
    if (fx.msgT > 0 && fx.msg) {
      if (fx.msg !== this.msgWas || fx.msgT > this.msgLeft + 0.05) {
        this.msgWas = fx.msg;
        this.msgAt = now;
      }
      this.msgLeft = fx.msgT;
      const go = fx.msg === 'GO!';
      ctx.save();
      // (it goes as it came: quickly)
      ctx.globalAlpha = Math.min(1, fx.msgT / 0.18);
      shout(
        fx.msg,
        H * (go ? 0.36 : 0.3),
        go ? 84 : 36,
        go ? LIGHTS[0]! : PLACE[0]!,
        now - this.msgAt,
      );
      ctx.restore();
    } else this.msgWas = '';
    // off the course in a race: how long there is to get back before the car is put back
    const back = rescueIn(w, w.player);
    if (back > 0 && !w.player.wrecked) {
      text('GET BACK ON THE ROAD', W / 2, H * 0.22, font(26), '#ff9a4a', 'center');
      shout(String(Math.ceil(back)), H * 0.38, 64, PLACE[0]!, Math.ceil(back) - back, 0);
    }
    // a trick that takes the wheel out of your hands says so for as long as it lasts
    const T = w.player.tricks;
    if (!w.player.wrecked) {
      if (T.dizzy) text('DIZZY: STEERING SWAPPED', W / 2, H * 0.2, font(24), '#ffe870', 'center');
      else if (T.balloons) text('UP IN THE AIR', W / 2, H * 0.2, font(24), '#ff8a96', 'center');
      else if (T.dash) text('COMET', W / 2, H * 0.2, font(24), '#ffc040', 'center');
    }
    if (this.dial.on) this.speedo(P, W, H, u, ticking, watching);
    if (w.wrongWay()) {
      // (it beats, so it is seen)
      const beat = 1 + 0.06 * Math.sin(now * 12);
      ctx.save();
      ctx.translate(W / 2, H * 0.42);
      ctx.scale(beat, beat);
      text('WRONG WAY!', 0, 0, font(30), shade(LIGHTS[2]!, 0, 26 * u), 'center');
      ctx.restore();
    }
  }

  /** The speedometer's settings: shown or not, where, how big (game/speedo.ts). */
  dial: DialSetup = { ...DIAL_DEFAULT };

  /** How long each reason has been showing, so a passing bump does not flash a word. */
  private heldT = new Map<number, number>();
  private lastT = 0;

  /**
   * The speedometer (bottom middle unless moved): a dark glass dial with a fat arc that fills
   * with speed (blue on boost) to a bright tip, the number big in it, and under it, in red,
   * whatever is holding the car back.
   */
  private speedo(
    P: Car,
    W: number,
    H: number,
    ui: number,
    ticking: (t: string, x: number, y: number, f: string, col: Paint, mid?: boolean) => number,
    /** Looking on at another car: the bar along the bottom is there, so the dial stands over it. */
    watching = false,
  ): void {
    const ctx = this.ctx;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.lastT));
    this.lastT = now;
    // everything on the dial is drawn at its own size
    const u = ui * this.dial.size;
    const r = 40 * u;
    const spot = dialSpot(this.dial.place, W, H, r, ui);
    const cx = spot.x;
    const cy = spot.y - (watching && !spot.below ? WATCH_BAR * ui : 0);
    const top = BASE_SPEED * P.stats.speed;
    // the dial runs to a boost and a bit over the car's own top speed
    const full = top * 1.45;
    const v = P.wrecked && !haunting(P) ? 0 : dialSpeed(P);
    const k = Math.min(1, v / full);
    const a0 = Math.PI * 0.8;
    const a1 = Math.PI * 2.2;
    const held = P.wrecked ? 0 : P.held;
    for (const [bit] of HELD_SAYS) {
      const t = this.heldT.get(bit) ?? 0;
      this.heldT.set(bit, held & bit ? t + dt : Math.max(0, Math.min(t, 0.25) - dt));
    }
    const shown = HELD_SAYS.filter(([bit]) => (this.heldT.get(bit) ?? 0) > 0.25);
    const slowed = shown.length > 0;
    // the plate behind it: dark glass, lighter at the top, an ink line round it and a pale one in
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10 * u, Math.PI * 0.75, Math.PI * 2.25);
    ctx.closePath();
    const glass = ctx.createLinearGradient(0, cy - r - 10 * u, 0, cy + r);
    glass.addColorStop(0, 'rgba(23,48,154,0.82)');
    glass.addColorStop(1, 'rgba(10,20,64,0.72)');
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7.2 * u, Math.PI * 0.78, Math.PI * 2.22);
    ctx.lineWidth = u;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    // marks round the inside of the arc
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      ctx.moveTo(cx + Math.cos(a) * (r - 11 * u), cy + Math.sin(a) * (r - 11 * u));
      ctx.lineTo(cx + Math.cos(a) * (r - 8.4 * u), cy + Math.sin(a) * (r - 8.4 * u));
    }
    ctx.stroke();
    // the empty track of the arc with round ends, then the speed in it
    ctx.lineWidth = 10 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.strokeStyle = 'rgba(4,10,40,0.55)';
    ctx.stroke();
    ctx.lineCap = 'butt';
    // the car's own top speed, a tick on the arc
    const at = a0 + (a1 - a0) * (top / full);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(at) * (r - 7 * u), cy + Math.sin(at) * (r - 7 * u));
    ctx.lineTo(cx + Math.cos(at) * (r + 7 * u), cy + Math.sin(at) * (r + 7 * u));
    ctx.lineWidth = 2.5 * u;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    if (k > 0.005) {
      const end = a0 + (a1 - a0) * k;
      const col = P.boosting ? '#4fb8ff' : slowed ? '#ff5a3c' : k > 0.6 ? SUN : '#6bd65a';
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, end);
      ctx.lineCap = 'round';
      ctx.lineWidth = 8.4 * u;
      ctx.strokeStyle = col;
      ctx.stroke();
      // light along the outside of it, and a bright tip where the speed is
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2.2 * u, a0, end);
      ctx.lineWidth = 1.8 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(end) * r, cy + Math.sin(end) * r, 5.4 * u, 0, TAU);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.textBaseline = 'middle';
    // the number, a line round it and a shadow under, its digits ticking over in place
    const f = `italic 900 ${Math.round(29 * u)}px ${DISPLAY}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = INK;
    ctx.font = f;
    const cell = ctx.measureText('0').width;
    const digits = String(v);
    ctx.textAlign = 'center';
    for (let i = 0; i < digits.length; i++) {
      const x = cx + (i - (digits.length - 1) / 2) * cell;
      ctx.strokeText(digits[i]!, x, cy - 1 * u);
      ctx.strokeText(digits[i]!, x, cy + 1.6 * u);
    }
    ticking(digits, cx, cy - 2 * u, f, slowed ? '#ffb39e' : '#fff', true);
    ctx.font = `700 ${Math.round(8.5 * u)}px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#b9c8e6';
    ctx.fillText('KM/H', cx, cy + 18 * u);
    if (slowed) {
      // why it is slow, in a red chip above the dial that pulses so it is seen out of the eye's corner
      const say = shown.map(([, s]) => s).join(' · ');
      ctx.font = `italic 900 ${Math.round(12 * u)}px ${DISPLAY}`;
      const bw = ctx.measureText(say).width + 18 * u;
      const by = spot.below ? cy + r * 0.75 + 4 * u : cy - r - 32 * u;
      const pulse = 0.75 + 0.25 * Math.sin(now * 8);
      // (kept on the screen when the dial is in a corner)
      const bx = Math.min(W - bw / 2 - 4 * ui, Math.max(bw / 2 + 4 * ui, cx));
      ctx.beginPath();
      ctx.roundRect(bx - bw / 2, by, bw, 19 * u, 9.5 * u);
      ctx.fillStyle = `rgba(232,52,34,${(0.95 * pulse).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(say, bx, by + 10 * u);
    }
    ctx.textBaseline = 'top';
  }
}

/** What the tricks at work on a car are called on the status line. */
function trickLabels(c: Car): string[] {
  const T = c.tricks;
  const s = (t: number) => `${Math.ceil(t)}s`;
  return [
    T.balloons ? `BALLOONS ${s(T.balloons.t)}` : '',
    T.dash ? `COMET ${s(T.dash.t)}` : '',
    T.splat ? `MUDDY ${s(T.splat.t)}` : '',
    T.dizzy ? `DIZZY ${s(T.dizzy.t)}` : '',
    T.pair ? `MAGNET ${s(T.pair.t)}` : '',
    T.bumper ? `BOUNCY ${s(T.bumper.t)}` : '',
    T.ghost ? `GHOST ${s(T.ghost.t)}` : '',
  ];
}
