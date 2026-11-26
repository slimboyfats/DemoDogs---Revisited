// A worker that builds art for the page (see art-pool.ts): it has the same looks and the same
// `Art` as the page, builds what it is asked for, and sends the strips back without copying them.
import { loadLooks } from '@demodogs/content';
import { Art, type ArtJob } from './art';

const art = new Art(loadLooks(), true);
// (the page's types are what this project is checked against: the worker's own scope, by hand)
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ n: number; job: ArtJob }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { n, job } = e.data;
  try {
    const strips = art.work(job);
    const buffers = new Set<ArrayBufferLike>();
    for (const s of strips)
      for (const a of [s.px, s.glow, s.gloss, s.aux, s.trim]) if (a) buffers.add(a.buffer);
    scope.postMessage({ n, strips }, [...buffers] as ArrayBuffer[]);
  } catch (err) {
    scope.postMessage({ n, error: String(err) });
  }
};
