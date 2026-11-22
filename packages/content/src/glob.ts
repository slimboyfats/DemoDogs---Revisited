/// <reference types="vite/client" />
import type { LookModule } from '@demodogs/shared';
import type { AiBehaviour, ContentSource, RawManifest } from '@demodogs/sim';

/**
 * Content discovery: every manifest.json, behaviour.ts and look.ts under a pack folder is picked up
 * by Vite's import.meta.glob (in the client build and in Vitest alike), so adding a folder
 * registers the item with no other edits.
 */
const packFiles: Record<string, unknown> = import.meta.glob('../*/pack.json', {
  eager: true,
  import: 'default',
});
const manifestFiles: Record<string, unknown> = import.meta.glob('../*/**/manifest.json', {
  eager: true,
  import: 'default',
});
const behaviourFiles: Record<string, AiBehaviour> = import.meta.glob('../*/**/behaviour.ts', {
  eager: true,
  import: 'default',
});
const lookFiles: Record<string, LookModule> = import.meta.glob('../*/**/look.ts', {
  eager: true,
  import: 'default',
});

function packOf(path: string): string {
  return path.split('/')[1] ?? '';
}

/** Sources for every pack, in sorted (deterministic) order. */
export function discoverContent(): ContentSource {
  const packs = Object.keys(packFiles)
    .sort()
    .map((packPath) => {
      const name = packOf(packPath);
      const manifests: RawManifest[] = Object.keys(manifestFiles)
        .filter((p) => packOf(p) === name)
        .sort()
        .map((p) => ({ path: p.slice(3), data: manifestFiles[p] }));
      return { pack: packFiles[packPath], manifests };
    });
  const behaviours = Object.keys(behaviourFiles)
    .sort()
    .map((p) => behaviourFiles[p]!);
  return { packs, behaviours };
}

/** Every look, by item id. */
export function discoverLooks(): Map<string, LookModule> {
  const out = new Map<string, LookModule>();
  for (const p of Object.keys(lookFiles).sort()) {
    const m = lookFiles[p]!;
    out.set(m.id, m);
  }
  return out;
}

/** Item folders (relative to the package), for validation. */
export function itemFolders(): string[] {
  return Object.keys(manifestFiles)
    .map((p) => p.slice(3, -'/manifest.json'.length))
    .sort();
}
