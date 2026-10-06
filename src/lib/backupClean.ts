// CHANGED: new client for the Backup Clean admin tool.
import { authHeaders } from './auth'

export interface MonthSummary {
  month: string
  label: string
  record_count: number
  total_bytes: number
  first_date: string
  last_date: string
  breakdown: Record<string, number>
}
export interface Summary {
  months: MonthSummary[]
  grand: { records: number; bytes: number; months: number }
  types: { id: string; label: string }[]
  config: { softDeleteDefault: boolean; minAgeDays: number; archiveKeepDays: number; timezone: string }
}
export interface Item {
  id: string
  type: string
  typeLabel: string
  date: string
  by: string
  name: string
  bytes: number
  files: number
  photos: number
}
export interface Preview {
  count: number
  bytes: number
  humanBytes: string
  breakdown: Record<string, number>
  users: string[]
  first_date: string | null
  last_date: string | null
  recent_count: number
  recent_cutoff: string
}
export interface Job {
  id: string
  state: 'running' | 'done' | 'partial' | 'failed'
  done: number
  total: number
  bytes: number
  errors: { id?: string; type?: string; error: string }[]
  soft: boolean
  archive?: string
}
export interface AuditRow {
  id: string
  createdAt: number
  admin_user: string
  admin_ip: string
  action: 'preview' | 'export' | 'delete' | 'restore'
  range_from: string | null
  range_to: string | null
  types?: string[]
  record_count?: number
  total_bytes?: number
  soft_delete?: boolean
  backup_taken?: boolean
  status: string
  error_summary?: string | null
  archive?: string
}
export interface ArchiveRow {
  file: string
  archivedAt: number
  by: string
  keepUntil: number
  count: number
  expired: boolean
}

export interface Selection {
  from?: string | null
  to?: string | null
  types?: string[]
  months?: string[]
}

const BASE = '/api/admin/backup-clean'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { ...authHeaders(init?.method === 'POST'), ...(init?.headers as Record<string, string> | undefined) },
  })
  if (!r.ok) {
    let msg = `Request failed (${r.status})`
    try {
      msg = (await r.json()).error || msg
    } catch {
      /* keep the generic message */
    }
    throw Object.assign(new Error(msg), { status: r.status })
  }
  return (await r.json()) as T
}

export const backupCleanApi = {
  summary: () => req<Summary>('/summary'),
  items: (p: { month: string; type?: string; q?: string; page?: number; perPage?: number }) =>
    req<{ total: number; page: number; pages: number; items: Item[] }>(
      `/items?month=${encodeURIComponent(p.month)}&type=${encodeURIComponent(p.type || 'all')}` +
        `&q=${encodeURIComponent(p.q || '')}&page=${p.page ?? 1}&per_page=${p.perPage ?? 50}`,
    ),
  preview: (s: Selection) => req<Preview>('/preview', { method: 'POST', body: JSON.stringify(s) }),
  del: (s: Selection & { soft: boolean; expected_count: number; backup_taken: boolean }) =>
    req<{ job_id: string; total: number; bytes: number }>('/delete', { method: 'POST', body: JSON.stringify(s) }),
  job: (id: string) => req<Job>(`/job/${id}`),
  history: () => req<AuditRow[]>('/history'),
  archive: () => req<ArchiveRow[]>('/archive'),
  restore: (file: string) => req<{ ok: boolean; restored: number }>('/restore', { method: 'POST', body: JSON.stringify({ file }) }),
}

/** Stream the export ZIP to disk. Returns the file name it saved. */
export async function downloadExport(s: Selection): Promise<string> {
  const r = await fetch(`${BASE}/export`, {
    method: 'POST',
    headers: { ...authHeaders(true) },
    body: JSON.stringify(s),
  })
  if (!r.ok) {
    let msg = 'Could not build the backup.'
    try {
      msg = (await r.json()).error || msg
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg)
  }
  const name = `backup_${s.from || 'all'}_to_${s.to || 'all'}.zip`
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return name
}

export function humanBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const fmtDay = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** 'YYYY-MM-DD' for N months back from today, in the browser's local calendar. */
export function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const todayKey = () => monthsAgo(0)
