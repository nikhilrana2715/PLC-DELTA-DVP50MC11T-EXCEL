import type { ReactNode } from 'react'

interface Item {
  label: string
  value: ReactNode
  color: string
}

export function TooltipCard({ title, items }: { title: string; items: Item[] }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid rgba(15,23,42,0.12)',
        borderRadius: 12,
        boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)',
        padding: '0.6rem 0.75rem',
        fontSize: 12.5,
        minWidth: 150,
        maxWidth: 240, // keep it small so it never covers the chart on mobile
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: '#0b1120',
          marginBottom: 6,
          whiteSpace: 'normal', // wrap long downtime names onto multiple lines
          wordBreak: 'break-word',
          lineHeight: 1.3,
        }}
      >
        {title}
      </div>
      {items.map((it) => (
        <div
          key={it.label}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: it.color,
              flex: '0 0 auto',
            }}
          />
          <span
            style={{
              color: '#475069',
              flex: 1,
              minWidth: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {it.label}
          </span>
          <span
            style={{
              color: '#0b1120',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              flex: '0 0 auto',
            }}
          >
            {it.value}
          </span>
        </div>
      ))}
    </div>
  )
}
