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
