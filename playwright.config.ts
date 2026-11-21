import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests: a real browser drives the app against a fake backend (e2e/mockApi.ts) whose answers follow
 * the backend's records. They run in CI on every pull request.
 *
 * Two builds, one per state of the kirana switch (VITE_KIRANA_ENABLED):
 * - "salon": the default build (switch off, as production) on 4173: every spec but the kirana ones (e2e/kirana-*).
 * - "kirana": built with VITE_KIRANA_ENABLED=true into dist-kirana, on 4174: only the kirana specs.
 * The ports can be moved with E2E_PORT and E2E_KIRANA_PORT (two checkouts testing at once).
 */
const PORT = Number(process.env.E2E_PORT ?? 4173)
const KIRANA_PORT = Number(process.env.E2E_KIRANA_PORT ?? 4174)
const KIRANA_SPECS = /kirana-[^/]*\.spec\.ts$/

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    // The app talks to this address; every request to it is answered by the fake backend.
    geolocation: { latitude: 28.627, longitude: 77.372, accuracy: 30 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'salon', testIgnore: KIRANA_SPECS, use: { baseURL: `http://localhost:${PORT}` } },
    { name: 'kirana', testMatch: KIRANA_SPECS, use: { baseURL: `http://localhost:${KIRANA_PORT}` } },
  ],
  webServer: [
    {
      command: `npx vite build --mode e2e && npx vite preview --mode e2e --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      // The switch off, whatever the shell has
      env: { VITE_KIRANA_ENABLED: 'false' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite build --mode e2e --outDir dist-kirana && npx vite preview --mode e2e --outDir dist-kirana --port ${KIRANA_PORT} --strictPort`,
      url: `http://localhost:${KIRANA_PORT}`,
      env: { VITE_KIRANA_ENABLED: 'true' },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
