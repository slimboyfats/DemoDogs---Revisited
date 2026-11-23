import { describe, expect, it } from 'vitest';
import { TRACK_FORMAT, TRACK_VERSION, parseTrackFile, type TrackFile } from '@demodogs/shared';
import { LocalTrackStore, newTrackId, trackFileName, trackFileText, type KeyValue } from './tracks';

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
