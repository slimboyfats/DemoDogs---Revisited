import type { CarManifest, TrackFile, VenueManifest } from '@demodogs/shared';
import { trackProblems, type Content } from '@demodogs/sim';
import { installDeterministicMath, contentHash } from '../net/det-math';
import type { NetRace } from '../net/lockstep';
import { OnlineRoom, savedRoom, type RaceStart } from '../net/room';
import { SignalClient } from '../net/signal';
import { modChips, modLine } from './mod-chips';

export interface OnlineHooks {
  /** Build and show the race; `race` drives it. */
  race(start: RaceStart, race: NetRace): void;
  /** Leave the online screen for the main menu. */
  back(): void;
  /** Show the online screen again (the race ended, or the room closed mid-race). */
  show(): void;
}

const NAME = 'dd-online-name';
/** A notice over the race stays this long. */
const NOTICE_MS = 3500;

/** A room code out of whatever was typed or pasted: the code itself, or an invite link. */
export function codeFrom(text: string): string {
  const link = /[?&]room=([A-Za-z0-9]{6})\b/.exec(text);
  return (link ? link[1]! : text).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** A round trip in words a driver can use, with the number for those who want it. */
export function linkWords(ping: number, path: string): string {
  const how = path === 'relay' ? 'through the server' : 'direct';
  if (ping <= 0) return `LINKED · ${how}`;
  const q = ping < 90 ? 'GOOD' : ping < 200 ? 'OK' : 'SLOW';
  return `${q} CONNECTION · ${ping} ms · ${how}`;
}

/** Signal bars, 0 to 4, for a round trip (0: no link). */
export function bars(ping: number, linked: boolean): number {
  if (!linked) return 0;
  return ping < 60 ? 4 : ping < 120 ? 3 : ping < 220 ? 2 : 1;
}

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
  private mine: TrackFile[] = [];
  private readonly hash: string;
  private notice: { text: string; good: boolean; until: number } | null = null;
  private pings: { seat: number; el: HTMLElement }[] = [];
  private linkLine: HTMLElement | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly content: Content,
    private readonly cars: CarManifest[],
    private readonly venues: VenueManifest[],
    private readonly baseUrl: string,
    private readonly hooks: OnlineHooks,
    /** The tracks built on this device: the host may race on one. */
    private readonly tracks: () => Promise<TrackFile[]> = async () => [],
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
    // the numbers on the seats move without the whole screen being built again
    setInterval(() => this.refresh(), 1000);
  }

  /**
   * What to put across the top of the race, if anything: a lost link, a host that is away, or
   * the last thing that happened to someone's connection.
   */
  banner(now = performance.now()): { text: string; good: boolean } | null {
    const room = this.room;
    if (!room) return null;
    const t = room.trouble();
    if (t === 'reconnecting') {
      const s = Math.floor(room.lostFor);
      return { text: `CONNECTION LOST · RECONNECTING${s >= 2 ? ` · ${s} s` : '…'}`, good: false };
    }
    if (t === 'hostAway') return { text: 'WAITING FOR THE HOST…', good: false };
    if (this.notice && now < this.notice.until) return this.notice;
    return null;
  }

  /** Signal bars for the corner of the race, 0 to 4. */
  bars(): number {
    const room = this.room;
    if (!room) return 0;
    return room.role === 'host' ? 4 : bars(room.ping, room.linked);
  }

  /** The page is back in view or back on a network. */
  resume(longAway: boolean): void {
    this.room?.resume(longAway);
  }

  private refresh(): void {
    const room = this.room;
    if (!room || room.race) return;
    for (const p of this.pings) p.el.textContent = this.seatNote(room, p.seat);
    if (this.linkLine) this.linkLine.textContent = linkWords(room.ping, room.path);
  }

  /** The pill at the end of a seat's row. */
  private seatNote(room: OnlineRoom, i: number): string {
    const s = room.seats[i];
    if (!s) return '';
    if (!s.connected) return 'AWAY';
    if (i === 0) return 'HOST';
    if (room.role === 'host') {
      const p = room.seatPing(i);
      return p < 0 ? 'LINKING…' : p === 0 ? 'READY' : `${p} ms`;
    }
    if (i === room.you) return room.linked ? (room.ping ? `${room.ping} ms` : 'READY') : 'LINKING…';
    return 'READY';
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
    // only tracks that can be raced are offered
    void this.tracks().then((all) => {
      this.mine = all.filter((t) => trackProblems(t).length === 0);
      this.render();
    });
    if (join && !this.room) void this.join(join);
  }

  /** The race could not be built here (a track this game cannot make): leave, and say why. */
  fail(reason: string): void {
    this.leave();
    this.note = reason;
    this.hooks.show();
    this.render();
  }

  status(): string {
    if (!this.room) return '';
    return this.room.status();
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
      say: (text: string, good: boolean) => {
        this.notice = { text, good, until: performance.now() + NOTICE_MS };
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
    code = codeFrom(code);
    if (this.busy) return;
    if (!/^[A-Z2-9]{6}$/.test(code)) {
      this.note = 'A room code is 6 letters and numbers, like KD7M2P.';
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
      const why = e instanceof Error ? e.message : String(e);
      this.note = /no room/.test(why)
        ? `No room ${code}. Check the code, or ask the host for a new one.`
        : /started/.test(why)
          ? 'That race has already started. Ask the host to bring it back to the room.'
          : /full/.test(why)
            ? 'That room is full.'
            : why;
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
    // someone typing keeps their place when the room changes under them
    const at = document.activeElement;
    const typing =
      at instanceof HTMLInputElement && el.contains(at)
        ? { label: at.ariaLabel, value: at.value, a: at.selectionStart, b: at.selectionEnd }
        : null;
    this.pings = [];
    this.linkLine = null;
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
      const codeIn = h('input', {
        placeholder: 'ROOM CODE',
        // room for a pasted invite link: the code is picked out of it
        maxLength: 200,
        ariaLabel: 'Room code',
        autocapitalize: 'characters',
        autocomplete: 'off',
        spellcheck: false,
        enterKeyHint: 'go',
        oninput: () => {
          const code = codeFrom(codeIn.value);
          if (codeIn.value.length > 6) codeIn.value = code.slice(0, 6);
          // six good characters is a whole code: no need to find the button
          if (/^[A-Z2-9]{6}$/.test(code)) void this.join(code);
        },
        onkeydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') void this.join(codeIn.value);
        },
      });
      const back = savedRoom();
      el.append(
        ...(back ? [btn(`BACK TO ROOM ${back}`, () => void this.join(back), 'go')] : []),
        btn(this.busy ? 'OPENING…' : 'HOST A RACE', () => void this.host(), back ? '' : 'go'),
        h('p', { className: 'hint', textContent: 'You get a code to send to your friends.' }),
        h(
          'div',
          { className: 'row' },
          codeIn,
          btn('JOIN', () => void this.join(codeIn.value)),
        ),
        h('p', { className: 'hint', textContent: 'Or type a friend’s code, or paste their link.' }),
      );
    } else {
      const link = `${location.origin}${location.pathname}?room=${room.code}`;
      const say = (text: string) => {
        this.note = text;
        this.render();
      };
      const copy = () => {
        if (!navigator.clipboard) say(link);
        else
          navigator.clipboard.writeText(link).then(
            () => say('Invite link copied. Paste it to your friends.'),
            () => say(link),
          );
      };
      // a phone's own share sheet (messages, mail, nearby) where there is one
      const share = () => {
        if (!navigator.share) return copy();
        navigator
          .share({ title: 'DemoDogs', text: `Race me in DemoDogs: room ${room.code}`, url: link })
          .catch(() => {});
      };
      el.append(
        h(
          'div',
          { className: 'roomHead' },
          h('p', { className: 'roomCode' }, 'ROOM ', h('b', { textContent: room.code })),
          btn('INVITE', share, 'invite'),
          ...(typeof navigator.share === 'function' ? [btn('COPY LINK', copy, 'small')] : []),
        ),
      );
      const list = h('ul', { className: 'seats' });
      room.seats.forEach((s, i) => {
        const def = this.content.car.get(s.car);
        const note = h('span', { className: 'pill', textContent: this.seatNote(room, i) });
        this.pings.push({ seat: i, el: note });
        list.append(
          h(
            'li',
            { className: `${i === room.you ? 'me' : ''} ${s.connected ? '' : 'away'}` },
            h('span', { className: 'dot', style: `background:${s.paint}` }),
            h('span', {
              className: 'who',
              textContent: `${s.name}${i === room.you ? ' (YOU)' : ''} · ${def?.meta.name.toUpperCase() ?? s.car}`,
            }),
            note,
          ),
        );
      });
      el.append(list);
      if (room.seats.length < 2)
        el.append(
          h('p', {
            className: 'hint',
            textContent: 'No one else yet. Tap INVITE, or tell a friend the code.',
          }),
        );
      const venue = this.content.venue.get(room.venue);
      if (room.role === 'host') {
        const sel = h('select', {
          ariaLabel: 'Venue',
          onchange: () => {
            const t = this.mine.find((x) => `track:${x.id}` === sel.value);
            if (t) return room.setTrack(t, t.name);
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
              selected: !room.track && v.id === room.venue,
            }),
          );
        }
        if (this.mine.length) {
          const group = h('optgroup', { label: 'YOUR TRACKS' });
          for (const t of this.mine)
            group.append(
              h('option', {
                value: `track:${t.id}`,
                textContent: `${t.name.toUpperCase()} · your track`,
                selected: room.track?.id === t.id,
              }),
            );
          sel.append(group);
        }
        // START first: on a phone on its side the track and the chips are a scroll away
        el.append(
          btn(
            room.seats.length > 1
              ? `START RACE · ${room.seats.length} DRIVERS`
              : 'START (ON YOUR OWN)',
            () => room.begin(),
            'go',
          ),
          sel,
          modChips(this.content, room.mods, (m) => room.setMods(m)),
        );
      } else {
        el.append(
          h('p', {
            className: `waiting ${venue && room.linked ? '' : 'linking'}`,
            textContent: !venue
              ? 'CONNECTING TO THE HOST…'
              : room.linked
                ? 'YOU’RE IN · WAITING FOR THE HOST TO START'
                : 'CONNECTION LOST · RECONNECTING…',
          }),
        );
        if (venue)
          el.append(
            h('p', {
              className: 'tag',
              textContent: `${(room.trackName ? `${room.trackName} · the host’s own track` : venue.meta.name).toUpperCase()}${modLine(this.content, room.mods)}`,
            }),
          );
      }
      if (room.role === 'guest' && room.linked) {
        this.linkLine = h('p', { className: 'tag', textContent: linkWords(room.ping, room.path) });
        el.append(this.linkLine);
      }
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
    if (typing) {
      const again = [...el.querySelectorAll('input')].find((i) => i.ariaLabel === typing.label);
      if (again) {
        again.value = typing.value;
        again.focus();
        try {
          again.setSelectionRange(typing.a, typing.b);
        } catch {
          // not a text field
        }
      }
    }
  }
}
