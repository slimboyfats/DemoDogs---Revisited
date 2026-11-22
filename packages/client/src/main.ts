import './styles.css';
import { loadContent, loadLooks } from '@demodogs/content';
import type { CarManifest } from '@demodogs/shared';
import { Sound } from './audio/sound';
import {
  forfeit,
  newCareer,
  parseCareer,
  raceSetup,
  readOutcome,
  settle,
  type Career,
  type Outcome,
  type RaceId,
} from './game/career';
import { Session } from './game/session';
import { Input } from './input/input';
import { Art } from './render/art';
import { Hud } from './render/hud';
import { drawOverlay, type WorldRenderer } from './render/overlay';
import { PixelScene } from './render/pixel/pixel-scene';
import { Scene } from './render/scene';
import { CareerScreen, money } from './ui/career-screen';
import { Garage } from './ui/garage';
import { results } from './ui/results';

/**
 * The app: menu with the garage turntable, the game loop, pause and results. URL hooks for testing:
 * ?start=<venue>&car=<car>&autoplay&seed=<n> jumps straight into a race (autoplay drives the
 * player's car with the rivals' AI); ?career opens the career, ?career=<easy|medium|hard|final>
 * enters that race. window.__dd exposes the running session and the career.
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
let screen: 'menu' | 'game' | 'results' | 'career' = 'menu';
const SAVE = 'dd-career-v1';
let career: Career | null = null;
/** The career race being run, or null in a quick race. */
let careerRace: RaceId | null = null;

function saveCareer(k: Career): void {
  career = k;
  try {
    localStorage.setItem(SAVE, JSON.stringify(k));
  } catch {
    /* private mode: the career lasts as long as the page */
  }
}
function loadCareer(): Career {
  if (career) return career;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SAVE);
  } catch {
    /* ignore */
  }
  career = parseCareer(content, saved) ?? newCareer(content, Math.floor(Math.random() * 2 ** 31));
  return career;
}
const careerScreen = new CareerScreen($('careerPanel'), content, art, {
  change: saveCareer,
  race: startCareerRace,
  back: () => setScreen('menu'),
  reset: () => {
    saveCareer(newCareer(content, Math.floor(Math.random() * 2 ** 31)));
    openCareer();
  },
});
function openCareer(): void {
  careerRace = null;
  careerScreen.open(loadCareer());
  setScreen('career');
}
let paused = false;
/** The results on screen are a career race's: CONTINUE goes back to the career. */
let lastCareer = false;
let W = 0;
let H = 0;
let DPR = 1;
let scale = 4;

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
  // close enough to see what the cars are made of: about 130 art pixels up the short side
  scale = Math.max(2, Math.round(Math.min(short / 130, long / 230) * 2) / 2);
  scene.setScale(scale);
  if (session) {
    session.setView(W / scale, H / scale);
    hud.layout(session.world, DPR);
  }
}

function show(id: string | null): void {
  for (const k of ['menu', 'results', 'pauseMenu', 'career'])
    $(k).classList.toggle('hidden', k !== id);
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

function goFullscreen(): void {
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
}

function startCareerRace(race: RaceId): void {
  sound.init();
  goFullscreen();
  const k = loadCareer();
  const s = raceSetup(content, k, race);
  careerRace = race;
  session = new Session({
    content,
    art,
    sound,
    input,
    venue: s.venue,
    car: k.car,
    seed: s.seed,
    autopilot: params.has('autoplay'),
    field: s.field,
    player: s.player,
    knockout: true,
  });
  session.setView(W / scale, H / scale);
  hud.layout(session.world, DPR);
  paused = false;
  setScreen('game');
}

function startGame(venue: string): void {
  sound.init();
  goFullscreen();
  careerRace = null;
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
  session.setView(W / scale, H / scale);
  hud.layout(session.world, DPR);
  paused = false;
  setScreen('game');
}

function finish(gaveUp = false): void {
  if (!session) return;
  const w = session.world;
  const r = results(w);
  $('resTitle').textContent = r.title;
  let sub = r.sub;
  const pay = $('payout');
  pay.replaceChildren();
  $('again').textContent = careerRace ? 'CONTINUE' : 'GO AGAIN';
  $('toMenu').classList.toggle('hidden', careerRace !== null);
  if (careerRace) {
    // settle once: the race is spent, so leaving the results cannot pay twice
    const o: Outcome = gaveUp ? forfeit(w) : readOutcome(w);
    const { career: next, payout } = settle(loadCareer(), careerRace, o);
    saveCareer(next);
    careerRace = null;
    lastCareer = true;
    if (payout.champion) $('resTitle').textContent = 'TOP DOG!';
    else if (gaveUp) $('resTitle').textContent = 'GAVE UP';
    else if (o.wrecked) $('resTitle').textContent = 'WRECKED';
    const line = (label: string, cash: string, cls = '') => {
      const d = document.createElement('div');
      d.className = cls;
      d.append(
        Object.assign(document.createElement('span'), { textContent: label }),
        Object.assign(document.createElement('b'), { textContent: cash }),
      );
      pay.append(d);
    };
    for (const l of payout.lines) line(l.label, money(l.cash), l.cash < 0 ? 'neg' : '');
    if (payout.lines.length === 0)
      line(o.wrecked ? 'A WRECK EARNS NOTHING' : 'OUT OF THE MONEY', money(0));
    line(`CASH ${money(next.cash)} · +${payout.points} PTS`, money(payout.total), 'sum');
  } else lastCareer = false;
  if (!lastCareer)
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
  $('restart').classList.toggle('hidden', careerRace !== null);
  $('quit').textContent = careerRace ? 'GIVE UP THE RACE' : 'QUIT TO MENU';
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
  else if (screen === 'career') careerScreen.draw(dt);
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
  $('again').onclick = () => (lastCareer ? openCareer() : startGame(lastVenue));
  $('toCareer').onclick = openCareer;
  $('toMenu').onclick = () => setScreen('menu');
  $('pauseBtn').onclick = togglePause;
  $('resume').onclick = togglePause;
  $('restart').onclick = () => startGame(lastVenue);
  $('quit').onclick = () => {
    paused = false;
    // walking out of a career race is a last place, not a free retry
    if (careerRace) finish(true);
    else setScreen('menu');
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
  if (params.has('career')) {
    const race = params.get('career');
    if (race === 'easy' || race === 'medium' || race === 'hard' || race === 'final')
      startCareerRace(race);
    else openCareer();
  }
  Object.assign(window, {
    __dd: {
      renderer: rendererName,
      get session() {
        return session;
      },
      finish,
      get career() {
        return loadCareer();
      },
      setCareer(k: Career) {
        saveCareer(k);
        if (screen === 'career') openCareer();
      },
      get screen() {
        return screen;
      },
    },
  });
  requestAnimationFrame(frame);
}

boot();
