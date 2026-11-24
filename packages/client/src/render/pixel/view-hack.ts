/**
 * RESEARCH HACK, not for main: two other cameras to compare with the fixed one (`?view=turn`,
 * `?view=chase`). `turn` keeps the top-down view and turns the world so your car points up the
 * screen; `chase` is a real perspective camera low behind the car.
 */
export const VIEW = {
  /** 0: the fixed view. 1: turned top-down. 2: chase. */
  mode: 0,
  /** Hold the race still (captures). */
  freeze: false,
  /** The point the turned view turns about, and by how much. */
  cx: 0,
  cy: 0,
  yaw: 0,
  /** Chase: world to clip space (column-major), the eye, and device px per art px one unit off. */
  pv: new Float32Array(16),
  eye: [0, 0, 0] as [number, number, number],
  fwd: [1, 0, 0] as [number, number, number],
  focal: 1,
  scale: 4,
  w: 1,
  h: 1,
  /** Chase: sky colour things fade to, and where the fade starts and ends (art px). */
  fog: [0.62, 0.72, 0.8] as [number, number, number],
  fog0: 260,
  fog1: 620,
  /** Chase tuning: how far back, how high, how far ahead it looks, field of view (degrees). */
  back: 30,
  up: 13,
  ahead: 34,
  fov: 58,
};

/** GLSL the vertex shaders share. */
export const VIEW_GLSL = `
uniform highp int u_hmode;
uniform vec3 u_hcam;   // turn: x, y, yaw
uniform mat4 u_hpv;    // chase: world to clip
uniform float u_hpt;   // chase: focal length over the flat view's scale
vec2 hturn(vec2 p) {
  float c = cos(u_hcam.z), s = sin(u_hcam.z);
  vec2 d = p - u_hcam.xy;
  return u_hcam.xy + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
}`;

export const FOG_GLSL = `
uniform highp int u_hmode;
uniform vec3 u_heye;
uniform vec4 u_hfog;   // rgb, unused
uniform vec2 u_hfogr;  // start, end
vec3 hfog(vec3 c, vec2 wp) {
  if (u_hmode != 2) return c;
  float d = distance(wp, u_heye.xy);
  float k = clamp((d - u_hfogr.x) / (u_hfogr.y - u_hfogr.x), 0.0, 1.0);
  return mix(c, u_hfog.rgb, k * k * (3.0 - 2.0 * k));
}`;

export function setView(gl: WebGL2RenderingContext, prog: WebGLProgram): void {
  const L = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform1i(L('u_hmode'), VIEW.mode);
  gl.uniform3f(L('u_hcam'), VIEW.cx, VIEW.cy, VIEW.yaw);
  gl.uniform1f(L('u_hpt'), VIEW.focal / VIEW.scale);
  gl.uniformMatrix4fv(L('u_hpv'), false, VIEW.pv);
  gl.uniform3f(L('u_heye'), VIEW.eye[0], VIEW.eye[1], VIEW.eye[2]);
  gl.uniform4f(L('u_hfog'), VIEW.fog[0], VIEW.fog[1], VIEW.fog[2], 1);
  gl.uniform2f(L('u_hfogr'), VIEW.fog0, VIEW.fog1);
}

/** Point the chase camera: behind (x, y) along heading h. */
export function aimChase(x: number, y: number, h: number, W: number, H: number): void {
  const V = VIEW;
  const fx = Math.cos(h);
  const fy = Math.sin(h);
  const E: [number, number, number] = [x - fx * V.back, y - fy * V.back, V.up];
  const T = [x + fx * V.ahead, y + fy * V.ahead, 2];
  let f = [T[0]! - E[0], T[1]! - E[1], T[2]! - E[2]];
  const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
  f = f.map((v) => v / fl);
  const rl = Math.hypot(f[0]!, f[1]!);
  const r = [-f[1]! / rl, f[0]! / rl, 0];
  let u = [-f[0]! * f[2]!, -f[1]! * f[2]!, f[0]! * f[0]! + f[1]! * f[1]!];
  const ul = Math.hypot(u[0]!, u[1]!, u[2]!);
  u = u.map((v) => v / ul);
  const t = 1 / Math.tan((V.fov * Math.PI) / 360);
  const a = W / H;
  const n = 2;
  const far = 2400;
  const A = (far + n) / (far - n);
  const B = (-2 * far * n) / (far - n);
  const dot = (v: number[]) => -(v[0]! * E[0] + v[1]! * E[1] + v[2]! * E[2]);
  // rows of the matrix: clip = M * (x, y, z, 1)
  const rows = [
    [(r[0]! * t) / a, (r[1]! * t) / a, (r[2]! * t) / a, (dot(r) * t) / a],
    [u[0]! * t, u[1]! * t, u[2]! * t, dot(u) * t],
    [f[0]! * A, f[1]! * A, f[2]! * A, dot(f) * A + B],
    [f[0]!, f[1]!, f[2]!, dot(f)],
  ];
  for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) V.pv[c * 4 + rr] = rows[rr]![c]!;
  V.eye = E;
  V.fwd = f as [number, number, number];
  V.focal = (t * H) / 2;
  V.w = W;
  V.h = H;
}

/** Chase: where a world point lands (device px) and how many device px an art px is there. */
export function chasePoint(x: number, y: number, z: number): [number, number, number] {
  const m = VIEW.pv;
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (cw < 1) return [-1e6, -1e6, 0];
  return [(cx / cw + 1) * 0.5 * VIEW.w, (1 - cy / cw) * 0.5 * VIEW.h, VIEW.focal / cw];
}
