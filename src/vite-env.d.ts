/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The kirana switch: 'true' turns the kirana side on (src/lib/config.ts). Off when unset. */
  readonly VITE_KIRANA_ENABLED?: string
  /** 'true' only in a kirana test build of the Play Store app (src/lib/config.ts, KIRANA_TEST_BUILD). */
  readonly VITE_KIRANA_TEST_BUILD?: string
}
