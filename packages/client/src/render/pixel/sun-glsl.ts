/** What the shaders that read the sun's shadow map share (see sun-shadow.ts). */

/** The highest anything is told apart in the sun's map (art px above flat ground). */
export const SUN_TOP = 512;
/** How much higher than a point something must stand over it to shade it (art px). */
export const SUN_BIAS = 1.6;

/**
 * GLSL: is the point `p` (ground x, y and how high it stands above flat ground) in shade?
 * `sunShade` is 1 where the sun's map holds something higher in the same ray.
 */
export const SUN_GLSL = `
uniform highp sampler2D u_sh;
uniform vec4 u_shbox;   // the ground the sun's map covers: x, y, width, height
uniform vec3 u_shear;   // ground px a shadow reaches per px of height (x, y), and the map's top
float sunHigh(vec2 uv) {
  return (1.0 - textureLod(u_sh, uv, 0.0).r) * u_shear.z;
}
float sunShade(vec3 p) {
  vec2 uv = (p.xy + max(p.z, 0.0) * u_shear.xy - u_shbox.xy) / u_shbox.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  return step(p.z + ${SUN_BIAS.toFixed(1)}, sunHigh(uv));
}`;
