import { defineConfig } from 'vitest/config';

// These tests spawn real PTY sessions via node-pty. macOS-arm64 hosted runners
// hit posix_spawnp restrictions; Windows ConPTY is noisy. Run on Linux only —
// cross-platform PTY behaviour is covered by the integration + E2E suites.
const PTY_TESTS = [
  'tests/session-attention-gate.test.ts',
  'tests/session-manager-resume.test.ts',
  'tests/session-rate-limit.test.ts',
];

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: process.platform !== 'linux' ? PTY_TESTS : [],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
