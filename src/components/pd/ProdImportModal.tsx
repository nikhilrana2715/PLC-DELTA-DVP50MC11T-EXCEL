import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Cog,
  Eye,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { parseProdSummary, type ProdSummary } from '../../lib/prodSummary'
import { MonthYearSelect, monthLong } from '../MonthRangePicker'
import {
  addImport,
  closeImportModal,
  convertToKpi,
  loadImports,
  removeAllImports,
  removeImport,
  emptyRowsOf,
  monthOfReport,
  setImportMonth,
  statsFor,
  useImports,
  type ProdImport,
} from '../../lib/prodImport'
import { useT } from '../../lib/i18n'

/**
 * The Production Summary import screen (Unit 2 / Unit 3).
 *
 * Same two-step flow as the Unit 1 importer, pointed at the other workbook format.
 *
 * Deliberately a two-step flow: the header button opens THIS, it does not open a file picker.
 * Choosing a file only parses and stores it — nothing on the KPI page moves until the import
 * has been viewed and explicitly converted. A wrong workbook can be deleted before it ever
 * touches the numbers the morning meeting reads off the wall.
 *
 * Screens: list (drop a file + recent imports) → detail (what was read) → convert.
 */

const fmt = (n: number) => Math.round(n || 0).toLocaleString('en-IN')
const fmtDate = (d: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function Pill({ text, tone }: { text: string; tone: 'green' | 'blue' | 'grey' | 'amber' }) {
  const hue = tone === 'green' ? '#22c88a' : tone === 'blue' ? '#3b82f6' : tone === 'amber' ? '#f59e0b' : '#94a3b8'
  const ink = tone === 'green' ? '#0f9d58' : tone === 'blue' ? '#2563eb' : tone === 'amber' ? '#a16207' : '#5f6878'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${hue} 16%, var(--surface))`, color: `color-mix(in srgb, ${ink} 80%, var(--ink))` }}
    >
      {text}
    </span>
  )
}

/** One number with a caption — used for both the drop-zone summary and the detail header. */
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] px-3 py-2 min-w-0" style={{ background: 'var(--surface-2)' }}>
      <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--ink-hint)' }}>
        {label}
      </div>
      <div className="text-lg font-extrabold tabular-nums leading-tight" style={{ color: tone || 'var(--ink)' }}>
        {value}
      </div>
    </div>
  )
}

export function ProdImportModal({ onConverted }: { onConverted?: () => void }) {
  const t = useT()
  const imports = useImports()
  const [viewId, setViewId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadImports()
  }, [])

  // Esc closes, the way every other dialog in the app behaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeImportModal()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const viewing = viewId ? imports.find((i) => i.id === viewId) || null : null

  /**
   * The month the next file is filed under — used only when the sheet carries no dates.
   * The record can be re-filed from its detail screen afterwards.
   */
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [detected, setDetected] = useState(false)

  const onFile = async (f: File | null | undefined) => {
    if (!f || busy) return
    setErr('')
    setBusy(true)
    try {
      const rep: ProdSummary = parseProdSummary(await f.arrayBuffer(), f.name)
      if (!rep.rows.length) throw new Error(t('No data rows were found in this workbook.'))
      const found = monthOfReport(rep)
      setDetected(!!found)
      if (found) setMonth(found)
      const rec = await addImport(rep, statsFor(rep), month)
      setViewId(rec.id) // land straight on what was read — the point of the extra step
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)' }} onClick={closeImportModal} />

      <div
        className="relative w-full sm:max-w-5xl max-h-[94vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[var(--hairline)] shadow-2xl overflow-hidden"
        style={{ background: 'var(--surface)' }}
      >
        {/* ---- header ---- */}
        <div className="flex items-center gap-3 px-4 md:px-5 py-3 border-b border-[var(--hairline)] shrink-0">
          {viewing && (
            <button
              onClick={() => setViewId(null)}
              className="shrink-0 w-8 h-8 grid place-items-center rounded-lg border border-[var(--hairline)] hover:bg-black/5"
              style={{ color: 'var(--ink-2)' }}
              aria-label={t('Back')}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="stat-icon stat-icon-sm grad-blue shrink-0">
            <UploadCloud size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800 text-[15px] truncate">{viewing ? t('Import details') : t('Import Production Summary')}</div>
            <div className="text-xs truncate" style={{ color: 'var(--ink-hint)' }}>
              {viewing ? viewing.fileName : t('Choose the Production Summary workbook — nothing changes until you convert it.')}
            </div>
          </div>
          <button
            onClick={closeImportModal}
            className="shrink-0 w-8 h-8 grid place-items-center rounded-lg hover:bg-black/5"
            style={{ color: 'var(--ink-hint)' }}
            aria-label={t('Close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* ---- body ---- */}
        <div className="flex-1 overflow-y-auto scroll-area p-4 md:p-5 flex flex-col gap-4 min-w-0">
          {err && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold"
              style={{ background: 'color-mix(in srgb, #f26464 12%, var(--surface))', color: '#b0201f' }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span className="min-w-0 whitespace-pre-line">{err}</span>
            </div>
          )}

          {!viewing ? (
            <>
              {/* ---- step 1: pick a file ---- */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  void onFile(e.dataTransfer.files?.[0])
                }}
                className="rounded-2xl border-2 border-dashed px-4 py-7 md:py-9 text-center transition"
                style={{
                  borderColor: drag ? '#2563eb' : 'var(--hairline)',
                  background: drag ? 'color-mix(in srgb, #3b82f6 8%, var(--surface))' : 'var(--surface-2)',
                }}
              >
                <div className="stat-icon stat-icon-sm grad-blue mx-auto">
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <FileSpreadsheet size={17} />}
                </div>
                <div className="mt-2.5 font-bold text-slate-800 text-sm">
                  {busy ? t('Reading the workbook…') : t('Select the Production Summary file')}
                </div>
                <div className="mt-1 text-xs px-2" style={{ color: 'var(--ink-hint)' }}>
                  {busy ? t('Large sheets take a few seconds.') : t('Drag the .xlsx here, or choose it below. Excel files only.')}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl text-white text-sm font-bold px-4 py-2.5 shadow-sm disabled:opacity-60"
                  style={{ background: '#2563eb' }}
                >
                  <UploadCloud size={15} /> {t('Select file')}
                </button>
              </div>

              {/* Which month the file belongs to. The sheet answers this itself whenever it
                  carries dates; this is the fallback, and the record can be re-filed later. */}
              <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-3 flex-wrap">
                <CalendarDays size={16} className="shrink-0" style={{ color: '#4f46e5' }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-slate-800 leading-tight">{t('Month of this report')}</div>
                  <div className="text-[11.5px] leading-tight" style={{ color: detected ? '#0f9d58' : 'var(--ink-hint)' }}>
                    {detected
                      ? t("Read from the last file's own dates.")
                      : t('Read from the sheet when it has dates — otherwise this is used.')}
                  </div>
                </div>
                <div className="ml-auto">
                  <MonthYearSelect value={month} onChange={setMonth} disabled={busy} />
                </div>
              </div>

              {/* ---- step 2: what has been imported so far ---- */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <div className="font-bold text-slate-800 text-sm">{t('Recent imports')}</div>
                  <div className="text-xs" style={{ color: 'var(--ink-hint)' }}>
                    {imports.length ? `${imports.length} ${t('file(s)')}` : t('nothing imported yet')}
                  </div>
                  {imports.length > 0 && (
                    <button
                      onClick={() => setConfirmAll(true)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold"
                      style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
                    >
                      <Trash2 size={13} /> {t('Delete all')}
                    </button>
                  )}
                </div>

                {confirmAll && (
                  <div
                    className="mb-2 rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap"
                    style={{ background: 'color-mix(in srgb, #f26464 12%, var(--surface))' }}
                  >
                    <span className="text-[13px] font-semibold min-w-0" style={{ color: '#b0201f' }}>
                      {t('Delete every import? The KPI page falls back to the shift report.')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => setConfirmAll(false)} className="text-[12px] font-bold px-2.5 py-1.5" style={{ color: 'var(--ink-2)' }}>
                        {t('Cancel')}
                      </button>
                      <button
                        onClick={async () => {
                          setConfirmAll(false)
                          setViewId(null)
                          await removeAllImports()
                        }}
                        className="rounded-lg text-white text-[12px] font-bold px-3 py-1.5"
                        style={{ background: '#c0392b' }}
                      >
                        {t('Delete all')}
                      </button>
                    </div>
                  </div>
                )}

                {imports.length === 0 ? (
                  <div className="rounded-xl border border-[var(--hairline)] px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-hint)' }}>
                    {t('Imported files appear here with their row counts.')}
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--hairline)] overflow-x-auto scroll-area">
                    <table className="w-max min-w-full text-[12.5px]" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead>
                        <tr>
                          {['FILE NAME', 'MONTH', 'TYPE', 'UPLOADED AT', 'TOTAL ROWS', 'WITH DATA', 'EMPTY', 'STATUS', 'ACTIONS'].map((h, i) => (
                            <th
                              key={h}
                              className={`px-3 py-2.5 font-bold uppercase tracking-wide text-[10.5px] whitespace-nowrap ${
                                i >= 4 && i <= 6 ? 'text-right' : 'text-left'
                              }`}
                              style={{ background: 'var(--surface-2)', color: 'var(--ink-hint)' }}
                            >
                              {t(h)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {imports.map((im) => {
                          const s = im.stats || statsFor(im)
                          return (
                            <tr key={im.id}>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] max-w-[240px]">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileSpreadsheet size={14} className="shrink-0" style={{ color: '#0f9d58' }} />
                                  <span className="font-bold text-slate-800 truncate" title={im.fileName}>
                                    {im.fileName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] whitespace-nowrap font-bold" style={{ color: 'var(--ink)' }}>
                                {(() => {
                                  // An import saved before this field existed still knows its
                                  // month — its rows carry dates.
                                  const m = im.month || monthOfReport(im)
                                  return m ? monthLong(m) : '—'
                                })()}
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] whitespace-nowrap">
                                <Pill text={t('Production Summary')} tone="blue" />
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                                {fmtWhen(im.savedAt)}
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                                {fmt(s.total)}
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] text-right tabular-nums font-bold" style={{ color: '#0f9d58' }}>
                                {fmt(s.withData)}
                              </td>
                              <td
                                className="px-3 py-2.5 border-t border-[var(--hairline)] text-right tabular-nums"
                                style={{ color: 'var(--ink-hint)' }}
                                title="Rows the sheet lists with nothing recorded — imported, just blank"
                              >
                                {fmt(s.empty)}
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] whitespace-nowrap">
                                {im.convertedAt ? <Pill text={t('Implemented')} tone="green" /> : <Pill text={t('Ready')} tone="grey" />}
                              </td>
                              <td className="px-3 py-2.5 border-t border-[var(--hairline)] whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setViewId(im.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold"
                                    style={{ borderColor: 'var(--hairline)', color: '#2563eb' }}
                                  >
                                    <Eye size={13} /> {t('View')}
                                  </button>
                                  <button
                                    onClick={() => void removeImport(im.id)}
                                    className="w-7 h-7 grid place-items-center rounded-lg border"
                                    style={{ borderColor: 'var(--hairline)', color: '#c0392b' }}
                                    aria-label={t('Delete')}
                                    title={t('Delete')}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          ) : (
            <ImportDetail
              im={viewing}
              onConvert={() => {
                // The store flips the active import synchronously, so the sheet is already on
                // screen behind this. Closing first — rather than after the write-back of a
                // thousand rows — keeps the click from feeling like it did nothing.
                closeImportModal()
                onConverted?.()
                void convertToKpi(viewing.id)
              }}
              onDeleteAll={async () => {
                setViewId(null)
                await removeAllImports()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** What a single import actually contains, before it is allowed near the KPI cards. */
function ImportDetail({ im, onConvert, onDeleteAll }: { im: ProdImport; onConvert: () => void; onDeleteAll: () => void }) {
  const t = useT()
  const [confirm, setConfirm] = useState(false)
  const s = im.stats || statsFor(im)
  const from = im.dates[0]
  const to = im.dates[im.dates.length - 1]
  /** The month on screen, and where it came from — read back for older imports. */
  const readMonth = monthOfReport(im)
  const fromSheet = readMonth !== ''
  const month = im.month || readMonth

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Which month this summary is filed under — correctable here, because a sheet with no
          dates was filed on a guess and a mis-set picker should not be permanent. */}
      <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-3 flex-wrap">
        <CalendarDays size={16} className="shrink-0" style={{ color: '#4f46e5' }} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-800 leading-tight">
            {t('Month')} · {month ? monthLong(month) : t('not set')}
          </div>
          <div className="text-[11.5px] leading-tight" style={{ color: 'var(--ink-hint)' }}>
            {fromSheet ? t("Read from the sheet's own dates.") : t('Chosen on upload — this sheet carries no dates.')}
          </div>
        </div>
        <div className="ml-auto">
          <MonthYearSelect
            value={month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            onChange={(m) => void setImportMonth(im.id, m)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Stat label={t('Total rows')} value={fmt(s.total)} />
        <Stat label={t('With data')} value={fmt(s.withData)} tone="#0f9d58" />
        <Stat label={t('Empty rows')} value={fmt(s.empty)} />
        <Stat label={t('Machines')} value={fmt(im.machines.length)} />
        <Stat label={t('Downtime reasons')} value={fmt(im.reasons.length)} />
      </div>


      {s.empty > 0 && (
        /*
          * Where the blank rows are.
          *
          * A count on its own sends the reader hunting through a thousand-line sheet. These are
          * the worksheet's own row numbers, so the file can be opened and the line found.
          */
        <details className="rounded-xl border border-[var(--hairline)] overflow-hidden">
          <summary className="cursor-pointer select-none px-3 py-2.5 text-[12.5px] font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}>
            {t('Where are the')} {fmt(s.empty)} {t('empty rows?')}
          </summary>
          <div className="px-3 py-2 max-h-[190px] overflow-y-auto scroll-area">
            <div className="text-[11.5px] mb-1.5" style={{ color: 'var(--ink-hint)' }}>
              {t('These lines name a machine but leave every figure blank. They are imported — nothing is missing.')}
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                {emptyRowsOf(im).map((r) => (
                  <tr key={r.excelRow}>
                    <td className="py-1 pr-3 tabular-nums font-bold whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                      {t('Excel row')} {r.excelRow}
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>
                      {fmtDate(r.date)}
                    </td>
                    <td className="py-1 pr-3 whitespace-nowrap" style={{ color: 'var(--ink-hint)' }}>
                      {r.shift === 'I' ? 'Shift 1' : r.shift === 'II' ? 'Shift 2' : r.shift || '—'}
                    </td>
                    <td className="py-1 font-bold whitespace-nowrap text-slate-800">{r.machine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-2.5 min-w-0">
          <CalendarDays size={16} className="shrink-0" style={{ color: '#2563eb' }} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-hint)' }}>
              {t('Date range')}
            </div>
            <div className="text-[13px] font-bold text-slate-800 truncate">
              {fmtDate(from)} → {fmtDate(to)}
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-2.5 min-w-0">
          <Cog size={16} className="shrink-0" style={{ color: '#0f9d58' }} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-hint)' }}>
              {t('Shifts')}
            </div>
            <div className="text-[13px] font-bold text-slate-800 truncate">
              {im.shifts.map((x) => (x === 'I' ? 'Shift 1' : x === 'II' ? 'Shift 2' : x)).join(' · ') || '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--ink-hint)' }}>
          {t('Machines in this file')}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {im.machines.map((m) => (
            <span
              key={m}
              className="rounded-lg px-2 py-1 text-[11.5px] font-bold"
              style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {im.convertedAt && (
        <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: '#0f9d58' }}>
          <CheckCircle2 size={15} /> {t('Already driving the KPI page since')} {fmtWhen(im.convertedAt)}
        </div>
      )}

      {/* ---- the two actions ---- */}
      <div className="sticky bottom-0 -mx-4 md:-mx-5 -mb-4 md:-mb-5 px-4 md:px-5 py-3 border-t border-[var(--hairline)] flex items-center gap-2.5 flex-wrap"
        style={{ background: 'var(--surface)' }}
      >
        {confirm ? (
          <>
            <span className="text-[13px] font-semibold min-w-0" style={{ color: '#b0201f' }}>
              {t('Delete every import? This cannot be undone.')}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setConfirm(false)} className="text-[12.5px] font-bold px-3 py-2" style={{ color: 'var(--ink-2)' }}>
                {t('Cancel')}
              </button>
              <button onClick={onDeleteAll} className="rounded-xl text-white text-[13px] font-bold px-3.5 py-2" style={{ background: '#c0392b' }}>
                {t('Yes, delete all')}
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={onConvert}
              className="inline-flex items-center gap-1.5 rounded-xl text-white text-sm font-bold px-4 py-2.5 shadow-sm"
              style={{ background: '#2563eb' }}
            >
              <Sparkles size={15} /> {t('Convert to KPI')}
            </button>
            <button
              onClick={() => setConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border text-sm font-bold px-4 py-2.5"
              style={{ borderColor: '#f0a1a1', color: '#c0392b' }}
            >
              <Trash2 size={15} /> {t('Delete all')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
