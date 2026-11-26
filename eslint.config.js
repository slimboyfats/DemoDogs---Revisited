import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Rules that keep the simulation deterministic: the same seed and inputs always give the same
// race. Applied to the kernel and to all content. (DemoDogs has no netcode, so trig is allowed;
// randomness, clocks, timers and the DOM are not.)
const determinism = {
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'No wall-clock time in sim/content. Use the tick counter.' },
    { name: 'performance', message: 'No wall-clock time in sim/content.' },
    { name: 'window', message: 'sim/content must not touch the DOM.' },
    { name: 'document', message: 'sim/content must not touch the DOM.' },
    { name: 'setTimeout', message: 'No timers in sim/content.' },
    { name: 'setInterval', message: 'No timers in sim/content.' },
    { name: 'requestAnimationFrame', message: 'No frame timing in sim/content.' },
  ],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the world PRNG (world.rng).' },
    { object: 'Date', property: 'now', message: 'No wall-clock time in sim/content.' },
    // Online play swaps sin, cos, atan2, exp and hypot for versions that give the same bits on
    // every engine (sim/src/dmath.ts). The rest of the transcendental functions differ in the
    // last bit between Safari and Chrome, which splits a lockstep race: port one to dmath first.
    ...[
      'pow',
      'log',
      'log2',
      'log10',
      'log1p',
      'expm1',
      'tan',
      'tanh',
      'sinh',
      'cosh',
      'acos',
      'asin',
      'atan',
      'acosh',
      'asinh',
      'atanh',
      'cbrt',
    ].map((property) => ({
      object: 'Math',
      property,
      message: `Math.${property} is not the same on every engine: online races would split. Add a deterministic one to sim/src/dmath.ts.`,
    })),
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['@demodogs/client', '@demodogs/client/*'],
          message: 'sim/content must not import the client.',
        },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'captures/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: [
      'packages/sim/src/**/*.ts',
      'packages/content/core/**/*.ts',
      'packages/content/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: determinism,
  },
  {
    // Typed-array and fixed-size-array reads: `!` says "in bounds by construction".
    files: ['packages/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // The kernel never imports content.
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...determinism['no-restricted-imports'][1].patterns,
            {
              group: ['@demodogs/content', '@demodogs/content/*'],
              message: 'The kernel never imports content.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}', '*.{js,ts}', 'packages/*/*.{js,ts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
