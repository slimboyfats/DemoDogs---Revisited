import { describe, expect, it } from 'vitest';
import { buildRelief, sampleTrack } from '@demodogs/sim';
import { bakeRelief } from './relief-map';

const W = 800;
const T = sampleTrack(
  [
    [200, 200],
    [600, 200],
    [600, 600],
    [200, 600],
  ],
  4,
);
const spec = { hills: 0, wave: 520, banks: 24, from: 20, spread: 60, step: 12 };
const R = buildRelief(spec, 5, W, W, T, 60, null);
const RISE = 0.674;
const map = bakeRelief(R, W, W, RISE);
const px = (x: number, y: number) => [...map.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];

describe('the picture-to-ground map', () => {
  it('leaves flat ground where it is, in flat light', () => {
    for (let i = 0; i < T.n; i += 9)
      expect(px(Math.round(T.x[i]!), Math.round(T.y[i]!))).toEqual([0, 128, 0]);
  });

  it('draws raised ground further up the picture, by its height', () => {
    // far north of the road the ground stands 24 high: the picture shows ground 16 rows south
    expect(R.at(400, 40)).toBe(24);
    expect(px(400, 24)[0]).toBe(Math.round(24 * RISE));
    expect(px(400, 24)[2]).toBe(0);
  });

  it('shows the face of a drop that looks at the camera, and none where it looks away', () => {
    // north of the top straight the terraces fall towards the camera: their faces are seen
    let faces = 0;
    for (let y = 0; y < 170; y++) if (px(400, y)[2] === 255) faces++;
    expect(faces).toBeGreaterThan(8);
    expect(faces).toBeLessThan(40);
    // south of the bottom straight they rise towards it: the tops hide what is behind, no face
    let hidden = 0;
    for (let y = 630; y < 780; y++) hidden += px(400, y)[2] === 255 ? 1 : 0;
    expect(hidden).toBe(0);
  });

  it('shades what lies in the shadow of higher ground, and cuts the near edge off as a face', () => {
    let dark = 0;
    for (let y = 0; y < 170; y++) if (px(400, y)[1]! < 100 && px(400, y)[2] === 0) dark++;
    expect(dark).toBeGreaterThan(2);
    expect(px(400, W - 1)[2]).toBe(255);
  });
});
