import type { ImportedFile } from './dataset'
import { clientId } from './realtime'
import { apiUrl } from './unit'

/** The one shared "current dashboard" record stored on the server (id = 'active'). */
export interface ActiveRecord {
  id: 'active'
  imports: ImportedFile[]
  savedAt: number
  by?: string
}

const API = '/api/active'

/** Pull the shared dashboard imports from the server list. */
export function activeImportsOf(list: ActiveRecord[] | undefined): ImportedFile[] {
  const rec = (list ?? []).find((x) => x.id === 'active')
  return rec?.imports ?? []
}

/**
 * Fetch the shared dashboard from the server.
 * Returns the imports (possibly empty) on success, or `null` when the server
 * can't be reached (caller should then keep whatever it restored locally).
 */
export async function fetchActive(): Promise<ImportedFile[] | null> {
  try {
    const r = await fetch(apiUrl(API), { cache: 'no-store' })
    if (!r.ok) throw new Error('bad status')
    const list = (await r.json()) as ActiveRecord[]
    return activeImportsOf(list)
  } catch {
    return null
  }
}

/** Publish the current dashboard so every device shows the same thing. */
export async function saveActive(imports: ImportedFile[]): Promise<void> {
  const rec: ActiveRecord = { id: 'active', imports, savedAt: Date.now(), by: clientId() }
  try {
    await fetch(apiUrl(API), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    })
  } catch {
    /* offline — the local copy still persists via dataset.saveActiveImports */
  }
}
