/** What a driver asks of a car for one tick. Humans and AI produce the same thing. */
export interface Controls {
  /** -1 (full left) to 1 (full right). */
  steer: number;
  /** 0 to 1. */
  throttle: number;
  /** Brake; reverses when stopped; a handbrake slide when fast and steering. */
  brake: boolean;
  boost: boolean;
  /** Use the held weapon this tick. */
  fire: boolean;
}

export const NO_CONTROLS: Readonly<Controls> = Object.freeze({
  steer: 0,
  throttle: 0,
  brake: false,
  boost: false,
  fire: false,
});
