import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  workers: 1, // Electron tests must run serially – parallel launch races
});
