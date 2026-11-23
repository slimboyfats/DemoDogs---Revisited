import { isKey } from '../input/keys';

/** What the bar asks for. */
export interface SpectateActions {
  next(dir: 1 | -1): void;
  zoom(): void;
  /** Stop watching and go to the results. */
  skip(): void;
}

/**
 * The spectator's controls, shown once this screen's car is out of it: tap anywhere (or Tab) for
 * the next car, the arrows for either way, ZOOM (or Z) to pull the camera back. It says who is
 * being watched. Nothing here reaches the sim.
 */
export class SpectateBar {
  private on = false;
  private readonly root = document.getElementById('spectate')!;
  private readonly who = document.getElementById('specName')!;
  private readonly dot = document.getElementById('specDot')!;
  private readonly sub = document.getElementById('specSub')!;
  private readonly zoomLabel = document.getElementById('specZoomLabel')!;

  constructor(act: SpectateActions) {
    const press = (id: string, go: () => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener('pointerdown', (e) => {
        // no focus on the button, so Space and Tab stay the game's
        e.preventDefault();
        e.stopPropagation();
        go();
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    press('specTap', () => act.next(1));
    press('specPrev', () => act.next(-1));
    press('specNext', () => act.next(1));
    press('specZoom', () => act.zoom());
    press('specSkip', () => act.skip());
    addEventListener('keydown', (e) => {
      if (!this.on || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (isKey('watch', k)) {
        e.preventDefault();
        act.next(e.shiftKey ? -1 : 1);
      } else if (isKey('zoom', k)) act.zoom();
      else if (isKey('skip', k) && this.skippable) act.skip();
    });
  }

  /** SKIP is offered: nobody else is waiting on this race. */
  private skippable = true;

  setSkip(on: boolean): void {
    if (on === this.skippable) return;
    this.skippable = on;
    document.getElementById('specSkip')!.classList.toggle('hidden', !on);
  }

  get shown(): boolean {
    return this.on;
  }

  show(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    this.root.classList.toggle('hidden', !on);
    document.body.classList.toggle('spectating', on);
  }

  /** Who is on screen, what to say under the name, and the zoom that is on. */
  set(name: string, paint: string, sub: string, zoom: string): void {
    if (this.who.textContent !== name) this.who.textContent = name;
    if (this.dot.dataset.paint !== paint) {
      this.dot.dataset.paint = paint;
      this.dot.style.background = paint;
    }
    if (this.sub.textContent !== sub) this.sub.textContent = sub;
    if (this.zoomLabel.textContent !== zoom) this.zoomLabel.textContent = zoom;
  }
}
