import { describe, expect, it } from 'vitest';
import { bars, codeFrom, linkWords } from './online';

describe('the online screen', () => {
  it('takes a room code as typed, in any case, or out of a pasted invite link', () => {
    expect(codeFrom('kd7m2p')).toBe('KD7M2P');
    expect(codeFrom(' kd7-m2p ')).toBe('KD7M2P');
    expect(codeFrom('https://example.test/game/?room=kd7m2p')).toBe('KD7M2P');
    expect(codeFrom('look: https://example.test/?x=1&room=KD7M2P come race')).toBe('KD7M2P');
  });

  it('says how good the link is in words and bars', () => {
    expect(linkWords(40, 'p2p')).toBe('GOOD CONNECTION · 40 ms · direct');
    expect(linkWords(260, 'relay')).toBe('SLOW CONNECTION · 260 ms · through the server');
    expect(bars(40, true)).toBe(4);
    expect(bars(150, true)).toBe(2);
    expect(bars(900, true)).toBe(1);
    expect(bars(40, false)).toBe(0);
  });
});
