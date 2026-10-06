import { useEffect, useRef } from 'react'

/**
 * An overlay the phone's own Back button can close.
 *
 * On a phone a breakdown fills the screen, so it reads as a page — and a page is expected to
 * answer the system Back gesture. Without this it does not: Android's back button leaves the
 * whole app while a full-screen list is open, which loses the day's work on screen and is the
 * single most jarring thing a web app can do on a phone.
 *
 * So opening one pushes a history entry that goes nowhere — same URL, same hash, so the
 * app's own hash routing never sees it. Back then pops that entry instead of leaving, and
 * `handler` runs. Closing any other way (the arrow, the X, a tap outside) pops the entry
 * back off, so the history is exactly as it was and Back means what it meant before.
 *
 * `handler` is read through a ref, so a drill-down can change what Back means — level two
 * hands back to level one, level one closes — without re-registering anything.
 */
export function useOverlayBack(handler: () => void) {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    // True once the browser has already popped our entry, so the cleanup must not pop again.
    let popped = false
    let gone = false
    const push = () => {
      try {
        history.pushState({ mmOverlay: true }, '')
        return true
      } catch {
        return false // sandboxed or file:// — the overlay still works, just without Back
      }
    }
    if (!push()) return

    const onPop = () => {
      popped = true
      latest.current()
      /**
       * A drill-down steps back a level instead of closing, and the overlay is still on
       * screen — with its history entry now spent. Without putting one back, the next Back
       * press would land on the page underneath and navigate away with the list still open.
       * The handler cannot say which it did, so this waits a tick and asks the only question
       * that matters: is the overlay still here?
       */
      setTimeout(() => {
        if (!gone && push()) popped = false
      }, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      gone = true
      window.removeEventListener('popstate', onPop)
      // Closed by the button rather than by Back: take our own entry off again, so Back
      // does not have to be pressed twice to leave the page underneath.
      if (!popped) {
        try {
          history.back()
        } catch {
          /* nothing sensible to do */
        }
      }
    }
  }, [])
}
