import { urgentNote } from '../../scripts/urgent-note.mjs'

describe('an [urgent] PR title', () => {
  it('becomes the note of the screen update, without the PR number', () => {
    expect(urgentNote('[urgent] Fix the wrong bill total (#123)')).toBe('Fix the wrong bill total')
    expect(urgentNote('Merge pull request #12 from me/fix\n\n[URGENT]   Bookings not saving')).toBe('Bookings not saving')
    expect(urgentNote('[urgent]')).toBe('Urgent fix')
    expect(urgentNote(`[urgent] ${'x'.repeat(200)}`)).toHaveLength(120)
  })

  it('leaves every other release silent', () => {
    expect(urgentNote('Fix a typo (#7)')).toBeNull()
    expect(urgentNote('Mention [urgent] in the middle')).toBeNull()
    // A line of the PR's description is never the title
    expect(urgentNote('Show a banner for fixes (#9)\n\n[urgent] PRs now show a banner')).toBeNull()
    expect(urgentNote('Merge pull request #9 from me/x\n\nShow a banner\n\n[urgent] PRs now show one')).toBeNull()
    expect(urgentNote('')).toBeNull()
    expect(urgentNote(undefined)).toBeNull()
  })
})
