// Kirana on or off for a CI build of the Play Store app (.github/workflows/ci.yml, job android; see "Kirana switch"
// in the README).
//
// Kirana is on when either:
//   - the repo's variable VITE_KIRANA_ENABLED is exactly "true": the launch switch, for every build, main included
//     (the same rule as the app's own: src/lib/config.ts), or
//   - the build is of a branch whose name starts with "kirana" (a push to it, or a PR from it): for testing.
//
// A build with kirana on only because of its branch is a kirana test build. It takes no screen updates (built without
// CAPGO_PUBLIC_KEY), so main's screens, with kirana off, never replace it on the phone; and it is never signed for the
// Play Store nor sent to phones as a screen update, so kirana can't reach anyone through it. main is never a kirana
// branch, so until the launch switch is turned on every build from main, the only one sent to phones, has kirana off.
//
// Usage in CI: node scripts/kirana-build.mjs (reads GITHUB_HEAD_REF, the PR's branch, or else GITHUB_REF_NAME, and
// KIRANA_SETTING, the variable's value; writes kirana=true|false and test_build=true|false to GITHUB_OUTPUT).
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Whether this branch name turns kirana on for its builds. Lower case "kirana" at the start: kirana-counter, kirana/x. */
export function isKiranaBranch(branch) {
  return typeof branch === 'string' && branch.startsWith('kirana')
}

/** Kirana on or off for a build of this branch with the variable at this value, and whether it is a test build. */
export function kiranaBuild({ branch, setting }) {
  const launched = setting === 'true'
  const kirana = launched || isKiranaBranch(branch)
  return { kirana, testBuild: kirana && !launched }
}

function main() {
  // A PR's build is of the PR's branch (GITHUB_HEAD_REF); a push's of the branch pushed (GITHUB_REF_NAME)
  const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || ''
  const { kirana, testBuild } = kiranaBuild({ branch, setting: process.env.KIRANA_SETTING })
  const out = process.env.GITHUB_OUTPUT
  if (out) appendFileSync(out, `kirana=${kirana}\ntest_build=${testBuild}\n`)
  if (testBuild) {
    console.log(
      `::notice title=Kirana::Kirana test build (branch ${branch}): kirana on, no screen updates, ` +
        'not signed for the Play Store, not sent to phones',
    )
  } else {
    console.log(`Kirana ${kirana ? 'on (VITE_KIRANA_ENABLED=true)' : 'off'} for this build (branch ${branch || '?'})`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
