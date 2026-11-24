import { describe, expect, it } from 'vitest';
import { TRACK_FORMAT, TRACK_VERSION, type PeerMessage, type TrackFile } from '@demodogs/shared';
import { CHUNK, linkPair } from './link';

const track = (things: number): TrackFile => ({
  format: TRACK_FORMAT,
  version: TRACK_VERSION,
  id: 'online-test',
  name: 'Online Test',
  laps: 3,
  seed: 1,
  size: { w: 1400, h: 960 },
  road: {
    width: 72,
    points: [
      [300, 300],
      [1100, 300],
      [1100, 700],
      [300, 700],
    ],
  },
  colors: { ground: '#4f7a37', ground2: '#5c8a3f', dirt: '#8a6d45', outside: '#2d3a24' },
  dressing: [],
  items: Array.from({ length: things }, (_, i) => ({
    prop: 'prop.cone',
    x: 100 + (i % 40) * 30,
    y: 100 + Math.floor(i / 40) * 25,
    rot: i * 0.1,
  })),
  pools: [{ material: 'material.mud', x: 700, y: 480, r: 20 }],
  bridges: [],
  surfaces: [{ material: 'material.ice', x0: 500, y0: 300, x1: 900, y1: 300 }],
  raised: [],
  areas: [{ x: 400, y: 300, r: 260, material: 'material.snow', sky: 'snow' }],
  bots: 4,
});

const start = (t: TrackFile): PeerMessage => ({
  type: 'start',
  seed: 7,
  venue: 'venue.custom-online-test',
  mods: [],
  track: t,
  seats: [{ name: 'HOST', car: 'car.mutt', paint: '#ffd24a', connected: true }],
  you: 0,
  log: [],
  upTo: 0,
});

describe('a race on the host’s own track', () => {
  it('the whole track reaches the guest with the start, however big it is', () => {
    const [a, b] = linkPair('local', true);
    const got: PeerMessage[] = [];
    b.onMessage = (m) => got.push(m);
    // as many things as a track can hold: many frames on the wire
    const big = track(1200);
    expect(JSON.stringify(start(big)).length).toBeGreaterThan(CHUNK * 2);
    a.send(start(big));
    a.send(start(track(3)));
    expect(got.length).toBe(2);
    expect(got[0]!.type === 'start' && got[0]!.track).toEqual(big);
    expect(got[1]!.type === 'start' && got[1]!.track?.items.length).toBe(3);
  });

  it('a start that carries something that is not a track is dropped', () => {
    const [a, b] = linkPair('local', true);
    const got: PeerMessage[] = [];
    b.onMessage = (m) => got.push(m);
    const bad = { ...start(track(1)), track: { format: 'something-else' } };
    a.send(bad as unknown as PeerMessage);
    expect(got.length).toBe(0);
  });

  it('the lobby tells guests the track’s name, not the track', () => {
    const [a, b] = linkPair('local', true);
    const got: PeerMessage[] = [];
    b.onMessage = (m) => got.push(m);
    a.send({ type: 'lobby', venue: 'venue.kennel-loop', track: 'Online Test', seats: [], you: 1 });
    expect(got[0]!.type === 'lobby' && got[0]!.track).toBe('Online Test');
  });
});
