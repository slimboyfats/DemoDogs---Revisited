/** Every sound is synthesised with Web Audio, so the game ships no sound files. */
import { Ambience, type Air } from './ambience';
import { EngineVoice, PLAIN, SkidVoice, type EngineNote } from './engine';
import { JINGLES, hertz, jingleSeconds, type Jingle, type JingleName } from './jingles';
import { clipCurve, Music } from './music';
import { tune, type Tune } from './tunes';
import { FULL, gainOf, readVolume, type Channel, type Volume } from './volume';

const MUTE_KEY = 'dd-muted';
const MUSIC_KEY = 'dd-music';
const VOLUME_KEY = 'dd-volume';
const LEVEL = 0.6;

/** What the car on screen is doing, for its engine and tyres. */
export interface Drive {
  /** Its speed as a share of its top speed. */
  frac: number;
  throttle: number;
  boost: boolean;
  /** How hard its tyres are sliding, 0 to 1, and whether the ground under them is loose. */
  slide: number;
  loose: boolean;
  /** Whose engine it is (see `engineNote`); the pickup's when not said. */
  note?: EngineNote;
  /** The nearest other car: the same, and how near it is (1 alongside, 0 out of earshot). */
  rival: { frac: number; throttle: number; near: number; note?: EngineNote } | null;
}

/** What a thing that was hit is made of, as far as the ear can tell (a material's `sound`). */
export const TIMBRES = ['car', 'metal', 'wood', 'stone', 'rubber', 'glass', 'soft'] as const;
export type Timbre = (typeof TIMBRES)[number];

const CALLS: readonly (readonly number[])[] = [
  [0, 4, 7, 12],
  [0, 3, 7, 12],
  [0, 7, 12, 19],
  [0, 5, 7, 12],
  [12, 7, 4, 12],
  [0, 12, 7, 16],
  [0, 2, 4, 9],
  [0, 4, 9, 16],
];
const ROOTS = [392, 440, 494, 523, 587, 659] as const;

/** The call of a pickup of this kind: where it starts (hertz), its four steps, its wave. */
export function pickupCall(kind: string): [number, readonly number[], OscillatorType] {
  if (!kind) return [523, CALLS[0]!, 'square'];
  let h = 2166136261;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619) >>> 0;
  return [
    ROOTS[h % ROOTS.length]!,
    CALLS[(h >>> 8) % CALLS.length]!,
    (h >>> 16) % 3 === 0 ? 'triangle' : 'square',
  ];
}

/** The small sounds of the menus. */
export type Ui = 'tap' | 'back' | 'tab' | 'tick' | 'go';

export class Sound {
  private ac: BaseAudioContext | null = null;
  /** The last thing before the speakers: the VOLUME slider. */
  private out: GainNode | null = null;
  /** Every sound but the tune meets here: the FX slider. */
  private master: GainNode | null = null;
  /** Where loud things go: a soft clip, and a room that answers them. */
  private big: GainNode | null = null;
  /** Where gunfire goes: a hard clip, and only a little of the room. */
  private guns: GainNode | null = null;
  private lastShot = -1;
  private musicOut: GainNode | null = null;
  private tunes: Music | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private engine: {
    own: EngineVoice;
    rival: EngineVoice;
    skid: SkidVoice;
    air: Ambience;
  } | null = null;
  /** When each kind of knock was last heard, so a pile-up is not one long roar. */
  private readonly lastKnock = new Map<string, number>();
  private muted_ = false;
  private music_ = true;
  private volume: Volume = { ...FULL };
  /** The tune asked for, which starts once there is an audio context to play it. */
  private wanted: Tune | null = null;
  /** Loud sounds are being sent to the room. */
  private loud = false;
  /** Taping: seconds to tape, and the clock that stands in for real time. */
  private tape = 0;
  private clock = 0;

  constructor() {
    try {
      this.muted_ = localStorage.getItem(MUTE_KEY) === '1';
      this.music_ = localStorage.getItem(MUSIC_KEY) !== '0';
      this.volume = readVolume(localStorage.getItem(VOLUME_KEY));
    } catch {
      /* storage blocked */
    }
  }

  get muted(): boolean {
    return this.muted_;
  }

  /** What the sound button says. */
  get label(): string {
    if (this.level('master') === 0) return 'SOUND OFF';
    return this.level('music') > 0 ? 'SOUND + MUSIC' : 'SOUND, NO MUSIC';
  }

  get taping(): boolean {
    return this.tape > 0;
  }

  /** How many seconds of tape have run. */
  get tapeTime(): number {
    return this.clock;
  }

  private now(): number {
    return this.tape > 0 ? this.clock : (this.ac?.currentTime ?? 0);
  }

  /** Call from a user gesture: browsers only start audio after one. */
  init(): void {
    if (this.ac) {
      if (this.ac instanceof AudioContext && this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ac: BaseAudioContext =
      this.tape > 0
        ? new OfflineAudioContext(2, Math.ceil(this.tape * 44100), 44100)
        : new AudioContext();
    this.ac = ac;
    // everything meets in a compressor, so a blast and the tune share the room they have
    const squash = ac.createDynamicsCompressor();
    squash.threshold.value = -16;
    squash.knee.value = 10;
    squash.ratio.value = 5;
    squash.attack.value = 0.004;
    squash.release.value = 0.22;
    // the volume comes after it, so turning the game down never changes how it is squeezed
    this.out = ac.createGain();
    squash.connect(this.out).connect(ac.destination);
    this.master = ac.createGain();
    this.master.connect(squash);
    this.musicOut = ac.createGain();
    this.musicOut.connect(squash);
    this.levels();
    this.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // the room: a second and a half of dying noise, quieter and duller as it goes
    const len = Math.floor(ac.sampleRate * 1.5);
    const room = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const r = room.getChannelData(c);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        last += (Math.random() * 2 - 1 - last) * (0.75 - 0.6 * k);
        r[i] = last * (1 - k) ** 2.4;
      }
    }
    this.big = ac.createGain();
    const clip = ac.createWaveShaper();
    clip.curve = clipCurve(2.2);
    const echo = ac.createConvolver();
    echo.buffer = room;
    const wet = ac.createGain();
    wet.gain.value = 0.3;
    this.big.connect(clip).connect(this.master);
    clip.connect(echo).connect(wet).connect(this.master);
    this.guns = ac.createGain();
    const bite = ac.createWaveShaper();
    bite.curve = clipCurve(4);
    const send = ac.createGain();
    send.gain.value = 0.3;
    this.guns.connect(bite).connect(this.master);
    bite.connect(send).connect(echo);
    this.tunes = new Music(ac, this.musicOut, this.noiseBuf);
    if (this.wanted) this.tunes.play(tune(this.wanted), this.now());
    if (ac instanceof AudioContext) setInterval(() => this.tunes?.pump(this.now()), 60);
  }

  private levels(): void {
    const set = (g: GainNode | null, v: number) => {
      if (!g) return;
      // a slider being dragged moves the level smoothly, without a click
      if (this.ac instanceof AudioContext) g.gain.setTargetAtTime(v, this.ac.currentTime, 0.02);
      else g.gain.value = v;
    };
    set(this.out, gainOf(this.level('master')));
    set(this.master, LEVEL * gainOf(this.level('fx')));
    set(this.musicOut, gainOf(this.level('music')));
  }

  private save(): void {
    try {
      localStorage.setItem(MUTE_KEY, this.muted_ ? '1' : '0');
      localStorage.setItem(MUSIC_KEY, this.music_ ? '1' : '0');
      localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volume));
    } catch {
      /* ignore */
    }
  }

  /** The sound button: everything, then no music, then nothing. */
  cycle(): void {
    if (this.level('master') === 0) {
      // a slider left at nothing would keep the button from bringing the sound back
      this.muted_ = false;
      this.music_ = true;
      if (this.volume.master === 0) this.volume.master = 1;
      if (this.volume.music === 0) this.volume.music = 1;
    } else if (this.level('music') > 0) this.music_ = false;
    else this.muted_ = true;
    this.save();
    this.levels();
  }

  /** Where a volume slider stands, 0 to 1: nothing while the sound button has that part off. */
  level(c: Channel): number {
    if (c === 'master') return this.muted_ ? 0 : this.volume.master;
    if (c === 'music') return this.music_ ? this.volume.music : 0;
    return this.volume.fx;
  }

  /** Move a volume slider. Moving one turns its part back on if the sound button had it off. */
  setLevel(c: Channel, v: number): void {
    this.volume[c] = Math.min(1, Math.max(0, v));
    if (c === 'master') this.muted_ = false;
    if (c === 'music') this.music_ = true;
    this.save();
    this.levels();
  }

  /** The tune to have playing (it carries on if it already is), or none. */
  music(name: Tune | null): void {
    this.wanted = name;
    this.tunes?.play(name ? tune(name) : null, this.now());
  }

  /** The tune goes dull behind the pause menu. */
  musicMuffle(on: boolean): void {
    this.tunes?.muffle(on, this.now());
  }

  /**
   * Tape the next `seconds` of sound instead of playing it, for the capture scripts (`?tape=40`).
   * Its clock is the game's own ticks, so the tape fits the frames a script shoots however slowly
   * they are drawn. Call before `init`.
   */
  record(seconds: number): void {
    if (!this.ac) this.tape = seconds;
  }

  /** One game tick has gone by (only a tape keeps time by it). */
  step(dt: number): void {
    if (this.tape <= 0) return;
    this.clock += dt;
    this.tunes?.pump(this.clock);
  }

  /** The tape as a WAV file, in base64. */
  async tapeWav(): Promise<string> {
    if (!(this.ac instanceof OfflineAudioContext)) return '';
    const buf = await this.ac.startRendering();
    const n = buf.length;
    const out = new DataView(new ArrayBuffer(44 + n * 4));
    const text = (at: number, s: string) =>
      [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
    text(0, 'RIFF');
    out.setUint32(4, 36 + n * 4, true);
    text(8, 'WAVEfmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, 2, true);
    out.setUint32(24, buf.sampleRate, true);
    out.setUint32(28, buf.sampleRate * 4, true);
    out.setUint16(32, 4, true);
    out.setUint16(34, 16, true);
    text(36, 'data');
    out.setUint32(40, n * 4, true);
    const l = buf.getChannelData(0);
    const r = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i]!)) * 32767, true);
      out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i]!)) * 32767, true);
    }
    const bytes = new Uint8Array(out.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Run `make` with its sounds sent through the room, and the tune stepping back by `duck`. */
  private heavy(duck: number, make: () => void): void {
    this.loud = true;
    make();
    this.loud = false;
    if (duck > 0) this.tunes?.duck(duck, this.now());
  }

  private noise(
    dur: number,
    freq: number,
    q: number,
    vol: number,
    type: BiquadFilterType = 'bandpass',
    when = 0,
    slide = 0,
  ): void {
    const ac = this.ac;
    const out = this.loud ? this.big : this.master;
    if (!ac || !out || !this.noiseBuf) return;
    const t = this.now() + when;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.6;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType = 'square',
    slide = 0,
    when = 0,
  ): void {
    const ac = this.ac;
    const out = this.loud ? this.big : this.master;
    if (!ac || !out) return;
    const t = this.now() + when;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The engines (the car on screen and the nearest other) and the tyres start up, silent. */
  engineStart(): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf || this.engine) return;
    this.engine = {
      own: new EngineVoice(ac, this.master, this.noiseBuf),
      rival: new EngineVoice(ac, this.master, this.noiseBuf, 1.045),
      skid: new SkidVoice(ac, this.master, this.noiseBuf),
      air: new Ambience(ac, this.master, this.noiseBuf, {
        tone: (f, dur, vol, type, slide, when) => this.tone(f, dur, vol, type, slide, when),
        noise: (dur, f, q, vol, type, when) => this.noise(dur, f, q, vol, type, when),
      }),
    };
  }

  /** Every tick: what the car on screen is doing. */
  drive(d: Drive): void {
    const e = this.engine;
    if (!e) return;
    const t = this.now();
    e.own.tune(d.note ?? PLAIN, t);
    e.own.set(d.frac, d.throttle, d.boost, 0.2, t);
    if (d.rival) e.rival.tune(d.rival.note ?? PLAIN, t);
    e.rival.set(d.rival?.frac ?? 0, d.rival?.throttle ?? 0, false, 0.1 * (d.rival?.near ?? 0), t);
    e.skid.set(d.slide, d.loose, t);
  }

  /**
   * The sound of the place round the car on screen (see audio/ambience.ts), and `dt` seconds of
   * it going by. Only while the engines run.
   */
  ambience(air: Air, dt: number): void {
    const e = this.engine;
    if (!e) return;
    e.air.set(air, this.now());
    e.air.tick(dt);
  }

  /** A car's engine blipped where it stands: what the garage plays for the car it is showing. */
  rev(note: EngineNote): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf) return;
    const t = this.now();
    const v = new EngineVoice(ac, this.master, this.noiseBuf);
    v.tune(note, t);
    // two stabs of the throttle, the second longer, and back to a tick-over
    const shape: [number, number, number][] = [
      [0, 0.02, 0.1],
      [0.08, 0.17, 1],
      [0.3, 0.06, 0],
      [0.48, 0.2, 1],
      [0.85, 0.08, 0.1],
      [1.15, 0.02, 0],
    ];
    for (const [at, frac, throttle] of shape) v.set(frac, throttle, false, 0.2, t + at);
    v.stop(t + 1.35);
  }

  engineStop(): void {
    const e = this.engine;
    if (!e) return;
    const t = this.now();
    e.own.stop(t);
    e.rival.stop(t);
    e.skid.stop(t);
    e.air.stop(t);
    this.engine = null;
    // the weather goes quiet with the engine (a pause, the menus)
    this.rain(0);
  }

  /**
   * Two hard things meeting, as hard as `power`. `into` is what was hit: a car's bodywork when not
   * said, or what the scenery is made of, which is most of how a rail differs from a fence.
   */
  crash(power: number, into: Timbre = 'car'): void {
    const v = Math.min(0.9, 0.12 + power * 0.008);
    // a car is in nearly every crash: against scenery its own crunch is under the other sound
    const car = into === 'car' ? 1 : into === 'rubber' || into === 'soft' ? 0.2 : 0.45;
    this.heavy(v > 0.5 ? v * 0.3 : 0, () => {
      this.noise(0.25 + power * 0.003, 900, 0.8, v * 1.3 * car);
      this.noise(0.12, 2600, 2, v * 0.8 * car);
      // the weight behind it, and the bodywork ringing
      this.noise(0.2, 300, 0.8, v * 0.8 * car, 'lowpass');
      this.tone(100, 0.16, v * 0.5 * car, 'sine', 0.5);
      this.tone(410, 0.09, v * 0.16 * car, 'square', 0.8);
      this.knock(into, v);
    });
  }

  /** What a thing made of `made` sounds like when it is struck, as loud as `v`. */
  knock(made: Timbre, v: number): void {
    // the same stuff struck again within a moment is the same knock
    const t = this.now();
    if (made === 'car' || t - (this.lastKnock.get(made) ?? -1) < 0.05) return;
    this.lastKnock.set(made, t);
    const jit = 0.92 + Math.random() * 0.16;
    switch (made) {
      case 'metal':
        // a rail rings: three notes that do not agree, dying slowly, and the bang that set them off
        this.tone(312 * jit, 0.55, v * 0.34, 'triangle', 0.985);
        this.tone(861 * jit, 0.4, v * 0.2, 'square', 0.99);
        this.tone(1685 * jit, 0.22, v * 0.1, 'triangle', 0.99);
        this.noise(0.05, 3200, 1, v * 0.7, 'highpass');
        this.tone(140, 0.12, v * 0.4, 'sine', 0.6);
        break;
      case 'wood': {
        // a knock on a board, the crack of it, and splinters ticking down
        this.tone(190 * jit, 0.07, v * 0.6, 'triangle', 0.6);
        this.noise(0.09, 520, 2.2, v * 1.1);
        this.noise(0.035, 1900, 1.4, v * 0.9);
        const n = 2 + Math.floor(v * 4);
        for (let i = 0; i < n; i++)
          this.noise(
            0.025,
            1300 + Math.random() * 1500,
            3,
            v * 0.3,
            'bandpass',
            0.06 + Math.random() * 0.25,
          );
        break;
      }
      case 'stone':
        // dead weight: a thud with no ring in it, and grit
        this.noise(0.28, 210, 0.7, v * 1.5, 'lowpass');
        this.tone(58, 0.2, v * 0.7, 'sine', 0.7);
        this.noise(0.16, 1300, 0.7, v * 0.3, 'bandpass', 0.02);
        break;
      case 'rubber':
        // a tyre wall gives and throws the car back: a dull thump that climbs
        this.tone(74 * jit, 0.24, v * 0.9, 'sine', 1.7);
        this.noise(0.14, 360, 0.9, v * 0.9, 'lowpass');
        this.tone(150 * jit, 0.12, v * 0.2, 'triangle', 1.5, 0.03);
        break;
      case 'glass': {
        // a pane goes, and the bits of it come down for a while after
        this.noise(0.16, 4600, 0.8, v * 0.9, 'highpass');
        const n = 5 + Math.floor(v * 6);
        for (let i = 0; i < n; i++)
          this.tone(
            2400 + Math.random() * 3800,
            0.05,
            v * 0.12,
            'sine',
            0.97,
            0.03 + Math.random() * 0.45,
          );
        break;
      }
      case 'soft':
        // straw, snow, a hedge: a whump and a rustle
        this.noise(0.22, 280, 0.6, v * 1.1, 'lowpass');
        this.noise(0.2, 1700, 0.7, v * 0.14, 'bandpass', 0.03);
        break;
    }
  }

  /** A short tune for a moment (see audio/jingles.ts), over the one that is playing. */
  jingle(name: JingleName, when = 0): void {
    const j: Jingle = JINGLES[name];
    const step = 15 / j.bpm;
    const vol = j.wave === 'square' ? 0.13 : j.wave === 'triangle' ? 0.26 : 0.16;
    for (const [pitch, at, len] of j.lead) {
      this.tone(hertz(pitch), len * step * 0.95, vol, j.wave, 1, when + at * step);
      // a second voice a hair sharp, so it is a section and not a telephone
      this.tone(hertz(pitch) * 1.006, len * step * 0.95, vol * 0.5, j.wave, 1, when + at * step);
    }
    for (const [pitch, at, len] of j.under ?? [])
      this.tone(hertz(pitch), len * step * 0.95, 0.2, 'triangle', 1, when + at * step);
    if (j.duck > 0) this.tunes?.duck(j.duck, this.now() + when, jingleSeconds(j));
  }

  /** The small sounds of the menus: a button, the way back, a tab, a slider's notch, the start. */
  ui(what: Ui): void {
    switch (what) {
      case 'tap':
        this.tone(740, 0.035, 0.07, 'square');
        this.tone(1110, 0.04, 0.05, 'square', 1, 0.03);
        break;
      case 'back':
        this.tone(590, 0.035, 0.07, 'square');
        this.tone(392, 0.05, 0.06, 'square', 1, 0.03);
        break;
      case 'tab':
        this.tone(880, 0.03, 0.06, 'triangle');
        this.noise(0.02, 2400, 2, 0.05);
        break;
      case 'tick':
        this.tone(1320, 0.012, 0.05, 'square');
        break;
      case 'go':
        // into a race: a rising rush and a hit
        this.noise(0.35, 500, 0.7, 0.2, 'bandpass', 0, 5);
        this.tone(196, 0.3, 0.1, 'sawtooth', 2);
        this.tone(392, 0.3, 0.1, 'square', 1, 0.3);
        this.tone(587, 0.3, 0.07, 'square', 1, 0.3);
        break;
    }
  }

  scrape(): void {
    this.noise(0.08, 3200, 3, 0.05);
  }

  boom(v = 1): void {
    this.heavy(0.55 * v, () => {
      // the crack, the body of it falling in pitch, the thump under it, and the long tail
      this.noise(0.09, 2200, 0.7, 1.1 * v, 'highpass');
      this.noise(0.7, 2600, 0.5, 1.4 * v, 'lowpass', 0, 0.1);
      this.noise(0.5, 700, 0.6, 0.9 * v, 'bandpass', 0.01, 0.4);
      this.tone(110, 0.55, 0.6 * v, 'sine', 0.35);
      this.tone(165, 0.3, 0.3 * v, 'triangle', 0.4, 0.01);
      this.noise(1.7, 480, 0.4, 0.6 * v, 'bandpass', 0.03, 0.5);
      // bits coming down after it
      for (let i = 0; i < 5; i++)
        this.noise(
          0.05,
          1400 + Math.random() * 2400,
          1.5,
          0.13 * v,
          'bandpass',
          0.22 + Math.random() * 0.7,
        );
    });
  }

  smash(): void {
    [880, 660, 440, 330].forEach((f, i) => this.tone(f, 0.08, 0.12, 'square', 0.7, i * 0.04));
    this.noise(0.2, 1800, 1.5, 0.25);
  }

  /**
   * Something picked up. Each `kind` of thing has a call of its own, made from its name, so an
   * item nobody has voiced is still told apart from the rest by ear; without one, the plain call.
   */
  pickup(kind = ''): void {
    const [root, shape, wave] = pickupCall(kind);
    shape.forEach((semi, i) =>
      this.tone(root * 2 ** (semi / 12), 0.09, wave === 'square' ? 0.12 : 0.16, wave, 1, i * 0.06),
    );
  }

  fire(): void {
    this.noise(0.35, 1200, 0.6, 0.3, 'highpass');
    this.tone(300, 0.3, 0.12, 'sawtooth', 0.3);
  }

  /**
   * One round from a gun: the bark of the barrel (a square falling fast through a low-pass), the
   * crack (noise that starts bright and shuts), and a short report after it. Rounds come eight a
   * second from several cars, so they stay dry: only a little of each reaches the room. `pitch`
   * sets one car's gun apart from another's.
   */
  gun(v = 1, pitch = 1): void {
    const ac = this.ac;
    const out = this.guns;
    if (!ac || !out || !this.noiseBuf) return;
    const t = this.now();
    // two rounds in the same instant are one sound, a little louder
    if (t - this.lastShot < 0.03) return;
    this.lastShot = t;
    const p = pitch * (0.96 + Math.random() * 0.08);
    const burst = (
      type: BiquadFilterType,
      from: number,
      to: number,
      q: number,
      dur: number,
      vol: number,
      when = 0,
    ) => {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(from * p, t + when);
      f.frequency.exponentialRampToValueAtTime(to * p, t + when + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol * v, t + when);
      g.gain.exponentialRampToValueAtTime(0.001, t + when + dur);
      src.connect(f).connect(g).connect(out);
      src.start(t + when, Math.random() * 0.8);
      src.stop(t + when + dur + 0.02);
    };
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(230 * p, t);
    o.frequency.exponentialRampToValueAtTime(62 * p, t + 0.07);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(420, t + 0.08);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.1);
    burst('lowpass', 5200, 900, 0.7, 0.06, 1.3);
    burst('bandpass', 1300, 650, 1.2, 0.08, 1.8);
    burst('lowpass', 1600, 400, 0.5, 0.2, 0.2, 0.03);
  }

  private rainNode: { g: GainNode; src: AudioBufferSourceNode } | null = null;

  /** Rain on the ground: a steady hiss, as loud as `level` (0 stops it). */
  rain(level: number): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf) return;
    if (level <= 0.01) {
      if (this.rainNode) {
        this.rainNode.src.stop();
        this.rainNode = null;
      }
      return;
    }
    if (!this.rainNode) {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2200;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      this.rainNode = { g, src };
    }
    this.rainNode.g.gain.setTargetAtTime(0.07 * level, this.now(), 0.3);
  }

  /** Thunder: the crack of the strike, then the roll after it. */
  thunder(v = 1): void {
    this.heavy(0, () => {
      this.noise(0.14, 3600, 0.9, 0.5 * v, 'highpass');
      this.noise(1.6, 140, 0.6, 0.9 * v, 'lowpass', 0.04);
      this.noise(1.1, 420, 0.5, 0.35 * v, 'bandpass', 0.3);
      this.tone(48, 1.2, 0.5 * v, 'sine', 0.6, 0.05);
    });
  }

  /** The ground shaking: a low rumble for `dur` seconds. */
  rumble(dur: number, v = 1): void {
    this.noise(dur, 70, 0.5, 0.9 * v, 'lowpass');
    this.tone(34, dur, 0.5 * v, 'sine', 0.8);
    this.noise(dur * 0.7, 500, 0.6, 0.15 * v, 'bandpass', 0.1);
  }

  /** A gust of wind rising and dying over `dur` seconds. */
  gust(dur: number, v = 1): void {
    this.noise(dur, 480, 0.5, 0.3 * v, 'bandpass');
    this.noise(dur * 0.8, 1300, 0.7, 0.12 * v, 'bandpass', dur * 0.15);
  }

  /** Something big coming down out of the sky: a falling whistle. */
  whistle(dur: number, v = 1): void {
    this.tone(1500, dur, 0.06 * v, 'sine', 0.25);
    this.noise(dur, 900, 0.8, 0.1 * v, 'bandpass');
  }

  /** A fuel drum taking off: a rising rush of fire. */
  whoosh(v = 1): void {
    this.noise(0.7, 700, 0.6, 0.45 * v, 'bandpass');
    this.tone(120, 0.6, 0.12 * v, 'sawtooth', 2.4);
  }

  /** A burning star landing: a small crack. */
  pop(v = 1): void {
    this.noise(0.12, 1400, 1, 0.22 * v);
    this.tone(90, 0.1, 0.15 * v, 'sine', 0.5);
  }

  /** A howl's shockwave: a deep thump, the air rushing out after it, and the howl falling away. */
  howl(v = 1): void {
    this.heavy(0, () => {
      this.noise(0.8, 150, 0.7, 0.9 * v, 'lowpass');
      this.tone(60, 0.7, 0.7 * v, 'sine', 0.4);
      this.noise(0.6, 700, 0.9, 0.35 * v, 'bandpass', 0.05);
      this.tone(330, 0.5, 0.1 * v, 'sawtooth', 0.3, 0.03);
    });
  }

  /** A shock: a buzzing crack; `big` for a whole pulse going out, a snap for one bolt. */
  zap(v = 1, big = false): void {
    this.noise(big ? 0.35 : 0.09, 4200, 1.2, (big ? 0.35 : 0.18) * v, 'highpass');
    this.tone(big ? 95 : 140, big ? 0.32 : 0.08, (big ? 0.14 : 0.07) * v, 'sawtooth', 0.6);
    if (big) this.tone(1900, 0.18, 0.05 * v, 'square', 0.3, 0.02);
  }

  /** A spray burst: a roar of burning fuel, or the hiss of a water cannon. */
  hiss(v = 1, lit = false): void {
    if (lit) {
      this.noise(0.9, 420, 0.5, 0.5 * v, 'lowpass');
      this.noise(0.8, 1600, 0.7, 0.18 * v);
    } else this.noise(0.9, 2800, 0.6, 0.3 * v, 'highpass');
  }

  /** A rail slug: a charged whine that cracks. */
  railCrack(v = 1): void {
    this.heavy(0, () => {
      this.tone(260, 0.12, 0.12 * v, 'sawtooth', 6);
      this.noise(0.35, 3400, 0.9, 0.5 * v, 'bandpass', 0.1);
      this.tone(70, 0.4, 0.4 * v, 'sine', 0.4, 0.1);
    });
  }

  /** One lightning strike: a dry, buzzing crack. */
  crackle(v = 1): void {
    this.noise(0.09, 4200, 1.2, 0.3 * v, 'bandpass');
    this.tone(95, 0.08, 0.08 * v, 'sawtooth', 1.4);
  }

  /** A sticky bomb's lamp: a tiny blip, higher the nearer it is to going off. */
  tick(hi: boolean, v = 1): void {
    this.tone(hi ? 1760 : 1320, 0.05, 0.1 * v, 'square');
  }

  drop(): void {
    this.tone(160, 0.12, 0.2, 'square', 0.6);
  }

  beep(hi: boolean): void {
    this.tone(hi ? 880 : 440, hi ? 0.5 : 0.18, 0.2, 'square');
  }

  repair(): void {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.14, 0.12, 'triangle', 1, i * 0.08));
  }

  nitro(): void {
    this.noise(0.5, 600, 0.5, 0.2, 'lowpass');
  }

  /** A car going into deep water: the slap of it, the gulp, and the spray coming down. */
  plop(v = 1): void {
    this.heavy(0, () => {
      this.noise(0.12, 420, 0.8, 0.9 * v, 'lowpass');
      this.tone(220, 0.22, 0.25 * v, 'sine', 0.35, 0.02);
      this.noise(0.6, 2200, 0.6, 0.35 * v, 'bandpass', 0.05);
      for (let i = 0; i < 5; i++)
        this.noise(0.04, 1400 + Math.random() * 1800, 2, 0.12 * v, 'bandpass', 0.25 + i * 0.09);
    });
  }

  /** A plate in the ground pressed down: a heavy clunk and a latch. */
  clank(v = 1): void {
    this.tone(150, 0.12, 0.25 * v, 'square', 0.5);
    this.noise(0.08, 900, 1.2, 0.3 * v, 'bandpass');
    this.tone(1250, 0.04, 0.08 * v, 'square', 1, 0.09);
  }

  /** Steel posts sinking into the ground: a motor's whine falling, and the grind of it. */
  grind(v = 1): void {
    this.tone(340, 0.7, 0.07 * v, 'sawtooth', 0.45, 0.1);
    this.noise(0.7, 500, 1.4, 0.12 * v, 'bandpass', 0.1);
    this.tone(70, 0.15, 0.2 * v, 'sine', 0.6, 0.8);
  }

  /** Springs letting go: a rising twang. */
  boing(v = 1): void {
    this.tone(150, 0.32, 0.16 * v, 'triangle', 3.2);
    this.tone(300, 0.2, 0.05 * v, 'square', 2.2);
  }

  /** A heavy car coming down on its wheels. */
  thud(v = 1): void {
    this.noise(0.22, 320, 0.8, 0.35 * v, 'lowpass');
    this.tone(70, 0.16, 0.18 * v, 'sine', 0.6);
  }

  /** A squeaky toy: a short rising squeal. */
  squeak(v = 1): void {
    this.tone(1250, 0.09, 0.07 * v, 'square', 1.5);
    this.tone(1900, 0.06, 0.03 * v, 'triangle', 1.3, 0.03);
  }

  /** A blade bolted on or falling off: a clang of steel. */
  clang(v = 1): void {
    this.tone(620, 0.25, 0.1 * v, 'square', 0.92);
    this.tone(930, 0.18, 0.06 * v, 'triangle', 0.9);
    this.noise(0.1, 2600, 1.2, 0.12 * v, 'highpass');
  }

  /** A boost tile's kick: a rush of air and a rising whine; the turbo's is longer and higher. */
  surge(turbo: boolean): void {
    this.noise(turbo ? 0.8 : 0.5, 900, 0.5, 0.3, 'bandpass');
    this.tone(turbo ? 260 : 190, turbo ? 0.6 : 0.4, 0.12, 'sawtooth', turbo ? 3.2 : 2.6);
    this.tone(turbo ? 520 : 380, 0.25, 0.05, 'square', 2);
  }

  /** Wings beating: a few quick puffs of air. */
  flap(v = 1): void {
    for (let i = 0; i < 4; i++) this.noise(0.06, 500, 0.7, 0.12 * v, 'lowpass', i * 0.07);
  }

  /** Something driven through long grass. */
  rustle(v = 1): void {
    this.noise(0.14, 3200, 0.6, 0.07 * v, 'highpass');
  }

  /** Something with an engine going over, not very high: a drone that comes and goes. */
  flyover(v = 1): void {
    this.tone(118, 2.6, 0.07 * v, 'sawtooth', 0.82);
    this.tone(177, 2.6, 0.04 * v, 'square', 0.82, 0.03);
    this.noise(2.4, 420, 0.8, 0.05 * v, 'lowpass');
  }

  /** An animal's cry. */
  cry(
    kind:
      | 'cluck'
      | 'baa'
      | 'moo'
      | 'caw'
      | 'squeak'
      | 'snort'
      | 'bellow'
      | 'click'
      | 'quack'
      | 'toot'
      | 'honk',
    v = 1,
  ): void {
    switch (kind) {
      case 'quack':
        // three flat quacks, each falling off
        for (let i = 0; i < 3; i++) {
          this.tone(480, 0.09, 0.1 * v, 'sawtooth', 0.7, i * 0.13);
          this.noise(0.07, 1100, 4, 0.06 * v, 'bandpass', i * 0.13);
        }
        break;
      case 'toot':
        // a steam whistle: two notes a fifth apart, long, with breath in it
        this.tone(660, 0.7, 0.13 * v, 'square', 1);
        this.tone(990, 0.7, 0.09 * v, 'square', 1, 0.02);
        this.noise(0.7, 2400, 1.2, 0.07 * v, 'bandpass');
        break;
      case 'honk':
        // a two-tone horn, twice
        for (let i = 0; i < 2; i++) {
          this.tone(392, 0.18, 0.13 * v, 'square', 1, i * 0.26);
          this.tone(494, 0.18, 0.1 * v, 'square', 1, i * 0.26);
        }
        break;
      case 'click':
        // claws snapping, and the scuttle of many legs
        for (let i = 0; i < 2; i++) this.noise(0.025, 3800, 4, 0.22 * v, 'bandpass', i * 0.11);
        for (let i = 0; i < 7; i++)
          this.noise(0.015, 2400, 3, 0.07 * v, 'bandpass', 0.25 + i * 0.04);
        break;
      case 'cluck':
        // three short clucks and a squawk
        for (let i = 0; i < 3; i++)
          this.tone(620 + i * 40, 0.05, 0.09 * v, 'square', 0.7, i * 0.08);
        this.tone(900, 0.22, 0.1 * v, 'sawtooth', 1.7, 0.26);
        break;
      case 'baa':
        // a wavering bleat
        for (let i = 0; i < 6; i++)
          this.tone(i % 2 ? 330 : 300, 0.09, 0.09 * v, 'sawtooth', 0.97, i * 0.075);
        break;
      case 'moo':
        this.tone(125, 0.9, 0.2 * v, 'sawtooth', 0.72);
        this.tone(250, 0.8, 0.07 * v, 'square', 0.72, 0.02);
        this.noise(0.6, 260, 2, 0.08 * v, 'bandpass');
        break;
      case 'caw':
        for (let i = 0; i < 2; i++) {
          this.tone(520, 0.16, 0.08 * v, 'sawtooth', 0.8, i * 0.2);
          this.noise(0.16, 1500, 3, 0.1 * v, 'bandpass', i * 0.2);
        }
        break;
      case 'squeak':
        this.squeak(v);
        break;
      case 'snort':
        // two hard blasts of breath through the nose
        for (let i = 0; i < 2; i++) {
          this.noise(0.16, 700, 1.4, 0.22 * v, 'bandpass', i * 0.2);
          this.tone(90, 0.16, 0.14 * v, 'sawtooth', 0.8, i * 0.2);
        }
        break;
      case 'bellow':
        // a long low roar that climbs
        this.tone(70, 1.1, 0.22 * v, 'sawtooth', 1.5);
        this.tone(140, 1, 0.1 * v, 'square', 1.45, 0.03);
        this.noise(0.9, 320, 1.6, 0.12 * v, 'bandpass');
        break;
    }
  }

  /** Hooves coming on fast. */
  stampede(v = 1): void {
    for (let i = 0; i < 9; i++) this.noise(0.05, 160, 1.2, 0.2 * v, 'lowpass', i * 0.075);
  }
}
