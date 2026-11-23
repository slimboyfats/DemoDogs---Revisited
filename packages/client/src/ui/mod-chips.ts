import type { Content } from '@demodogs/sim';

/** The id that stands for "draw a couple by chance each race" in a picked list. */
export const WILD = 'wild';

/** Every world modifier, in a fixed order. */
export function allMods(content: Content) {
  return [...content.modifier.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Modifier ids from loose names ("downpour", "modifier.gale", "all", "wild"); unknown ones are dropped. */
export function parseMods(content: Content, text: string | null): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const raw of text.split(',')) {
    const name = raw.trim().toLowerCase();
    if (name === 'all') for (const m of allMods(content)) out.add(m.id);
    else if (name === WILD) out.add(WILD);
    else {
      const id = name.startsWith('modifier.') ? name : `modifier.${name}`;
      if (content.modifier.has(id)) out.add(id);
    }
  }
  return [...out];
}

/**
 * The modifiers a race runs with, from what was picked: the picked ones, and for WILD two more
 * drawn by the race's seed (so the same seed gives the same weather).
 */
export function resolveMods(content: Content, picked: readonly string[], seed: number): string[] {
  const out = new Set(picked.filter((id) => content.modifier.has(id)));
  if (picked.includes(WILD)) {
    const rest = allMods(content)
      .map((m) => m.id)
      .filter((id) => !out.has(id));
    let s = (seed ^ 0x9e3779b9) >>> 0;
    for (let n = 0; n < 2 && rest.length; n++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      out.add(rest.splice(s % rest.length, 1)[0]!);
    }
  }
  return [...out].sort();
}

/** " · RAIN + NIGHT" for a list of modifier ids, or nothing. */
export function modLine(content: Content, mods: readonly string[]): string {
  const labels = mods.map((id) => (id === WILD ? 'WILD' : (content.modifier.get(id)?.label ?? '')));
  return labels.length ? ` · ${labels.filter(Boolean).join(' + ')}` : '';
}

/**
 * A row of chips, one per modifier, that toggle on a tap. `wild` adds the WILD chip. `change` gets
 * the new list each time.
 */
export function modChips(
  content: Content,
  picked: readonly string[],
  change: (mods: string[]) => void,
  wild = false,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'modChips';
  const on = new Set(picked);
  const chip = (id: string, label: string, colour: string, title: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.dataset.mod = id;
    b.style.setProperty('--chip', colour);
    b.classList.toggle('on', on.has(id));
    b.onclick = () => {
      if (on.has(id)) on.delete(id);
      else on.add(id);
      b.classList.toggle('on', on.has(id));
      change([...on]);
    };
    row.append(b);
  };
  for (const m of allMods(content)) chip(m.id, m.label, m.colour, m.meta.description);
  if (wild) chip(WILD, 'WILD', '#ffffff', 'Two more, drawn by chance each race');
  return row;
}
