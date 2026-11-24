/**
 * Music as text, the way a tracker holds it: a song is parts, a part is a chord a bar and one line
 * of sixteenth steps per voice. Nothing here makes a sound: `compile` turns a song into notes with
 * a step to start on, and audio/music.ts plays them.
 *
 * Every line is read a step at a time (spaces and `|` are only for the eye), `.` is a rest and `-`
 * holds the note before it. A line shorter than its part is played round again.
 *
 * - `bass`, `arp`: degrees of the bar's chord, `1` to `8` (`3` is the chord's own third, `7` the
 *   flat seventh), `'` an octave up and `,` an octave down. They follow the chords.
 * - `gtr`: hits of the bar's power chord; `x` a short muted one, any other letter a full one.
 * - `lead`: the notes themselves, `e5`, `f#5`, `bb4`.
 * - `kick`, `snare`: `x` hits. `hat`: `x` closed, `o` open, `c` a crash.
 */

export const STEPS = 16;

export type Voice = 'bass' | 'gtr' | 'arp' | 'lead' | 'kick' | 'snare' | 'hat';
export const VOICES: readonly Voice[] = ['bass', 'gtr', 'arp', 'lead', 'kick', 'snare', 'hat'];

export type Part = { /** One chord a bar: `Em`, `C`, `F#m`, `Bb`. */ chords: string[] } & Partial<
  Record<Voice, string>
>;

export interface Song {
  name: string;
  bpm: number;
  /** The lowest note a bass root may be (MIDI); chords sit in the octave above it. */
  low: number;
  parts: Record<string, Part>;
  order: string[];
  /** Where in `order` it goes back to when it ends (the intro is played once). */
  loopFrom: number;
}

export interface Note {
  step: number;
  /** How long it is held, in steps. */
  len: number;
  voice: Voice;
  /** The pitch (MIDI); for `gtr` the root of the chord, for drums 0. */
  midi: number;
  /** Which kind of hit: the letter it was written with (`x`, `X`, `o`, `c`), else empty. */
  hit: string;
}

export interface Compiled {
  name: string;
  /** Seconds a step. */
  stepTime: number;
  steps: number;
  /** The step it goes back to when it ends. */
  loopStep: number;
  /** In order of `step`. */
  notes: Note[];
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE = [0, 2, 0, 5, 7, 0, 10, 12];

function pitchClass(name: string): number {
  const base = PITCH[name[0]!.toUpperCase()];
  if (base === undefined) throw new Error(`no such note ${name}`);
  return (base + (name[1] === '#' ? 1 : name[1] === 'b' ? 11 : 0)) % 12;
}

/** A chord's root (MIDI, the lowest at or above `low`) and whether it is minor. */
export function chord(name: string, low: number): { root: number; minor: boolean } {
  const m = /^([A-G][#b]?)(m?)$/.exec(name);
  if (!m) throw new Error(`no such chord ${name}`);
  return { root: low + ((pitchClass(m[1]!) - (low % 12) + 12) % 12), minor: m[2] === 'm' };
}

/** `e5` as MIDI (a4 is 69). */
export function midiOf(note: string): number {
  const m = /^([a-g][#b]?)(\d)$/.exec(note);
  if (!m) throw new Error(`no such note ${note}`);
  return pitchClass(m[1]!) + 12 * (Number(m[2]) + 1);
}

export function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const TOKENS: Record<Voice, RegExp> = {
  bass: /[1-8][',]*|[-.]/g,
  arp: /[1-8][',]*|[-.]/g,
  lead: /[a-g][#b]?\d|[-.]/g,
  gtr: /[a-zA-Z]|[-.]/g,
  kick: /[a-zA-Z]|[-.]/g,
  snare: /[a-zA-Z]|[-.]/g,
  hat: /[a-zA-Z]|[-.]/g,
};

/** The steps of one line, and an error if it is not whole bars or has something unreadable. */
export function tokens(voice: Voice, line: string): string[] {
  const bare = line.replace(/[\s|]/g, '');
  const out = bare.match(TOKENS[voice]) ?? [];
  if (out.join('') !== bare) throw new Error(`${voice}: cannot read "${line}"`);
  if (out.length === 0 || out.length % STEPS) {
    throw new Error(`${voice}: ${out.length} steps is not whole bars in "${line}"`);
  }
  return out;
}

function degree(token: string, root: number, minor: boolean): number {
  const d = Number(token[0]);
  let semi = d === 3 ? (minor ? 3 : 4) : d === 6 ? (minor ? 8 : 9) : DEGREE[d - 1]!;
  for (const c of token.slice(1)) semi += c === "'" ? 12 : -12;
  return root + semi;
}

export function compile(song: Song): Compiled {
  const notes: Note[] = [];
  let at = 0;
  let loopStep = 0;
  song.order.forEach((name, n) => {
    const part = song.parts[name];
    if (!part) throw new Error(`${song.name}: no part ${name}`);
    if (n === song.loopFrom) loopStep = at;
    const total = part.chords.length * STEPS;
    const chords = part.chords.map((c) => chord(c, song.low));
    for (const voice of VOICES) {
      const line = part[voice];
      if (!line) continue;
      const toks = tokens(voice, line);
      if (toks.length > total) throw new Error(`${song.name}/${name}: ${voice} is too long`);
      if (total % toks.length) throw new Error(`${song.name}/${name}: ${voice} does not fit`);
      let held: Note | null = null;
      for (let i = 0; i < total; i++) {
        const t = toks[i % toks.length]!;
        if (t === '-') {
          if (held) held.len++;
          continue;
        }
        held = null;
        if (t === '.') continue;
        const c = chords[Math.floor(i / STEPS)]!;
        let midi = 0;
        let hit = '';
        if (voice === 'bass') midi = degree(t, c.root, c.minor);
        else if (voice === 'arp') midi = degree(t, c.root + 24, c.minor);
        else if (voice === 'lead') midi = midiOf(t);
        else {
          hit = t;
          if (voice === 'gtr') midi = c.root + 12;
        }
        held = { step: at + i, len: 1, voice, midi, hit };
        notes.push(held);
      }
    }
    at += total;
  });
  if (song.loopFrom < 0 || song.loopFrom >= song.order.length) {
    throw new Error(`${song.name}: nowhere to loop from`);
  }
  notes.sort((a, b) => a.step - b.step);
  return { name: song.name, stepTime: 60 / song.bpm / 4, steps: at, loopStep, notes };
}
