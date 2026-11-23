import { TUNE_MAX } from '@demodogs/shared';
import type { Content } from '@demodogs/sim';
import {
  FINAL_PRIZE,
  KIT,
  LOAN,
  TIERS,
  buyCar,
  buyKit,
  buyUpgrade,
  finalOpen,
  ladder,
  raceSetup,
  rank,
  repair,
  repairCost,
  shop,
  takeLoan,
  tradeIn,
  upgradeCost,
  type Buy,
  type Career,
  type KitId,
  type Part,
  type RaceId,
} from '../game/career';
import type { Art } from '../render/art';
import { Garage } from './garage';

type Tab = 'race' | 'garage' | 'cars' | 'market' | 'ladder';
const TABS: readonly [Tab, string][] = [
  ['race', 'RACE'],
  ['garage', 'GARAGE'],
  ['cars', 'CARS'],
  ['market', 'BLACK MARKET'],
  ['ladder', 'LADDER'],
];
const PARTS: readonly [Part, string, string][] = [
  ['engine', 'ENGINE', 'Top speed and pull.'],
  ['tyres', 'TYRES', 'Grip in the bends.'],
  ['armor', 'ARMOUR', 'Takes more before it breaks.'],
];
export const money = (n: number): string =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US')}`;

type Kid = Node | string | null | false;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) if (k !== null && k !== false) e.append(k);
  return e;
}

export interface CareerHooks {
  /** The career changed (a purchase): save it. */
  change(k: Career): void;
  race(id: RaceId): void;
  back(): void;
  /** Throw the career away and start again. */
  reset(): void;
}

/**
 * The career's hub between races: enter a race, fix and upgrade the car, trade it for a better
 * one, visit the black market, read the ladder. It draws the state it is given and calls the
 * rules in game/career.ts; it holds nothing of its own but the open tab.
 */
export class CareerScreen {
  private tab: Tab = 'race';
  private note = '';
  private preview: string | null = null;
  private readonly cv = el('canvas', 'careerCar');
  private readonly garage: Garage;
  private k!: Career;

  constructor(
    private readonly root: HTMLElement,
    private readonly content: Content,
    art: Art,
    private readonly hooks: CareerHooks,
  ) {
    this.garage = new Garage(this.cv, art);
  }

  open(k: Career): void {
    this.k = k;
    this.note = '';
    this.preview = null;
    this.tab = 'race';
    this.render();
  }

  /** Spin the car on the turntable. */
  draw(dt: number): void {
    const car = this.content.car.get(this.preview ?? this.k.car);
    if (car) this.garage.draw(car, dt);
  }

  private buy(r: Buy, done: string): void {
    if (r.ok) {
      this.k = r.career;
      this.hooks.change(r.career);
      this.note = done;
    } else this.note = r.why;
    this.render();
  }

  private item(
    title: string,
    blurb: string,
    price: string,
    act: (() => void) | null,
    cls = '',
  ): HTMLElement {
    const b = el(
      'button',
      `item ${cls}`,
      el('span', '', el('b', '', title), el('small', '', blurb)),
      el('em', '', price),
    );
    if (act) b.onclick = act;
    else b.disabled = true;
    return b;
  }

  private body(): HTMLElement[] {
    const C = this.content;
    const k = this.k;
    switch (this.tab) {
      case 'race': {
        const out: HTMLElement[] = [];
        if (k.champion)
          out.push(el('p', 'banner', 'TOP DOG! The ladder is yours. Race on for the money.'));
        if (finalOpen(k)) {
          const s = raceSetup(C, k, 'final');
          out.push(
            this.item(
              'THE TOP DOG',
              `One on one with ${s.field[0]!.name} at ${C.venue.get(s.venue)!.meta.name}.`,
              money(FINAL_PRIZE),
              () => this.hooks.race('final'),
              'final',
            ),
          );
        }
        for (const t of TIERS) {
          const s = raceSetup(C, k, t.id);
          out.push(
            this.item(
              t.name,
              `${C.venue.get(s.venue)!.meta.name} · ${s.field.map((e) => e.name).join(', ')}. ${t.blurb}`,
              `${money(t.prize[0])} · ${t.points[0]} pts`,
              () => this.hooks.race(t.id),
            ),
          );
        }
        out.push(
          el(
            'p',
            'help',
            'Four cars, no tow truck: a wreck is out. Only the first three are paid, and a wrecked car earns nothing. Lead the ladder and the Top Dog will race you.',
          ),
        );
        return out;
      }
      case 'garage': {
        const fix = repairCost(C, k);
        const out = [
          this.item(
            'REPAIR',
            fix ? `Bodywork at ${k.hp}%.` : 'Not a dent on it.',
            fix ? money(fix) : 'OK',
            fix ? () => this.buy(repair(C, k), 'Patched up.') : null,
          ),
        ];
        for (const [part, name, blurb] of PARTS) {
          const cost = upgradeCost(C, k, part);
          const lv = k.tune[part];
          out.push(
            this.item(
              `${name} ${'●'.repeat(lv)}${'○'.repeat(TUNE_MAX - lv)}`,
              blurb,
              cost === null ? 'MAX' : money(cost),
              cost === null ? null : () => this.buy(buyUpgrade(C, k, part), `${name} fitted.`),
            ),
          );
        }
        return out;
      }
      case 'cars': {
        const back = tradeIn(C, k);
        const out = shop(C).map((c) => {
          const mine = c.id === k.car;
          const b = this.item(
            c.name.toUpperCase(),
            c.blurb,
            mine ? 'YOURS' : money(c.price - back),
            mine
              ? null
              : () => {
                  // first tap puts it on the turntable, the second buys it
                  if (this.preview !== c.id) {
                    this.preview = c.id;
                    this.note = `${c.name}: tap again to buy.`;
                    this.render();
                  } else {
                    this.preview = null;
                    this.buy(buyCar(C, k, c.id), `The ${c.name} is yours.`);
                  }
                },
            this.preview === c.id ? 'picked' : '',
          );
          return b;
        });
        out.push(
          el(
            'p',
            'help',
            `Prices are after trading in your car (${money(back)}). Upgrades stay with the old car.`,
          ),
        );
        return out;
      }
      case 'market': {
        const out = (Object.keys(KIT) as KitId[]).map((id) =>
          this.item(
            KIT[id].name,
            KIT[id].blurb,
            k.kit[id] ? 'LOADED' : money(KIT[id].price),
            k.kit[id]
              ? null
              : () => this.buy(buyKit(k, id), `${KIT[id].name}: ready for the next race.`),
          ),
        );
        out.push(
          this.item(
            'LOAN SHARK',
            k.debt
              ? `You owe ${money(k.debt)}. Half of every payout goes to the shark.`
              : `${money(LOAN.cash)} now, ${money(LOAN.owed)} back out of your winnings.`,
            k.debt ? 'OWED' : `+${money(LOAN.cash)}`,
            k.debt ? null : () => this.buy(takeLoan(k), 'The shark smiles.'),
          ),
          el('p', 'help', 'Everything here lasts one race.'),
        );
        return out;
      }
      case 'ladder': {
        const t = el('table');
        ladder(k).forEach((s, i) => {
          const tr = t.insertRow();
          if (s.me) tr.className = 'me';
          tr.insertCell().textContent = String(i + 1);
          const dot = el('span', 'dot');
          dot.style.background = s.paint;
          tr.insertCell().append(dot, s.name);
          tr.insertCell().textContent = `${s.points} pts`;
        });
        const again = el('button', 'small', 'START A NEW CAREER');
        again.onclick = () => {
          if (this.note !== 'Tap again to throw this career away.') {
            this.note = 'Tap again to throw this career away.';
            this.render();
          } else this.hooks.reset();
        };
        return [el('div', 'tableWrap', t), again];
      }
    }
  }

  private render(): void {
    const k = this.k;
    const car = this.content.car.get(this.preview ?? k.car)!;
    const back = el('button', 'small', 'MENU');
    back.onclick = () => this.hooks.back();
    const tabs = el('div', 'tabs');
    for (const [id, name] of TABS) {
      const b = el('button', id === this.tab ? 'on' : '', name);
      b.onclick = () => {
        this.tab = id;
        this.note = '';
        this.preview = null;
        this.render();
      };
      tabs.append(b);
    }
    const hp = el('i', '', el('b'));
    (hp.firstChild as HTMLElement).style.width = `${k.hp}%`;
    const list = el('div', 'list', ...this.body());
    this.root.replaceChildren(
      el(
        'div',
        'careerHead',
        el('h2', '', 'CAREER'),
        el('span', 'cash', money(k.cash)),
        el('span', 'rank', `#${rank(k)} · ${k.points} pts`),
        back,
      ),
      el(
        'div',
        'cols',
        el(
          'div',
          'garageBox',
          this.cv,
          el('div', 'carPick', el('div', '', el('b', '', car.meta.name.toUpperCase()))),
          el('div', 'stats one', el('label', '', 'BODYWORK', hp)),
        ),
        el('div', 'events', tabs, el('p', 'note', this.note || ' '), list),
      ),
    );
  }
}
