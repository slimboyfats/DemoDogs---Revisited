import type { Strip } from '../stack';
import { texture } from './gl';

/** Where a strip sits in the atlas, in texels. Slice i is at (x + i * cw, y). */
export interface AtlasSlot {
  x: number;
  y: number;
  /** The room it was given, when that is more than the strip needs (a slot used again). */
  w?: number;
  h?: number;
}

/**
 * The spare slot that fits a `w` by `h` strip most snugly, taken out of `spare`; none if every
 * one is too small or would waste more than the strip's own size again. Pure.
 */
export function takeSpare(spare: AtlasSlot[], w: number, h: number): AtlasSlot | null {
  let best = -1;
  let waste = w * h;
  for (let i = 0; i < spare.length; i++) {
    const s = spare[i]!;
    if (s.w! < w || s.h! < h) continue;
    const over = s.w! * s.h! - w * h;
    if (over <= waste) {
      waste = over;
      best = i;
    }
  }
  if (best < 0) return null;
  const s = spare[best]!;
  spare[best] = spare[spare.length - 1]!;
  spare.pop();
  return s;
}

/** Shelf position for a strip of width w and height h, or null when the atlas is full. Pure. */
export function shelfPack(
  state: { x: number; y: number; row: number },
  size: number,
  w: number,
  h: number,
  pad = 1,
): AtlasSlot | null {
  if (w > size) return null;
  if (state.x + w > size) {
    state.x = 0;
    state.y += state.row + pad;
    state.row = 0;
  }
  if (state.y + h > size) return null;
  const slot = { x: state.x, y: state.y };
  state.x += w + pad;
  state.row = Math.max(state.row, h);
  return slot;
}

/**
 * Sprite-stack addon for the pixel engine: every slice strip in one RGBA texture, packed on
 * shelves the first time it is drawn. A strip that is redrawn (a dent, charring, a fresh body)
 * is uploaded again in place, so a car's damage costs one small texSubImage2D.
 */
export class StackAtlas {
  readonly tex: WebGLTexture;
  private readonly slots = new Map<Strip, AtlasSlot>();
  private readonly shelf = { x: 0, y: 0, row: 0 };
  /** Slots given back: the next strip that fits one takes it instead of new room. */
  private readonly spare: AtlasSlot[] = [];
  /** How many times the atlas filled up and was started again. */
  flushes = 0;
  readonly size: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    size = 4096,
  ) {
    this.size = Math.min(size, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    this.tex = texture(gl);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      this.size,
      this.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }

  /** The strip's slot, packing and uploading it on first use. */
  slot(s: Strip): AtlasSlot {
    const had = this.slots.get(s);
    if (had) return had;
    const w = s.img.width;
    const h = s.img.height;
    let a = takeSpare(this.spare, w, h) ?? shelfPack(this.shelf, this.size, w, h);
    if (!a) {
      // full: forget everything and pack again from what is drawn from here on. Strips already
      // placed this frame may show the wrong pixels until the next one.
      this.reset();
      this.flushes++;
      a = shelfPack(this.shelf, this.size, w, h);
      // a strip bigger than the whole atlas: draw it from the corner rather than stop the game
      if (!a) return { x: 0, y: 0 };
    }
    this.slots.set(s, a);
    this.upload(s, a);
    return a;
  }

  /** How much of the atlas's height is taken, 0 to 1. */
  get fill(): number {
    return (this.shelf.y + this.shelf.row) / this.size;
  }

  /** A strip that will not be drawn again gives its room back. */
  release(s: Strip): void {
    const a = this.slots.get(s);
    if (!a) return;
    this.slots.delete(s);
    a.w ??= s.img.width;
    a.h ??= s.img.height;
    this.spare.push(a);
  }

  /** Empty the atlas: every strip is packed and uploaded afresh the next time it is drawn. */
  reset(): void {
    this.slots.clear();
    this.spare.length = 0;
    this.shelf.x = this.shelf.y = this.shelf.row = 0;
  }

  /** Upload a redrawn strip again (no-op for a strip never drawn). */
  refresh(s: Strip): void {
    const a = this.slots.get(s);
    if (a) this.upload(s, a);
  }

  private upload(s: Strip, a: AtlasSlot): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    const w = s.img.width;
    const h = s.img.height;
    // a strip that keeps its pixels is uploaded from them: no canvas read-back, just a copy
    if (s.px)
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        a.x,
        a.y,
        w,
        h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(s.px.buffer, s.px.byteOffset, s.px.byteLength),
      );
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, a.x, a.y, gl.RGBA, gl.UNSIGNED_BYTE, s.img);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
  }
}
