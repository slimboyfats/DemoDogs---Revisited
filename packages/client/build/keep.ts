import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { squeezeGlsl } from './glsl';

/**
 * Writes `sw.js` into the build: the worker in build/sw.js with the list of every file of this
 * build above it, so a phone keeps the whole game after one visit (src/keep.ts registers it).
 * The build's name is a hash of that list, and the files are named after what is in them, so
 * the worker changes exactly when the game does.
 */
export function keepGame(): Plugin {
  return {
    name: 'demodogs-keep',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./index.html', ...Object.keys(bundle).map((f) => `./${f}`)]
        .filter((f, i, all) => all.indexOf(f) === i && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) {
        const item = bundle[f.slice(2)];
        hash.update(f);
        if (item) hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const worker = readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
      // files in public/ are copied after this, so they are listed from the folder itself
      const keep = { id: hash.digest('hex').slice(0, 12), files: [...files, ...PUBLIC].sort() };
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const KEEP = ${JSON.stringify(keep)};\n${worker}`,
      });
    },
  };
}

/** What public/ adds to a build that the page asks for (the icons are the home screen's own). */
const PUBLIC = ['./manifest.webmanifest'];

/** Shaders go out without their comments and indent (build/glsl.ts). The build only. */
export function leanShaders(): Plugin {
  return {
    name: 'demodogs-lean-shaders',
    apply: 'build',
    transform(code, id) {
      if (!/\/client\/src\/.*\.ts$/.test(id) || id.endsWith('.test.ts')) return null;
      const out = squeezeGlsl(code, id);
      return out === null ? null : { code: out, map: null };
    },
  };
}
