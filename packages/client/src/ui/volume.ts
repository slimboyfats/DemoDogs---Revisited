import type { Sound } from '../audio/sound';
import { CHANNELS, type Channel } from '../audio/volume';

const NAMES: Record<Channel, string> = { master: 'VOLUME', music: 'MUSIC', fx: 'FX' };

/**
 * The volume sliders on the pause menu: everything, the tune, and the effects. They work while
 * the race is paused and the tune is playing, so a change is heard as it is made; letting go of
 * VOLUME or FX plays a sound to judge it by. `changed` runs after every move.
 */
export function volumeSliders(host: HTMLElement, sound: Sound, changed: () => void): () => void {
  const rows = CHANNELS.map((c) => {
    const row = document.createElement('label');
    row.className = 'vol';
    const name = document.createElement('span');
    name.textContent = NAMES[c];
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '100';
    range.step = '5';
    range.setAttribute('aria-label', `${NAMES[c]} volume`);
    const value = document.createElement('b');
    const show = () => {
      const pct = Math.round(sound.level(c) * 100);
      range.value = String(pct);
      range.style.setProperty('--fill', `${pct}%`);
      value.textContent = pct > 0 ? `${pct}%` : 'OFF';
    };
    range.oninput = () => {
      sound.setLevel(c, Number(range.value) / 100);
      sync();
      changed();
    };
    range.onchange = () => {
      if (c !== 'music') sound.pickup();
      // the arrow keys go back to the car
      range.blur();
    };
    row.append(name, range, value);
    host.append(row);
    return show;
  });
  const sync = () => rows.forEach((show) => show());
  sync();
  return sync;
}
