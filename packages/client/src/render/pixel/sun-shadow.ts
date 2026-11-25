import { compile, texture, uniforms } from './gl';
import { GROUND_VS } from './stack-shaders';
import { RELIEF_GLSL, type ReliefLayer } from './relief-layer';
import type { StackView } from './stack-batch';
import { SUN_BIAS, SUN_GLSL, SUN_TOP } from './sun-glsl';

export { SUN_BIAS, SUN_GLSL, SUN_TOP };

/** How dark a cast shadow is on the ground. */
const DARK = 0.6;
/** The tallest thing whose shadow is sure to be whole when it stands at the edge of the view. */
const REACH = 130;

/**
 * The sun's own view of the frame: one shadow map every slice is drawn into, read back by the
 * ground and by every slice, so everything throws a shadow of its own shape on everything else,
 * moving things included (a car's shadow turns with it, lies across a kerb and up a wall, and a
 * car under a tree is in the tree's shade).
 *
 * The map is laid out on the ground. The sun's rays are parallel, so a point `h` above the
 * ground is in the same ray as the spot of ground `h * shear` further on: that spot is where
 * the point goes in the map, and what is kept there is the height of the highest thing in that
 * ray. A point is in shade when the map holds something higher than itself. The heights are a
 * depth buffer (the highest wins, 24 bits), so the pass is depth only and what is hidden from
 * the sun is turned away before it is shaded.
 *
 * It covers the view and a margin, `density` texels to the art pixel, and moves in whole texels
 * so shadows do not crawl as the camera does.
 */
export class SunShadow {
  /** The map (a depth texture: 1 at flat ground, less the higher something stands). */
  readonly tex: WebGLTexture;
  private readonly fbo: WebGLFramebuffer;
  private tw = 0;
  private th = 0;
  /** The patch of ground the map covers: x, y, width, height (art px). */
  readonly box = new Float32Array(4);
  /** Ground px a shadow reaches per px of height, east and south; and `SUN_TOP`. */
  readonly shear = new Float32Array([0, 0, SUN_TOP]);
  /** Texels to the art pixel. */
  density = 2;
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private readonly vao: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = texture(gl, gl.NEAREST);
    this.fbo = gl.createFramebuffer();
    this.vao = gl.createVertexArray();
  }

  /**
   * Lay the map over what `v` shows, for a sun that throws shadows `sx`, `sy` ground px per px
   * of height, and bind it to be drawn into (depth cleared, depth test on). Call `end` after.
   */
  begin(v: StackView, sx: number, sy: number): void {
    const gl = this.gl;
    const k = this.density;
    this.shear[0] = sx;
    this.shear[1] = sy;
    // the ground on screen, and as far beyond it as something tall at its edge is thrown; what
    // stands high on screen stands on ground further south than the ground drawn there
    const top = v.top ?? 0;
    const up = ((REACH + top) * v.zk) / v.scale / v.ys;
    const x0 = Math.floor((-v.ox / v.scale - 8) * k) / k;
    const y0 = Math.floor((-v.oy / (v.scale * v.ys) - 8) * k) / k;
    const x1 = (v.w - v.ox) / v.scale + 8 + Math.max(0, sx) * (REACH + top);
    const y1 = (v.h - v.oy) / (v.scale * v.ys) + 8 + up + Math.max(0, sy) * (REACH + top);
    const w = Math.ceil(((x1 - x0) * k) / 64) * 64;
    const h = Math.ceil(((y1 - y0) * k) / 64) * 64;
    if (w > this.tw || h > this.th) {
      this.tw = Math.max(w, this.tw);
      this.th = Math.max(h, this.th);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        this.tw,
        this.th,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.tex, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
    }
    this.box[0] = x0;
    this.box[1] = y0;
    this.box[2] = this.tw / k;
    this.box[3] = this.th / k;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.tw, this.th);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
  }

  /** Back to the frame itself (`target`: where it is being drawn; null for the canvas). */
  end(target: WebGLFramebuffer | null, w: number, h: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
  }

  /** Bind the map to texture unit `unit` and give a shader what it needs to read it. */
  bind(
    unit: number,
    sampler: WebGLUniformLocation | null,
    box: WebGLUniformLocation | null,
    shear: WebGLUniformLocation | null,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(sampler, unit);
    gl.uniform4fv(box, this.box);
    gl.uniform3fv(shear, this.shear);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * The shadows on the ground, over the ground already drawn: blending must be on
   * (premultiplied). `fine` is the ground's grid (cells to the art px), `size` the world's.
   */
  drawGround(
    v: StackView,
    relief: ReliefLayer,
    size: readonly [number, number],
    fine: number,
    strength: number,
  ): void {
    const gl = this.gl;
    if (!this.prog) {
      this.prog = compile(gl, GROUND_VS, sunGroundFs(!!relief.map));
      this.u = uniforms(gl, this.prog, [
        'u_view',
        'u_origin',
        'u_scale',
        'u_ys',
        'u_size',
        'u_fine',
        'u_alpha',
        'u_map',
        'u_sh',
        'u_shbox',
        'u_shear',
        'u_relief',
        'u_rgrid',
        'u_rface',
      ]);
      this.reliefMap = !!relief.map;
    } else if (this.reliefMap !== !!relief.map) {
      gl.deleteProgram(this.prog);
      this.prog = null;
      this.drawGround(v, relief, size, fine, strength);
      return;
    }
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view!, v.w, v.h);
    gl.uniform2f(u.u_origin!, v.ox, v.oy);
    gl.uniform1f(u.u_scale!, v.scale);
    gl.uniform1f(u.u_ys!, v.ys);
    gl.uniform2f(u.u_size!, size[0], size[1]);
    gl.uniform1f(u.u_fine!, fine);
    gl.uniform1f(u.u_alpha!, DARK * strength);
    if (relief.map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, relief.map);
      gl.uniform1i(u.u_map!, 1);
    }
    relief.bind(2, u.u_relief!, u.u_rgrid!, u.u_rface!);
    this.bind(3, u.u_sh!, u.u_shbox!, u.u_shear!);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  private reliefMap = false;

  dispose(): void {
    const gl = this.gl;
    gl.deleteTexture(this.tex);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteVertexArray(this.vao);
    if (this.prog) gl.deleteProgram(this.prog);
  }
}

/**
 * The ground's share of the sun's shadows, on the ground's own fine grid. Four texels of the map
 * round the cell say how much of it is covered; a part covered cell is dithered on the Bayer
 * grid, so a shadow's edge steps in fine cells and is never a blur.
 */
const sunGroundFs = (relief: boolean): string => `#version 300 es
${relief ? '#define RELIEF' : ''}
precision highp float;
in vec2 v_uv;
uniform vec2 u_size;
uniform float u_alpha;
uniform float u_fine;
#ifdef RELIEF
uniform sampler2D u_map;
#endif
${RELIEF_GLSL}
${SUN_GLSL}
out vec4 o;
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
void main() {
  vec2 cell = floor(v_uv * u_size * u_fine);
  vec2 at = (cell + 0.5) / u_fine;
#ifdef RELIEF
  // a shadow lies on the ground, so it is found where the ground under this cell is
  at.y += floor(texelFetch(u_map, ivec2(clamp(floor(at), vec2(0.0), u_size - 1.0)), 0).r * 255.0 + 0.5);
#endif
  float g = groundAt(at);
  vec2 ts = vec2(textureSize(u_sh, 0));
  vec2 p = (at + g * u_shear.xy - u_shbox.xy) / u_shbox.zw * ts - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  if (i.x < 0.0 || i.y < 0.0 || i.x > ts.x - 2.0 || i.y > ts.y - 2.0) discard;
  float lim = g + ${SUN_BIAS.toFixed(1)};
  ivec2 t = ivec2(i);
  float a = step(lim, (1.0 - texelFetch(u_sh, t, 0).r) * u_shear.z);
  float b = step(lim, (1.0 - texelFetch(u_sh, t + ivec2(1, 0), 0).r) * u_shear.z);
  float c = step(lim, (1.0 - texelFetch(u_sh, t + ivec2(0, 1), 0).r) * u_shear.z);
  float d = step(lim, (1.0 - texelFetch(u_sh, t + ivec2(1, 1), 0).r) * u_shear.z);
  float cov = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  if (cov < 0.04 || cov < bayer(ivec2(cell))) discard;
  // shade is the sky's light without the sun's: a little blue
  o = vec4(vec3(0.0, 0.01, 0.05) * u_alpha, u_alpha);
}`;
