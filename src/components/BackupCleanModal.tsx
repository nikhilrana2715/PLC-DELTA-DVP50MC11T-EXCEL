import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  backupCleanApi,
  downloadExport,
  fmtDay,
  humanBytes,
  monthsAgo,
  todayKey,
  type ArchiveRow,
  type AuditRow,
  type Item,
  type Job,
  type Preview,
  type Selection,
  type Summary,
} from '../lib/backupClean'

// CHANGED: this whole component is new — it replaces the old "Retention" control.
//
// Deliberately NOT blocking anywhere: the export button is always available and the
// 30-day recency rule only warns. Typing DELETE in the confirmation is the single gate,
// exactly as asked. Every action is audited server-side whether or not a backup was taken.

const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold'
const HINT = 'var(--ink-hint)'
const DANGER = 'color-mix(in srgb, #dc2626 46%, var(--ink))'

function Chips({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0)
  if (!entries.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className={chip} style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', color: 'var(--accent)' }}>
          {k}: {v}
        </span>
      ))}
    </div>
  )
}

/** Second modal: the typed-DELETE gate. */
function ConfirmDialog({
  preview,
  soft,
  backupTaken,
  recentAcknowledged,
  onCancel,
  onConfirm,
}: {
  preview: Preview
  soft: boolean
  backupTaken: boolean
  recentAcknowledged: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])
  const armed = typed === 'DELETE' // case-sensitive, as specified

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-3"
      style={{ background: 'rgba(15,23,42,0.6)' }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
    >
      <div className="bento w-full max-w-md flex flex-col overflow-hidden" style={{ maxHeight: 'min(90vh, 90dvh)' }} onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex items-center gap-2.5 px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <AlertTriangle size={20} style={{ color: DANGER }} />
          <div className="font-bold text-slate-800">Permanently delete data?</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-area p-5 flex flex-col gap-3 text-sm">
          <div className="rounded-xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, #dc2626 8%, var(--surface))' }}>
            <b>{preview.count.toLocaleString('en-IN')}</b> record(s) · <b>{preview.humanBytes}</b>
            <div className="text-[12px] mt-0.5" style={{ color: HINT }}>
              {fmtDay(preview.first_date || '')} – {fmtDay(preview.last_date || '')} · {preview.users.length} user(s)
            </div>
          </div>
          <Chips breakdown={preview.breakdown} />
          <div>
            <div className="font-semibold text-slate-700">Will be removed</div>
            <ul className="mt-1 ml-4 list-disc text-[12.5px] text-slate-600">
              <li>The records above, and any photos/files attached to them</li>
              <li>{soft ? 'Moved to the archive — restorable for 30 days' : 'Deleted from disk immediately — not restorable'}</li>
            </ul>
            <div className="font-semibold text-slate-700 mt-2">Will be kept</div>
            <ul className="mt-1 ml-4 list-disc text-[12.5px] text-slate-600">
              <li>Everything outside this range</li>
              <li>User accounts and login history</li>
              <li>The Backup Clean audit log (never deleted by this tool)</li>
            </ul>
          </div>
          {preview.recent_count > 0 && !recentAcknowledged && (
            <div className="text-[12px] font-semibold flex items-start gap-1.5" style={{ color: DANGER }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {preview.recent_count} of these were uploaded in the last 30 days.
            </div>
          )}
          {!backupTaken && (
            <div className="text-[12px] font-semibold flex items-start gap-1.5" style={{ color: DANGER }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> No backup taken for this range in this session.
            </div>
          )}
          <label className="block">
            <span className="text-[13px] font-semibold text-slate-700">
              Type <span className="font-mono px-1 rounded bg-slate-100">DELETE</span> to enable the button
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 font-mono"
            />
          </label>
        </div>
        <div className="shrink-0 flex gap-2 justify-end px-5 py-3 border-t border-[var(--hairline)]">
          <button ref={cancelRef} className="icon-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="icon-btn !text-white disabled:opacity-45"
            style={{ background: armed ? '#dc2626' : '#b9808a', borderColor: armed ? '#dc2626' : '#b9808a' }}
            disabled={!armed}
            onClick={onConfirm}
          >
            <Trash2 size={14} /> Permanently delete
          </button>
        </div>
      </div>
    </div>
  )
}

/** One month row: totals, chips, a select box and a lazily-loaded page of items. */
function MonthRow({
  m,
  checked,
  onToggle,
  typeFilter,
  query,
}: {
  m: Summary['months'][number]
  checked: boolean
  onToggle: () => void
  typeFilter: string
  query: string
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setBusy(true)
    backupCleanApi
      .items({ month: m.month, type: typeFilter, q: query, page, perPage: 50 })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setPages(r.pages)
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setBusy(false))
    return () => {
      alive = false
    }
  }, [open, page, m.month, typeFilter, query])

  return (
    <div className="rounded-xl border border-[var(--hairline)] overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50">
        <input type="checkbox" checked={checked} onChange={onToggle} className="w-4 h-4 shrink-0" aria-label={`Select ${m.label}`} />
        <button className="shrink-0 p-1 text-slate-400 hover:text-slate-700" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-800 text-[13.5px]">{m.label}</div>
          <div className="text-[11.5px]" style={{ color: HINT }}>
            {m.record_count.toLocaleString('en-IN')} records · {humanBytes(m.total_bytes)} · {fmtDay(m.first_date)} – {fmtDay(m.last_date)}
          </div>
        </div>
        <div className="hidden sm:block max-w-[45%]">
          <Chips breakdown={m.breakdown} />
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--hairline)]">
          {busy ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              <Loader2 size={18} className="mx-auto mb-1 animate-spin" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-sm" style={{ color: HINT }}>
              No matching items.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto scroll-area">
                <table className="w-max min-w-full text-[12.5px]">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {['Date', 'Type', 'Uploaded by', 'Name', 'Size'].map((h) => (
                        <th key={h} className="px-3 py-1.5 font-bold text-slate-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={`${it.type}-${it.id}`} className="border-t border-[var(--hairline)]">
                        <td className="px-3 py-1.5 whitespace-nowrap">{fmtDay(it.date)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{it.typeLabel}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: HINT }}>
                          {it.by}
                        </td>
                        <td className="px-3 py-1.5 max-w-[320px] truncate" title={it.name}>
                          {it.name}
                          {it.files > 0 && <span style={{ color: HINT }}> · {it.files} file(s)</span>}
                          {it.photos > 0 && <span style={{ color: HINT }}> · {it.photos} photo(s)</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{humanBytes(it.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 py-2 text-[12px]">
                  <button className="icon-btn !py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Prev
                  </button>
                  <span style={{ color: HINT }}>
                    Page {page} of {pages}
                  </span>
                  <button className="icon-btn !py-1" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function BackupCleanModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'data' | 'archive' | 'history'>('data')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [useRange, setUseRange] = useState(false)
  const [overrideRecent, setOverrideRecent] = useState(false)
  const [soft, setSoft] = useState(true)

  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [backupTaken, setBackupTaken] = useState(false)
  const [backupName, setBackupName] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [history, setHistory] = useState<AuditRow[]>([])
  const [archive, setArchive] = useState<ArchiveRow[]>([])

  const load = useCallback(() => {
    backupCleanApi
      .summary()
      .then((s) => {
        setSummary(s)
        setSoft(s.config.softDeleteDefault)
      })
      .catch((e: Error) => setLoadErr(e.message))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (tab === 'history') backupCleanApi.history().then(setHistory).catch(() => setHistory([]))
    if (tab === 'archive') backupCleanApi.archive().then(setArchive).catch(() => setArchive([]))
  }, [tab])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !confirming && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirming])

  // ---- what the admin has actually chosen ----
  const today = todayKey()
  const rangeInvalid = useRange && ((from && to && to < from) || from > today || to > today)
  const rangeMsg = !useRange
    ? ''
    : from && to && to < from
      ? '"To" must be on or after "From".'
      : from > today || to > today
        ? 'Dates cannot be in the future.'
        : ''
  const selection: Selection = useRange ? { from: from || null, to: to || null } : { months: [...picked] }
  const hasSelection = useRange ? !!(from || to) && !rangeInvalid : picked.size > 0

  // Live preview whenever the selection changes.
  useEffect(() => {
    if (!hasSelection) {
      setPreview(null)
      return
    }
    let alive = true
    setPreviewBusy(true)
    setErr('')
    backupCleanApi
      .preview(selection)
      .then((p) => alive && setPreview(p))
      .catch((e: Error) => alive && setErr(e.message))
      .finally(() => alive && setPreviewBusy(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRange, from, to, [...picked].join(','), hasSelection])

  // A new selection invalidates the backup taken for the previous one.
  useEffect(() => {
    setBackupTaken(false)
    setBackupName('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useRange, from, to, [...picked].join(',')])

  const preset = (months: number) => {
    setUseRange(true)
    setPicked(new Set())
    setFrom('')
    setTo(monthsAgo(months))
  }

  const doExport = async () => {
    setExporting(true)
    setErr('')
    try {
      const name = await downloadExport(selection)
      setBackupTaken(true)
      setBackupName(name)
      setMsg(`Backup downloaded: ${name}`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const doDelete = async () => {
    if (!preview) return
    setConfirming(false)
    setErr('')
    setMsg('')
    try {
      const started = await backupCleanApi.del({ ...selection, soft, expected_count: preview.count, backup_taken: backupTaken })
      const poll = async () => {
        const j = await backupCleanApi.job(started.job_id)
        setJob(j)
        if (j.state === 'running') setTimeout(poll, 500)
        else {
          load()
          setPicked(new Set())
          setMsg(
            j.state === 'done'
              ? `${j.done.toLocaleString('en-IN')} record(s) ${j.soft ? 'archived' : 'deleted'} · ${humanBytes(j.bytes)} freed${backupName ? ` · backup ${backupName}` : ''}`
              : `Finished with ${j.errors.length} problem(s).`,
          )
        }
      }
      poll()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // CHANGED: recency is advisory. The delete button does NOT depend on it — the only
  // gate anywhere in this flow is typing DELETE in the confirmation.
  const canDelete = !!preview && preview.count > 0 && !rangeInvalid

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-3 md:p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Backup Clean"
    >
      <div
        className="bento w-full flex flex-col overflow-hidden"
        style={{ maxWidth: 900, maxHeight: 'min(90vh, 90dvh)', animation: 'rise 0.2s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* sticky header */}
        <div className="shrink-0 flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#dc2626)' }}>
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800">Backup Clean</div>
            <div className="text-xs" style={{ color: HINT }}>
              All uploaded data, grouped by month
              {summary && <> · times shown in {summary.config.timezone}</>}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            {(['data', 'archive', 'history'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-2.5 py-1 text-[12.5px] font-bold border transition ${tab === t ? 'border-transparent' : 'hover:brightness-95'}`}
                /* --accent is dark indigo in light mode and PALE indigo in dark mode, so white
                   label text drops to 2.3:1 on dark. --surface inverts with the theme, which
                   keeps the active tab readable in both. */
                style={tab === t ? { background: 'var(--accent)', color: 'var(--surface)' } : { borderColor: 'var(--hairline)', color: 'var(--ink-2)' }}
              >
                {t === 'data' ? 'Data' : t === 'archive' ? 'Archive' : 'History'}
              </button>
            ))}
          </div>
          <button className="text-slate-400 hover:text-slate-700 p-1 shrink-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* scrolling body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-area p-5 flex flex-col gap-4">
          {loadErr && <div className="text-sm font-semibold" style={{ color: DANGER }}>{loadErr}</div>}

          {tab === 'data' && summary && (
            <>
              <div className="rounded-xl px-3.5 py-2.5" style={{ background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))' }}>
                <span className="font-bold text-slate-800">
                  Total: {summary.grand.records.toLocaleString('en-IN')} records · {humanBytes(summary.grand.bytes)}
                </span>
                <span style={{ color: 'var(--ink-2)' }}> across {summary.grand.months} month(s)</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 rounded-xl border border-[var(--hairline)] px-2.5 py-1.5 flex-1 min-w-[180px]">
                  <Search size={14} style={{ color: HINT }} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search uploader or file name…"
                    className="w-full text-sm outline-none bg-transparent"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="rounded-xl border border-[var(--hairline)] px-2.5 py-1.5 text-sm outline-none"
                >
                  <option value="all">All types</option>
                  {summary.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button className="text-[12.5px] font-bold" style={{ color: 'var(--accent)' }} onClick={() => { setUseRange(false); setPicked(new Set(summary.months.map((m) => m.month))) }}>
                  Select all
                </button>
                <button className="text-[12.5px] font-bold" style={{ color: HINT }} onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              </div>

              {summary.months.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: HINT }}>
                  No uploaded data found.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {summary.months.map((m) => (
                    <MonthRow
                      key={m.month}
                      m={m}
                      checked={picked.has(m.month)}
                      onToggle={() =>
                        setPicked((p) => {
                          const n = new Set(p)
                          if (n.has(m.month)) n.delete(m.month)
                          else n.add(m.month)
                          setUseRange(false)
                          return n
                        })
                      }
                      typeFilter={typeFilter}
                      query={query}
                    />
                  ))}
                </div>
              )}

              {/* ---- date range ---- */}
              <div className="rounded-xl border border-[var(--hairline)] p-3.5 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-800">Or pick a date range</span>
                  {[['Older than 3 months', 3], ['Older than 6 months', 6], ['Older than 1 year', 12]].map(([label, n]) => (
                    <button
                      key={label as string}
                      onClick={() => preset(n as number)}
                      className="rounded-full border border-[var(--hairline)] px-2.5 py-0.5 text-[11.5px] font-bold hover:brightness-95"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {label as string}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">From</span>
                    <input
                      type="date"
                      value={from}
                      max={today}
                      onChange={(e) => { setFrom(e.target.value); setUseRange(true); setPicked(new Set()) }}
                      className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">To</span>
                    <input
                      type="date"
                      value={to}
                      max={today}
                      onChange={(e) => { setTo(e.target.value); setUseRange(true); setPicked(new Set()) }}
                      className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none"
                    />
                  </label>
                </div>
                {rangeMsg && (
                  <div className="text-[12px] font-semibold" style={{ color: DANGER }}>
                    {rangeMsg}
                  </div>
                )}
              </div>

              {/* ---- impact ---- */}
              {hasSelection && (
                <div className="rounded-xl border p-3.5 flex flex-col gap-2.5" style={{ borderColor: 'color-mix(in srgb, #dc2626 25%, var(--surface))', background: 'color-mix(in srgb, #dc2626 5%, var(--surface))' }}>
                  <div className="text-sm font-bold text-slate-800">Impact</div>
                  {previewBusy ? (
                    <div className="text-sm" style={{ color: HINT }}>
                      <Loader2 size={14} className="inline animate-spin mr-1" /> Checking…
                    </div>
                  ) : preview ? (
                    preview.count === 0 ? (
                      <div className="text-sm font-semibold" style={{ color: DANGER }}>
                        No data found in this range.
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-slate-700">
                          This will {soft ? 'archive' : 'permanently delete'} <b>{preview.count.toLocaleString('en-IN')}</b> record(s) (
                          <b>{preview.humanBytes}</b>) uploaded between <b>{fmtDay(preview.first_date || '')}</b> and{' '}
                          <b>{fmtDay(preview.last_date || '')}</b> by <b>{preview.users.length}</b> user(s).
                        </div>
                        <Chips breakdown={preview.breakdown} />
                        {preview.recent_count > 0 && (
                          <label className="flex items-start gap-2 text-[12.5px]">
                            <input type="checkbox" checked={overrideRecent} onChange={(e) => setOverrideRecent(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
                            <span style={{ color: DANGER }}>
                              <b>{preview.recent_count}</b> of these are from the last {summary.config.minAgeDays} days (after{' '}
                              {fmtDay(preview.recent_cutoff)}). Tick to say you meant to include them.
                            </span>
                          </label>
                        )}
                      </>
                    )
                  ) : null}

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button className="icon-btn" onClick={doExport} disabled={exporting || !preview?.count}>
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {exporting ? 'Building…' : 'Download backup of this range'}
                    </button>
                    {backupTaken ? (
                      <span className="text-[12px] font-semibold text-emerald-600 inline-flex items-center gap-1">
                        <CheckCircle2 size={13} /> Backup saved
                      </span>
                    ) : (
                      // CHANGED: a warning, not a gate — delete stays enabled.
                      <span className="text-[12px] font-semibold inline-flex items-center gap-1" style={{ color: DANGER }}>
                        <AlertTriangle size={13} /> No backup taken for this range
                      </span>
                    )}
                  </div>

                  <label className="flex items-center gap-2 text-[12.5px] pt-1">
                    <input type="checkbox" checked={!soft} onChange={(e) => setSoft(!e.target.checked)} className="w-4 h-4" />
                    <span className="text-slate-700">
                      Hard delete (skip the {summary.config.archiveKeepDays}-day archive — <b>cannot be restored</b>)
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          {tab === 'archive' && (
            <div className="flex flex-col gap-2">
              <div className="text-sm" style={{ color: HINT }}>
                Soft-deleted records stay here for {summary?.config.archiveKeepDays ?? 30} days, then go for good.
              </div>
              {archive.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: HINT }}>
                  Nothing in the archive.
                </div>
              ) : (
                archive.map((a) => (
                  <div key={a.file} className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] px-3 py-2.5">
                    <Archive size={16} style={{ color: HINT }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-800">{a.count} record(s)</div>
                      <div className="text-[11.5px]" style={{ color: HINT }}>
                        by {a.by} · {new Date(a.archivedAt).toLocaleString('en-IN')} ·{' '}
                        {a.expired ? 'past the restore window' : `restorable until ${new Date(a.keepUntil).toLocaleDateString('en-IN')}`}
                      </div>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={async () => {
                        await backupCleanApi.restore(a.file)
                        setArchive(await backupCleanApi.archive())
                        load()
                        setMsg('Records restored.')
                      }}
                    >
                      <Undo2 size={14} /> Restore
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="overflow-x-auto scroll-area">
              <table className="w-max min-w-full text-[12.5px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    {['When', 'Admin', 'IP', 'Action', 'Range', 'Records', 'Size', 'Mode', 'Backup', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-1.5 font-bold text-slate-600 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-[var(--hairline)]">
                      <td className="px-3 py-1.5 whitespace-nowrap">{new Date(h.createdAt).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{h.admin_user}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: HINT }}>{h.admin_ip || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap font-semibold">{h.action}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{h.range_from || h.range_to ? `${h.range_from ?? '…'} → ${h.range_to ?? '…'}` : '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{h.record_count ?? '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{h.total_bytes ? humanBytes(h.total_bytes) : '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{h.soft_delete === undefined ? '—' : h.soft_delete ? 'soft' : 'hard'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{h.backup_taken === undefined ? '—' : h.backup_taken ? 'yes' : 'no'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{h.status}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center" style={{ color: HINT }}>
                        No Backup Clean actions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {job && job.state === 'running' && (
            <div className="rounded-xl border border-[var(--hairline)] p-3">
              <div className="text-sm font-semibold text-slate-700">
                Deleting {job.total.toLocaleString('en-IN')} records… {job.done}/{job.total}
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={job.done} aria-valuemin={0} aria-valuemax={job.total}>
                <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round((job.done / Math.max(1, job.total)) * 100)}%`, background: 'var(--accent)' }} />
              </div>
            </div>
          )}
          {job && job.state !== 'running' && job.errors.length > 0 && (
            <div className="rounded-xl border p-3 text-[12.5px]" style={{ borderColor: 'color-mix(in srgb, #dc2626 25%, var(--surface))' }}>
              <div className="font-bold" style={{ color: DANGER }}>
                {job.errors.length} item(s) failed
              </div>
              {job.errors.slice(0, 8).map((e, i) => (
                <div key={i} style={{ color: HINT }}>
                  {e.type ?? ''} {e.id ?? ''} — {e.error}
                </div>
              ))}
            </div>
          )}
          {msg && (
            <div className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 size={15} /> {msg}
            </div>
          )}
          {err && (
            <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: DANGER }}>
              <AlertTriangle size={15} /> {err}
            </div>
          )}
        </div>

        {/* sticky footer */}
        <div className="shrink-0 flex items-center gap-2 justify-end px-5 py-3 border-t border-[var(--hairline)]">
          <span className="mr-auto text-[12px]" style={{ color: HINT }}>
            {hasSelection && preview ? `${preview.count.toLocaleString('en-IN')} record(s) selected · ${preview.humanBytes}` : 'Select months or a date range'}
          </span>
          <button className="icon-btn" onClick={onClose}>
            Close
          </button>
          <button
            className="icon-btn !text-white disabled:opacity-45"
            style={{ background: '#dc2626', borderColor: '#dc2626' }}
            disabled={!canDelete}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={14} /> Delete selected data
          </button>
        </div>
      </div>

      {confirming && preview && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog preview={preview} soft={soft} backupTaken={backupTaken} recentAcknowledged={overrideRecent} onCancel={() => setConfirming(false)} onConfirm={doDelete} />
        </div>
      )}
    </div>
  )
}
