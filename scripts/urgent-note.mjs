// The note for an urgent screen update, from the merge's commit message: the PR title, when it starts with [urgent]
// ("[urgent] Fix the wrong bill total (#123)" → "Fix the wrong bill total"). Only the title counts, never a line of
// the PR's description: a squash merge's title is its first line; a merge commit's ("Merge pull request #… from …")
// is the first line after it. Null otherwise: an ordinary release (phones get it silently). See "App updates" in the
// README.
export function urgentNote(message) {
  const lines = String(message ?? '').split(/\r?\n/)
  let title = lines[0] ?? ''
  if (/^Merge pull request #\d+/.test(title)) title = lines.slice(1).find((l) => l.trim() !== '') ?? ''
  const m = /^\s*\[urgent\]\s*(.*)$/i.exec(title)
  if (!m) return null
  const note = m[1].replace(/\s*\(#\d+\)\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 120).trim()
  // The backend wants 3 to 120 characters: a bare [urgent] still counts, with a plain note
  return note.length >= 3 ? note : 'Urgent fix'
}
