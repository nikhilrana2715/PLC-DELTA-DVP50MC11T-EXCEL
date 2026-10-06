// Per-user access, one level per workspace.
//
// The four levels are a ladder, not a set of independent switches: you cannot delete what
// you may not change, and you cannot change what you may not see. That makes the rule one
// comparison instead of three, and makes a nonsense combination impossible to store.
//
//   none    the workspace is not offered at all — its button does not appear
//   view    read everything in it
//   update  view + upload, convert, save
//   delete  update + remove records
//
// An account created from now on starts with U1 view and nothing else; an account that
// existed BEFORE access was introduced carries no `access` field, and those keep the full
// run of the app they already had. Silently demoting the whole team on deploy day would be
// the wrong reading of "new users get view only".

export const ACCESS_UNITS = ['U1', 'U2', 'U3', 'ASS']
export const LEVELS = ['none', 'view', 'update', 'delete']

/** What a brand-new account gets. */
export const DEFAULT_NEW_ACCESS = Object.freeze({ U1: 'view', U2: 'none', U3: 'none', ASS: 'none' })
/** Everything, everywhere — admins, and accounts from before this feature. */
export const FULL_ACCESS = Object.freeze({ U1: 'delete', U2: 'delete', U3: 'delete', ASS: 'delete' })

export const rank = (level) => {
  const i = LEVELS.indexOf(String(level))
  return i < 0 ? 0 : i
}

/** Clean anything that arrives over the wire into a complete, valid map. */
export function normalizeAccess(raw) {
  const out = {}
  for (const u of ACCESS_UNITS) {
    const v = String(raw?.[u] ?? 'none')
    out[u] = LEVELS.includes(v) ? v : 'none'
  }
  return out
}

/**
 * The map to judge a request by.
 *
 * Admins are not gated — the screen that hands out access cannot be behind it. QA has its
 * own app and its own door, so it is left alone too.
 */
export function accessOf(user) {
  if (!user) return FULL_ACCESS
  if (user.role === 'admin' || user.role === 'qa') return FULL_ACCESS
  if (!user.access) return FULL_ACCESS // predates access control — grandfathered
  return normalizeAccess(user.access)
}

/** Does this user hold at least `need` on `unit`? */
export function can(user, unit, need) {
  return rank(accessOf(user)[unit] ?? 'none') >= rank(need)
}
