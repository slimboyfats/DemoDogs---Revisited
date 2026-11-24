import { VIEW } from './render/pixel/view-hack';
import {
  PerfRecorder,
  SlowWatch,
  perfFileName,
  stallDetail,
  watchGl,
  type PerfContext,
} from './game/perf-log';
import { SliceFx } from './render/slice-fx';
import { Resolution, resSteps } from './game/resolution';
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
import { Spectator, scrapped, zooms, type Zoom } from './game/spectate';
import { Input } from './input/input';
import { isKey } from './input/keys';
import { Art } from './render/art';
import { Hud, placeName } from './render/hud';
import { drawNames, drawOverlay, type WorldRenderer } from './render/overlay';
import { PixelScene } from './render/pixel/pixel-scene';
import { SKIES } from './render/atmosphere';
import { overdrawLine, type Channel, type OverdrawStats } from './render/pixel/overdraw';
import { PITCH, Scene } from './render/scene';
import { CareerScreen, money } from './ui/career-screen';
import { DevPanel } from './ui/dev-panel';
import { Garage } from './ui/garage';
import { KeyHints } from './ui/key-hints';
import { NameTags } from './ui/name-tags';
import { results } from './ui/results';
import { SpectateBar } from './ui/spectate';
import { signalUrl } from './net/config';
import { OnlineScreen } from './ui/online';
import type { TrackFile } from '@demodogs/shared';
import { customVenueId, installTrack, type Content, type Installed } from '@demodogs/sim';
import { LocalTrackStore, type KeyValue } from './game/tracks';
import { TrackEditor } from './ui/track-editor';
import { TracksScreen } from './ui/tracks-screen';
import { modChips, modLine, parseMods, resolveMods } from './ui/mod-chips';

/**
 * The app: menu with the garage turntable, the game loop, pause and results. URL hooks for testing:
 * ?mods=<names> switches world modifiers on (downpour,gale ... or all, or wild) for quick races
 * and the test range. ?start=<venue>&car=<car>&autoplay&seed=<n> jumps straight into a race (autoplay drives the
 * player's car with the rivals' AI, &ghosts=<n> adds idle drivers so there is a race left to watch
 * once your car is scrapped); ?career opens the career, ?career=<easy|medium|hard|final>
 * enters that race; ?dev opens the test range; ?edit opens the track creator on a new track.
 * window.__dd exposes the running session, the
 * career and the test range's tools (`__dd.dev.use(x, y, 'blast')`).
 */
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);

const content = loadContent();
const art = new Art(loadLooks());
const sound = new Sound();
// ?tape=40 tapes that many seconds of sound, in step with the game's ticks (scripts/capture-audio.mjs)
if (params.get('tape')) sound.record(Number(params.get('tape')) || 30);
const input = new Input(() => sound.init());
const keyHints = new KeyHints();
const nameTags = new NameTags();
// how sharp the game is drawn: steps down by itself on a device that keeps falling behind. A
// driven browser (the capture scripts) stays at full unless the address says otherwise, so a slow
// headless frame never changes what a screenshot shows.
const resolution = new Resolution(
  safeStore(),
  params.get('res') ?? (navigator.webdriver ? 'full' : null),
);
function safeStore(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}
// Tab while driving: the names over the cars, on and off (spectating, Tab is the next car)
addEventListener('keydown', (e) => {
  if (!isKey('watch', e.key.toLowerCase()) || e.repeat || e.metaKey || e.ctrlKey || e.altKey)
    return;
  if (screen !== 'game' || paused || specBar.shown) return;
  e.preventDefault();
  nameTags.toggle();
});
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
let screen: 'menu' | 'game' | 'results' | 'career' | 'loading' | 'online' | 'tracks' = 'menu';
/** The game on screen is the test range. */
let devMode = false;
/** The game on screen is the track creator. */
let editMode = false;
/** The custom track in hand: being built, or being test driven from the editor. */
let editing: TrackFile | null = null;
/** Device pixels per art pixel in the track creator (it can pull back to the whole map). */
let editShown = 4;
/** The custom track being raced (GO AGAIN races it again), or null on the game's own venues. */
let lastCustom: Installed | null = null;
const SAVE = 'dd-career-v1';
let career: Career | null = null;
/** The career race being run, or null in a quick race. */
let careerRace: RaceId | null = null;

/** World modifiers picked for quick races: ?mods= wins, otherwise what was picked last time. */
const MODS = 'dd-mods-v1';
let worldMods: string[] = [];
try {
  worldMods = parseMods(content, params.get('mods') ?? localStorage.getItem(MODS));
} catch {
  worldMods = parseMods(content, params.get('mods'));
}

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
  stats: () => {
    if (!(scene instanceof PixelScene)) return 'canvas';
    const o = scene.meterOn ? scene.overdraw : null;
    return `slices ${scene.instances}${o ? `\nfragments/px  ${overdrawLine(o)}` : ''}`;
  },
  heat: () => {
    if (!(scene instanceof PixelScene)) return 'NO GL';
    // off -> written -> solid -> covered -> particles -> numbers only -> off
    const order: (Channel | null)[] = ['written', 'solid', 'covered', 'particles', null];
    if (!scene.meterOn) {
      scene.setHeat('written');
      return 'HEAT WRITTEN';
    }
    const i = order.indexOf(scene.heatShown);
    if (scene.heatShown === null) {
      scene.setMeter(false);
      return 'OVERDRAW';
    }
    const next = order[i + 1] ?? null;
    scene.setHeat(next);
    return next ? `HEAT ${next.toUpperCase()}` : 'OVERDRAW NUMBERS';
  },
  sky: () => {
    const names = Object.keys(SKIES);
    skyName = names[(names.indexOf(skyName) + 1) % names.length]!;
    setSky(skyName);
    return `SKY ${skyName.toUpperCase().replace('-', ' ')}`;
  },
});
// tracks built in the track creator: kept on the device, raced like any venue
function storage(): KeyValue | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
const trackStore = new LocalTrackStore(storage(), () => new Date().toISOString());
const editor = new TrackEditor(
  $('editPanel'),
  $('editTap'),
  $('editSetup'),
  $('editTray'),
  content,
  art,
  {
    view: () => ({ w: W, h: H, scale: shown, dpr: DPR }),
    rebuild: (made) => {
      const old = session;
      const s = new Session({ art, sound, input, ...editOptions(made), autopilot: false });
      if (old) Object.assign(s.cam, { x: old.cam.x, y: old.cam.y });
      s.setView(W / shown, H / shown);
      session = s;
      return s;
    },
    setZoom: (k) => {
      editShown = shown = k;
      scene.setScale(k);
      session?.setView(W / k, H / k);
    },
    zoomRange: () => {
      const w = session!.world;
      // from the whole map with room to spare, to twice as close as a race is shown
      const fit = Math.min(W / w.w, (H * 0.6) / (w.h * Math.sin(PITCH)));
      return [Math.min(fit * 0.8, scale / 2), scale * 2];
    },
    save: (t) => {
      editing = t;
      void trackStore.put(t);
    },
    drive: (t) => raceTrack(t),
    exit: () => openTracks(),
  },
);
const tracksScreen = new TracksScreen($('tracksPanel'), content, trackStore, {
  edit: startEditor,
  race: (t) => {
    editing = null;
    raceTrack(t);
  },
  back: () => setScreen('menu'),
});
function openTracks(): void {
  editing = null;
  setScreen('tracks');
  tracksScreen.open();
}
function editOptions(made: Installed): Launch & { content: Content } {
  return {
    content: made.content,
    venue: made.venue,
    car: cars[carIdx]!.id,
    seed: 1,
    autopilot: false,
    sandbox: true,
    field: [],
    laps: made.laps,
  };
}
/** The track creator on a track: the track built as a world that stands still. */
function startEditor(t: TrackFile): void {
  careerRace = null;
  editing = t;
  let made;
  try {
    made = installTrack(content, t);
  } catch {
    openTracks();
    return;
  }
  void launch(editOptions(made), 'TRACK CREATOR', (s) => {
    editMode = true;
    editShown = scale;
    // a world that stands still never finishes rising out of the ground: show it risen
    if (scene instanceof PixelScene) scene.bloom = false;
    document.body.classList.add('editing');
    editor.open(s, t);
    if (made.dropped.length)
      editor.say(`Not in this version of the game, left out: ${made.dropped.join(', ')}`);
  });
}
/** Race a custom track like any venue. */
function raceTrack(t: TrackFile): void {
  startGame(customVenueId(t.id), installTrack(content, t));
}
/**
 * A custom track's weather areas: the screen takes the sky of the area it is over, and goes back
 * to the sky it had when it leaves. Not in the editor, where the whole map is in view at once.
 */
let areaSky: string | null = null;
function weatherAreas(): void {
  if (!session || !(scene instanceof PixelScene)) return;
  let name: string | null = null;
  if (!editMode && !devMode)
    for (const a of session.world.venue.weather ?? [])
      if (SKIES[a.sky] && Math.hypot(a.x - session.cam.x, a.y - session.cam.y) <= a.r) name = a.sky;
  if (name === areaSky) return;
  areaSky = name;
  Object.assign(scene.sky, SKIES[name ?? skyName] ?? SKIES.day);
}
/** The sky by name (see SKIES); false when there is no such sky or no pixel engine. */
let skyName = 'day';
function setSky(name: string, now = false): boolean {
  const k = SKIES[name];
  if (!k || !(scene instanceof PixelScene)) return false;
  skyName = name;
  areaSky = null;
  Object.assign(scene.sky, k);
  if (now) scene.sky.snap();
  return true;
}
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
      // the host's own track: every screen builds the same venue from the same file
      let made: Installed | null = null;
      if (s.track)
        try {
          made = installTrack(content, s.track);
        } catch {
          online.fail('The host’s track could not be built on this device.');
          return;
        }
      void launch(
        {
          venue: made?.venue ?? s.venue,
          ...(made ? { content: made.content, laps: made.laps } : {}),
          car: host.car,
          name: host.name,
          paint: host.paint,
          seed: s.seed,
          autopilot: false,
          modifiers: s.mods,
          humans: s.seats.slice(1).map((x) => ({ car: x.car, name: x.name, paint: x.paint })),
          you: s.you,
        },
        `ONLINE · ${(s.track?.name ?? content.venue.get(s.venue)?.meta.name ?? '').toUpperCase()}${modLine(content, s.mods)}`,
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
  () => trackStore.list(),
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
/** Overlay pixels per canvas pixel: the HUD stays sharp when the game is drawn at a lower resolution. */
let overK = 1;
/** Device pixels per art pixel when driving, and as shown now (a spectator can pull back). */
let scale = 4;
let shown = 4;

// once this screen's car is out of it, the camera can follow the others: a viewpoint, not a rule
const spectator = new Spectator();
let specZooms: Zoom[] = [];
const specBar = new SpectateBar({
  next: (dir) => session && spectator.next(session.world, dir),
  zoom: () => spectator.nextZoom(specZooms.length),
  skip: () => {
    if (screen === 'game' && spectator.active && !online.room) finish();
  },
});

/** How much of the screen's height the whole-arena view may fill. */
const ARENA_FILL = 0.86;

/** Point the session's camera where the spectator is looking, at the zoom picked. */
function spectate(dt: number): void {
  const s = session;
  if (!s) return;
  const w = s.world;
  if (!paused || online.racing) spectator.update(w, dt);
  const on = spectator.active;
  if (on && specZooms.length === 0)
    // the arena view keeps clear of the bar along the bottom
    specZooms = zooms(w.w, w.h, W / scale, (H / scale / Math.sin(PITCH)) * ARENA_FILL);
  const z = on ? (specZooms[spectator.zoom] ?? specZooms[0]!) : null;
  s.watch = on ? spectator.target : null;
  // whole art pixels where there is room for them; the arena view takes what fits
  const drive = editMode ? editShown : scale;
  const want = z ? (z.whole ? z.k * scale : Math.max(1, Math.round(z.k * scale * 2) / 2)) : drive;
  if (want !== shown) {
    shown = want;
    scene.setScale(shown);
    s.setView(W / shown, H / shown);
  }
  const lift = ((1 - ARENA_FILL) / 2) * (H / shown / Math.sin(PITCH));
  s.spot = z?.whole ? { x: w.w / 2, y: w.h / 2 + lift } : null;
  specBar.show(on && !paused);
  specBar.setSkip(!online.room);
  if (!on || !z) return;
  const c = spectator.target;
  if (c) {
    const place = placeName(w.standings().indexOf(c) + 1);
    const what = c.isPlayer ? 'DRIVER' : 'BOT';
    const state = scrapped(w, c) ? 'SCRAPPED' : c.finished ? 'FINISHED' : place;
    specBar.set(c.name, c.paint, `${state} · ${what}`, z.label);
  } else specBar.set('NOBODY LEFT', '#555', 'ALL SCRAPPED', z.label);
}

function resize(): void {
  const device = devicePixelRatio || 1;
  DPR = resolution.pick(device, Math.min(innerWidth, innerHeight));
  W = Math.round(innerWidth * DPR);
  H = Math.round(innerHeight * DPR);
  canvas.width = W;
  canvas.height = H;
  // the HUD and the words over the game are drawn at the full resolution whatever the game is at
  overK = Math.min(2, device) / DPR;
  overlay.width = Math.round(W * overK);
  overlay.height = Math.round(H * overK);
  const short = Math.min(W, H);
  const long = Math.max(W, H);
  // about 175 art pixels up the short side: far enough out that the cells read as fine grain
  // (on a phone an art pixel is about 4.5 device px, a fire or smoke cell about 2)
  scale = Math.max(2, Math.round(Math.min(short / 175, long / 310) * 2) / 2);
  shown = editShown = scale;
  specZooms = [];
  scene.setScale(scale);
  if (session) {
    session.setView(W / scale, H / scale);
    hud.layout(session.world, DPR);
  }
}

/** The RESOLUTION buttons say what is picked, and what it comes to on this screen. */
function showRes(): void {
  const text = `RESOLUTION ${resolution.mode.toUpperCase()} · ${W}×${H}`;
  for (const b of document.querySelectorAll<HTMLButtonElement>('.resBtn')) b.textContent = text;
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.resBtn'))
  b.onclick = () => {
    resolution.next();
    resize();
    showRes();
  };

function show(id: string | null): void {
  for (const k of ['menu', 'results', 'pauseMenu', 'career', 'loader', 'online', 'tracks'])
    $(k).classList.toggle('hidden', k !== id);
}

function setScreen(s: typeof screen): void {
  screen = s;
  document.body.dataset.screen = s;
  if (s !== 'game') specBar.show(false);
  if (s !== 'game' && devMode) {
    devMode = false;
    dev.close();
  }
  if (s !== 'game' && editMode) {
    editMode = false;
    editor.close();
    if (scene instanceof PixelScene) scene.bloom = params.get('bloom') !== '0';
    document.body.classList.remove('editing');
  }
  if (s === 'loading') show('loader');
  else if (s === 'game') {
    show(null);
    sound.engineStart();
    sound.music(session?.tune ?? 'menu');
    sound.musicMuffle(false);
  } else {
    show(s);
    sound.engineStop();
    sound.music('menu');
    sound.musicMuffle(false);
  }
}

function updateFireButton(): void {
  const b = $('btnFire');
  const P = session?.world.player;
  if (!P) return;
  const text = P.weapon ? `${P.weapon.label} ×${P.ammo}` : 'FIRE';
  const label = $('fireLabel');
  if (label.textContent !== text) label.textContent = text;
  b.classList.toggle('empty', !P.weapon);
  keyHints.setFire(text, !P.weapon);
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
  spectator.reset();
  specZooms = [];
  if (shown !== scale) scene.setScale((shown = scale));
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

function startGame(venue: string, custom: Installed | null = null): void {
  careerRace = null;
  lastVenue = venue;
  lastCustom = custom;
  const C = custom?.content ?? content;
  const seed = params.has('seed')
    ? Number(params.get('seed'))
    : Math.floor(Math.random() * 2 ** 31);
  const modifiers = resolveMods(content, worldMods, seed);
  // ?ghosts=<n> seats n more drivers who never touch the controls, so the race outlives your car
  const ghosts = Math.min(3, Number(params.get('ghosts')) || 0);
  const humans = Array.from({ length: ghosts }, (_, i) => {
    const c = cars[(carIdx + 1 + i) % cars.length]!;
    return { car: c.id, name: `GHOST ${i + 1}`, paint: c.paint };
  });
  void launch(
    // a derby plays on after you are scrapped: watch it out, or skip to the results
    {
      venue,
      car: cars[carIdx]!.id,
      seed,
      modifiers,
      playOn: true,
      ...(ghosts ? { humans } : {}),
      ...(custom ? { content: C, laps: custom.laps } : {}),
    },
    C.venue.get(venue)!.meta.name.toUpperCase() + modLine(content, modifiers),
  );
}

/** The test range: a derby bowl with every other car parked as a target, and endless rockets. */
function startDev(car: string): void {
  careerRace = null;
  // ?dev&venue=<id> opens the range on that venue (a flyover to test on, say); otherwise the
  // plain bowl, so new derby maps (crushers, towers) do not end up under the targets
  const pick = params.get('venue');
  const venue =
    venues.find((v) => pick !== null && (v.id === pick || v.id === `venue.${pick}`)) ??
    venues.find((v) => v.id === 'venue.the-pit') ??
    venues.find((v) => content.mode.get(v.mode)!.kind === 'derby') ??
    venues[0]!;
  const rocket = [...content.weapon.values()].find((w) => w.kind === 'rocket');
  void launch(
    {
      venue: venue.id,
      car,
      seed: 1,
      autopilot: false,
      sandbox: true,
      modifiers: resolveMods(content, parseMods(content, params.get('mods')), 1),
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
  $('toMenu').textContent = editing ? 'BACK TO THE EDITOR' : 'MENU';
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
  if (screen !== 'game' || editMode) return;
  paused = !paused;
  show(paused ? 'pauseMenu' : null);
  $('restart').classList.toggle('hidden', careerRace !== null || devMode || online.room !== null);
  $('quit').textContent = careerRace
    ? 'GIVE UP THE RACE'
    : online.room
      ? 'LEAVE THE ONLINE RACE'
      : editing
        ? 'BACK TO THE EDITOR'
        : 'QUIT TO MENU';
  sound.musicMuffle(paused);
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
  $('worldPick').append(
    modChips(
      content,
      worldMods,
      (m) => {
        worldMods = m;
        try {
          localStorage.setItem(MODS, m.join(','));
        } catch {
          /* private mode */
        }
      },
      true,
    ),
  );
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
    quality: `${s.fx.quality.toFixed(2)} ${W}x${H}`,
    cells: s.fx.cells.live,
    particles: s.fx.fx.length,
    voxels: s.fx.voxels.length,
    slices: scene instanceof PixelScene ? scene.instances : 0,
    fires: s.fx.fires.length,
    pools: w.spills.length,
    fallen: w.statics.reduce((n, p) => n + (p.down ? 1 : 0), 0),
    overdraw:
      scene instanceof PixelScene && scene.meterOn && scene.overdraw
        ? overdrawShort(scene.overdraw)
        : '',
    note: `${w.venue.id} ${w.player.def.id}${scene instanceof PixelScene ? ` atlas ${Math.round(scene.atlasState.fill * 100)}% x${scene.atlasState.flushes}` : ''}`,
    heap: mem ? mem.usedJSHeapSize / 1048576 : 0,
  };
}

/** Fragments per pixel for the perf log: covered, solid, written, front-to-back, the floor, shelled written, particles. */
function overdrawShort(o: OverdrawStats): string {
  const a = o.avg;
  return [a.covered, a.solid, a.written, a.front, o.visible, a.shellWritten, a.particles]
    .map((v) => v.toFixed(2))
    .join(' ');
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
let meterFrames = 0;
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
    if ((!paused || online.racing) && !VIEW.freeze && session.advance(dt)) {
      finish();
      return;
    }
    spectate(dt);
    weatherAreas();
    // the slice effects run on the frame's clock: the track creator stops the sim, not them
    session.fx.slices.frame(session.world, paused && !online.racing ? 0 : dt);
    const r0 = performance.now();
    // the overdraw meter reads its counts back about twice a second (a GPU stall, so not every frame)
    if (scene instanceof PixelScene && scene.meterOn && ++meterFrames % 30 === 0)
      scene.measureNext();
    scene.draw(session.world, session.fx, session.ground, session.cam, W, H, DPR);
    const r1 = performance.now();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(overK, 0, 0, overK, 0, 0);
    drawOverlay(octx, scene, session.world, session.fx, W, H, DPR);
    if (spectator.active) drawNames(octx, scene, session.world, spectator.target, W, H, DPR);
    else if (nameTags.shown && !devMode)
      drawNames(octx, scene, session.world, null, W, H, DPR, session.world.player);
    if (editMode) editor.draw(octx, dt);
    else if (devMode) dev.frame(dt);
    else hud.draw(session.world, session.fx, W, H, DPR, session.watch ?? session.world.player);
    updateFireButton();
    if (online.racing) $('netDot').textContent = online.status();
    // a device that keeps falling behind gets thinner fire and smoke, by itself, then fewer
    // pixels to fill (the bigger lever, but the one that shows), then thinner effects again
    if (!paused && slow.frame(t, wall)) {
      const fx = session.fx;
      if (
        fx.quality <= 0.7 &&
        resolution.drop(devicePixelRatio || 1, Math.min(innerWidth, innerHeight))
      ) {
        resize();
        showRes();
        perf?.note(t, 'quality', `resolution down to ${W}x${H}`);
      } else if (fx.quality > 0.3) {
        fx.quality = Math.max(0.3, fx.quality * 0.65);
        perf?.note(t, 'quality', `effects thinned to ${fx.quality.toFixed(2)}`);
      }
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
  if (params.has('overdraw') && scene instanceof PixelScene) scene.setMeter(true);
  if (params.get('order') === 'queued' && scene instanceof PixelScene) scene.frontToBack = false;
  if (scene instanceof PixelScene) {
    // the sky and its switches: ?sky=night, ?light=flat, ?bloom=0, ?outline=on|off, ?reflect=0
    if (params.get('light') === 'flat') scene.setFlat(true);
    if (params.get('bloom') === '0') scene.bloom = false;
    // ?relief=0 draws raised ground flat (the cars still feel it): to compare what it costs
    if (params.get('relief') === '0') scene.raised = false;
    // HACK (research): ?view=turn or ?view=chase, and the chase camera's numbers
    VIEW.mode = { turn: 1, chase: 2 }[params.get('view') ?? ''] ?? 0;
    for (const k of ['back', 'up', 'ahead', 'fov', 'fog0', 'fog1'] as const)
      if (params.has(k)) VIEW[k] = Number(params.get(k));
    if (VIEW.mode) scene.raised = false;
    if (params.get('reflect') === '0') scene.reflections = false;
    const line = params.get('outline');
    if (line === 'on' || line === 'off') scene.outline = line;
    setSky(params.get('sky') ?? 'day', true);
  }
  // ?slices=0: nothing is built slice by slice or seen through
  if (params.get('slices') === '0') SliceFx.enabled = false;
  resize();
  showRes();
  addEventListener('resize', () => {
    resize();
    showRes();
  });
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
    else startGame(lastVenue, lastCustom);
  };
  $('toOnline').onclick = () => openOnline();
  $('toCareer').onclick = openCareer;
  $('toDev').onclick = () => startDev(cars[carIdx]!.id);
  $('toTracks').onclick = openTracks;
  $('toMenu').onclick = () => {
    if (online.room) online.leave();
    document.body.classList.remove('online');
    if (editing) startEditor(editing);
    else setScreen('menu');
  };
  $('pauseBtn').onclick = togglePause;
  $('resume').onclick = togglePause;
  $('restart').onclick = () => startGame(lastVenue, lastCustom);
  $('quit').onclick = () => {
    paused = false;
    if (online.room) {
      online.leave();
      document.body.classList.remove('online');
    }
    // walking out of a career race is a last place, not a free retry
    if (careerRace) finish(true);
    else if (editing) startEditor(editing);
    else setScreen('menu');
  };
  const muteBtns = document.querySelectorAll<HTMLButtonElement>('.muteBtn');
  const label = () => muteBtns.forEach((b) => (b.textContent = sound.label));
  muteBtns.forEach((b) => (b.onclick = () => (sound.cycle(), label())));
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
  if (params.has('edit')) void tracksScreen.create();
  if (params.has('room')) openOnline(params.get('room') ?? '');
  if (params.has('career')) {
    const race = params.get('career');
    if (race === 'easy' || race === 'medium' || race === 'hard' || race === 'final')
      startCareerRace(race);
    else openCareer();
  }
  Object.assign(window, { __ddView: VIEW, __ddScene: scene });
  Object.assign(window, {
    __dd: {
      renderer: rendererName,
      sound,
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
      /** What the screen shows: device px size, device px per art px as drawn, device px per CSS px. */
      view: () => ({ w: W, h: H, scale: shown, dpr: DPR }),
      editor,
      /** The resolution for scripts: the steps this screen has, and `set(n)` to draw n steps down. */
      res: {
        steps: () => resSteps(devicePixelRatio || 1, Math.min(innerWidth, innerHeight)),
        set(drop: number) {
          resolution.mode = 'auto';
          resolution.dropped = drop;
          resize();
          showRes();
        },
      },
      tracks: trackStore,
      online,
      spectator,
      /**
       * The sky for scripts: `set('night')` (see SKIES; `now` skips the fade), `flat(true)` for the
       * old flat light, and `state` to read or set dark, wet and snow directly.
       */
      sky: {
        set: (name: string, now = true) => setSky(name, now),
        flat(on: boolean): void {
          if (scene instanceof PixelScene) scene.setFlat(on);
        },
        get state() {
          return scene instanceof PixelScene ? scene.sky : null;
        },
        get scene() {
          return scene instanceof PixelScene ? scene : null;
        },
        /** Strips still waiting for their lighting to be baked. */
        get baking() {
          return scene instanceof PixelScene ? scene.baking : 0;
        },
      },
      /**
       * The overdraw meter for scripts: `measure()` draws the current frame again with the counts
       * and returns them (fragments per pixel); `heat(channel | null)` shows a heat map.
       */
      overdraw: {
        measure(): OverdrawStats | null {
          if (!(scene instanceof PixelScene) || !session) return null;
          scene.setMeter(true);
          scene.measureNext();
          scene.draw(session.world, session.fx, session.ground, session.cam, W, H);
          return scene.overdraw;
        },
        heat(ch: Channel | null): void {
          if (scene instanceof PixelScene) scene.setHeat(ch);
        },
        off(): void {
          if (scene instanceof PixelScene) scene.setMeter(false);
        },
        /** The world as last drawn, read from the canvas (RGBA rows, bottom first), to compare looks. */
        pixels(): Uint8Array | null {
          if (!(scene instanceof PixelScene) || !session) return null;
          scene.draw(session.world, session.fx, session.ground, session.cam, W, H);
          const out = new Uint8Array(W * H * 4);
          scene.gl.readPixels(0, 0, W, H, scene.gl.RGBA, scene.gl.UNSIGNED_BYTE, out);
          return out;
        },
        /** Draw slices nearest first (true, the default) or as queued (false). */
        order(front: boolean): void {
          if (scene instanceof PixelScene) scene.frontToBack = front;
        },
      },
    },
  });
  requestAnimationFrame(frame);
}

boot();
