/**
 * The game's own tunes, written for audio/tracker.ts. One for the menus, one for each kind of
 * country a race is run in, and one for the derbies.
 */
import { compile, type Compiled, type Song } from './tracker';

const BACKBEAT = '....x.......x...';
const ROLL = '....x...x.x.xxxx';
const HAT8 = 'x.x.x.x.x.x.x.x.';
const CRASH8 = 'c.x.x.x.x.x.x.x.';
const REST = '................';

/** Three bars of `a` and one of `b`. */
const turn = (a: string, b: string): string => `${a}|${a}|${a}|${b}`;

/** Grass and woods: a hard, bright chase in E minor. */
const green: Song = {
  name: 'green',
  bpm: 148,
  low: 40,
  loopFrom: 1,
  order: ['intro', 'a', 'a', 'b', 'c', 'c2', 'a', 'b', 'c', 'c2'],
  parts: {
    intro: {
      chords: ['Em', 'Em', 'Em', 'Em'],
      bass: '1.11.11.1.11.187',
      gtr: `${REST}|${REST}|x.xx.xx.x.xx.X-.|x.xx.xx.x.xx.X-.`,
      kick: 'x...x...x...x...',
      snare: turn(REST, ROLL),
      hat: HAT8,
    },
    a: {
      chords: ['Em', 'Em', 'C', 'D'],
      bass: '1.11.11.1.11.187',
      gtr: 'x.xx.xx.x.xx.X-.',
      kick: 'x.....x.x.....x.',
      snare: turn(BACKBEAT, '....x.......x.xx'),
      hat: turn(CRASH8, HAT8),
      lead: `e5 - - b4 - - e5 - g5 - - e5 - - d5 - | e5 - - - - - . . b4 - d5 - e5 - g5 - |
             g5 - - e5 - - c5 - e5 - - g5 - - a5 - | f#5 - - - a5 - - - d5 - - - f#5 - e5 -`,
    },
    b: {
      chords: ['Em', 'G', 'D', 'C'],
      bass: '1.1.8.1.1.1.8.5.',
      gtr: 'X---..x.X---..xx',
      arp: "1583'851583'851583'",
      kick: 'x...x...x...x...',
      snare: BACKBEAT,
      hat: 'c.x.x.o.x.x.x.o.|x.x.x.o.x.x.x.o.',
      lead: `b5 - - - - - a5 - g5 - - - e5 - - - | d5 - - - g5 - - - b5 - a5 - g5 - d5 - |
             a5 - - - - - f#5 - d5 - - - a4 - - - | c5 - e5 - g5 - e5 - c5 - e5 - g5 - c6 -`,
    },
    c: {
      chords: ['C', 'D', 'Em', 'Em'],
      bass: '1111111181111155',
      gtr: 'x.xx.xx.x.xx.X-.',
      kick: 'x.x...x.x.x...x.',
      snare: BACKBEAT,
      hat: turn('cxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'),
      lead: `e5 - - g5 - - e5 - c5 - - - e5 - g5 - | f#5 - - a5 - - f#5 - d5 - - - f#5 - a5 - |
             b5 - - - - - g5 - e5 - - - g5 - b5 - | e6 - - - - - - - . . b5 - g5 - e5 -`,
    },
    c2: {
      chords: ['C', 'D', 'B', 'B'],
      bass: '1111111181111155',
      gtr: 'x.xx.xx.x.xx.X-.',
      kick: 'x.x...x.x.x...x.',
      snare: turn(BACKBEAT, ROLL),
      hat: 'xxxxxxxxxxxxxxxx',
      lead: `e5 - - g5 - - e5 - c5 - - - e5 - g5 - | f#5 - - a5 - - f#5 - d5 - - - f#5 - a5 - |
             f#5 - - - d#5 - - - b4 - - - d#5 - f#5 - | b5 - - - - - - - . . . . . . . .`,
    },
  },
};

/** Dirt, sand and gravel: a gallop in D minor with a dusty flat second. */
const dust: Song = {
  name: 'dust',
  bpm: 138,
  low: 38,
  loopFrom: 1,
  order: ['intro', 'a', 'a', 'b', 'c', 'c', 'a', 'b', 'c', 'c'],
  parts: {
    intro: {
      chords: ['Dm', 'Dm', 'Dm', 'Dm'],
      bass: '1.111.111.115.7.',
      kick: 'x.......x.......',
      hat: 'x.xxx.xxx.xxx.xx',
      snare: turn(REST, ROLL),
    },
    a: {
      chords: ['Dm', 'Dm', 'Eb', 'Dm'],
      bass: '1.111.111.115.7.',
      gtr: 'x.xxx.xxx.xxX-..',
      kick: 'x.xx..x.x.xx..x.',
      snare: BACKBEAT,
      hat: turn(CRASH8, HAT8),
      lead: `d5 - - - a4 - d5 - f5 - - - e5 - d5 - | a5 - - - - - g5 - f5 - e5 - d5 - - - |
             g5 - - - bb5 - - - g5 - - - eb5 - g5 - | f5 - e5 - d5 - - - - - - - . . . .`,
    },
    b: {
      chords: ['Gm', 'Dm', 'A', 'A'],
      bass: '1.1.1.8.1.1.5.8.',
      gtr: 'X--.X--.X-.xX-.x',
      kick: 'x...x...x...x...',
      snare: turn(BACKBEAT, ROLL),
      hat: 'x.x.x.o.x.x.x.o.',
      lead: `d5 - g5 - bb5 - - - a5 - g5 - d5 - - - | f5 - - - a5 - - - d6 - - - a5 - f5 - |
             e5 - - - c#5 - e5 - a5 - - - g5 - e5 - | c#5 - e5 - a5 - c#6 - e6 - - - - - - -`,
    },
    c: {
      chords: ['Dm', 'C', 'Bb', 'A'],
      bass: '1.111.111.111.85',
      gtr: 'x.xxx.xxx.xxX-..',
      arp: "13583'85313583'853",
      kick: 'x.xx..x.x.xx..x.',
      snare: turn(BACKBEAT, '....x.......x.xx'),
      hat: turn('cxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'),
      lead: `d6 - - a5 - - f5 - d5 - - f5 - - a5 - | c6 - - g5 - - e5 - c5 - - e5 - - g5 - |
             bb5 - - f5 - - d5 - bb4 - - d5 - - f5 - | a5 - - - e5 - - - c#5 - - - e5 - a5 -`,
    },
  },
};

/** Paved yards and streets: four on the floor in F sharp minor. */
const steel: Song = {
  name: 'steel',
  bpm: 132,
  low: 42,
  loopFrom: 1,
  order: ['brk', 'a', 'a', 'b', 'b', 'brk', 'a', 'a', 'b', 'b'],
  parts: {
    brk: {
      chords: ['F#m', 'F#m', 'F#m', 'C#'],
      bass: '.111.111.111.181',
      arp: "15853'58515853'585",
      kick: 'x...x...x...x...',
      hat: '..o...o...o...o.',
      snare: turn(REST, ROLL),
    },
    a: {
      chords: ['F#m', 'F#m', 'D', 'E'],
      bass: '.111.111.111.181',
      gtr: '..X-..X-..X-.xX-',
      arp: "15853'58515853'585",
      kick: 'x...x...x...x...',
      snare: BACKBEAT,
      hat: turn('c.o.x.o.x.o.x.o.', 'x.o.x.o.x.o.x.o.'),
      lead: `c#6 - - - - - b5 - a5 - - - f#5 - - - | a5 - b5 - c#6 - - - - - - - e6 - c#6 - |
             d6 - - - - - c#6 - a5 - - - f#5 - - - | g#5 - b5 - e6 - - - - - - - b5 - g#5 -`,
    },
    b: {
      chords: ['F#m', 'A', 'E', 'D'],
      bass: '1.118.111.118.15',
      gtr: 'X-.xX-.xX-.xX-xx',
      kick: 'x...x...x...x.x.',
      snare: turn(BACKBEAT, '....x.......x.xx'),
      hat: 'xxoxxxoxxxoxxxox',
      lead: `f#5 - a5 - c#6 - a5 - f#5 - a5 - c#6 - f#6 - | e6 - - - c#6 - - - a5 - - - e5 - - - |
             e5 - g#5 - b5 - g#5 - e5 - g#5 - b5 - e6 - | d6 - - - a5 - - - f#5 - - - a5 - d6 -`,
    },
  },
};

/** Snow and ice: cold arpeggios over a driving B minor. */
const frost: Song = {
  name: 'frost',
  bpm: 142,
  low: 42,
  loopFrom: 1,
  order: ['intro', 'a', 'a', 'b', 'c', 'a', 'b', 'c'],
  parts: {
    intro: {
      chords: ['Bm', 'Bm', 'G', 'A'],
      arp: "13583'85313583'853",
      bass: '1.......1.....5.',
      hat: HAT8,
      snare: `${REST}|${REST}|${REST}|${ROLL}`,
    },
    a: {
      chords: ['Bm', 'G', 'A', 'Bm'],
      bass: '1.1.1.1.8.1.1.7.',
      gtr: 'X-----x.X-----xx',
      arp: "13583'85313583'853",
      kick: 'x.....x.x.....x.',
      snare: BACKBEAT,
      hat: turn(CRASH8, HAT8),
      lead: `f#5 - - - - - d5 - b4 - - - d5 - f#5 - | g5 - - - - - d5 - b4 - - - d5 - g5 - |
             a5 - - - - - e5 - c#5 - - - e5 - a5 - | b5 - - - f#5 - - - d5 - f#5 - b5 - - -`,
    },
    b: {
      chords: ['G', 'A', 'F#m', 'Bm'],
      bass: '1.118.111.118.15',
      gtr: 'x.xx.xx.x.xx.X-.',
      arp: "13583'85313583'853",
      kick: 'x...x...x...x...',
      snare: turn(BACKBEAT, '....x.......x.xx'),
      hat: 'x.x.x.o.x.x.x.o.',
      lead: `b5 - a5 - g5 - - - d5 - - - g5 - - - | c#6 - b5 - a5 - - - e5 - - - a5 - - - |
             a5 - - - f#5 - - - c#5 - - - f#5 - a5 - | b5 - - - - - - - . . f#5 - b5 - d6 -`,
    },
    c: {
      chords: ['Em', 'G', 'A', 'F#'],
      bass: '1111111181111155',
      gtr: 'x.xx.xx.x.xx.X-.',
      kick: 'x.x...x.x.x...x.',
      snare: turn(BACKBEAT, ROLL),
      hat: turn('cxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'),
      lead: `e6 - - b5 - - g5 - e5 - - g5 - - b5 - | d6 - - b5 - - g5 - d5 - - g5 - - b5 - |
             e6 - - c#6 - - a5 - e5 - - a5 - - c#6 - | f#6 - - - c#6 - - - a#5 - - - c#6 - f#6 -`,
    },
  },
};

/** The derbies: fast, heavy and low, with a flat second that leans on you. */
const derby: Song = {
  name: 'derby',
  bpm: 164,
  low: 40,
  loopFrom: 1,
  order: ['brk', 'a', 'a', 'b', 'b', 'brk', 'a', 'a', 'b', 'b'],
  parts: {
    brk: {
      chords: ['Em', 'Em', 'Em', 'Em'],
      bass: '1.......1.....7.',
      gtr: 'X-------........|X-------....x.x.',
      kick: 'x.........x.....',
      snare: turn('........x.......', '........x.x.xxxx'),
      hat: 'c...x...x...x...|x...x...x...x...',
    },
    a: {
      chords: ['Em', 'Em', 'F', 'Em'],
      bass: '1.111.111.111.87',
      gtr: 'x.xxx.xxx.xxx.X-',
      kick: 'x.xxx.xxx.xxx.xx',
      snare: BACKBEAT,
      hat: turn(CRASH8, HAT8),
      lead: `e5 - - - - - g5 - e5 - - - b4 - - - | e5 - g5 - a5 - b5 - - - - - a5 - g5 - |
             f5 - - - - - a5 - c6 - - - a5 - f5 - | e5 - - - b5 - - - e6 - - - - - - -`,
    },
    b: {
      chords: ['Em', 'G', 'F#', 'F'],
      bass: '1.1.1.1.1.1.8.1.',
      gtr: 'X-x.X-x.X-x.X-xx',
      kick: 'x.x.x.x.x.x.x.x.',
      snare: turn(BACKBEAT, ROLL),
      hat: 'cxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx',
      lead: `b5 - - e6 - - b5 - g5 - - b5 - - e5 - | d6 - - b5 - - g5 - d5 - - g5 - - b5 - |
             c#6 - - a#5 - - f#5 - c#5 - - f#5 - - a#5 - | c6 - - a5 - - f5 - c5 - - f5 - a5 c6 -`,
    },
  },
};

/** The menus: slower, in A minor, the arpeggio carrying it. */
const menu: Song = {
  name: 'menu',
  bpm: 104,
  low: 40,
  loopFrom: 1,
  order: ['intro', 'a', 'b', 'a', 'b'],
  parts: {
    intro: {
      chords: ['Am', 'F', 'C', 'G'],
      arp: "1583'5'3'851583'5'3'85",
      bass: '1.....1.1.....5.',
    },
    a: {
      chords: ['Am', 'F', 'C', 'G'],
      arp: "1583'5'3'851583'5'3'85",
      bass: '1.....1.1.....5.',
      gtr: 'X---------------',
      kick: 'x.....x...x.....',
      snare: BACKBEAT,
      hat: HAT8,
      lead: `e5 - - - - - - - c5 - - - a4 - - - | c5 - - - - - - - a4 - - - f4 - a4 - |
             g5 - - - - - - - e5 - - - c5 - - - | d5 - - - - - b4 - d5 - - - g5 - - -`,
    },
    b: {
      chords: ['Am', 'F', 'E', 'E'],
      arp: "1583'5'3'851583'5'3'85",
      bass: '1.1...1.1.1...5.',
      gtr: 'X-------X-----x.',
      kick: 'x.....x...x...x.',
      snare: turn(BACKBEAT, '....x.......x.xx'),
      hat: 'x.x.x.o.x.x.x.o.',
      lead: `a5 - - - e5 - - - c5 - - - e5 - - - | a5 - - - f5 - - - c5 - - - f5 - - - |
             g#5 - - - e5 - - - b4 - - - e5 - - - | b5 - - - - - - - g#5 - - - e5 - - -`,
    },
  },
};

export const SONGS = { menu, green, dust, steel, frost, derby } as const;
export type Tune = keyof typeof SONGS;

const made = new Map<Tune, Compiled>();

export function tune(name: Tune): Compiled {
  let c = made.get(name);
  if (!c) made.set(name, (c = compile(SONGS[name])));
  return c;
}

/** The tune for a race: by the country it is run in, and the derbies have their own. */
export function tuneFor(o: { derby: boolean; terrain: string; dirtRoad: boolean }): Tune {
  if (o.derby) return 'derby';
  if (o.terrain === 'snow') return 'frost';
  if (o.terrain === 'paved') return 'steel';
  if (o.dirtRoad || o.terrain === 'dirt' || o.terrain === 'sand' || o.terrain === 'gravel') {
    return 'dust';
  }
  return 'green';
}
