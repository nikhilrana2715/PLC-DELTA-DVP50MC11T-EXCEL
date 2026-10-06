import {
  LayoutDashboard,
  Table2,
  TriangleAlert,
  BarChart3,
  Gauge,
  Settings,
  History,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  StickyNote,
  Target,
  Sigma,
  Boxes,
  CalendarRange,
} from 'lucide-react'
import { InstallButton } from './InstallButton'
import { useT } from '../lib/i18n'
import { UNIT_LABEL, UNITS, setUnit, useUnit } from '../lib/unit'
import { useAccessMap, visibleUnits } from '../lib/access'

export type View =
  | 'dashboard'
  | 'monthlyreport'
  | 'monthlyplan'
  | 'routecard'
  | 'maintenancereport'
  | 'toolingreport'
  | 'purchasereport'
  | 'kpi'
  | 'kpidash'
  | 'machines'
  | 'priority'
  | 'downtime'
  | 'assembly'
  | 'efficiency'
  | 'cpk'
  | 'cumulative'
  | 'notes'
  | 'history'
  | 'settings'
  | 'aboutapp'
  | 'userhistory'
  | 'backup'
  | 'notifications'
  | 'backup'

const NAV_ITEM: Record<string, { label: string; icon: typeof LayoutDashboard }> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  monthlyreport: { label: 'Monthly Report', icon: CalendarRange },
  monthlyplan: { label: 'Monthly Planning', icon: CalendarRange },
  kpi: { label: 'KPI', icon: Gauge },
  priority: { label: 'Priority Alerts', icon: TriangleAlert },
  machines: { label: 'Machine List', icon: Table2 },
  efficiency: { label: 'Efficiency', icon: Gauge },
  downtime: { label: 'Downtime', icon: BarChart3 },
  assembly: { label: 'Assembly', icon: Boxes },
  cpk: { label: 'Cp-Cpk', icon: Target },
  cumulative: { label: 'Cumulative', icon: Sigma },
  notes: { label: 'Notes', icon: StickyNote },
  history: { label: 'Meeting Activity', icon: History },
}

/**
 * Each workspace shows its own menu. Assembly is deliberately absent from U1–U3: it lives
 * in the ASS workspace, where the Dashboard IS the assembly report. Notes has no menu entry
 * either — it is reached from a button inside Meeting Activity.
 *
 * U2 and U3 are set up but have no sections yet, so their menu is intentionally empty.
 */
export const UNIT_MENU: Record<string, View[]> = {
  U1: ['dashboard', 'monthlyreport', 'kpi', 'machines', 'downtime', 'cumulative', 'history'],
  U2: ['dashboard', 'monthlyreport', 'kpi', 'downtime', 'history'],
  U3: ['dashboard', 'monthlyreport', 'kpi', 'downtime', 'history'],
  ASS: ['dashboard', 'monthlyreport', 'history'],
}
export const menuFor = (unit: string): View[] => UNIT_MENU[unit] ?? []

interface SidebarProps {
  view: View
  setView: (v: View) => void
  criticalCount: number
  historyCount: number
  notesCount: number
  open: boolean
  onClose: () => void
  collapsed: boolean
  onCollapse: () => void
}

function SidebarBody({
  view,
  setView,
  criticalCount,
  historyCount,
  notesCount,
  onNavigate,
  onCloseMobile,
  onCollapse,
  rail = false,
}: {
  view: View
  setView: (v: View) => void
  criticalCount: number
  historyCount: number
  notesCount: number
  onNavigate?: () => void
  onCloseMobile?: () => void
  onCollapse?: () => void
  /** Collapsed to an icon-only strip: same items, labels moved into the tooltips. */
  rail?: boolean
}) {
  const t = useT()
  const unit = useUnit()
  // A workspace the account has no access to is not shown at all — an offered button that
  // refuses is worse than one that was never there.
  const access = useAccessMap()
  const open = visibleUnits(access)
  const units = open.length ? open : UNITS
  return (
    <>
      <div className={`flex items-center gap-2 py-3 mb-4 ${rail ? 'px-0' : 'px-2'}`}>
        {/* Workspace switcher. Each unit keeps its own records, so this is the first
            choice a user makes — it replaces the branding that used to sit here. The rail
            stacks it two-by-two rather than dropping it: switching unit is the one thing
            that must stay reachable at any width. */}
        <div
          className="flex-1 min-w-0 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(units.length, rail ? 2 : 4)}, minmax(0, 1fr))` }}
          role="radiogroup"
          aria-label={t('Unit')}
        >
          {units.map((u) => {
            const on = u === unit
            return (
              <button
                key={u}
                role="radio"
                aria-checked={on}
                title={UNIT_LABEL[u]}
                onClick={() => setUnit(u)}
                className={`rounded-xl font-extrabold tracking-wide transition ${
                  rail ? 'py-1.5 text-[11px]' : 'py-2 text-[12.5px]'
                } ${
                  on ? 'bg-white text-indigo-700 shadow-sm' : 'bg-white/12 text-white/75 hover:bg-white/20'
                }`}
              >
                {u}
              </button>
            )
          })}
        </div>
        {onCloseMobile && (
          <button
            className="md:hidden text-white/70 hover:text-white p-1"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1.5">
        {menuFor(unit).map((id) => {
          const { label, icon: Icon } = NAV_ITEM[id]
          const count =
            id === 'priority' ? criticalCount : id === 'history' ? historyCount : id === 'notes' ? notesCount : 0
          const urgent = id === 'priority'
          return (
            <button
              key={id}
              className={`nav-item ${rail ? 'rail' : ''} ${
                view === id || (id === 'monthlyreport' && (view === 'monthlyplan' || view === 'routecard' || view === 'maintenancereport' || view === 'toolingreport' || view === 'purchasereport')) ? 'active' : ''
              }`}
              onClick={() => {
                setView(id)
                onNavigate?.()
              }}
              title={rail ? t(label) : undefined}
              aria-label={rail ? t(label) : undefined}
            >
              <Icon size={18} />
              {!rail && <span className="flex-1 text-left">{t(label)}</span>}
              {count > 0 &&
                (rail ? (
                  // No room for a number beside the icon, so it rides the corner instead.
                  <span
                    className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[10px] font-bold ${
                      urgent ? 'bg-red-500 text-white' : 'bg-white/25 text-white'
                    }`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                ) : (
                  <span
                    className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
                      urgent ? 'bg-red-500 text-white' : 'bg-white/20 text-white'
                    }`}
                  >
                    {count}
                  </span>
                ))}
            </button>
          )
        })}
        {menuFor(unit).length === 0 &&
          (rail ? (
            <div className="text-[11px] text-white/45 text-center py-4 leading-tight">—</div>
          ) : (
            <div className="text-[12px] text-white/55 px-3 py-6 leading-relaxed">
              {t('No sections are set up for this unit yet.')}
            </div>
          ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        {/* The install prompt is a sentence, not an icon — it waits for the full menu. */}
        {!rail && <InstallButton variant="sidebar" />}
        <button
          className={`nav-item ${rail ? 'rail' : ''} ${view === 'settings' ? 'active' : ''}`}
          onClick={() => {
            setView('settings')
            onNavigate?.()
          }}
          title={rail ? t('Settings') : undefined}
          aria-label={rail ? t('Settings') : undefined}
        >
          <Settings size={18} />
          {!rail && <span className="flex-1 text-left">{t('Settings')}</span>}
        </button>
        {onCollapse && (
          <button
            className={`nav-item ${rail ? 'rail' : ''}`}
            onClick={onCollapse}
            title={rail ? t('Show menu') : t('Hide menu')}
            aria-label={rail ? 'Show menu' : 'Hide menu'}
          >
            {/* Icon only — the tooltip and aria-label still name it. */}
            {rail ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
        {!rail && <div className="text-[11px] text-white/40 px-3 pt-2">v1.0 · Bento UI</div>}
      </div>
    </>
  )
}

export function Sidebar(props: SidebarProps) {
  const { open, onClose, collapsed, onCollapse } = props
  return (
    <>
      {/* Desktop: sticky sidebar (stays in view; footer always reachable). "Hide menu" narrows
          it to an icon rail rather than removing it, so navigation is always one click away. */}
      <aside
        className={`sidebar-grad hidden md:flex md:flex-col shrink-0 text-white sticky top-0 self-start h-screen overflow-y-auto overflow-x-hidden scroll-area transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[76px] px-2 py-4' : 'w-64 p-4'
        }`}
      >
        <SidebarBody {...props} onCollapse={onCollapse} rail={collapsed} />
      </aside>

      {/* Mobile: slide-in drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
          <aside className="sidebar-grad absolute left-0 top-0 bottom-0 w-72 max-w-[82%] p-4 text-white flex flex-col rise-x overflow-y-auto scroll-area shadow-2xl">
            {/* mobile drawer: no "Hide menu" (that's desktop-only) */}
            <SidebarBody {...props} onCollapse={undefined} onNavigate={onClose} onCloseMobile={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}
