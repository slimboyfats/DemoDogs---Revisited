import type { Strip } from '../stack';
import { AuxBake } from './aux';
import { texture } from './gl';
import { shellPixels } from './shell';

/** A strip's lighting bytes (see aux.ts), and whether the strip has changed since they were baked. */
interface Baked {
  data: Uint8Array | null;
  stale: boolean;
}

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
  /**
   * The same atlas with the interior of every solid left out (shell stacks), kept only while the
   * overdraw meter asks for it: it costs a pixel read and a pass over every strip uploaded.
   */
  shellTex: WebGLTexture | null = null;
  /**
   * Beside the colours, two bytes a texel for the lighting: which way the texel faces, whether
   * sky is over it, whether it is a lamp (aux.ts). Kept only while the lighting is on. A strip's
   * bytes are baked a few slices a frame (`work`) and kept with the strip, so the next race has
   * them at once; until they are baked the strip is lit flat.
   */
  auxTex: WebGLTexture | null = null;
  private readonly baked = new WeakMap<Strip, Baked>();
  private readonly queue: Strip[] = [];
  private job: { s: Strip; bake: AuxBake } | null = null;
  private zeros = new Uint8Array(0);
  /** Strips waiting for their lighting bytes (for the readouts). */
  get baking(): number {
    return this.queue.length + (this.job ? 1 : 0);
  }
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

  /** Keep the shelled copy too (or stop). Everything is uploaded afresh from the next frame. */
  setShell(on: boolean): void {
    const gl = this.gl;
    if (on === !!this.shellTex) return;
    if (on) {
      this.shellTex = texture(gl);
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
    } else {
      gl.deleteTexture(this.shellTex);
      this.shellTex = null;
    }
    this.reset();
  }

  /** Keep the lighting bytes too (or stop). Everything is uploaded afresh from the next frame. */
  setLit(on: boolean): void {
    const gl = this.gl;
    if (on === !!this.auxTex) return;
    if (on) {
      this.auxTex = texture(gl);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RG8,
        this.size,
        this.size,
        0,
        gl.RG,
        gl.UNSIGNED_BYTE,
        null,
      );
    } else {
      gl.deleteTexture(this.auxTex);
      this.auxTex = null;
      this.queue.length = 0;
      this.job = null;
    }
    this.reset();
  }

  /** Upload a redrawn strip again (no-op for a strip never drawn). */
  refresh(s: Strip): void {
    const b = this.baked.get(s);
    if (b) b.stale = true;
    const a = this.slots.get(s);
    if (a) this.upload(s, a);
  }

  /**
   * Bake lighting bytes for the strips that are waiting, for about `ms` milliseconds: called once
   * a frame. `now` is the clock (performance.now).
   */
  work(ms: number, now: () => number): void {
    if (!this.auxTex) return;
    const until = now() + ms;
    const late = () => now() >= until;
    for (;;) {
      if (!this.job) {
        const s = this.queue.shift();
        if (!s) return;
        const b = this.baked.get(s)!;
        b.stale = false;
        const w = s.img.width;
        const h = s.img.height;
        const px = s.px ?? s.img.getContext('2d')?.getImageData(0, 0, w, h).data;
        if (!px) continue;
        this.job = { s, bake: new AuxBake(px, w, h, s, s.glow) };
      }
      const { s, bake } = this.job;
      if (!bake.step(late)) return;
      this.job = null;
      const b = this.baked.get(s)!;
      b.data = bake.out;
      const a = this.slots.get(s);
      if (a) this.uploadAux(s, a, b.data);
      // dented while it was being baked: once more, with the old bytes shown meanwhile
      if (b.stale) this.queue.push(s);
      if (late()) return;
    }
  }

  private uploadAux(s: Strip, a: AtlasSlot, data: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.auxTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      a.x,
      a.y,
      s.img.width,
      s.img.height,
      gl.RG,
      gl.UNSIGNED_BYTE,
      data,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** The strip's lighting bytes into its slot: the baked ones, or "not known" and a place in the queue. */
  private light(s: Strip, a: AtlasSlot): void {
    let b = this.baked.get(s);
    if (!b) this.baked.set(s, (b = { data: null, stale: true }));
    if (b.data) this.uploadAux(s, a, b.data);
    else {
      const need = s.img.width * s.img.height * 2;
      if (this.zeros.length < need) this.zeros = new Uint8Array(need);
      this.uploadAux(s, a, this.zeros);
    }
    if (b.stale && this.job?.s !== s && !this.queue.includes(s)) this.queue.push(s);
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
    if (this.auxTex) this.light(s, a);
    if (this.shellTex) {
      const px = s.px ?? s.img.getContext('2d')?.getImageData(0, 0, w, h).data;
      if (!px) return;
      const shell = shellPixels(px, w, s);
      gl.bindTexture(gl.TEXTURE_2D, this.shellTex);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        a.x,
        a.y,
        w,
        h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(shell.buffer, shell.byteOffset, shell.byteLength),
      );
    }
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
    if (this.shellTex) this.gl.deleteTexture(this.shellTex);
    if (this.auxTex) this.gl.deleteTexture(this.auxTex);
  }
}
