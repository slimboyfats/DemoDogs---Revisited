import { loadContent } from '@demodogs/content';
import { packControls, type Controls, type PeerMessage } from '@demodogs/shared';
import { World } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { linkPair } from './link';
import { GuestRace, HASH_EVERY, HostRace, RESYNC, type Stepper } from './lockstep';

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
    const host = new HostRace(2, () => ({ type: 'start', seed: 11, venue: 'v', seats: [], you: 1, log: [], upTo: 0 }));
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
    expect(hw.cars.map((c) => Math.round(c.progress))).toEqual(gw.cars.map((c) => Math.round(c.progress)));
    // both humans actually drove
    expect(hw.humans[1]!.progress).toBeGreaterThan(500);
  });

  it('a guest never runs past its leave, and catches up fast when far behind', () => {
    const gw = make(1);
    const guest = new GuestRace(1, 2, [], 0, () => {});
    guest.pump(1, stepper(gw));
    expect(guest.t).toBe(0);
    guest.receive(200, [5, 0, packControls({ steer: 0, throttle: 1, brake: false, boost: false, fire: false })]);
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
    const host = new HostRace(2, () => ({ type: 'start', seed: 1, venue: 'v', seats: [], you: 1, log: [], upTo: 0 }));
    host.attach(1, hl, -1);
    expect(got.at(-1)?.type).toBe('start');
    host.handle(1, { type: 'hash', t: HASH_EVERY, h: RESYNC });
    expect(host.desyncs).toBe(1);
    expect(got.at(-1)?.type).toBe('start');
  });
});
