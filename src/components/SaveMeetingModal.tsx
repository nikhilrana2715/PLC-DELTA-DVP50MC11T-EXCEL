import { useState } from 'react'
import { Save, X } from 'lucide-react'

/** Small modal to confirm the meeting date + optional note before saving to history. */
export function SaveMeetingModal({
  defaultDate,
  defaultShift,
  onCancel,
  onSave,
}: {
  defaultDate: string
  defaultShift: string
  onCancel: () => void
  onSave: (date: string, note: string) => void
}) {
  const [date, setDate] = useState(defaultDate)
  const [note, setNote] = useState('')

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="bento w-full max-w-md rise"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'rise 0.2s ease both' }}
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--hairline)]">
          <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white">
            <Save size={18} />
          </div>
          <div className="flex-1">
            <div className="font-bold text-slate-800">Save Meeting</div>
            <div className="text-xs text-slate-500">Snapshot the current data to Meeting History</div>
          </div>
          <button className="text-slate-400 hover:text-slate-600" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Meeting date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </label>
          <div className="text-xs text-slate-500 -mt-2">Shift: {defaultShift || '1st Shift'}</div>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Coolant line issue on IG-12, follow up tomorrow"
              className="mt-1 w-full rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none"
            />
          </label>

          <div className="flex gap-2 justify-end pt-1">
            <button className="icon-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="icon-btn !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700"
              onClick={() => onSave(date, note.trim())}
            >
              <Save size={14} /> Save Meeting
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
