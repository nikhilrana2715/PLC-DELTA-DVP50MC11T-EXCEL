/**
 * Append-only activity log for the admin's "User History" screen:
 * who logged in / out, who imported an Excel, who deleted what, to-dos, meetings.
 */
export function makeAudit(_DATA_DIR, database) {
  const read = () => database.listAudit()
  const logStrict = (e) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      type: String(e.type || 'info'),
      username: e.username || 'unknown',
      role: e.role || 'user',
      detail: String(e.detail || '').slice(0, 160),
    }
    database.insertAudit(entry)
    database.handle.prepare('DELETE FROM audit_events WHERE id IN (SELECT id FROM audit_events ORDER BY at DESC LIMIT -1 OFFSET 1000)').run()
    return entry
  }
  const log = (e) => {
    try {
      return logStrict(e)
    } catch {
      /* logging must never break a request */
    }
  }
  const removeUserStrict = (username) => database.removeAuditForUser(username)
  const removeUser = (username) => {
    try {
      return removeUserStrict(username)
    } catch {
      /* ignore */
    }
  }
  return { log, logStrict, read, removeUser, removeUserStrict }
}
/** Resolve the signed-in user from a request's Bearer token (null when absent). */
export function makeWhoIs(database) {
  return (req) => {
    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '')
      if (!token) return null
      const s = database.getSession(token)
      if (!s) return null
      const u = database.getUser(s.username)
      // `access` rides along so a request can be judged without a second file read.
      return u
        ? { username: u.username, role: u.role || 'user', fullName: u.fullName || u.username, access: u.access || null }
        : null
    } catch {
      return null
       
    }
  }
}
