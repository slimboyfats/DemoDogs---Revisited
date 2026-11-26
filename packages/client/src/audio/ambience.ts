/**
 * The sound of the place: wind, and whatever stands near the car that makes a noise of its own
 * (birds in a tree, a crowd in a grandstand, a flag, a windmill's sails, a pylon's hum, water
 * under a pier, something burning). Every part has a thing on screen it comes from: the game
 * says how near each is, and this only plays them.
 */

/** The kinds of standing noise a thing can make (a prop's `ambient` in its manifest). */
export const AMBIENT = [
  'birds',
  'crowd',
  'flap',
  'creak',
  'hum',
  'water',
  'fire',
  'surf',
  'fair',
  'bubble',
  'drip',
  'horn',
] as const;
export type Ambient = (typeof AMBIENT)[number];

/** How much of each is heard, 0 to 1. */
export type Air = Record<Ambient | 'wind', number>;

export const STILL: Air = {
  wind: 0,
  fire: 0,
  birds: 0,
  crowd: 0,
  flap: 0,
  creak: 0,
  hum: 0,
  water: 0,
  surf: 0,
  fair: 0,
  bubble: 0,
  drip: 0,
  horn: 0,
};

/** How loud a thing `d` away is, heard as far as `reach`: 1 beside it, falling off quickly. */
export function heard(d: number, reach: number): number {
  return d >= reach ? 0 : (1 - d / reach) ** 1.5;
}

/**
 * The fairground organ's waltz: a bar at a time, each [melody, bass] in MIDI pitches, the melody
 * on the first beat and the bass under it, the chord on the other two.
 */
export const WALTZ: readonly [number, number, number][] = [
  [76, 48, 64],
  [79, 48, 64],
  [84, 53, 69],
  [81, 53, 69],
  [79, 55, 67],
  [77, 55, 65],
  [76, 48, 64],
  [72, 48, 64],
  [74, 55, 65],
  [77, 55, 65],
  [83, 55, 67],
  [79, 55, 67],
  [81, 53, 69],
  [77, 53, 65],
  [76, 48, 64],
  [72, 48, 64],
];

/** A bird's call: tones as [hertz, seconds after the first, seconds long, slide]. */
export type Call = [number, number, number, number][];

/** One of a few birds, picked and pitched by `r` (two numbers 0 to 1). */
export function birdCall(r: number, r2: number): Call {
  const f = 2300 + r2 * 1700;
  const kind = Math.floor(r * 4) % 4;
  // a rising tweet, a trill, two falling notes, three quick pips
  if (kind === 0) return [[f, 0, 0.09, 1.35]];
  if (kind === 1)
    return Array.from({ length: 6 }, (_, i): Call[number] => [f * 1.2, i * 0.045, 0.03, 1.08]);
  if (kind === 2)
    return [
      [f * 1.25, 0, 0.14, 0.96],
      [f, 0.2, 0.2, 0.94],
    ];
  return [
    [f, 0, 0.05, 1.15],
    [f * 1.12, 0.09, 0.05, 1.15],
    [f * 1.26, 0.18, 0.08, 1.2],
  ];
}

interface Kit {
  tone: (
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
    slide: number,
    when: number,
  ) => void;
  noise: (
    dur: number,
    freq: number,
    q: number,
    vol: number,
    type: BiquadFilterType,
    when: number,
  ) => void;
}

interface Bed {
  gain: GainNode;
  /** The level at full. */
  full: number;
}

export class Ambience {
  private readonly beds = new Map<keyof Air, Bed>();
  private readonly sources: AudioScheduledSourceNode[] = [];
  /** Seconds until each of the sounds that come and go is next heard. */
  private readonly due: Partial<Record<keyof Air, number>> = {};
  private air: Air = STILL;

  constructor(
    private readonly ac: BaseAudioContext,
    dest: AudioNode,
    noiseBuf: AudioBuffer,
    private readonly kit: Kit,
    private readonly random: () => number = Math.random,
  ) {
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    this.sources.push(noise);
    /** A band of the noise that swells and sinks by itself, `sway` times a second. */
    const band = (
      name: keyof Air,
      type: BiquadFilterType,
      freq: number,
      q: number,
      full: number,
      sway = 0,
      depth = 0,
    ): void => {
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const breathe = ac.createGain();
      breathe.gain.value = 1;
      if (sway > 0) {
        const lfo = ac.createOscillator();
        lfo.frequency.value = sway;
        const d = ac.createGain();
        d.gain.value = depth;
        lfo.connect(d).connect(breathe.gain);
        this.sources.push(lfo);
      }
      let bed = this.beds.get(name);
      if (!bed) {
        const gain = ac.createGain();
        gain.gain.value = 0;
        gain.connect(dest);
        this.beds.set(name, (bed = { gain, full }));
      }
      noise.connect(f).connect(breathe).connect(bed.gain);
    };
    // wind: a low moan and the hiss over it; a crowd: a murmur of many voices; water lapping;
    // and the low roar of a fire
    band('wind', 'bandpass', 420, 0.6, 0.22, 0.13, 0.45);
    band('wind', 'bandpass', 1500, 0.8, 0.22, 0.31, 0.5);
    band('crowd', 'bandpass', 650, 0.9, 0.2, 0.21, 0.3);
    band('crowd', 'bandpass', 1500, 1.2, 0.2, 0.37, 0.4);
    band('water', 'lowpass', 520, 0.7, 0.2, 0.45, 0.6);
    band('fire', 'lowpass', 300, 0.5, 0.3, 2.3, 0.3);
    // the sea: a slow wash in and out
    band('surf', 'lowpass', 700, 0.5, 0.3, 0.11, 0.85);
    band('surf', 'bandpass', 2400, 0.6, 0.3, 0.11, 0.9);
    // a hum: mains at two pitches, kept dull
    const hum = ac.createGain();
    hum.gain.value = 0;
    const dull = ac.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 420;
    dull.connect(hum).connect(dest);
    for (const [f, v] of [
      [100, 0.5],
      [200, 0.25],
      [301, 0.12],
    ] as const) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = v;
      o.connect(g).connect(dull);
      this.sources.push(o);
    }
    this.beds.set('hum', { gain: hum, full: 0.07 });
    for (const s of this.sources) s.start();
  }

  /** What is heard from now on, at time `t`. */
  set(air: Air, t: number): void {
    this.air = air;
    for (const [name, bed] of this.beds)
      bed.gain.gain.setTargetAtTime(bed.full * air[name], t, 0.4);
  }

  /** `dt` seconds have gone by: the sounds that come and go take their turns. */
  tick(dt: number): void {
    const A = this.air;
    const K = this.kit;
    const R = this.random;
    /** `name` is heard every `gap` seconds or so (sooner the more of it there is). */
    const turn = (name: keyof Air, gap: number, play: (v: number) => void): void => {
      const v = A[name];
      const left = (this.due[name] ?? gap * R()) - dt;
      if (v <= 0.03) {
        this.due[name] = Math.min(left, gap);
        return;
      }
      if (left > 0) {
        this.due[name] = left;
        return;
      }
      this.due[name] = (gap * (0.5 + R())) / (0.4 + 0.6 * v);
      play(v);
    };
    turn('birds', 1.5, (v) => {
      for (const [f, at, dur, slide] of birdCall(R(), R()))
        K.tone(f, dur, 0.035 * v, 'sine', slide, at);
    });
    turn('flap', 0.5, (v) => {
      // cloth cracking in the wind: two or three soft slaps
      const n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++)
        K.noise(0.07, 380 + R() * 200, 0.8, 0.16 * v, 'lowpass', i * 0.09);
    });
    turn('creak', 1.1, (v) => {
      // a sail going by, and the shaft groaning under it
      K.noise(0.5, 260, 0.9, 0.2 * v, 'bandpass', 0);
      K.tone(82 + R() * 14, 0.35, 0.05 * v, 'sawtooth', 0.86, 0.1);
    });
    turn('crowd', 3.2, (v) => {
      // a cheer goes up, with a horn in it now and then
      K.noise(1.1, 1100, 0.7, 0.16 * v, 'bandpass', 0);
      K.noise(0.9, 2100, 0.9, 0.07 * v, 'bandpass', 0.1);
      if (R() < 0.35) {
        K.tone(233, 0.45, 0.04 * v, 'sawtooth', 1, 0.2);
        K.tone(277, 0.45, 0.03 * v, 'sawtooth', 1, 0.2);
      }
    });
    turn('fire', 0.12, (v) => K.noise(0.03, 1800 + R() * 3000, 2, 0.14 * v, 'bandpass', 0));
    turn('water', 1.3, (v) => K.noise(0.3, 900 + R() * 500, 1.5, 0.07 * v, 'bandpass', 0));
    turn('surf', 4.5, (v) => {
      // a wave breaking, now and then, over the wash
      K.noise(1.4, 1100, 0.5, 0.18 * v, 'bandpass', 0);
      K.noise(0.9, 300, 0.6, 0.12 * v, 'lowpass', 0.15);
    });
    turn('bubble', 0.35, (v) => {
      // a blister of something hot bursting: a low blip that climbs
      const f = 90 + R() * 140;
      K.tone(f, 0.09, 0.12 * v, 'sine', 1.9, 0);
      if (R() < 0.3) K.noise(0.12, 600, 1, 0.05 * v, 'bandpass', 0.06);
    });
    turn('drip', 0.9, (v) => {
      // a drop falling in a cave, and the crystal ringing back at it now and then
      K.tone(900 + R() * 1400, 0.07, 0.06 * v, 'sine', 1.7, 0);
      if (R() < 0.35)
        for (let i = 0; i < 3; i++)
          K.tone(2600 + R() * 2200, 0.5, 0.012 * v, 'sine', 1, 0.05 + i * 0.07);
    });
    turn('horn', 8, (v) => {
      // a lighthouse's horn: two low notes leaning on each other
      K.tone(98, 1.7, 0.09 * v, 'sawtooth', 0.97, 0);
      K.tone(123, 1.7, 0.06 * v, 'sawtooth', 0.97, 0);
      K.noise(1.6, 220, 1.2, 0.05 * v, 'bandpass', 0);
    });
    this.organ(dt);
  }

  /** Where the fairground organ is in its waltz, in bars, and seconds left of this one. */
  private bar = 0;
  private barLeft = 0;

  /** The organ of a ride nearby: one bar of its waltz at a time, at 3 bars in 2.6 seconds. */
  private organ(dt: number): void {
    const v = this.air.fair;
    this.barLeft -= dt;
    if (this.barLeft > 0) return;
    const beat = 0.29;
    this.barLeft = beat * 3;
    if (v <= 0.03) return;
    const [tune, bass, chord] = WALTZ[this.bar++ % WALTZ.length]!;
    const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
    const K = this.kit;
    // the pipes: a reedy square with a flute an octave up, the bass on one, the chord on two, three
    K.tone(hz(tune), beat * 2.6, 0.05 * v, 'square', 1, 0);
    K.tone(hz(tune + 12), beat * 2.6, 0.025 * v, 'triangle', 1, 0);
    K.tone(hz(bass), beat * 0.9, 0.09 * v, 'triangle', 1, 0);
    for (const b of [1, 2]) {
      K.tone(hz(chord), beat * 0.6, 0.03 * v, 'square', 1, b * beat);
      K.tone(hz(chord + 4), beat * 0.6, 0.025 * v, 'square', 1, b * beat);
    }
  }

  stop(t: number): void {
    for (const bed of this.beds.values()) bed.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const s of this.sources) s.stop(t + 0.3);
  }
}
