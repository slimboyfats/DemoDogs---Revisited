import { describe, expect, it } from 'vitest';
import { squeezeGlsl } from './glsl';

describe('squeezeGlsl', () => {
  it('takes comments, indent and blank lines out of a shader and keeps its lines', () => {
    const got = squeezeGlsl(
      'export const FS = `#version 300 es\n' +
        '  precision highp float; // as fine as it gets\n\n' +
        '  /* the light\n     of the sun */\n' +
        '  uniform vec3   uSun;\n' +
        '  #define BRIGHT\n' +
        '  void main() {\n    gl_FragColor = vec4(uSun, 1.0);\n  }\n`;',
    );
    expect(got).toBe(
      'export const FS = `#version 300 es\nprecision highp float;\nuniform vec3 uSun;\n' +
        '#define BRIGHT\nvoid main() {\ngl_FragColor = vec4(uSun, 1.0);\n}\n`;',
    );
  });

  it('keeps the space round a ${} and keeps a ${} in a comment inside one', () => {
    const got = squeezeGlsl(
      'const f = (t: string, n: number) => `uniform ${t} uMap;\n' +
        '  // reads ${n} taps of it\n' +
        '  float taps = ${n}.0;   uniform float uK;\n`;',
    );
    expect(got).toBe(
      'const f = (t: string, n: number) => `uniform ${t} uMap;\n//${n}\nfloat taps = ${n}.0; uniform float uK;\n`;',
    );
  });

  it('leaves other strings alone', () => {
    expect(squeezeGlsl('const a = `Step ${1} of ${2}   // not a shader\n  ok`;')).toBeNull();
    expect(squeezeGlsl('const url = "http://example.test/a  b";')).toBeNull();
  });
});
