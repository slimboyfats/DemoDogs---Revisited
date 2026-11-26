// Copied from mudders: packages/client/src/render/pixel/gl.ts.
/** Small WebGL2 helpers. Everything here must run on SwiftShader (headless capture, §2d). */

/** A program's sources: vertex shader, fragment shader, and what it feeds back (if anything). */
export type Sources = readonly [vs: string, fs: string, feedback?: readonly string[]];

/** A program on its way: handed to the driver, its outcome not yet asked for. */
interface Kept {
  prog: WebGLProgram;
  shaders: WebGLShader[];
  srcs: readonly string[];
  checked: boolean;
}

const kept = new WeakMap<WebGL2RenderingContext, Map<string, Kept>>();

/** Hand a program's shaders to the driver and link it, without waiting to hear how it went. */
function start(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  feedback?: readonly string[],
): Kept {
  let map = kept.get(gl);
  if (!map) {
    kept.set(gl, (map = new Map()));
    // with this the browser builds shaders on threads of its own while the page carries on
    gl.getExtension('KHR_parallel_shader_compile');
  }
  const key = `${vs}\0${fs}\0${feedback?.join(',') ?? ''}`;
  let k = map.get(key);
  if (k) return k;
  const prog = gl.createProgram();
  const shaders: WebGLShader[] = [];
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const sh = gl.createShader(type);
    if (!sh) throw new Error('createShader failed');
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
    shaders.push(sh);
  }
  if (feedback) gl.transformFeedbackVaryings(prog, [...feedback], gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  map.set(key, (k = { prog, shaders, srcs: [vs, fs], checked: false }));
  return k;
}

/**
 * Start building a program that will be wanted later, and come straight back: the driver builds
 * it while the menu is up or the loader runs, and `compile` with the same sources then has it at
 * once. Building one when it is first drawn with was a freeze of tenths of a second on a phone,
 * in the first frames of a race.
 */
export function prelink(gl: WebGL2RenderingContext, ...programs: readonly Sources[]): void {
  for (const [vs, fs, feedback] of programs) start(gl, vs, fs, feedback);
}

/**
 * The program for these sources: built once for the life of its context and handed out again
 * for the same sources, so never delete one. Waits for the driver only here, and only once: a
 * program started earlier (`prelink`) is usually ready. Whoever gets a program sets every uniform
 * it relies on: it may have been used before, by another owner.
 */
export function compile(
  gl: WebGL2RenderingContext,
  vs: string,
  fs: string,
  feedback?: readonly string[],
): WebGLProgram {
  const k = start(gl, vs, fs, feedback);
  if (k.checked) return k.prog;
  // (asked of the program alone: one wait, and the shaders' own logs only when it failed)
  if (!gl.getProgramParameter(k.prog, gl.LINK_STATUS)) {
    k.shaders.forEach((sh, i) => {
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? ''}\n${k.srcs[i]!}`);
    });
    throw new Error(`program link failed: ${gl.getProgramInfoLog(k.prog) ?? ''}`);
  }
  for (const sh of k.shaders) gl.deleteShader(sh);
  k.shaders = [];
  k.checked = true;
  return k.prog;
}

/** `compile` under its older name: every program is kept now. */
export const compileKept = compile;

/** Uniform locations by name, looked up once. */
export function uniforms<K extends string>(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  names: readonly K[],
): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}

export function texture(gl: WebGL2RenderingContext, filter: number = gl.NEAREST): WebGLTexture {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function rgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Tiny deterministic PRNG for cosmetic effects (mulberry32). Never Math.random: captures must replay. */
export class FxRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/**
 * Upload only the box of an R8UI map texture where `next` differs from `shown` (what the texture
 * holds), then copy that box into `shown`. Whole-map fields are rebuilt on the CPU but usually
 * change in one crater's worth of cells, and a full-map upload stalls a phone's GPU queue.
 * Returns whether anything was uploaded.
 */
export function uploadChanged(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  next: Uint8Array,
  shown: Uint8Array,
  w: number,
  h: number,
  from = 0,
  to = w - 1,
  top = 0,
  bottom = h - 1,
): boolean {
  let y0 = -1;
  let y1 = -1;
  let x0 = w;
  let x1 = -1;
  const lo = Math.max(0, from);
  const hi = Math.min(w - 1, to);
  for (let y = Math.max(0, top), end = Math.min(h - 1, bottom); y <= end; y++) {
    const o = y * w;
    let a = -1;
    for (let x = lo; x <= hi; x++) {
      if (next[o + x] !== shown[o + x]) {
        a = x;
        break;
      }
    }
    if (a < 0) continue;
    let b = hi;
    while (next[o + b] === shown[o + b]) b--;
    if (y0 < 0) y0 = y;
    y1 = y;
    if (a < x0) x0 = a;
    if (b > x1) x1 = b;
  }
  if (y0 < 0) return false;
  for (let y = y0; y <= y1; y++) shown.set(next.subarray(y * w + x0, y * w + x1 + 1), y * w + x0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, w);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    x0,
    y0,
    x1 - x0 + 1,
    y1 - y0 + 1,
    gl.RED_INTEGER,
    gl.UNSIGNED_BYTE,
    next,
  );
  gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
  gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  return true;
}

/**
 * A counting copy of a fragment shader, for the overdraw meter (after loktar00's sprite-stack-engine
 * count pass): the shader runs as before, discards where it did, but writes `u_count` instead of its
 * colour, so additive blending adds one per fragment. With `cover`, nothing is discarded: every
 * fragment the quads cover is counted. Needs the shader's output to be `out vec4 o;`.
 */
export function countingShader(fs: string, cover = false): string {
  if (!fs.includes('out vec4 o;') || !fs.includes('void main()'))
    throw new Error('countingShader: no `out vec4 o;` or main');
  let src = fs
    .replace('out vec4 o;', 'out vec4 o_count;\nvec4 o;')
    .replace('void main()', 'void dd_main()');
  if (cover) src = src.replace(/\bdiscard;/g, '{}');
  return `${src}\nuniform float u_count;\nvoid main() { dd_main(); o_count = vec4(u_count); }\n`;
}
