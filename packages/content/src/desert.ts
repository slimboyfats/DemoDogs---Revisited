import type { Tones } from '@demodogs/shared';

/**
 * Tones for the desert pieces (canyon rock, sand, cactus), on top of the shared palette. Each look
 * that uses them passes this as its `materials`.
 */
export const DESERT: Record<string, Tones> = {
  /** Banded sandstone, from pale to deep red. */
  sand1: ['#9a5a34', '#c47a46', '#e3a06a'],
  sand2: ['#86462a', '#ad5f38', '#cf8455'],
  sand3: ['#b07a4a', '#d79f68', '#f2c690'],
  sand4: ['#6e3622', '#904a2c', '#b4643e'],
  /** Desert varnish: dark streaks down a cliff face. */
  varnish: ['#3e241a', '#553226', '#6f4434'],
  cactus: ['#2b5a34', '#3c7a44', '#5a9c58'],
  cactus2: ['#234a2c', '#31663a', '#4a8649'],
  spine: ['#b8b08a', '#ddd6b0', '#f8f2d4'],
  bloom: ['#a8326a', '#d84a8a', '#ff86b8'],
  dynamite: ['#7a1414', '#b02020', '#e04040'],
};

/** Which sandstone band a height falls in, wobbled a little by x and y so bands are not flat. */
export function strata(x: number, y: number, z: number): string {
  const b = Math.floor(z * 0.55 + Math.sin(x * 0.4 + y * 0.3) * 0.6);
  return ['sand1', 'sand3', 'sand2', 'sand1', 'sand4', 'sand3'][((b % 6) + 6) % 6]!;
}
