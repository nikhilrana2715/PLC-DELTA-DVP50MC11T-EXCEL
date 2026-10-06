import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Filter, Gauge, Percent, RefreshCcw, Target, TrendingUp, Users } from 'lucide-react'
import { prodKpis, type ProdRow } from '../lib/prodSummary'
import { loadImports, useImportModal, useImports } from '../lib/prodImport'
import { ProdImportModal } from './pd/ProdImportModal'
import { ProdFullTable } from './pd/ProdFullTable'
import { DT_CATEGORY_META } from '../lib/downtime'
import { useT } from '../lib/i18n'

/**
 * The KPI page for Unit 2 (Shell) and Unit 3 (Roller).
 *
 * Same shape as the Unit 1 page — six tiles, the three downtime factors, then the sheet — but
 * driven by the Production Summary workbook, which measures output in KILOGRAMS and carries no
 * plan quantity of its own. The sheet's "ideal production" (cycle rate x available hours) is
 * what a shift could have made, so that is what Total Planning shows here.
 *
 * Cp-Cpk is not on this page: that data is entered per batch on the Unit 1 workbook and has no
 * counterpart in these sheets, so a tile for it would only ever read zero.
 */

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
const fmt2 = (n: number) => (n ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0')

function MetricLine({ label, value, valueColor, strong = false }: { label: string; value: string; valueColor?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span
        title={label}
        className={`min-w-0 truncate ${strong ? 'text-[12px] md:text-[13px] font-semibold text-slate-700' : 'text-[11px] md:text-xs font-semibold text-slate-600'}`}
      >
        {label}
      </span>
      <span className="flex-1 border-b border-dotted border-slate-300/70 translate-y-[-3px]" />
      <span
        className={`shrink-0 font-extrabold tracking-tight tabular-nums leading-tight ${strong ? 'text-lg md:text-xl' : 'text-[15px] md:text-base'}`}
        style={{ color: valueColor ?? 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

function Card({
  label,
  icon,
  tint,
  grad,
  value,
  valueColor,
  sub,
  subColor,
  lines,
  delay = 0,
}: {
  label: string
  icon: React.ReactNode
  tint: string
  grad: string
  value?: string
  valueColor?: string
  sub?: string
  subColor?: string
  lines?: { label: string; value: string; valueColor?: string }[]
  delay?: number
}) {
  return (
    <div className={`stat-card ${tint} rise h-full min-h-[138px] md:min-h-[150px]`} style={{ animationDelay: `${delay}ms` }}>
      <div className="p-3 md:p-3.5 h-full flex flex-col">
        <div className={`stat-icon stat-icon-sm ${grad}`}>{icon}</div>
        {lines?.length ? (
          <div className="mt-auto pt-1.5 flex flex-col gap-0.5">
            <MetricLine label={lines[0].label} value={lines[0].value} valueColor={lines[0].valueColor} strong />
            {lines.slice(1).map((l) => (
              <MetricLine key={l.label} label={l.label} value={l.value} valueColor={l.valueColor} />
            ))}
          </div>
        ) : (
          <div className="mt-auto pt-1.5">
            <div className="text-xs md:text-[13px] font-semibold text-slate-700 leading-tight">{label}</div>
            <div className="text-xl md:text-2xl font-extrabold tracking-tight leading-tight" style={{ color: valueColor ?? 'var(--ink)' }}>
              {value}
            </div>
            {sub && (
              <div className={`text-[11px] mt-0.5 leading-tight ${subColor ? 'font-bold' : 'text-slate-500'}`} style={subColor ? { color: subColor } : undefined}>
                {sub}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ProdKpiPage({ unitLabel, shifts = true }: { unitLabel: string; shifts?: boolean }) {
  const t = useT()
  const imports = useImports()
  const modalOpen = useImportModal()

  useEffect(() => {
    void loadImports()
  }, [])

  const pd = useMemo(
    () => imports.filter((i) => i.convertedAt).sort((a, b) => (b.convertedAt || 0) - (a.convertedAt || 0))[0] ?? null,
    [imports],
  )

  // The cards follow the table's filters, the same way the Unit 1 page does.
  const [filtered, setFiltered] = useState<ProdRow[] | null>(null)
  const onFilteredChange = useCallback((rs: ProdRow[]) => setFiltered(rs), [])
  useEffect(() => setFiltered(null), [pd?.id])

  const reasons = useMemo(() => pd?.reasons ?? [], [pd])
  const descLabel = pd?.descriptionLabel ?? 'Description'
  const rowsForKpis = filtered ?? pd?.rows ?? []
  const k = useMemo(() => (pd ? prodKpis(rowsForKpis) : null), [pd, rowsForKpis])
  const filterOn = !!(pd && filtered && filtered.length !== pd.rows.length)

  if (!pd) {
    return (
      <div className="flex flex-col gap-3 md:gap-4 min-w-0">
        <div className="bento bento-pad text-center py-14">
          <div className="stat-icon stat-icon-sm grad-blue mx-auto">
            <Gauge size={17} />
          </div>
          <div className="mt-3 font-bold text-slate-800">{t('No Production Summary yet')}</div>
          <div className="mt-1 text-sm" style={{ color: 'var(--ink-hint)' }}>
            {t('Use the upload button at the top right to import the')} {unitLabel} {t('Production Summary sheet.')}
          </div>
        </div>
        {modalOpen && <ProdImportModal />}
      </div>
    )
  }

  const attainment = k && k.idealQty > 0 ? (k.achievement / k.idealQty) * 100 : 0
  const downShare = k && k.availableMin > 0 ? (k.downtimeMin / k.availableMin) * 100 : 0
  const splitTotal = k ? k.operatorMin + k.maintenanceMin + k.managementMin : 0

  return (
    <div className="flex flex-col gap-3 md:gap-4 min-w-0">
      {filterOn && (
        <div
          className="rounded-xl px-3 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap"
          style={{ background: 'color-mix(in srgb, #3b82f6 12%, var(--surface))', color: 'var(--ink-2)' }}
        >
          <Filter size={14} style={{ color: '#2563eb' }} />
          {t('Every figure below is for the filtered rows only')} — {fmt(filtered!.length)} {t('of')} {fmt(pd.rows.length)}.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card
          label={t('OEE')}
          icon={<Percent size={18} />}
          tint="tint-blue"
          grad="grad-blue"
          value={`${Math.round(k!.oee)}%`}
          valueColor={k!.oee >= 60 ? '#0f9d58' : k!.oee >= 40 ? undefined : '#d03b3b'}
          sub={`A ${Math.round(k!.availability)}% · P ${Math.round(k!.performance)}% · Q ${Math.round(k!.quality)}%`}
          delay={0}
        />
        <Card
          label={t('Total Planning')}
          icon={<Target size={18} />}
          tint="tint-violet"
          grad="grad-violet"
          value={`${fmt(k!.idealQty)} kg`}
          sub={`${t('ideal output')} · ${fmt(k!.rows)} ${t('row(s)')}`}
          delay={40}
        />
        <Card
          label={t('Total Achievement')}
          icon={<TrendingUp size={18} />}
          tint="tint-emerald"
          grad="grad-emerald"
          value={`${fmt(k!.achievement)} kg`}
          sub={`${attainment.toFixed(1)}% ${t('of ideal')}`}
          delay={80}
        />
        <Card
          label={t('Working Time')}
          icon={<Gauge size={18} />}
          tint="tint-emerald"
          grad="grad-emerald"
          value={`${fmt(k!.workingMin)} ${t('min')}`}
          sub={`${(k!.workingMin / 60).toFixed(0)} ${t('hrs of')} ${(k!.availableMin / 60).toFixed(0)} ${t('available')}`}
          delay={120}
        />
        <Card
          label={t('Total Downtime')}
          icon={<Clock size={18} />}
          tint="tint-yellow"
          grad="grad-yellow"
          value={`${fmt(k!.downtimeMin)} ${t('min')}`}
          sub={`${downShare.toFixed(1)}% ${t('of available time')}`}
          delay={160}
        />
        <Card
          label={t('Rework / Rejection')}
          icon={<RefreshCcw size={18} />}
          tint="tint-red"
          grad="grad-red"
          lines={[
            { label: t('Rework'), value: fmt2(k!.rework), valueColor: k!.rework ? '#ea580c' : undefined },
            { label: t('Rejection'), value: fmt2(k!.rejection), valueColor: k!.rejection ? '#d03b3b' : undefined },
            { label: t('Total Qty'), value: fmt(k!.totalQty) },
          ]}
          delay={200}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(
          [
            ['operator', k!.operatorMin, 'tint-emerald', 'grad-emerald'],
            ['maintenance', k!.maintenanceMin, 'tint-red', 'grad-red'],
            ['management', k!.managementMin, 'tint-violet', 'grad-violet'],
          ] as const
        ).map(([cat, min, tint, grad], i) => (
          <Card
            key={cat}
            label={t(DT_CATEGORY_META[cat].label)}
            icon={<Users size={18} />}
            tint={tint}
            grad={grad}
            value={`${fmt(min)} ${t('min')}`}
            sub={`${splitTotal > 0 ? ((min / splitTotal) * 100).toFixed(1) : '0'}% ${t('of total downtime')}`}
            delay={240 + i * 40}
          />
        ))}
      </div>

      <ProdFullTable
        rows={pd.rows}
        reasons={reasons}
        descriptionLabel={descLabel}
        shifts={shifts}
        onFilteredChange={onFilteredChange}
      />

      {modalOpen && <ProdImportModal />}
    </div>
  )
}
