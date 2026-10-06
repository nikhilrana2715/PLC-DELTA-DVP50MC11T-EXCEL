import { useEffect, useRef, useState } from 'react'
import App from './App'
import { AuthScreen } from './components/auth/AuthScreen'
import { AdminAuthScreen } from './components/auth/AdminAuthScreen'
import { QaApp } from './components/QaApp'
import { authApi, clearToken, type AuthUser } from './lib/auth'
import { setAccess, visibleUnits } from './lib/access'
import { setUnit, useUnit } from './lib/unit'

/** Gate: check the saved session, then show the right auth door or the dashboard. */
export function Root() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined) // undefined = still checking
  const unit = useUnit()
  // Admins have their own login page; keep it in the hash so it survives a reload.
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Read inside the session effect without making it depend on the unit.
  const unitRef = useRef(unit)
  unitRef.current = unit

  useEffect(() => {
    let alive = true
    authApi.me().then((u) => {
      if (!alive) return
      // Publish before the app mounts, so no screen ever renders with the wrong permissions.
      setAccess(u?.access)
      // The device remembers the last workspace, which may no longer be one this account
      // can open — step to the first one it can rather than showing an empty shell.
      const open = visibleUnits()
      if (open.length && !open.includes(unitRef.current)) setUnit(open[0])
      setUser(u)
    })
    return () => {
      alive = false
    }
  }, [])

  // A user may be logged in on at most 2 devices. If a 3rd device logs in, this
  // (now oldest) session is evicted server-side — detect it and auto sign out.
  // Runs even when the tab is in the background (throttled), so a device left open
  // logs itself out within ~30–60s of being kicked, not only when refocused.
  useEffect(() => {
    if (!user) return
    let alive = true
    const verify = async () => {
      const status = await authApi.checkSession()
      if (!alive) return
      if (status === 'revoked') {
        clearToken()
        setUser(null)
        return
      }
      // The same poll picks up an access change an admin just made, so a screen stops
      // offering buttons the server would refuse without waiting for a reload.
      if (status === 'ok') {
        const fresh = await authApi.me()
        if (alive && fresh) setAccess(fresh.access)
      }
    }
    void verify() // check immediately on mount too
    const id = window.setInterval(verify, 25_000)
    window.addEventListener('focus', verify)
    document.addEventListener('visibilitychange', verify)
    return () => {
      alive = false
      window.clearInterval(id)
      window.removeEventListener('focus', verify)
      document.removeEventListener('visibilitychange', verify)
    }
  }, [user])

  if (user === undefined) {
    return <div className="min-h-screen grid place-items-center text-slate-400">Loading…</div>
  }
  if (!user) {
    const authed = (u: AuthUser) => {
      window.location.hash = '' // leave the login route once signed in
      setUser(u)
    }
    if (hash === '#admin-login') return <AdminAuthScreen onAuthed={authed} />
    if (hash === '#qa-login') return <AuthScreen variant="qa" onAuthed={authed} />
    return <AuthScreen onAuthed={authed} />
  }
  const logout = async () => {
    await authApi.logout()
    setUser(null)
  }
  // QA accounts get the minimal Quality portal, not the full meeting dashboard.
  if (user.role === 'qa') return <QaApp user={user} onUserUpdate={setUser} onLogout={logout} />
  // Keying on the unit remounts the whole dashboard when the workspace changes. Every
  // data hook re-runs and the realtime stream re-subscribes for the new unit, which is
  // what keeps U1's records from lingering on screen after switching to U2.
  return <App key={unit} user={user} onUserUpdate={setUser} onLogout={logout} />
}
