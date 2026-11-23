import { describe, expect, it } from 'vitest';
import { chord, compile, hz, midiOf, tokens, type Song } from './tracker';

const song = (over: Partial<Song> = {}): Song => ({
  name: 'test',
  bpm: 120,
  low: 40,
  loopFrom: 1,
  order: ['a', 'b'],
  parts: {
    a: { chords: ['Em'], kick: 'x...x...x...x...' },
    b: {
      chords: ['Em', 'C'],
      bass: "1.3.5.8'.........",
      lead: 'e5 - - - . . . . g5 . . . . . . .',
    },
  },
  ...over,
});

describe('tracker', () => {
  it('reads notes and chords', () => {
    expect(midiOf('a4')).toBe(69);
    expect(midiOf('c#5')).toBe(73);
    expect(midiOf('bb4')).toBe(70);
    expect(hz(69)).toBe(440);
    expect(chord('Em', 40)).toEqual({ root: 40, minor: true });
    expect(chord('C', 40)).toEqual({ root: 48, minor: false });
    expect(chord('D', 38)).toEqual({ root: 38, minor: false });
    expect(() => chord('H', 40)).toThrow();
  });

  it('wants whole bars and nothing it cannot read', () => {
    expect(tokens('kick', 'x...|x...|x...|x...')).toHaveLength(16);
    expect(() => tokens('kick', 'x...x...')).toThrow(/whole bars/);
    expect(() => tokens('bass', '1.9.1.1.1.1.1.1.')).toThrow(/cannot read/);
  });

  it('lays a song out in steps, the bass following the chords', () => {
    const c = compile(song());
    expect(c.stepTime).toBe(0.125);
    expect(c.steps).toBe(48);
    expect(c.loopStep).toBe(16);
    expect(c.notes.filter((n) => n.voice === 'kick').map((n) => n.step)).toEqual([0, 4, 8, 12]);
    const bass = c.notes.filter((n) => n.voice === 'bass');
    // E minor: e, g, b and the e two octaves up; then C major: c, e, g, c
    expect(bass.slice(0, 4).map((n) => n.midi)).toEqual([40, 43, 47, 64]);
    expect(bass.slice(4).map((n) => n.midi)).toEqual([48, 52, 55, 72]);
    for (let i = 1; i < c.notes.length; i++)
      expect(c.notes[i]!.step).toBeGreaterThanOrEqual(c.notes[i - 1]!.step);
  });

  it('holds a note for as long as it is tied, and plays a short line round again', () => {
    const c = compile(song());
    const lead = c.notes.filter((n) => n.voice === 'lead');
    expect(lead.map((n) => [n.step, n.len, n.midi])).toEqual([
      [16, 4, 76],
      [24, 1, 79],
      [32, 4, 76],
      [40, 1, 79],
    ]);
  });

  it('says what is wrong with a song', () => {
    expect(() => compile(song({ order: ['a', 'z'] }))).toThrow(/no part z/);
    expect(() => compile(song({ loopFrom: 5 }))).toThrow(/loop/);
    expect(() =>
      compile(
        song({ parts: { a: { chords: ['Em'], kick: 'x...x...x...x...|x...x...x...x...' } } }),
      ),
    ).toThrow(/too long/);
  });
});
