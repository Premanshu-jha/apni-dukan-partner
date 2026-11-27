import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isKiranaBranch, kiranaBuild } from '../../scripts/kirana-build.mjs'

const ROOT = join(__dirname, '..', '..')

describe('kirana for a build of the app (scripts/kirana-build.mjs)', () => {
  it('is off on main and every other branch until the launch switch is on', () => {
    for (const branch of ['main', 'feature/x', 'fix-kirana', 'feature/kirana-x', 'Kirana-x', 'KIRANA', '', undefined]) {
      expect(kiranaBuild({ branch, setting: undefined })).toEqual({ kirana: false, testBuild: false })
      expect(kiranaBuild({ branch, setting: '' })).toEqual({ kirana: false, testBuild: false })
      expect(kiranaBuild({ branch, setting: 'false' })).toEqual({ kirana: false, testBuild: false })
    }
  })

  it('is on for kirana branches, as a test build', () => {
    for (const branch of ['kirana', 'kirana-counter', 'kirana/setup', 'kiranaX']) {
      expect(isKiranaBranch(branch)).toBe(true)
      expect(kiranaBuild({ branch, setting: undefined })).toEqual({ kirana: true, testBuild: true })
    }
  })

  it('is on everywhere once launched (exactly "true", like the app), never as a test build', () => {
    for (const branch of ['main', 'kirana-counter', 'feature/x']) {
      expect(kiranaBuild({ branch, setting: 'true' })).toEqual({ kirana: true, testBuild: false })
    }
    // Anything but exactly "true" is off, as in src/lib/config.ts: a kirana branch stays a test build
    for (const setting of ['TRUE', ' true', 'yes', '1']) {
      expect(kiranaBuild({ branch: 'main', setting })).toEqual({ kirana: false, testBuild: false })
      expect(kiranaBuild({ branch: 'kirana-x', setting })).toEqual({ kirana: true, testBuild: true })
    }
  })
})

describe('the script as CI runs it', () => {
  function run(env: Record<string, string>) {
    const dir = mkdtempSync(join(tmpdir(), 'kirana-build-'))
    const out = join(dir, 'output')
    writeFileSync(out, '')
    try {
      const clean = { ...process.env }
      for (const k of ['GITHUB_HEAD_REF', 'GITHUB_REF_NAME', 'KIRANA_SETTING']) delete clean[k]
      const log = execFileSync(process.execPath, [join(ROOT, 'scripts', 'kirana-build.mjs')], {
        env: { ...clean, GITHUB_OUTPUT: out, ...env },
        encoding: 'utf8',
      })
      return { output: readFileSync(out, 'utf8'), log }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('reads the PR branch first (a PR from a kirana branch is a test build)', () => {
    const r = run({ GITHUB_HEAD_REF: 'kirana-counter', GITHUB_REF_NAME: '61/merge' })
    expect(r.output).toBe('kirana=true\ntest_build=true\n')
    expect(r.log).toContain('Kirana test build')
  })

  it('reads the pushed branch on a push (GITHUB_HEAD_REF is empty then)', () => {
    expect(run({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'kirana-setup' }).output).toBe('kirana=true\ntest_build=true\n')
    expect(run({ GITHUB_HEAD_REF: '', GITHUB_REF_NAME: 'main' }).output).toBe('kirana=false\ntest_build=false\n')
  })

  it('a PR from another branch into a kirana branch is not a test build', () => {
    expect(run({ GITHUB_HEAD_REF: 'fix-typo', GITHUB_REF_NAME: '62/merge' }).output).toBe(
      'kirana=false\ntest_build=false\n',
    )
  })

  it('follows the launch switch on main', () => {
    expect(run({ GITHUB_REF_NAME: 'main', KIRANA_SETTING: 'true' }).output).toBe('kirana=true\ntest_build=false\n')
  })
})

describe('the android job (.github/workflows/ci.yml)', () => {
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  const job = /\n {2}android:\n([\s\S]*?)(?=\n {2}[a-z][\w-]*:\n)/.exec(ci)?.[1] ?? ''
  const [head, ...steps] = job.split('\n      - ')
  const step = (name: string) => {
    const found = steps.filter((s) => s.startsWith(`name: ${name}`))
    expect(found, name).toHaveLength(1)
    return found[0]
  }

  it('builds on pushes to kirana branches as well as main', () => {
    expect(ci).toMatch(/\n {2}push:\n(?: {4}#.*\n)* {4}branches: \[main, 'kirana\*\*'\]\n/)
  })

  it('sets kirana and the update key only through the kirana step', () => {
    expect(head).not.toMatch(/VITE_KIRANA_ENABLED:|CAPGO_PUBLIC_KEY:/)
    const decide = steps.findIndex((s) => s.includes('id: kirana'))
    const build = steps.findIndex((s) => s.startsWith('name: Build the website for the app'))
    expect(decide).toBeGreaterThanOrEqual(0)
    expect(decide).toBeLessThan(build)
    expect(steps[decide]).toContain('KIRANA_SETTING: ${{ vars.VITE_KIRANA_ENABLED }}')
    expect(steps[decide]).toContain('run: node scripts/kirana-build.mjs')
    const site = steps[build]
    expect(site).toContain('VITE_KIRANA_ENABLED: ${{ steps.kirana.outputs.kirana }}')
    expect(site).toContain('VITE_KIRANA_TEST_BUILD: ${{ steps.kirana.outputs.test_build }}')
    expect(site).toContain(
      "CAPGO_PUBLIC_KEY: ${{ steps.kirana.outputs.test_build != 'true' && vars.CAPGO_PUBLIC_KEY || '' }}",
    )
    // Nothing else in the job reads the variables directly; the key only where the build's own rule allows it
    expect(steps.filter((s) => s.includes('vars.VITE_KIRANA_ENABLED'))).toHaveLength(1)
    const withKey = steps.filter((s) => s.includes('vars.CAPGO_PUBLIC_KEY'))
    expect(withKey).toHaveLength(2)
    expect(withKey[1]).toMatch(/^name: Send the screens/)
  })

  it('never signs, bundles or sends a kirana test build', () => {
    const guard = "steps.kirana.outputs.test_build != 'true'"
    expect(step('The upload key')).toContain(`if: ${guard}`)
    expect(step('Build the signed Play Store bundle')).toMatch(new RegExp(`if: ${escape(guard)} && hashFiles`))
    expect(step('Send the screens')).toContain(
      `if: github.event_name == 'push' && github.ref == 'refs/heads/main' && ${guard}`,
    )
  })

  it('signs every test APK with main\'s debug key (from the cache), before building it', () => {
    const apk = steps.findIndex((s) => s.startsWith('name: Build the test APK'))
    const [keep, read] = [steps[apk - 2], steps[apk - 1]]
    // Only main saves the key; every other build only reads it, so no branch keeps a key of its own
    expect(keep).toContain("if: github.ref == 'refs/heads/main'")
    expect(keep).toMatch(/uses: actions\/cache@[0-9a-f]{40} /)
    expect(read).toContain("if: github.ref != 'refs/heads/main'")
    expect(read).toMatch(/uses: actions\/cache\/restore@[0-9a-f]{40} /)
    for (const s of [keep, read]) {
      expect(s).toContain('path: ~/.android/debug.keystore')
      expect(s).toContain('key: android-debug-keystore-v1')
    }
    expect(steps.filter((s) => s.includes('actions/cache'))).toHaveLength(2)
  })

  it("names a kirana test build's APK apart", () => {
    expect(job).toContain("-android${{ steps.kirana.outputs.test_build == 'true' && '-kirana-test' || '' }}")
  })
})

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('the native level check after a force-push', () => {
  it('skips a base commit that is not in the clone instead of failing the build', () => {
    const log = execFileSync(
      process.execPath,
      [join(ROOT, 'scripts', 'check-native-level.mjs'), '0123456789abcdef0123456789abcdef01234567'],
      { cwd: ROOT, encoding: 'utf8' },
    )
    expect(log).toContain('is not in this clone')
  })
})
