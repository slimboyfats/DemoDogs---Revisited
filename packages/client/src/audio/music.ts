/**
 * Plays a tune from audio/tracker.ts: every note is built from oscillators and noise as its time
 * comes near, so there is no sound file. `pump` is called often and schedules a little ahead.
 */
import { hz, type Compiled, type Note } from './tracker';

/** How far ahead of the clock notes are put down, in seconds. */
const AHEAD = 0.4;
const LEVEL = 0.5;

/** A soft clip: the more `drive`, the more it bites. */
export function clipCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const top = Math.tanh(drive);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * drive) / top;
  return curve;
}

/** One tune's own way out, so a tune can be faded away while the next one starts. */
interface Deck {
  out: GainNode;
  /** Into the guitar's amp. */
  amp: GainNode;
  /** Into the lead's echo. */
  echo: GainNode;
}

export class Music {
  private readonly bus: GainNode;
  private readonly tone: BiquadFilterNode;
  private deck: Deck | null = null;
  private song: Compiled | null = null;
  /** The time of the song's step 0 this time round, and the next note to put down. */
  private base = 0;
  private next = 0;
  private pan = 1;

  constructor(
    private readonly ac: BaseAudioContext,
    out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
  ) {
    this.tone = ac.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 20000;
    this.bus = ac.createGain();
    this.bus.gain.value = LEVEL;
    this.tone.connect(this.bus).connect(out);
  }

  get playing(): string | null {
    return this.song?.name ?? null;
  }

  /** Start a tune (or none) at `now`; the one playing fades out under it. */
  play(song: Compiled | null, now: number): void {
    if (song === this.song) return;
    const old = this.deck;
    if (old) {
      old.out.gain.setTargetAtTime(0, now, 0.08);
      if (!(this.ac instanceof OfflineAudioContext)) setTimeout(() => old.out.disconnect(), 1500);
    }
    this.song = song;
    this.deck = song ? this.makeDeck(song) : null;
    this.base = now + 0.06;
    this.next = 0;
  }

  /** Behind a pause menu the tune goes dull and quiet. */
  muffle(on: boolean, now: number): void {
    this.tone.frequency.setTargetAtTime(on ? 420 : 20000, now, 0.12);
    this.bus.gain.setTargetAtTime(on ? LEVEL * 0.6 : LEVEL, now, 0.12);
  }

  /** Something loud went off: the tune steps back for a moment. */
  duck(amount: number, now: number, hold = 0.18): void {
    const g = this.bus.gain;
    g.setTargetAtTime(LEVEL * (1 - Math.min(0.7, amount)), now, 0.012);
    g.setTargetAtTime(LEVEL, now + hold, 0.3);
  }

  /** Put down every note that starts before `now + AHEAD`. */
  pump(now: number): void {
    const s = this.song;
    const d = this.deck;
    if (!s || !d || s.notes.length === 0) return;
    const round = (s.steps - s.loopStep) * s.stepTime;
    const loopNote = Math.max(
      0,
      s.notes.findIndex((n) => n.step >= s.loopStep),
    );
    // fell far behind (the tab was away): pick the tune up from the top of its loop
    if (this.base + s.notes[this.next]!.step * s.stepTime < now - 1) {
      this.base = now - s.loopStep * s.stepTime;
      this.next = loopNote;
    }
    for (;;) {
      const n = s.notes[this.next]!;
      const t = this.base + n.step * s.stepTime;
      if (t > now + AHEAD) return;
      if (t >= now - 0.02) this.note(d, n, t, n.len * s.stepTime);
      if (++this.next >= s.notes.length) {
        this.base += round;
        this.next = loopNote;
      }
    }
  }

  private makeDeck(song: Compiled): Deck {
    const ac = this.ac;
    const out = ac.createGain();
    out.connect(this.tone);
    // the guitar: everything it plays goes through one amp, as a real one would
    const amp = ac.createGain();
    amp.gain.value = 2.2;
    const clip = ac.createWaveShaper();
    clip.curve = clipCurve(5);
    clip.oversample = '2x';
    const cab = ac.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 3800;
    cab.Q.value = 0.9;
    const body = ac.createBiquadFilter();
    body.type = 'highpass';
    body.frequency.value = 110;
    const ampOut = ac.createGain();
    ampOut.gain.value = 0.42;
    amp.connect(clip).connect(cab).connect(body).connect(ampOut).connect(out);
    // the lead: an echo three steps behind it
    const echo = ac.createGain();
    const delay = ac.createDelay(1);
    delay.delayTime.value = song.stepTime * 3;
    const back = ac.createGain();
    back.gain.value = 0.32;
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    echo.connect(out);
    echo.connect(delay);
    delay.connect(back).connect(delay);
    delay.connect(wet).connect(out);
    return { out, amp, echo };
  }

  private note(d: Deck, n: Note, t: number, dur: number): void {
    switch (n.voice) {
      case 'kick':
        this.osc(d.out, 'sine', 170, t, 0.13, 0.62, 0.27);
        this.osc(d.out, 'triangle', 340, t, 0.03, 0.2, 0.4);
        this.hiss(d.out, t, 0.025, 2600, 'highpass', 0.3);
        break;
      case 'snare':
        this.hiss(d.out, t, 0.18, 1900, 'bandpass', 0.85, 0.6);
        this.hiss(d.out, t, 0.1, 5200, 'highpass', 0.4);
        this.osc(d.out, 'triangle', 230, t, 0.07, 0.22, 0.6);
        break;
      case 'hat':
        if (n.hit === 'c') this.hiss(d.out, t, 1.1, 5200, 'highpass', 0.3);
        else this.hiss(d.out, t, n.hit === 'o' ? 0.2 : 0.045, 7600, 'highpass', 0.22);
        break;
      case 'bass': {
        const f = hz(n.midi);
        const len = Math.max(0.09, dur * 0.92);
        const lp = this.ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 3;
        lp.frequency.setValueAtTime(Math.min(3200, f * 20), t);
        lp.frequency.exponentialRampToValueAtTime(f * 4, t + len);
        lp.connect(d.out);
        this.osc(lp, 'sawtooth', f, t, len, 0.3);
        this.osc(lp, 'square', f * 2.006, t, len, 0.16);
        this.osc(d.out, 'sine', f, t, len, 0.08);
        break;
      }
      case 'gtr': {
        const muted = n.hit === 'x';
        const f = hz(n.midi);
        const len = muted ? 0.075 : Math.max(0.12, dur * 0.95);
        const v = muted ? 0.34 : 0.3;
        this.osc(d.amp, 'sawtooth', f, t, len, v);
        this.osc(d.amp, 'sawtooth', f * 1.4983 * 1.003, t, len, v * 0.8);
        this.osc(d.amp, 'sawtooth', f * 2 * 0.996, t, len, v * 0.6);
        break;
      }
      case 'arp': {
        const p = this.ac.createStereoPanner();
        p.pan.value = (this.pan = -this.pan) * 0.45;
        p.connect(d.out);
        this.osc(p, 'square', hz(n.midi), t, Math.max(0.1, dur * 0.9), 0.11);
        break;
      }
      case 'lead': {
        const f = hz(n.midi);
        const len = Math.max(0.1, dur * 0.96);
        const lp = this.ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5000;
        lp.connect(d.echo);
        const a = this.osc(lp, 'square', f, t, len, 0.2, 1, true);
        const b = this.osc(lp, 'sawtooth', f * 1.005, t, len, 0.14, 1, true);
        // a held note starts to waver
        if (dur > 0.22) {
          const lfo = this.ac.createOscillator();
          lfo.frequency.value = 5.6;
          const depth = this.ac.createGain();
          depth.gain.setValueAtTime(0, t + 0.12);
          depth.gain.linearRampToValueAtTime(f * 0.011, t + 0.3);
          lfo.connect(depth);
          depth.connect(a.frequency);
          depth.connect(b.frequency);
          lfo.start(t);
          lfo.stop(t + len + 0.1);
        }
        break;
      }
    }
  }

  /**
   * One oscillator note. `slide` is where its pitch has got to by the end (a share of `f`); a
   * `held` note keeps its level and lets go at the end, others die away from the start.
   */
  private osc(
    out: AudioNode,
    type: OscillatorType,
    f: number,
    t: number,
    dur: number,
    vol: number,
    slide = 1,
    held = false,
  ): OscillatorNode {
    const o = this.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur * 0.6);
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    if (held) {
      g.gain.setValueAtTime(vol, t + Math.max(0.005, dur - 0.04));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
    } else {
      g.gain.setTargetAtTime(vol * 0.55, t + 0.004, dur * 0.35);
      g.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.012);
    }
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.08);
    return o;
  }

  private hiss(
    out: AudioNode,
    t: number,
    dur: number,
    freq: number,
    type: BiquadFilterType,
    vol: number,
    q = 0.7,
  ): void {
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, (t * 0.37) % 0.6);
    src.stop(t + dur + 0.03);
  }
}
