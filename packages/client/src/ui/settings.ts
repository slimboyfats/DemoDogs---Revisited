/** A switch's label ("FLAME LIGHT ON", "NAMES OFF") says whether it is on. */
export function saysOff(label: string): boolean {
  return /\bOFF$/.test(label.trim());
}

export interface SettingsHooks {
  /** Runs as the sheet opens, to bring what it shows up to date. */
  opened(): void;
  /** Runs as the sheet shuts: `fromPause` if it was opened over a paused race. */
  closed(fromPause: boolean): void;
}

/**
 * The SETTINGS sheet: every setting of the game in one place, under tabs, opened from the menu
 * or the pause menu (any `.settingsBtn`). The settings themselves are wired where they live, by
 * class; this only opens and shuts the sheet, turns its tabs, and marks a switch whose label says
 * OFF so it can be drawn switched off. Over a paused race the sheet sits to one side and the
 * race shows beside it, so a slider's doing is seen as it is dragged.
 */
export class Settings {
  private readonly root: HTMLElement;
  private fromPause = false;

  constructor(private readonly hooks: SettingsHooks) {
    this.root = document.getElementById('settings')!;
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>('.setTabs button')];
    const panes = [...this.root.querySelectorAll<HTMLElement>('[data-pane]')];
    const body = this.root.querySelector<HTMLElement>('.setBody');
    for (const t of tabs)
      t.addEventListener('click', () => {
        for (const o of tabs) o.classList.toggle('on', o === t);
        for (const p of panes) p.classList.toggle('hidden', p.dataset.pane !== t.dataset.tab);
        if (body) body.scrollTop = 0;
      });
    // a switch is drawn off when its label says so, whoever writes the label
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('.tog')) {
      const mark = (): void => void b.classList.toggle('off', saysOff(b.textContent ?? ''));
      new MutationObserver(mark).observe(b, {
        childList: true,
        characterData: true,
        subtree: true,
      });
      mark();
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('.settingsBtn'))
      b.addEventListener('click', () => this.open());
    document.getElementById('settingsBack')!.onclick = () => this.close();
    // a tap beside the sheet shuts it
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get shown(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(): void {
    this.fromPause = document.body.dataset.screen === 'game';
    this.root.classList.toggle('over', !this.fromPause);
    if (this.fromPause) document.getElementById('pauseMenu')!.classList.add('hidden');
    this.hooks.opened();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.shown) return;
    this.root.classList.add('hidden');
    this.hooks.closed(this.fromPause);
  }
}
