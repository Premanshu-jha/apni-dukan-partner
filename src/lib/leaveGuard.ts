import { useEffect } from 'react'

/**
 * Screens with something unsaved (a registration form typed into, a video uploading) say so here, so the phone's
 * Back button in the Play Store app asks before leaving, as the browser's own warning (beforeunload) does on the
 * website, where that warning covers closing the tab. The newest screen's question is asked.
 */
const questions: string[] = []

/** While {@code active}, Back in the app asks {@code question} first. */
export function useLeaveGuard(active: boolean, question: string): void {
  useEffect(() => {
    if (!active) return
    questions.push(question)
    return () => {
      const i = questions.lastIndexOf(question)
      if (i >= 0) questions.splice(i, 1)
    }
  }, [active, question])
}

/** The question to ask before leaving, if a screen has something unsaved. */
export function leaveQuestion(): string | null {
  return questions.length ? questions[questions.length - 1] : null
}
