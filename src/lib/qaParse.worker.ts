// Parses QA goods-return workbooks off the main thread so a large (image-heavy)
// Excel file doesn't freeze the tab ("Page Unresponsive").
import { parseSkfWorkbook, parseObsWorkbook } from './qa'

export type QaParseRequest = { id: number; kind: 'skf' | 'obs'; buf: ArrayBuffer }
export type QaParseResponse =
  | { id: number; ok: true; rows: unknown[] }
  | { id: number; ok: false; error: string }

self.onmessage = (e: MessageEvent<QaParseRequest>) => {
  const { id, kind, buf } = e.data
  try {
    const rows = kind === 'skf' ? parseSkfWorkbook(buf) : parseObsWorkbook(buf)
    ;(self as unknown as Worker).postMessage({ id, ok: true, rows } satisfies QaParseResponse)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message || err) } satisfies QaParseResponse)
  }
}
