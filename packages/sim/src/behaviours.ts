import type { Controls } from '@demodogs/shared';
import type { Car } from './entities';
import type { World } from './world';

/**
 * An AI behaviour (content, `ai.*`): looks at the world and returns the controls for its car this
 * tick. It may use world.rng and the car's AiState, and must not change anything else.
 */
export interface AiBehaviour {
  id: string;
  kind: 'ai';
  drive(world: World, car: Car): Controls;
}

export function defineAi(b: Omit<AiBehaviour, 'kind'>): AiBehaviour {
  return { ...b, kind: 'ai' };
}
