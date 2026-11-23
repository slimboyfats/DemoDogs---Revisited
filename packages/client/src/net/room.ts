import {
  MAX_HUMANS,
  PROTOCOL_VERSION,
  type PeerMessage,
  type RoomUpdate,
  type Seat,
  type TrackFile,
} from '@demodogs/shared';
import { customVenueId } from '@demodogs/sim';
import type { Link } from './link';
import { GuestRace, HostRace, type NetRace } from './lockstep';
import { RoomNet } from './rtc';
import type { SignalClient } from './signal';

/** Everything a peer needs to build the race world. */
export interface RaceStart {
  seed: number;
  venue: string;
  /** World modifiers on for the race: the same list on every peer. */
  mods: string[];
  /** The host's own track, when the race is on one: `venue` is the venue it installs as. */
  track?: TrackFile;
  seats: Seat[];
  you: number;
}

export interface RoomHooks {
  /** Seats, venue or link state changed: redraw the lobby. */
  change(): void;
  /** Build the race (again, for a rejoin or a resync) and drive it with `race`. */
  start(s: RaceStart, race: NetRace): void;
  /** The host took everyone back to the lobby. */
  lobby(): void;
  /** The room is gone (host left, refused, kicked). */
  closed(reason: string): void;
}

export interface Me {
  name: string;
  car: string;
}

/** One paint per seat, so drivers can tell each other apart on the minimap. */
export const SEAT_PAINTS = ['#ffd24a', '#3fa9f5', '#ff5a4f', '#7ddc4b', '#c47cff', '#ff9a2e'];

/** A link silent this long is dead (pings go every second). */
const SILENCE_MS = 6000;

/**
 * One online room, host or guest, on top of the lobby server and the peer links: seats and the
 * venue in the lobby, then the race. The host owns the truth (seats, seed, the race log); guests
 * mirror it.
 */
export class OnlineRoom {
  code = '';
  venue: string;
  /** World modifiers the host has switched on. */
  mods: string[] = [];
  /** Host: a track of their own to race on instead of the venue. Guests know only its name. */
  track: TrackFile | null = null;
  trackName = '';
  seats: Seat[] = [];
  you = 0;
  race: HostRace | GuestRace | null = null;
  start: RaceStart | null = null;
  /** Round trip to the host (guests), ms. */
  ping = 0;
  path = '';
  private readonly net: RoomNet;
  private readonly offs: (() => void)[] = [];
  private readonly timer: ReturnType<typeof setInterval>;
  private closedWith: string | null = null;
  // host
  private readonly seatPeer: (string | null)[] = [];
  private readonly links = new Map<string, { link: Link; heard: number }>();
  // guest
  private hostId = '';
  private link: Link | null = null;
  private heard = 0;
  private pingN = 0;
  private pingAt = 0;

  private constructor(
    readonly role: 'host' | 'guest',
    readonly signal: SignalClient,
    private me: Me,
    private readonly hash: string,
    private readonly hooks: RoomHooks,
    venue: string,
  ) {
    this.venue = venue;
    this.net = new RoomNet(signal, role);
    this.net.onLink = (link, peer, path) =>
      role === 'host' ? this.hostLink(link, peer) : this.guestLink(link, path);
    this.offs.push(
      signal.on('roomUpdate', (m) => this.roomUpdate(m)),
      signal.on('error', (m) => {
        if (m.code === 'notFound' && this.code) this.close(m.reason);
      }),
    );
    this.timer = setInterval(() => this.heartbeat(), 1000);
  }

  /** Open a room on the lobby server; guests join with its code. */
  static async host(
    signal: SignalClient,
    me: Me,
    hash: string,
    venue: string,
    hooks: RoomHooks,
    summary: string,
  ): Promise<OnlineRoom> {
    await signal.connect();
    const r = new OnlineRoom('host', signal, me, hash, hooks, venue);
    r.seats = [{ name: me.name, car: me.car, paint: SEAT_PAINTS[0]!, connected: true }];
    r.seatPeer.push(signal.id);
    signal.send({
      type: 'createRoom',
      name: `${me.name}'s room`,
      public: false,
      maxPlayers: MAX_HUMANS,
      summary,
      region: region(),
    });
    const up = await signal.next('roomUpdate');
    r.code = up.code;
    return r;
  }

  static async join(
    signal: SignalClient,
    me: Me,
    hash: string,
    code: string,
    hooks: RoomHooks,
  ): Promise<OnlineRoom> {
    await signal.connect();
    const r = new OnlineRoom('guest', signal, me, hash, hooks, '');
    let rejoin = false;
    try {
      rejoin = sessionStorage.getItem('dd-room') === code;
    } catch {
      // private mode
    }
    signal.send({ type: 'joinRoom', code, rejoin });
    const up = await signal.next('roomUpdate');
    r.code = up.code;
    r.hostId = up.host;
    try {
      sessionStorage.setItem('dd-room', code);
    } catch {
      // private mode
    }
    r.net.requestLink(up.host);
    return r;
  }

  get linked(): boolean {
    return this.role === 'host' || (this.link?.open ?? false);
  }

  /** Change this player's name or car in the lobby. */
  pick(me: Me): void {
    this.me = me;
    if (this.race) return;
    if (this.role === 'host') {
      this.seats[0] = { ...this.seats[0]!, name: me.name, car: me.car };
      this.broadcastLobby();
    } else this.link?.send({ type: 'pick', name: me.name, car: me.car });
  }

  /** Host: pick the venue. */
  setVenue(v: string, summary: string): void {
    if (this.role !== 'host' || this.race) return;
    this.venue = v;
    this.setTrack(null, summary);
  }

  /** Host: race on a track of their own (null: back to the venue). It is sent when the race starts. */
  setTrack(t: TrackFile | null, summary: string): void {
    if (this.role !== 'host' || this.race) return;
    this.track = t;
    this.trackName = t?.name ?? '';
    this.signal.send({
      type: 'roomSettings',
      name: `${this.me.name}'s room`,
      public: false,
      maxPlayers: MAX_HUMANS,
      summary,
    });
    this.broadcastLobby();
  }

  /** Host: switch world modifiers on or off for the next race. */
  setMods(mods: string[]): void {
    if (this.role !== 'host' || this.race) return;
    this.mods = [...mods].sort();
    this.broadcastLobby();
  }

  /** Host: everyone in the lobby goes racing. */
  begin(): void {
    if (this.role !== 'host' || this.race) return;
    // a seat whose link is down doesn't race
    for (let i = this.seats.length - 1; i > 0; i--) if (!this.seats[i]!.connected) this.dropSeat(i);
    const start: RaceStart = {
      seed: Math.floor(Math.random() * 2 ** 31),
      venue: this.track ? customVenueId(this.track.id) : this.venue,
      mods: [...this.mods],
      ...(this.track ? { track: structuredClone(this.track) } : {}),
      seats: this.seats.map((s) => ({ ...s })),
      you: 0,
    };
    this.start = start;
    const race: HostRace = new HostRace(start.seats.length, (seat): PeerMessage => ({
      type: 'start',
      seed: start.seed,
      venue: start.venue,
      mods: start.mods,
      ...(start.track ? { track: start.track } : {}),
      seats: start.seats,
      you: seat,
      log: race.log,
      upTo: race.t,
    }));
    this.race = race;
    for (let seat = 1; seat < this.seatPeer.length; seat++) {
      const l = this.links.get(this.seatPeer[seat] ?? '');
      if (l) race.attach(seat, l.link, -1);
    }
    this.signal.send({ type: 'startMatch', started: true });
    this.hooks.start(start, race);
  }

  /** Host: the race is over, back to the lobby for another. */
  backToLobby(): void {
    if (this.role !== 'host') return;
    this.race = null;
    this.start = null;
    for (const { link } of this.links.values()) link.send({ type: 'lobbyAgain' });
    this.signal.send({ type: 'startMatch', started: false });
    for (let i = this.seats.length - 1; i > 0; i--) if (!this.seats[i]!.connected) this.dropSeat(i);
    this.broadcastLobby();
  }

  status(): string {
    if (this.closedWith) return this.closedWith;
    if (this.role === 'host') return this.race ? this.race.status() : `ROOM ${this.code}`;
    if (!this.link?.open) return 'reaching the host…';
    return this.race ? this.race.status() : `${this.ping} ms · ${this.path}`;
  }

  leave(): void {
    if (this.role === 'host')
      for (const { link } of this.links.values())
        link.send({ type: 'bye', reason: 'the host closed the room' });
    else this.link?.send({ type: 'bye', reason: 'left' });
    try {
      sessionStorage.removeItem('dd-room');
    } catch {
      // private mode
    }
    this.signal.send({ type: 'leaveRoom' });
    this.dispose();
  }

  private dispose(): void {
    clearInterval(this.timer);
    for (const off of this.offs) off();
    this.net.close();
    for (const { link } of this.links.values()) link.close();
    this.link?.close();
  }

  private close(reason: string): void {
    if (this.closedWith) return;
    this.closedWith = reason;
    this.dispose();
    this.hooks.closed(reason);
  }

  private roomUpdate(m: RoomUpdate): void {
    if (m.code !== this.code) return;
    if (this.role === 'guest') {
      this.hostId = m.host;
      return;
    }
    // members the server no longer lists have left for good
    const ids = new Set(m.members.map((x) => x.id));
    for (let i = this.seatPeer.length - 1; i > 0; i--) {
      const p = this.seatPeer[i];
      if (p && !ids.has(p) && !this.race) this.dropSeat(i);
    }
    this.broadcastLobby();
  }

  private heartbeat(): void {
    const now = performance.now();
    if (this.role === 'host') {
      for (const [peer, l] of this.links)
        if (now - l.heard > SILENCE_MS) {
          console.info(`[net] ${peer} went quiet`);
          l.link.close();
        }
      return;
    }
    if (this.link?.open) {
      if (now - this.heard > SILENCE_MS) {
        this.link.close();
        return;
      }
      this.pingAt = now;
      this.link.send({ type: 'ping', n: ++this.pingN });
    }
  }

  // ── host ──

  private seatOf(peer: string): number {
    return this.seatPeer.indexOf(peer);
  }

  private dropSeat(i: number): void {
    this.seats.splice(i, 1);
    this.seatPeer.splice(i, 1);
  }

  private hostLink(link: Link, peer: string): void {
    const old = this.links.get(peer);
    if (old && old.link !== link) old.link.close();
    const entry = { link, heard: performance.now() };
    this.links.set(peer, entry);
    link.onMessage = (m) => {
      entry.heard = performance.now();
      this.fromGuest(peer, link, m);
    };
    link.onClose = () => {
      if (this.links.get(peer)?.link !== link) return;
      this.links.delete(peer);
      const seat = this.seatOf(peer);
      if (seat < 0) return;
      this.seats[seat] = { ...this.seats[seat]!, connected: false };
      if (this.race instanceof HostRace) this.race.detach(seat);
      else this.dropSeat(seat);
      this.broadcastLobby();
    };
  }

  private fromGuest(peer: string, link: Link, m: PeerMessage): void {
    let seat = this.seatOf(peer);
    switch (m.type) {
      case 'join': {
        if (m.protocolVersion !== PROTOCOL_VERSION || m.contentHash !== this.hash) {
          link.send({ type: 'bye', reason: 'Your game is a different version: reload the page.' });
          return;
        }
        if (seat < 0) {
          if (this.race) {
            link.send({ type: 'bye', reason: 'That race has already started.' });
            return;
          }
          if (this.seats.length >= MAX_HUMANS) {
            link.send({ type: 'bye', reason: 'The room is full.' });
            return;
          }
          seat = this.seats.length;
          this.seatPeer.push(peer);
          this.seats.push({
            name: m.name,
            car: m.car,
            paint: SEAT_PAINTS[seat % SEAT_PAINTS.length]!,
            connected: true,
          });
        } else {
          this.seats[seat] = { ...this.seats[seat]!, connected: true };
          if (!this.race) this.seats[seat] = { ...this.seats[seat]!, name: m.name, car: m.car };
        }
        if (this.race instanceof HostRace) this.race.attach(seat, link, m.haveTick);
        this.broadcastLobby();
        return;
      }
      case 'pick':
        if (seat > 0 && !this.race) {
          this.seats[seat] = { ...this.seats[seat]!, name: m.name, car: m.car };
          this.broadcastLobby();
        }
        return;
      case 'ctl':
      case 'hash':
        if (seat > 0 && this.race instanceof HostRace) this.race.handle(seat, m);
        return;
      case 'ping':
        link.send({ type: 'pong', n: m.n });
        return;
      case 'bye':
        link.close();
        return;
      default:
        return;
    }
  }

  private broadcastLobby(): void {
    for (let seat = 1; seat < this.seatPeer.length; seat++) {
      const l = this.links.get(this.seatPeer[seat] ?? '');
      l?.link.send({
        type: 'lobby',
        venue: this.venue,
        mods: this.mods,
        ...(this.track ? { track: this.track.name } : {}),
        seats: this.seats,
        you: seat,
      });
    }
    this.hooks.change();
  }

  // ── guest ──

  private guestLink(link: Link, path: string): void {
    this.link?.close();
    this.link = link;
    this.path = path;
    this.heard = performance.now();
    link.onMessage = (m) => {
      this.heard = performance.now();
      this.fromHost(m);
    };
    link.onClose = () => {
      if (this.link !== link) return;
      this.link = null;
      this.hooks.change();
      // ask the host to dial again (the server keeps our seat for a while)
      if (!this.closedWith)
        setTimeout(() => !this.closedWith && this.net.requestLink(this.hostId), 1000);
    };
    link.send({
      type: 'join',
      protocolVersion: PROTOCOL_VERSION,
      contentHash: this.hash,
      name: this.me.name,
      car: this.me.car,
      haveTick: this.race instanceof GuestRace ? this.race.t : -1,
    });
    this.hooks.change();
  }

  private fromHost(m: PeerMessage): void {
    switch (m.type) {
      case 'lobby':
        this.venue = m.venue;
        this.mods = m.mods ?? [];
        this.trackName = m.track ?? '';
        this.seats = m.seats;
        this.you = m.you;
        this.hooks.change();
        return;
      case 'start': {
        this.start = {
          seed: m.seed,
          venue: m.venue,
          mods: m.mods ?? [],
          ...(m.track ? { track: m.track } : {}),
          seats: m.seats,
          you: m.you,
        };
        this.seats = m.seats;
        this.you = m.you;
        const race = new GuestRace(m.you, m.seats.length, m.log, m.upTo, (x) => this.link?.send(x));
        race.path = this.path;
        this.race = race;
        this.hooks.start(this.start, race);
        return;
      }
      case 'tick':
        if (this.race instanceof GuestRace) this.race.receive(m.upTo, m.log);
        return;
      case 'lobbyAgain':
        this.race = null;
        this.start = null;
        this.hooks.lobby();
        return;
      case 'ping':
        this.link?.send({ type: 'pong', n: m.n });
        return;
      case 'pong':
        if (m.n === this.pingN) {
          this.ping = Math.round(performance.now() - this.pingAt);
          if (this.race instanceof GuestRace) this.race.ping = this.ping;
        }
        return;
      case 'bye':
        this.close(m.reason);
        return;
      default:
        return;
    }
  }
}

/** A rough region for the room list, from the time zone (no location lookup). */
function region(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.split('/')[0] ?? '';
  } catch {
    return '';
  }
}
