import { useEffect, useState } from 'react'
import { FileSpreadsheet, Trash2, UploadCloud, Inbox } from 'lucide-react'
import { loadQaHistory, clearQaState, type QaUploadEntry } from '../../lib/qa'
import { useT } from '../../lib/i18n'

const BLUE = '#2f6fbf'
const GREEN = '#2e9e5b'

/** Shows every Goods-Return Excel upload saved in the shared database (newest first). */
export function QaUploadHistory({ onUpload, onCleared }: { onUpload: () => void; onCleared?: () => void }) {
  const [items, setItems] = useState<QaUploadEntry[]>([])
  const [err, setErr] = useState('')
  const t = useT()

  useEffect(() => {
    let alive = true
    loadQaHistory()
      .then((history) => alive && setItems(history))
      .catch((error: unknown) => alive && setErr(String((error as Error)?.message || error)))
    return () => { alive = false }
  }, [])

  const clearAll = async () => {
    setErr('')
    try {
      await clearQaState()
      setItems([])
      onCleared?.()
    } catch (error) {
      setErr(String((error as Error)?.message || error))
    }
  }

  const when = (at: number) =>
    new Date(at).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="max-w-4xl w-full flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          <span className="font-bold text-slate-700">{items.length}</span> upload{items.length !== 1 ? 's' : ''} saved
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 text-red-600 font-semibold px-3 py-2 text-sm hover:bg-red-50"
              title="Clear history and dashboard data"
            >
              <Trash2 size={15} /> {t('Clear')}
            </button>
          )}
          <button
            onClick={onUpload}
            className="inline-flex items-center gap-1.5 rounded-lg text-white font-semibold px-3.5 py-2 text-sm shadow-sm"
            style={{ background: BLUE }}
          >
            <UploadCloud size={16} /> {t('Upload Excel')}
          </button>
        </div>
      </div>

      {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{err}</div>}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm text-center px-6 py-14">
          <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-slate-100 text-slate-400 mb-3">
            <Inbox size={26} />
          </div>
          <div className="font-bold text-slate-700">{t('No uploads yet')}</div>
          <div className="text-sm text-slate-500 mt-1">
            Use <b>{t('Upload Excel')}</b> to add a Customer Goods Return or MRS Observation file.
          </div>
          <button
            onClick={onUpload}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg text-white font-semibold px-4 py-2.5 text-sm shadow-sm"
            style={{ background: BLUE }}
          >
            <UploadCloud size={16} /> {t('Upload Excel')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: BLUE }}>
                  <th className="text-left text-white font-bold text-[12px] uppercase tracking-wide px-4 py-3">{t('Format')}</th>
                  <th className="text-left text-white font-bold text-[12px] uppercase tracking-wide px-4 py-3">{t('File')}</th>
                  <th className="text-right text-white font-bold text-[12px] uppercase tracking-wide px-4 py-3">{t('Rows')}</th>
                  <th className="text-right text-white font-bold text-[12px] uppercase tracking-wide px-4 py-3">{t('Uploaded')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id} className={i % 2 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="px-4 py-3 border-t border-slate-100">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-bold text-white"
                        style={{ background: it.kind === 'skf' ? BLUE : GREEN }}
                      >
                        <FileSpreadsheet size={13} /> {t(it.label)}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-t border-slate-100 text-slate-600 max-w-[220px] truncate" title={it.fileName}>
                      {it.fileName}
                    </td>
                    <td className="px-4 py-3 border-t border-slate-100 text-right tabular-nums font-semibold text-slate-700">
                      {it.rows.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 border-t border-slate-100 text-right text-slate-500 whitespace-nowrap">{when(it.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
