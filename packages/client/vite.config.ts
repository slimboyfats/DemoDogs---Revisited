import { defineConfig, type ProxyOptions } from 'vite';

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
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: { host: true, proxy: signalProxy },
  preview: { host: true, proxy: signalProxy },
});
