// The Excel groups downtime reasons into 3 colour-coded categories:
//   Operator Downtime (green) · Maintenance Downtime (red) · Management Downtime (violet)

export type DtCategory = 'operator' | 'maintenance' | 'management'

export const DT_CATEGORY_META: Record<DtCategory, { label: string; color: string }> = {
  operator: { label: 'Operator Downtime', color: '#22c55e' },
  maintenance: { label: 'Maintenance Downtime', color: '#ef4444' },
  management: { label: 'Management Downtime', color: '#8b5cf6' },
}

// Keywords that place a reason in the Management category.
const MANAGEMENT_KEYS = [
  'new setting',
  'tool waiting',
  'no material',
  'q.c',
  'waiting',
  'wheel dressing',
  'no operator',
  'new operator',
  'material defect',
  'under trial',
  'no power',
  'no air',
  'no coolant',
  'other',
  'oiling',
  'cleaning',
  'not in plan',
  'wheel change',
  // Spelled this way on the Shell and Roller sheets, where downtime is typed as free text.
  'no plan',
  'quality check',
  'qc check',
]

/** Classify a downtime reason into its category. */
export function downtimeCategory(reason: string): DtCategory {
  const r = (reason || '').toLowerCase()
  if (r.includes('maint')) return 'maintenance'
  if (MANAGEMENT_KEYS.some((k) => r.includes(k))) return 'management'
  return 'operator'
}

export function downtimeColor(reason: string): string {
  return DT_CATEGORY_META[downtimeCategory(reason)].color
}

export function categoryLabel(reason: string): string {
  return DT_CATEGORY_META[downtimeCategory(reason)].label
}

// These reasons read as an incomplete phrase on their own, so "Downtime" is
// appended when shown (e.g. "No Operator" → "No Operator Downtime"). They are
// also listed ABOVE the regular downtime list (they're setup/management items,
// not machine downtime).
const DOWNTIME_SUFFIX_KEYS = ['new setting', 'no material', 'no operator']

/** True for the setup/management reasons (New Setting, No Material, No Operator). */
export function isPreDowntimeReason(reason: string): boolean {
  const r = (reason || '').toLowerCase()
  return DOWNTIME_SUFFIX_KEYS.some((k) => r.includes(k))
}

/** Reason as shown to the user — displayed as-is (no "Downtime" suffix). */
export function reasonLabel(reason: string): string {
  return reason
}

/** Which category ate the most of this machine's downtime — operator/maintenance/management, whichever sums highest. */
export function dominantCategory(downtime: Record<string, number>): DtCategory | null {
  const totals: Record<DtCategory, number> = { operator: 0, maintenance: 0, management: 0 }
  for (const [reason, value] of Object.entries(downtime || {})) {
    totals[downtimeCategory(reason)] += value || 0
  }
  const [top] = (Object.entries(totals) as [DtCategory, number][]).sort((a, b) => b[1] - a[1])
  return top[1] > 0 ? top[0] : null
}

/** Colour for whichever downtime category dominates this machine's recorded downtime. */
export function dominantDowntimeColor(downtime: Record<string, number>): string {
  const cat = dominantCategory(downtime)
  return cat ? DT_CATEGORY_META[cat].color : DT_CATEGORY_META.operator.color
}
