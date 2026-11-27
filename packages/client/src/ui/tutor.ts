import { rangeGive, rangeMend, rangeMove, type Car, type World } from '@demodogs/sim';
import { DISPLAY } from '../render/type';
import {
  CHEERS,
  Lesson,
  RING,
  STEPS,
  words,
  type Seen,
  type Spot,
  type StepId,
} from '../game/lesson';
import type { Session } from '../game/session';
import type { Input } from '../input/input';
import type { Sound } from '../audio/sound';
import type { Projector } from '../render/overlay';
import { PITCH } from '../render/scene';

const INK = '#0a1440';
const SUN = '#ffd60a';
const PAPER = '#fff8e6';
const TAU = Math.PI * 2;

export interface TutorActions {
  /** SKIP LESSON was pressed. */
  skip(): void;
  /** Every step is done: time for the last card. */
  finished(): void;
}

/** The button (and the key hint) each step is about. */
const PADS: Partial<Record<StepId, { pad: string; hint: string }>> = {
  drive: { pad: '', hint: '.khDrive' },
  brake: { pad: 'btnBrake', hint: '.khRow:not(.fire):not(.boost):not(.names)' },
  boost: { pad: 'btnBoost', hint: '.khRow.boost' },
  drift: { pad: 'btnBrake', hint: '.khRow:not(.fire):not(.boost):not(.names)' },
  fire: { pad: 'btnFire', hint: '#khFire' },
};

/**
 * The driving lesson on screen: a card that says what to do now in big letters, rings on the
 * ground and arrows over the crate and the targets, the one button the step is about lit up
 * (the others stay away until their turn), a cheer when a step is done, and SKIP. It also puts
 * the lesson's things in its world, a test range like the dev panel's: the crate, the parked
 * targets, a full tank. The world's own rules do everything else.
 */
export class Tutor {
  private readonly root = document.getElementById('tutor')!;
  private readonly title = document.getElementById('tutTitle')!;
  private readonly sub = document.getElementById('tutSub')!;
  private readonly dots = document.getElementById('tutDots')!;
  private readonly meter = document.getElementById('tutMeter')!;
  private readonly fill = this.meter.querySelector('b')!;
  private readonly cheer = document.getElementById('tutCheer')!;
  private readonly hand = document.getElementById('tutHand')!;
  private lesson: Lesson | null = null;
  private session: Session | null = null;
  private input: Input | null = null;
  private targets: Car[] = [];
  private keys = false;
  private driven = false;
  private readonly stick = document.getElementById('stickBase')!;
  private readonly card = document.getElementById('tutCard')!;
  /** The card's bottom edge in CSS px: arrows at the screen's edge keep below it. */
  private under = 0;
  private t = 0;
  /** What the card last said, so the DOM is only written when it changes. */
  private said = '';

  constructor(
    private readonly sound: Sound,
    private readonly act: TutorActions,
  ) {
    for (let i = 0; i < STEPS.length; i++) this.dots.append(document.createElement('i'));
    const skip = document.getElementById('tutSkip')!;
    // (on the click, like the spectator's SKIP: a press would swap the screen under the finger)
    skip.addEventListener('pointerdown', (e) => e.stopPropagation());
    skip.addEventListener('click', () => this.act.skip());
  }

  get shown(): boolean {
    return this.lesson !== null;
  }

  /** The step that is on (for scripts), or null once the lesson is over or shut. */
  get step(): StepId | null {
    return this.lesson?.step ?? null;
  }

  /** Where the lesson stands, for scripts that drive it: the step's things and the ring that is next. */
  get state(): { step: StepId | null; ring: number; cheering: boolean; spots: Spot[] } | null {
    const L = this.lesson;
    return L ? { step: L.step, ring: L.ring, cheering: L.cheer > 0, spots: L.spots } : null;
  }

  /** Begin the lesson in a session built on the lesson's lawn (`start`: at that step). */
  open(s: Session, input: Input, start = 0): void {
    const w = s.world;
    this.session = s;
    this.input = input;
    this.targets = w.cars.filter((c) => c !== w.player);
    // one crate, the lesson's own, kept out of the way until its step
    w.pickups.length = Math.min(1, w.pickups.length);
    this.shelve(w);
    const O = w.oval ?? { cx: w.w / 2, cy: w.h / 2, rx: w.w / 2, ry: w.h / 2 };
    this.lesson = new Lesson(O, this.see(), start);
    this.t = 0;
    this.said = '';
    this.driven = false;
    this.root.classList.remove('hidden');
    document.body.classList.add('tutor');
    this.stage();
  }

  close(): void {
    if (!this.lesson) return;
    this.lesson = this.session = this.input = null;
    this.targets = [];
    this.root.classList.add('hidden');
    document.body.classList.remove('tutor');
    this.light(null);
  }

  private shelve(w: World): void {
    const p = w.pickups[0];
    if (!p) return;
    p.on = false;
    // (far enough back that it never comes round again by itself)
    p.t = -1e9;
  }

  private see(): Seen {
    const w = this.session!.world;
    const P = w.player;
    return {
      x: P.x,
      y: P.y,
      h: P.h,
      brake: this.input?.last.brake ?? false,
      boosting: P.boosting,
      charge: P.charge,
      armed: P.weapon !== null && P.ammo > 0,
      wrecks: this.targets.reduce((n, c) => n + (c.wrecked ? 1 : 0), 0),
    };
  }

  /** Hand the player the lesson crate's rockets, as if a crate had been driven through. */
  private arm(w: World): void {
    const def = w.content.pickup.get(w.venue.pickups[0]!);
    if (def) rangeGive(w, w.player, def);
  }

  /** Put the new step's things in the world. */
  private stage(): void {
    const L = this.lesson!;
    const w = this.session!.world;
    const P = w.player;
    const s = L.step;
    this.shelve(w);
    if (s === 'boost') P.nitro = 1;
    else if (s === 'crate') {
      const p = w.pickups[0];
      const at = L.spots[0];
      if (p && at) Object.assign(p, { x: at.x, y: at.y, on: true, t: 0 });
      // (a lawn with no crate to give: nothing to wait for)
      else this.arm(w);
    } else if (s === 'fire') {
      this.targets.forEach((c, i) => {
        const at = L.spots[i];
        if (!at) return;
        rangeMend(w, c);
        // side on to the player, and one rocket from scrap: the first shot is a bang
        rangeMove(c, at.x, at.y, Math.atan2(at.y - P.y, at.x - P.x) + Math.PI / 2);
        c.hp = 6;
      });
      if (!P.weapon) this.arm(w);
    }
    this.light(s);
  }

  /** Light the step's button and key hint; buttons of steps still to come stay away. */
  private light(s: StepId | null): void {
    const at = s ? STEPS.indexOf(s) : -1;
    for (const id of STEPS) {
      const k = PADS[id];
      if (!k) continue;
      const pad = k.pad ? document.getElementById(k.pad) : null;
      const hint = document.querySelector(`#keyHints ${k.hint}`);
      pad?.classList.toggle('teach', id === s);
      pad?.classList.toggle('taught', s !== null && STEPS.indexOf(id) < at);
      hint?.classList.toggle('teach', id === s);
    }
    document.body.dataset.lesson = s ?? '';
  }

  /** One frame: move the lesson on, write the card, draw the rings and arrows over the world. */
  frame(
    ctx: CanvasRenderingContext2D,
    P: Projector,
    W: number,
    H: number,
    u: number,
    dt: number,
  ): void {
    const L = this.lesson;
    const s = this.session;
    if (!L || !s) return;
    const w = s.world;
    // nobody is scrapped in a lesson: a car driven to bits is whole again where it stands
    if (w.player.wrecked) rangeMend(w, w.player);
    this.t += dt;
    const was = L.step;
    const change = dt > 0 ? L.update(this.see(), dt) : null;
    if (change === 'ring') this.sound.beep(true);
    else if (change === 'cheer') {
      this.sound.repair();
      if (was) this.cheer.textContent = CHEERS[was];
      this.light(null);
    } else if (change === 'rearm') this.arm(w);
    else if (change === 'step') this.stage();
    else if (change === 'done') {
      this.act.finished();
      return;
    }
    this.write(L, w);
    this.draw(ctx, P, W, H, u, L, w);
  }

  private write(L: Lesson, w: World): void {
    const step = L.step;
    if (!step) return;
    // thumbs on glass, or a keyboard: whichever was last used
    this.keys =
      document.body.classList.contains('kbd') ||
      matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cheering = L.cheer > 0;
    const key = `${step}|${this.keys}|${L.missed}|${cheering}`;
    if (key !== this.said) {
      this.said = key;
      const say = words(step, this.keys, L.missed);
      this.title.textContent = say.title;
      this.sub.textContent = say.sub;
      [...this.dots.children].forEach((d, i) => {
        d.className =
          i < L.index || (i === L.index && cheering) ? 'done' : i === L.index ? 'on' : '';
      });
      this.root.classList.toggle('cheering', cheering);
      this.cheer.classList.toggle('go', cheering);
      this.driven = this.driven && step === 'drive';
      // the tank itself on the boost step; how far along on the others that are measured
      this.meter.classList.toggle('hidden', step === 'crate' || step === 'fire');
      this.meter.classList.toggle('tank', step === 'boost');
    }
    this.under = this.card.getBoundingClientRect().bottom;
    const v = step === 'boost' && !cheering ? w.player.nitro : L.progress;
    this.fill.style.width = `${Math.round(v * 100)}%`;
    // the ghost thumb shows where to put a thumb, and goes for good once one is down
    this.driven ||= this.stick.classList.contains('on');
    this.hand.classList.toggle('hidden', step !== 'drive' || this.keys || cheering || this.driven);
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    P: Projector,
    W: number,
    H: number,
    u: number,
    L: Lesson,
    w: World,
  ): void {
    if (L.cheer > 0) return;
    const step = L.step;
    const k = P.sx(1) - P.sx(0);
    const beat = 0.5 + 0.5 * Math.sin(this.t * 7);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (step === 'drive') {
      // later rings first, so the one to drive at is on top
      for (let i = L.spots.length - 1; i >= L.ring; i--) {
        const g = L.spots[i]!;
        const next = i === L.ring;
        const sx = P.sx(g.x);
        const sy = P.sy(g.y, P.rise(g.x, g.y));
        const r = RING * k * (next ? 0.86 + 0.14 * beat : 0.8);
        ctx.globalAlpha = next ? 1 : 0.55;
        ctx.beginPath();
        ctx.ellipse(sx, sy, r, r * Math.sin(PITCH), 0, 0, TAU);
        ctx.fillStyle = next ? 'rgba(255,210,63,0.3)' : 'rgba(255,248,230,0.18)';
        ctx.fill();
        ctx.lineWidth = (next ? 9 : 7) * u;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.lineWidth = (next ? 5 : 3) * u;
        ctx.strokeStyle = next ? SUN : PAPER;
        ctx.stroke();
        this.label(ctx, String(i + 1), sx, sy, (next ? 26 : 18) * u, next ? SUN : PAPER);
        ctx.globalAlpha = 1;
        if (next) this.point(ctx, sx, sy - r * Math.sin(PITCH) - 14 * u, W, H, u, beat, '');
      }
    } else if (step === 'crate') {
      const p = w.pickups[0];
      if (p?.on)
        this.point(ctx, P.sx(p.x), P.sy(p.y, 22 + P.rise(p.x, p.y)), W, H, u, beat, 'CRATE');
    } else if (step === 'fire') {
      for (const c of this.targets) {
        if (c.wrecked) continue;
        this.point(ctx, P.sx(c.x), P.sy(c.y, 24 + P.rise(c.x, c.y)), W, H, u, beat, 'TARGET');
      }
    }
    ctx.restore();
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    px: number,
    col: string,
  ): void {
    ctx.font = `italic 900 ${Math.round(px)}px ${DISPLAY}`;
    ctx.lineWidth = Math.max(4, px * 0.26);
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y + px * 0.08);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  }

  /**
   * A fat bouncing arrow at a thing: over it when it is on screen, at the screen's edge and
   * pointing its way when it is not.
   */
  private point(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    W: number,
    H: number,
    u: number,
    beat: number,
    name: string,
  ): void {
    // (clear of the card along the top and the buttons along the bottom)
    const m = 46 * u;
    const top = (this.under + 30) * u;
    const on = x > m && x < W - m && y > top && y < H - m;
    let ax = x;
    let ay = y - (8 + 9 * beat) * u;
    let turn = Math.PI / 2;
    if (!on) {
      turn = Math.atan2(y - H / 2, x - W / 2);
      ax = Math.min(W - m, Math.max(m, x));
      ay = Math.min(H - m, Math.max(top, y));
      ax -= Math.cos(turn) * 8 * beat * u;
      ay -= Math.sin(turn) * 8 * beat * u;
    }
    const size = (on ? 15 : 19) * u;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(turn);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.2, -size * 0.95);
    ctx.lineTo(-size * 0.2, -size * 0.4);
    ctx.lineTo(-size * 1.1, -size * 0.4);
    ctx.lineTo(-size * 1.1, size * 0.4);
    ctx.lineTo(-size * 0.2, size * 0.4);
    ctx.lineTo(-size * 0.2, size * 0.95);
    ctx.closePath();
    ctx.lineWidth = 5 * u;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = SUN;
    ctx.fill();
    ctx.restore();
    if (name && on) this.label(ctx, name, ax, ay - size * 1.9, 13 * u, PAPER);
  }
}
