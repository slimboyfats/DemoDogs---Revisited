// Ported from mudders (packages/client/src/net).
import type { LinkPath } from '@demodogs/shared';
import { TextLink, type Link } from './link';
import type { SignalClient } from './signal';

/**
 * The connection ladder: a direct WebRTC data channel via public STUN first, and if that
 * isn't open within `RELAY_AFTER_MS`, the signalling server's WebSocket relay. Both end up as the
 * same `Link`, so the game layer never knows which one it got. The host dials; guests answer.
 */
export const RELAY_AFTER_MS = 5000;

/**
 * Frames on the relay channel. Control frames start with \u0002, data frames with \u0003; neither
 * is valid JSON. Each relay link has an epoch chosen by the host, carried by every frame, so a
 * replaced link's late frames (or its goodbye) never reach the link that replaced it.
 */
const HI = '\u0002hi';
const GO_RELAY = '\u0002relay:';
const BYE = '\u0002bye:';
const DATA = '\u0003';

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/**
 * ICE servers: `VITE_ICE_SERVERS` (JSON array) overrides the public STUN default
 * (a "configurable list"). `?ice=none` uses none (headless tests on one machine); `?relay=1` skips
 * WebRTC entirely to exercise the relay.
 */
export function netFlags(): { iceServers: RTCIceServer[]; forceRelay: boolean } {
  const q = new URLSearchParams(location.search);
  let ice = DEFAULT_ICE;
  const env = import.meta.env.VITE_ICE_SERVERS;
  if (env) {
    try {
      ice = JSON.parse(env) as RTCIceServer[];
    } catch {
      console.warn('VITE_ICE_SERVERS is not valid JSON; using public STUN');
    }
  }
  if (q.get('ice') === 'none') ice = [];
  return { iceServers: ice, forceRelay: q.get('relay') === '1' };
}

/** Wrap an open data channel (and its connection) as a Link. */
function channelLink(pc: RTCPeerConnection, dc: RTCDataChannel): TextLink {
  const link = new TextLink(
    'p2p',
    (t) => {
      if (dc.readyState === 'open') dc.send(t);
    },
    () => {
      dc.close();
      pc.close();
    },
  );
  dc.onmessage = (e) => link.receive(String(e.data));
  dc.onclose = () => link.closed();
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') link.closed();
  });
  return link;
}

/** A Link over the signalling server's relay to one peer. */
function relayLink(signal: SignalClient, to: string, epoch: number): TextLink {
  return new TextLink(
    'relay',
    (data) => signal.send({ type: 'relay', to, data: `${DATA}${epoch}|${data}` }),
    () => signal.send({ type: 'relay', to, data: `${BYE}${epoch}` }),
  );
}

interface Attempt {
  pc: RTCPeerConnection | null;
  relay: TextLink | null;
  epoch: number;
  done: boolean;
}

/**
 * Online transport for one side of a room. The host calls `onLink` for each guest connection; the
 * guest's `onLink` fires each time its link to the host is (re)established.
 */
export class RoomNet {
  onLink: ((link: Link, peer: string, path: LinkPath) => void) | null = null;
  private readonly attempts = new Map<string, Attempt>();
  private readonly offs: (() => void)[] = [];
  private readonly flags = netFlags();
  private epoch = Math.floor(Math.random() * 1e6);

  constructor(
    private readonly signal: SignalClient,
    readonly role: 'host' | 'guest',
  ) {
    this.offs.push(
      signal.on('relay', (m) => this.onRelay(m.from, m.data)),
      signal.on('offer', (m) => void this.onOffer(m.from, m.sdp)),
      signal.on('answer', (m) => {
        const pc = this.attempts.get(m.from)?.pc;
        pc?.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch(() => {});
      }),
      signal.on('ice', (m) => {
        const pc = this.attempts.get(m.from)?.pc;
        if (!pc || !m.candidate) return;
        pc.addIceCandidate(JSON.parse(m.candidate) as RTCIceCandidateInit).catch(() => {});
      }),
    );
  }

  /** Guest: ask the host to (re)dial us. */
  requestLink(host: string): void {
    this.signal.send({ type: 'relay', to: host, data: HI });
  }

  private onRelay(from: string, data: string): void {
    const a = this.attempts.get(from);
    if (data === HI) {
      if (this.role === 'host') void this.dial(from);
      return;
    }
    if (data.startsWith(GO_RELAY)) {
      const epoch = Number(data.slice(GO_RELAY.length));
      if (this.role === 'guest') this.useRelay(from, performance.now(), epoch);
      return;
    }
    if (data.startsWith(BYE)) {
      if (a && a.epoch === Number(data.slice(BYE.length))) a.relay?.closed();
      return;
    }
    if (!data.startsWith(DATA) || !a?.relay) return;
    const bar = data.indexOf('|');
    if (Number(data.slice(DATA.length, bar)) !== a.epoch) return;
    a.relay.receive(data.slice(bar + 1));
  }

  private reset(peer: string): Attempt {
    const old = this.attempts.get(peer);
    if (old && !old.done) {
      old.done = true;
      old.pc?.close();
    }
    const a: Attempt = { pc: null, relay: null, epoch: -1, done: false };
    this.attempts.set(peer, a);
    return a;
  }

  private opened(peer: string, link: Link, t0: number): void {
    const ms = Math.round(performance.now() - t0);
    console.info(`[net] link to ${peer} open via ${link.path} in ${ms} ms`);
    if (this.role === 'host') this.signal.send({ type: 'path', path: link.path, ms });
    this.onLink?.(link, peer, link.path);
  }

  private useRelay(peer: string, t0: number, epoch: number): void {
    const a = this.reset(peer);
    a.done = true;
    a.epoch = epoch;
    a.relay = relayLink(this.signal, peer, epoch);
    this.opened(peer, a.relay, t0);
  }

  /** Host: switch a guest to the relay (the guest follows when it sees GO_RELAY). */
  private goRelay(peer: string, t0: number): void {
    const epoch = ++this.epoch;
    this.signal.send({ type: 'relay', to: peer, data: `${GO_RELAY}${epoch}` });
    this.useRelay(peer, t0, epoch);
  }

  private newPc(peer: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.flags.iceServers });
    pc.onicecandidate = (e) =>
      this.signal.send({
        type: 'ice',
        to: peer,
        candidate: e.candidate ? JSON.stringify(e.candidate.toJSON()) : null,
      });
    return pc;
  }

  /** Host: connect to a guest, P2P first, relay after `RELAY_AFTER_MS`. */
  async dial(peer: string): Promise<void> {
    const t0 = performance.now();
    if (this.flags.forceRelay) {
      this.goRelay(peer, t0);
      return;
    }
    const a = this.reset(peer);
    const pc = this.newPc(peer);
    a.pc = pc;
    const dc = pc.createDataChannel('demodogs', { ordered: true });
    const timer = setTimeout(() => {
      if (a.done) return;
      // no direct path: fall back to the relay
      this.goRelay(peer, t0);
    }, RELAY_AFTER_MS);
    dc.onopen = () => {
      if (a.done) return;
      a.done = true;
      clearTimeout(timer);
      this.opened(peer, channelLink(pc, dc), t0);
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signal.send({ type: 'offer', to: peer, sdp: offer.sdp ?? '' });
  }

  /** Guest: answer the host's offer; the link opens with the host's data channel. */
  private async onOffer(peer: string, sdp: string): Promise<void> {
    if (this.role !== 'guest') return;
    const t0 = performance.now();
    const a = this.reset(peer);
    const pc = this.newPc(peer);
    a.pc = pc;
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      dc.onopen = () => {
        if (a.done) return;
        a.done = true;
        this.opened(peer, channelLink(pc, dc), t0);
      };
    };
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.signal.send({ type: 'answer', to: peer, sdp: answer.sdp ?? '' });
  }

  close(): void {
    for (const off of this.offs) off();
    for (const a of this.attempts.values()) {
      a.pc?.close();
      a.relay?.close();
    }
    this.attempts.clear();
  }
}
