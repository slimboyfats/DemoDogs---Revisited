import {
  PerfRecorder,
  SlowWatch,
  perfFileName,
  stallDetail,
  watchGl,
  type PerfContext,
} from './game/perf-log';
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
import { Session, type SessionOptions } from './game/session';
import { Input } from './input/input';
import { Art } from './render/art';
import { Hud } from './render/hud';
import { drawOverlay, type WorldRenderer } from './render/overlay';
import { PixelScene } from './render/pixel/pixel-scene';
import { Scene } from './render/scene';
import { CareerScreen, money } from './ui/career-screen';
import { DevPanel } from './ui/dev-panel';
import { Garage } from './ui/garage';
import { results } from './ui/results';
import { signalUrl } from './net/config';
import { OnlineScreen } from './ui/online';

/**
 * The app: menu with the garage turntable, the game loop, pause and results. URL hooks for testing:
 * ?start=<venue>&car=<car>&autoplay&seed=<n> jumps straight into a race (autoplay drives the
 * player's car with the rivals' AI); ?career opens the career, ?career=<easy|medium|hard|final>
 * enters that race; ?dev opens the test range. window.__dd exposes the running session, the
 * career and the test range's tools (`__dd.dev.use(x, y, 'blast')`).
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
let screen: 'menu' | 'game' | 'results' | 'career' | 'loading' | 'online' = 'menu';
/** The game on screen is the test range. */
let devMode = false;
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
const dev = new DevPanel($('devPanel'), $('devTap'), content, {
  view: () => ({ w: W, h: H, scale, dpr: DPR }),
  restart: startDev,
  exit: () => setScreen('menu'),
  record: () => (perf ? stopPerf() : startPerf()),
  stats: () => (scene instanceof PixelScene ? `slices ${scene.instances}` : 'canvas'),
});
// online races: the lobby screen, and the room it holds while racing
const online = new OnlineScreen(
  $('onlinePanel'),
  content,
  cars,
  venues,
  signalUrl(import.meta.env.VITE_SIGNAL_URL, import.meta.env.DEV, location),
  {
    race: (s, race) => {
      careerRace = null;
      const host = s.seats[0]!;
      void launch(
        {
          venue: s.venue,
          car: host.car,
          name: host.name,
          paint: host.paint,
          seed: s.seed,
          autopilot: false,
          humans: s.seats.slice(1).map((x) => ({ car: x.car, name: x.name, paint: x.paint })),
          you: s.you,
        },
        `ONLINE · ${content.venue.get(s.venue)?.meta.name.toUpperCase() ?? ''}`,
        (made) => {
          made.net = race;
          document.body.classList.add('online');
        },
      );
    },
    back: () => setScreen('menu'),
    show: () => {
      document.body.classList.remove('online');
      if (screen !== 'online') setScreen('online');
    },
  },
);
function openOnline(join?: string): void {
  setScreen('online');
  online.open(cars[carIdx]!.id, join);
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
  for (const k of ['menu', 'results', 'pauseMenu', 'career', 'loader', 'online'])
    $(k).classList.toggle('hidden', k !== id);
}

function setScreen(s: typeof screen): void {
  screen = s;
  document.body.dataset.screen = s;
  if (s !== 'game' && devMode) {
    devMode = false;
    dev.close();
  }
  if (s === 'loading') show('loader');
  else if (s === 'game') {
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

type Launch = Pick<SessionOptions, 'venue' | 'car' | 'seed'> & Partial<SessionOptions>;
let launching = 0;

/**
 * Build a session behind the loader, which says what is being built as it goes, then show it.
 * A newer launch (or leaving the loader) drops an older one.
 */
async function launch(o: Launch, title: string, ready?: (s: Session) => void): Promise<void> {
  const mine = ++launching;
  sound.init();
  goFullscreen();
  $('loadTitle').textContent = title;
  $('loadFill').style.width = '0';
  setScreen('loading');
  const t0 = performance.now();
  const built0 = art.built;
  const made = await Session.load(
    { content, art, sound, input, autopilot: params.has('autoplay'), ...o },
    (text, done, of) => {
      $('loadLine').textContent = `${text}…`;
      $('loadFill').style.width = `${Math.round((done / of) * 100)}%`;
      const px = art.built - built0;
      $('loadCount').textContent =
        `Step ${Math.min(done + 1, of)} of ${of} · ${px.toLocaleString('en')} pixels built · ` +
        `${((performance.now() - t0) / 1000).toFixed(1)} s`;
      // let the screen show the line before the next piece is built
      return new Promise((r) => {
        const go = () => setTimeout(r, 0);
        requestAnimationFrame(go);
        setTimeout(go, 60);
      });
    },
  );
  if (mine !== launching || screen !== 'loading') return;
  session = made;
  session.setView(W / scale, H / scale);
  hud.layout(session.world, DPR);
  paused = false;
  setScreen('game');
  ready?.(made);
}

function startCareerRace(race: RaceId): void {
  const k = loadCareer();
  const s = raceSetup(content, k, race);
  careerRace = race;
  const venue = content.venue.get(s.venue)!.meta.name.toUpperCase();
  void launch(
    { venue: s.venue, car: k.car, seed: s.seed, field: s.field, player: s.player, knockout: true },
    venue,
  );
}

function startGame(venue: string): void {
  careerRace = null;
  lastVenue = venue;
  const seed = params.has('seed')
    ? Number(params.get('seed'))
    : Math.floor(Math.random() * 2 ** 31);
  void launch(
    { venue, car: cars[carIdx]!.id, seed },
    content.venue.get(venue)!.meta.name.toUpperCase(),
  );
}

/** The test range: a derby bowl with every other car parked as a target, and endless rockets. */
function startDev(car: string): void {
  careerRace = null;
  const venue = venues.find((v) => content.mode.get(v.mode)!.kind === 'derby') ?? venues[0]!;
  const rocket = [...content.weapon.values()].find((w) => w.kind === 'rocket');
  void launch(
    {
      venue: venue.id,
      car,
      seed: 1,
      autopilot: false,
      sandbox: true,
      field: cars
        .filter((c) => c.id !== car)
        .map((c) => ({ car: c.id, name: c.meta.name.toUpperCase(), paint: c.paint })),
      ...(rocket ? { player: { weapon: { id: rocket.id, ammo: 9999 } } } : {}),
    },
    'TEST RANGE',
    (s) => {
      devMode = true;
      dev.open(s, car);
    },
  );
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
  $('toMenu').textContent = 'MENU';
  if (online.room) {
    $('again').textContent = online.isHost ? 'BACK TO THE ROOM' : 'WAITING FOR THE HOST…';
    $('toMenu').textContent = 'LEAVE ROOM';
  }
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
  $('restart').classList.toggle('hidden', careerRace !== null || devMode || online.room !== null);
  $('quit').textContent = careerRace
    ? 'GIVE UP THE RACE'
    : online.room
      ? 'LEAVE THE ONLINE RACE'
      : 'QUIT TO MENU';
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

// ---- the performance recorder (from mudders): REC on the pause menu, or ?perf
let perf: PerfRecorder | null = null;
let glWatch: { take: () => number; stop: () => void } | null = null;
const slow = new SlowWatch();

function perfContext(): PerfContext {
  const s = session!;
  const w = s.world;
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    phase: devMode ? 'range' : w.phase,
    quality: s.fx.quality.toFixed(2),
    cells: s.fx.cells.n,
    particles: s.fx.fx.length,
    voxels: s.fx.voxels.length,
    slices: scene instanceof PixelScene ? scene.instances : 0,
    fires: s.fx.fires.length,
    pools: w.spills.length,
    fallen: w.statics.reduce((n, p) => n + (p.down ? 1 : 0), 0),
    note: `${w.venue.id} ${w.player.def.id}${scene instanceof PixelScene ? ` atlas ${Math.round(scene.atlasState.fill * 100)}% x${scene.atlasState.flushes}` : ''}`,
    heap: mem ? mem.usedJSHeapSize / 1048576 : 0,
  };
}

function startPerf(): void {
  if (perf) return;
  perf = new PerfRecorder({
    game: `demodogs ${content.packs.map((p) => `${p.name}@${p.version}`).join(' ')}`,
    when: new Date().toISOString(),
    agent: navigator.userAgent,
    screen: `${innerWidth}x${innerHeight} css px, dpr ${devicePixelRatio}`,
    renderer: rendererName,
    cores: navigator.hardwareConcurrency ?? 0,
  });
  const rec = perf;
  if (scene instanceof PixelScene)
    glWatch = watchGl(scene.gl, (ms) =>
      rec.note(performance.now(), 'shader linked', `${ms.toFixed(1)} ms`),
    );
  document.body.classList.add('recording');
  setRecLabel();
}

/** Stop recording and hand the log over: shared where the device can, downloaded otherwise. */
function stopPerf(): void {
  if (!perf) return;
  const text = perf.report();
  const name = perfFileName(new Date());
  perf = null;
  glWatch?.stop();
  glWatch = null;
  document.body.classList.remove('recording');
  setRecLabel();
  const file = new File([text], name, { type: 'text/plain' });
  const save = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };
  (window as unknown as { __dd: { perfLog?: string } }).__dd.perfLog = text;
  if (navigator.canShare?.({ files: [file] }))
    navigator.share({ files: [file], title: name }).catch(save);
  else save();
}

function setRecLabel(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.recBtn'))
    b.textContent = perf ? `STOP AND SAVE LOG (${perf.seconds} s)` : 'RECORD PERFORMANCE';
  $('recDot').textContent = perf ? `REC ${perf.seconds}s` : '';
}

if ('PerformanceObserver' in window)
  for (const type of ['long-animation-frame', 'longtask'])
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          perf?.stall(e.startTime, type, e.duration, stallDetail(e));
      }).observe({ type, buffered: false });
    } catch {
      // this browser does not report that kind of stall
    }
addEventListener('error', (e) => perf?.note(performance.now(), 'error', e.message));
document.addEventListener('visibilitychange', () =>
  perf?.note(performance.now(), 'tab', document.hidden ? 'hidden' : 'shown'),
);

let last = performance.now();
function frame(t: number): void {
  requestAnimationFrame(frame);
  const wall = t - last;
  const dt = Math.min(0.1, Math.max(0, wall / 1000));
  last = t;
  if (screen === 'game' && session) {
    const f0 = performance.now();
    if (input.takePause()) togglePause();
    session.ticks = session.simMs = session.stepMs = 0;
    // an online race never stops for one player's pause menu
    if ((!paused || online.racing) && session.advance(dt)) {
      finish();
      return;
    }
    const r0 = performance.now();
    scene.draw(session.world, session.fx, session.ground, session.cam, W, H, DPR);
    const r1 = performance.now();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, W, H);
    drawOverlay(octx, scene, session.world, session.fx, W, H, DPR);
    if (devMode) dev.frame(dt);
    else hud.draw(session.world, session.fx, W, H, DPR);
    updateFireButton();
    if (online.racing) $('netDot').textContent = online.status();
    // a device that keeps falling behind gets thinner fire and smoke, by itself
    if (!paused && slow.frame(t, wall) && session.fx.quality > 0.3) {
      session.fx.quality = Math.max(0.3, session.fx.quality * 0.65);
      perf?.note(t, 'quality', `effects thinned to ${session.fx.quality.toFixed(2)}`);
    }
    if (perf && !paused) {
      if (glWatch) perf.drew(glWatch.take());
      const { ticks, simMs, stepMs } = session;
      const other = performance.now() - f0 - simMs - stepMs - (r1 - r0);
      const before = perf.seconds;
      perf.frame(
        t,
        wall,
        ticks,
        simMs,
        stepMs,
        r1 - r0,
        Math.max(0, other),
        dt * 1000 * session.rate,
        perfContext,
      );
      if (perf.seconds !== before) setRecLabel();
    }
  } else if (screen === 'menu') garage.draw(cars[carIdx]!, dt);
  else if (screen === 'career') careerScreen.draw(dt);
}

function boot(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('.recBtn'))
    b.onclick = () => (perf ? stopPerf() : startPerf());
  if (params.has('perf')) startPerf();
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
  $('again').onclick = () => {
    if (online.room) {
      if (online.isHost) online.backToLobby();
    } else if (lastCareer) openCareer();
    else startGame(lastVenue);
  };
  $('toOnline').onclick = () => openOnline();
  $('toCareer').onclick = openCareer;
  $('toDev').onclick = () => startDev(cars[carIdx]!.id);
  $('toMenu').onclick = () => {
    if (online.room) online.leave();
    document.body.classList.remove('online');
    setScreen('menu');
  };
  $('pauseBtn').onclick = togglePause;
  $('resume').onclick = togglePause;
  $('restart').onclick = () => startGame(lastVenue);
  $('quit').onclick = () => {
    paused = false;
    if (online.room) {
      online.leave();
      document.body.classList.remove('online');
    }
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
    if (document.hidden && screen === 'game' && !paused && !online.racing) togglePause();
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
  if (params.has('dev')) {
    const c = params.get('car');
    startDev(cars.find((x) => x.id === c || x.id === `car.${c}`)?.id ?? cars[carIdx]!.id);
  }
  if (params.has('room')) openOnline(params.get('room') ?? '');
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
      get atlas() {
        return scene instanceof PixelScene ? scene.atlasState : null;
      },
      get screen() {
        return screen;
      },
      dev,
      online,
    },
  });
  requestAnimationFrame(frame);
}

boot();
