import { actionsOf, hintFor, type Action } from '../input/keys';

const SAVE = 'demodogs.keyHints';

/**
 * Key caps on screen that say which key does what. With a mouse they sit where the touch buttons
 * would be; on a touch screen they are badges on the touch buttons, shown once a key is pressed.
 * A cap lights up while its key is held. Shown by default; the choice is saved on the device.
 */
export class KeyHints {
  private on = true;
  private readonly caps: HTMLElement[];
  private readonly buttons: HTMLButtonElement[];

  constructor() {
    try {
      this.on = localStorage.getItem(SAVE) !== '0';
    } catch {
      /* private mode: just show them */
    }
    this.caps = [...document.querySelectorAll<HTMLElement>('[data-act]')];
    for (const c of this.caps) {
      if (!c.textContent) c.textContent = hintFor(c.dataset.act as Action);
    }
    this.buttons = [...document.querySelectorAll<HTMLButtonElement>('.hintsBtn')];
    for (const b of this.buttons) b.onclick = () => this.toggle();
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      document.body.classList.add('kbd');
      this.light(e.key.toLowerCase(), true);
    });
    addEventListener('keyup', (e) => this.light(e.key.toLowerCase(), false));
    addEventListener('blur', () => this.caps.forEach((c) => c.classList.remove('down')));
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

  /** What the FIRE hint says: the weapon in hand and its shots, or FIRE when empty-handed. */
  setFire(label: string, empty: boolean): void {
    const row = document.getElementById('khFire')!;
    const text = row.querySelector('b')!;
    if (text.textContent !== label) text.textContent = label;
    row.classList.toggle('empty', empty);
  }

  private light(key: string, down: boolean): void {
    const acts = actionsOf(key);
    if (!acts.length) return;
    for (const c of this.caps)
      if (acts.includes(c.dataset.act as Action)) c.classList.toggle('down', down);
  }

  private apply(): void {
    document.body.classList.toggle('nohints', !this.on);
    for (const b of this.buttons) b.textContent = this.on ? 'KEY HINTS ON' : 'KEY HINTS OFF';
  }
}
