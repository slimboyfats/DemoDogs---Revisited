/**
 * Short tunes for moments: the last lap, the flag, a win, a wreck, money changing hands, a cup.
 * Each is a few notes written out, played by `Sound.jingle` over the tune that is running.
 */

/** A note: its pitch (MIDI, 69 is the A above middle C), when it starts and how long it is, in sixteenths. */
export type Note = [pitch: number, at: number, len: number];

export interface Jingle {
  /** Beats a minute; a beat is four sixteenths. */
  bpm: number;
  /** The tune, and what is played under it (a triangle). */
  lead: Note[];
  under?: Note[];
  wave: OscillatorType;
  /** How far the tune running steps back for it, 0 to 1. */
  duck: number;
}

export const JINGLES = {
  /** Three quick calls and a high one: go, go, go. */
  'final-lap': {
    bpm: 168,
    wave: 'square',
    duck: 0.4,
    lead: [
      [79, 0, 1],
      [79, 2, 1],
      [79, 4, 1],
      [84, 6, 5],
    ],
    under: [
      [55, 0, 6],
      [60, 6, 5],
    ],
  },
  /** First over the line: a fanfare up the chord and a held top note. */
  win: {
    bpm: 150,
    wave: 'square',
    duck: 0.7,
    lead: [
      [72, 0, 2],
      [76, 2, 2],
      [79, 4, 2],
      [84, 6, 3],
      [79, 9, 1],
      [84, 10, 2],
      [88, 12, 8],
    ],
    under: [
      [48, 0, 6],
      [55, 6, 4],
      [48, 10, 2],
      [60, 12, 8],
    ],
  },
  /** On the podium: the same climb, stopping a step short. */
  podium: {
    bpm: 150,
    wave: 'square',
    duck: 0.5,
    lead: [
      [72, 0, 2],
      [76, 2, 2],
      [79, 4, 3],
      [76, 7, 1],
      [79, 8, 6],
    ],
    under: [
      [48, 0, 8],
      [55, 8, 6],
    ],
  },
  /** Over the line further back: home, without the flags. */
  finish: {
    bpm: 132,
    wave: 'triangle',
    duck: 0.3,
    lead: [
      [67, 0, 2],
      [64, 2, 2],
      [60, 4, 6],
    ],
  },
  /** Scrapped: down a step at a time, and out. */
  lost: {
    bpm: 112,
    wave: 'sawtooth',
    duck: 0.6,
    lead: [
      [64, 0, 3],
      [63, 3, 3],
      [62, 6, 3],
      [61, 9, 8],
    ],
    under: [[37, 9, 8]],
  },
  /** The last one moving in a derby. */
  'last-standing': {
    bpm: 144,
    wave: 'square',
    duck: 0.7,
    lead: [
      [69, 0, 1],
      [72, 1, 1],
      [76, 2, 2],
      [81, 4, 2],
      [76, 6, 1],
      [81, 7, 2],
      [84, 9, 8],
    ],
    under: [
      [45, 0, 4],
      [52, 4, 5],
      [57, 9, 8],
    ],
  },
  /** Prize money. */
  cash: {
    bpm: 200,
    wave: 'square',
    duck: 0,
    lead: [
      [83, 0, 1],
      [88, 1, 5],
    ],
  },
  /** Something bought: the till. */
  buy: {
    bpm: 200,
    wave: 'square',
    duck: 0,
    lead: [
      [76, 0, 1],
      [83, 1, 1],
      [88, 2, 1],
      [95, 3, 5],
    ],
  },
  /** Not enough money, or not for sale. */
  denied: {
    bpm: 160,
    wave: 'sawtooth',
    duck: 0,
    lead: [
      [46, 0, 2],
      [45, 2, 4],
    ],
  },
  /** Something new to race for: a run up and a sparkle. */
  unlock: {
    bpm: 176,
    wave: 'square',
    duck: 0.3,
    lead: [
      [72, 0, 1],
      [76, 1, 1],
      [79, 2, 1],
      [84, 3, 1],
      [88, 4, 1],
      [91, 5, 5],
    ],
  },
  /** A whole tournament won: the win, said twice and finished high. */
  cup: {
    bpm: 144,
    wave: 'square',
    duck: 0.8,
    lead: [
      [72, 0, 1],
      [72, 2, 1],
      [72, 3, 1],
      [76, 4, 2],
      [79, 6, 2],
      [77, 8, 1],
      [77, 10, 1],
      [77, 11, 1],
      [81, 12, 2],
      [84, 14, 2],
      [83, 16, 2],
      [84, 18, 2],
      [86, 20, 2],
      [91, 22, 4],
      [88, 26, 10],
    ],
    under: [
      [48, 0, 8],
      [53, 8, 8],
      [55, 16, 6],
      [55, 22, 4],
      [60, 26, 10],
    ],
  },
  /** A tournament lost: a shrug. */
  'cup-lost': {
    bpm: 108,
    wave: 'triangle',
    duck: 0.5,
    lead: [
      [67, 0, 2],
      [65, 2, 2],
      [63, 4, 2],
      [60, 6, 2],
      [58, 8, 8],
    ],
    under: [[46, 8, 8]],
  },
} as const satisfies Record<string, Jingle>;

export type JingleName = keyof typeof JINGLES;

/** A MIDI pitch in hertz. */
export const hertz = (pitch: number): number => 440 * 2 ** ((pitch - 69) / 12);

/** How long a jingle runs, in seconds. */
export function jingleSeconds(j: Jingle): number {
  const end = Math.max(...[...j.lead, ...(j.under ?? [])].map(([, at, len]) => at + len));
  return (end * 15) / j.bpm;
}
