/**
 * Deterministic `sin`, `cos`, `atan2`, `exp` and `hypot`: the same bits on every JavaScript engine.
 *
 * The spec lets each engine implement `Math.sin` and friends as it likes, and they disagree in the
 * last bit (V8 and SpiderMonkey use fdlibm; JavaScriptCore on iPhones does not). One bit is enough
 * to split an online race in two after a few seconds. `+ - * /` and `Math.sqrt` are exactly rounded
 * everywhere, so these ports of fdlibm (Sun Microsystems, freely redistributable) built from them
 * agree everywhere. They are within an ulp or two of the native functions.
 *
 * Online play installs them over `Math` (client `net/det-math.ts`) so the sim and content need no
 * edits; single-player keeps the native functions, so golden hashes are unchanged.
 */

// sin/cos: reduce by multiples of pi/2 (Cody-Waite, two steps), then a polynomial on [-pi/4, pi/4]
const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

function ksin(x: number): number {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + z * x * (S1 + z * r);
}

function kcos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1 - hz;
  return w + (1 - w - hz + z * r);
}

/** x reduced to [-pi/4, pi/4], and which quarter turn it was in (0..3). */
function reduce(x: number): [number, number] {
  if (Math.abs(x) <= 0.7853981633974483) return [x, 0];
  const n = Math.round(x * INV_PIO2);
  const t = x - n * PIO2_1;
  let w = n * PIO2_2;
  const r = t - w;
  w = n * PIO2_2T - (t - r - w);
  const y = r - (w + n * PIO2_1T - n * PIO2_2);
  return [y, ((n % 4) + 4) % 4];
}

export function dsin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [y, q] = reduce(x);
  return q === 0 ? ksin(y) : q === 1 ? kcos(y) : q === 2 ? -ksin(y) : -kcos(y);
}

export function dcos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const [y, q] = reduce(x);
  return q === 0 ? kcos(y) : q === 1 ? -ksin(y) : q === 2 ? -kcos(y) : ksin(y);
}

// atan: fdlibm s_atan.c
const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

export function datan(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const neg = x < 0;
  let a = Math.abs(x);
  if (a >= 7.37869762948382e19)
    return neg ? -(ATAN_HI[3]! + ATAN_LO[3]!) : ATAN_HI[3]! + ATAN_LO[3]!;
  let id: number;
  if (a < 0.4375) {
    if (a < 1.862645149230957e-9) return x;
    id = -1;
  } else if (a < 1.1875) {
    if (a < 0.6875) {
      id = 0;
      a = (2 * a - 1) / (2 + a);
    } else {
      id = 1;
      a = (a - 1) / (a + 1);
    }
  } else if (a < 2.4375) {
    id = 2;
    a = (a - 1.5) / (1 + 1.5 * a);
  } else {
    id = 3;
    a = -1 / a;
  }
  const z = a * a;
  const w = z * z;
  const s1 = z * (AT[0]! + w * (AT[2]! + w * (AT[4]! + w * (AT[6]! + w * (AT[8]! + w * AT[10]!)))));
  const s2 = w * (AT[1]! + w * (AT[3]! + w * (AT[5]! + w * (AT[7]! + w * AT[9]!))));
  if (id < 0) return neg ? -(a - a * (s1 + s2)) : a - a * (s1 + s2);
  const r = ATAN_HI[id]! - (a * (s1 + s2) - ATAN_LO[id]! - a);
  return neg ? -r : r;
}

const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;

export function datan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (x === 1) return datan(y);
  const yNeg = y < 0 || Object.is(y, -0);
  if (y === 0) {
    if (x > 0 || Object.is(x, 0)) return y;
    return yNeg ? -PI : PI;
  }
  if (x === 0) return yNeg ? -PI / 2 : PI / 2;
  if (x === Infinity) {
    if (y === Infinity) return PI / 4;
    if (y === -Infinity) return -PI / 4;
    return yNeg ? -0 : 0;
  }
  if (x === -Infinity) {
    if (y === Infinity) return (3 * PI) / 4;
    if (y === -Infinity) return (-3 * PI) / 4;
    return yNeg ? -PI : PI;
  }
  if (!Number.isFinite(y)) return yNeg ? -PI / 2 : PI / 2;
  const z = datan(Math.abs(y / x));
  if (x > 0) return yNeg ? -z : z;
  return yNeg ? z - PI_LO - PI : PI - (z - PI_LO);
}

// exp: fdlibm e_exp.c
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.6533902205465251539e-6;
const P5 = 4.13813679705723846039e-8;

const bits = new DataView(new ArrayBuffer(8));
/** 2^n for a whole n in [-1022, 1023], built from its bits (exact). */
function pow2(n: number): number {
  bits.setUint32(0, (n + 1023) << 20);
  bits.setUint32(4, 0);
  return bits.getFloat64(0);
}

export function dexp(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x > 7.09782712893383973096e2) return Infinity;
  if (x < -7.4513321910194110842e2) return 0;
  const k = Math.round(x * INV_LN2);
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - (lo - (r * c) / (2 - c) - hi);
  if (k > 1000) return y * pow2(1000) * pow2(k - 1000);
  if (k < -1000) return y * pow2(-1000) * pow2(k + 1000);
  return y * pow2(k);
}

/** sqrt of the sum of squares (no overflow guard: the sim's numbers are small). */
export function dhypot(...v: number[]): number {
  if (v.length === 2) {
    const a = v[0]!;
    const b = v[1]!;
    if (a === Infinity || a === -Infinity || b === Infinity || b === -Infinity) return Infinity;
    return Math.sqrt(a * a + b * b);
  }
  let s = 0;
  let inf = false;
  for (const x of v) {
    if (x === Infinity || x === -Infinity) inf = true;
    s += x * x;
  }
  return inf ? Infinity : Math.sqrt(s);
}
