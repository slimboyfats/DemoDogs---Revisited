import { fineGrid } from '../strips';
import type { Ground } from '../ground';
import { compile, texture, uniforms, type Sources } from './gl';
import { groundFs, GROUND_VS } from './stack-shaders';
import { PAINT_UNIFORMS, paintGlsl } from './ground-paint-glsl';
import type { ReliefLayer } from './relief-layer';
import type { LightBlock } from './light-block';
import type { TracedLight } from './traced-light';
import type { Lights } from './lighting';
import { depthRange, type StackView } from './stack-batch';

/** The sources of the program a ground is painted with (raised: through a picture-to-ground map). */
export function groundSources(ground: Ground, raised: boolean): Sources {
  const P = ground.paint;
  return [GROUND_VS, groundFs(raised, P ? paintGlsl(P) : '')];
}

/**
 * The ground canvas as a texture, drawn as one quad behind everything. Marks painted onto the
 * canvas during the race (skids, scorches, splats) are copied up as one small box per frame, the
 * way mudders uploads only the changed box of its maps.
 */
export class GroundLayer {
  private readonly tex: WebGLTexture;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly u;
  /** The textures a ground the shader paints itself is painted from: noise, nearest, samples, far. */
  private readonly paintTex: WebGLTexture[] = [];
  private waterTex: WebGLTexture | null = null;
  private poolTex: WebGLTexture | null = null;
  /** The water's clock, s: the page's own, wrapped so the shader's sums stay small. */
  waterTime = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ground: Ground,
    /** The venue's raised ground: with it the ground is drawn where it stands, and writes depth. */
    private readonly relief: ReliefLayer | null = null,
  ) {
    // read texel by texel (texelFetch): the shader dithers between texels, never blends them
    // (a ground the shader paints holds only marks: those are read between texels, their colour
    // already times their cover so a mark's soft edge does not go dark)
    const P = ground.paint;
    this.tex = texture(gl, P ? gl.LINEAR : gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!P);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ground.cv);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    ground.dirty = null;
    if (P) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      const F = P.fields;
      this.paintTex.push(texture(gl, gl.LINEAR));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, F.gw, F.gh, 0, gl.RGBA, gl.FLOAT, F.data);
      const L = P.line;
      this.paintTex.push(texture(gl, gl.NEAREST));
      if (L)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RG16UI,
          L.near.gw,
          L.near.gh,
          0,
          gl.RG_INTEGER,
          gl.UNSIGNED_SHORT,
          L.near.data,
        );
      else
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RG16UI,
          1,
          1,
          0,
          gl.RG_INTEGER,
          gl.UNSIGNED_SHORT,
          new Uint16Array([0xffff, 0xffff]),
        );
      this.paintTex.push(texture(gl, gl.NEAREST));
      if (L) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, L.n, 3, 0, gl.RGBA, gl.FLOAT, L.samples);
      else
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          1,
          1,
          0,
          gl.RGBA,
          gl.FLOAT,
          new Float32Array(4),
        );
      this.paintTex.push(texture(gl, gl.LINEAR));
      if (L)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R16F,
          L.wild.gw,
          L.wild.gh,
          0,
          gl.RED,
          gl.FLOAT,
          L.wild.data,
        );
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array(1));
      // the ways off the road: which sample each block is nearest, and the samples
      const Y = P.ways;
      if (Y) {
        this.paintTex.push(texture(gl, gl.NEAREST));
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R16UI,
          Y.near.gw,
          Y.near.gh,
          0,
          gl.RED_INTEGER,
          gl.UNSIGNED_SHORT,
          Y.near.data,
        );
        this.paintTex.push(texture(gl, gl.NEAREST));
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, Y.n, 2, 0, gl.RGBA, gl.FLOAT, Y.samples);
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    }
    // the water: read between its texels, so a shore is a smooth line
    for (const [M, pools] of [
      [ground.water, false],
      [ground.pools, true],
    ] as const) {
      if (!M) continue;
      const t = texture(gl, gl.LINEAR);
      M.settle();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, M.gw, M.gh, 0, gl.RGBA, gl.UNSIGNED_BYTE, M.data);
      M.dirty = null;
      if (pools) this.poolTex = t;
      else this.waterTex = t;
    }
    this.prog = compile(gl, ...groundSources(ground, !!relief?.map));
    this.u = uniforms(gl, this.prog, [
      ...PAINT_UNIFORMS,
      'u_view',
      'u_origin',
      'u_scale',
      'u_ys',
      'u_size',
      'u_tex',
      'u_fine',
      'u_lcount',
      'u_lpos',
      'u_lcol',
      'u_amb',
      'u_snow',
      'u_wet',
      'u_cone',
      'u_ccount',
      'u_coneh',
      'u_lgz',
      'u_map',
      'u_depth',
      'u_hk',
      'u_lm',
      'u_lmbox',
      'u_lmk',
      'u_lc',
      'u_bounce',
      'u_gi',
      'u_gik',
    ]);
    this.vao = gl.createVertexArray();
  }

  /** Copy up whatever was painted since the last frame. */
  sync(): void {
    for (const [M, tex] of [
      [this.ground.water, this.waterTex],
      [this.ground.pools, this.poolTex],
    ] as const) {
      M?.settle();
      if (!M?.dirty || !tex) continue;
      // water that was poured or has spread: the rows of its box, whole
      const gl = this.gl;
      const [x0, y0, x1, y1] = M.dirty;
      M.dirty = null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, M.gw);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        x0,
        y0,
        x1 - x0,
        y1 - y0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        M.data,
        (y0 * M.gw + x0) * 4,
      );
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    }
    const D = this.ground.dirty;
    if (!D) return;
    this.ground.dirty = null;
    const W = this.ground.cv.width;
    const H = this.ground.cv.height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!this.ground.paint);
    for (const d of D) {
      const x0 = Math.max(0, d[0]);
      const y0 = Math.max(0, d[1]);
      const x1 = Math.min(W, d[2]);
      const y1 = Math.min(H, d[3]);
      if (x1 <= x0 || y1 <= y0) continue;
      const img = this.ground.g.getImageData(x0, y0, x1 - x0, y1 - y0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  draw(
    v: StackView,
    lights: Lights,
    sky?: { ground: Float32Array; snow: number; wet: number },
    block?: LightBlock | null,
    bounce?: readonly [number, number, number],
    /** The frame's traced light (needs `block`), and whether to show the field itself. */
    traced?: TracedLight | null,
    show = false,
  ): void {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view, v.w, v.h);
    gl.uniform2f(u.u_origin, v.ox, v.oy);
    gl.uniform1f(u.u_scale, v.scale);
    gl.uniform1f(u.u_ys, v.ys);
    gl.uniform1f(u.u_fine, fineGrid(v.scale));
    gl.uniform1i(u.u_lcount, lights.count);
    gl.uniform4fv(u.u_lpos, lights.pos);
    gl.uniform3fv(u.u_lcol, lights.col);
    gl.uniform4fv(u.u_cone, lights.cones);
    gl.uniform1i(u.u_ccount, lights.coneCount);
    gl.uniform4fv(u.u_coneh, lights.coneh);
    gl.uniform1fv(u.u_lgz, lights.gz);
    if (sky) gl.uniform3fv(u.u_amb, sky.ground);
    else gl.uniform3f(u.u_amb, 1, 1, 1);
    gl.uniform1f(u.u_snow, sky?.snow ?? 0);
    gl.uniform1f(u.u_wet, sky?.wet ?? 0);
    gl.uniform2f(u.u_size, this.ground.cv.width, this.ground.cv.height);
    // what stands in the lights' way (a sampler must have a texture behind it either way)
    gl.uniform1f(u.u_lmk, block ? 1 : 0);
    gl.uniform3f(u.u_bounce, bounce?.[0] ?? 0, bounce?.[1] ?? 0, block ? (bounce?.[2] ?? 0) : 0);
    if (block) {
      block.bind(4, u.u_lm, u.u_lmbox);
      block.bindColour(5, u.u_lc);
    } else {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(u.u_lm, 4);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(u.u_lc, 5);
    }
    const gi = block ? traced : null;
    gl.uniform1f(u.u_gik, gi ? (show ? 2 : 1) : 0);
    if (gi) gi.bind(6, u.u_gi);
    else {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.uniform1i(u.u_gi, 6);
    }
    const P = this.ground.paint;
    if (P) {
      const names = ['u_pf', 'u_pn', 'u_ps', 'u_pw', 'u_wn', 'u_ws'] as const;
      if (P.ways) gl.uniform1f(u.u_wayN, P.ways.n);
      for (let k = 0; k < this.paintTex.length; k++) {
        gl.activeTexture(gl.TEXTURE7 + k);
        gl.bindTexture(gl.TEXTURE_2D, this.paintTex[k]!);
        gl.uniform1i(u[names[k]!], 7 + k);
      }
      gl.uniform2f(u.u_pfSize, P.fields.gw, P.fields.gh);
      gl.uniform1i(u.u_seed, P.seed | 0);
      gl.uniform3fv(u.u_cG, P.ground);
      gl.uniform3fv(u.u_cG2, P.ground2);
      gl.uniform3fv(u.u_cD, P.dirt);
      gl.uniform3fv(u.u_cOut, P.outside);
      gl.uniform1f(u.u_road, P.road);
      const L = P.line;
      if (L) {
        gl.uniform2f(u.u_pwSize, L.wild.gw, L.wild.gh);
        gl.uniform4f(u.u_line, L.n, L.step, L.apron[0], L.apron[1]);
        gl.uniform2f(u.u_wild, L.wildFrom, L.wildTo);
      }
      if (P.oval) gl.uniform4f(u.u_oval, P.oval.cx, P.oval.cy, P.oval.rx, P.oval.ry);
      const M = this.ground.water;
      gl.activeTexture(gl.TEXTURE13);
      gl.bindTexture(gl.TEXTURE_2D, this.waterTex ?? this.tex);
      gl.uniform1i(u.u_wm, 13);
      gl.uniform2f(u.u_wmSize, M?.gw ?? 1, M?.gh ?? 1);
      gl.uniform2f(u.u_wt, this.waterTime, M?.any ? 1 : 0);
      const Q = this.ground.pools;
      gl.activeTexture(gl.TEXTURE14);
      gl.bindTexture(gl.TEXTURE_2D, this.poolTex ?? this.tex);
      gl.uniform1i(u.u_pm, 14);
      gl.uniform3f(u.u_pmSize, Q?.gw ?? 1, Q?.gh ?? 1, Q?.any ? 1 : 0);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u.u_tex, 0);
    const map = this.relief?.map;
    if (map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, map);
      gl.uniform1i(u.u_map, 1);
      gl.activeTexture(gl.TEXTURE0);
      const dir0 = v.zk / v.scale;
      const [lo, hi] = depthRange(v);
      gl.uniform4f(u.u_depth, dir0, v.ys, lo, 1 / (hi - lo));
      gl.uniform1f(u.u_hk, v.ys / dir0);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
    for (const t of this.paintTex) this.gl.deleteTexture(t);
    this.gl.deleteTexture(this.waterTex);
    this.gl.deleteTexture(this.poolTex);
    this.gl.deleteVertexArray(this.vao);
  }
}
