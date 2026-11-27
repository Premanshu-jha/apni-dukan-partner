/** Whether this branch name turns kirana on for its builds (see kirana-build.mjs). */
export function isKiranaBranch(branch: string | null | undefined): boolean

/** Kirana on or off for a CI build of the app, and whether it is a kirana test build (see kirana-build.mjs). */
export function kiranaBuild(args: { branch: string | null | undefined; setting: string | null | undefined }): {
  kirana: boolean
  testBuild: boolean
}
