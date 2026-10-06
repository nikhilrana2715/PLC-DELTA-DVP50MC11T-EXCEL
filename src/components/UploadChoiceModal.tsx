import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronRight, ClipboardList, FileSpreadsheet, Scale, UploadCloud, X } from 'lucide-react'
import { useT } from '../lib/i18n'

/**
 * What kind of sheet is being uploaded.
 *
 * Two different workbooks arrive at this button every morning — the machine-by-machine
 * meeting report, and the small Day / Month tally the plant keeps its running totals on.
 * They were both going through one file picker, which meant the app had to guess from the
 * contents; asking once is a question the person already knows the answer to.
 */
export function UploadChoiceModal({
  onMorningMeeting,
  onPlanVsAch,
  onClose,
}: {
  onMorningMeeting: () => void
  onPlanVsAch: () => void
  onClose: () => void
}) {
  const t = useT()
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const choice = (
    icon: React.ReactNode,
    grad: string,
    title: string,
    desc: string,
    onClick: () => void,
  ) => (
    <button
      onClick={onClick}
      className="bento bento-pad text-left flex items-start gap-3 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition w-full"
    >
      <div className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center text-white shadow-sm" style={{ background: grad }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-bold text-slate-800 leading-tight">{t(title)}</div>
        <div className="text-[12.5px] leading-relaxed mt-0.5" style={{ color: 'var(--ink-2)' }}>
          {t(desc)}
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 mt-1 text-slate-300" />
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ animation: 'rise 0.18s ease both' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5" style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
          <div className="w-11 h-11 rounded-2xl grid place-items-center bg-white/15 text-white shrink-0">
            <UploadCloud size={22} />
          </div>
          <div className="min-w-0 flex-1 text-white">
            <div className="text-lg font-extrabold truncate">{t('Upload Excel')}</div>
            <div className="text-sm text-white/70 truncate">{t('Which sheet are you uploading?')}</div>
          </div>
          <button className="text-white/70 hover:text-white shrink-0" onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-3">
          {choice(
            <ClipboardList size={22} />,
            'linear-gradient(150deg,#4f46e5,#7c3aed 55%,#db2777)',
            'Morning Meeting',
            'The machine-by-machine shift report — plan, achievement, downtime and remarks. This is what the dashboard is built from.',
            onMorningMeeting,
          )}
          {choice(
            <Scale size={22} />,
            'linear-gradient(150deg,#0d9488,#0ea5e9 55%,#4f46e5)',
            'Daily Plan vs Achievement',
            "The plant's own running tally — Day and Month, plan against achievement and backlog.",
            onPlanVsAch,
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The Day / Month tally: pick the date it belongs to, then the file.
 *
 * The date is asked for because the sheet's own date cell is the one thing that moves — some
 * are printed with it, some are not. When the workbook does carry a date, it wins, and the
 * screen says so after reading.
 */
export function PlanVsAchUploadModal({
  date,
  onDate,
  onUpload,
  busy,
  error,
  onClose,
}: {
  date: string
  onDate: (d: string) => void
  onUpload: (file: File) => void
  busy: boolean
  error: string
  onClose: () => void
}) {
  const t = useT()
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 overflow-auto scroll-area"
      style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden my-6" style={{ animation: 'rise 0.18s ease both' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5" style={{ background: 'linear-gradient(135deg,#0d9488,#0ea5e9 60%,#4f46e5)' }}>
          <div className="w-11 h-11 rounded-2xl grid place-items-center bg-white/15 text-white shrink-0">
            <Scale size={22} />
          </div>
          <div className="min-w-0 flex-1 text-white">
            <div className="text-lg font-extrabold truncate">{t('Daily Plan vs Achievement')}</div>
            <div className="text-sm text-white/70 truncate">{t('Day and Month running tally')}</div>
          </div>
          <button className="text-white/70 hover:text-white shrink-0" onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
        </div>

        <div className="p-4 md:p-5 flex flex-col gap-4">
          {/* Step 1 — the date. */}
          <div className="rounded-xl border border-[var(--hairline)] px-3 py-2.5 flex items-center gap-3 flex-wrap">
            <CalendarDays size={16} className="shrink-0" style={{ color: '#0d9488' }} />
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-slate-800 leading-tight">{t('Date of this tally')}</div>
              <div className="text-[11.5px] leading-tight" style={{ color: 'var(--ink-hint)' }}>
                {t("Used when the sheet has no date of its own — otherwise the sheet's date wins.")}
              </div>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => onDate(e.target.value)}
              className="ml-auto h-9 rounded-lg border border-[var(--hairline)] px-2 text-[13px] font-semibold outline-none focus:border-teal-400"
              style={{ background: 'var(--surface)', color: 'var(--ink)' }}
              aria-label={t('Date')}
            />
          </div>

          {/* Step 2 — the file. */}
          <div
            className={`rounded-2xl border-2 border-dashed px-4 py-7 text-center cursor-pointer transition ${
              drag ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0])
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) setFile(e.target.files[0])
                e.target.value = ''
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                <FileSpreadsheet size={18} className="text-emerald-600" /> {file.name}
              </div>
            ) : (
              <>
                <UploadCloud size={26} className="mx-auto text-slate-400" />
                <div className="mt-2 text-sm font-semibold text-slate-600">{t('Click to choose or drop the Excel here')}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t('A Plan / Achv. / Backlog table with a Day and a Month row')}</div>
              </>
            )}
          </div>

          {error && (
            <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-semibold bg-red-50 text-red-700 border border-red-200">{error}</div>
          )}

          <button
            onClick={() => file && onUpload(file)}
            disabled={!file || busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold px-4 py-2.5 shadow-sm transition"
          >
            <UploadCloud size={18} /> {busy ? t('Reading…') : t('Upload & Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
