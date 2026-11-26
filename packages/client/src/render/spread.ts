/**
 * Heavy work that is for show only, spread over the ticks after the one that asked for it. A
 * blast under a pack of cars dents six bodies and wrecks two in the same tick: done there and
 * then that is one frame of 50 ms; done a couple of milliseconds a tick, in the order asked, it
 * is a dent that shows a frame or two late, which nobody sees. Each job is about one thing (a
 * strip of art, say), so whoever is about to read or replace that thing can have what is still
 * waiting for it done first (`settle`).
 *
 * No clock of its own: `work` is handed one.
 */
interface Job<K> {
  on: K;
  run: () => void;
  big: boolean;
}

export class Spread<K> {
  private jobs: Job<K>[] = [];
  private head = 0;

  /** Jobs still waiting. */
  get waiting(): number {
    return this.jobs.length - this.head;
  }

  /**
   * Do `run` soon: this tick if there is time, else in one of the next few. A `big` job (a whole
   * car body gone over, say) is a tick's work by itself: it is never done after another job in
   * the same tick, and nothing is done after it.
   */
  later(on: K, run: () => void, big = false): void {
    this.jobs.push({ on, run, big });
  }

  /** Do everything waiting for `on` now, in the order it was asked. */
  settle(on: K): void {
    if (this.head >= this.jobs.length) return;
    let any = false;
    for (let i = this.head; i < this.jobs.length; i++) if (this.jobs[i]!.on === on) any = true;
    if (!any) return;
    const rest: Job<K>[] = [];
    const mine: (() => void)[] = [];
    for (let i = this.head; i < this.jobs.length; i++) {
      const j = this.jobs[i]!;
      if (j.on === on) mine.push(j.run);
      else rest.push(j);
    }
    this.jobs = rest;
    this.head = 0;
    for (const run of mine) run();
  }

  /**
   * One tick's share: jobs in order until `ms` have gone by on `now`'s clock (always at least
   * one, so the queue cannot stand still). The more there is waiting, the more time it is given
   * (`ms` again for every `crowd` jobs), so nothing waits long however big the fight.
   * Returns how many were done.
   */
  work(now: () => number, ms: number, crowd = 8): number {
    const left = this.waiting;
    if (!left) return 0;
    const until = now() + ms * (1 + Math.floor(left / crowd));
    let n = 0;
    while (this.head < this.jobs.length) {
      const j = this.jobs[this.head]!;
      if (j.big && n > 0) break;
      this.head++;
      j.run();
      n++;
      if (j.big || now() >= until) break;
    }
    if (this.head >= this.jobs.length) {
      this.jobs.length = 0;
      this.head = 0;
    }
    return n;
  }
}
