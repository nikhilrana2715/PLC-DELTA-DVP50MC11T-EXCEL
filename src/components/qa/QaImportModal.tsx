import { useEffect, useRef, useState } from 'react'
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2, Layers } from 'lucide-react'
import QaParseWorker from '../../lib/qaParse.worker?worker'
import { useT } from '../../lib/i18n'
import {
  loadQaState,
  saveQaState,
  type SkfRow,
  type ObsRow,
  parseWorkbookAll,
  type QaRaw,
  type QaUploadEntry,
} from '../../lib/qa'

type Staged = { name: string; count: number } | null

/**
 * QA upload — accepts the two Goods-Return workbook formats that drive the
 * dashboard: "Customer Goods Return" and "MRS Observation Return good".
 * Parses in-browser, merges with existing data, and persists to localStorage.
 */
export function QaImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: (raw: QaRaw) => void }) {
  const [skf, setSkf] = useState<SkfRow[] | null>(null)
  const [obs, setObs] = useState<ObsRow[] | null>(null)
  const [skfInfo, setSkfInfo] = useState<Staged>(null)
  const [obsInfo, setObsInfo] = useState<Staged>(null)
  const [err, setErr] = useState('')
  // The workbook path: one file that holds the two source sheets AND every built sheet.
  const [book, setBook] = useState<QaRaw | null>(null)
  const [bookInfo, setBookInfo] = useState<{ name: string; sheets: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState<'skf' | 'obs' | 'book' | null>(null)
  const t = useT()

  // Parse in a Web Worker — large image-heavy files (16 MB+) otherwise freeze the tab.
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  useEffect(() => () => workerRef.current?.terminate(), [])

  const parseInWorker = (kind: 'skf' | 'obs', buf: ArrayBuffer) =>
    new Promise<unknown[]>((resolve, reject) => {
      if (!workerRef.current) workerRef.current = new QaParseWorker()
      const w = workerRef.current
      const id = ++reqId.current
      const onMsg = (e: MessageEvent) => {
        const d = e.data as { id: number; ok: boolean; rows?: unknown[]; error?: string }
        if (d.id !== id) return
        w.removeEventListener('message', onMsg)
        if (d.ok) resolve(d.rows ?? [])
        else reject(new Error(d.error || 'Parse failed'))
      }
      w.addEventListener('message', onMsg)
      w.postMessage({ id, kind, buf }, [buf]) // transfer the buffer (no copy)
    })

  const readBuf = (f: File) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as ArrayBuffer)
      fr.onerror = () => reject(fr.error)
      fr.readAsArrayBuffer(f)
    })

  /**
   * Read ONE workbook end to end. The two source sheets are found by name (they are no
   * longer sheet #1 of their own file), and every other sheet is read generically so the
   * Sheet filter can offer it. Parsed on the main thread: the generic reader has to see all
   * sheets, which the worker's single-sheet protocol cannot express.
   */
  const onPickBook = async (file: File | null | undefined) => {
    if (!file || parsing) return
    setErr('')
    setParsing('book')
    try {
      const raw = parseWorkbookAll(await readBuf(file))
      const n = raw.sheets?.length ?? 0
      if (n === 0) throw new Error('No readable sheets found in this workbook.')
      setBook(raw)
      setBookInfo({ name: file.name, sheets: n })
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setParsing(null)
    }
  }

  const onPick = async (kind: 'skf' | 'obs', file: File | null | undefined) => {
    if (!file || parsing) return
    setErr('')
    setParsing(kind)
    try {
      const buf = await readBuf(file)
      const rows = await parseInWorker(kind, buf)
      if (kind === 'skf') {
        if (rows.length === 0) throw new Error('No Customer Goods Return data found in this file (check Customer / Item / Quantity columns).')
        setSkf(rows as SkfRow[])
        setSkfInfo({ name: file.name, count: rows.length })
      } else {
        if (rows.length === 0) throw new Error('No MRS Observation data found in this file (check Item Name / Received Qty / Observation columns).')
        setObs(rows as ObsRow[])
        setObsInfo({ name: file.name, count: rows.length })
      }
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setParsing(null)
    }
  }

  const save = async () => {
    if (!skf && !obs && !book) return
    setBusy(true)
    try {
    const base = await loadQaState()
    const merged: QaRaw = {
      generatedAt: new Date().toISOString(),
      // A whole-workbook upload wins: it carries both source sheets and all the rest.
      skf: skf ?? book?.skf ?? base.raw.skf,
      obs: obs ?? book?.obs ?? base.raw.obs,
      sheets: book?.sheets ?? base.raw.sheets,
    }
    const now = Date.now()
    const hist: QaUploadEntry[] = []
    if (skf && skfInfo) hist.push({ id: `u-${now}-skf`, at: now, kind: 'skf', label: 'Customer Goods Return', fileName: skfInfo.name, rows: skfInfo.count })
    if (obs && obsInfo) hist.push({ id: `u-${now}-obs`, at: now, kind: 'obs', label: 'MRS Observation Return good', fileName: obsInfo.name, rows: obsInfo.count })
    if (book && bookInfo) hist.push({ id: `u-${now}-book`, at: now, kind: 'skf', label: `Full workbook · ${bookInfo.sheets} sheet(s)`, fileName: bookInfo.name, rows: (book.skf?.length ?? 0) + (book.obs?.length ?? 0) })
    const saved = await saveQaState({ raw: merged, history: [...hist, ...base.history].slice(0, 100) })
    onSaved(saved.raw)
    } catch (e) {
      setErr(String((e as Error)?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-200">
          <div className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0" style={{ background: '#2f6fbf' }}>
            <UploadCloud size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-slate-800 text-lg">{t('Upload Goods Return Excel')}</div>
            <div className="text-xs text-slate-500">
              Upload both formats — <b>{t('Customer Goods Return')}</b> and <b>{t('MRS Observation Return good')}</b>. The dashboard updates instantly.
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <Dropzone
            title="Full Workbook — every sheet"
            hint="One file: both source sheets plus Races, CRB and every item sheet"
            accent="#7c6cf0"
            icon={<Layers size={22} />}
            info={bookInfo ? { name: bookInfo.name, count: bookInfo.sheets } : null}
            countLabel="sheet(s)"
            busy={parsing === 'book'}
            disabled={parsing !== null}
            onFile={(f) => onPickBook(f)}
          />
          <div className="text-[11px] font-semibold uppercase tracking-wide text-center" style={{ color: 'var(--ink-hint)' }}>
            or load the two sheets separately
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Dropzone
              title="Customer Goods Return"
              hint="Customer · Item · Quantity · OK · Rejection"
              accent="#2f6fbf"
              info={skfInfo}
              busy={parsing === 'skf'}
              disabled={parsing !== null}
              onFile={(f) => onPick('skf', f)}
            />
            <Dropzone
              title="MRS Observation Return good"
              hint="Item · Received Qty · Observation · Rework"
              accent="#2e9e5b"
              info={obsInfo}
              busy={parsing === 'obs'}
              disabled={parsing !== null}
              onFile={(f) => onPick('obs', f)}
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {err}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500">
              {skf || obs || book ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 size={14} />{' '}
                  {book ? `${bookInfo?.sheets ?? 0} sheet(s) staged` : `${(skf ? 1 : 0) + (obs ? 1 : 0)} file staged`}
                </span>
              ) : (
                'Upload at least one file.'
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="rounded-xl border border-slate-300 text-slate-600 font-semibold px-4 py-2.5 hover:bg-slate-50">
                {t('Cancel')}
              </button>
              <button
                onClick={save}
                disabled={(!skf && !obs && !book) || busy || parsing !== null}
                className="rounded-xl text-white font-bold px-4 py-2.5 shadow-sm disabled:opacity-50"
                style={{ background: '#2f6fbf' }}
              >
                {busy ? 'Saving…' : t('Save to Dashboard')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dropzone({
  title,
  hint,
  accent,
  info,
  busy,
  disabled,
  countLabel,
  icon,
  onFile,
}: {
  title: string
  hint: string
  accent: string
  info: Staged
  busy?: boolean
  disabled?: boolean
  /** The workbook zone counts sheets, not rows. */
  countLabel?: string
  icon?: React.ReactNode
  onFile: (f: File | null | undefined) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const t = useT()
  const blocked = busy || disabled
  return (
    <div
      className={`rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${blocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ borderColor: drag ? accent : '#cbd5e1', background: drag ? `${accent}0d` : undefined }}
      onClick={() => !blocked && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!blocked) setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        if (!blocked) onFile(e.dataTransfer.files?.[0])
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {busy ? (
        <>
          <div className="w-11 h-11 mx-auto rounded-xl grid place-items-center bg-white shadow-sm border border-slate-200" style={{ color: accent }}>
            <Loader2 size={22} className="animate-spin" />
          </div>
          <div className="mt-2 font-bold text-slate-800">{t('Parsing…')}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Large files take a few seconds</div>
        </>
      ) : (
        <>
          <div className="w-11 h-11 mx-auto rounded-xl grid place-items-center bg-white shadow-sm border border-slate-200" style={{ color: accent }}>
            {icon ?? <FileSpreadsheet size={22} />}
          </div>
          <div className="mt-2 font-bold text-slate-800">{t(title)}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
          {info ? (
            <div className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> {info.name} · {info.count} {countLabel ?? 'rows'}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 mt-2">.xlsx / .xls / .csv — click or drop</div>
          )}
        </>
      )}
    </div>
  )
}
