/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The kirana switch: 'true' turns the kirana side on (src/lib/config.ts). Off when unset. */
  readonly VITE_KIRANA_ENABLED?: string
}
