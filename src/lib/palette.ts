import { efficiencyGoodLine, efficiencyTarget } from './unit'
// Validated data-viz palette (light surface #fcfcfb).
// Categorical slots are assigned in fixed order, never cycled.

export const SURFACE = '#fcfcfb'

/** Categorical hues in CVD-safe fixed order. */
export const CATEGORICAL = [
  '#2a78d6', // 1 blue
  '#1baf7a', // 2 aqua / emerald
  '#eda100', // 3 yellow
  '#008300', // 4 green
  '#4a3aa7', // 5 violet
  '#e34948', // 6 red
  '#e87ba4', // 7 magenta
  '#eb6834', // 8 orange
] as const

/** Reserved status palette — never reused as a series colour. */
export const STATUS = {
  good: '#0ca30c', // >= 90%
  warning: '#fab219', // 75 - 90%
  serious: '#ec835a',
  critical: '#d03b3b', // < 75%
} as const

/** Named roles used across the plan/achievement/backlog chart. */
export const SERIES = {
  plan: '#2a78d6', // Running Plan  -> blue
  achievement: '#1baf7a', // Achievement -> emerald
  backlog: '#eb6834', // Backlog     -> orange
  efficiency: '#4a3aa7', // Efficiency  -> violet
  downtime: '#e34948', // Downtime    -> red
} as const

// Theme-aware — these read the CSS custom properties (index.css), which flip
// automatically in dark mode. Chart axis/legend text was previously a hardcoded
// near-black (#0b0b0b), which was invisible against a dark background.
export const INK = {
  primary: 'var(--ink)',
  secondary: 'var(--ink-2)',
  muted: 'var(--ink-muted)',
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
}

/** Colour that represents a machine's efficiency band. */
export function efficiencyColor(eff: number | null): string {
  if (eff === null || Number.isNaN(eff)) return INK.muted
  // Banded against the ACTIVE unit's target — Unit 1 grinds to 75%, Shell to 90%, Roller to 95%.
  if (eff < efficiencyTarget()) return STATUS.critical
  if (eff < efficiencyGoodLine()) return STATUS.warning
  return STATUS.good
}

/** A downtime reason gets a stable colour from the categorical ramp. */
export function reasonColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length]
}
