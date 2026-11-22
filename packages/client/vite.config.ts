import { defineConfig } from 'vite';

// DEMODOGS_BASE sets the public path, e.g. /DemoDogs---Revisited/ for GitHub Pages.
export default defineConfig({
  base: process.env.DEMODOGS_BASE ?? './',
  build: { target: 'es2022', assetsInlineLimit: 0 },
  server: { host: true },
});
