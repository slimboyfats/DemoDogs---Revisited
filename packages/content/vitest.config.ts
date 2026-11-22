import { defineProject } from 'vitest/config';

// Content tests run whole races; allow more than vitest's 5 s default.
export default defineProject({
  test: { name: 'content', environment: 'node', testTimeout: 90_000 },
});
