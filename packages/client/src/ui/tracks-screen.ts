import type { TrackFile } from '@demodogs/shared';
import { newTrack, sampleTrack, type Content } from '@demodogs/sim';
import {
  copyTrack,
  newTrackId,
  pickTrackFile,
  saveTrackFile,
  shareTrackLink,
  type TrackStore,
} from '../game/tracks';

export interface TracksHooks {
  edit(t: TrackFile): void;
  race(t: TrackFile): void;
  back(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** A track as a small map: its ground, its road, where the race starts and what was put down. */
export function drawThumb(cv: HTMLCanvasElement, t: TrackFile): void {
  const g = cv.getContext('2d');
  if (!g) return;
  const k = Math.min(cv.width / t.size.w, cv.height / t.size.h);
  g.fillStyle = t.colors.outside;
  g.fillRect(0, 0, cv.width, cv.height);
  g.translate((cv.width - t.size.w * k) / 2, (cv.height - t.size.h * k) / 2);
  g.scale(k, k);
  g.fillStyle = t.colors.ground;
  g.fillRect(0, 0, t.size.w, t.size.h);
  const T = sampleTrack(t.road.points, 8);
  g.beginPath();
  for (let i = 0; i < T.n; i++) g.lineTo(T.x[i]!, T.y[i]!);
  g.closePath();
  g.lineJoin = 'round';
  g.strokeStyle = t.colors.dirt;
  g.lineWidth = t.road.width + 28;
  g.stroke();
  g.strokeStyle = t.colors.road === 'dirt' ? '#a8845a' : '#5b5f6b';
  g.lineWidth = t.road.width;
  g.stroke();
  g.fillStyle = '#ffd24a';
  for (const it of t.items) g.fillRect(it.x - 7, it.y - 7, 14, 14);
  const [sx, sy] = t.road.points[0]!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(sx, sy, t.road.width * 0.45, 0, Math.PI * 2);
  g.fill();
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** YOUR TRACKS: the tracks built on this device, a new one in any venue's look, or one from a file. */
export class TracksScreen {
  private readonly look = el('select');
  private readonly list = el('div', { className: 'trackList' });
  private readonly msg = el('p', { className: 'tag' });

  constructor(
    private readonly root: HTMLElement,
    private readonly content: Content,
    private readonly store: TrackStore,
    private readonly hooks: TracksHooks,
  ) {
    for (const v of [...content.venue.values()].sort((a, b) =>
      a.meta.name < b.meta.name ? -1 : 1,
    ))
      if (v.track) this.look.append(new Option(`Looks like ${v.meta.name}`, v.id));
    // the plain grass circuit first, if the pack has it: the gentlest place to start
    if (content.venue.has('venue.kennel-loop')) this.look.value = 'venue.kennel-loop';
    const make = el('button', { className: 'go', id: 'newTrack' }, 'NEW TRACK');
    make.onclick = () => void this.create();
    const load = el('button', { id: 'loadTrack' }, 'LOAD A FILE');
    load.onclick = () =>
      void pickTrackFile().then(async (r) => {
        if (!r.ok) {
          this.msg.textContent = r.error;
          return;
        }
        await this.store.put(r.track);
        this.msg.textContent = `Loaded ${r.track.name}.`;
        await this.refresh();
      });
    const back = el('button', {}, 'BACK');
    back.onclick = () => hooks.back();
    root.append(
      el('h2', { textContent: 'YOUR TRACKS' }),
      el('p', {
        className: 'tag',
        textContent:
          'Build a track of your own: bend the road, put things down, race it. Tracks are kept ' +
          'on this device, and go to a friend as a link or a file.',
      }),
      el('div', { className: 'row newRow' }, this.look, make, load, back),
      this.msg,
      this.list,
    );
  }

  open(): void {
    this.msg.textContent = '';
    void this.refresh();
  }

  /** Say something above the list (a track came in from a link, a link was copied). */
  say(text: string): void {
    this.msg.textContent = text;
  }

  /** A new track in the chosen look, saved and opened in the editor. */
  async create(): Promise<void> {
    const v = this.content.venue.get(this.look.value);
    if (!v) return;
    const n = (await this.store.list()).length + 1;
    const t = newTrack(v, newTrackId(Math.random), `My Track ${n}`);
    await this.store.put(t);
    this.hooks.edit(t);
  }

  private async refresh(): Promise<void> {
    const tracks = await this.store.list();
    this.list.replaceChildren();
    if (tracks.length === 0)
      this.list.append(el('p', { className: 'tag', textContent: 'No tracks yet. Make one!' }));
    for (const t of tracks) {
      const btn = (label: string, on: () => void, cls = ''): HTMLButtonElement => {
        const b = el('button', { textContent: label, className: cls });
        b.onclick = on;
        return b;
      };
      // deleting cannot be undone, so it takes a second tap
      const del = btn('DELETE', () => {
        if (del.textContent === 'DELETE') {
          del.textContent = 'SURE?';
          del.classList.add('warn');
          setTimeout(() => {
            del.textContent = 'DELETE';
            del.classList.remove('warn');
          }, 3000);
        } else void this.store.remove(t.id).then(() => this.refresh());
      });
      const things = t.items.length + t.pools.length + t.bridges.length;
      const thumb = el('canvas', { width: 192, height: 132, className: 'thumb' });
      try {
        drawThumb(thumb, t);
      } catch {
        // a road that cannot be drawn: the row still says what the track is
      }
      thumb.onclick = () => this.hooks.edit(t);
      this.list.append(
        el(
          'div',
          { className: 'trackRow' },
          thumb,
          el(
            'div',
            { className: 'about' },
            el('b', { textContent: t.name.toUpperCase() }),
            el('small', {
              textContent:
                `${t.laps} lap${t.laps === 1 ? '' : 's'} · ${t.size.w} × ${t.size.h} · ` +
                `${things} thing${things === 1 ? '' : 's'} put down`,
            }),
          ),
          el(
            'div',
            { className: 'acts' },
            btn('RACE', () => this.hooks.race(t), 'go'),
            btn('EDIT', () => this.hooks.edit(t)),
            btn('SHARE', () => {
              void shareTrackLink(t).then((did) => {
                this.msg.textContent =
                  did === 'copied'
                    ? `A link to ${t.name} is copied: paste it to a friend.`
                    : did === 'failed'
                      ? 'The link could not be shared here. FILE saves it as a file instead.'
                      : '';
              });
            }),
            btn('COPY', () => {
              void this.store.put(copyTrack(t, newTrackId(Math.random))).then(() => this.refresh());
            }),
            btn('FILE', () => saveTrackFile(t)),
            del,
          ),
        ),
      );
    }
  }
}
