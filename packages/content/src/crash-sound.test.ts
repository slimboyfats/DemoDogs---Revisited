import { NO_CONTROLS, type SimEvent } from '@demodogs/shared';
import { stand } from '@demodogs/sim';
import { describe, expect, it } from 'vitest';
import { loadContent } from './index';
import { bench, openSpot, put } from './testing';

/** Drive the bench car into `id` at `speed` and return the crashes that were reported. */
function ram(id: string, speed: number): Extract<SimEvent, { t: 'crash' }>[] {
  const w = bench();
  const def = loadContent().prop.get(id)!;
  const [x, y] = openSpot(w, 100);
  put(w.player, x - 30 - def.radius, y, 0, speed);
  stand(w, def, x, y, 0, 0);
  const out: Extract<SimEvent, { t: 'crash' }>[] = [];
  for (let i = 0; i < 60; i++) {
    w.step(NO_CONTROLS);
    for (const e of w.takeEvents()) if (e.t === 'crash') out.push(e);
  }
  return out;
}

describe('what a crash was into', () => {
  it('a car that hits scenery says what the scenery is made of', () => {
    expect(ram('prop.armco', 60).map((e) => e.made)).toContain('material.steel');
    expect(ram('prop.tyres', 60).map((e) => e.made)).toContain('material.rubber');
  });

  it('says so too when it goes straight through', () => {
    expect(ram('prop.plank-fence', 160).map((e) => e.made)).toContain('material.wood');
  });

  it('every material scenery is made of has a sound of its own kind', () => {
    const C = loadContent();
    const sounds = new Set<string>();
    for (const p of C.prop.values()) {
      if (!p.made) continue;
      sounds.add(C.material.get(p.made)!.sound);
    }
    for (const s of ['metal', 'wood', 'stone', 'rubber', 'glass']) expect(sounds).toContain(s);
  });
});
