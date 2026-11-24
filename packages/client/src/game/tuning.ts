import { DEFAULT_TUNING, fitTuning, type Tuning, type TuningKey } from '@demodogs/shared';

/** A plain key-value store: localStorage, or anything like it. */
interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'demodogs.tuning';

/**
 * The DEV SETTINGS pane's numbers on this device: the rule numbers of shared/tuning.ts as last
 * set here, saved as they change. A race started on this device runs on them; an online race
 * never does.
 */
export class TuningStore {
  values: Tuning;

  constructor(private readonly store?: Store) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(store?.getItem(KEY) ?? 'null');
    } catch {
      // nonsense saved: the game's own numbers
    }
    this.values = fitTuning(raw);
  }

  set(key: TuningKey, v: number): void {
    this.values = fitTuning({ ...this.values, [key]: v });
    this.save();
  }

  reset(): void {
    this.values = { ...DEFAULT_TUNING };
    this.save();
  }

  /** How many numbers differ from the game's own. */
  get changed(): number {
    return (Object.keys(DEFAULT_TUNING) as TuningKey[]).filter(
      (k) => this.values[k] !== DEFAULT_TUNING[k],
    ).length;
  }

  private save(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // a full or closed store: the numbers still hold for this visit
    }
  }
}
