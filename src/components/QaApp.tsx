import { useState, useCallback, useEffect } from 'react'
import {
  FlaskConical,
  UploadCloud,
  CheckCircle2,
  History,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  LayoutDashboard,
  Undo2,
  MessageSquare,
  PackageCheck,
  Gauge,
  Cog,
  Flag,
  FileText,
  Star,
  type LucideIcon,
} from 'lucide-react'
import type { AuthUser } from '../lib/auth'
import { SettingsView } from './SettingsView'
import { AboutApplicationPage } from './AboutApplicationPage'
import { QaDashboard } from './qa/QaDashboard'
import { QaImportModal } from './qa/QaImportModal'
import { QaUploadHistory } from './qa/QaUploadHistory'
import { QaPlaceholder } from './qa/QaPlaceholder'
import { clientId } from '../lib/realtime'
import { setLang as setI18nLang, useT } from '../lib/i18n'
import {
  getThemePref,
  setThemePref,
  applyTheme,
  getNotifEnabled,
  setNotifEnabled as persistNotif,
  getLangPref,
  type ThemePref,
  type LangPref,
} from '../lib/prefs'

// QA report modules — each is its own sidebar item + page. "Customer Return Goods" is
// the live Goods-Return dashboard; the rest open a clean "coming soon" page for now.
const QA_MODULES: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'incoming', label: 'Incoming', Icon: PackageCheck },
  { key: 'supplier-ppm', label: 'Supplier PPM', Icon: Gauge },
  { key: 'in-process', label: 'In Process Inspection', Icon: Cog },
  { key: 'final', label: 'Final Inspection', Icon: Flag },
  { key: 'pdir', label: 'PDIR', Icon: FileText },
  { key: 'customer-return', label: 'Customer Return Goods', Icon: Undo2 },
  { key: 'customer-complaint', label: 'Customer Complaint', Icon: MessageSquare },
  { key: 'customer-scorecard', label: 'Customer Score Card', Icon: Star },
]

type QaView = string // module key | 'history' | 'settings' | 'aboutapp'

/**
 * The Quality (QA) portal. Mirrors the main app's shell (sidebar + Settings +
 * Hide menu) but the Dashboard is, for now, just the "Upload Excel" action —
 * feeding the SAME shared reports the meeting dashboard reads.
 */
export function QaApp({
  user,
  onUserUpdate,
  onLogout,
}: {
  user: AuthUser
  onUserUpdate: (u: AuthUser) => void
  onLogout: () => void
}) {
  const [view, setView] = useState<QaView>('dashboard')
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('mm.nav.collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('mm.nav.collapsed', collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // ---- Preferences (shared with the main app, same storage) ----
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref())
  const [notifEnabled, setNotifEnabledState] = useState<boolean>(() => getNotifEnabled())
  const [lang, setLangState] = useState<LangPref>(() => getLangPref())
  useEffect(() => {
    applyTheme(themePref)
    if (themePref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [themePref])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const changeTheme = useCallback((t: ThemePref) => {
    setThemePrefState(t)
    setThemePref(t)
  }, [])
  const changeNotif = useCallback((v: boolean) => {
    setNotifEnabledState(v)
    persistNotif(v)
  }, [])
  const changeLang = useCallback((l: LangPref) => {
    setLangState(l)
    setI18nLang(l) // live-updates every component using useT (also persists)
  }, [])
  const t = useT() // live translations (re-renders on language change)

  // ---- Goods-Return Excel upload (drives the QA dashboard) ----
  const [showImport, setShowImport] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const [dataVersion, setDataVersion] = useState(0)

  // The report module for the current view (all modules are "coming soon" placeholders;
  // the live Goods-Return dashboard now lives under the overall "Dashboard" item).
  const activeModule = QA_MODULES.find((m) => m.key === view)

  const goto = (v: QaView) => {
    setView(v)
    setNavOpen(false)
  }

  // Hamburger inside the Goods-Return dashboard: toggle the desktop menu / open the mobile drawer.
  const onDashMenu = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width:768px)').matches) setCollapsed((c) => !c)
    else setNavOpen(true)
  }

  /** `rail` collapses the menu to icons only — the labels move into the tooltips. */
  const sidebarBody = (showCollapse: boolean, onCloseMobile?: () => void, rail = false) => (
    <>
      <div className={`flex items-center gap-3 py-3 mb-4 ${rail ? 'px-0 justify-center' : 'px-2'}`}>
        <div
          className="w-10 h-10 rounded-2xl grid place-items-center bg-white/15 backdrop-blur shrink-0"
          title={rail ? t('Quality Portal') : undefined}
        >
          <FlaskConical size={22} />
        </div>
        {!rail && (
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight">{t('Quality Portal')}</div>
            <div className="text-xs text-white/60">{t('QA · Upload reports')}</div>
          </div>
        )}
        {onCloseMobile && (
          <button className="md:hidden text-white/70 hover:text-white p-1" onClick={onCloseMobile} aria-label="Close menu">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex flex-col gap-1.5">
        <button
          className={`nav-item ${rail ? 'rail' : ''} ${view === 'dashboard' ? 'active' : ''}`}
          onClick={() => goto('dashboard')}
          title={rail ? t('Dashboard') : undefined}
          aria-label={rail ? t('Dashboard') : undefined}
        >
          <LayoutDashboard size={18} />
          {!rail && <span className="flex-1 text-left">{t('Dashboard')}</span>}
        </button>
        <div className="my-1.5 border-t border-white/10" />
        {QA_MODULES.map((m) => (
          <button
            key={m.key}
            className={`nav-item ${rail ? 'rail' : ''} ${view === m.key ? 'active' : ''}`}
            onClick={() => goto(m.key)}
            title={rail ? t(m.label) : undefined}
            aria-label={rail ? t(m.label) : undefined}
          >
            <m.Icon size={18} />
            {!rail && <span className="flex-1 text-left">{t(m.label)}</span>}
          </button>
        ))}
        <div className="my-1.5 border-t border-white/10" />
        <button
          className={`nav-item ${rail ? 'rail' : ''}`}
          onClick={() => {
            setSavedNote('')
            setShowImport(true)
            setNavOpen(false)
          }}
          title={rail ? t('Upload Excel') : undefined}
          aria-label={rail ? t('Upload Excel') : undefined}
        >
          <UploadCloud size={18} />
          {!rail && <span className="flex-1 text-left">{t('Upload Excel')}</span>}
        </button>
        <button
          className={`nav-item ${rail ? 'rail' : ''} ${view === 'history' ? 'active' : ''}`}
          onClick={() => goto('history')}
          title={rail ? t('Upload History') : undefined}
          aria-label={rail ? t('Upload History') : undefined}
        >
          <History size={18} />
          {!rail && <span className="flex-1 text-left">{t('Upload History')}</span>}
        </button>
      </nav>
      {savedNote && !rail && (
        <div className="mt-3 flex items-start gap-2 text-[12px] font-semibold text-emerald-100 bg-emerald-500/20 border border-emerald-300/30 rounded-xl px-3 py-2">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> {savedNote}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1.5 pt-4">
        <button
          className={`nav-item ${rail ? 'rail' : ''} ${view === 'settings' ? 'active' : ''}`}
          onClick={() => goto('settings')}
          title={rail ? t('Settings') : undefined}
          aria-label={rail ? t('Settings') : undefined}
        >
          <SettingsIcon size={18} />
          {!rail && <span className="flex-1 text-left">{t('Settings')}</span>}
        </button>
        {showCollapse && (
          <button
            className={`nav-item ${rail ? 'rail' : ''}`}
            onClick={() => setCollapsed((c) => !c)}
            title={rail ? t('Show menu') : t('Hide menu')}
            aria-label={rail ? 'Show menu' : 'Hide menu'}
          >
            {rail ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!rail && <span className="flex-1 text-left">{t('Hide menu')}</span>}
          </button>
        )}
        {!rail && <div className="text-[11px] text-white/40 px-3 pt-2">v1.0 · Bento UI</div>}
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`sidebar-grad hidden md:flex md:flex-col shrink-0 text-white sticky top-0 self-start h-screen overflow-y-auto overflow-x-hidden scroll-area transition-[width] duration-200 ease-out ${
          collapsed ? 'w-[76px] px-2 py-4' : 'w-64 p-4'
        }`}
      >
        {sidebarBody(true, undefined, collapsed)}
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => setNavOpen(false)} />
          <aside className="sidebar-grad absolute left-0 top-0 bottom-0 w-72 max-w-[82%] p-4 text-white flex flex-col rise-x overflow-y-auto scroll-area shadow-2xl">
            {sidebarBody(false, () => setNavOpen(false))}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        {view === 'dashboard' ? (
          <QaDashboard onMenu={onDashMenu} onUpload={() => setShowImport(true)} dataVersion={dataVersion} />
        ) : (
          <>
            {/* Top bar */}
            <header className="sticky top-0 z-20 bg-[var(--page)]/90 backdrop-blur border-b border-[var(--hairline)]">
              <div className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2.5 md:py-3.5">
                <button
                  className="md:hidden shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] text-slate-700"
                  onClick={() => setNavOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg md:text-xl font-extrabold text-slate-800 leading-tight truncate">
                    {activeModule ? t(activeModule.label) : ''}
                    {view === 'history' && t('Upload History')}
                    {view === 'settings' && t('Settings')}
                    {view === 'aboutapp' && t('About Application')}
                  </h1>
                  <div className="text-[11px] md:text-xs text-slate-500 truncate">
                    Signed in as {user.fullName || user.username} · QA
                  </div>
                </div>
              </div>
            </header>

            <div className="p-3 md:p-5 flex flex-col gap-4 md:gap-5 scroll-area">
              {activeModule && <QaPlaceholder title={activeModule.label} Icon={activeModule.Icon} />}

              {view === 'history' && (
                <QaUploadHistory
                  onUpload={() => setShowImport(true)}
                  onCleared={() => {
                    setDataVersion((v) => v + 1)
                    setSavedNote('')
                  }}
                />
              )}

              {view === 'settings' && (
                <SettingsView
                  themePref={themePref}
                  onThemePref={changeTheme}
                  notifEnabled={notifEnabled}
                  onNotifEnabled={changeNotif}
                  lang={lang}
                  onLang={changeLang}
                  deviceId={clientId()}
                  account={user}
                  onAccountUpdate={onUserUpdate}
                  onLogout={onLogout}
                  isAdmin={false}
                  onOpenHistory={() => {}}
                  onOpenAbout={() => setView('aboutapp')}
                />
              )}

              {view === 'aboutapp' && <AboutApplicationPage onBack={() => setView('settings')} />}
            </div>
          </>
        )}
      </main>

      {showImport && (
        <QaImportModal
          onClose={() => setShowImport(false)}
          onSaved={(raw) => {
            setDataVersion((v) => v + 1)
            setShowImport(false)
            setView('dashboard')
            setSavedNote(`Goods-return data updated — ${raw.skf.length} return rows, ${raw.obs.length} observation rows.`)
          }}
        />
      )}
    </div>
  )
}
