import { compile, uniforms } from './gl';
import type { LightBlock } from './light-block';
import type { Lights } from './lighting';
import { MAX_CONES } from './lighting';
import type { ReliefLayer } from './relief-layer';
import type { StackView } from './stack-batch';
import { GROUND_VS, SKY_GLSL } from './stack-shaders';

/**
 * Light in the air: a headlamp's beam seen in the dust, the rain and the dark it shines through,
 * laid over the finished frame. It is the same beam the ground is lit by, walked through the same
 * map of what stands in its way, so a car or a tree in a beam cuts a dark shaft out of it. Drawn
 * on the ground's fine grid in dithered steps, added to the picture.
 */
export class BeamHaze {
  private prog: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private reliefMap = false;
  private readonly vao: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray();
  }

  /** Blending must be on and additive. `thick`: how much there is in the air to light, 0 to 1. */
  draw(
    v: StackView,
    lights: Lights,
    block: LightBlock | null,
    relief: ReliefLayer,
    size: readonly [number, number],
    fine: number,
    thick: number,
  ): void {
    if (lights.coneCount === 0 || thick <= 0.01) return;
    const gl = this.gl;
    if (this.prog && this.reliefMap !== !!relief.map) {
      gl.deleteProgram(this.prog);
      this.prog = null;
    }
    if (!this.prog) {
      this.reliefMap = !!relief.map;
      this.prog = compile(gl, GROUND_VS, hazeFs(this.reliefMap));
      this.u = uniforms(gl, this.prog, [
        'u_view',
        'u_origin',
        'u_scale',
        'u_ys',
        'u_size',
        'u_fine',
        'u_map',
        'u_cone',
        'u_ccount',
        'u_coneh',
        'u_hk',
        'u_lm',
        'u_lmbox',
        'u_lmk',
        'u_thick',
      ]);
    }
    const u = this.u;
    gl.useProgram(this.prog);
    gl.uniform2f(u.u_view!, v.w, v.h);
    gl.uniform2f(u.u_origin!, v.ox, v.oy);
    gl.uniform1f(u.u_scale!, v.scale);
    gl.uniform1f(u.u_ys!, v.ys);
    gl.uniform2f(u.u_size!, size[0], size[1]);
    gl.uniform1f(u.u_fine!, fine);
    gl.uniform1f(u.u_thick!, thick);
    gl.uniform4fv(u.u_cone!, lights.cones);
    gl.uniform1i(u.u_ccount!, lights.coneCount);
    gl.uniform4fv(u.u_coneh!, lights.coneh);
    gl.uniform1f(u.u_hk!, v.ys / (v.zk / v.scale));
    gl.uniform1f(u.u_lmk!, block ? 1 : 0);
    if (relief.map) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, relief.map);
      gl.uniform1i(u.u_map!, 1);
    }
    if (block) block.bind(4, u.u_lm!, u.u_lmbox!);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    if (this.prog) this.gl.deleteProgram(this.prog);
  }
}

const hazeFs = (relief: boolean): string => `#version 300 es
${relief ? '#define RELIEF' : ''}
precision highp float;
precision highp int;
in vec2 v_uv;
uniform vec2 u_size;
uniform float u_fine;
uniform float u_thick;
uniform float u_hk;   // height for one row of the map's shift
#ifdef RELIEF
uniform sampler2D u_map;
#endif
out vec4 o;${SKY_GLSL}
void main() {
  vec2 cell = floor(v_uv * u_size * u_fine);
  vec2 at = (cell + 0.5) / u_fine;
#ifdef RELIEF
  at.y += floor(texelFetch(u_map, ivec2(clamp(floor(at), vec2(0.0), u_size - 1.0)), 0).r * 255.0 + 0.5);
#endif
  float b = bayer(ivec2(cell));
  float haze = 0.0;
  // (how high this ground stands: a shaft does not carry on over a sheer edge)
  float gh = 0.0;
#ifdef RELIEF
  gh = floor(texelFetch(u_map, ivec2(clamp(floor((cell + 0.5) / u_fine), vec2(0.0), u_size - 1.0)), 0).r * 255.0 + 0.5) * u_hk;
#endif
  for (int n = 0; n < ${MAX_CONES}; n++) {
    if (n >= u_ccount) break;
    float f = beam(at, u_cone[n], u_coneh[n].w);
    if (f <= 0.0) continue;
    // (a lamp well off the ground, a car in the air, throws no shaft along it)
    float far = distance(at, u_cone[n].xy);
    f *= level(u_coneh[n].y + u_coneh[n].x + u_coneh[n].z * far, gh, far);
    // (the air at a lamp's own height: what stands taller than that cuts the shaft)
    haze += f * lightOpen(at, 4.0, u_cone[n].xy, 5.0, 4.0, b);
  }
  float e = floor(min(1.0, haze) * u_thick * 5.0 + b - 0.5) / 5.0;
  if (e <= 0.0) discard;
  o = vec4(vec3(1.0, 0.94, 0.78) * e * 0.5, 0.0);
}`;
