import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useT } from '../lib/i18n'
import { useOverlayBack } from '../lib/useOverlayBack'

/**
 * One card's figure, broken out month by month.
 *
 * The cards on the KPI Dashboard each roll a whole range into a single number, which is the
 * point of them — but "56% across four months" hides whether the shop is climbing or sliding.
 * Clicking a card opens the same figure as a column of months, with the range total under it,
 * so the headline and its working are never in two different places.
 */

export interface DetailColumn {
  label: string
  /** Right-aligned: every column but the month itself. */
  num?: boolean
  /** Muted: supporting figures that are not the point of the card. */
  soft?: boolean
}

export interface DetailRow {
  /** 'Jun 2026' — or 'TOTAL' for the summary line. */
  label: string
  cells: string[]
  /** True for a month the range covers but no import supplies. */
  empty?: boolean
}

export function KpiTrendDetail({
  title,
  subtitle,
  note,
  columns,
  rows,
  total,
  accent,
  onClose,
}: {
  title: string
  subtitle: string
  /** The colour of the card this was opened from — the header and the total wear it. */
  accent?: { from: string; to: string }
  /** How a derived column is worked out — shown under the table, not left to guesswork. */
  note?: string
  columns: DetailColumn[]
  rows: DetailRow[]
  total?: DetailRow
  onClose: () => void
}) {
  const t = useT()
  // On a phone this fills the screen, so the phone's Back button has to close it.
  useOverlayBack(onClose)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const cell = (c: DetailColumn, v: string, strong = false) => (
    <td
      className={`px-3 py-[9px] text-[12.5px] whitespace-nowrap ${c.num ? 'text-right tabular-nums' : ''} ${strong ? 'font-extrabold' : ''}`}
      style={{ color: c.soft ? 'var(--ink-hint)' : 'var(--ink-2)' }}
    >
      {v}
    </td>
  )

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch md:grid md:place-items-center p-0 md:p-4 md:overflow-auto scroll-area"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      {/* A phone gets the whole screen and the system Back button; a tablet up keeps the
          centred dialog. Same trade as the machine-wise breakdowns. */}
      <div
        className="bg-white w-full h-full md:h-auto max-w-none md:max-w-3xl rounded-none md:rounded-2xl shadow-2xl overflow-hidden md:my-6 flex flex-col md:block pt-[env(safe-area-inset-top)] md:pt-0"
        style={{
          animation: 'rise 0.18s ease both',
          paddingBottom: 'env(safe-area-inset-bottom)',
          ['--bd-accent' as string]: (accent ?? { from: '#4f46e5' }).from,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 p-4 md:p-5 shrink-0"
          style={{ background: `linear-gradient(135deg, ${(accent ?? { from: '#4f46e5' }).from}, ${(accent ?? { to: '#7c3aed' }).to})` }}
        >
          <div className="min-w-0 flex-1 text-white">
            <div className="text-lg font-extrabold truncate">{t(title)}</div>
            <div className="text-sm text-white/70 truncate">{subtitle}</div>
          </div>
          <button className="text-white/70 hover:text-white shrink-0" onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
        </div>

        <div className="p-3 md:p-4 flex-1 overflow-auto scroll-area md:overflow-visible">
          {/* A phone gets one card per month instead of a table it would have to drag
              sideways — the same trade the machine-wise popups make. */}
          <div className="md:hidden flex flex-col gap-1.5">
            {rows.map((r) => (
              <div
                key={'m-' + r.label}
                className="rounded-xl border border-[var(--hairline)] px-3 py-2"
                style={{ background: 'var(--surface)' }}
              >
                <div className="text-[13.5px] font-extrabold" style={{ color: r.empty ? 'var(--ink-hint)' : 'var(--ink)' }}>
                  {r.label}
                  {r.empty && <span className="ml-1.5 font-semibold text-[11px]">· {t('not imported')}</span>}
                </div>
                {!r.empty && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {columns.slice(1).map((c, j) => [c, j] as const).filter(([, j]) => (r.cells[j] ?? '') !== '').map(([c, j]) => (
                      <span
                        key={c.label + j}
                        className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 max-w-full min-w-0"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        <span className="text-[9.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-hint)' }}>
                          {t(c.label)}
                        </span>
                        <span className="text-[12px] font-bold tabular-nums break-words min-w-0" style={{ color: c.soft ? 'var(--ink-2)' : 'var(--ink)' }}>
                          {r.cells[j] ?? '—'}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {total && (
              <div className="bd-total rounded-xl px-3 py-2">
                <div className="text-[13.5px] font-extrabold" style={{ color: 'var(--ink)' }}>
                  {t(total.label)}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {columns.slice(1).map((c, j) => [c, j] as const).filter(([, j]) => (total.cells[j] ?? '') !== '').map(([c, j]) => (
                    <span key={c.label + j} className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 bg-white/70 max-w-full min-w-0">
                      <span className="text-[9.5px] font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--ink-hint)' }}>
                        {t(c.label)}
                      </span>
                      <span className="text-[12.5px] font-extrabold tabular-nums break-words min-w-0" style={{ color: 'var(--ink)' }}>
                        {total.cells[j] ?? '—'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:block scroll-area" style={{ overflowX: 'auto' }}>
            <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th
                      key={c.label + i}
                      className={`px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap ${c.num ? 'text-right' : 'text-left'}`}
                      style={{ background: 'var(--surface-2)', color: 'var(--ink-hint)' }}
                    >
                      {t(c.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label} style={{ background: i % 2 ? 'color-mix(in srgb, var(--ink) 4%, var(--surface))' : 'var(--surface)' }}>
                    <td
                      className="px-3 py-[9px] text-[12.5px] font-bold whitespace-nowrap"
                      style={{ color: r.empty ? 'var(--ink-hint)' : 'var(--ink)' }}
                    >
                      {r.label}
                      {r.empty && <span className="ml-1.5 font-semibold text-[11px]">· {t('not imported')}</span>}
                    </td>
                    {columns.slice(1).map((c, j) => cell(c, r.cells[j] ?? '—'))}
                  </tr>
                ))}
                {total && (
                  <tr className="bd-total">
                    <td className="px-3 py-[10px] text-[12.5px] font-extrabold whitespace-nowrap" style={{ color: 'var(--ink)' }}>
                      {t(total.label)}
                    </td>
                    {columns.slice(1).map((c, j) => cell({ ...c, soft: false }, total.cells[j] ?? '—', true))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {note && (
            <div className="text-[11.5px] mt-2.5 px-1 leading-relaxed" style={{ color: 'var(--ink-hint)' }}>
              {t(note)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
