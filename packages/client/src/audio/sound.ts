/** Every sound is synthesised with Web Audio, so the game ships no sound files. */

interface Engine {
  o1: OscillatorNode;
  o2: OscillatorNode;
  f: BiquadFilterNode;
  g: GainNode;
}

const MUTE_KEY = 'dd-muted';
const LEVEL = 0.55;

export class Sound {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private engine: Engine | null = null;
  private muted_ = false;

  constructor() {
    try {
      this.muted_ = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage blocked */
    }
  }

  get muted(): boolean {
    return this.muted_;
  }

  /** Call from a user gesture: browsers only start audio after one. */
  init(): void {
    if (this.ac) {
      if (this.ac.state === 'suspended') void this.ac.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    const ac = new AudioContext();
    this.ac = ac;
    this.master = ac.createGain();
    this.master.gain.value = this.muted_ ? 0 : LEVEL;
    this.master.connect(ac.destination);
    this.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  toggle(): boolean {
    this.muted_ = !this.muted_;
    try {
      localStorage.setItem(MUTE_KEY, this.muted_ ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = this.muted_ ? 0 : LEVEL;
    return this.muted_;
  }

  private noise(
    dur: number,
    freq: number,
    q: number,
    vol: number,
    type: BiquadFilterType = 'bandpass',
    when = 0,
  ): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf) return;
    const t = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6 + Math.random() * 0.6;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
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
    if (!ac || !this.master) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** The engine: two detuned oscillators through a low-pass; pitch follows speed. */
  engineStart(): void {
    const ac = this.ac;
    if (!ac || !this.master || this.engine) return;
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    o1.type = 'sawtooth';
    o2.type = 'square';
    f.type = 'lowpass';
    f.frequency.value = 600;
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.master);
    o1.start();
    o2.start();
    this.engine = { o1, o2, f, g };
  }

  engineSet(speed: number, throttle: number, boost: boolean): void {
    const e = this.engine;
    if (!e || !this.ac) return;
    const t = this.ac.currentTime;
    const rpm = 38 + speed * 0.62 + throttle * 14 + (boost ? 18 : 0);
    e.o1.frequency.setTargetAtTime(rpm, t, 0.05);
    e.o2.frequency.setTargetAtTime(rpm * 0.502, t, 0.05);
    e.f.frequency.setTargetAtTime(300 + speed * 6 + (boost ? 900 : 0), t, 0.08);
    e.g.gain.setTargetAtTime(0.05 + throttle * 0.05, t, 0.1);
  }

  engineStop(): void {
    const e = this.engine;
    if (!e || !this.ac) return;
    e.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.05);
    e.o1.stop(this.ac.currentTime + 0.3);
    e.o2.stop(this.ac.currentTime + 0.3);
    this.engine = null;
  }

  crash(power: number): void {
    const v = Math.min(0.9, 0.12 + power * 0.008);
    this.noise(0.25 + power * 0.003, 900, 0.8, v);
    this.noise(0.12, 2600, 2, v * 0.6);
    this.tone(70, 0.18, v * 0.6, 'sine', 0.5);
  }

  scrape(): void {
    this.noise(0.08, 3200, 3, 0.05);
  }

  boom(v = 1): void {
    this.noise(0.9, 180, 0.7, 0.9 * v, 'lowpass');
    this.noise(0.4, 900, 0.7, 0.5 * v);
    this.tone(55, 0.6, 0.6 * v, 'sine', 0.4);
  }

  smash(): void {
    [880, 660, 440, 330].forEach((f, i) => this.tone(f, 0.08, 0.12, 'square', 0.7, i * 0.04));
    this.noise(0.2, 1800, 1.5, 0.25);
  }

  pickup(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.09, 0.12, 'square', 1, i * 0.06));
  }

  fire(): void {
    this.noise(0.35, 1200, 0.6, 0.3, 'highpass');
    this.tone(300, 0.3, 0.12, 'sawtooth', 0.3);
  }

  /** One round from a gun: a short crack. */
  gun(v = 1): void {
    this.noise(0.05, 1900, 0.8, 0.16 * v, 'bandpass');
    this.tone(210, 0.04, 0.05 * v, 'square', 0.5);
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
}
