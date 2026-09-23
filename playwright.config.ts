import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3210);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm build && pnpm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_FILE: process.env.E2E_DATA_FILE ?? 'data/e2e-todos.json',
    },
  },
});
