import type { Art, ArtJob, StripData } from './art';

/** The most workers building art at once (a phone has eight cores, not all of them fast). */
const MOST = 4;

interface Reply {
  n: number;
  strips?: StripData[];
  error?: string;
}

/**
 * Builds a race's art on other threads while the page gets on with the ground: a car is hundreds
 * of thousands of voxels and a venue has dozens of things on it, which was most of the wait
 * before a race, one core doing it all. Each worker has the page's own looks and code
 * (art-worker.ts) and sends its strips back whole; `Art.take` puts them where building them here
 * would have. Where workers cannot be had, or one fails, the art is built here as it always was.
 *
 * `done` is told of each job as its art is in, in whatever order they finish.
 */
export async function buildArt(
  art: Art,
  jobs: readonly ArtJob[],
  done: (j: ArtJob) => void,
  /** Called before a job is built here, to let the page breathe (and show what is being built). */
  pause: (j: ArtJob) => Promise<void>,
): Promise<void> {
  const todo = jobs.filter((j) => !art.has(j));
  for (const j of jobs) if (!todo.includes(j)) done(j);
  const here = async (list: readonly ArtJob[]): Promise<void> => {
    for (const j of list) {
      if (!art.has(j)) {
        await pause(j);
        art.run(j);
      }
      done(j);
    }
  };
  const count = Math.min(MOST, Math.max(1, (navigator.hardwareConcurrency || 2) - 1), todo.length);
  // (one or two small things are sooner built than a worker is started)
  if (typeof Worker === 'undefined' || todo.length < 3) return here(todo);
  let workers: Worker[];
  try {
    workers = Array.from(
      { length: count },
      () => new Worker(new URL('./art-worker.ts', import.meta.url), { type: 'module' }),
    );
  } catch {
    return here(todo);
  }
  const left: ArtJob[] = [];
  let next = 0;
  await new Promise<void>((resolve) => {
    let open = 0;
    const give = (w: Worker): void => {
      if (next >= todo.length) {
        if (open === 0) resolve();
        return;
      }
      const n = next++;
      open++;
      w.postMessage({ n, job: todo[n] });
    };
    for (const w of workers) {
      let dead = false;
      const fail = (): void => {
        // this worker is no use: what it had, and has not answered, is built here afterwards
        if (dead) return;
        dead = true;
        resolve();
      };
      w.onerror = fail;
      w.onmessageerror = fail;
      w.onmessage = (e: MessageEvent<Reply>) => {
        if (dead) return;
        const j = todo[e.data.n]!;
        open--;
        if (e.data.strips) {
          art.take(j, e.data.strips);
          done(j);
        } else left.push(j);
        give(w);
      };
      give(w);
    }
  });
  for (const w of workers) w.terminate();
  // whatever no worker brought back (a failure, or none of them ever started)
  await here([...left, ...todo.filter((j) => !art.has(j) && !left.includes(j))]);
}
