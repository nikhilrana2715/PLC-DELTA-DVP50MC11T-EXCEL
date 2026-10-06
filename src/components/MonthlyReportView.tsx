import { CalendarRange, ChevronRight, Hammer, Route, ShoppingCart, Target, Wrench } from 'lucide-react'
import type { View } from './Sidebar'
import { useT } from '../lib/i18n'

/**
 * The Monthly Report hub.
 *
 * "Monthly Report" is the menu entry; the reports themselves live one level down as cards.
 * Month-end reporting keeps growing (achievement, downtime summary, rejection), and each new
 * one is a row in `reports` rather than another line in the sidebar — the menu stays short
 * while the section grows.
 */

interface Report {
  view: View
  title: string
  desc: string
  /** Small line under the title, e.g. how many months are stored. */
  stat: string
  icon: typeof CalendarRange
  /** Card accent — the tile behind the icon. */
  tint: string
}

export function MonthlyReportView({
  planCount,
  latest,
  routeCardCount,
  routeCardLatest,
  cpkCount,
  cpkLatest,
  maintenanceCount = 0,
  maintenanceLatest = '',
  toolingCount = 0,
  toolingLatest = '',
  purchaseCount = 0,
  purchaseLatest = '',
  onOpen,
}: {
  planCount: number
  latest: string
  routeCardCount: number
  routeCardLatest: string
  /** Months that carry at least one Cp-Cpk reading, and the newest of them. */
  cpkCount: number
  cpkLatest: string
  maintenanceCount?: number
  maintenanceLatest?: string
  toolingCount?: number
  toolingLatest?: string
  purchaseCount?: number
  purchaseLatest?: string
  onOpen: (v: View) => void
}) {
  const t = useT()
  const saved = (count: number, newest: string, empty = 'No file uploaded yet') =>
    count > 0 ? `${count} ${t(count === 1 ? 'month saved' : 'months saved')} · ${newest}` : t(empty)

  const reports: Report[] = [
    {
      view: 'monthlyplan',
      title: 'Monthly Planning',
      desc: "The month's Plan Confirmation sheet — machine-wise plan, day by day, against what was actually made.",
      stat: saved(planCount, latest),
      icon: CalendarRange,
      tint: 'linear-gradient(150deg,#4f46e5,#7c3aed 55%,#db2777)',
    },
    {
      view: 'routecard',
      title: 'Route Card',
      desc: 'The route card workbook for a month — every sheet in the file, printed as it was written.',
      stat: saved(routeCardCount, routeCardLatest),
      icon: Route,
      tint: 'linear-gradient(150deg,#0d9488,#0ea5e9 55%,#4f46e5)',
    },
    {
      view: 'cpk',
      title: 'Cp-Cpk',
      desc: 'Every Cp-Cpk reading of the month — machine, item and batch wise, against the 1.33 target.',
      stat: saved(cpkCount, cpkLatest, 'No reading yet'),
      icon: Target,
      tint: 'linear-gradient(150deg,#b45309,#ea580c 55%,#e11d48)',
    },
    {
      view: 'maintenancereport',
      title: 'Maintenance Report',
      desc: 'The monthly maintenance workbook — equipment status, breakdown log, PM schedule & downtime history.',
      stat: saved(maintenanceCount, maintenanceLatest),
      icon: Wrench,
      tint: 'linear-gradient(150deg,#0284c7,#06b6d4 55%,#3b82f6)',
    },
    {
      view: 'toolingreport',
      title: 'Tooling Report',
      desc: 'Tooling inventory & usage report — tool condition, replacement log, cost tracking & tool life data.',
      stat: saved(toolingCount, toolingLatest),
      icon: Hammer,
      tint: 'linear-gradient(150deg,#7c3aed,#a855f7 55%,#c084fc)',
    },
    {
      view: 'purchasereport',
      title: 'Purchase Report',
      desc: 'Purchase order tracking — vendor-wise orders, delivery status, pending items & cost summary.',
      stat: saved(purchaseCount, purchaseLatest),
      icon: ShoppingCart,
      tint: 'linear-gradient(150deg,#059669,#10b981 55%,#34d399)',
    },
  ]

  return (
    <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((r) => {
        const Icon = r.icon
        return (
          <button
            key={r.view}
            onClick={() => onOpen(r.view)}
            className="bento bento-pad text-left flex flex-col gap-3 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-2xl grid place-items-center text-white shadow-sm" style={{ background: r.tint }}>
                <Icon size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-slate-800 leading-tight">{t(r.title)}</div>
                <div className="text-[12px] mt-0.5" style={{ color: 'var(--ink-hint)' }}>
                  {r.stat}
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 mt-1 text-slate-300" />
            </div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {t(r.desc)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
