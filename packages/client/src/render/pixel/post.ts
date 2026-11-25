import { compile, texture, uniforms } from './gl';

export const MAX_RIPPLES = 8;

const VS = `#version 300 es
void main() {
  int id = gl_VertexID % 3;
  gl_Position = vec4(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;

/**
 * The shockwave lens, from mudders' post pass (POST_FS in its render/pixel/shaders.ts): pixels are
 * pushed by a moving lens band, evaluated per cell and displaced by whole cells, so the picture
 * bulges and slides as the ring passes and still stays on the pixel grid. No light is added.
 * Ripples: xy = centre (device px, y down), z = radius, w = strength; band widths in u_rippleW.
 *
 * The one change from mudders: the ring lies on the ground, which this camera looks down on at an
 * angle, so distances up the screen are stretched by 1 / u_ys before the band is worked out and
 * the push is squashed back by u_ys. The band is a circle on the ground, an ellipse on screen.
 */
export const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_view;
uniform int u_rippleCount;
uniform vec4 u_ripple[${MAX_RIPPLES}];
uniform float u_rippleW[${MAX_RIPPLES}];
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_ys;
uniform float u_blur;  // soft focus towards the top and bottom edges, device px at the edge; 0: none
out vec4 o;
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
  // evaluate the wave per cell so the ripple reads as pixels, like everything else
  vec2 cellPx = u_origin + (floor((px - u_origin) / u_scale) + 0.5) * u_scale;
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= u_rippleCount) break;
    vec4 r = u_ripple[i];
    vec2 d = cellPx - r.xy;
    d.y /= u_ys;
    float dist = length(d);
    float w = u_rippleW[i];
    // a lens band (inner and outer edges eased in) that pulls the image toward the centre, so
    // ground and scenery visibly bulge and slide as the ring passes; no added light
    float band = smoothstep(r.z - w, r.z - w * 0.4, dist) * (1.0 - smoothstep(r.z - w * 0.2, r.z, dist));
    vec2 push = (d / max(dist, 0.001)) * band * r.w * w * 0.9;
    push.y *= u_ys;
    disp += push;
  }
  // displace by whole cells so the refraction stays on the pixel grid
  disp = floor(disp / u_scale + 0.5) * u_scale;
  vec2 uv = (px - disp) / u_view;
  uv.y = 1.0 - uv.y;
  vec3 c = texture(u_scene, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  if (u_blur > 0.0) {
    // a miniature seen close: sharp across the middle, softer the nearer the top or the bottom
    float e = abs(px.y / u_view.y - 0.5) * 2.0;
    float k = smoothstep(0.58, 1.0, e) * u_blur;
    if (k > 0.35) {
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + 0.39;
        vec2 d = vec2(cos(a), sin(a)) * k * (i % 2 == 0 ? 1.0 : 0.55) / u_view;
        c += texture(u_scene, clamp(uv + d, vec2(0.0), vec2(1.0))).rgb;
      }
      c /= 9.0;
    }
  }
  o = vec4(c, 1.0);
}`;

/** One ring for the pass, in device pixels. */
export interface Lens {
  x: number;
  y: number;
  r: number;
  width: number;
  strength: number;
}

/**
 * The post pass. Most frames draw straight to the canvas and never touch this; while a shockwave
 * is on screen the frame is drawn into a texture instead (`begin`) and put on the canvas through
 * the lens (`end`).
 */
export class LensPass {
  private readonly prog: WebGLProgram;
  private readonly u;
  private readonly fbo: WebGLFramebuffer;
  private readonly scene: WebGLTexture;
  private readonly depth: WebGLRenderbuffer;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf = new Float32Array(MAX_RIPPLES * 4);
  private readonly widths = new Float32Array(MAX_RIPPLES);
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, POST_FS);
    this.u = uniforms(gl, this.prog, [
      'u_scene',
      'u_view',
      'u_rippleCount',
      'u_ripple',
      'u_rippleW',
      'u_origin',
      'u_scale',
      'u_ys',
      'u_blur',
    ]);
    this.fbo = gl.createFramebuffer();
    this.scene = texture(gl, gl.LINEAR);
    this.depth = gl.createRenderbuffer();
    this.vao = gl.createVertexArray();
  }

  /** Draw what follows into the scene texture (W by H device px). */
  begin(W: number, H: number): void {
    const gl = this.gl;
    if (W !== this.w || H !== this.h) {
      this.w = W;
      this.h = H;
      gl.bindTexture(gl.TEXTURE_2D, this.scene);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scene, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
  }

  /**
   * Put the scene on the canvas through the lens rings. `origin` and `cell` give the grid the
   * push snaps to (device px), `ys` how much the ground is squashed up the screen.
   */
  end(
    lenses: readonly Lens[],
    origin: readonly [number, number],
    cell: number,
    ys: number,
    blur = 0,
  ): void {
    const gl = this.gl;
    const n = Math.min(MAX_RIPPLES, lenses.length);
    for (let i = 0; i < n; i++) {
      const l = lenses[i]!;
      this.buf[i * 4] = l.x;
      this.buf[i * 4 + 1] = l.y;
      this.buf[i * 4 + 2] = l.r;
      this.buf[i * 4 + 3] = l.strength;
      this.widths[i] = l.width;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.uniform1i(this.u.u_scene, 0);
    gl.uniform2f(this.u.u_view, this.w, this.h);
    gl.uniform2f(this.u.u_origin, origin[0], origin[1]);
    gl.uniform1f(this.u.u_scale, cell);
    gl.uniform1f(this.u.u_ys, ys);
    gl.uniform1f(this.u.u_blur, blur);
    gl.uniform1i(this.u.u_rippleCount, n);
    gl.uniform4fv(this.u.u_ripple, this.buf);
    gl.uniform1fv(this.u.u_rippleW, this.widths);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

/**
 * Where a ripple is at `k` (0 to 1) through its life, as mudders runs them: the radius eases out
 * (fast at first), the strength fades to nothing and the band widens a little as it goes.
 */
export function rippleAt(
  k: number,
  maxR: number,
  width: number,
  strength: number,
): { r: number; width: number; strength: number } {
  return { r: maxR * Math.sqrt(k), width: width * (0.7 + 0.6 * k), strength: strength * (1 - k) };
}
