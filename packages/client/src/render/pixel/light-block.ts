import { texture } from './gl';
import type { StackView } from './stack-batch';

/**
 * What stands in a light's way this frame: a map laid flat over the ground in view, one texel
 * to the art px, holding for each the top and the underside of the slices drawn there (so a
 * beam goes under a bridge's deck and a tree's crown, and over a kerb). The ground and the
 * stacks walk each light's ray across it (`lightOpen`), so a headlamp, a blast, a fire or a
 * lamp post throws real shadows that move as it does.
 */
/** The map's corner lies on a multiple of this (art px): the widest spacing of the traced light's probes. */
export const SNAP = 32;

export class LightBlock {
  readonly tex: WebGLTexture;
  /** The colour of what stands there (alpha: how high), for light thrown back on the ground. */
  readonly col: WebGLTexture;
  /** The light of what glows there (lamps, tail lights, lit windows): its colour times how lit. */
  readonly em: WebGLTexture;
  private readonly fbo: WebGLFramebuffer;
  private tw = 0;
  private th = 0;
  /** The patch of ground the map covers: x, y, width, height (art px). */
  readonly box = new Float32Array(4);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = texture(gl, gl.NEAREST);
    this.col = texture(gl, gl.LINEAR);
    this.em = texture(gl, gl.NEAREST);
    this.fbo = gl.createFramebuffer();
  }

  /**
   * Lay the map over what `v` shows and a margin, cleared, bound to be drawn into with the
   * blend that keeps the highest of each channel. Call `end` after.
   */
  begin(v: StackView): void {
    const gl = this.gl;
    const top = v.top ?? 0;
    const up = ((60 + top) * v.zk) / v.scale / v.ys;
    // (it moves in steps of `SNAP`, so the traced light's probes stand still on the ground)
    const x0 = Math.floor((-v.ox / v.scale - 24) / SNAP) * SNAP;
    const y0 = Math.floor((-v.oy / (v.scale * v.ys) - 24) / SNAP) * SNAP;
    const x1 = (v.w - v.ox) / v.scale + 24;
    const y1 = (v.h - v.oy) / (v.scale * v.ys) + 24 + up;
    const w = Math.ceil((x1 - x0) / 64) * 64;
    const h = Math.ceil((y1 - y0) / 64) * 64;
    if (w > this.tw || h > this.th) {
      this.tw = Math.max(w, this.tw);
      this.th = Math.max(h, this.th);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, this.tw, this.th, 0, gl.RG, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.col);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        this.tw,
        this.th,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.col, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.em);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        this.tw,
        this.th,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, this.em, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    }
    this.box[0] = x0;
    this.box[1] = y0;
    this.box[2] = this.tw;
    this.box[3] = this.th;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.tw, this.th);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  /** Back to the frame itself (`target`: where it is being drawn; null for the canvas). */
  end(target: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl;
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
  }

  /** Bind the map to texture unit `unit` and give a shader what it needs to read it. */
  bind(unit: number, sampler: WebGLUniformLocation | null, box: WebGLUniformLocation | null): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(sampler, unit);
    gl.uniform4fv(box, this.box);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Bind the colours to texture unit `unit`. */
  bindColour(unit: number, sampler: WebGLUniformLocation | null): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.col);
    gl.uniform1i(sampler, unit);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** The map's size in texels (one to the art px). */
  get size(): readonly [number, number] {
    return [this.tw, this.th];
  }

  dispose(): void {
    this.gl.deleteTexture(this.em);
    this.gl.deleteTexture(this.col);
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fbo);
  }
}
