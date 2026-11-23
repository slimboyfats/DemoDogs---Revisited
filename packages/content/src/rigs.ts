import { assembled, type Bone, type Part, type PropLook, type Tones } from '@demodogs/shared';

/**
 * A look with moving parts, from what stands still and its bones: the whole thing at rest is put
 * together from them, so it is written once.
 */
export function rigLook(bare: Part, bones: Bone[], materials?: Record<string, Tones>): PropLook {
  return {
    kind: 'prop',
    part: assembled(bare, bones),
    rig: { bare, bones },
    ...(materials ? { materials } : {}),
  };
}
