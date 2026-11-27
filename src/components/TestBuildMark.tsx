/**
 * "Kirana test build" in a small label, only in a kirana test build of the Play Store app (CI's android job on a
 * kirana… branch: scripts/kirana-build.mjs, "Kirana switch" in the README), so it is plain which app is on the phone.
 * Never in the website or a build sent to phones: KIRANA_TEST_BUILD is false there, so it renders nothing.
 * English only (only the developer sees it); taps go through it to the screen under it.
 */
export function TestBuildMark({ on }: { on: boolean }) {
  if (!on) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1.5 z-[100] rounded-md bg-amber-400/90 px-1.5 py-0.5 text-[11px] font-semibold text-black shadow"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
    >
      Kirana test build
    </div>
  )
}
