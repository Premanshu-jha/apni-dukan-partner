import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: a real browser drives the app against a fake backend (e2e/mockApi.ts) whose answers follow
 * the backend's records. They run in CI on every pull request.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // The app talks to this address; every request to it is answered by the fake backend.
    geolocation: { latitude: 28.627, longitude: 77.372, accuracy: 30 },
    permissions: ['geolocation'],
  },
  webServer: {
    command: 'npx vite build --mode e2e && npx vite preview --mode e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
