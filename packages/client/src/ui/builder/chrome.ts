import {
  RAISE_LEVELS,
  RAISE_MAX,
  RAISE_MIN,
  RAISE_STEP,
  type RaisedEdge,
  type RaisedLanes,
  type SceneryRule,
  SIZE_STEP,
  sizeStep,
} from '@demodogs/shared';
import { dressingOf, type Content } from '@demodogs/sim';
import { levelHeight, slopeOf, type Slope } from '../../game/track-edit';
import { pickTrackFile, saveTrackFile } from '../../game/tracks';
import { SKIES } from '../../render/atmosphere';
import { TURN, type LevelBuilder, type Tool } from './builder';
import { button, choice, h, part, slider, stepper } from './dom';
import { Profile } from './profile';

/** The rail of tools: what each is called, its sign, its key, and the tools it stands for. */
const RAIL: { id: string; sign: string; name: string; key: string; tools: Tool[] }[] = [
  { id: 'select', sign: 'select', name: 'SELECT', key: 'V', tools: ['hand'] },
  { id: 'road', sign: 'road', name: 'ROAD', key: 'R', tools: ['road'] },
  { id: 'raise', sign: 'raise', name: 'RAISE', key: 'H', tools: ['raise'] },
  { id: 'surface', sign: 'surface', name: 'SURFACE', key: 'S', tools: ['surface'] },
  { id: 'bridge', sign: 'bridge', name: 'BRIDGE', key: 'B', tools: ['bridge'] },
  { id: 'things', sign: 'things', name: 'THINGS', key: 'T', tools: ['place'] },
  { id: 'ground', sign: 'ground', name: 'GROUND', key: 'G', tools: ['area', 'pool'] },
  { id: 'erase', sign: 'erase', name: 'ERASE', key: 'X', tools: ['erase'] },
];

/** What to do with each tool, said once when it is picked and kept at the top of its panel. */
const TIPS: Record<Tool, string> = {
  hand: 'Tap anything to pick it, drag it to move it. Drag the ground to slide the map.',
  road: 'Drag a point to bend the road. Tap the road for a new point.',
  raise:
    'Drag along the road to raise it. Hold a finger on it, then drag up or down, to set how high.',
  surface: 'Pick a surface, then drag along the road to lay it.',
  bridge: 'Tap the road to put a bridge there. Drag it along the road, or by its ends.',
  place: 'Tap the map to put one down, or drag one out of the list.',
  area: 'Pick the ground and the weather, then tap the map to lay an area.',
  pool: 'Pick what it is made of, then tap the map to lay a pool.',
  erase: 'Tap anything you put down, or a road point, to take it away.',
};
const PENCIL_TIP =
  'Draw with a finger: a whole loop for a new road, or from the road to the road for a new way.';

const SIZES: [string, number, number][] = [
  ['SMALL', 1200, 840],
  ['MEDIUM', 1400, 960],
  ['LARGE', 1800, 1240],
  ['HUGE', 2400, 1640],
  ['VAST', 3200, 2200],
];

const EDGES: [RaisedEdge, string][] = [
  ['rail', 'RAILS'],
  ['wall', 'WALLS'],
  ['open', 'OPEN'],
];
const LANES: [RaisedLanes, string][] = [
  ['both', 'BOTH'],
  ['left', 'LEFT'],
  ['right', 'RIGHT'],
  ['none', 'NONE'],
];
const SLOPE_NAMES: [Slope, string][] = [
  ['steep', 'STEEP'],
  ['medium', 'MEDIUM'],
  ['gentle', 'GENTLE'],
];

/** What the keys do, for the sheet that lists them. */
const KEYS: [string, string][] = [
  ['V R H S B T G X', 'The tools, top to bottom (or 1 to 8)'],
  ['Right click', 'Pick whatever is under the pointer'],
  ['Wheel, + and -', 'Zoom'],
  ['Space or middle button, drag', 'Slide the map'],
  ['0 or F', 'The whole map'],
  ['Arrows', 'Move what is picked (Shift: further); slide the map'],
  ['Arrows on raised road', 'Up and down: its height. Left and right: its levels'],
  ['[ and ]', 'Turn a thing'],
  [', and .', 'Make a thing smaller or bigger'],
  ['Ctrl D', 'Another of the thing picked'],
  ['Delete', 'Take what is picked away'],
  ['Ctrl Z, Ctrl Shift Z', 'Step back, and forward again'],
  ['D', 'With ROAD: the pencil'],
  ['M', 'Snap on and off'],
  ['Tab', 'Put the panel away, and bring it back'],
  ['Enter', 'Test drive'],
  ['Esc', 'Let go'],
];

/** A sky's name as the weather chips show it. */
export const skyLabel = (name: string): string =>
  name === 'day' ? 'CLEAR DAY' : name.toUpperCase().replace('-', ' AT ');

/** What a dressing rule does, in a few words, for its switch. */
function ruleLabel(content: Content, r: unknown): string {
  const rule = r as Partial<SceneryRule> & { rule?: string; material?: string; on?: string };
  const names: Record<string, string> = {
    'bend-wall': 'Walls on the bends',
    canopy: 'Giant trees',
    build: 'Buildings',
    arch: 'Arches over the road',
    barricade: 'Barricades across the road',
    scatter: 'Trees, rocks and scrap',
    roadside: 'Cones, crates and drums',
    border: 'Fence round the map',
    towers: 'Tower blocks',
    field: 'Fields beside the road',
    kerb: 'Things along the kerb',
    gantry: 'Start line gantry',
    trackside: 'Fences and stands by the road',
    along: 'Track pieces along the road',
    ring: 'A ring of things',
    river: 'A river',
    harbour: 'The harbour',
    stacks: 'Stacks of scrap',
    overpass: 'A bridge over the road',
    flyover: 'A bridge over the road',
  };
  if (rule.rule === 'patches') {
    const m = content.material.get(rule.material ?? '')?.meta.name ?? 'Pools';
    return `${m} ${rule.on === 'road' ? 'on the road' : 'off the road'}`;
  }
  return names[rule.rule ?? ''] ?? String(rule.rule ?? 'Scenery');
}

type Tab = 'track' | 'scenery' | 'share' | 'keys';

/**
 * The level builder's buttons: a rail of tools down one edge, a bar over the map (back, the
 * track's name, undo, redo), a few for the view, and one panel that holds whatever goes with the
 * tool in hand or the thing picked, each choice a button with its own name. On a screen on its
 * side the rail is down the left and the panel down the right; upright, the panel lies along the
 * bottom over the rail. It asks the builder to do things and draws what the builder says is so.
 */
export class Chrome {
  private readonly rail = h('nav', { className: 'rail' });
  private readonly bar = h('div', { className: 'topbar' });
  private readonly note = h('div', { className: 'say' });
  private readonly pane = h('aside', { className: 'pane' });
  private readonly title = h('h2');
  private readonly head = h('div', { className: 'head' });
  private readonly body = h('div', { className: 'body' });
  private readonly top = h('div', { className: 'ctl' });
  private readonly end = h('div', { className: 'ctl' });
  private readonly sheet = h('div', { className: 'setup hidden' });
  readonly profile: Profile;
  private readonly railBtns = new Map<string, HTMLButtonElement>();
  private readonly name: HTMLButtonElement;
  private readonly undo: HTMLButtonElement;
  private readonly redo: HTMLButtonElement;
  private readonly drives: HTMLButtonElement[] = [];
  private readonly snap: HTMLButtonElement;
  private readonly fold: HTMLButtonElement;
  private readonly done: HTMLButtonElement;
  /** The ground tool last in hand: what the GROUND button takes out. */
  private ground: Tool = 'area';
  private noteT = 0;
  private tab: Tab = 'track';
  private said = '';
  isShut = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly b: LevelBuilder,
  ) {
    RAIL.forEach((r, i) => {
      // (a second tap on the tool in hand lets go of what is picked, to start afresh with it)
      const take = (): void => {
        const tool = this.toolOf(r.id);
        if (b.tool === tool && b.sel) b.select(null);
        else b.pick(tool);
      };
      const btn = button(r.name, take, {
        sign: r.sign,
        title: `${r.name}: ${TIPS[r.tools[0]!]}`,
        key: `${r.key} or ${i + 1}`,
      });
      btn.dataset.rail = r.id;
      this.railBtns.set(r.id, btn);
      this.rail.append(btn);
    });
    this.name = button('', () => this.openSheet('track'), {
      title: 'Name, look, laps, map size, scenery, sharing',
      act: 'setup',
    });
    this.name.className = 'name';
    this.undo = button('', () => b.undo(), {
      sign: 'undo',
      title: 'Step back',
      key: 'Ctrl Z',
      act: 'undo',
    });
    this.redo = button('', () => b.redo(), {
      sign: 'redo',
      title: 'Step forward again',
      key: 'Ctrl Shift Z',
      act: 'redo',
    });
    const drive = (mini: boolean): HTMLButtonElement => {
      const d = button(mini ? 'DRIVE' : 'TEST DRIVE', () => b.testDrive(), {
        sign: 'play',
        title: 'Drive it now, then come straight back',
        key: 'Enter',
        act: 'drive',
        kind: 'go',
      });
      d.classList.add('drive');
      this.drives.push(d);
      return d;
    };
    this.bar.append(
      button('', () => b.hooks.exit(), { sign: 'back', title: 'Back to your tracks', act: 'exit' }),
      this.name,
      this.undo,
      this.redo,
      drive(true),
    );
    this.snap = button('', () => b.setSnap(!b.snap), {
      sign: 'magnet',
      title: 'Snap: things settle on a grid, and on the road in its lanes',
      key: 'M',
      act: 'snap',
    });
    const view = h(
      'div',
      { className: 'view' },
      button('', () => b.zoomBy(1.5), {
        sign: 'plus',
        title: 'Closer (or pinch)',
        key: '+',
        act: 'in',
      }),
      button('', () => b.zoomBy(1 / 1.5), {
        sign: 'minus',
        title: 'Further out (or pinch)',
        key: '-',
        act: 'out',
      }),
      button('', () => b.fit(), { sign: 'fit', title: 'The whole map', key: '0', act: 'fit' }),
      this.snap,
    );
    this.fold = button('', () => this.shut(!this.isShut), {
      sign: 'panel',
      title: 'Put the panel away, or bring it back',
      key: 'Tab',
      act: 'panel',
    });
    this.fold.classList.add('fold');
    this.done = button('', () => b.select(null), {
      sign: 'close',
      title: 'Let go of it',
      key: 'Esc',
      act: 'done',
    });
    this.head.append(this.title, this.done, this.fold);
    this.profile = new Profile(b);
    this.body.append(this.profile.root, this.top, b.cat.root, this.end);
    this.pane.append(this.head, this.body, h('div', { className: 'foot' }, drive(false)));
    // a tap that lands on the panel never falls through to the map under it
    for (const e of [this.pane, this.rail, this.bar, view, this.sheet])
      e.addEventListener('contextmenu', (ev) => ev.preventDefault());
    this.sheet.addEventListener('pointerdown', (e) => {
      if (e.target === this.sheet) this.closeSheet();
    });
    root.append(this.rail, this.bar, this.note, view, this.pane, this.sheet);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.closeSheet();
  }

  /** The tool a button of the rail takes out. */
  private toolOf(id: string): Tool {
    return id === 'ground' ? this.ground : RAIL.find((r) => r.id === id)!.tools[0]!;
  }

  /** The tool a key takes out, if it is one of the rail's. */
  toolFor(key: string): Tool | null {
    const i = RAIL.findIndex((r, n) => r.key.toLowerCase() === key || String(n + 1) === key);
    return i < 0 ? null : this.toolOf(RAIL[i]!.id);
  }

  /** Put the panel away to see more of the map, or bring it back. */
  shut(on: boolean): void {
    this.isShut = on;
    this.root.classList.toggle('shut', on);
    this.b.refit();
  }

  /**
   * The part of the screen the map shows through, clear of the rail, the bar and the panel (CSS
   * px). On its side a screen has them round three edges; upright, above and below.
   */
  free(): { x0: number; y0: number; x1: number; y1: number } {
    const box = (e: Element): DOMRect => e.getBoundingClientRect();
    const out = { x0: 0, y0: box(this.bar).bottom, x1: innerWidth, y1: innerHeight };
    if (innerWidth > innerHeight) {
      out.x0 = box(this.rail).right;
      if (!this.isShut) out.x1 = box(this.pane).left;
    } else out.y1 = box(this.pane).top;
    // a screen too small to leave anything clear: the middle of it will have to do
    if (out.x1 - out.x0 < 80 || out.y1 - out.y0 < 80)
      return { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
    return out;
  }

  // ---- the pill that says things

  /** Say something for a moment. What is wrong with the road is said until it is put right. */
  say(text: string): void {
    this.noteT = 3;
    this.said = text;
    this.showNote();
  }

  /** Say what the tool in hand is for. */
  hint(): void {
    this.say(this.b.pencil ? PENCIL_TIP : TIPS[this.b.tool]);
  }

  private showNote(): void {
    const bad = this.b.problems[0];
    this.note.textContent = bad ?? (this.noteT > 0 ? this.said : '');
    this.note.classList.toggle('bad', !!bad);
    this.note.classList.toggle('show', !!this.note.textContent);
  }

  /** Once a frame: what was said fades after a moment. */
  tick(dt: number): void {
    if (this.noteT <= 0) return;
    this.noteT = Math.max(0, this.noteT - dt);
    if (this.noteT === 0) this.showNote();
  }

  // ---- the panel

  /** Draw everything again from what the builder says is so. */
  render(): void {
    const b = this.b;
    const t = b.track;
    if (!t) return;
    const bad = b.problems.length > 0;
    if (b.tool === 'area' || b.tool === 'pool') this.ground = b.tool;
    for (const r of RAIL) {
      const btn = this.railBtns.get(r.id)!;
      const on = r.tools.includes(b.tool);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    this.root.dataset.tool = b.tool;
    this.name.replaceChildren(
      h('b', { textContent: t.name.toUpperCase() }),
      h('small', { textContent: bad ? 'ROAD NEEDS FIXING' : 'SAVED' }),
    );
    this.name.classList.toggle('bad', bad);
    this.undo.disabled = !b.canUndo;
    this.redo.disabled = !b.canRedo;
    for (const d of this.drives) d.disabled = bad;
    this.snap.classList.toggle('on', b.snap);
    this.snap.setAttribute('aria-pressed', String(b.snap));
    this.done.classList.toggle('hidden', !b.sel);
    const top: (Node | null | undefined | false)[] = [];
    const end: (Node | null | undefined | false)[] = [];
    this.title.textContent = this.fill(top, end);
    this.top.replaceChildren(...top.filter((n): n is Node => !!n));
    this.end.replaceChildren(...end.filter((n): n is Node => !!n));
    this.profile.draw();
    b.cat.show(b.shelf);
    const it = b.item;
    if (b.shelf === 'things') b.cat.mark(it ? it.prop : b.cat.prop);
    this.showNote();
  }

  private remove(what: string): HTMLElement {
    return button('REMOVE', () => this.b.erase(), {
      sign: 'erase',
      title: what,
      key: 'Delete',
      act: 'remove',
      kind: 'warn',
    });
  }

  private tip(text: string): HTMLElement {
    return h('p', { className: 'tip', textContent: text });
  }

  /** What goes above and below the catalogue for the tool in hand; the panel's title. */
  private fill(
    top: (Node | null | undefined | false)[],
    end: (Node | null | undefined | false)[],
  ): string {
    const b = this.b;
    const t = b.track!;
    const sel = b.sel;
    const tool = b.panelTool;
    if (tool === 'hand') {
      top.push(this.tip(TIPS.hand));
      const count = (n: number, one: string, many = `${one}s`): string =>
        `${n} ${n === 1 ? one : many}`;
      top.push(
        part(
          'ON THIS TRACK',
          h('p', {
            className: 'sum',
            textContent: [
              count(t.road.points.length, 'road point'),
              count(t.raised.length, 'raised stretch', 'raised stretches'),
              count(t.bridges.length, 'bridge'),
              count(t.items.length, 'thing'),
              count(t.pools.length + t.areas.length, 'pool or area', 'pools and areas'),
            ].join(' · '),
          }),
        ),
        h(
          'div',
          { className: 'pair' },
          button('SETTINGS', () => this.openSheet('track'), {
            sign: 'gear',
            kind: 'soft',
            act: 'settings',
          }),
          button('SHARE', () => this.openSheet('share'), {
            sign: 'share',
            kind: 'soft',
            act: 'share',
          }),
        ),
      );
      return 'SELECT';
    }
    if (tool === 'erase') {
      top.push(this.tip(TIPS.erase), this.tip('UNDO brings back what was taken away.'));
      return 'ERASE';
    }
    if (tool === 'road') {
      const p = sel?.kind === 'point' ? sel.index : -1;
      if (p >= 0) {
        top.push(
          part(
            `POINT ${p + 1} OF ${t.road.points.length}`,
            button('START THE RACE HERE', () => b.startHere(), {
              sign: 'flag',
              kind: 'soft',
              act: 'start',
              off: p === 0,
              title: 'Put the start line at this point',
            }),
          ),
          this.tip('Drag it to bend the road. The arrow keys move it a little.'),
        );
        end.push(this.remove('Take this point out of the road'));
        return 'ROAD POINT';
      }
      top.push(
        part(
          'SHAPE IT BY',
          choice(
            'draw',
            [
              ['points', 'POINTS'],
              ['pencil', 'PENCIL'],
            ] as const,
            b.pencil ? 'pencil' : 'points',
            (v) => b.setPencil(v === 'pencil'),
          ),
        ),
        this.tip(b.pencil ? PENCIL_TIP : TIPS.road),
        part(
          'ROAD WIDTH',
          slider('width', 48, 120, 4, t.road.width, (v) => b.change(() => (t.road.width = v))),
        ),
        button('REVERSE THE RACE', () => b.reverse(), {
          sign: 'swap',
          kind: 'soft',
          act: 'reverse',
        }),
      );
      return 'ROAD';
    }
    if (tool === 'raise') {
      const up = b.up;
      if (!up) {
        top.push(
          this.tip(TIPS.raise),
          part(
            'HEIGHT OF THE NEXT ONE',
            stepper(
              'height',
              String(b.height),
              (d) => b.raiseBy(d * RAISE_STEP),
              b.height <= RAISE_MIN,
              b.height >= RAISE_MAX,
            ),
          ),
        );
        return 'RAISE';
      }
      const n = up.levels?.length ?? 0;
      const at = Math.min(b.part, n);
      const height = levelHeight(up, at);
      top.push(
        part(
          n ? `LEVELS · ${n + 1} OF THEM` : 'LEVELS',
          n > 0 &&
            choice(
              'level',
              Array.from({ length: n + 1 }, (_, i) => [String(i), String(i + 1)] as const),
              String(at),
              (v) => b.stepPart(Number(v) - b.part),
            ),
          h(
            'div',
            { className: 'pair' },
            button('ADD LEVEL', () => b.split(), {
              sign: 'plus',
              kind: 'soft',
              act: 'split',
              off: n >= RAISE_LEVELS,
              title: 'Split this level in two, each with a height of its own',
            }),
            n > 0 &&
              button('JOIN', () => b.join(), {
                kind: 'soft',
                act: 'join',
                title: 'Join this level to the one beside it',
              }),
          ),
        ),
        part(
          n ? `HEIGHT OF LEVEL ${at + 1}` : 'HEIGHT',
          stepper(
            'height',
            String(height),
            (d) => b.raiseBy(d * RAISE_STEP),
            height <= RAISE_MIN,
            height >= RAISE_MAX,
          ),
        ),
      );
      top.push(
        part(
          'LONGER OR SHORTER AT ITS',
          h(
            'div',
            { className: 'pair' },
            stepper('from', 'START', (d) => b.stretch(0, d * 24), false, false),
            stepper('to', 'END', (d) => b.stretch(1, d * 24), false, false),
          ),
        ),
      );
      const edge = up.edge ?? 'rail';
      top.push(
        part(
          'EDGES',
          choice('edge', EDGES, edge, (v) => b.setEdge(v)),
        ),
        // (a walled road cannot be left, so nothing needs a way back up to it)
        part(
          edge === 'wall' ? 'SIDE RAMPS (NOT WITH WALLS)' : 'SIDE RAMPS BACK UP',
          choice(
            'lanes',
            LANES,
            edge === 'wall' ? 'none' : (up.lanes ?? 'both'),
            (v) => b.setLanes(v),
            edge === 'wall',
          ),
        ),
        part(
          'SLOPE UP TO IT',
          choice('slope-in', SLOPE_NAMES, slopeOf(b.road(), up, 0), (v) => b.setSlope(0, v)),
        ),
        part(
          'SLOPE DOWN FROM IT',
          choice('slope-out', SLOPE_NAMES, slopeOf(b.road(), up, 1), (v) => b.setSlope(1, v)),
        ),
      );
      end.push(this.remove('Put this stretch back on the ground'));
      return 'RAISED ROAD';
    }
    if (tool === 'surface') {
      top.push(
        this.tip(
          sel
            ? 'Pick another surface to change it. Drag its ends to make it longer.'
            : TIPS.surface,
        ),
      );
      if (sel) end.push(this.remove('Take this stretch of surface away'));
      return 'SURFACE';
    }
    if (tool === 'bridge') {
      const br = sel?.kind === 'bridge' ? t.bridges[sel.index] : undefined;
      const railed = br ? br.rails !== false : b.rails;
      top.push(
        !br && this.tip(TIPS.bridge),
        part(
          'LENGTH',
          slider('length', 80, 480, 20, br ? br.length : b.span, (v) => {
            if (br) b.change(() => (br.length = v));
            else b.span = v;
          }),
        ),
        part(
          'RAILS',
          choice(
            'rails',
            [
              ['on', 'RAILS'],
              ['off', 'NO RAILS'],
            ] as const,
            railed ? 'on' : 'off',
            (v) => {
              if (br)
                b.change(() => {
                  if (v === 'off') br.rails = false;
                  else delete br.rails;
                });
              else {
                b.rails = v === 'on';
                this.render();
              }
            },
          ),
        ),
        this.tip('With no rails a car can drive off the edge and fall.'),
      );
      if (br) end.push(this.remove('Take this bridge away'));
      return 'BRIDGE';
    }
    if (tool === 'place') {
      const it = b.item;
      const def = b.content.prop.get(it?.prop ?? b.cat.prop);
      const k = it ? (it.size ?? 1) : b.size;
      const fixed = !!def?.critter;
      const deg = ((Math.round(((it ? it.rot : b.rot) * 180) / Math.PI) % 360) + 360) % 360;
      const shape = h(
        'div',
        { className: 'pair' },
        part(
          'TURN',
          h(
            'div',
            { className: 'step' },
            button('', () => b.turn(-TURN), {
              sign: 'turnl',
              title: 'Turn it left',
              key: '[',
              act: 'turn-left',
            }),
            h('b', { textContent: `${deg}°` }),
            button('', () => b.turn(TURN), {
              sign: 'turnr',
              title: 'Turn it right',
              key: ']',
              act: 'turn-right',
            }),
          ),
        ),
        part(
          'SIZE',
          stepper(
            'size',
            `×${k}`,
            (d) => b.resizeBy(d * SIZE_STEP),
            fixed || k <= sizeStep(0),
            fixed || k >= sizeStep(99),
          ),
        ),
      );
      if (!it) {
        top.push(this.tip(TIPS.place), shape);
        return 'THINGS';
      }
      top.push(
        shape,
        h(
          'div',
          { className: 'pair' },
          button('COPY', () => b.copy(), {
            sign: 'copy',
            kind: 'soft',
            act: 'copy',
            key: 'Ctrl D',
            title: 'Another one beside it',
          }),
          button(
            b.swapping ? 'KEEP IT' : 'SWAP',
            () => ((b.swapping = !b.swapping), this.render()),
            {
              sign: 'swap',
              kind: 'soft',
              act: 'swap',
              on: b.swapping,
              title: 'Make it something else',
            },
          ),
        ),
        b.swapping && this.tip('Pick what it should be.'),
      );
      end.push(this.remove('Take this thing away'));
      return (def?.meta.name ?? 'THING').toUpperCase();
    }
    // the ground: areas of terrain and weather, and pools
    const area = sel?.kind === 'area' ? t.areas[sel.index] : undefined;
    const pool = sel?.kind === 'pool' ? t.pools[sel.index] : undefined;
    if (!sel)
      top.push(
        part(
          'LAY',
          choice(
            'ground',
            [
              ['area', 'TERRAIN'],
              ['pool', 'POOL'],
            ] as const,
            tool === 'area' ? 'area' : 'pool',
            (v) => b.pick(v),
          ),
        ),
        this.tip(TIPS[tool]),
      );
    if (tool === 'area') {
      const sky = area ? area.sky : b.sky;
      top.push(
        part(
          'SIZE',
          slider('area', 80, 600, 20, area ? area.r : b.areaR, (v) => {
            if (area) b.change(() => (area.r = v));
            else b.areaR = v;
          }),
        ),
      );
      const skies = choice(
        'sky',
        [['', 'AS IT IS'] as const, ...Object.keys(SKIES).map((n) => [n, skyLabel(n)] as const)],
        sky,
        (v) => {
          if (area) b.change(() => (area.sky = v));
          else {
            b.sky = v;
            this.render();
          }
        },
      );
      skies.classList.add('wrap');
      end.push(part('WEATHER OVER IT', skies));
      if (area) end.push(this.remove('Take this area away'));
      return area ? 'AREA' : 'GROUND';
    }
    top.push(
      part(
        'SIZE',
        slider('pool', 8, 60, 2, pool ? pool.r : b.poolR, (v) => {
          if (pool) b.change(() => (pool.r = v));
          else b.poolR = v;
        }),
      ),
    );
    if (pool) end.push(this.remove('Take this pool away'));
    return pool ? 'POOL' : 'GROUND';
  }

  // ---- the sheet: the track's own settings, sharing, and what the keys do

  get sheetOpen(): boolean {
    return !this.sheet.classList.contains('hidden');
  }

  closeSheet(): void {
    this.sheet.classList.add('hidden');
  }

  openKeys(): void {
    this.openSheet('keys');
  }

  openSheet(tab: Tab = this.tab): void {
    const b = this.b;
    const t = b.track;
    if (!t) return;
    this.tab = tab;
    const kids: (Node | false)[] = [];
    const field = (label: string, ...inside: Node[]): HTMLElement =>
      h('label', { className: 'field' }, h('span', { textContent: label }), ...inside);
    const again = (): void => this.openSheet();
    if (tab === 'track') {
      const name = h('input', { type: 'text', value: t.name, maxLength: 32 });
      name.onchange = () => {
        const v = name.value.trim();
        if (v) b.change(() => (t.name = v), true);
      };
      const look = h('select');
      look.append(new Option('Keep this look', ''));
      for (const v of [...b.content.venue.values()].sort((x, y) =>
        x.meta.name < y.meta.name ? -1 : 1,
      ))
        if (v.track && !v.id.startsWith('venue.custom-'))
          look.append(new Option(v.meta.name, v.id));
      look.onchange = () => {
        const v = b.content.venue.get(look.value);
        if (!v) return;
        b.change(() => {
          t.colors = { ...v.colors };
          t.dressing = dressingOf(v);
          t.look = v.id;
          t.seed = v.seed;
        });
        again();
      };
      const mine = `${t.size.w}x${t.size.h}`;
      const sizes: [string, string][] = SIZES.map(([label, w, hh]) => [`${w}x${hh}`, label]);
      if (!sizes.some(([v]) => v === mine)) sizes.push([mine, `${t.size.w} × ${t.size.h}`]);
      const size = choice('size', sizes, mine, (v) => {
        const [w, hh] = v.split('x').map(Number) as [number, number];
        b.setMapSize(w, hh);
        again();
      });
      size.classList.add('wrap');
      kids.push(
        field('NAME', name),
        field('LOOK', look),
        part('MAP SIZE', size),
        part(
          'LAPS',
          slider('laps', 1, 9, 1, t.laps, (v) => b.change(() => (t.laps = v))),
        ),
        part(
          'ROAD WIDTH',
          slider('width', 48, 120, 4, t.road.width, (v) => b.change(() => (t.road.width = v))),
        ),
        part(
          'SCRAP BOTS',
          slider('bots', 0, 30, 1, t.bots, (v) => b.change(() => (t.bots = v))),
        ),
      );
    } else if (tab === 'scenery') {
      const rules = h('div', { className: 'rules' });
      t.dressing.forEach((d) => {
        const sw = h('button', { type: 'button', className: `tog${d.on ? ' on' : ''}` });
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', String(d.on));
        sw.append(h('i'), h('span', { textContent: ruleLabel(b.content, d.rule) }));
        sw.onclick = () => {
          b.change(() => (d.on = !d.on));
          again();
        };
        rules.append(sw);
      });
      kids.push(
        h('p', {
          className: 'tip',
          textContent: 'What fills the map by itself, round what you build.',
        }),
        rules,
        button(
          'SHUFFLE THE SCENERY',
          () => b.change(() => (t.seed = (t.seed * 31 + 17) % 100000)),
          {
            sign: 'shuffle',
            kind: 'soft',
            act: 'shuffle',
          },
        ),
      );
    } else if (tab === 'share') {
      const msg = h('p', { className: 'tip msg' });
      kids.push(
        h('p', {
          className: 'tip',
          textContent:
            'Every change is kept on this device as you make it. A link or a file sends the ' +
            'track to a friend, or to another device.',
        }),
        h(
          'div',
          { className: 'files' },
          button('SHARE A LINK', () => void b.share().then((said) => (msg.textContent = said)), {
            sign: 'share',
            kind: 'go',
            act: 'link',
          }),
          button('SAVE AS A FILE', () => saveTrackFile(t), {
            sign: 'save',
            kind: 'soft',
            act: 'save',
          }),
          button(
            'LOAD A FILE',
            () => {
              void pickTrackFile().then((r) => {
                if (!r.ok) {
                  msg.textContent = r.error;
                  return;
                }
                // a loaded file takes this track's place in the builder, under its own id
                b.load(r.track);
                this.closeSheet();
                b.say(`Loaded ${r.track.name}.`);
              });
            },
            { sign: 'open', kind: 'soft', act: 'load' },
          ),
        ),
        msg,
      );
    } else {
      const list = h('dl', { className: 'keys' });
      for (const [k, what] of KEYS)
        list.append(h('dt', { textContent: k }), h('dd', { textContent: what }));
      kids.push(list);
    }
    const tabs = choice(
      'tab',
      [
        ['track', 'TRACK'],
        ['scenery', 'SCENERY'],
        ['share', 'SHARE'],
        ['keys', 'KEYS'],
      ] as const,
      tab,
      (v) => this.openSheet(v),
    );
    const card = h(
      'div',
      { className: 'box' },
      h(
        'div',
        { className: 'head' },
        h('h2', { textContent: 'YOUR TRACK' }),
        button('DONE', () => this.closeSheet(), { kind: 'go', act: 'done' }),
      ),
      tabs,
      h('div', { className: 'in' }, ...kids),
    );
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Your track');
    this.sheet.replaceChildren(card);
    this.sheet.classList.remove('hidden');
  }
}
