import { loadContent } from '@demodogs/content';
import { packControls, type Controls, type PeerMessage } from '@demodogs/shared';
import { World } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { linkPair, roughFlags, roughLink } from './link';
import { GuestRace, HASH_EVERY, HostRace, RESYNC, RESYNC_GAP, type Stepper } from './lockstep';

const content = loadContent();
const humans = [{ car: 'car.whippet', name: 'TWO', paint: '#3fa9f5' }];
const make = (you: number) =>
  new World({ content, venue: 'venue.kennel-loop', car: 'car.mutt', seed: 11, humans, you });
const stepper = (w: World): Stepper => ({ step: (s) => w.stepSeats(s), hash: () => w.hash() });
/** A driver that weaves and fires now and then, different for each seat. */
const drive = (seat: number, t: number): Controls => ({
  steer: Math.sin(t / (20 + seat * 7)),
  throttle: 1,
  brake: false,
  boost: t % 300 > 250,
  fire: t % 97 === seat * 13,
});

describe('online lockstep', () => {
  it('two peers in one race end up with the same world, tick for tick', () => {
    const hw = make(0);
    const gw = make(1);
    expect(hw.player.seat).toBe(0);
    expect(gw.player.seat).toBe(1);
    const [hl, gl] = linkPair('local', true);
    const toGuest: PeerMessage[] = [];
    gl.onMessage = (m) => toGuest.push(m);
    const host = new HostRace(2, () => ({
      type: 'start',
      seed: 11,
      venue: 'v',
      seats: [],
      you: 1,
      log: [],
      upTo: 0,
    }));
    const sent: PeerMessage[] = [];
    const guest = new GuestRace(1, 2, [], 0, (m) => sent.push(m));
    host.attach(1, hl, 0);
    const hs = stepper(hw);
    const gs = stepper(gw);
    for (let t = 0; t < 1800; t++) {
      // the guest sends its controls; they reach the host a few ticks later
      guest.local(drive(1, t));
      for (const m of sent.splice(0)) if (t % 3 === 0 || m.type !== 'ctl') host.handle(1, m);
      host.local(drive(0, t));
      host.stepOnce(hs);
      for (const m of toGuest.splice(0)) if (m.type === 'tick') guest.receive(m.upTo, m.log);
      guest.pump(1 / 60, gs);
    }
    while (guest.lag > 0) guest.pump(1 / 60, gs);
    expect(guest.t).toBe(host.t);
    expect(gw.hash()).toBe(hw.hash());
    expect(host.desyncs).toBe(0);
    expect(hw.cars.map((c) => Math.round(c.progress))).toEqual(
      gw.cars.map((c) => Math.round(c.progress)),
    );
    // both humans actually drove
    expect(hw.humans[1]!.progress).toBeGreaterThan(500);
    // (two worlds of eight cars, 30 seconds each: more than the default five when the box is busy)
  }, 30000);

  it('a guest never runs past its leave, and catches up fast when far behind', () => {
    const gw = make(1);
    const guest = new GuestRace(1, 2, [], 0, () => {});
    guest.pump(1, stepper(gw));
    expect(guest.t).toBe(0);
    guest.receive(200, [
      5,
      0,
      packControls({ steer: 0, throttle: 1, brake: false, boost: false, fire: false }),
    ]);
    guest.pump(1 / 60, stepper(gw));
    expect(guest.t).toBe(60);
  });

  it('asks for the race again when a change arrives for a tick it already ran, and the host resends', () => {
    const sent: PeerMessage[] = [];
    const guest = new GuestRace(1, 2, [], 10, (m) => sent.push(m));
    guest.pump(1, stepper(make(1)));
    guest.receive(20, [3, 1, 0]);
    expect(sent.at(-1)).toMatchObject({ type: 'hash', h: RESYNC });
    const [hl, gl] = linkPair('local', true);
    const got: PeerMessage[] = [];
    gl.onMessage = (m) => got.push(m);
    const host = new HostRace(2, () => ({
      type: 'start',
      seed: 1,
      venue: 'v',
      seats: [],
      you: 1,
      log: [],
      upTo: 0,
    }));
    host.attach(1, hl, -1);
    expect(got.at(-1)?.type).toBe('start');
    host.handle(1, { type: 'hash', t: HASH_EVERY, h: RESYNC });
    expect(host.desyncs).toBe(1);
    expect(got.at(-1)?.type).toBe('start');
  });

  it('sends the race again once, not for every hash already on its way', () => {
    const [hl, gl] = linkPair('local', true);
    const got: PeerMessage[] = [];
    gl.onMessage = (m) => got.push(m);
    const host = new HostRace(2, () => ({
      type: 'start',
      seed: 1,
      venue: 'v',
      seats: [],
      you: 1,
      log: [],
      upTo: 0,
    }));
    host.attach(1, hl, 0);
    const nothing: Stepper = { step: () => {}, hash: () => 'h' };
    const starts = () => got.filter((m) => m.type === 'start').length;
    host.handle(1, { type: 'hash', t: 0, h: RESYNC });
    host.handle(1, { type: 'hash', t: 0, h: RESYNC });
    expect(starts()).toBe(1);
    expect(host.desyncs).toBe(1);
    for (let i = 0; i < RESYNC_GAP; i++) host.stepOnce(nothing);
    host.handle(1, { type: 'hash', t: 0, h: RESYNC });
    expect(starts()).toBe(2);
  });

  /** A guest fed leaves in bursts (a jittery link), frame by frame: how many frames it stood still. */
  const jittery = (burst: number) => {
    const counter: Stepper = { step: () => {}, hash: () => '' };
    const guest = new GuestRace(1, 2, [], 0, () => {});
    let stood = 0;
    let longest = 0;
    let run = 0;
    for (let f = 1; f <= 1200; f++) {
      // the host is a tick a frame ahead; its leaves reach the guest only every `burst` frames
      if (f % burst === 0) guest.receive(f, []);
      const before = guest.t;
      guest.pump(1 / 60, counter);
      if (f > 300) {
        if (guest.t === before) {
          stood++;
          run++;
          longest = Math.max(longest, run);
        } else run = 0;
      }
    }
    return { guest, stood, longest };
  };

  it('rides out a jittery link by holding a few ticks back, instead of stopping and lurching', () => {
    // leaves every 6 frames (100 ms apart): without a buffer the guest would stand 5 frames in 6
    const { guest, stood } = jittery(6);
    expect(stood).toBeLessThan(12);
    // no further back than the jitter needs
    expect(guest.lag).toBeLessThanOrEqual(12);
    // and on a steady link it holds next to nothing back
    const steady = jittery(2);
    expect(steady.stood).toBeLessThan(12);
    expect(steady.guest.lag).toBeLessThanOrEqual(4);
  });

  it('a rough link delivers late and in order', () => {
    const [a, b] = linkPair('local', true);
    const got: number[] = [];
    b.onMessage = (m) => m.type === 'ping' && got.push(m.n);
    let now = 0;
    const queue: { at: number; fn: () => void }[] = [];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const rough = roughLink(
      a,
      roughFlags('?lag=100&jitter=80')!,
      rand,
      () => now,
      (fn, ms) => queue.push({ at: now + ms, fn }),
    );
    for (let i = 0; i < 50; i++) {
      now = i * 10;
      rough.send({ type: 'ping', n: i });
    }
    expect(got).toEqual([]);
    for (const q of queue) expect(q.at).toBeGreaterThanOrEqual(50);
    queue.sort((x, y) => x.at - y.at);
    for (const q of queue) q.fn();
    expect(got).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(roughFlags('?room=ABCDEF')).toBeNull();
  });
});
