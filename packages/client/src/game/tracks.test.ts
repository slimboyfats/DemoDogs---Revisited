import { describe, expect, it } from 'vitest';
import { TRACK_FORMAT, TRACK_VERSION, parseTrackFile, type TrackFile } from '@demodogs/shared';
import {
  copyTrack,
  linkedTrack,
  LocalTrackStore,
  newTrackId,
  packTrack,
  sameTrack,
  trackFileName,
  trackFileText,
  trackLink,
  unpackTrack,
  type KeyValue,
} from './tracks';

const track = (id: string, name = 'My Track'): TrackFile => ({
  format: TRACK_FORMAT,
  version: TRACK_VERSION,
  id,
  name,
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
  items: [{ prop: 'prop.cone', x: 500, y: 400, rot: 0 }],
  pools: [],
  bridges: [],
  surfaces: [],
  raised: [],
  areas: [],
  bots: 4,
});

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('the track store', () => {
  it('keeps tracks across a reload, newest first', async () => {
    const kv = memory();
    let clock = 0;
    const now = () => `2026-11-23T10:00:0${clock++}Z`;
    const a = new LocalTrackStore(kv, now);
    await a.put(track('aaaa'));
    await a.put(track('bbbb', 'Second'));
    const b = new LocalTrackStore(kv, now);
    expect((await b.list()).map((t) => t.id)).toEqual(['bbbb', 'aaaa']);
    expect((await b.get('aaaa'))?.items).toEqual(track('aaaa').items);
    await b.put({ ...(await b.get('aaaa'))!, name: 'Renamed' });
    expect((await b.list()).map((t) => t.name)).toEqual(['Renamed', 'Second']);
    expect((await b.get('aaaa'))?.created).toBe('2026-11-23T10:00:00Z');
    await b.remove('bbbb');
    expect((await new LocalTrackStore(kv, now).list()).map((t) => t.id)).toEqual(['aaaa']);
  });

  it('works with nowhere to store, and skips what it cannot read', async () => {
    const s = new LocalTrackStore(null, () => 'now');
    await s.put(track('cccc'));
    expect((await s.list()).length).toBe(1);
    const kv = memory();
    kv.data.set('dd-tracks-v1', JSON.stringify([{ junk: true }, track('dddd')]));
    expect((await new LocalTrackStore(kv, () => 'now').list()).map((t) => t.id)).toEqual(['dddd']);
  });
});

describe('track files', () => {
  it('are named after the track and read back the same', () => {
    expect(trackFileName(track('aaaa', 'Mud & Glory!'))).toBe('mud-glory.demodogs-track.json');
    expect(trackFileName(track('aaaa', '???'))).toBe('track.demodogs-track.json');
    const r = parseTrackFile(trackFileText(track('aaaa')));
    expect(r).toEqual({ ok: true, track: track('aaaa') });
  });

  it('new ids fit the format', () => {
    let n = 0;
    const id = newTrackId(() => (n++ % 36) / 36);
    expect(id).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe('sizes of things', () => {
  it('names a prop at another size, and reads the name back', async () => {
    const { sizedId, sizeOfId, sizeStep } = await import('@demodogs/shared');
    expect(sizedId('prop.cone')).toBe('prop.cone');
    expect(sizedId('prop.cone', 1)).toBe('prop.cone');
    expect(sizedId('prop.cone', 2)).toBe('prop.cone-x200');
    expect(sizedId('prop.cone', 0.5)).toBe('prop.cone-x50');
    expect(sizeOfId('prop.cone-x150')).toEqual(['prop.cone', 1.5]);
    expect(sizeOfId('prop.container-red-top')).toEqual(['prop.container-red-top', 1]);
    expect(sizeStep(2.1)).toBe(2);
    expect(sizeStep(9)).toBe(3);
    expect(sizeStep(0.1)).toBe(0.5);
  });
});

describe('a track in a link', () => {
  it('goes out and comes back the same', async () => {
    const t = { ...track('abcd1234'), updated: '2026-01-01T00:00:00Z' };
    t.items.push({ prop: 'prop.cone', x: 10, y: 20, rot: 1.23456789, size: 2 });
    const link = await trackLink(t, 'https://example.test/game/?edit#old');
    expect(link.startsWith('https://example.test/game/#track=')).toBe(true);
    const packed = linkedTrack(new URL(link).hash)!;
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await unpackTrack(packed);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.track.updated).toBeUndefined();
    // the same track to race, though it was saved at another time and its turns are rounded
    expect(sameTrack(back.track, t)).toBe(true);
    expect(sameTrack(back.track, { ...t, laps: 5 })).toBe(false);
    expect(back.track.items[1]).toEqual({ prop: 'prop.cone', x: 10, y: 20, rot: 1.235, size: 2 });
    expect({ ...back.track, items: [] }).toEqual({ ...track('abcd1234'), items: [] });
  });

  it('is much shorter than the file', async () => {
    const t = track('abcd1234');
    for (let i = 0; i < 300; i++) t.items.push({ prop: 'prop.cone', x: i * 3, y: i * 2, rot: 0 });
    expect((await packTrack(t)).length).toBeLessThan(trackFileText(t).length / 5);
  });

  it('says so when the link holds no track', async () => {
    expect(linkedTrack('#room=ABCD')).toBeNull();
    expect(linkedTrack('')).toBeNull();
    expect((await unpackTrack('not a track!')).ok).toBe(false);
    expect((await unpackTrack('AAAA')).ok).toBe(false);
    const other = await packTrack({ ...track('abcd1234'), format: 'something-else' } as never);
    expect((await unpackTrack(other)).ok).toBe(false);
  });

  it('a copy is a track of its own', () => {
    const t = { ...track('abcd1234', 'A'.repeat(32)), created: 'x' };
    const c = copyTrack(t, 'wxyz9876');
    expect(c.id).toBe('wxyz9876');
    expect(c.name.length).toBeLessThanOrEqual(32);
    expect(c.created).toBeUndefined();
    c.items[0]!.x = -1;
    expect(t.items[0]!.x).toBe(500);
  });
});
