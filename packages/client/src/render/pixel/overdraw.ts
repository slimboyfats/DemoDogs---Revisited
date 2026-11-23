import { compile, uniforms } from './gl';

/**
 * The overdraw meter, after the count pass of loktar00's sprite-stack-engine (MIT): the frame's
 * slices and particles are drawn again into an off-screen float target with additive blending,
 * each fragment adding one, so every pixel holds how many fragments landed on it. Read back, that
 * gives exact fragments per pixel; drawn through a colour ramp, the heat map.
 *
 * Eight counts, in two targets of four channels:
 *
 * - **covered**: every fragment the slice quads cover, nothing discarded (the rasteriser's load).
 * - **solid**: fragments that are a filled texel (what runs the whole shader and survives `discard`).
 * - **written**: fragments that pass the depth test in the order the slices are drawn (nearest first
 *   by default; `?order=queued` draws them as queued, bottom slice first, to compare).
 * - **front**: the same, with the slices in an exact nearest-first sort (the reference).
 * - **shell solid / shell written / shell front**: the three above with the atlas's interiors left
 *   out (shell stacks, see shell.ts).
 * - **particles**: fire, smoke, sparks and shadows' blended fragments (all of them are written).
 *
 * And **visible**: the share of the screen any slice covers, the floor for "written".
 * The ground (one full-screen quad) is not counted: it is one fragment on every pixel.
 */
export const CHANNELS = [
  'covered',
  'solid',
  'written',
  'front',
  'shellSolid',
  'shellWritten',
  'shellFront',
  'particles',
] as const;
export type Channel = (typeof CHANNELS)[number];

export interface OverdrawStats {
  /** Pixels measured (the drawing buffer). */
  w: number;
  h: number;
  /** Average fragments per screen pixel, per count. */
  avg: Record<Channel, number>;
  /** The worst pixel, per count. */
  max: Record<Channel, number>;
  /** Share of the screen (0 to 1) that some slice covers with a filled texel. */
  visible: number;
  /** Counts were 8-bit and stopped at 255 (no float targets on this device). */
  capped: boolean;
  /** Slices (instances) drawn. */
  slices: number;
}

const VS = `#version 300 es
void main() {
  int id = gl_VertexID % 3;
  gl_Position = vec4(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;

/** The heat map: a count through a ramp (0 clear; 1 blue; 2 green; 4 yellow; 8 orange; 16 red; 32+ white). */
const HEAT_FS = `#version 300 es
precision highp float;
uniform highp sampler2D u_tex;
uniform vec4 u_pick;
uniform float u_scale;
out vec4 o;
void main() {
  float n = dot(texelFetch(u_tex, ivec2(gl_FragCoord.xy), 0), u_pick) * u_scale;
  if (n < 0.5) { o = vec4(0.0, 0.0, 0.0, 0.55); return; }
  float t = log2(n);
  vec3 c;
  if (t < 1.0) c = mix(vec3(0.1, 0.25, 0.9), vec3(0.1, 0.8, 0.3), t);
  else if (t < 2.0) c = mix(vec3(0.1, 0.8, 0.3), vec3(0.95, 0.9, 0.1), t - 1.0);
  else if (t < 3.0) c = mix(vec3(0.95, 0.9, 0.1), vec3(1.0, 0.5, 0.05), t - 2.0);
  else if (t < 4.0) c = mix(vec3(1.0, 0.5, 0.05), vec3(0.9, 0.05, 0.05), t - 3.0);
  else c = mix(vec3(0.9, 0.05, 0.05), vec3(1.0), clamp(t - 4.0, 0.0, 1.0));
  o = vec4(c * 0.9, 0.9);
}`;

/** Everything the meter needs to draw a frame's counts; PixelScene supplies it. */
export interface CountSource {
  /** Draw the frame's slices with a counting shader (blending and depth are set by the meter). */
  slices(cover: boolean, shell: boolean, front: boolean, step: number): void;
  /** Draw the frame's particles and shadows with a counting shader. */
  particles(step: number): void;
}

export class OverdrawMeter {
  private readonly fbo: [WebGLFramebuffer, WebGLFramebuffer];
  private readonly tex: [WebGLTexture, WebGLTexture];
  private readonly depth: WebGLRenderbuffer;
  private readonly float: boolean;
  private readonly heat: WebGLProgram;
  private readonly hu;
  private readonly vao: WebGLVertexArrayObject;
  private w = 0;
  private h = 0;
  private buf: Float32Array | Uint8Array = new Float32Array(0);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    this.fbo = [gl.createFramebuffer(), gl.createFramebuffer()];
    this.tex = [gl.createTexture(), gl.createTexture()];
    this.depth = gl.createRenderbuffer();
    this.heat = compile(gl, VS, HEAT_FS);
    this.hu = uniforms(gl, this.heat, ['u_tex', 'u_pick', 'u_scale']);
    this.vao = gl.createVertexArray();
  }

  /** One unit of count in the target. */
  private get step(): number {
    return this.float ? 1 : 1 / 255;
  }

  private size(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]!);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      if (this.float)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[i]!);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex[i]!, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.buf = this.float ? new Float32Array(w * h * 4) : new Uint8Array(w * h * 4);
  }

  /** Draw every count into the two targets. Leaves the screen bound again. */
  count(src: CountSource, w: number, h: number): void {
    const gl = this.gl;
    this.size(w, h);
    const step = this.step;
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthFunc(gl.LESS);
    const pass = (ch: number, depth: boolean, draw: () => void) => {
      gl.colorMask(ch === 0, ch === 1, ch === 2, ch === 3);
      if (depth) {
        gl.depthMask(true);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
      } else gl.disable(gl.DEPTH_TEST);
      draw();
    };
    for (let t = 0; t < 2; t++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[t]!);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const shell = t === 1;
      if (!shell) pass(0, false, () => src.slices(true, false, false, step));
      pass(shell ? 0 : 1, false, () => src.slices(false, shell, false, step));
      pass(shell ? 1 : 2, true, () => src.slices(false, shell, false, step));
      pass(shell ? 2 : 3, true, () => src.slices(false, shell, true, step));
      if (shell) pass(3, false, () => src.particles(step));
    }
    gl.colorMask(true, true, true, true);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Read the counts back (a GPU stall: once in a while, not every frame). */
  read(slices: number): OverdrawStats {
    const gl = this.gl;
    const n = this.w * this.h;
    const avg = {} as Record<Channel, number>;
    const max = {} as Record<Channel, number>;
    let visible = 0;
    for (let t = 0; t < 2; t++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[t]!);
      if (this.float)
        gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.FLOAT, this.buf as Float32Array);
      else gl.readPixels(0, 0, this.w, this.h, gl.RGBA, gl.UNSIGNED_BYTE, this.buf as Uint8Array);
      const b = this.buf;
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        let top = 0;
        for (let i = c; i < n * 4; i += 4) {
          const v = b[i]!;
          sum += v;
          if (v > top) top = v;
          if (t === 0 && c === 1 && v > 0) visible++;
        }
        const name = CHANNELS[t * 4 + c]!;
        avg[name] = sum / n;
        max[name] = top;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { w: this.w, h: this.h, avg, max, visible: visible / n, capped: !this.float, slices };
  }

  /** Lay the heat map of one count over the screen. */
  drawHeat(ch: Channel, w: number, h: number): void {
    const gl = this.gl;
    const i = CHANNELS.indexOf(ch);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.heat);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[i >> 2]!);
    gl.uniform1i(this.hu.u_tex, 0);
    const pick = [0, 0, 0, 0];
    pick[i & 3] = 1;
    gl.uniform4fv(this.hu.u_pick, pick);
    gl.uniform1f(this.hu.u_scale, this.float ? 1 : 255);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      gl.deleteFramebuffer(this.fbo[i]!);
      gl.deleteTexture(this.tex[i]!);
    }
    gl.deleteRenderbuffer(this.depth);
    gl.deleteProgram(this.heat);
    gl.deleteVertexArray(this.vao);
  }
}

/** One line for the read-out and the perf log: average fragments per pixel. */
export function overdrawLine(s: OverdrawStats): string {
  const a = s.avg;
  const f = (v: number) => v.toFixed(2);
  return (
    `covered ${f(a.covered)} solid ${f(a.solid)} written ${f(a.written)} front ${f(a.front)} ` +
    `floor ${f(s.visible)} | shell: solid ${f(a.shellSolid)} written ${f(a.shellWritten)} ` +
    `front ${f(a.shellFront)} | particles ${f(a.particles)}${s.capped ? ' (8-bit, capped)' : ''}`
  );
}
