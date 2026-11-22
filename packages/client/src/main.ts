import './styles.css';
import { loadContent, loadLooks } from '@demodogs/content';
import type { CarManifest } from '@demodogs/shared';
import { Sound } from './audio/sound';
import { Session } from './game/session';
import { Input } from './input/input';
import { Art } from './render/art';
import { Hud } from './render/hud';
import { drawOverlay, type WorldRenderer } from './render/overlay';
import { PixelScene } from './render/pixel/pixel-scene';
import { Scene } from './render/scene';
import { Garage } from './ui/garage';
import { results } from './ui/results';

/**
 * The app: menu with the garage turntable, the game loop, pause and results. URL hooks for testing:
 * ?start=<venue>&car=<car>&autoplay&seed=<n> jumps straight into a race (autoplay drives the
 * player's car with the rivals' AI). window.__dd exposes the running session.
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const content = loadContent();
const art = new Art(loadLooks());
const sound = new Sound();
const input = new Input(() => sound.init());
const canvas = $<HTMLCanvasElement>('game');
const overlay = $<HTMLCanvasElement>('overlay');
const octx = overlay.getContext('2d')!;
// mudders' pixel engine with the sprite-stack addon; ?renderer=canvas (or no WebGL2) uses the 2D canvas
const useCanvas = params.get('renderer') === 'canvas' || !PixelScene.supported();
const scene: WorldRenderer = useCanvas
  ? new Scene(canvas.getContext('2d')!, art)
  : new PixelScene(canvas, art);
const rendererName = useCanvas ? 'canvas' : 'pixel';
const hud = new Hud(octx);
const garage = new Garage($<HTMLCanvasElement>('garage'), art);

const cars: CarManifest[] = [...content.car.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
const venues = [...content.venue.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
let carIdx = Math.max(
  0,
  cars.findIndex((c) => c.id === 'car.mutt'),
);
let session: Session | null = null;
let lastVenue = venues[0]!.id;
let screen: 'menu' | 'game' | 'results' = 'menu';
let paused = false;
let W = 0;
let H = 0;
let DPR = 1;

function resize(): void {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = Math.round(innerWidth * DPR);
  H = Math.round(innerHeight * DPR);
  canvas.width = W;
  canvas.height = H;
  overlay.width = W;
  overlay.height = H;
  const short = Math.min(W, H);
  const long = Math.max(W, H);
  scene.setScale(Math.max(2, Math.round(Math.min(short / 180, long / 300) * 2) / 2));
  if (session) hud.layout(session.world, DPR);
}

function show(id: string | null): void {
  for (const k of ['menu', 'results', 'pauseMenu']) $(k).classList.toggle('hidden', k !== id);
}

function setScreen(s: typeof screen): void {
  screen = s;
  document.body.dataset.screen = s;
  if (s === 'game') {
    show(null);
    sound.engineStart();
  } else {
    show(s);
    sound.engineStop();
  }
}

function updateFireButton(): void {
  const b = $('btnFire');
  const P = session?.world.player;
  if (!P) return;
  b.textContent = P.weapon ? `${P.weapon.label} ×${P.ammo}` : 'FIRE';
  b.classList.toggle('empty', !P.weapon);
}

function startGame(venue: string): void {
  sound.init();
  try {
    if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement)
      document.documentElement
        .requestFullscreen()
        .then(() =>
          (
            window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
          ).lock?.('landscape'),
        )
        .catch(() => undefined);
  } catch {
    /* not allowed */
  }
  lastVenue = venue;
  const seed = params.has('seed')
    ? Number(params.get('seed'))
    : Math.floor(Math.random() * 2 ** 31);
  session = new Session({
    content,
    art,
    sound,
    input,
    venue,
    car: cars[carIdx]!.id,
    seed,
    autopilot: params.has('autoplay'),
  });
  hud.layout(session.world, DPR);
  paused = false;
  setScreen('game');
}

function finish(): void {
  if (!session) return;
  const w = session.world;
  const r = results(w);
  $('resTitle').textContent = r.title;
  let sub = r.sub;
  try {
    const k = `dd-best-${w.venue.id}`;
    const best = Number(localStorage.getItem(k)) || 0;
    if (w.player.score > best) {
      localStorage.setItem(k, String(w.player.score));
      sub += ' · NEW BEST SCORE!';
    }
  } catch {
    /* ignore */
  }
  $('resSub').textContent = sub;
  const table = $<HTMLTableElement>('resTable');
  table.replaceChildren();
  const head = table.insertRow();
  for (const h of r.head) head.appendChild(document.createElement('th')).textContent = h;
  for (const row of r.rows) {
    const tr = table.insertRow();
    if (row.me) tr.className = 'me';
    row.cells.forEach((c, i) => {
      const td = tr.insertCell();
      if (i === 1) {
        const dot = td.appendChild(document.createElement('span'));
        dot.className = 'dot';
        dot.style.background = row.paint;
      }
      td.append(c);
    });
  }
  setScreen('results');
}

function togglePause(): void {
  if (screen !== 'game') return;
  paused = !paused;
  show(paused ? 'pauseMenu' : null);
  if (paused) sound.engineStop();
  else {
    sound.engineStart();
    session?.resetClock();
  }
}

function showCar(): void {
  const c = cars[carIdx]!;
  $('carName').textContent = c.meta.name.toUpperCase();
  $('carBlurb').textContent = c.meta.description;
  const stat = (v: number, lo: number, hi: number) =>
    `${Math.round(Math.min(1, Math.max(0.1, (v - lo) / (hi - lo))) * 100)}%`;
  $('stSpeed').style.width = stat(c.stats.speed, 0.85, 1.1);
  $('stAccel').style.width = stat(c.stats.accel, 0.75, 1.2);
  $('stGrip').style.width = stat(c.stats.grip, 0.85, 1.18);
  $('stArmor').style.width = stat(c.stats.armor * c.stats.mass, 0.6, 1.8);
}

function buildMenu(): void {
  const list = $('venues');
  for (const v of venues) {
    const mode = content.mode.get(v.mode)!;
    const b = document.createElement('button');
    b.dataset.venue = v.id;
    const what =
      mode.kind === 'race' ? `Race · ${mode.laps} laps` : 'Derby · last car running wins';
    b.append(
      Object.assign(document.createElement('b'), { textContent: v.meta.name.toUpperCase() }),
      Object.assign(document.createElement('small'), {
        textContent: `${what} · ${v.meta.description.replace(/^(Race|Derby)\.\s*/, '')}`,
      }),
    );
    b.onclick = () => startGame(v.id);
    list.appendChild(b);
  }
}

let last = performance.now();
function frame(t: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
  last = t;
  if (screen === 'game' && session) {
    if (input.takePause()) togglePause();
    if (!paused && session.advance(dt)) {
      finish();
      return;
    }
    scene.draw(session.world, session.fx, session.ground, session.cam, W, H, DPR);
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, W, H);
    drawOverlay(octx, scene, session.world, session.fx, W, H, DPR);
    hud.draw(session.world, session.fx, W, H, DPR);
    updateFireButton();
  } else if (screen === 'menu') garage.draw(cars[carIdx]!, dt);
}

function boot(): void {
  resize();
  addEventListener('resize', resize);
  buildMenu();
  $('prevCar').onclick = () => {
    carIdx = (carIdx + cars.length - 1) % cars.length;
    showCar();
  };
  $('nextCar').onclick = () => {
    carIdx = (carIdx + 1) % cars.length;
    showCar();
  };
  $('again').onclick = () => startGame(lastVenue);
  $('toMenu').onclick = () => setScreen('menu');
  $('pauseBtn').onclick = togglePause;
  $('resume').onclick = togglePause;
  $('restart').onclick = () => startGame(lastVenue);
  $('quit').onclick = () => {
    paused = false;
    setScreen('menu');
  };
  const muteBtns = document.querySelectorAll<HTMLButtonElement>('.muteBtn');
  const label = () =>
    muteBtns.forEach((b) => (b.textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON'));
  muteBtns.forEach((b) => (b.onclick = () => (sound.toggle(), label())));
  label();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'game' && !paused) togglePause();
  });
  showCar();
  setScreen('menu');
  const st = params.get('start');
  if (st) {
    const v = venues.find((x) => x.id === st || x.id === `venue.${st}`);
    const c = params.get('car');
    if (c)
      carIdx = Math.max(
        0,
        cars.findIndex((x) => x.id === c || x.id === `car.${c}`),
      );
    if (v) startGame(v.id);
  }
  Object.assign(window, {
    __dd: {
      renderer: rendererName,
      get session() {
        return session;
      },
      finish,
      get screen() {
        return screen;
      },
    },
  });
  requestAnimationFrame(frame);
}

boot();
