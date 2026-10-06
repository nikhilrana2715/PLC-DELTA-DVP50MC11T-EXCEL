import type { LucideIcon } from 'lucide-react'
import { Sparkles } from 'lucide-react'
import { useT } from '../../lib/i18n'

/** A clean "coming soon" page for QA report modules that aren't built yet. */
export function QaPlaceholder({ title, Icon }: { title: string; Icon: LucideIcon }) {
  const t = useT()
  return (
    <div className="grid place-items-center py-10 md:py-16">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-8">
        <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4" style={{ background: '#2f6fbf' }}>
          <Icon size={30} />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">{t(title)}</h2>
        <p className="mt-2 text-slate-500 text-sm">
          {t('This report is being set up. Its charts and data will appear here soon.')}
        </p>
        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1">
          <Sparkles size={13} /> {t('Coming soon')}
        </span>
      </div>
    </div>
  )
}
