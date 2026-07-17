import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4620',
    viewport: { width: 1600, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // iPhone-viewport touchscreen emulation (chromium so CDP can drive multi-touch).
      // deviceScaleFactor is forced to 1: the retina 3× backing store only affects
      // canvas sharpness (irrelevant to gesture math) but makes headless swiftshader
      // ~9× slower, which starves synthetic-touch dispatch and breaks tap-timing.
      name: 'mobile',
      testMatch: '**/mobile.spec.ts',
      use: {
        ...devices['iPhone 13'],
        deviceScaleFactor: 1,
        browserName: 'chromium',
      },
    },
  ],
  webServer: {
    command: 'pnpm build && pnpm preview --port 4620 --strictPort',
    url: 'http://localhost:4620',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
