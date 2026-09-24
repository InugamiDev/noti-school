import { defineConfig } from '@playwright/test';
import base from '../playwright.config';
export default defineConfig({
  ...base,
  testDir: '../../../tests/web',
  reporter: [['list'], ['json', { outputFile: new URL('../../../tests/web/artifacts/repair-results.json', import.meta.url).pathname }]],
  outputDir: '../../../tests/web/artifacts/repair-runs',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3317' },
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 3317 --strictPort',
    cwd: new URL('..', import.meta.url).pathname,
    url: 'http://127.0.0.1:3317', reuseExistingServer: false, timeout: 30000,
  },
});
