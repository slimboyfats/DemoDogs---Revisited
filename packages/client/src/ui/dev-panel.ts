import { guardLabels } from '../render/hud';
import {
  dropsBehind,
  isArms,
  rangeArms,
  rangeBlast,
  rangeDrop,
  rangeGive,
  rangeHit,
  rangeMend,
  rangeMine,
  rangeMove,
  rangeProp,
  rangeHowl,
  rangeArsenal,
  isArsenal,
  rangePulse,
  rangeRocket,
  rangeWreck,
  dig,
  plantTree,
  addModifier,
  removeModifier,
  rangeEvent,
  type Car,
  type Content,
} from '@demodogs/sim';
import type { Session } from '../game/session';
import { PITCH } from '../render/scene';

export type Tool =
  | 'drive'
  | 'rocket'
  | 'mine'
  | 'drop'
  | 'shock'
  | 'arms'
  | 'howl'
  | 'blast'
  | 'hit'
  | 'wreck'
  | 'mend'
  | 'give'
  | 'car'
  | 'prop'
  | 'crater'
  | 'tree'
  | 'world'
  | 'pan';

const TOOLS: [Tool, string, string][] = [
  ['drive', 'DRIVE', 'Drive the car as in a race'],
  ['rocket', 'ROCKET', 'Tap: the chosen rocket flies from your car towards that spot'],
  ['mine', 'MINE', 'Tap: lay a mine there'],
  ['drop', 'DROP', 'Tap: drop the chosen rear weapon there (smoke, tacks, glue, oil)'],
  ['shock', 'SHOCK', 'Tap: your car jumps there and lets off a shock pulse'],
  ['howl', 'HOWL', 'Tap: a howl goes off there, a shockwave that throws everything near it away'],
  ['arms', 'ARMS', 'Tap: your car turns to that spot and fires the chosen heavy weapon'],
  ['blast', 'BLAST', 'Tap: set off a blast there'],
  ['hit', 'HIT', 'Tap a car: a blow where you tapped it'],
  ['wreck', 'WRECK', 'Tap a car: wreck it'],
  ['mend', 'MEND', 'Tap a car: make it whole again'],
  ['car', 'MOVE CAR', 'Tap: the next parked car is put there'],
  ['prop', 'PROP', 'Tap: put the chosen prop there'],
  ['give', 'GIVE', 'Tap a car (or anywhere for yours): hand it the chosen pickup'],
  ['crater', 'CRATER', 'Tap: dig a pit there, to try leaps and blades over rough ground'],
  ['tree', 'BIG TREE', 'Tap: a great tree there, its crown leaning towards your car'],
  [
    'world',
    'WORLD',
    'Tap: the chosen world modifier strikes there (a bolt, a quake, scrap from the sky, a pool, a fire)',
  ],
  ['pan', 'PAN', 'Drag to move the camera'],
];
const RATES: [number, string][] = [
  [1, '1x'],
  [0.25, '1/4'],
  [0.05, '1/20'],
  [0, 'STOP'],
];

export interface DevHooks {
  /** What the screen shows: device px size and device px per art px. */
  view(): { w: number; h: number; scale: number; dpr: number };
  /** Start the range again in this car. */
  restart(car: string): void;
  exit(): void;
  /** Start or stop the performance recorder. */
  record(): void;
  /** Extra readouts from the renderer (slices drawn), if it has any. */
  stats(): string;
  /** Step the overdraw meter (heat maps, then numbers only, then off); the button's new label. */
  heat(): string;
  /** Step the sky (day, dusk, night, rain, storm, snow); the button's new label. */
  sky(): string;
}

/**
 * The test range's tools: pick one and tap the world to use it. Everything goes through the sim's
 * range functions, so weapons and damage behave exactly as they do in a race. Also on
 * `window.__dd.dev` for scripts.
 */
export class DevPanel {
  tool: Tool = 'drive';
  power = 0.9;
  private s: Session | null = null;
  private nextCar = 0;
  private readonly statsEl = document.createElement('div');
  private readonly toolBtns = new Map<Tool, HTMLButtonElement>();
  private readonly rateBtns: HTMLButtonElement[] = [];
  private readonly propSel = document.createElement('select');
  private readonly dropSel = document.createElement('select');
  readonly pickupSel = document.createElement('select');
  /** Which rocket the ROCKET tool fires (seekers, clusters). */
  readonly rocketSel = document.createElement('select');
  private readonly armsSel = document.createElement('select');
  private readonly carSel = document.createElement('select');
  /** Which world modifier the WORLD tool and the ON/OFF button act on. */
  readonly modSel = document.createElement('select');
  private modBtn: HTMLButtonElement | null = null;
  private fps = 60;

  constructor(
    private readonly root: HTMLElement,
    private readonly tap: HTMLElement,
    private readonly content: Content,
    private readonly hooks: DevHooks,
  ) {
    const btn = (label: string, title: string, on: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.onclick = on;
      root.append(b);
      return b;
    };
    const gap = () =>
      root.append(Object.assign(document.createElement('span'), { className: 'gap' }));
    for (const [t, label, title] of TOOLS)
      this.toolBtns.set(
        t,
        btn(label, title, () => this.pick(t)),
      );
    for (const d of [...content.weapon.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      if (dropsBehind(d.kind) && d.kind !== 'mine')
        this.dropSel.append(new Option(d.meta.name, d.id));
    this.dropSel.onchange = () => this.pick('drop');
    root.append(this.dropSel);
    for (const r of [...content.weapon.values()].filter((d) => d.kind === 'rocket'))
      this.rocketSel.append(new Option(r.meta.name, r.id));
    root.append(this.rocketSel);
    for (const d of [...content.weapon.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      if (isArms(d.kind) || isArsenal(d.kind)) this.armsSel.append(new Option(d.meta.name, d.id));
    this.armsSel.onchange = () => this.pick('arms');
    root.append(this.armsSel);
    for (const p of [...content.prop.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      this.propSel.append(new Option(p.meta.name, p.id));
    root.append(this.propSel);
    for (const p of [...content.pickup.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      this.pickupSel.append(new Option(p.meta.name, p.id));
    root.append(this.pickupSel);
    for (const m of [...content.modifier.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      this.modSel.append(new Option(m.meta.name, m.id));
    this.modSel.onchange = () => this.modLabel();
    root.append(this.modSel);
    this.modBtn = btn('SWITCH ON', 'Switch the chosen world modifier on or off', () =>
      this.toggleMod(this.modSel.value),
    );
    gap();
    const power = Object.assign(document.createElement('input'), {
      type: 'range',
      min: '0.2',
      max: '1.6',
      step: '0.1',
      value: String(this.power),
    });
    power.oninput = () => (this.power = Number(power.value));
    root.append(Object.assign(document.createElement('label'), { textContent: 'POWER' }), power);
    gap();
    RATES.forEach(([, label], i) =>
      this.rateBtns.push(btn(label, 'Game speed', () => this.setRate(i))),
    );
    btn('STEP', 'One tick forward while stopped', () => this.s?.step());
    gap();
    btn('MEND ALL', 'Make every car whole again', () => this.mendAll());
    for (const c of [...content.car.values()].sort((a, b) => (a.id < b.id ? -1 : 1)))
      this.carSel.append(new Option(`Drive ${c.meta.name}`, c.id));
    this.carSel.onchange = () => hooks.restart(this.carSel.value);
    root.append(this.carSel);
    btn('REC', 'Record performance; press again to stop and save the log', () => hooks.record());
    const od = btn(
      'OVERDRAW',
      'Fragments per pixel: heat maps of written, solid, covered and particle fragments, then the numbers alone',
      () => (od.textContent = hooks.heat()),
    );
    const sk = btn(
      'SKY DAY',
      'The sky: day, dusk, night (headlamps), rain and storm (wet ground and reflections), snow',
      () => (sk.textContent = hooks.sky()),
    );
    btn('EXIT', 'Back to the menu', () => hooks.exit());
    this.statsEl.className = 'stats';
    root.append(this.statsEl);

    let drag: { id: number; x: number; y: number } | null = null;
    tap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.tool === 'pan') {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        tap.setPointerCapture(e.pointerId);
      } else this.use(...this.toWorld(e.clientX, e.clientY));
    });
    tap.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId || !this.s) return;
      const v = hooks.view();
      this.s.cam.x -= ((e.clientX - drag.x) * v.dpr) / v.scale;
      this.s.cam.y -= ((e.clientY - drag.y) * v.dpr) / (v.scale * Math.sin(PITCH));
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    const end = () => (drag = null);
    tap.addEventListener('pointerup', end);
    tap.addEventListener('pointercancel', end);
  }

  /** The point on the ground under a point of the screen (CSS px). */
  toWorld(cx: number, cy: number): [number, number] {
    const v = this.hooks.view();
    const s = this.s!;
    return [
      s.cam.x + (cx * v.dpr - v.w / 2) / v.scale,
      s.cam.y + (cy * v.dpr - v.h / 2) / (v.scale * Math.sin(PITCH)),
    ];
  }

  /** Take over a fresh range: line the parked cars up in front of the player's. */
  open(s: Session, car: string): void {
    this.s = s;
    this.nextCar = 0;
    this.carSel.value = car;
    const P = s.world.player;
    P.h = 0;
    const others = s.world.cars.filter((c) => c !== P);
    others.forEach((c, i) =>
      rangeMove(c, P.x + 70 + Math.floor(i / 3) * 50, P.y + ((i % 3) - 1) * 38, Math.PI / 2),
    );
    s.cam.x = P.x + 45;
    s.cam.y = P.y;
    this.root.classList.remove('hidden');
    this.pick('drive');
    this.setRate(0);
    this.modLabel();
  }

  close(): void {
    this.s = null;
    this.root.classList.add('hidden');
    this.tap.classList.add('hidden');
  }

  pick(t: Tool): void {
    this.tool = t;
    for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t);
    this.tap.classList.toggle('hidden', t === 'drive');
    if (this.s) this.s.follow = t === 'drive';
  }

  /** Switch a world modifier on or off (by content id). */
  toggleMod(id: string): void {
    const def = this.content.modifier.get(id);
    if (!this.s || !def) return;
    if (!removeModifier(this.s.world, id)) addModifier(this.s.world, def);
    this.modLabel();
  }

  private modLabel(): void {
    const on = this.s?.world.mods.some((m) => m.def.id === this.modSel.value);
    if (this.modBtn) this.modBtn.textContent = on ? 'SWITCH OFF' : 'SWITCH ON';
    this.modBtn?.classList.toggle('on', !!on);
  }

  setRate(i: number): void {
    if (this.s) this.s.rate = RATES[i]![0];
    this.rateBtns.forEach((b, k) => b.classList.toggle('on', k === i));
  }

  mendAll(): void {
    if (this.s) for (const c of this.s.world.cars) rangeMend(this.s.world, c);
  }

  private carAt(x: number, y: number): Car | null {
    let best: Car | null = null;
    let bd = 24;
    for (const c of this.s!.world.cars) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** Use the chosen tool (or the one named) at a point on the ground. */
  use(x: number, y: number, tool: Tool = this.tool): void {
    const s = this.s;
    if (!s) return;
    const w = s.world;
    const P = w.player;
    const weapon = (kind: string) => [...this.content.weapon.values()].find((d) => d.kind === kind);
    switch (tool) {
      case 'rocket': {
        const def = this.content.weapon.get(this.rocketSel.value) ?? weapon('rocket');
        const h = Math.atan2(y - P.y, x - P.x);
        if (def) rangeRocket(w, def, P, P.x + Math.cos(h) * 15, P.y + Math.sin(h) * 15, h);
        break;
      }
      case 'mine': {
        const def = weapon('mine');
        if (def) rangeMine(w, def, P, x, y);
        break;
      }
      case 'drop': {
        const def = this.content.weapon.get(this.dropSel.value);
        if (def) rangeDrop(w, def, P, x, y, Math.atan2(y - P.y, x - P.x));
        break;
      }
      case 'shock': {
        const def = weapon('pulse');
        if (def) {
          rangeMove(P, x, y);
          rangePulse(w, def, P);
        }
        break;
      }
      case 'howl': {
        const def = weapon('howl');
        if (def) rangeHowl(w, def, P, x, y);
        break;
      }
      case 'arms': {
        const def = this.content.weapon.get(this.armsSel.value);
        if (def && isArsenal(def.kind)) rangeArsenal(w, def, P, x, y);
        else if (def) rangeArms(w, def, P, x, y);
        break;
      }
      case 'blast':
        rangeBlast(w, x, y, this.power);
        break;
      case 'hit': {
        const c = this.carAt(x, y);
        if (c) rangeHit(w, c, 30 * this.power, x, y);
        break;
      }
      case 'wreck': {
        const c = this.carAt(x, y);
        if (c) rangeWreck(w, c);
        break;
      }
      case 'mend': {
        const c = this.carAt(x, y);
        if (c) rangeMend(w, c);
        break;
      }
      case 'car': {
        const others = w.cars.filter((c) => c !== P);
        const c = others[this.nextCar++ % others.length];
        if (c) rangeMove(c, x, y);
        break;
      }
      case 'prop': {
        const def = this.content.prop.get(this.propSel.value);
        // a tile points the way you are facing, so you can drive straight onto it
        if (def) rangeProp(w, def, x, y, def.pad ? P.h : 0);
        break;
      }
      case 'give': {
        const def = this.content.pickup.get(this.pickupSel.value);
        if (def) rangeGive(w, this.carAt(x, y) ?? P, def);
        break;
      }
      case 'world': {
        const def = this.content.modifier.get(this.modSel.value);
        if (def) rangeEvent(w, def, x, y);
        this.modLabel();
        break;
      }
      case 'crater':
        dig(w, x, y, 2 + this.power * 4);
        break;
      case 'tree': {
        // the parts of a great tree, from whichever venue grows them
        for (const v of this.content.venue.values())
          for (const r of v.scenery)
            if (r.rule === 'canopy') {
              plantTree(w, r, x, y, Math.atan2(P.y - y, P.x - x));
              return;
            }
        break;
      }
      default:
        break;
    }
  }

  /** Once a frame: the readouts. */
  frame(dt: number): void {
    const s = this.s;
    if (!s) return;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const hp = s.world.cars
      .map(
        (c) =>
          `${c.def.meta.name} ${c.wrecked ? 'wrecked' : Math.ceil(c.hp)}` +
          (c.shield > 0 ? ` shield ${Math.ceil(c.shield)}` : '') +
          (c.weldT > 0 ? ' welding' : '') +
          guardLabels(c)
            .map((g) => ` ${g.toLowerCase()}`)
            .join('') +
          (c.size !== 1 ? ` size ${c.size.toFixed(2)}` : '') +
          (c.pace !== 1 ? ` pace ${c.pace.toFixed(2)}` : ''),
      )
      .join('  ');
    this.statsEl.textContent =
      `${this.fps.toFixed(0)} fps  ${this.hooks.stats()}  loose blocks ${s.fx.voxels.length}  ` +
      `particles ${s.fx.fx.length}  fires ${s.fx.fires.length}\n${hp}` +
      (s.world.mods.length ? `\nworld: ${s.world.mods.map((m) => m.def.label).join(' ')}` : '');
  }
}
