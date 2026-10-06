import { useEffect, useState } from 'react'
import { AppWindow, Database, FileSpreadsheet, HardDrive, Loader2, Paperclip, RefreshCw, X } from 'lucide-react'
import { adminApi, type StorageFile, type StorageGroup, type StorageReport } from '../lib/auth'

/**
 * Everything the app occupies on disk, in the order an admin asks it:
 *   1. how big is the app itself,
 *   2. how big is the data it holds,
 *   3. which uploaded files make up that data.
 *
 * Every figure is real bytes read off the filesystem. Record counts mislead — one note with
 * a 90 MB attachment outweighs three hundred meetings — so nothing here is estimated.
 */

/** Bytes → "1.2 MB". One decimal: admins compare sizes, they don't audit them. */
export function fmtBytes(b: number): string {
  if (!b) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)))
  const v = b / Math.pow(1024, i)
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`
}

// One hue per group, reused by the bar and the row dot so the two read as the same thing.
const HUE: Record<string, string> = {
  uploads: '#3b82f6',
  meetings: '#7c6cf0',
  notes: '#22c88a',
  assembly: '#ff8a4c',
  monthlyplan: '#eda100',
  routecard: '#14b8a6',
  cumulative: '#06b6d4',
  cpk: '#ec4899',
  audit: '#64748b',
  accounts: '#8b5cf6',
  archive: '#f26464',
  loprofile: '#a3a3a3',
  other: '#94a3b8',
  dist: '#3b82f6',
  src: '#7c6cf0',
  servercode: '#22c88a',
  config: '#eda100',
  deps: '#a3a3a3',
}
const hueOf = (k: string) => HUE[k] ?? '#94a3b8'
/** Same mix used across the app: keeps the hue but clears WCAG AA on either theme. */
const ink = (hue: string) => `color-mix(in srgb, ${hue} 46%, var(--ink))`

type Tab = 'app' | 'data' | 'files'

export function StorageModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<StorageReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('app')

  const load = async () => {
    setLoading(true)
    setData(await adminApi.storage())
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // node_modules is walked in the background; poll until that first pass lands.
  useEffect(() => {
    if (!data?.app.pending) return
    const id = setTimeout(() => void load(), 4000)
    return () => clearTimeout(id)
  }, [data])

  const appTotal = data?.app.totalBytes ?? 0
  const dataTotal = data?.totalBytes ?? 0
  const files = data?.files ?? []

  const TABS: { id: Tab; label: string; icon: typeof AppWindow; value: string }[] = [
    { id: 'app', label: 'Application', icon: AppWindow, value: fmtBytes(appTotal) },
    { id: 'data', label: 'Data', icon: Database, value: fmtBytes(dataTotal) },
    { id: 'files', label: 'Uploaded Files', icon: FileSpreadsheet, value: String(files.length) },
  ]

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-3 md:p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Storage"
    >
      <div
        className="bento w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 820, maxHeight: 'min(92vh, 92dvh)', animation: 'rise 0.18s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--hairline)]">
          <div className="stat-icon stat-icon-sm grad-blue shrink-0">
            <HardDrive size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 text-lg leading-tight">Storage</div>
            <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
              {loading && !data
                ? 'Reading disk…'
                : data
                  ? `App ${fmtBytes(appTotal)}${data.app.pending ? '+' : ''} · Data ${fmtBytes(dataTotal)} · live from disk`
                  : 'Could not read storage'}
            </div>
          </div>
          <button className="icon-btn shrink-0" onClick={() => void load()} disabled={loading} title="Refresh">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="text-slate-400 hover:text-slate-700 p-1 shrink-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* three headline tiles that also switch the view */}
        <div className="shrink-0 grid grid-cols-3 gap-2 md:gap-2.5 px-3 md:px-4 py-3 border-b border-[var(--hairline)]">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`stat-card ${t.id === 'app' ? 'tint-blue' : t.id === 'data' ? 'tint-emerald' : 'tint-violet'} p-2.5 md:p-3 text-left min-w-0 transition ${
                tab === t.id ? 'ring-2 ring-indigo-500' : 'hover:shadow-sm'
              }`}
            >
              <div className={`stat-icon stat-icon-sm ${t.id === 'app' ? 'grad-blue' : t.id === 'data' ? 'grad-emerald' : 'grad-violet'}`}>
                <t.icon size={16} />
              </div>
              <div className="mt-2 text-[11px] md:text-xs font-semibold text-slate-700 truncate">{t.label}</div>
              <div className="text-lg md:text-xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>
                {t.value}
                {t.id === 'app' && data?.app.pending && <span className="text-xs font-bold" style={{ color: 'var(--ink-hint)' }}>+…</span>}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-area p-4 md:p-5">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 text-sm py-14" style={{ color: 'var(--ink-hint)' }}>
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : !data ? (
            <div className="text-sm text-center py-14" style={{ color: 'var(--ink-hint)' }}>
              Storage information is not available.
            </div>
          ) : tab === 'files' ? (
            <FileList files={files} />
          ) : (
            <Breakdown
              groups={tab === 'app' ? data.app.groups : data.groups}
              total={tab === 'app' ? appTotal : dataTotal}
              note={
                tab === 'app'
                  ? data.app.pending
                    ? 'Dependencies are still being measured in the background…'
                    : 'The program itself. Deleting data below never touches this.'
                  : 'Everything users have put into the app. This is what Backup Clean removes.'
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

function Breakdown({ groups, total, note }: { groups: StorageGroup[]; total: number; note: string }) {
  const shown = groups.filter((g) => g.bytes > 0 || g.pending)
  const pct = (b: number) => (total > 0 ? (b / total) * 100 : 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="text-3xl md:text-4xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--ink)' }}>
          {fmtBytes(total)}
        </div>
        <div className="text-xs font-semibold pb-1" style={{ color: 'var(--ink-hint)' }}>
          {note}
        </div>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        {shown.map((g) => (
          <span key={g.key} title={`${g.label} — ${fmtBytes(g.bytes)}`} style={{ width: `${pct(g.bytes)}%`, background: hueOf(g.key) }} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {shown.map((g) => (
          <Row key={g.key} g={g} pct={pct(g.bytes)} />
        ))}
      </div>
    </div>
  )
}

function Row({ g, pct }: { g: StorageGroup; pct: number }) {
  const [open, setOpen] = useState(false)
  const hasDetail = !!g.detail?.some((d) => d.bytes > 0)

  return (
    <div className="rounded-xl" style={{ background: open ? 'var(--surface-2)' : undefined }}>
      <button
        onClick={() => hasDetail && setOpen(!open)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-xl ${hasDetail ? 'hover:bg-[var(--surface-2)]' : 'cursor-default'}`}
      >
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: hueOf(g.key) }} />
        <span className="text-[13px] font-semibold text-slate-700 min-w-0 flex-1 truncate">
          {g.label}
          {g.cache && (
            <span
              className="ml-1.5 text-[9.5px] font-bold rounded px-1 py-0.5 align-middle"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-hint)' }}
            >
              CACHE
            </span>
          )}
          {g.count > 0 && (
            <span className="ml-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-hint)' }}>
              {g.count} {g.unit}
            </span>
          )}
        </span>
        {g.pending ? (
          <span className="text-[11px] font-semibold shrink-0 inline-flex items-center gap-1" style={{ color: 'var(--ink-hint)' }}>
            <Loader2 size={11} className="animate-spin" /> measuring
          </span>
        ) : (
          <>
            <span className="text-[11px] tabular-nums shrink-0 w-10 text-right" style={{ color: 'var(--ink-hint)' }}>
              {pct < 0.1 ? '<0.1' : pct.toFixed(1)}%
            </span>
            <span className="text-[13px] font-extrabold tabular-nums shrink-0 w-20 text-right" style={{ color: ink(hueOf(g.key)) }}>
              {fmtBytes(g.bytes)}
            </span>
          </>
        )}
      </button>

      {open && g.detail && (
        <div className="px-2.5 pb-2 pl-8 flex flex-col gap-0.5">
          {g.detail
            .filter((d) => d.bytes > 0)
            .map((d) => (
              <div key={d.label} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--ink-hint)' }}>
                  {d.label}
                  {d.count ? ` · ${d.count}` : ''}
                </span>
                <span className="font-bold tabular-nums text-slate-700">{fmtBytes(d.bytes)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

/** Every uploaded sheet and note attachment, largest first — the "what is taking the room" list. */
function FileList({ files }: { files: StorageFile[] }) {
  const [q, setQ] = useState('')
  const shown = files.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()) || f.date.includes(q))
  const total = files.reduce((a, f) => a + f.bytes, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="text-3xl md:text-4xl font-extrabold tracking-tight leading-none" style={{ color: 'var(--ink)' }}>
          {files.length}
        </div>
        <div className="text-xs font-semibold pb-1" style={{ color: 'var(--ink-hint)' }}>
          file(s) uploaded · {fmtBytes(total)} together · largest first
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by file name or date…"
        className="w-full text-sm rounded-xl border border-[var(--hairline)] px-3 py-2 bg-[var(--surface)] outline-none text-slate-700"
      />

      <div className="flex flex-col gap-1">
        {shown.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl" style={{ background: i % 2 ? 'var(--surface-2)' : undefined }}>
            <span className="shrink-0" style={{ color: ink(f.kind === 'sheet' ? '#3b82f6' : '#22c88a') }}>
              {f.kind === 'sheet' ? <FileSpreadsheet size={15} /> : <Paperclip size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-slate-700 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="block text-[11px]" style={{ color: 'var(--ink-hint)' }}>
                {f.date || '—'}
                {f.shift ? ` · ${f.shift}` : ''}
                {f.rows ? ` · ${f.rows} row(s)` : ''}
              </span>
            </span>
            <span className="text-[13px] font-extrabold tabular-nums shrink-0" style={{ color: ink(f.kind === 'sheet' ? '#3b82f6' : '#22c88a') }}>
              {fmtBytes(f.bytes)}
            </span>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="text-sm text-center py-10" style={{ color: 'var(--ink-hint)' }}>
            No files match “{q}”.
          </div>
        )}
      </div>
    </div>
  )
}
