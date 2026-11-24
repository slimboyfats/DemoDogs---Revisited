import type { Relief } from '@demodogs/sim';

/**
 * Raised ground, worked out once per race for the ground's shader.
 *
 * The camera looks down from the south at a fixed pitch, so ground that stands `h` high is drawn
 * `h * rise` art px further up the screen than flat ground would be. The ground canvas stays a
 * flat map; this is the map from the picture back to it: for every px of the picture, how many
 * rows further south the ground it shows lies (red), how the light falls on it (green, 128 is
 * flat ground) and whether it is the steep face of a drop seen from the front (blue). The shader
 * reads one texel of it and looks the colour up that far down the canvas, so hills, banks and
 * cliffs cost nothing a frame beyond that one read.
 *
 * It is painted the way old height-map landscapes were: every column from the far end to the
 * near, nearer ground over further, and where the picture jumps down a drop the rows between are
 * the drop's face.
 */
export function bakeRelief(R: Relief, w: number, h: number, rise: number): Uint8Array {
  // the height of every px, read between the grid's points a row at a time
  const hh = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hh[y * w + x] = R.at(x + 0.5, y + 0.5);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) out[i * 4 + 1] = 128;
  const last = new Int32Array(w).fill(-1);
  const at = (x: number, y: number): number =>
    hh[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)]!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = hh[y * w + x]!;
      const s = Math.round(y - v * rise);
      const prev = last[x]!;
      last[x] = s;
      if (s < 0) continue;
      // the light is at the top left: ground that rises to the south-east faces it
      const lit = (at(x + 3, y) - at(x - 3, y) + at(x, y + 3) - at(x, y - 3)) / 6;
      // a face: ground too steep to stand on, whichever way it looks; it takes the light harder
      const steep = Math.hypot(at(x + 1, y) - at(x - 1, y), at(x, y + 1) - at(x, y - 1)) / 2 > 1;
      let shade = steep
        ? 1 + Math.max(-0.5, Math.min(0.22, lit * 0.5))
        : 1 + Math.max(-0.46, Math.min(0.4, lit * 1.7));
      // and higher ground up and to the left throws its shadow here
      if (at(x - 5, y - 5) - v > 4 || at(x - 12, y - 12) - v > 10 || at(x - 20, y - 20) - v > 17)
        shade *= 0.64;
      // the lip of a drop catches the light
      else if (v - Math.min(at(x + 2, y), at(x, y + 2), at(x - 2, y), at(x, y - 2)) > 4)
        shade *= 1.16;
      // and the foot of a face is in its shade, whichever way it looks
      else if (Math.max(at(x + 2, y), at(x, y + 2), at(x - 2, y), at(x, y - 2)) - v > 4)
        shade *= 0.8;
      // (and where the picture jumps down a drop, the rows between are its face too)
      const face = steep || (s - prev >= 2 && at(x, y - 1) - v > 1);
      const g = Math.max(0, Math.min(255, Math.round(128 * shade)));
      for (let j = Math.max(0, Math.min(prev + 1, s)); j <= s; j++) {
        const k = (j * w + x) * 4;
        out[k] = Math.min(255, y - j);
        out[k + 1] = g;
        out[k + 2] = face ? 255 : 0;
      }
    }
  // the near edge of raised ground: its cut face down to the bottom of the map
  for (let x = 0; x < w; x++)
    for (let j = Math.max(0, last[x]! + 1); j < h; j++) {
      const k = (j * w + x) * 4;
      out[k] = Math.min(255, h - 1 - j);
      out[k + 1] = 70;
      out[k + 2] = 255;
    }
  return out;
}
