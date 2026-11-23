const SAVE = 'demodogs.names';

/**
 * Whether the drivers' names float over their cars while you drive. On by default; Tab or the
 * NAMES button in the menus turns them off and on, and the choice is saved on the device.
 * (A spectator always sees the names.)
 */
export class NameTags {
  private on = true;
  private readonly buttons: HTMLButtonElement[];

  constructor() {
    try {
      this.on = localStorage.getItem(SAVE) !== '0';
    } catch {
      /* private mode: just show them */
    }
    this.buttons = [...document.querySelectorAll<HTMLButtonElement>('.namesBtn')];
    for (const b of this.buttons) b.onclick = () => this.toggle();
    this.apply();
  }

  get shown(): boolean {
    return this.on;
  }

  toggle(): void {
    this.on = !this.on;
    try {
      localStorage.setItem(SAVE, this.on ? '1' : '0');
    } catch {
      /* not saved, still works for this visit */
    }
    this.apply();
  }

  private apply(): void {
    document.body.classList.toggle('nonames', !this.on);
    for (const b of this.buttons) b.textContent = this.on ? 'NAMES ON' : 'NAMES OFF';
  }
}
