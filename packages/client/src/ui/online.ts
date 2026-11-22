import type { CarManifest, VenueManifest } from '@demodogs/shared';
import type { Content } from '@demodogs/sim';
import { installDeterministicMath, contentHash } from '../net/det-math';
import type { NetRace } from '../net/lockstep';
import { OnlineRoom, type RaceStart } from '../net/room';
import { SignalClient } from '../net/signal';

export interface OnlineHooks {
  /** Build and show the race; `race` drives it. */
  race(start: RaceStart, race: NetRace): void;
  /** Leave the online screen for the main menu. */
  back(): void;
  /** Show the online screen again (the race ended, or the room closed mid-race). */
  show(): void;
}

const NAME = 'dd-online-name';

/**
 * The ONLINE screen: host a room or join one by code (or an invite link, `?room=CODE`), pick a car,
 * and for the host the venue and START. Races then run through `OnlineRoom`.
 */
export class OnlineScreen {
  room: OnlineRoom | null = null;
  private signal: SignalClient | null = null;
  private name: string;
  private carIdx: number;
  private note = '';
  private busy = false;
  private readonly hash: string;

  constructor(
    private readonly el: HTMLElement,
    private readonly content: Content,
    private readonly cars: CarManifest[],
    private readonly venues: VenueManifest[],
    private readonly baseUrl: string,
    private readonly hooks: OnlineHooks,
  ) {
    this.hash = contentHash(content);
    let saved = '';
    try {
      saved = localStorage.getItem(NAME) ?? '';
    } catch {
      // private mode
    }
    this.name = saved || `DOG${Math.floor(Math.random() * 900 + 100)}`;
    this.carIdx = 0;
  }

  /** The online race is running (pausing must not stop the clock). */
  get racing(): boolean {
    return this.room?.race != null;
  }

  get isHost(): boolean {
    return this.room?.role === 'host';
  }

  open(car: string, join?: string): void {
    this.carIdx = Math.max(
      0,
      this.cars.findIndex((c) => c.id === car),
    );
    this.render();
    if (join && !this.room) void this.join(join);
  }

  status(): string {
    if (!this.room) return '';
    return `ONLINE · ${this.room.status()}`;
  }

  /** Host, after the results: everyone back to the room. */
  backToLobby(): void {
    this.room?.backToLobby();
    this.hooks.show();
    this.render();
  }

  leave(): void {
    this.room?.leave();
    this.room = null;
    this.signal?.close();
    this.signal = null;
    this.note = '';
    this.render();
  }

  private client(): SignalClient {
    if (!this.signal) {
      this.signal = new SignalClient(this.baseUrl);
      this.signal.subscribe(() => this.render());
    }
    return this.signal;
  }

  private me() {
    return { name: this.name, car: this.cars[this.carIdx]!.id };
  }

  private roomHooks() {
    return {
      change: () => this.render(),
      start: (s: RaceStart, race: NetRace) => {
        installDeterministicMath();
        this.hooks.race(s, race);
      },
      lobby: () => {
        this.hooks.show();
        this.render();
      },
      closed: (reason: string) => {
        this.room = null;
        this.note = reason;
        this.hooks.show();
        this.render();
      },
    };
  }

  private async host(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.note = '';
    this.render();
    try {
      const v = this.venues[0]!;
      this.room = await OnlineRoom.host(
        this.client(),
        this.me(),
        this.hash,
        v.id,
        this.roomHooks(),
        v.meta.name,
      );
    } catch (e) {
      this.note = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
    this.render();
  }

  private async join(code: string): Promise<void> {
    code = code.trim().toUpperCase();
    if (this.busy || !/^[A-Z2-9]{6}$/.test(code)) {
      this.note = 'A room code is 6 letters and numbers.';
      this.render();
      return;
    }
    this.busy = true;
    this.note = '';
    this.render();
    try {
      this.room = await OnlineRoom.join(
        this.client(),
        this.me(),
        this.hash,
        code,
        this.roomHooks(),
      );
    } catch (e) {
      this.note = e instanceof Error ? e.message : String(e);
    }
    this.busy = false;
    this.render();
  }

  private serverLine(): string {
    const s = this.signal?.status;
    if (s === 'waking')
      return 'Waking up the lobby server… (a free server sleeps; this can take a minute)';
    if (s === 'connecting') return 'Reaching the lobby server…';
    if (s === 'offline') return 'The lobby server can’t be reached right now.';
    if (s === 'outdated') return 'This game is older than the lobby server: reload the page.';
    return '';
  }

  render(): void {
    const el = this.el;
    el.replaceChildren();
    const h = <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      props: Record<string, unknown> = {},
      ...kids: (Node | string)[]
    ): HTMLElementTagNameMap[K] => {
      const n = Object.assign(document.createElement(tag), props);
      n.append(...kids);
      return n;
    };
    const btn = (text: string, onclick: () => void, cls = '') =>
      h('button', { textContent: text, onclick, className: cls });
    el.append(h('h2', { textContent: 'ONLINE' }));
    const room = this.room;

    // name and car
    const nameIn = h('input', {
      value: this.name,
      maxLength: 12,
      ariaLabel: 'Your name',
      onchange: () => {
        this.name =
          nameIn.value
            .toUpperCase()
            .replace(/[^A-Z0-9 -]/g, '')
            .trim()
            .slice(0, 12) || this.name;
        try {
          localStorage.setItem(NAME, this.name);
        } catch {
          // private mode
        }
        room?.pick(this.me());
        this.render();
      },
    });
    const car = this.cars[this.carIdx]!;
    const turn = (d: number) => () => {
      this.carIdx = (this.carIdx + d + this.cars.length) % this.cars.length;
      room?.pick(this.me());
      this.render();
    };
    el.append(
      h(
        'div',
        { className: 'onlineMe' },
        nameIn,
        btn('◀', turn(-1), 'arrow'),
        h('b', { textContent: car.meta.name.toUpperCase() }),
        btn('▶', turn(1), 'arrow'),
      ),
    );

    if (!room) {
      const codeIn = h('input', { placeholder: 'ROOM CODE', maxLength: 6, ariaLabel: 'Room code' });
      el.append(
        btn(this.busy ? 'OPENING…' : 'HOST A RACE', () => void this.host()),
        h(
          'div',
          { className: 'row' },
          codeIn,
          btn('JOIN', () => void this.join(codeIn.value)),
        ),
      );
    } else {
      const link = `${location.origin}${location.pathname}?room=${room.code}`;
      el.append(
        h('p', { className: 'roomCode' }, 'ROOM ', h('b', { textContent: room.code })),
        btn(
          'COPY INVITE LINK',
          () => {
            const say = (text: string) => {
              this.note = text;
              this.render();
            };
            if (!navigator.clipboard) say(link);
            else
              navigator.clipboard.writeText(link).then(
                () => say('Invite link copied.'),
                () => say(link),
              );
          },
          'small',
        ),
      );
      const list = h('ul', { className: 'seats' });
      room.seats.forEach((s, i) => {
        const def = this.content.car.get(s.car);
        list.append(
          h(
            'li',
            { className: `${i === room.you ? 'me' : ''} ${s.connected ? '' : 'away'}` },
            h('span', { className: 'dot', style: `background:${s.paint}` }),
            `${s.name} · ${def?.meta.name.toUpperCase() ?? s.car}${i === 0 ? ' · HOST' : ''}${s.connected ? '' : ' · away'}`,
          ),
        );
      });
      el.append(list);
      const venue = this.content.venue.get(room.venue);
      if (room.role === 'host') {
        const sel = h('select', {
          ariaLabel: 'Venue',
          onchange: () => {
            const v = this.content.venue.get(sel.value)!;
            room.setVenue(v.id, v.meta.name);
          },
        });
        for (const v of this.venues) {
          const mode = this.content.mode.get(v.mode)!;
          sel.append(
            h('option', {
              value: v.id,
              textContent: `${v.meta.name.toUpperCase()} · ${mode.kind}`,
              selected: v.id === room.venue,
            }),
          );
        }
        el.append(
          sel,
          btn(
            room.seats.length > 1 ? 'START RACE' : 'START (ON YOUR OWN)',
            () => room.begin(),
            'go',
          ),
        );
      } else {
        el.append(
          h('p', {
            className: 'tag',
            textContent: venue
              ? `${venue.meta.name.toUpperCase()} · waiting for the host to start`
              : 'Reaching the host…',
          }),
        );
      }
      el.append(h('p', { className: 'tag', textContent: room.status() }));
    }
    const line = this.note || this.serverLine();
    if (line) el.append(h('p', { className: 'note', textContent: line }));
    el.append(
      btn(
        room ? 'LEAVE ROOM' : 'BACK',
        () => {
          if (room) this.leave();
          else this.hooks.back();
        },
        'small',
      ),
    );
  }
}
