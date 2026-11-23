/**
 * A car's engine and its tyres, built from oscillators and noise. The engine has gears: the revs
 * climb through each one and drop back on the change, which is most of what makes it a car.
 */
import { clipCurve } from './music';

/** The share of top speed each gear runs out at. */
export const GEARS = [0.22, 0.4, 0.58, 0.78, 1.5] as const;
/** How far below a gear's start the speed must fall before it changes down. */
const SLACK = 0.05;

/** The gear to be in at `frac` of top speed, coming from `gear`. */
export function gearFor(frac: number, gear: number): number {
  let g = Math.max(0, Math.min(GEARS.length - 1, gear));
  while (g < GEARS.length - 1 && frac > GEARS[g]!) g++;
  while (g > 0 && frac < GEARS[g - 1]! - SLACK) g--;
  return g;
}

/** The revs in `gear` at `frac` of top speed: 0 ticking over, 1 flat out. */
export function revs(frac: number, gear: number): number {
  const lo = gear > 0 ? GEARS[gear - 1]! - SLACK : 0;
  const hi = Math.min(1.05, GEARS[gear]!);
  const k = Math.max(0, Math.min(1.15, (frac - lo) / (hi - lo)));
  return gear > 0 ? 0.4 + 0.6 * k : 0.12 + 0.88 * k;
}

export class EngineVoice {
  private readonly oscs: OscillatorNode[] = [];
  private readonly ratios: number[] = [];
  private readonly lump: OscillatorNode;
  private readonly lumpDepth: GainNode;
  private readonly drive: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly breath: GainNode;
  private readonly breathTone: BiquadFilterNode;
  private readonly out: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private gear = 0;

  /** `pitch` sets one engine apart from another (1 is the player's). */
  constructor(
    private readonly ac: BaseAudioContext,
    dest: AudioNode,
    noiseBuf: AudioBuffer,
    private readonly pitch = 1,
  ) {
    this.drive = ac.createGain();
    this.drive.gain.value = 1;
    const clip = ac.createWaveShaper();
    clip.curve = clipCurve(3);
    this.lp = ac.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 500;
    this.lp.Q.value = 2.5;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    // the firing strokes: the level beats at half the note, which is the lumpiness of an idle
    const beat = ac.createGain();
    beat.gain.value = 1;
    this.lump = ac.createOscillator();
    this.lump.type = 'sine';
    this.lumpDepth = ac.createGain();
    this.lumpDepth.gain.value = 0.3;
    this.lump.connect(this.lumpDepth).connect(beat.gain);
    this.drive.connect(clip).connect(this.lp).connect(beat).connect(this.out).connect(dest);
    // three saws a hair apart, a square an octave down, and a rasp an octave up
    const voices: [OscillatorType, number, number][] = [
      ['sawtooth', 1, 0.3],
      ['sawtooth', 1.011, 0.24],
      ['sawtooth', 0.991, 0.24],
      ['square', 0.5, 0.14],
      ['sawtooth', 2.006, 0.16],
    ];
    for (const [type, ratio, vol] of voices) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = 40 * ratio;
      const g = ac.createGain();
      g.gain.value = vol;
      o.connect(g).connect(this.drive);
      this.oscs.push(o);
      this.ratios.push(ratio);
      this.sources.push(o);
    }
    // the breath of the exhaust: noise that opens with the throttle
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    this.breathTone = ac.createBiquadFilter();
    this.breathTone.type = 'bandpass';
    this.breathTone.frequency.value = 300;
    this.breathTone.Q.value = 0.8;
    this.breath = ac.createGain();
    this.breath.gain.value = 0;
    src.connect(this.breathTone).connect(this.breath).connect(this.drive);
    this.sources.push(src, this.lump);
    for (const s of this.sources) s.start();
  }

  /** `frac` of top speed, the throttle (0 to 1), and how loud (0 is silent). */
  set(frac: number, throttle: number, boost: boolean, vol: number, t: number): void {
    const was = this.gear;
    this.gear = gearFor(frac, was);
    const r = revs(frac, this.gear) * (boost ? 1.12 : 1);
    const f = (52 + r * 130) * (1 + this.gear * 0.025) * this.pitch;
    // a change of gear is quick; inside a gear the revs follow the car
    const lag = this.gear !== was ? 0.035 : 0.07;
    this.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * this.ratios[i]!, t, lag));
    this.lump.frequency.setTargetAtTime(f / 2, t, lag);
    this.lumpDepth.gain.setTargetAtTime(0.42 - r * 0.3, t, 0.1);
    this.drive.gain.setTargetAtTime(0.8 + throttle * 1.8 + (boost ? 0.8 : 0), t, 0.06);
    this.lp.frequency.setTargetAtTime(
      600 + r * 1700 + throttle * 1000 + (boost ? 1200 : 0),
      t,
      0.07,
    );
    this.breathTone.frequency.setTargetAtTime(f * 4, t, 0.1);
    this.breath.gain.setTargetAtTime(0.05 + throttle * 0.22, t, 0.08);
    const level = vol * (0.5 + throttle * 0.3 + r * 0.2);
    if (this.gear !== was && vol > 0) {
      // the drive lets go for a moment while the gear goes in
      this.out.gain.setTargetAtTime(level * 0.35, t, 0.012);
      this.out.gain.setTargetAtTime(level, t + 0.07, 0.04);
    } else this.out.gain.setTargetAtTime(level, t, 0.09);
  }

  stop(t: number): void {
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.05);
    for (const s of this.sources) s.stop(t + 0.4);
  }
}

/** Tyres letting go: a squeal on a hard road, a wash of grit on a loose one. */
export class SkidVoice {
  private readonly a: BiquadFilterNode;
  private readonly b: BiquadFilterNode;
  private readonly squeal: GainNode;
  private readonly grit: GainNode;
  private readonly src: AudioBufferSourceNode;

  constructor(
    private readonly ac: BaseAudioContext,
    dest: AudioNode,
    noiseBuf: AudioBuffer,
  ) {
    this.src = ac.createBufferSource();
    this.src.buffer = noiseBuf;
    this.src.loop = true;
    this.a = ac.createBiquadFilter();
    this.b = ac.createBiquadFilter();
    for (const f of [this.a, this.b]) {
      f.type = 'bandpass';
      f.Q.value = 22;
    }
    this.squeal = ac.createGain();
    this.squeal.gain.value = 0;
    this.src.connect(this.a).connect(this.squeal);
    this.src.connect(this.b).connect(this.squeal);
    this.squeal.connect(dest);
    const wash = ac.createBiquadFilter();
    wash.type = 'bandpass';
    wash.frequency.value = 900;
    wash.Q.value = 0.5;
    this.grit = ac.createGain();
    this.grit.gain.value = 0;
    this.src.connect(wash).connect(this.grit).connect(dest);
    this.src.start();
  }

  /** `amount` 0 to 1 of sliding, on a loose surface or a hard one. */
  set(amount: number, loose: boolean, t: number): void {
    const f = 950 + amount * 520;
    this.a.frequency.setTargetAtTime(f, t, 0.06);
    this.b.frequency.setTargetAtTime(f * 1.49, t, 0.06);
    this.squeal.gain.setTargetAtTime(loose ? 0 : amount * 0.85, t, amount > 0 ? 0.04 : 0.09);
    this.grit.gain.setTargetAtTime(loose ? amount * 0.3 : amount * 0.05, t, 0.07);
  }

  stop(t: number): void {
    this.squeal.gain.setTargetAtTime(0, t, 0.03);
    this.grit.gain.setTargetAtTime(0, t, 0.03);
    this.src.stop(t + 0.3);
  }
}
