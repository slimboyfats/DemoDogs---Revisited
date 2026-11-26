import { parseTrackFile, type TrackFile } from '@demodogs/shared';

/**
 * Where tracks built in the track creator are kept. Everything goes through this interface and
 * is asynchronous, so a store on a server (a database) can stand in for the one on the device
 * without the editor or the menus changing.
 */
export interface TrackStore {
  /** Every saved track, the one changed last first. */
  list(): Promise<TrackFile[]>;
  get(id: string): Promise<TrackFile | null>;
  /** Save a track under its id, stamping when. */
  put(t: TrackFile): Promise<void>;
  remove(id: string): Promise<void>;
}

/** A plain key-value store: localStorage, or anything like it. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'dd-tracks-v1';

/** Tracks kept on this device (localStorage); in memory only where the browser will not store. */
export class LocalTrackStore implements TrackStore {
  private tracks: Map<string, TrackFile> | null = null;

  constructor(
    private readonly kv: KeyValue | null,
    private readonly now: () => string,
  ) {}

  private all(): Map<string, TrackFile> {
    if (this.tracks) return this.tracks;
    const out = new Map<string, TrackFile>();
    try {
      const saved: unknown = JSON.parse(this.kv?.getItem(KEY) ?? '[]');
      if (Array.isArray(saved))
        for (const s of saved) {
          const r = parseTrackFile(s);
          if (r.ok) out.set(r.track.id, r.track);
        }
    } catch {
      /* nothing saved that can be read */
    }
    return (this.tracks = out);
  }

  private write(): void {
    try {
      this.kv?.setItem(KEY, JSON.stringify([...this.all().values()]));
    } catch {
      /* private mode or full: the tracks last as long as the page */
    }
  }

  list(): Promise<TrackFile[]> {
    const by = (t: TrackFile) => t.updated ?? t.created ?? '';
    return Promise.resolve([...this.all().values()].sort((a, b) => (by(a) < by(b) ? 1 : -1)));
  }

  get(id: string): Promise<TrackFile | null> {
    return Promise.resolve(this.all().get(id) ?? null);
  }

  put(t: TrackFile): Promise<void> {
    const when = this.now();
    this.all().set(t.id, { ...t, created: t.created ?? when, updated: when });
    this.write();
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.all().delete(id);
    this.write();
    return Promise.resolve();
  }
}

/** A new track's id: random, and unlikely ever to meet another (it will be a database key). */
export function newTrackId(random: () => number): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += Math.floor(random() * 36).toString(36);
  return s;
}

/** The file a track is saved as. */
export function trackFileName(t: TrackFile): string {
  const slug = t.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'track'}.demodogs-track.json`;
}

/** A track as the text of its file. */
export function trackFileText(t: TrackFile): string {
  return `${JSON.stringify(t, null, 2)}\n`;
}

/** Hand a track over as a JSON file: shared where the device can, downloaded otherwise. */
export function saveTrackFile(t: TrackFile): void {
  const name = trackFileName(t);
  const file = new File([trackFileText(t)], name, { type: 'application/json' });
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  // a phone has no downloads folder worth the name: offer its share sheet (Files, Drive, mail)
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] }))
    navigator.share({ files: [file], title: name }).catch(save);
  else save();
}

/** Ask for a track file and read it. Resolves with the track, or with what is wrong with it. */
export function pickTrackFile(): Promise<
  { ok: true; track: TrackFile } | { ok: false; error: string }
> {
  return new Promise((done) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.className = 'trackFileInput';
    input.style.display = 'none';
    document.body.append(input);
    input.onchange = () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return;
      f.text().then(
        (text) => done(parseTrackFile(text)),
        () => done({ ok: false, error: 'The file could not be read.' }),
      );
    };
    input.oncancel = () => input.remove();
    input.click();
  });
}

/** A track in a link: after this in the address's hash. */
export const LINK_KEY = 'track=';
/** No link holds more than this (characters), and no track in one unpacks to more (bytes). */
const LINK_MAX = 120_000;
const UNPACKED_MAX = 1_500_000;

async function through(
  bytes: Uint8Array<ArrayBuffer>,
  by: CompressionStream | DecompressionStream,
  most: number,
): Promise<Uint8Array> {
  const reader = new Blob([bytes]).stream().pipeThrough(by).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > most) {
      await reader.cancel();
      throw new Error('too big');
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A track as a link carries it: without when it was saved, its turns rounded. */
function leanTrack(t: TrackFile): TrackFile {
  const rest = { ...t };
  delete rest.created;
  delete rest.updated;
  return {
    ...rest,
    items: t.items.map((i) => ({ ...i, rot: Math.round(i.rot * 1000) / 1000 })),
  };
}

/** Are two tracks the same to race, whenever each was saved and however it was written down? */
export function sameTrack(a: TrackFile, b: TrackFile): boolean {
  const text = (v: unknown): string =>
    JSON.stringify(v, (_k, o: unknown) =>
      o && typeof o === 'object' && !Array.isArray(o)
        ? Object.fromEntries(Object.entries(o).sort(([p], [q]) => (p < q ? -1 : 1)))
        : o,
    );
  return text(leanTrack(a)) === text(leanTrack(b));
}

/**
 * A track packed into text that can ride in a link: its JSON, squeezed, in letters an address
 * may hold. When it was saved is left out, and turns are rounded: neither changes the race.
 */
export async function packTrack(t: TrackFile): Promise<string> {
  const lean = leanTrack(t);
  const bytes = await through(
    new TextEncoder().encode(JSON.stringify(lean)),
    new CompressionStream('deflate-raw'),
    UNPACKED_MAX,
  );
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The track packed by `packTrack`, or what is wrong with it. */
export async function unpackTrack(
  text: string,
): Promise<{ ok: true; track: TrackFile } | { ok: false; error: string }> {
  const bad = { ok: false as const, error: 'The link does not hold a track that can be read.' };
  if (text.length > LINK_MAX || !/^[A-Za-z0-9_-]+$/.test(text)) return bad;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = await through(bytes, new DecompressionStream('deflate-raw'), UNPACKED_MAX);
    return parseTrackFile(new TextDecoder().decode(json));
  } catch {
    return bad;
  }
}

/** The link that opens the game with this track in hand. `page` is the game's own address. */
export async function trackLink(t: TrackFile, page: string): Promise<string> {
  return `${page.replace(/[#?].*$/, '')}#${LINK_KEY}${await packTrack(t)}`;
}

/** The packed track in an address's hash ("#track=..."), or null if it holds none. */
export function linkedTrack(hash: string): string | null {
  const h = hash.replace(/^#/, '');
  return h.startsWith(LINK_KEY) ? h.slice(LINK_KEY.length) : null;
}

/**
 * Hand a track over as a link: the phone's share sheet where there is one, the clipboard
 * otherwise. Resolves with what was done, for the screen to say.
 */
export async function shareTrackLink(t: TrackFile): Promise<'shared' | 'copied' | 'failed'> {
  const url = await trackLink(t, location.href);
  if (matchMedia('(pointer: coarse)').matches && navigator.share)
    try {
      await navigator.share({ title: t.name, text: `Race my DemoDogs track: ${t.name}`, url });
      return 'shared';
    } catch (e) {
      // the sheet was closed: that is an answer, not a failure
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** A copy of a track under a new id and name, to change without losing the first. */
export function copyTrack(t: TrackFile, id: string): TrackFile {
  const rest = structuredClone(t);
  delete rest.created;
  delete rest.updated;
  return { ...rest, id, name: `${t.name} copy`.slice(0, 32) };
}
