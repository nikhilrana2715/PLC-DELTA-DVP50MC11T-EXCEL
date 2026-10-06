import { LayoutDashboard, CalendarRange, Gauge, BarChart3, Menu } from 'lucide-react'
import type { View } from './Sidebar'
import { menuFor } from './Sidebar'
import { useT } from '../lib/i18n'
import { useUnit } from '../lib/unit'

/**
 * The four screens worth a tap on a phone; everything else is behind "More".
 *
 * Each tab opens the ACTIVE workspace's version of that screen — the tab bar switches with
 * U1 / U2 / U3 / ASS along with the rest of the app, because the view it selects is rendered
 * by whichever workspace is on screen.
 */
const TABS: { id: View; label: string; short: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { id: 'monthlyreport', label: 'Monthly Report', short: 'Reports', icon: CalendarRange },
  { id: 'kpi', label: 'KPI', short: 'KPI', icon: Gauge },
  { id: 'downtime', label: 'Downtime', short: 'Downtime', icon: BarChart3 },
]

/**
 * Instagram-style bottom tab bar (phones only). The main screens are one tap away and
 * "More" opens the full menu drawer.
 */
export function MobileNav({
  view,
  setView,
  onMore,
}: {
  view: View
  setView: (v: View) => void
  onMore: () => void
}) {
  const t = useT()
  const unit = useUnit()
  // Assembly has no KPI or Downtime screen of its own. Rather than drop the tab and shuffle
  // the bar about, it stays in place and reads as unavailable — the bar is then the same
  // shape in every workspace, which is what makes it learnable.
  const available = new Set(menuFor(unit))

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur border-t border-[var(--hairline)]"
      // --surface follows the theme, so the bar is white on light and dark on dark.
      style={{
        background: 'color-mix(in srgb, var(--surface) 95%, transparent)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -2px 12px rgba(15,23,42,0.10)',
      }}
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, label, short, icon: Icon }) => {
          // Monthly Planning and Route Card sit inside Monthly Report, so the tab stays lit
          // while you are on either of them.
          const active = view === id || (id === 'monthlyreport' && (view === 'monthlyplan' || view === 'routecard' || view === 'maintenancereport' || view === 'toolingreport' || view === 'purchasereport'))
          const on = available.has(id)
          return (
            <button
              key={id}
              onClick={() => on && setView(id)}
              disabled={!on}
              className="relative flex flex-col items-center justify-center gap-0.5 py-2 transition disabled:cursor-default"
              aria-current={active ? 'page' : undefined}
              title={on ? t(label) : `${t(label)} — ${t('not in this unit')}`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 2}
                className={active ? '' : 'text-slate-400'}
                style={active ? { color: 'var(--accent)' } : on ? undefined : { opacity: 0.35 }}
              />
              <span
                className={`text-[10px] leading-none ${active ? 'font-bold' : 'font-semibold text-slate-500'}`}
                style={active ? { color: 'var(--accent)' } : on ? undefined : { opacity: 0.35 }}
              >
                {t(short)}
              </span>
              {active && <span className="absolute top-0 w-8 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />}
            </button>
          )
        })}

        <button onClick={onMore} className="flex flex-col items-center justify-center gap-0.5 py-2" aria-label="More">
          <Menu size={22} className="text-slate-400" />
          <span className="text-[10px] leading-none font-semibold text-slate-500">{t('More')}</span>
        </button>
      </div>
    </nav>
  )
}
