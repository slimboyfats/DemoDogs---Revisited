/** Where the lobby server lives once the game is on GitHub Pages (see render.yaml). */
export const RENDER_SIGNAL_URL = 'https://demodogs-signal.onrender.com';

/**
 * The lobby server's base URL: `VITE_SIGNAL_URL` when the build sets it; in dev (or `pnpm preview`)
 * the page's own origin at /signal, which Vite proxies to the local server; otherwise Render.
 * `?signal=http://127.0.0.1:PORT` points a page at a local test server (loopback only).
 */
export function signalUrl(
  env: string | undefined,
  dev: boolean,
  loc: { origin: string; search: string; hostname: string },
): string {
  const q = new URLSearchParams(loc.search).get('signal');
  if (q && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(q)) return q;
  if (env) return env.replace(/\/+$/, '');
  const local = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(loc.hostname);
  if (dev || local) return `${loc.origin}/signal`;
  return RENDER_SIGNAL_URL;
}
