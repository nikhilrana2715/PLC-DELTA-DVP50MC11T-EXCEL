import { useEffect, useState } from 'react'
import { Download, Check } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** "Open in App" — surfaces the PWA install prompt when the browser offers it. */
export function InstallButton({ variant = 'bar' }: { variant?: 'bar' | 'sidebar' }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) setInstalled(true)

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  if (variant === 'sidebar') {
    if (installed) {
      return (
        <div className="nav-item !cursor-default opacity-80">
          <Check size={18} />
          <span className="flex-1 text-left">App installed</span>
        </div>
      )
    }
    if (!deferred) return null
    return (
      <button className="nav-item w-full" onClick={install} title="Install this dashboard as an app">
        <Download size={18} />
        <span className="flex-1 text-left">Open in App</span>
      </button>
    )
  }

  // bar variant
  if (installed) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-2.5 py-1.5">
        <Check size={14} /> App installed
      </span>
    )
  }
  if (!deferred) return null
  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl bg-white border border-[var(--hairline)] hover:bg-slate-50 text-slate-700 text-sm font-semibold px-3 py-2 shadow-sm transition"
      onClick={install}
      title="Install this dashboard as an app"
    >
      <Download size={16} className="text-indigo-600" /> Open in App
    </button>
  )
}
