import { compile, type Sources, uniforms } from './gl';
import type { Lights } from './lighting';

/** Lights the tint pass can show at once: the frame's fires and flashes. */
export const MAX_DUSK = 14;

const VS = `#version 300 es
void main() {
  int id = gl_VertexID % 3;
  gl_Position = vec4(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0, 0.0, 1.0);
}`;

/**
 * A world modifier's colour as one pass over the picture: every pixel is multiplied by the
 * ambient colour (yellow in blown dust, warm in a dry spell) plus whatever light falls on the
 * ground under it from a fire, a blast or a pickup. Night itself is the sky's (`Atmosphere`).
 * The light is worked out per cell, a third of an art pixel across, and stepped in hard
 * dithered bands like the rest of the lighting, so the edge of a beam is pixels, not a blur.
 *
 * Drawn with multiply blending after the world and its smoke, before fire and glow, so flames,
 * sparks and bolts stay bright against the dark.
 */
const FS = `#version 300 es
precision highp float;
uniform vec2 u_view;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_ys;
uniform vec3 u_ambient;
uniform int u_count;
uniform vec4 u_pos[${MAX_DUSK}];  // x, y (art px on the ground), radius, strength
uniform vec4 u_dir[${MAX_DUSK}];  // unit direction, cos of the half cone (2: all round), near pool radius
uniform vec3 u_col[${MAX_DUSK}];
out vec4 o;
float bayer(ivec2 p) {
  int i = (p.y & 3) * 4 + (p.x & 3);
  int t[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(t[i]) + 0.5) / 16.0;
}
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_view.y - gl_FragCoord.y);
  float cs = u_scale / 3.0;
  vec2 cell = floor((px - u_origin) / cs);
  vec2 g = (cell + 0.5) * cs / u_scale;
  g.y /= u_ys;
  vec3 l = vec3(0.0);
  for (int i = 0; i < ${MAX_DUSK}; i++) {
    if (i >= u_count) break;
    vec4 p = u_pos[i];
    vec2 d = g - p.xy;
    float dist = length(d);
    if (dist >= p.z) continue;
    float f = 1.0 - dist / p.z;
    vec4 D = u_dir[i];
    if (D.z < 1.5) {
      float c = dot(d, D.xy) / max(dist, 0.001);
      float cone = smoothstep(D.z, D.z + 0.16, c);
      float near = clamp(1.0 - dist / D.w, 0.0, 1.0);
      f = max(sqrt(f) * cone, near);
    }
    l += u_col[i] * f * p.w;
  }
  l = floor(l * 5.0 + bayer(ivec2(cell))) / 5.0;
  o = vec4(min(u_ambient + l, vec3(1.0)), 1.0);
}`;

export interface DuskView {
  w: number;
  h: number;
  ox: number;
  oy: number;
  scale: number;
  ys: number;
}

export class DuskPass {
  private readonly prog: WebGLProgram;
  private readonly u;
  private readonly vao: WebGLVertexArrayObject;
  private readonly pos = new Float32Array(MAX_DUSK * 4);
  private readonly dir = new Float32Array(MAX_DUSK * 4);
  private readonly col = new Float32Array(MAX_DUSK * 3);
  private n = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.u = uniforms(gl, this.prog, [
      'u_view',
      'u_origin',
      'u_scale',
      'u_ys',
      'u_ambient',
      'u_count',
      'u_pos',
      'u_dir',
      'u_col',
    ]);
    this.vao = gl.createVertexArray();
  }

  clear(): void {
    this.n = 0;
  }

  private add(x: number, y: number, r: number, k: number, rgb: readonly number[]): number {
    const i = this.n;
    if (i >= MAX_DUSK) return -1;
    this.n++;
    this.pos.set([x, y, r, k], i * 4);
    this.dir.set([0, 0, 2, 0], i * 4);
    this.col.set(rgb, i * 3);
    return i;
  }

  /** The frame's own lights (fires, blasts, rockets, pickups), as far as there is room. */
  take(L: Lights): void {
    for (let i = 0; i < L.count; i++)
      this.add(
        L.pos[i * 4]!,
        L.pos[i * 4 + 1]!,
        L.pos[i * 4 + 2]! * 1.5,
        Math.min(1.4, L.pos[i * 4 + 3]!),
        [L.col[i * 3]!, L.col[i * 3 + 1]!, L.col[i * 3 + 2]!],
      );
  }

  /** Multiply what has been drawn so far by the ambient colour plus the lights. */
  draw(v: DuskView, ambient: readonly [number, number, number]): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.u_view, v.w, v.h);
    gl.uniform2f(this.u.u_origin, v.ox, v.oy);
    gl.uniform1f(this.u.u_scale, v.scale);
    gl.uniform1f(this.u.u_ys, v.ys);
    gl.uniform3f(this.u.u_ambient, ambient[0], ambient[1], ambient[2]);
    gl.uniform1i(this.u.u_count, this.n);
    gl.uniform4fv(this.u.u_pos, this.pos);
    gl.uniform4fv(this.u.u_dir, this.dir);
    gl.uniform3fv(this.u.u_col, this.col);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}

/** Every program this file draws with, to start building before any is needed (`prelink`). */
export const DUSK_PROGRAMS: readonly Sources[] = [[VS, FS]];
