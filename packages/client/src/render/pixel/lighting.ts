/**
 * Point lights, from mudders' pixel engine (packages/client/src/render/pixel/lighting.ts): up to
 * `MAX_LIGHTS` a frame, packed for the shaders. In DemoDogs they come from explosions, burning
 * wrecks, rockets and pickups, and light the sprite stacks in hard dithered bands.
 */

export const MAX_LIGHTS = 8;
/** Light bands per unit strength (hard steps, dithered between). */
export const LIGHT_BANDS = 4;

/** The frame's point lights, packed for `uniform4fv` / `uniform3fv`. */
export class Lights {
  /** x, y (map cells), radius (cells), strength. */
  readonly pos = new Float32Array(MAX_LIGHTS * 4);
  /** rgb 0–1. */
  readonly col = new Float32Array(MAX_LIGHTS * 3);
  count = 0;

  clear(): void {
    this.count = 0;
  }

  /** Add a light; when full, it replaces the weakest one if it is stronger. */
  add(x: number, y: number, r: number, strength: number, rgb: number): void {
    if (strength <= 0.01 || r < 1) return;
    let i = this.count;
    if (i >= MAX_LIGHTS) {
      let weak = 0;
      for (let k = 1; k < MAX_LIGHTS; k++) {
        if (this.weight(k) < this.weight(weak)) weak = k;
      }
      if (this.weight(weak) >= strength * r) return;
      i = weak;
    } else {
      this.count++;
    }
    this.pos[i * 4] = x;
    this.pos[i * 4 + 1] = y;
    this.pos[i * 4 + 2] = r;
    this.pos[i * 4 + 3] = strength;
    this.col[i * 3] = ((rgb >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((rgb >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (rgb & 255) / 255;
  }

  private weight(i: number): number {
    return this.pos[i * 4 + 2]! * this.pos[i * 4 + 3]!;
  }
}

/** 4×4 ordered dither, same table as the shaders' `bayer`. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

/** A light amount snapped to hard bands, dithered by cell (mirrors the shader). */
export function band(e: number, x: number, y: number): number {
  if (e <= 0) return 0;
  const q = Math.floor(e * LIGHT_BANDS + bayer(x, y) - 0.5) / LIGHT_BANDS;
  return Math.min(1.5, Math.max(0, q));
}
