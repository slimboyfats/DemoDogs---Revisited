import { defineConfig, type ProxyOptions } from 'vite';
import { keepGame, leanShaders } from './build/keep';

// Online play in dev: the page reaches the lobby server (packages/signal, :8787) through its own
// origin at /signal, so a phone on the same network needs only the one address. SIGNAL_TARGET
// overrides where that goes.
const signalProxy: Record<string, ProxyOptions> = {
  '/signal': {
    target: process.env.SIGNAL_TARGET ?? 'http://127.0.0.1:8787',
    ws: true,
    rewrite: (p) => p.replace(/^\/signal/, '') || '/',
  },
};

// DEMODOGS_BASE sets the public path, e.g. /DemoDogs---Revisited/ for GitHub Pages.
export default defineConfig({
  base: process.env.DEMODOGS_BASE ?? './',
  plugins: [leanShaders(), keepGame()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // The game in four files by how often each changes, so a phone that has played before
        // fetches only what a new build changed: the schema library (never), the rules, the
        // content, and the client. Each is named after what is in it.
        codeSplitting: {
          groups: [
            { name: 'lib', test: /node_modules/, priority: 4 },
            { name: 'rules', test: /packages[\\/](sim|shared)[\\/]/, priority: 3 },
            { name: 'content', test: /packages[\\/]content[\\/]/, priority: 2 },
          ],
        },
      },
    },
  },
  server: { host: true, proxy: signalProxy },
  preview: { host: true, proxy: signalProxy },
});
