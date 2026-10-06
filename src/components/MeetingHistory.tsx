import { History, FolderOpen, Trash2, CalendarDays, TriangleAlert, Gauge, Factory } from 'lucide-react'
import type { SavedMeeting } from '../lib/history'
import { efficiencyColor } from '../lib/palette'
import { withTarget } from '../lib/unit'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtSaved(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MeetingHistory({
  meetings,
  onOpen,
  onDelete,
}: {
  meetings: SavedMeeting[]
  onOpen: (m: SavedMeeting) => void
  onDelete?: (id: string) => void
}) {
  if (meetings.length === 0) {
    return (
      <div className="bento bento-pad text-center py-12">
        <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-indigo-50 text-indigo-500">
          <History size={26} />
        </div>
        <div className="mt-3 font-bold text-slate-800">No saved meetings yet</div>
        <div className="text-sm text-slate-500 mt-1">
          Use <b>Save Meeting</b> in the top bar to snapshot today's report. Saved meetings appear
          here so you can review past shifts anytime.
        </div>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {meetings.map((m) => (
        <div key={m.id} className="bento rise overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--hairline)] flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl grid place-items-center grad-violet text-white shrink-0">
              <CalendarDays size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800">{fmtDate(m.meetingDate)}</div>
              <div className="text-xs text-slate-500">
                {m.shift || '1st Shift'} · saved {fmtSaved(m.savedAt)}
              </div>
            </div>
            {m.summary.criticalCount > 0 && (
              <span className="pill pill-critical shrink-0">
                <TriangleAlert size={12} /> {m.summary.criticalCount}
              </span>
            )}
          </div>

          <div className="p-4">
            {m.note && <div className="text-sm text-slate-600 mb-3 italic">“{m.note}”</div>}

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={<Factory size={14} />} label="Machines" value={String(m.summary.machines)} />
              <Stat
                icon={<Gauge size={14} />}
                label="Avg Eff"
                value={`${m.summary.avgEfficiency.toFixed(0)}%`}
                color={efficiencyColor(m.summary.avgEfficiency)}
              />
              <Stat
                icon={<TriangleAlert size={14} />}
                label={withTarget("Below 75%")}
                value={String(m.summary.criticalCount)}
              />
            </div>

            <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
              <span>Plan <b className="text-slate-700">{m.summary.planned.toLocaleString('en-IN')}</b></span>
              <span>Ach <b className="text-slate-700">{m.summary.achievement.toLocaleString('en-IN')}</b></span>
              <span>Backlog <b className="text-orange-600">{m.summary.backlog.toLocaleString('en-IN')}</b></span>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="icon-btn flex-1 justify-center !bg-indigo-600 !text-white !border-indigo-600 hover:!bg-indigo-700"
                onClick={() => onOpen(m)}
              >
                <FolderOpen size={14} /> Open
              </button>
              {onDelete && (
                <button
                  className="icon-btn !text-red-600 hover:!bg-red-50 hover:!border-red-200"
                  onClick={() => {
                    if (confirm(`Delete the meeting from ${fmtDate(m.meetingDate)}?`)) onDelete(m.id)
                  }}
                  title="Delete this meeting"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="flex items-center justify-center gap-1 text-slate-400">{icon}</div>
      <div className="text-lg font-extrabold tabular-nums" style={{ color: color ?? 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}
