import { DIFFICULTIES, type Difficulty } from '@demodogs/shared';

const SAVE = 'demodogs.rivals';

/** A level as written down, or null for nonsense. */
export function parseLevel(s: string | null | undefined): Difficulty | null {
  return DIFFICULTIES.includes(s as Difficulty) ? (s as Difficulty) : null;
}

/** The level after `d`, round and round: easy, normal, hard. */
export function nextLevel(d: Difficulty): Difficulty {
  return DIFFICULTIES[(DIFFICULTIES.indexOf(d) + 1) % DIFFICULTIES.length]!;
}

/**
 * How hard the rival drivers are: EASY, NORMAL or HARD. The RIVALS button on the menu steps
 * through them and the choice is saved on the device; `?rivals=hard` picks one for a visit
 * without saving. It is used for the next race started here. An online race is always NORMAL,
 * so every screen runs the same one.
 */
export class Rivals {
  level: Difficulty = 'normal';
  private readonly buttons: HTMLButtonElement[];

  constructor(forced?: string | null) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SAVE);
    } catch {
      /* private mode: normal */
    }
    this.level = parseLevel(forced) ?? parseLevel(saved) ?? 'normal';
    this.buttons = [...document.querySelectorAll<HTMLButtonElement>('.rivalsBtn')];
    for (const b of this.buttons) b.onclick = () => this.step();
    this.apply();
  }

  step(): void {
    this.level = nextLevel(this.level);
    try {
      localStorage.setItem(SAVE, this.level);
    } catch {
      /* not saved, still works for this visit */
    }
    this.apply();
  }

  private apply(): void {
    for (const b of this.buttons) b.textContent = `RIVALS ${this.level.toUpperCase()}`;
  }
}
