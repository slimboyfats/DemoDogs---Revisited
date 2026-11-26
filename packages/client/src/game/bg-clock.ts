/**
 * A clock that keeps ticking when the page is out of view. Browsers stop animation frames for a
 * hidden page and slow its timers to one a second, but a worker's timers run on, so an online
 * host that glances at a message doesn't freeze the race for everyone. A phone that is locked or
 * put away still suspends the whole page: nothing can run then, and guests are told to wait.
 */
export class BackgroundClock {
  private worker: Worker | null = null;
  private last = 0;

  constructor(private readonly tick: (dt: number) => void) {}

  start(): void {
    if (this.worker) return;
    try {
      const src = 'setInterval(() => postMessage(0), 16)';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch {
      return;
    }
    this.last = performance.now();
    this.worker.onmessage = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
    };
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
