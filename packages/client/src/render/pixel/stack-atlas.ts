import type { Strip } from '../stack';
import { texture } from './gl';

/** Where a strip sits in the atlas, in texels. Slice i is at (x + i * cw, y). */
export interface AtlasSlot {
  x: number;
  y: number;
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

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly size = 2048,
  ) {
    this.tex = texture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  /** The strip's slot, packing and uploading it on first use. */
  slot(s: Strip): AtlasSlot {
    const had = this.slots.get(s);
    if (had) return had;
    const a = shelfPack(this.shelf, this.size, s.img.width, s.img.height);
    if (!a) throw new Error('stack atlas is full');
    this.slots.set(s, a);
    this.upload(s, a);
    return a;
  }

  /** Upload a redrawn strip again (no-op for a strip never drawn). */
  refresh(s: Strip): void {
    const a = this.slots.get(s);
    if (a) this.upload(s, a);
  }

  private upload(s: Strip, a: AtlasSlot): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, a.x, a.y, gl.RGBA, gl.UNSIGNED_BYTE, s.img);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
  }
}
