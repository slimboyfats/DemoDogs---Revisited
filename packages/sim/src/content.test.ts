import { describe, expect, it } from 'vitest';
import { ContentError, resolveContent } from './content';

const meta = { name: 'X', description: 'Y', since: 'core@0.1.0' };
const pack = { name: 'core', version: '0.1.0', description: 'test' };
const prop = (name: string, extra: Record<string, unknown> = {}) => ({
  path: `core/prop/${name}/manifest.json`,
  data: { id: `prop.${name}`, schemaVersion: 1, meta, body: 'static', radius: 4, ...extra },
});

describe('resolveContent', () => {
  it('resolves extends: base first, own keys win', () => {
    const C = resolveContent({
      packs: [
        {
          pack,
          manifests: [
            prop('a', { radius: 7 }),
            { ...prop('b'), data: { id: 'prop.b', extends: 'prop.a', solid: false } },
          ],
        },
      ],
      behaviours: [],
    });
    expect(C.prop.get('prop.b')!.radius).toBe(7);
    expect(C.prop.get('prop.b')!.solid).toBe(false);
  });

  it('lists every problem at once', () => {
    let err: unknown;
    try {
      resolveContent({
        packs: [
          {
            pack,
            manifests: [
              prop('a', { radius: -1 }),
              { path: 'core/prop/wrong/manifest.json', data: { ...prop('c').data } },
              { ...prop('d'), data: { id: 'prop.d', extends: 'prop.nope' } },
              { path: 'core/x/y/manifest.json', data: {} },
            ],
          },
        ],
        behaviours: [],
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentError);
    const p = (err as ContentError).problems.join('\n');
    expect(p).toMatch(/prop\/a\/manifest.json: radius/);
    expect(p).toMatch(/does not match its folder/);
    expect(p).toMatch(/extends missing prop\.nope/);
    expect(p).toMatch(/no id/);
  });
});
