import { TUNE_MAX } from '@demodogs/shared';
import type { Content } from '@demodogs/sim';
import {
  FINAL_PRIZE,
  GEAR,
  KIT,
  LOAN,
  TIERS,
  addOns,
  buyAddon,
  buyCar,
  buyKit,
  buyUpgrade,
  finalOpen,
  ladder,
  levelOf,
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
import {
  CUPS,
  KINDS,
  MEDALS,
  barred,
  clock,
  cupDef,
  cupRound,
  cupTable,
  enterCup,
  trophyCount,
  withdraw,
} from '../game/cups';
import type { Art } from '../render/art';
import { Garage } from './garage';

type Tab = 'race' | 'cups' | 'garage' | 'cars' | 'market' | 'ladder';
const TABS: readonly [Tab, string][] = [
  ['race', 'RACE'],
  ['cups', 'TOURNAMENTS'],
  ['garage', 'GARAGE'],
  ['cars', 'CARS'],
  ['market', 'BLACK MARKET'],
  ['ladder', 'LADDER'],
];
const PARTS: readonly [Part, string, string][] = [
  ['engine', 'ENGINE', 'Top speed and pull.'],
  ['tyres', 'TYRES', 'Grip in the bends.'],
  ['armor', 'ARMOUR', 'Takes more before it breaks.'],
  ['nitro', GEAR.nitro.name, GEAR.nitro.blurb],
  ['guns', GEAR.guns.name, GEAR.guns.blurb],
  ['ram', GEAR.ram.name, GEAR.ram.blurb],
];
const PLACED = ['', '★ WON', '2ND', '3RD'];
const WITHDRAW = 'Tap again to walk away. The entry fee is gone.';
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
  /** Run the next round of the tournament. */
  cup(): void;
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
    // between the rounds of a tournament the hub opens on it
    this.tab = k.cup ? 'cups' : 'race';
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
        if (k.cup)
          return [
            el(
              'p',
              'help',
              `You are entered in the ${cupDef(k.cup.id)?.name ?? 'tournament'}. Finish it or withdraw before racing for the ladder.`,
            ),
          ];
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
      case 'cups':
        return k.cup ? this.cupRun() : this.cupList();
      case 'garage': {
        const fix = repairCost(C, k);
        const sealed = k.cup?.sealed === true;
        const out = [
          this.item(
            'REPAIR',
            sealed
              ? `Bodywork at ${k.hp}%. No repairs until the tournament is over.`
              : fix
                ? `Bodywork at ${k.hp}%.`
                : 'Not a dent on it.',
            sealed ? 'SEALED' : fix ? money(fix) : 'OK',
            fix && !sealed ? () => this.buy(repair(C, k), 'Patched up.') : null,
          ),
        ];
        for (const [part, name, blurb] of PARTS) {
          const cost = upgradeCost(C, k, part);
          const lv = levelOf(k, part);
          out.push(
            this.item(
              `${name} ${'●'.repeat(lv)}${'○'.repeat(TUNE_MAX - lv)}`,
              blurb,
              cost === null ? 'MAX' : money(cost),
              cost === null ? null : () => this.buy(buyUpgrade(C, k, part), `${name} fitted.`),
            ),
          );
        }
        // add-ons: bolted on once and kept until the car is traded in
        for (const a of addOns(C, 'garage')) {
          const has = k.addons.includes(a.id);
          out.push(
            this.item(
              a.name.toUpperCase(),
              a.blurb,
              has ? 'FITTED' : money(a.price),
              has ? null : () => this.buy(buyAddon(C, k, a.id), `${a.name} bolted on.`),
              'addon',
            ),
          );
        }
        out.push(el('p', 'help', 'Add-ons stay on this car. Trade it in and they go with it.'));
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
            mine || k.cup
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
        if (k.cup)
          out.unshift(el('p', 'help', 'The dealer is shut to you until the tournament is over.'));
        out.push(
          el(
            'p',
            'help',
            `Prices are after trading in your car (${money(back)}). Upgrades and add-ons stay with the old car.`,
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
        for (const a of addOns(C, 'market')) {
          const has = k.extras.includes(a.id);
          out.push(
            this.item(
              a.name.toUpperCase(),
              a.blurb,
              has ? 'LOADED' : money(a.price),
              has ? null : () => this.buy(buyAddon(C, k, a.id), `${a.name}: on for the next race.`),
            ),
          );
        }
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

  /** The tournaments on offer. */
  private cupList(): HTMLElement[] {
    const k = this.k;
    const out: HTMLElement[] = [];
    for (const d of CUPS) {
      const why = barred(k, d);
      const won = PLACED[k.trophies[d.id] ?? 0]!;
      out.push(
        this.item(
          `${d.name}${won ? ` · ${won}` : ''}`,
          `${KINDS[d.kind].name} · ${d.rounds} rounds · ${d.rivals ? `${d.rivals + 1} cars` : 'solo'}. ${d.blurb}${why ? ` ${why}` : ''}`,
          `${money(d.fee)} IN · ${money(d.purse[0])}`,
          why
            ? null
            : () => {
                const r = enterCup(k, d.id);
                this.buy(r, `Entered. ${KINDS[d.kind].rule}`);
              },
          `cup ${d.kind}`,
        ),
      );
    }
    out.push(
      el(
        'p',
        'help',
        'Pay the entry, race the rounds, and spend what each round pays in the garage before the next. The car goes round to round as it is, dents and all. A place in the first three is a trophy; trophies open the bigger tournaments.',
      ),
    );
    return out;
  }

  /** The tournament being run: the next round, the table, and the way out. */
  private cupRun(): HTMLElement[] {
    const C = this.content;
    const k = this.k;
    const r = cupRound(C, k);
    if (!r) return [];
    const d = r.def;
    const venue = C.venue.get(r.venue)!.meta.name;
    const bits: string[] = [];
    if (r.field.length) bits.push(r.field.map((e) => e.name).join(', '));
    if (r.laps) bits.push(`${r.laps} laps`);
    if (r.modifiers.length)
      bits.push(r.modifiers.map((id) => C.modifier.get(id)?.label ?? '').join(' + '));
    if (r.mark) bits.push(`WANTED: ${r.mark}, ${money(r.bounty ?? 0)}`);
    if (r.par) bits.push(r.par.map((t, i) => `${MEDALS[3 - i]} ${clock(t)}`).join(' · '));
    const out: HTMLElement[] = [
      el(
        'p',
        'banner',
        `${d.name} · ROUND ${r.round + 1} OF ${d.rounds}`,
        el('small', '', KINDS[d.kind].rule),
      ),
      this.item(
        `START: ${venue.toUpperCase()}`,
        `${bits.join(' · ')}.`,
        d.kind === 'trial' ? `UP TO ${money(d.round)}` : `${money(d.round)} A WIN`,
        () => this.hooks.cup(),
        'final',
      ),
    ];
    const t = el('table');
    if (d.kind === 'trial') {
      for (let i = 0; i < d.rounds; i++) {
        const tr = t.insertRow();
        const m = k.cup!.medals[i];
        tr.insertCell().textContent = `ROUND ${i + 1}`;
        const c = tr.insertCell();
        c.textContent = m === undefined ? '…' : MEDALS[m]!;
        if (m) c.className = `medal m${m}`;
      }
    } else
      cupTable(k).forEach((s, i) => {
        const tr = t.insertRow();
        tr.className = `${s.me ? 'me' : ''} ${s.out ? 'gone' : ''}`;
        tr.insertCell().textContent = String(i + 1);
        const dot = el('span', 'dot');
        dot.style.background = s.paint;
        tr.insertCell().append(dot, s.name);
        tr.insertCell().textContent =
          d.kind === 'last' ? (s.out ? 'OUT' : 'IN') : `${s.points} pts`;
      });
    const quit = el('button', 'small', 'WITHDRAW');
    quit.onclick = () => {
      if (this.note !== WITHDRAW) {
        this.note = WITHDRAW;
        this.render();
      } else {
        this.k = withdraw(k);
        this.hooks.change(this.k);
        this.note = 'Withdrawn.';
        this.render();
      }
    };
    out.push(
      el('div', 'tableWrap', t),
      el(
        'p',
        'help',
        k.cup!.sealed
          ? 'The garage will not repair this car until the tournament is over. Upgrades and add-ons can still be bought.'
          : 'The garage, the black market and your cash are yours between rounds: fix the car or make it quicker.',
      ),
      quit,
    );
    return out;
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
        el(
          'span',
          'rank',
          `#${rank(k)} · ${k.points} pts${trophyCount(k) ? ` · ★${trophyCount(k)}` : ''}`,
        ),
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
