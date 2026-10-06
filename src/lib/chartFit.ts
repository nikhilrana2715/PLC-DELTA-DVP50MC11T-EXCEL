/**
 * How a category chart should lay itself out for the number of categories it actually has.
 *
 * The charts were built for a full shop — thirty machines across a scrolling strip, labels
 * turned on their side because there is no room to write them flat. Filter down to one
 * machine group and every one of those decisions becomes wrong: a fixed minimum width forces
 * a scrollbar onto a chart with two bars in it, thin bars sit marooned in a wide slot, and
 * the labels stay rotated with 78px of empty axis under them.
 *
 * So the layout follows the data. Width is asked for per category rather than as a floor, so
 * a short list simply fills its container and a long one still scrolls; bars grow as the list
 * shrinks; and the labels only turn when they would otherwise collide.
 */

export interface ChartFit {
  /** Width to ask for. Below the container's own width this does nothing — no scrollbar. */
  minWidth: number
  /** Axis props to spread onto `<XAxis>`. */
  axis: { angle: number; textAnchor: 'end' | 'middle'; height: number; dy: number }
  /** `maxBarSize` for a `<Bar>`; ignored by line and area charts. */
  barSize: number
}

export function chartFit(
  count: number,
  {
    perItem,
    /** Turn the labels once there are more than this many. */
    rotateOver = 8,
    /** Long labels (downtime reasons) need more height when turned, and turn sooner. */
    longLabels = false,
  }: { perItem: number; rotateOver?: number; longLabels?: boolean },
): ChartFit {
  const rotate = count > rotateOver
  return {
    minWidth: Math.max(0, count) * perItem,
    axis: rotate
      ? { angle: -90, textAnchor: 'end', height: longLabels ? 104 : 78, dy: 2 }
      : { angle: 0, textAnchor: 'middle', height: 30, dy: 8 },
    // Fewer bars, fatter bars. A lone machine reading as a 16px sliver looks like an error.
    barSize: count <= 2 ? 46 : count <= 4 ? 34 : count <= 8 ? 24 : 16,
  }
}
