import { describe, expect, it } from 'vitest';
import { soundOf } from './ui-sounds';

const btn = (o: Partial<Parameters<typeof soundOf>[0]>) =>
  soundOf({ dataset: {}, id: '', className: '', textContent: '', ...o });

describe('menu sounds', () => {
  it('a button taps, a way back sounds like one, a tab like a tab', () => {
    expect(btn({ textContent: 'QUICK RACE' })).toBe('tap');
    expect(btn({ textContent: 'BACK' })).toBe('back');
    expect(btn({ id: 'quit' })).toBe('back');
    expect(btn({ className: 'tab on' })).toBe('tab');
  });

  it('a control has the last word, and a dead one is silent', () => {
    expect(btn({ textContent: 'BACK', dataset: { snd: 'go' } })).toBe('go');
    expect(btn({ dataset: { snd: '' } })).toBeNull();
    expect(btn({ disabled: true })).toBeNull();
  });
});
