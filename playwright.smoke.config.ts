import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.SMOKE_BASE_URL;
const baseURL = externalBaseUrl || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        env: {
          ...process.env,
          VITE_FIREBASE_API_KEY: '',
          VITE_FIREBASE_PROJECT_ID: '',
          VITE_FIREBASE_AUTH_DOMAIN: '',
          VITE_FIREBASE_STORAGE_BUCKET: '',
          VITE_FIREBASE_MESSAGING_SENDER_ID: '',
          VITE_FIREBASE_APP_ID: '',
          VITE_USE_TOKEN_LOGIN: 'false',
          VITE_ENABLE_SANDBOX_LOGIN: 'true',
        },
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'iphone',
      use: {
        browserName: 'chromium',
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
