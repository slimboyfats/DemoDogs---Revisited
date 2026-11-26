import { datan2, dcos, dexp, dhypot, dsin } from '@demodogs/sim';
import type { Content } from '@demodogs/sim';

let installed = false;

/**
 * Swap `Math.sin`, `cos`, `atan2`, `exp` and `hypot` for the sim's deterministic versions, so a
 * phone on Safari and one on Chrome run the same race to the bit. Online races call this before
 * building their world; it stays in place for the rest of the page's life (single-player doesn't
 * care, and swapping back mid-race would be worse).
 */
export function installDeterministicMath(): void {
  if (installed) return;
  installed = true;
  const M = Math as unknown as Record<string, unknown>;
  M.sin = dsin;
  M.cos = dcos;
  M.atan2 = datan2;
  M.exp = dexp;
  M.hypot = dhypot;
}

/** FNV-1a over the resolved manifests and the AI code: peers with different content can't race. */
export function contentHash(c: Content): string {
  const parts: string[] = [JSON.stringify(c.packs)];
  for (const k of [
    'car',
    'venue',
    'mode',
    'weapon',
    'pickup',
    'prop',
    'material',
    'bot',
    'ai',
    'modifier',
  ] as const)
    parts.push(JSON.stringify([...c[k].entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
  for (const [id, b] of [...c.behaviours.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    parts.push(id, String(b.drive));
  let h = 0x811c9dc5;
  for (const s of parts)
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  return h.toString(16).padStart(8, '0');
}
