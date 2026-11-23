/** One thing the player can do with a key. */
export type Action =
  'gas' | 'brake' | 'left' | 'right' | 'boost' | 'fire' | 'pause' | 'watch' | 'zoom' | 'skip';

/**
 * The keyboard: each action and the keys that do it (`KeyboardEvent.key`, lower case). The first key
 * of each list is the one the on-screen hints show.
 */
export const KEYS: Readonly<Record<Action, readonly string[]>> = {
  gas: ['w', 'arrowup'],
  brake: ['s', 'arrowdown'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  boost: [' '],
  fire: ['x', 'f', 'shift'],
  pause: ['p', 'escape'],
  // once your car is out of it: the next car to watch (Shift goes back), and the camera's zoom
  watch: ['tab'],
  zoom: ['z'],
  // and, where nobody else is waiting on the race, straight to the results
  skip: ['enter'],
};

const NAMES: Readonly<Record<string, string>> = {
  ' ': 'SPACE',
  arrowup: '▲',
  arrowdown: '▼',
  arrowleft: '◀',
  arrowright: '▶',
  escape: 'ESC',
  tab: 'TAB',
  enter: 'ENTER',
};

/** What to print on a key cap for `key`. */
export function keyName(key: string): string {
  return NAMES[key] ?? key.toUpperCase();
}

/** The key cap text for an action: its first key. */
export function hintFor(action: Action): string {
  return keyName(KEYS[action][0]!);
}

/** Is `key` (lower case) one of the keys for `action`? */
export function isKey(action: Action, key: string): boolean {
  return KEYS[action].includes(key);
}

/** Every action `key` does. */
export function actionsOf(key: string): Action[] {
  return (Object.keys(KEYS) as Action[]).filter((a) => isKey(a, key));
}
