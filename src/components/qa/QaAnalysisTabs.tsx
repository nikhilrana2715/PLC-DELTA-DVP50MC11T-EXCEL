// Customer / Product / Defect analysis tabs — table first, then the matching chart,
// mirroring the Executive Summary layout.
import type { BreakdownData } from '../KpiBreakdownModal'
import { Card, CategoryBars, GridTable, C, clip, name, num, strong, type GridCol } from './qaUi'
import { fmtInt, fmtPct, type CustomerItemRow, type CustomerRow, type DefectRow, type ProductRow, type QaModel } from '../../lib/qa'

/** Charts stay readable up to ~20 categories; beyond that the axis turns to mush. */
const CHART_TOP = 18

const pct = (n: number) => (n ? fmtPct(n) : '–')
const sum = <T,>(rows: T[], get: (r: T) => number) => rows.reduce((s, r) => s + get(r), 0)

type OpenModal = (d: BreakdownData) => void

/* ================= 1 · CUSTOMER ANALYSIS ================= */
export function CustomerAnalysis({ model, open }: { model: QaModel; open: OpenModal }) {
  const { customers, customerItems } = model

  // Clicking a customer lists every item that customer returned.
  const openCustomer = (c: CustomerRow) =>
    open({
      title: `${c.customer} — item-wise returns`,
      note: `${fmtInt(c.returns)} return line(s) · ${fmtInt(c.items)} item(s)`,
      columns: [
        { key: 'item', label: 'Item Name', primary: true },
        { key: 'n', label: 'Returns', align: 'right' },
        { key: 'qty', label: 'Return Qty', align: 'right' },
        { key: 'ok', label: 'Good Qty', align: 'right' },
        { key: 'rej', label: 'Rejection', align: 'right' },
      ],
      rows: customerItems
        .filter((r) => r.customer === c.customer)
        .map((r) => ({ item: r.item, n: fmtInt(r.returns), qty: fmtInt(r.qty), ok: fmtInt(r.ok), rej: fmtInt(r.rejection) })),
      total: { n: fmtInt(c.returns), qty: fmtInt(c.qty), ok: fmtInt(c.ok), rej: fmtInt(c.rejection) },
    })

  const cols: GridCol<CustomerRow>[] = [
    { key: 'customer', label: 'Customer Name', width: 210, sticky: 'left', render: (r) => name(r.customer), total: 'TOTAL' },
    { key: 'items', label: 'Items', align: 'right', width: 74, render: (r) => num(r.items), total: fmtInt(new Set(customerItems.map((r) => r.item)).size) },
    { key: 'returns', label: 'Returns', align: 'right', width: 84, render: (r) => num(r.returns), total: fmtInt(sum(customers, (r) => r.returns)) },
    { key: 'qty', label: 'Total Return Qty', align: 'right', width: 132, render: (r) => strong(r.qty, C.bar), total: fmtInt(sum(customers, (r) => r.qty)) },
    { key: 'ok', label: 'Good Qty', align: 'right', width: 104, render: (r) => strong(r.ok, C.green), total: fmtInt(sum(customers, (r) => r.ok)) },
    { key: 'rej', label: 'Rejection', align: 'right', width: 104, render: (r) => strong(r.rejection, C.red), total: fmtInt(sum(customers, (r) => r.rejection)) },
    { key: 'rejPct', label: 'Rejection %', align: 'right', width: 106, render: (r) => pct(r.rejPct), total: pct(qtyPct(customers)) },
  ]

  const itemCols: GridCol<CustomerItemRow>[] = [
    { key: 'customer', label: 'Customer Name', width: 200, sticky: 'left', render: (r) => name(r.customer), total: 'TOTAL' },
    { key: 'item', label: 'Item Name', width: 170, render: (r) => clip(r.item, 160) },
    { key: 'returns', label: 'Returns', align: 'right', width: 84, render: (r) => num(r.returns), total: fmtInt(sum(customerItems, (r) => r.returns)) },
    { key: 'qty', label: 'Return Qty', align: 'right', width: 110, render: (r) => strong(r.qty, C.bar), total: fmtInt(sum(customerItems, (r) => r.qty)) },
    { key: 'ok', label: 'Good Qty', align: 'right', width: 104, render: (r) => strong(r.ok, C.green), total: fmtInt(sum(customerItems, (r) => r.ok)) },
    { key: 'rej', label: 'Rejection', align: 'right', width: 100, render: (r) => strong(r.rejection, C.red), total: fmtInt(sum(customerItems, (r) => r.rejection)) },
    { key: 'topDefect', label: 'Top Defect (item-wise)', width: 210, render: (r) => clip(r.topDefect, 200) },
  ]

  const chart = customers.slice(0, CHART_TOP).map((r) => ({ name: r.customer, qty: r.qty, ok: r.ok, rej: r.rejection }))

  // Charts first (the overview), then the tables that back them up.
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
        <Card title="Return Qty by Customer">
          <CategoryBars data={chart} series={[{ key: 'qty', name: 'Return Qty', tone: 'qty' }]} slotWidth={84} />
        </Card>
        <Card title="Good vs Rejection by Customer">
          <CategoryBars
            data={chart}
            series={[
              { key: 'ok', name: 'Good Qty', tone: 'good' },
              { key: 'rej', name: 'Rejection', tone: 'bad' },
            ]}
            slotWidth={84}
          />
        </Card>
      </div>

      <Card
        title="Customer-wise Return Summary"
        hint="click a row for item-wise detail"
        note="Quantities are RETURNED quantity — neither sheet carries the quantity originally supplied, so Rejection % is a share of returns."
      >
        <GridTable cols={cols} rows={customers} rowKey={(r) => r.customer} onRow={openCustomer} />
      </Card>

      <Card title="Customer × Item Detail" note="Top Defect comes from the MRS Observation sheet, which records defects per ITEM only — it is not split across the customers that returned that item.">
        <GridTable cols={itemCols} rows={customerItems} rowKey={(r) => `${r.customer}|${r.item}`} maxH={470} />
      </Card>
    </>
  )
}
const qtyPct = (rows: CustomerRow[]) => {
  const q = sum(rows, (r) => r.qty)
  return q ? (sum(rows, (r) => r.rejection) / q) * 100 : 0
}

/* ================= 2 · PRODUCT ANALYSIS ================= */
export function ProductAnalysis({ model, open }: { model: QaModel; open: OpenModal }) {
  const { products, obs, customerItems } = model

  // Clicking an item lists every issue raised against it, plus who returned it.
  const openProduct = (p: ProductRow) => {
    const agg = new Map<string, { qty: number; n: number; ok: number; rw: number; nok: number }>()
    for (const r of obs) {
      if (r.item !== p.item) continue
      const k = r.observation.replace(/\s+/g, ' ').trim() || '—'
      const c = agg.get(k) || { qty: 0, n: 0, ok: 0, rw: 0, nok: 0 }
      c.qty += r.received
      c.n += 1
      c.ok += r.ok
      c.rw += r.rework
      c.nok += r.afterReworkNok
      agg.set(k, c)
    }
    const who = customerItems.filter((r) => r.item === p.item).map((r) => r.customer)
    open({
      title: `${p.item} — issues found`,
      note: who.length ? `Returned by: ${[...new Set(who)].join(', ')}` : undefined,
      columns: [
        { key: 'issue', label: 'Issue / Observation', primary: true, wrap: true },
        { key: 'n', label: 'Incidence', align: 'right' },
        { key: 'qty', label: 'Defect Qty', align: 'right' },
        { key: 'ok', label: 'OK Qty', align: 'right' },
        { key: 'rw', label: 'Rework', align: 'right' },
        { key: 'nok', label: 'Not OK', align: 'right' },
      ],
      rows: [...agg.entries()]
        .sort((a, b) => b[1].qty - a[1].qty)
        .map(([issue, v]) => ({ issue, n: fmtInt(v.n), qty: fmtInt(v.qty), ok: fmtInt(v.ok), rw: fmtInt(v.rw), nok: fmtInt(v.nok) })),
      total: { n: fmtInt(p.incidence), qty: fmtInt(p.defectQty) },
    })
  }

  const cols: GridCol<ProductRow>[] = [
    { key: 'item', label: 'Item Name', width: 180, sticky: 'left', render: (r) => name(r.item), total: 'TOTAL' },
    { key: 'customers', label: 'Customers', align: 'right', width: 96, render: (r) => num(r.customers) },
    { key: 'returns', label: 'Returns', align: 'right', width: 82, render: (r) => num(r.returns), total: fmtInt(sum(products, (r) => r.returns)) },
    { key: 'qty', label: 'Return Qty', align: 'right', width: 112, render: (r) => strong(r.qty, C.bar), total: fmtInt(sum(products, (r) => r.qty)) },
    { key: 'ok', label: 'Good Qty', align: 'right', width: 104, render: (r) => strong(r.ok, C.green), total: fmtInt(sum(products, (r) => r.ok)) },
    { key: 'rej', label: 'Rejection', align: 'right', width: 100, render: (r) => strong(r.rejection, C.red), total: fmtInt(sum(products, (r) => r.rejection)) },
    { key: 'issues', label: 'Issues', align: 'right', width: 78, render: (r) => num(r.issues) },
    { key: 'incidence', label: 'Incidence', align: 'right', width: 96, render: (r) => num(r.incidence), total: fmtInt(sum(products, (r) => r.incidence)) },
    { key: 'topIssue', label: 'Top Issue', width: 220, render: (r) => clip(r.topIssue, 210) },
    { key: 'topIssueQty', label: 'Top Issue Qty', align: 'right', width: 118, render: (r) => strong(r.topIssueQty, '#d9a400') },
  ]

  const chart = products.slice(0, CHART_TOP).map((r) => ({ name: r.item, qty: r.qty, ok: r.ok, rej: r.rejection, defect: r.defectQty }))

  // Charts first (the overview), then the table that backs them up.
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
        <Card title="Return Qty by Item">
          <CategoryBars data={chart} series={[{ key: 'qty', name: 'Return Qty', tone: 'qty' }]} />
        </Card>
        <Card title="Good vs Rejection by Item">
          <CategoryBars
            data={chart}
            series={[
              { key: 'ok', name: 'Good Qty', tone: 'good' },
              { key: 'rej', name: 'Rejection', tone: 'bad' },
            ]}
          />
        </Card>
      </div>

      <Card title="Defect Qty by Item" hint="from MRS Observation">
        <CategoryBars data={chart} series={[{ key: 'defect', name: 'Defect Qty', tone: 'warn' }]} />
      </Card>

      <Card
        title="Item-wise Return & Issue Summary"
        hint="click a row for the issue list"
        note="Return / Good / Rejection come from Customer Goods Return; Issues and Incidence come from MRS Observation, joined on Item Name."
      >
        <GridTable cols={cols} rows={products} rowKey={(r) => r.item} onRow={openProduct} />
      </Card>
    </>
  )
}

/* ================= 3 · DEFECT ANALYSIS ================= */
export function DefectAnalysis({ model, open }: { model: QaModel; open: OpenModal }) {
  const { defects, customerItems, obs } = model

  // Clicking a defect lists the items carrying it.
  const openDefect = (d: DefectRow) => {
    const agg = new Map<string, { qty: number; n: number }>()
    for (const r of obs) {
      if ((r.observation.replace(/\s+/g, ' ').trim() || '—').toLowerCase() !== d.defect.toLowerCase()) continue
      const c = agg.get(r.item || '—') || { qty: 0, n: 0 }
      c.qty += r.received
      c.n += 1
      agg.set(r.item || '—', c)
    }
    open({
      title: `${d.defect} — item-wise`,
      note: `${d.category} · ${fmtInt(d.incidence)} incidence · ${fmtInt(d.qty)} qty`,
      columns: [
        { key: 'item', label: 'Item Name', primary: true },
        { key: 'n', label: 'Incidence', align: 'right' },
        { key: 'qty', label: 'Defect Qty', align: 'right' },
      ],
      rows: [...agg.entries()].sort((a, b) => b[1].qty - a[1].qty).map(([item, v]) => ({ item, n: fmtInt(v.n), qty: fmtInt(v.qty) })),
      total: { n: fmtInt(d.incidence), qty: fmtInt(d.qty) },
    })
  }

  const defectCols: GridCol<DefectRow>[] = [
    { key: 'defect', label: 'Defect', width: 230, sticky: 'left', render: (r) => name(r.defect), total: 'TOTAL' },
    { key: 'category', label: 'Category', width: 140, render: (r) => clip(r.category, 130) },
    { key: 'incidence', label: 'Incidence', align: 'right', width: 96, render: (r) => num(r.incidence), total: fmtInt(sum(defects, (r) => r.incidence)) },
    { key: 'qty', label: 'Defect Qty', align: 'right', width: 112, render: (r) => strong(r.qty, C.red), total: fmtInt(sum(defects, (r) => r.qty)) },
    { key: 'ok', label: 'OK Qty', align: 'right', width: 100, render: (r) => strong(r.ok, C.green), total: fmtInt(sum(defects, (r) => r.ok)) },
    { key: 'rework', label: 'Rework', align: 'right', width: 96, render: (r) => num(r.rework), total: fmtInt(sum(defects, (r) => r.rework)) },
    { key: 'reworkOk', label: 'Rework OK', align: 'right', width: 108, render: (r) => strong(r.reworkOk, C.green), total: fmtInt(sum(defects, (r) => r.reworkOk)) },
    { key: 'notOk', label: 'Not OK', align: 'right', width: 96, render: (r) => strong(r.notOk, C.red), total: fmtInt(sum(defects, (r) => r.notOk)) },
    { key: 'items', label: 'Items', align: 'right', width: 76, render: (r) => num(r.items) },
    { key: 'topItem', label: 'Top Item', width: 160, render: (r) => clip(r.topItem, 150) },
  ]

  const ciCols: GridCol<CustomerItemRow>[] = [
    { key: 'customer', label: 'Customer Name', width: 200, sticky: 'left', render: (r) => name(r.customer), total: 'TOTAL' },
    { key: 'item', label: 'Item Returned', width: 170, render: (r) => clip(r.item, 160) },
    { key: 'qty', label: 'Return Qty', align: 'right', width: 110, render: (r) => strong(r.qty, C.bar), total: fmtInt(sum(customerItems, (r) => r.qty)) },
    { key: 'ok', label: 'Good Qty', align: 'right', width: 104, render: (r) => strong(r.ok, C.green), total: fmtInt(sum(customerItems, (r) => r.ok)) },
    { key: 'rej', label: 'Defect Qty', align: 'right', width: 110, render: (r) => strong(r.rejection, C.red), total: fmtInt(sum(customerItems, (r) => r.rejection)) },
    { key: 'topDefect', label: 'Top Defect (item-wise)', width: 220, render: (r) => clip(r.topDefect, 210) },
  ]

  const chart = defects.slice(0, CHART_TOP).map((r) => ({ name: r.defect, qty: r.qty, ok: r.ok, notOk: r.notOk }))

  // Category roll-up — the readable summary over ~100+ free-text observations.
  const catMap = new Map<string, number>()
  for (const d of defects) catMap.set(d.category, (catMap.get(d.category) || 0) + d.qty)
  const catChart = [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, qty]) => ({ name, qty }))

  // Charts first (the overview), then the tables that back them up.
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4">
        <Card title="Defect Qty by Defect" hint={`top ${CHART_TOP}`}>
          <CategoryBars data={chart} series={[{ key: 'qty', name: 'Defect Qty', tone: 'bad' }]} slotWidth={84} />
        </Card>
        <Card title="Defect Qty by Category">
          <CategoryBars data={catChart} series={[{ key: 'qty', name: 'Defect Qty', tone: 'warn' }]} slotWidth={110} />
        </Card>
      </div>

      <Card title="Recovery by Defect" hint={`OK vs Not OK · top ${CHART_TOP}`}>
        <CategoryBars
          data={chart}
          series={[
            { key: 'ok', name: 'OK Qty', tone: 'good' },
            { key: 'notOk', name: 'Not OK', tone: 'bad' },
          ]}
          slotWidth={84}
        />
      </Card>

      <Card title="Defect-wise Summary" hint="click a row for item-wise detail">
        <GridTable cols={defectCols} rows={defects} rowKey={(r) => r.defect} onRow={openDefect} />
      </Card>

      <Card
        title="Customer × Item — Good vs Defect"
        note="Good and Defect Qty come from Customer Goods Return. Top Defect is the item's biggest MRS observation — that sheet has no customer column, so it cannot be attributed to one customer."
      >
        <GridTable cols={ciCols} rows={customerItems} rowKey={(r) => `${r.customer}|${r.item}`} maxH={470} />
      </Card>
    </>
  )
}
