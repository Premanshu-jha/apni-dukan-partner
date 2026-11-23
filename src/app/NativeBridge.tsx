import { App as CapApp } from '@capacitor/app'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { onOpenRequest, takePendingOpen } from '../lib/appEvents'
import { leaveQuestion } from '../lib/leaveGuard'
import { isApp } from '../lib/platform'

/**
 * The Play Store app's parts that need the router (nothing on the website): the screen a tapped notification or an
 * opened link asks for, and the phone's Back button, which does what Back does in the app: closes an open sheet
 * first, else (asking first when the screen has something unsaved, see useLeaveGuard) goes back a screen, else (the
 * first screen) puts the app in the background as Android apps do.
 */
export function NativeBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!isApp()) return
    const open = () => {
      const path = takePendingOpen()
      if (path) navigate(path)
    }
    open()
    return onOpenRequest(open)
  }, [navigate])

  useEffect(() => {
    if (!isApp()) return
    const handle = CapApp.addListener('backButton', ({ canGoBack }) => {
      // An open sheet (ui.tsx Sheet) closes on Escape: Back does the same
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return
      }
      // Something typed and not saved: ask, as the website's browser does when leaving
      const question = leaveQuestion()
      if (question && !window.confirm(question)) return
      if (canGoBack) window.history.back()
      else void CapApp.minimizeApp()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [])

  return null
}
