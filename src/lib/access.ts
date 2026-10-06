import { useSyncExternalStore } from 'react'
import { useUnit, type Unit } from './unit'

/**
 * What the signed-in user may do, per workspace.
 *
 * The server decides this and hands it over with the session; nothing here is a security
 * boundary — every write is checked again on the server. What this buys is a screen that
 * does not offer buttons that would be refused, which is the difference between an app that
 * feels locked down and one that feels broken.
 *
 * The four levels are a ladder: delete ⊃ update ⊃ view ⊃ none.
 */
export const LEVELS = ['none', 'view', 'update', 'delete'] as const
export type Level = (typeof LEVELS)[number]
export type AccessMap = Record<Unit, Level>

export const FULL_ACCESS: AccessMap = { U1: 'delete', U2: 'delete', U3: 'delete', ASS: 'delete' }
export const NEW_USER_ACCESS: AccessMap = { U1: 'view', U2: 'none', U3: 'none', ASS: 'none' }

/** How each level reads on screen, and the colour it carries. */
export const LEVEL_LABEL: Record<Level, string> = {
  none: 'No access',
  view: 'View only',
  update: 'Update',
  delete: 'Update & Delete',
}
export const LEVEL_HINT: Record<Level, string> = {
  none: 'The workspace is not offered at all.',
  view: 'Can open and read everything. Cannot upload or change.',
  update: 'Can upload, convert and save. Cannot delete.',
  delete: 'Everything, including removing records.',
}
export const LEVEL_INK: Record<Level, { bg: string; fg: string }> = {
  none: { bg: '#eceef3', fg: '#626977' },
  view: { bg: '#e6f0ff', fg: '#1d4ed8' },
  update: { bg: '#fff2d6', fg: '#916200' },
  delete: { bg: '#dff5df', fg: '#0a7a0a' },
}

const rank = (l: Level): number => Math.max(0, LEVELS.indexOf(l))

export function normalizeAccess(raw: unknown): AccessMap {
  const src = (raw ?? {}) as Record<string, string>
  const out = {} as AccessMap
  for (const u of ['U1', 'U2', 'U3', 'ASS'] as Unit[]) {
    const v = src[u] as Level
    out[u] = LEVELS.includes(v) ? v : 'none'
  }
  return out
}

// ---- The live copy for this session -------------------------------------
// Held outside React so any module can ask, and published through
// useSyncExternalStore so every screen re-renders the moment an admin changes it.

let current: AccessMap = FULL_ACCESS
const listeners = new Set<() => void>()

/** Called by the auth gate whenever the session's user is (re)loaded. */
export function setAccess(a: AccessMap | null | undefined) {
  const next = a ? normalizeAccess(a) : FULL_ACCESS
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  for (const fn of listeners) fn()
}
export const getAccess = (): AccessMap => current

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The whole map, re-rendering on change. */
export const useAccessMap = (): AccessMap => useSyncExternalStore(subscribe, getAccess, getAccess)

export const levelFor = (unit: Unit, map: AccessMap = current): Level => map[unit] ?? 'none'
export const allows = (unit: Unit, need: Level, map: AccessMap = current): boolean =>
  rank(levelFor(unit, map)) >= rank(need)

/** Units this user may open at all — what the workspace switcher offers. */
export const visibleUnits = (map: AccessMap = current): Unit[] =>
  (['U1', 'U2', 'U3', 'ASS'] as Unit[]).filter((u) => rank(map[u] ?? 'none') >= rank('view'))

/**
 * What the user may do in the workspace they are looking at.
 *
 * `canUpdate` is the one most screens want: it gates every upload, convert and save button.
 */
export function useCan(): { level: Level; canView: boolean; canUpdate: boolean; canDelete: boolean; readOnly: boolean } {
  const map = useAccessMap()
  const unit = useUnit()
  const level = levelFor(unit, map)
  const canView = allows(unit, 'view', map)
  const canUpdate = allows(unit, 'update', map)
  return { level, canView, canUpdate, canDelete: allows(unit, 'delete', map), readOnly: canView && !canUpdate }
}
