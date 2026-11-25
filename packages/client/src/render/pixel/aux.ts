/**
 * What the lighting needs to know about every texel of a strip, worked out from the strip's own
 * shape: which way its surface faces, whether it is open to the sky, and whether it glows. Two
 * bytes a texel, in the same layout as the strip's image, so the atlas keeps them in a second
 * texture beside the colours.
 *
 * The facing is the idea of loktar00's sprite-stack-engine (normals baked from the stack) and of
 * danielwh2's sprite-stacking (`compute_normals`: the gradient of what is solid), both MIT, written
 * afresh here for strips that change while they are drawn: a dent bakes again, a few slices a
 * frame, and until it has the old facing is still shown.
 *
 * Byte 0: 0 for "not known" (lit flat), else 1 + azimuth * ELS + elevation: the azimuth in `AZS`
 * steps round the strip's own axes, the elevation in `ELS` steps from a wall (0) to a flat top.
 * Byte 1: bit 7 set when nothing of the strip is above the texel; bits 0 to 2 how much it glows.
 */

/** Steps of azimuth and of elevation a facing is kept in. */
export const AZS = 24;
export const ELS = 10;
/** Byte 1's flag for a texel with only sky above it. */
export const SKY = 128;
/** The most a texel can glow. */
export const GLOW_MAX = 7;

/** How a strip's slices lie in its image, and how fine it is (texels per art px). */
export interface AuxLayout {
  cw: number;
  ch: number;
  n: number;
  cols: number;
  res: number;
}

/** A facing as byte 0 holds it. Anything that faces down counts as a wall. */
export function packNormal(nx: number, ny: number, nz: number): number {
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) return 1 + (ELS - 1);
  const el = Math.min(ELS - 1, Math.max(0, Math.round((nz / len) * (ELS - 1))));
  if (el === ELS - 1) return 1 + el;
  const turn = Math.atan2(ny, nx) / (Math.PI * 2);
  const az = ((Math.round(turn * AZS) % AZS) + AZS) % AZS;
  return 1 + az * ELS + el;
}

/** Byte 0 back to a unit vector (as the shader reads it); null for "not known". */
export function unpackNormal(b: number): [number, number, number] | null {
  if (b === 0) return null;
  const v = b - 1;
  const nz = (v % ELS) / (ELS - 1);
  const a = (Math.floor(v / ELS) / AZS) * Math.PI * 2;
  const h = Math.sqrt(Math.max(0, 1 - nz * nz));
  return [Math.cos(a) * h, Math.sin(a) * h, nz];
}

/**
 * One strip's bake, done a few slices at a time. `px` is read as it is when each slice is done,
 * so a strip dented half way through comes out a little mixed; the atlas bakes it again anyway.
 */
export class AuxBake {
  /** Two bytes a texel, rows `W` wide, as the strip's image. */
  readonly out: Uint8Array;
  private readonly occ: Uint8Array;
  private readonly top: Int16Array;
  private readonly pad: number;
  private readonly st: number;
  private readonly sx: number;
  private readonly sy: number;
  private z = 0;

  constructor(
    private readonly px: Uint8ClampedArray,
    private readonly W: number,
    H: number,
    private readonly lay: AuxLayout,
    private readonly glow?: Uint8Array,
  ) {
    const { cw, ch, n, cols, res } = lay;
    this.out = new Uint8Array(W * H * 2);
    // look the same distance round a texel however fine the strip is (as strips.ts shades it)
    const st = (this.st = Math.max(1, Math.round(res / 3)));
    const p = (this.pad = st * 2);
    const sx = (this.sx = cw + p * 2);
    const sy = (this.sy = ch + p * 2);
    // what is solid, with a margin all round so nothing below has to check its bounds: empty to
    // the sides and above, solid underneath (the ground), so the foot of a wall does not face down
    const occ = (this.occ = new Uint8Array(sx * sy * (n + p * 2)));
    occ.fill(1, 0, sx * sy * p);
    const top = (this.top = new Int16Array(cw * ch).fill(-1));
    for (let z = 0; z < n; z++) {
      const ox = (z % cols) * cw;
      const oy = Math.floor(z / cols) * ch;
      const base = (z + p) * sx * sy + p * sx + p;
      for (let y = 0; y < ch; y++) {
        let j = ((oy + y) * W + ox) * 4 + 3;
        let o = base + y * sx;
        const t = y * cw;
        for (let x = 0; x < cw; x++, j += 4, o++)
          if (px[j]! >= 128) {
            occ[o] = 1;
            top[t + x] = z;
          }
      }
    }
  }

  /** Bake slices until `enough()` says stop (it is asked after each one). True when all are done. */
  step(enough?: () => boolean): boolean {
    const { cw, ch, n, cols } = this.lay;
    const { occ, top, out, W, glow, st, sx, sy } = this;
    const p = this.pad;
    const layer = sx * sy;
    while (this.z < n) {
      const z = this.z++;
      const ox = (z % cols) * cw;
      const oy = Math.floor(z / cols) * ch;
      for (let y = 0; y < ch; y++) {
        const row = (z + p) * layer + (y + p) * sx + p;
        for (let x = 0; x < cw; x++) {
          const i = row + x;
          if (!occ[i]) continue;
          const j = (oy + y) * W + ox + x;
          let b1 = top[y * cw + x] === z ? SKY : 0;
          if (glow) b1 |= Math.min(GLOW_MAX, glow[j]!);
          out[j * 2 + 1] = b1;
          // only the surface is ever seen; what is inside stays "not known" until a dent bares it.
          // (What lies just under the rim of the slice above is seen too: a smoothed edge is drawn
          // a part of a texel inside the rim, and what shows there must face as the rim does.)
          const up = i + layer;
          if (
            occ[up] &&
            occ[i + 1] &&
            occ[i - 1] &&
            occ[i + sx] &&
            occ[i - sx] &&
            occ[up + 1] &&
            occ[up - 1] &&
            occ[up + sx] &&
            occ[up - sx]
          )
            continue;
          // which way the surface faces: away from the solid around the texel
          let nx = 0;
          let ny = 0;
          let nz = 0;
          for (let dz = -2; dz <= 2; dz++) {
            const iz = i + dz * st * layer;
            for (let dy = -2; dy <= 2; dy++) {
              const iy = iz + dy * st * sx;
              for (let dx = -2; dx <= 2; dx++) {
                if (occ[iy + dx * st]) continue;
                nx += dx;
                ny += dy;
                nz += dz;
              }
            }
          }
          out[j * 2] = packNormal(nx, ny, nz);
        }
      }
      if (enough?.()) break;
    }
    return this.z >= n;
  }
}

/** A whole strip's bake at once (tests, and anything that can wait for it). */
export function bakeAux(
  px: Uint8ClampedArray,
  W: number,
  H: number,
  lay: AuxLayout,
  glow?: Uint8Array,
): Uint8Array {
  const b = new AuxBake(px, W, H, lay, glow);
  b.step();
  return b.out;
}
