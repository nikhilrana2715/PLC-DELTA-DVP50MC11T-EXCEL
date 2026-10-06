import { useState, useRef, useEffect } from 'react'
import {
  History,
  FileClock,
  Scale,
  CalendarRange,
  Route,
  Target,
  Wrench,
  Hammer,
  ShoppingCart,
  Boxes,
  StickyNote,
  ChevronDown,
  Trash2,
  Layers,
  FolderOpen,
  ArrowUpRight,
} from 'lucide-react'
import type { SavedMeeting } from '../lib/history'
import type { UploadRecord } from '../lib/uploads'
import type { PlanVsAchRecord } from '../lib/planVsAch'
import type { MonthlyPlanRecord } from '../lib/monthlyPlan'
import type { RouteCardRecord } from '../lib/routeCard'
import type { CpkEntry } from '../lib/cpk'
import type { MaintenanceReportRecord } from '../lib/maintenanceReport'
import type { ToolingReportRecord } from '../lib/toolingReport'
import type { PurchaseReportRecord } from '../lib/purchaseReport'
import type { AssemblyRecord } from '../lib/assembly'
import { MeetingHistory } from './MeetingHistory'
import { UploadHistory } from './UploadHistory'
import { useT } from '../lib/i18n'

export type ActivityTab =
  | 'meetings'
  | 'uploads'
  | 'planvsach'
  | 'monthlyplan'
  | 'routecard'
  | 'cpk'
  | 'maintenancereport'
  | 'toolingreport'
  | 'purchasereport'
  | 'assembly'

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  if (Number.isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ActivityHub({
  tab,
  setTab,
  unit,
  canEdit,
  notesCount,
  onOpenNotes,
  // Meetings
  meetings,
  onOpenMeeting,
  onDeleteMeeting,
  // Uploads
  uploads,
  effectiveDate,
  onViewUpload,
  onOpenDashboardDate,
  onDeleteUploadDate,
  availableDatesCount,
  // Plan vs Ach
  planVsAch,
  onDeletePlanVsAch,
  // Monthly Planning
  monthlyPlans,
  onOpenMonthlyPlan,
  onDeleteMonthlyPlan,
  // Route Cards
  routeCards,
  onOpenRouteCard,
  onDeleteRouteCard,
  // CP-CPK
  cpk,
  onOpenCpk,
  onDeleteCpk,
  // Maintenance Reports
  maintenanceReports,
  onOpenMaintenance,
  onDeleteMaintenance,
  // Tooling Reports
  toolingReports,
  onOpenTooling,
  onDeleteTooling,
  // Purchase Reports
  purchaseReports,
  onOpenPurchase,
  onDeletePurchase,
  // Assembly
  assembly,
  onOpenAssembly,
  onDeleteAssembly,
}: {
  tab: ActivityTab
  setTab: (t: ActivityTab) => void
  unit: string
  canEdit: boolean
  notesCount: number
  onOpenNotes: () => void
  meetings: SavedMeeting[]
  onOpenMeeting: (m: SavedMeeting) => void
  onDeleteMeeting?: (id: string) => void
  uploads: UploadRecord[]
  effectiveDate: string
  onViewUpload: (u: UploadRecord) => void
  onOpenDashboardDate: (date: string) => void
  onDeleteUploadDate?: (date: string) => void
  availableDatesCount: number
  planVsAch: PlanVsAchRecord[]
  onDeletePlanVsAch?: (id: string) => void
  monthlyPlans: MonthlyPlanRecord[]
  onOpenMonthlyPlan: (month: string) => void
  onDeleteMonthlyPlan?: (id: string) => void
  routeCards: RouteCardRecord[]
  onOpenRouteCard: (month: string) => void
  onDeleteRouteCard?: (id: string) => void
  cpk: CpkEntry[]
  onOpenCpk: () => void
  onDeleteCpk?: (id: string) => void
  maintenanceReports: MaintenanceReportRecord[]
  onOpenMaintenance: (date: string) => void
  onDeleteMaintenance?: (id: string) => void
  toolingReports: ToolingReportRecord[]
  onOpenTooling: (date: string) => void
  onDeleteTooling?: (id: string) => void
  purchaseReports: PurchaseReportRecord[]
  onOpenPurchase: (date: string) => void
  onDeletePurchase?: (id: string) => void
  assembly: AssemblyRecord[]
  onOpenAssembly: (date: string) => void
  onDeleteAssembly?: (id: string) => void
}) {
  const t = useT()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  interface TabItem {
    id: ActivityTab
    label: string
    count: number
    icon: typeof History
    description: string
    color: string
  }

  const items: TabItem[] = [
    {
      id: 'meetings',
      label: 'Meetings',
      count: meetings.length,
      icon: History,
      description: 'Saved meeting snapshots — click Open to review a past shift.',
      color: 'text-indigo-600',
    },
    ...(unit !== 'ASS'
      ? [
          {
            id: 'uploads' as ActivityTab,
            label: 'Upload History',
            count: availableDatesCount,
            icon: FileClock,
            description: 'Every Excel converted to the dashboard, with its shift & date — click View for details.',
            color: 'text-blue-600',
          },
        ]
      : []),
    ...(unit === 'ASS'
      ? [
          {
            id: 'assembly' as ActivityTab,
            label: 'Assembly History',
            count: assembly.length,
            icon: Boxes,
            description: 'Assembly production reports and shift logs.',
            color: 'text-violet-600',
          },
        ]
      : []),
    {
      id: 'planvsach',
      label: 'Daily Plan vs Achievement History',
      count: planVsAch.length,
      icon: Scale,
      description: 'Daily running Day / Month plant achievement, plan numbers & backlog records.',
      color: 'text-amber-600',
    },
    {
      id: 'monthlyplan',
      label: 'Monthly Planning History',
      count: monthlyPlans.length,
      icon: CalendarRange,
      description: 'Every month’s Plan Confirmation Sheet you saved — click Open to view that month.',
      color: 'text-indigo-600',
    },
    {
      id: 'routecard',
      label: 'Route Card History',
      count: routeCards.length,
      icon: Route,
      description: 'Saved route card workbooks with open machine routes.',
      color: 'text-teal-600',
    },
    {
      id: 'cpk',
      label: 'CP-CPK History',
      count: cpk.length,
      icon: Target,
      description: 'Recorded machine Cp & Cpk quality capability readings.',
      color: 'text-rose-600',
    },
    {
      id: 'maintenancereport',
      label: 'Maintenance Report History',
      count: maintenanceReports.length,
      icon: Wrench,
      description: 'Equipment maintenance workbooks, breakdown logs & PM schedules.',
      color: 'text-sky-600',
    },
    {
      id: 'toolingreport',
      label: 'Tooling Report History',
      count: toolingReports.length,
      icon: Hammer,
      description: 'Tooling usage, tool life records & replacement tracking.',
      color: 'text-purple-600',
    },
    {
      id: 'purchasereport',
      label: 'Purchase Report History',
      count: purchaseReports.length,
      icon: ShoppingCart,
      description: 'Purchase orders, vendor status & materials history.',
      color: 'text-emerald-600',
    },
  ]

  const currentItem = items.find((i) => i.id === tab) || items[0]
  const CurrentIcon = currentItem.icon

  return (
    <div className="flex flex-col gap-4">
      {/* Top Controls Toolbar with Activity Dropdown Button */}
      <div className="bento bento-pad flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* The Activity Button (with Dropdown Menu) */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition"
              title="Select Activity Section"
            >
              <Layers size={17} className="text-sky-400" />
              <span>{t('Activity')}:</span>
              <span className="text-sky-200 font-extrabold max-w-[280px] sm:max-w-none truncate">{t(currentItem.label)}</span>
              <ChevronDown size={15} className={`transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Popover */}
            {dropdownOpen && (
              <div
                className="absolute left-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 p-1.5 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-150"
                style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
              >
                <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                  {t('Select Activity Section')}
                </div>
                {items.map((it) => {
                  const Icon = it.icon
                  const selected = it.id === tab
                  return (
                    <button
                      key={it.id}
                      onClick={() => {
                        setTab(it.id)
                        setDropdownOpen(false)
                      }}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left text-xs font-bold transition ${
                        selected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon size={15} className={selected ? 'text-sky-300' : it.color} />
                        <span className="truncate">{t(it.label)}</span>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 ${
                          selected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {it.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notes Button */}
          <button
            onClick={onOpenNotes}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 shadow-sm shrink-0 transition"
          >
            <StickyNote size={15} /> {t('Notes')}
            {notesCount > 0 && (
              <span className="text-[11px] font-bold bg-white/25 rounded-full px-1.5">{notesCount}</span>
            )}
          </button>
        </div>

        {/* Informative Subtitle Banner */}
        <div className="text-xs text-slate-500 flex items-center gap-2 pt-1 border-t border-slate-100">
          <CurrentIcon size={14} className={currentItem.color} />
          <span>{t(currentItem.description)}</span>
        </div>
      </div>

      {/* ==================== 1. MEETINGS ==================== */}
      {tab === 'meetings' && (
        <MeetingHistory meetings={meetings} onOpen={onOpenMeeting} onDelete={canEdit ? onDeleteMeeting : undefined} />
      )}

      {/* ==================== 2. UPLOAD HISTORY ==================== */}
      {tab === 'uploads' && unit !== 'ASS' && (
        <UploadHistory
          uploads={uploads}
          currentDate={effectiveDate}
          onView={onViewUpload}
          onOpenDashboard={onOpenDashboardDate}
          onDeleteDate={canEdit ? onDeleteUploadDate : undefined}
        />
      )}

      {/* ==================== 3. DAILY PLAN VS ACHIEVEMENT ==================== */}
      {tab === 'planvsach' && (
        planVsAch.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-amber-50 text-amber-600 mb-3">
              <Scale size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Daily Plan vs Achievement records yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload the daily running tally from the Dashboard upload menu to see records here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {planVsAch.map((rec) => (
              <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #d97706' }}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Scale size={16} className="text-amber-600" />
                      <span>{fmtDate(rec.date)}</span>
                    </div>
                    {canEdit && onDeletePlanVsAch && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete Daily Plan vs Achievement record for ${fmtDate(rec.date)}?`)) {
                            onDeletePlanVsAch(rec.id)
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Delete this record"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>

                  {/* Day and Month numbers */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">
                        {rec.dayLabel || 'Day'}
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Plan:</span> <b className="text-slate-800">{(rec.day?.plan ?? 0).toLocaleString('en-IN')}</b>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Ach:</span> <b className="text-emerald-700">{(rec.day?.ach ?? 0).toLocaleString('en-IN')}</b>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Backlog:</span>{' '}
                        <b className={(rec.day?.backlog ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {(rec.day?.backlog ?? 0).toLocaleString('en-IN')}
                        </b>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                      <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">Month</div>
                      <div className="flex justify-between text-slate-600">
                        <span>Plan:</span> <b className="text-slate-800">{(rec.month?.plan ?? 0).toLocaleString('en-IN')}</b>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Ach:</span> <b className="text-emerald-700">{(rec.month?.ach ?? 0).toLocaleString('en-IN')}</b>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Backlog:</span>{' '}
                        <b className={(rec.month?.backlog ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {(rec.month?.backlog ?? 0).toLocaleString('en-IN')}
                        </b>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <button
                      onClick={() => onOpenDashboardDate(rec.date)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-amber-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                    >
                      <ArrowUpRight size={13} /> {t('Open on Dashboard')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ==================== 4. MONTHLY PLANNING HISTORY ==================== */}
      {tab === 'monthlyplan' && (
        monthlyPlans.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-indigo-50 text-indigo-600 mb-3">
              <CalendarRange size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Monthly Plans yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload & Save a Plan Confirmation Sheet and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {monthlyPlans.map((rec) => {
              const plan = rec.rows.reduce((s, r) => s + r.planQty, 0)
              const conf = rec.rows.reduce((s, r) => s + r.confirmQty, 0)
              const pend = rec.rows.reduce((s, r) => s + r.pendingQty, 0)
              return (
                <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #4f46e5' }}>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <CalendarRange size={16} className="text-indigo-600" />
                        <span>{rec.title}</span>
                      </div>
                      {canEdit && onDeleteMonthlyPlan && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete the Monthly Plan for ${rec.title}? This cannot be undone.`)) {
                              onDeleteMonthlyPlan(rec.id)
                            }
                          }}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                          title="Delete this plan"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">
                      {rec.fileName} · {rec.rows.length} items
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-blue-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{plan.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-500">Plan</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{conf.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-500">Confirmed</div>
                      </div>
                      <div className="rounded-lg bg-orange-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{pend.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-500">Pending</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => onOpenMonthlyPlan(rec.month)}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                      >
                        <FolderOpen size={13} /> {t('Open Plan')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ==================== 5. ROUTE CARD HISTORY ==================== */}
      {tab === 'routecard' && (
        routeCards.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-teal-50 text-teal-600 mb-3">
              <Route size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Route Cards yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload & Save a Route Card workbook and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {routeCards.map((rec) => (
              <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #0d9488' }}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Route size={16} className="text-teal-600" />
                      <span>{rec.title}</span>
                    </div>
                    {canEdit && onDeleteRouteCard && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete the Route Card for ${rec.title}? This cannot be undone.`)) {
                            onDeleteRouteCard(rec.id)
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Delete this route card"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                    <span className="text-xs text-slate-600">{t('Sheet Tabs')}:</span>
                    <span className="text-xs font-extrabold text-slate-800">{rec.sheets.length} tabs</span>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => onOpenRouteCard(rec.month)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-teal-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                    >
                      <FolderOpen size={13} /> {t('Open Route Card')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ==================== 6. CP-CPK HISTORY ==================== */}
      {tab === 'cpk' && (
        cpk.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-rose-50 text-rose-600 mb-3">
              <Target size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Cp-Cpk readings yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Add Cp-Cpk readings from the Cp-Cpk page and they will appear here.')}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {cpk.length} {t('Recorded Readings')}
              </div>
              <button
                onClick={onOpenCpk}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 shadow-sm transition"
              >
                <ArrowUpRight size={13} /> {t('Open Cp-Cpk Page')}
              </button>
            </div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {cpk.slice(0, 30).map((entry) => {
                const cpkGood = entry.cpk != null && entry.cpk >= 1.33
                const cpkWarn = entry.cpk != null && entry.cpk >= 1.0 && entry.cpk < 1.33
                return (
                  <div key={entry.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #e11d48' }}>
                    <div className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                          <Target size={15} className="text-rose-600" />
                          <span>{entry.machine}</span>
                          <span className="text-xs font-normal text-slate-400">· {fmtDate(entry.date)}</span>
                        </div>
                        {canEdit && onDeleteCpk && (
                          <button
                            onClick={() => {
                              if (confirm(`Delete Cp-Cpk record for ${entry.machine} (${fmtDate(entry.date)})?`)) {
                                onDeleteCpk(entry.id)
                              }
                            }}
                            className="p-1 rounded text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 truncate">
                        <b>{entry.itemCode || '—'}</b> {entry.batchNo ? `· Batch ${entry.batchNo}` : ''}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-slate-50 py-1.5 border border-slate-100">
                          <div className="text-xs font-extrabold text-slate-800">{entry.cp != null ? entry.cp.toFixed(2) : '—'}</div>
                          <div className="text-[10px] text-slate-400">Cp</div>
                        </div>
                        <div
                          className={`rounded-lg py-1.5 font-extrabold text-xs ${
                            cpkGood ? 'bg-emerald-50 text-emerald-700' : cpkWarn ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          <div>{entry.cpk != null ? entry.cpk.toFixed(2) : '—'}</div>
                          <div className="text-[10px] opacity-75 font-normal">Cpk</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      )}

      {/* ==================== 7. MAINTENANCE REPORT HISTORY ==================== */}
      {tab === 'maintenancereport' && (
        maintenanceReports.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-sky-50 text-sky-600 mb-3">
              <Wrench size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Maintenance Reports yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload & Save a Maintenance Report from Monthly Report and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {maintenanceReports.map((rec) => (
              <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #0284c7' }}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Wrench size={16} className="text-sky-600" />
                      <span>{rec.title}</span>
                    </div>
                    {canEdit && onDeleteMaintenance && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete Maintenance Report for ${rec.title}?`)) {
                            onDeleteMaintenance(rec.id)
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Delete this report"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100 text-xs">
                    <span className="text-slate-600">{t('Sheets / Rows')}:</span>
                    <span className="font-extrabold text-slate-800">
                      {rec.sheets.length} tabs · {rec.rowCount} rows
                    </span>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => onOpenMaintenance(rec.date || rec.month)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-sky-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                    >
                      <FolderOpen size={13} /> {t('Open Maintenance Report')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ==================== 8. TOOLING REPORT HISTORY ==================== */}
      {tab === 'toolingreport' && (
        toolingReports.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-purple-50 text-purple-600 mb-3">
              <Hammer size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Tooling Reports yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload & Save a Tooling Report and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {toolingReports.map((rec) => (
              <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #7c3aed' }}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Hammer size={16} className="text-purple-600" />
                      <span>{rec.title}</span>
                    </div>
                    {canEdit && onDeleteTooling && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete Tooling Report for ${rec.title}?`)) {
                            onDeleteTooling(rec.id)
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Delete this report"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100 text-xs">
                    <span className="text-slate-600">{t('Sheets / Rows')}:</span>
                    <span className="font-extrabold text-slate-800">
                      {rec.sheets.length} tabs · {rec.rowCount} rows
                    </span>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => onOpenTooling(rec.date || rec.month)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-purple-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                    >
                      <FolderOpen size={13} /> {t('Open Tooling Report')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ==================== 9. PURCHASE REPORT HISTORY ==================== */}
      {tab === 'purchasereport' && (
        purchaseReports.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-emerald-50 text-emerald-600 mb-3">
              <ShoppingCart size={26} />
            </div>
            <div className="text-base font-bold text-slate-800">{t('No Purchase Reports yet')}</div>
            <div className="text-xs text-slate-500 mt-1">
              {t('Upload & Save a Purchase Report and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {purchaseReports.map((rec) => (
              <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #059669' }}>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <ShoppingCart size={16} className="text-emerald-600" />
                      <span>{rec.title}</span>
                    </div>
                    {canEdit && onDeletePurchase && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete Purchase Report for ${rec.title}?`)) {
                            onDeletePurchase(rec.id)
                          }
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                        title="Delete this report"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 border border-slate-100 text-xs">
                    <span className="text-slate-600">{t('Sheets / Rows')}:</span>
                    <span className="font-extrabold text-slate-800">
                      {rec.sheets.length} tabs · {rec.rowCount} rows
                    </span>
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => onOpenPurchase(rec.date || rec.month)}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                    >
                      <FolderOpen size={13} /> {t('Open Purchase Report')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ==================== 10. ASSEMBLY HISTORY (ASS workspace) ==================== */}
      {tab === 'assembly' && unit === 'ASS' && (
        assembly.length === 0 ? (
          <div className="bento bento-pad text-center py-16">
            <div className="w-14 h-14 mx-auto rounded-2xl grid place-items-center bg-slate-100 text-slate-400 mb-3">
              <Boxes size={26} />
            </div>
            <div className="text-base font-bold text-slate-700">{t('No Assembly reports yet')}</div>
            <div className="text-xs text-slate-400 mt-1">
              {t('Upload & Save an Assembly report and it will appear here.')}
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
            {assembly.map((rec) => {
              const plan = rec.rows.reduce((s, r) => s + r.planQty, 0)
              const ach = rec.rows.reduce((s, r) => s + r.achQty, 0)
              const ops = rec.rows.reduce((s, r) => s + r.operators, 0)
              return (
                <div key={rec.id} className="bento rise overflow-hidden" style={{ borderLeft: '4px solid #7c3aed' }}>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <Boxes size={16} className="text-violet-600" />
                        <span>{fmtDate(rec.date)}</span>
                      </div>
                      {canEdit && onDeleteAssembly && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete the Assembly report for ${fmtDate(rec.date)}?`)) {
                              onDeleteAssembly(rec.id)
                            }
                          }}
                          className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition"
                          title="Delete this report"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{rec.fileName}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-blue-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{plan.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-500">Plan</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{ach.toLocaleString('en-IN')}</div>
                        <div className="text-[10px] text-slate-500">OK</div>
                      </div>
                      <div className="rounded-lg bg-violet-50 py-1.5">
                        <div className="text-sm font-extrabold text-slate-800">{ops}</div>
                        <div className="text-[10px] text-slate-500">Operators</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <button
                        onClick={() => onOpenAssembly(rec.date)}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 hover:bg-violet-600 hover:text-white text-slate-700 text-xs font-semibold py-2 transition"
                      >
                        <FolderOpen size={13} /> {t('View Dashboard')}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

