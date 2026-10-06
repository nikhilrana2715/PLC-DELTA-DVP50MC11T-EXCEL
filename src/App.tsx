import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Filter,
  X,
  BarChart3,
  Gauge,
  Table2,
  Timer,
  Info,
  RotateCcw,
  Download,
  Save,
  UploadCloud,
  CalendarClock,
  RefreshCw,
  Lock,
  CalendarRange,
  Boxes,
  TriangleAlert,
  Trash2,
  Eye,
  EyeOff,
  ChevronLeft,
  LayoutDashboard,
  Route,
  Scale,
  Hammer,
  ShoppingCart,
} from 'lucide-react'
import { Sidebar, menuFor, type View } from './components/Sidebar'
import { useCan } from './lib/access'
import {
  buildPlaylist,
  getLoopEnabled,
  getLoopSeconds,
  sectionsFor,
  setLoopEnabled,
  setLoopSeconds,
} from './lib/loop'
import { LoopTimer } from './components/LoopBar'
import { KpiTrendView } from './components/KpiTrendView'
import { MonthRangePicker, MonthYearSelect, monthShort } from './components/MonthRangePicker'
import { MobileNav } from './components/MobileNav'
import { HScrollButtons } from './components/HScrollButtons'
import { KpiGrid } from './components/KpiGrid'
import { KpiPage, type KpiMonthlyBoard } from './components/KpiPage'
import { PriorityAlerts } from './components/PriorityAlerts'
import { MachineTable, type EditableField } from './components/MachineTable'
import { ImportModal } from './components/ImportModal'
import { SelectMenu } from './components/SelectMenu'
import { SaveMeetingModal } from './components/SaveMeetingModal'
import { PlanAchievementChart } from './components/charts/PlanAchievementChart'
import { EfficiencyChart } from './components/charts/EfficiencyChart'
import { DowntimeCategoryChart } from './components/charts/DowntimeCategoryChart'
import { categoryLabel, downtimeColor } from './lib/downtime'
import { parseWorkbook } from './lib/parseExcel'
import {
  computeKpis,
  criticalMachines,
  downtimeDetailed,
  groupRank,
  groupSequenceFor,
  ppm,
  ppmColor,
  prioritise,
  remarkSummary,
  sortBySequence,
} from './lib/aggregate'
import {
  filterByShift,
  makeImport,
  importShifts,
  effectiveShift,
  shiftLabel,
  shiftNum,
  roundRow,
  type ImportedFile,
  type ShiftOverride,
  type ShiftSel,
} from './lib/dataset'
import {
  fetchMeetings,
  saveMeeting as persistMeeting,
  deleteMeeting as removeMeeting,
  cacheMeetings,
  type SavedMeeting,
} from './lib/history'
import {
  fetchUploads,
  saveUpload as persistUpload,
  deleteUpload as removeUpload,
  cacheUploads,
  type UploadRecord,
} from './lib/uploads'
import { UploadDetailModal } from './components/UploadDetailModal'
import { fetchNotes, saveNote as persistNote, deleteNote as removeNote, type Note, type NoteFile, type Priority } from './lib/notes'
import {
  fetchCpk,
  saveCpk as persistCpk,
  deleteCpk as removeCpk,
  cpkSummary,
  lowestCpk,
  cpkColor,
  CPK_TARGET,
  expandCpkEntries,
  cpkQualityAlerts,
  sortExpanded,
  type CpkEntry,
  type CpkInput,
  type CpkDayActual,
  type ExpandedCpk,
} from './lib/cpk'
import { efficiencyColor } from './lib/palette'
import { reportingIssues, machineIssueAreas, areaRank, AREA_META, type IssueArea } from './lib/reporting'
import { KpiBreakdownModal, accentFor, type BreakdownData } from './components/KpiBreakdownModal'
import { MachineDetailModal } from './components/MachineDetailModal'
import { MachineCompareModal, type CompareDay } from './components/MachineCompareModal'
import {
  fetchCumulative,
  saveCumulativeMonth as persistCumulativeMonth,
  saveDailyEntry as persistDailyEntry,
  deleteCumulative as removeCumulative,
  cumulativeForMonth,
  groupTotals,
  backlogOf,
  monthsIn,
  monthOf,
  type CumulativeEntry,
  type GroupTotal,
} from './lib/cumulative'
import { subscribeRealtime, postActivity, unlockAudio, clientId, type Activity } from './lib/realtime'
import { fetchSettings, saveSettings, readLocalSettings, settingsOf, type AppSettings } from './lib/settings'
import { setLang as setI18nLang, useT } from './lib/i18n'
import {
  parseAssemblyWorkbook,
  fetchAssembly,
  saveAssembly,
  deleteAssembly,
  availableAssemblyDates,
  combineAssemblyReports,
  type AssemblyRecord,
  type AssemblyReport,
} from './lib/assembly'
import {
  parseMonthlyPlanWorkbook,
  shiftPlanToMonth,
  loadMonthlyPlans,
  saveMonthlyPlan,
  deleteMonthlyPlan,
  type MonthActuals,
  type MonthlyPlan,
  type MonthlyPlanRecord,
} from './lib/monthlyPlan'
import { MonthlyPlanningView } from './components/MonthlyPlanningView'
import { MonthlyReportView } from './components/MonthlyReportView'
import { PlanVsAchUploadModal, UploadChoiceModal } from './components/UploadChoiceModal'
import {
  loadPlanVsAch,
  parsePlanVsAchWorkbook,
  savePlanVsAch,
  deletePlanVsAch,
  type PlanVsAchRecord,
} from './lib/planVsAch'
import { RouteCardView } from './components/RouteCardView'
import { RouteCardUploadModal } from './components/RouteCardUploadModal'
import { MaintenanceReportView } from './components/MaintenanceReportView'
import { MaintenanceReportUploadModal } from './components/MaintenanceReportUploadModal'
import {
  loadMaintenanceReports,
  saveMaintenanceReport,
  deleteMaintenanceReport,
  parseMaintenanceWorkbook,
  type MaintenanceReportRecord,
} from './lib/maintenanceReport'
import {
  loadToolingReports,
  saveToolingReport,
  deleteToolingReport,
  parseToolingWorkbook,
  type ToolingReportRecord,
} from './lib/toolingReport'
import {
  loadPurchaseReports,
  savePurchaseReport,
  deletePurchaseReport,
  parsePurchaseWorkbook,
  type PurchaseReportRecord,
} from './lib/purchaseReport'
import {
  parseRouteCardWorkbook,
  loadRouteCards,
  saveRouteCard,
  deleteRouteCard,
  routeMonthLabel,
  routeCardDue,
  DEADLINE_DAYS,
  DUE_AFTER_DAYS,
  type RouteCard,
  type RouteCardRecord,
  type OpenRouteRow,
  type RouteDueSummary,
} from './lib/routeCard'
import { ActivityHub, type ActivityTab } from './components/ActivityHub'
import { MonthlyPlanUploadModal } from './components/MonthlyPlanUploadModal'
import { AssemblyDashboard } from './components/AssemblyDashboard'
import { AssemblyUploadModal } from './components/AssemblyUploadModal'
import type { AuthUser } from './lib/auth'
import {
  getThemePref,
  setThemePref,
  applyTheme,
  getNotifEnabled,
  setNotifEnabled as persistNotif,
  getLangPref,
  type ThemePref,
  type LangPref,
} from './lib/prefs'
import { NotesView } from './components/NotesView'
import { AddNoteModal } from './components/AddNoteModal'
import { CpkView } from './components/CpkView'
import { CumulativeView } from './components/CumulativeView'
import { NotifBell } from './components/notify/NotifBell'
import { NotificationCentre } from './components/notify/NotificationCentre'
import { useNotificationRuntime, useNotifications } from './lib/notify/useNotifications'
import { notify as raiseNotif } from './lib/notify/local'
import type { AppNotif, CategoryId as NotifCategoryId, NotifAction, Priority as NotifPriority } from './lib/notify/types'
import { SettingsView } from './components/SettingsView'
import { UserHistoryPage } from './components/UserHistoryPanel'
import { BackupView } from './components/BackupView'
import { ShiftSplit } from './components/ShiftSplit'
import { DateRangePicker, type DateRange } from './components/DateRangePicker'
import { MachineRangeModal } from './components/MachineRangeModal'
import { unlockAlarm } from './lib/alarm'
import { type MachineRow, type ParsedReport } from './types'
import { AboutApplicationPage } from './components/AboutApplicationPage'
import {
  dashboardTitle,
  efficiencyTarget,
  hasMixedPlanHours,
  hasQualityRow,
  hasRunningPlan,
  hasShifts,
  oneUploadPerDay,
  planHours,
  planHoursFor,
  planHoursNote,
  planQtyLabel,
  UNIT_LABEL,
  useUnit,
  withTarget,
} from './lib/unit'
import { loadImports as loadPdImports, openImportModal, useImports } from './lib/pdImport'
import type { PdRow } from './lib/pdReport'
import { openImportModal as openProdImportModal } from './lib/prodImport'
import { ProdKpiPage } from './components/ProdKpiPage'


const NUMERIC_FIELDS: EditableField[] = [
  'cycleTime',
  'planQty',
  'runningPlan',
  'achQty',
  'backlog',
  'efficiency',
  'rework',
  'rejection',
  'turningRejection',
]

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD
}

const ROLLOVER_HOUR = 7 // the production day flips at 7:00 AM
/** The current production day: before 7 AM still counts as the previous day. */
function activeProductionDate(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < ROLLOVER_HOUR) d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

// Dates already auto-saved to Meeting history (so the 7 AM rollover doesn't duplicate).
const AUTOSAVE_KEY = 'mm.autosaved.v1'
function autosavedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '[]') as string[])
  } catch {
    return new Set()
  }
}
function markAutosaved(date: string) {
  try {
    const s = autosavedSet()
    s.add(date)
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  right,
}: {
  title: string
  subtitle?: string
  icon: React.ReactNode
  children: React.ReactNode
  right?: React.ReactNode
}) {
  const tr = useT()
  return (
    <div className="bento rise min-w-0">
      <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] flex-wrap">
        <div className="w-9 h-9 rounded-xl grid place-items-center bg-indigo-50 text-indigo-600 shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-[140px]">
          <div className="font-bold text-slate-800">{tr(title)}</div>
          {subtitle && <div className="text-xs text-slate-500">{tr(subtitle)}</div>}
        </div>
        {right && <div className="w-full md:w-auto">{right}</div>}
      </div>
      <div className="p-3 md:p-4">{children}</div>
    </div>
  )
}

/**
 * How a server "activity" becomes a notification: which category it files under, how loud
 * it is, and where clicking it goes. Keeping the mapping in one table means adding a new
 * activity kind is a one-line change.
 */
const ACTIVITY_MAP: Record<string, { category: NotifCategoryId; priority?: NotifPriority; title: string; href?: string }> = {
  import: { category: 'production', priority: 'normal', title: 'Excel imported', href: '#dashboard' },
  upload: { category: 'production', priority: 'normal', title: 'Report saved', href: '#history' },
  meeting: { category: 'production', priority: 'normal', title: 'Meeting saved', href: '#history' },
  note: { category: 'message', priority: 'high', title: 'New note', href: '#notes' },
  cpk: { category: 'quality', priority: 'high', title: 'Cp-Cpk updated', href: '#cpk' },
  cumulative: { category: 'production', priority: 'low', title: 'Cumulative updated', href: '#cumulative' },
  info: { category: 'system', priority: 'low', title: 'Update' },
}

export default function App({
  user,
  onUserUpdate,
  onLogout,
}: {
  user: AuthUser
  onUserUpdate: (u: AuthUser) => void
  onLogout: () => void
}) {
  // The dashboard shows one production day, derived from the shared uploads store.
  // Empty = auto (latest date). Not persisted, so a refresh returns to the latest date.
  const [dashboardDate, setDashboardDate] = useState('')
  // When set, the Dashboard shows a multi-day trend/analysis instead of one day.
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  // Independent date-range filter for the Notes page (header control next to refresh).
  const [notesRange, setNotesRange] = useState<DateRange | null>(null)
  // Ticks every minute so the dashboard rolls to the new production day at 7 AM.
  const [clock, setClock] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  // False until the shared uploads have been fetched — avoids flashing the empty state.
  const [uploadsLoaded, setUploadsLoaded] = useState(false)
  // Uploads wait here until the user clicks "Convert into Dashboard".
  const [pending, setPending] = useState<ImportedFile[]>([])
  const [uploadSaving, setUploadSaving] = useState(false)
  const [uploadSaveError, setUploadSaveError] = useState('')
  const [rows, setRows] = useState<MachineRow[]>([])
  const [navView, setView] = useState<View>(() => {
    const h = window.location.hash.replace('#', '') as View
    const valid: View[] = ['dashboard', 'monthlyreport', 'monthlyplan', 'routecard', 'maintenancereport', 'toolingreport', 'purchasereport', 'kpi', 'kpidash', 'priority', 'machines', 'efficiency', 'downtime', 'assembly', 'cpk', 'cumulative', 'notes', 'history', 'settings', 'aboutapp', 'userhistory', 'backup', 'notifications']
    return valid.includes(h) ? h : 'dashboard'
  })
  const unit = useUnit()
  /**
   * What this account may do in the workspace on screen.
   *
   * Only a courtesy — the server checks every write again — but it is what stops a
   * view-only user from being offered an Upload button that would come back refused.
   */
  const can = useCan()
  /** Unit 2 runs a single shift, so every shift control and split is hidden there. */
  const shiftsOn = hasShifts(unit)
  // Switching workspace can leave you standing on a page this unit does not have (U2/U3
  // have none at all). Step to that unit's first section instead of rendering a page the
  // menu no longer shows.
  useEffect(() => {
    const allowed = menuFor(unit)
    // monthlyplan, routecard and cpk are not menu entries of their own — they are the pages
    // behind the Monthly Report cards, and every workspace has them. Left out of this list a
    // page opens and is thrown straight back to the Dashboard, which is what clicking the
    // Cp-Cpk card did: the card routed correctly, the guard undid it in the same tick.
    const always: View[] = ['settings', 'aboutapp', 'userhistory', 'backup', 'notifications', 'notes', 'monthlyplan', 'routecard', 'maintenancereport', 'toolingreport', 'purchasereport', 'cpk', 'kpidash']
    if (allowed.includes(navView) || always.includes(navView)) return
    setView(allowed[0] ?? 'settings')
  }, [unit, navView])
  // In the Assembly workspace the Dashboard IS the assembly report, so "dashboard" renders
  // the assembly page there. The sidebar keeps highlighting Dashboard (navView); everything
  // below renders against the resolved view.
  const view: View = unit === 'ASS' && navView === 'dashboard' ? 'assembly' : navView
  const [group, setGroup] = useState<string>('ALL')
  /**
   * Months the KPI Dashboard covers. Deliberately NOT wired to the KPI page's own Date
   * range — that one narrows a table of days, this one chooses which months to compare.
   * Empty until the report is read, when it defaults to the last three months it holds.
   */
  const [kpiMonths, setKpiMonths] = useState<{ from: string; to: string } | null>(null)
  /** Cp-Cpk page filters: '' = every day, 'ALL' = every machine. */
  const [cpkDate, setCpkDate] = useState('')
  const [cpkMachineSel, setCpkMachineSel] = useState('ALL')

  /**
   * The month the KPI page reports on — null until the reader picks one, and then it is
   * theirs until they pick another. Separate from `kpiMonths`, which belongs to the KPI
   * Dashboard: one page reads a single month, the other compares several.
   */
  const [kpiMonth, setKpiMonth] = useState<string | null>(null)
  // ---- Loop: the dashboard as a slideshow for the meeting screen (per device) ----
  const [loopOn, setLoopOnState] = useState<boolean>(() => getLoopEnabled())
  const [loopSecs, setLoopSecsState] = useState<number>(() => getLoopSeconds())
  const [loopIndex, setLoopIndex] = useState(0)
  const [loopPaused, setLoopPaused] = useState(false)
  /** The filter the user had before the loop took the wheel, put back when it stops. */
  const groupBeforeLoop = useRef<string | null>(null)
  const groupRef = useRef(group)
  groupRef.current = group
  const setLoopOn = useCallback((on: boolean) => {
    setLoopEnabled(on)
    setLoopOnState(on)
    setLoopIndex(0)
    setLoopPaused(false)
  }, [])
  const setLoopSecsPref = useCallback((secs: number) => {
    setLoopSeconds(secs)
    setLoopSecsState(secs)
  }, [])
  const [shift, setShift] = useState<ShiftSel>('both')
  const [history, setHistory] = useState<SavedMeeting[]>([])
  const [showSave, setShowSave] = useState(false)
  const [showImport, setShowImport] = useState(() => window.location.hash === '#import')
  // ---- Preferences (theme, notifications, language) ----
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref())
  const [notifEnabled, setNotifEnabledState] = useState<boolean>(() => getNotifEnabled())
  const [lang, setLangState] = useState<LangPref>(() => getLangPref())
  // Cp-Cpk / Cumulative visibility. Stored server-side (shared across ALL devices via
  // SSE); the local cache only seeds the first paint before the server value arrives.
  const [appSettings, setAppSettings] = useState<AppSettings>(() => readLocalSettings())
  const cpkEnabled = appSettings.cpkEnabled
  const cumulativeEnabled = appSettings.cumulativeEnabled
  const toggleCpkEnabled = useCallback(() => {
    setAppSettings((p) => {
      const next = { ...p, cpkEnabled: !p.cpkEnabled }
      void saveSettings(next) // broadcasts to every device
      return next
    })
  }, [])
  const toggleCumulativeEnabled = useCallback(() => {
    setAppSettings((p) => {
      const next = { ...p, cumulativeEnabled: !p.cumulativeEnabled }
      void saveSettings(next)
      return next
    })
  }, [])
  const [navOpen, setNavOpen] = useState(() => window.location.hash === '#menu')
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

  // Keep a live clock so the dashboard flips to the new production day at 7 AM.
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Apply the theme and keep it in sync with the OS when set to "System".
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

  // ---- To-Do list + looping alarm scheduler (rings on any screen) ----

  // ---- Rights come from the signed-in account's role. Admins sign in on their own
  // page (#admin-login); a normal user can add/import but not edit or delete. ----
  const isAdmin = user.role === 'admin'
  /**
   * Who may remove things here.
   *
   * Admins always; otherwise whoever an admin has given "Update & Delete" in this
   * workspace. Deleting is the one action that cannot be undone from the screen, so it
   * stays the top rung of the ladder rather than travelling with ordinary editing.
   */
  const canEdit = isAdmin || can.canDelete

  // ---- Notes + Cp-Cpk + Cumulative + notifications ----
  const [notes, setNotes] = useState<Note[]>([])
  const [cpk, setCpk] = useState<CpkEntry[]>([])
  const [cumulative, setCumulative] = useState<CumulativeEntry[]>([])
  // ---- Assembly (separate Excel upload + dashboard) ----
  const [assembly, setAssembly] = useState<AssemblyRecord[]>([])
  const [assemblyDate, setAssemblyDate] = useState<string>('') // '' = latest saved
  const [assemblyBusy, setAssemblyBusy] = useState(false)
  const [showAssemblyUpload, setShowAssemblyUpload] = useState(false)
  const [assemblyPreview, setAssemblyPreview] = useState<AssemblyReport | null>(null) // uploaded, not yet saved
  const [assemblySavedNote, setAssemblySavedNote] = useState('')
  const [assemblyRange, setAssemblyRange] = useState<DateRange | null>(null) // combined multi-day view
  // ---- Monthly Planning (one Plan Confirmation sheet per month) ----
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlanRecord[]>([])
  const [monthlyPlanMonth, setMonthlyPlanMonth] = useState<string>('') // '' = latest saved
  const [monthlyPlanBusy, setMonthlyPlanBusy] = useState(false)
  const [showMonthlyPlanUpload, setShowMonthlyPlanUpload] = useState(false)
  const [monthlyPlanPreview, setMonthlyPlanPreview] = useState<MonthlyPlan | null>(null)
  const [monthlyPlanSavedNote, setMonthlyPlanSavedNote] = useState('')
  // ---- Route Card (one workbook per month, same shape of flow as the Monthly Plan) ----
  const [routeCards, setRouteCards] = useState<RouteCardRecord[]>([])
  /**
   * Route cards not yet closed — the dashboard card, and the list behind it.
   *
   * Kept as its own small state rather than derived from `routeCards`, because the dashboard
   * deliberately does not hold the workbooks. Keyed off today rather than the report date on
   * screen: a card left open in April is open this morning, whichever day is being read.
   */
  const [openRouteKpi, setOpenRoute] = useState<RouteDueSummary>({
    hasData: false,
    current: null,
    fallback: false,
    months: [],
  })
  const [routeCardMonth, setRouteCardMonth] = useState<string>('') // '' = latest saved
  const [routeCardBusy, setRouteCardBusy] = useState(false)
  const [showRouteCardUpload, setShowRouteCardUpload] = useState(false)
  const [routeCardPreview, setRouteCardPreview] = useState<RouteCard | null>(null)
  const [routeCardSavedNote, setRouteCardSavedNote] = useState('')
  // ---- Maintenance Report ----
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReportRecord[]>([])
  const [maintenanceDate, setMaintenanceDate] = useState<string>('')
  const [maintenanceBusy, setMaintenanceBusy] = useState(false)
  const [showMaintenanceUpload, setShowMaintenanceUpload] = useState(false)
  // ---- Tooling Report ----
  const [toolingReports, setToolingReports] = useState<ToolingReportRecord[]>([])
  const [toolingDate, setToolingDate] = useState<string>('')
  const [toolingBusy, setToolingBusy] = useState(false)
  const [showToolingUpload, setShowToolingUpload] = useState(false)
  // ---- Purchase Report ----
  const [purchaseReports, setPurchaseReports] = useState<PurchaseReportRecord[]>([])
  const [purchaseDate, setPurchaseDate] = useState<string>('')
  const [purchaseBusy, setPurchaseBusy] = useState(false)
  const [showPurchaseUpload, setShowPurchaseUpload] = useState(false)
  // ---- Daily Plan vs Achievement: the plant's own Day / Month running tally ----
  const [planVsAch, setPlanVsAch] = useState<PlanVsAchRecord[]>([])
  const [showUploadChoice, setShowUploadChoice] = useState(false)
  const [showPvaUpload, setShowPvaUpload] = useState(false)
  const [pvaDate, setPvaDate] = useState(() => todayISO())
  const [pvaBusy, setPvaBusy] = useState(false)
  const [pvaError, setPvaError] = useState('')
  const [pvaNote, setPvaNote] = useState('')
  const [showAddNote, setShowAddNote] = useState(false)
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)
  const [machineDetail, setMachineDetail] = useState<MachineRow | null>(null)
  // Repeating Issues opens BOTH days for one machine, not just the selected one.
  const [compareMc, setCompareMc] = useState<string | null>(null)
  /** Machine whose day-by-day breakdown is open (range mode only). */
  const [machineRange, setMachineRange] = useState<string | null>(null)
  // ---- Upload history ----
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [uploadDetail, setUploadDetail] = useState<UploadRecord | null>(null)
  const [historyTab, setHistoryTab] = useState<ActivityTab>('meetings')
  // ---- View navigation with hash + browser Back button support ----
  const go = useCallback((v: View) => {
    if ('#' + v !== window.location.hash) window.history.pushState(null, '', '#' + v)
    setView(v)
  }, [])

  const { markRead: markNotifRead } = useNotifications()

  /**
   * A notification (in-app card, or an OS popup's action button) was clicked.
   * `dismiss` only clears it; anything else marks it read and routes.
   */
  const handleNotifAction = useCallback(
    (n: AppNotif, action: NotifAction | { id: string }) => {
      markNotifRead(n.id)
      if (action.id === 'dismiss') return
      const href = ('href' in action && action.href) || n.href
      if (!href) return
      const target = href.replace(/^#/, '') as View
      if (target) go(target)
    },
    [go, markNotifRead],
  )

  // OS notifications route through the same handler when their action is clicked.
  useNotificationRuntime(
    useCallback(
      (_id: string | undefined, action: string, href?: string) => {
        if (action === 'dismiss' || !href) return
        go(href.replace(/^#/, '').replace(/^.*#/, '') as View)
      },
      [go],
    ),
  )

  // Overlays (drawer / modals) and views react to the hardware/browser Back button.
  const overlayRef = useRef({ any: false })
  overlayRef.current = {
    any:
      navOpen || showImport || showSave || showAddNote || breakdown !== null || machineDetail !== null || machineRange !== null || compareMc !== null || uploadDetail !== null,
  }
  useEffect(() => {
    const onPop = () => {
      if (overlayRef.current.any) {
        // Back dismisses whatever overlay is open instead of leaving the app.
        setNavOpen(false)
        setShowImport(false)
        setShowSave(false)
        setShowAddNote(false)
        setBreakdown(null)
        setMachineDetail(null)
        setUploadDetail(null)
        return
      }
      const h = window.location.hash.replace('#', '')
      const valid: View[] = ['dashboard', 'monthlyreport', 'monthlyplan', 'routecard', 'maintenancereport', 'toolingreport', 'purchasereport', 'kpi', 'kpidash', 'priority', 'machines', 'efficiency', 'downtime', 'assembly', 'cpk', 'cumulative', 'notes', 'history', 'settings', 'aboutapp', 'userhistory', 'backup', 'notifications']
      setView((valid.includes(h as View) ? (h as View) : 'dashboard'))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Push a history entry when an overlay opens so Back can pop it.
  const prevOverlayOpen = useRef(false)
  useEffect(() => {
    const open =
      navOpen || showImport || showSave || showAddNote || breakdown !== null || machineDetail !== null || machineRange !== null || compareMc !== null || uploadDetail !== null
    if (open && !prevOverlayOpen.current) window.history.pushState({ mmOverlay: true }, '')
    prevOverlayOpen.current = open
  }, [navOpen, showImport, showSave, showAddNote, breakdown, machineDetail, machineRange, compareMc, uploadDetail])

  // Dates that have data, newest first; the dashboard shows one of these.
  const availableDates = useMemo(
    () => Array.from(new Set(uploads.map((u) => u.uploadDate).filter(Boolean))).sort().reverse(),
    [uploads],
  )
  // The day currently on the dashboard: the user's pick (from the date shortcut) if set,
  // else the CURRENT production day (flips at 7 AM). So each morning the dashboard starts
  // fresh/empty until that day's Excel is imported; yesterday is browsable via the chips.
  const activeDate = activeProductionDate(new Date(clock))
  const effectiveDate = dashboardDate || activeDate
  // All uploaded reports for that day (Shift 1 + Shift 2 combine).
  const dayUploads = useMemo(
    () => uploads.filter((u) => u.uploadDate === effectiveDate),
    [uploads, effectiveDate],
  )

  const meta = useMemo(() => {
    const source = dateRange
      ? uploads.filter((u) => u.uploadDate >= dateRange.from && u.uploadDate <= dateRange.to)
      : dayUploads
    const groups: string[] = []
    const reasons: string[] = []
    for (const u of source) {
      for (const g of u.groups) if (!groups.includes(g)) groups.push(g)
      for (const rn of u.downtimeReasons) if (!reasons.includes(rn)) reasons.push(rn)
    }
    const fileName = dateRange
      ? `${new Date(dateRange.from + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(
          dateRange.to + 'T00:00:00',
        ).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${source.length} file(s)`
      : dayUploads.length === 0
        ? ''
        : dayUploads.length === 1
          ? dayUploads[0].fileName
          : `${dayUploads.length} files`
    groups.sort((a, b) => groupRank(a, unit) - groupRank(b, unit))
    return { groups, reasons, fileName }
  }, [dayUploads, dateRange, uploads])

  // Rebuild the editable working rows whenever the viewed day (or its uploads) changes.
  useEffect(() => {
    let id = 0
    const out = dayUploads.flatMap((u) => u.rows).map((r) => roundRow({ ...r, id: id++ }))
    setRows(prioritise(out))
  }, [dayUploads])

  // 7 AM daily rollover: once a production day has passed, auto-save its report to
  // Meeting history (a stable id keeps it a single entry). The dashboard itself
  // "clears" automatically because effectiveDate moves to the new (empty) day.
  useEffect(() => {
    if (!uploadsLoaded) return
    const saved = autosavedSet()
    for (const date of availableDates) {
      if (date >= activeDate || saved.has(date)) continue
      const dayUps = uploads.filter((u) => u.uploadDate === date)
      if (!dayUps.length) continue
      let id = 0
      const dayRows = prioritise(dayUps.flatMap((u) => u.rows).map((r) => roundRow({ ...r, id: id++ })))
      const k = computeKpis(dayRows)
      const groups: string[] = []
      const reasons: string[] = []
      for (const u of dayUps) {
        for (const g of u.groups) if (!groups.includes(g)) groups.push(g)
        for (const rn of u.downtimeReasons) if (!reasons.includes(rn)) reasons.push(rn)
      }
      markAutosaved(date)
      ;(async () => {
        const savedMeeting = await persistMeeting({
          id: `auto-${date}`,
          meetingDate: date,
          shift: 'Shift 1 & 2',
          fileName: dayUps.length === 1 ? dayUps[0].fileName : `${dayUps.length} files`,
          note: 'Auto-saved at 7 AM day rollover',
          groups,
          downtimeReasons: reasons,
          rows: dayRows,
          summary: {
            machines: k.machines, running: k.running, planned: k.planned, achievement: k.achievement,
            backlog: k.backlog, avgEfficiency: k.avgEfficiency, overallEfficiency: k.overallEfficiency,
            criticalCount: k.criticalCount,
          },
        })
        setHistory((h) => [savedMeeting, ...h.filter((x) => x.id !== savedMeeting.id)])
      })()
    }
  }, [availableDates, activeDate, uploads, uploadsLoaded])

  // Load meetings + notes, stay in sync live (SSE) and receive activity notifications.
  useEffect(() => {
    let alive = true
    fetchMeetings().then((list) => alive && setHistory(list))
    fetchNotes().then((list) => alive && setNotes(list))
    fetchCpk().then((list) => alive && setCpk(list))
    fetchCumulative().then((list) => alive && setCumulative(list))
    fetchUploads().then((list) => {
      if (!alive) return
      setUploads(list)
      setUploadsLoaded(true)
    })
    fetchSettings().then((s) => alive && setAppSettings(s))
    // Assembly records are pinned to the ASS workspace; no other unit displays them, so no
    // other unit needs to pull them.
    if (unit === 'ASS') fetchAssembly().then((list) => alive && setAssembly(list))
    loadMonthlyPlans().then((list) => alive && setMonthlyPlans(list))
    loadPlanVsAch().then((list) => alive && setPlanVsAch(list))

    const unsub = subscribeRealtime({
      onMeetings: (list) => {
        if (!alive) return
        cacheMeetings(list)
        setHistory(list)
      },
      onNotes: (list) => {
        if (alive) setNotes(list)
      },
      onCpk: (list) => {
        if (alive) setCpk(list)
      },
      onCumulative: (list) => {
        if (alive) setCumulative(list)
      },
      onUploads: (list) => {
        if (!alive) return
        cacheUploads(list)
        setUploads(list)
        setUploadsLoaded(true)
      },
      onSettings: (list) => {
        if (alive) setAppSettings(settingsOf(list))
      },
      onAssembly: (list) => {
        if (alive) setAssembly([...list].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)))
      },
      onActivity: (a: Activity) => {
        if (!alive) return
        // Everything that happens on any device flows into the notification centre.
        // ACTIVITY_MAP turns the server's coarse activity kind into a category the
        // centre can filter and mute per type.
        raiseNotif({
          id: a.id ? `act_${a.id}` : undefined,
          category: ACTIVITY_MAP[a.kind]?.category ?? 'activity',
          priority: ACTIVITY_MAP[a.kind]?.priority,
          title: ACTIVITY_MAP[a.kind]?.title ?? 'Update',
          subtitle: a.title,
          at: a.at,
          source: a.by ? `by ${a.by}` : undefined,
          href: ACTIVITY_MAP[a.kind]?.href,
          actions: ACTIVITY_MAP[a.kind]?.href ? [{ id: 'open', label: 'Open', href: ACTIVITY_MAP[a.kind]!.href, tone: 'primary' }] : undefined,
        })
      },
    })

    // Browsers block audio/vibration until a user gesture — unlock on any interaction.
    const unlock = () => {
      unlockAudio()
      unlockAlarm() // arm the To-Do alarm's audio context too
    }
    for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click'] as const) {
      window.addEventListener(ev, unlock)
    }

    return () => {
      alive = false
      unsub()
      for (const ev of ['pointerdown', 'touchstart', 'keydown', 'click'] as const) {
        window.removeEventListener(ev, unlock)
      }
    }
  }, [])

  // Manual refresh (top-bar icon) — a real page reload so any stale UI after a
  // shift/filter change is reliably cleared (keeps the current view via the hash).
  const refreshData = useCallback(() => {
    setRefreshing(true) // brief spin so the tap registers, then reload
    window.setTimeout(() => window.location.reload(), 200)
  }, [])

  // ---- Imports ----
  // Uploads are staged as pending until "Convert into Dashboard" is clicked.
  const stageImport = useCallback((parsed: ParsedReport, shift: ShiftOverride = 'auto') => {
    /*
     * A file that already holds BOTH shifts is never tagged as one of them.
     *
     * Unit 3's sheet puts Shift 1 in the top block and Shift 2 below it, in a single upload.
     * Dropping that on the "Shift 1" zone would otherwise stamp every row as Shift 1 and the
     * second shift would vanish into the first. The rows say what they are, so let them.
     */
    const bothShifts = new Set(parsed.rows.map((r) => shiftNum(r.shift))).size > 1
    setPending((prev) => [...prev, makeImport(parsed, bothShifts ? 'auto' : shift)])
  }, [])
  // Convenience: stage the bundled sample so the empty state can be demoed (still needs Convert).
  const loadSample = useCallback(() => {
    ;(async () => {
      try {
        const res = await fetch('./sample.xlsx')
        if (!res.ok) return
        const buf = await res.arrayBuffer()
        const parsed = parseWorkbook(buf, 'Sample Report.xlsx')
        if (parsed.rows.length) {
          stageImport(parsed, 'auto')
          setShowImport(true)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [stageImport])
  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((i) => i.id !== id))
  }, [])
  const setPendingShift = useCallback((id: string, s: ShiftOverride) => {
    setPending((prev) => prev.map((i) => (i.id === id ? { ...i, shiftOverride: s } : i)))
  }, [])
  // Save the staged files as the report for one production day (reportDate), then show
  // that day. Each (date, shift) is one record (stable id) so re-uploading a shift
  // overwrites it, the other shift stays, and every other day is preserved.
  const convertToDashboard = useCallback(
    async (reportDate: string) => {
      if (pending.length === 0 || uploadSaving) return
      setUploadSaving(true)
      setUploadSaveError('')
      try {
        const savedUploads = await Promise.all(pending.map(async (imp) => {
          const shifts = importShifts(imp)
          const shift = shifts.length === 2 ? 'Shift 1 & 2' : shifts[0] === 2 ? 'Shift 2' : 'Shift 1'
          const rows = imp.report.rows.map((r) => roundRow({ ...r, shift: effectiveShift(imp, r.shift) }))
          return persistUpload({
            id: `up-${reportDate}-${shift}`, // stable: same day+shift overwrites
            uploadDate: reportDate,
            shift,
            fileName: imp.fileName,
            machines: imp.report.rows.length,
            groups: imp.report.groups,
            downtimeReasons: imp.report.downtimeReasons,
            rows,
          })
        }))
        setUploads((prev) => {
          const savedIds = new Set(savedUploads.map((upload) => upload.id))
          return [...savedUploads, ...prev.filter((upload) => !savedIds.has(upload.id))]
        })
        const machines = pending.reduce((sum, item) => sum + item.report.rows.length, 0)
        postActivity('import', `Report saved — ${reportDate} · ${pending.length} file(s), ${machines} machines`)
        setDashboardDate(reportDate)
        setPending([])
        setShowImport(false)
        go('dashboard')
      } catch (error) {
        setUploadSaveError(String((error as Error)?.message || error))
      } finally {
        setUploadSaving(false)
      }
    },
    [pending, go, uploadSaving],
  )
  // Delete a whole day's reports (both shifts) from Upload History.
  const deleteDateHandler = useCallback((date: string) => {
    setUploads((prev) => {
      prev.filter((u) => u.uploadDate === date).forEach((u) => void removeUpload(u.id))
      return prev.filter((u) => u.uploadDate !== date)
    })
    setUploadDetail((d) => (d && d.uploadDate === date ? null : d))
    if (dashboardDate === date) setDashboardDate('')
  }, [dashboardDate])

  // ---- Editing rows ----
  const updateRow = useCallback((id: number, field: EditableField, raw: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const next: MachineRow = { ...r }
        if (NUMERIC_FIELDS.includes(field)) {
          const t = raw.trim()
          if (t === '') {
            ;(next as unknown as Record<string, unknown>)[field] =
              field === 'cycleTime' || field === 'efficiency' ? null : 0
          } else {
            const n = Number(t.replace(/,/g, ''))
            if (!Number.isFinite(n)) return r
            ;(next as unknown as Record<string, unknown>)[field] = n
          }
        } else {
          ;(next as unknown as Record<string, unknown>)[field] = raw
        }
        if (field === 'runningPlan' || field === 'achQty') {
          const run = next.runningPlan || 0
          const ach = next.achQty || 0
          next.backlog = Math.max(0, run - ach)
          next.efficiency = run > 0 ? Math.round((ach / run) * 100) : null
        }
        next.inPlan = next.planQty > 0 || next.runningPlan > 0 || next.achQty > 0
        next.isCritical = next.efficiency !== null && next.efficiency < efficiencyTarget()
        return next
      }),
    )
  }, [])

  const deleteRow = useCallback((id: number) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const resetRows = useCallback(() => {
    let id = 0
    setRows(prioritise(dayUploads.flatMap((u) => u.rows).map((r) => roundRow({ ...r, id: id++ }))))
  }, [dayUploads])
  const exportCsv = useCallback(() => {
    const headers = [
      'M/C', 'Item Code', 'Operator', 'Cycle Time', 'Plan Qty',
      ...(hasRunningPlan(unit) ? ['Running Plan'] : []),
      'Ach Qty', 'Backlog', 'Efficiency', 'Rework', 'Rejection', 'Turning Rejection',
      'Shift', 'Status', 'Remark', 'Setter',
    ]
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [headers.join(',')]
    for (const r of rows) {
      const status =
        r.efficiency === null ? 'No plan'
          : r.efficiency < efficiencyTarget() ? `Below ${efficiencyTarget()}%`
            : r.efficiency < 90 ? 'Watch' : 'On target'
      lines.push([
        q(r.mc), q(r.itemCode), q(r.operator), r.cycleTime ?? '', r.planQty,
        ...(hasRunningPlan(unit) ? [r.runningPlan] : []),
        r.achQty, r.backlog, r.efficiency ?? '', r.rework, r.rejection, r.turningRejection,
        q(r.shift), q(status), q(r.remark), q(r.setter),
      ].join(','))
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'morning-meeting-edited.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [rows])

  // ---- Meeting history (shared server, live across devices) ----
  const doSaveMeeting = useCallback(
    (date: string, note: string) => {
      const k = computeKpis(rows)
      setShowSave(false)
      go('history')
      ;(async () => {
        const saved = await persistMeeting({
          meetingDate: date,
          shift: shiftLabel(shift),
          fileName: meta.fileName || 'report.xlsx',
          note,
          groups: meta.groups,
          downtimeReasons: meta.reasons,
          rows,
          summary: {
            machines: k.machines, running: k.running, planned: k.planned,
            achievement: k.achievement, backlog: k.backlog, avgEfficiency: k.avgEfficiency,
            overallEfficiency: k.overallEfficiency, criticalCount: k.criticalCount,
          },
        })
        // Optimistic local update; the SSE stream also refreshes every device.
        setHistory((h) => [saved, ...h.filter((x) => x.id !== saved.id)])
      })()
    },
    [rows, shift, meta, go],
  )

  const openMeeting = useCallback(
    (m: SavedMeeting) => {
      let id = 0
      setRows(prioritise(m.rows.map((r) => roundRow({ ...r, id: id++ }))))
      setShift('both')
      setGroup('ALL')
      go('dashboard')
    },
    [go],
  )
  // Open a specific day's report on the dashboard (from Upload History).
  const openDateOnDashboard = useCallback(
    (date: string) => {
      setDashboardDate(date)
      setShift('both')
      setGroup('ALL')
      setUploadDetail(null)
      go('dashboard')
    },
    [go],
  )

  const deleteMeeting = useCallback((id: string) => {
    setHistory((h) => h.filter((m) => m.id !== id)) // optimistic
    void removeMeeting(id)
  }, [])

  // ---- Notes ----
  const doSaveNote = useCallback(
    (payload: { date: string; name: string; issue: string; priority: Priority; images?: string[]; files?: NoteFile[] }) => {
      setShowAddNote(false)
      ;(async () => {
        const saved = await persistNote(payload)
        setNotes((prev) => [saved, ...prev.filter((n) => n.id !== saved.id)])
      })()
    },
    [],
  )
  const deleteNoteHandler = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id)) // optimistic
    void removeNote(id)
  }, [])

  // ---- Cp-Cpk ----
  const doSaveCpk = useCallback(async (payload: CpkInput) => {
    const saved = await persistCpk(payload)
    setCpk((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)])
  }, [])
  const deleteCpkHandler = useCallback((id: string) => {
    setCpk((prev) => prev.filter((c) => c.id !== id))
    void removeCpk(id)
  }, [])

  // ---- Cumulative (single editable record per month) ----
  const saveCumMonth = useCallback((month: string, groups: Record<string, GroupTotal>, days: number) => {
    ;(async () => {
      const saved = await persistCumulativeMonth(month, groups, days)
      setCumulative((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)])
    })()
  }, [])

  // Add the (edited) yesterday per-group totals into a month's cumulative.
  const doAddCumulative = useCallback(
    (month: string, yGroups: Record<string, GroupTotal>) => {
      setCumulative((prev) => {
        const monthRec = prev.find((e) => e.month === month && !e.date)
        const existing = monthRec?.groups ?? {}
        const merged: Record<string, GroupTotal> = {}
        for (const g of new Set([...Object.keys(existing), ...Object.keys(yGroups)])) {
          merged[g] = {
            plan: (existing[g]?.plan ?? 0) + (yGroups[g]?.plan ?? 0),
            ach: (existing[g]?.ach ?? 0) + (yGroups[g]?.ach ?? 0),
            // backlog accumulates on its own (from the Excel column), not plan − ach
            backlog: backlogOf(existing[g]) + backlogOf(yGroups[g]),
          }
        }
        const days = (monthRec?.days ?? 0) + 1
        saveCumMonth(month, merged, days)
        return prev
      })
    },
    [saveCumMonth],
  )

  // Save a single day's snapshot (recalled when that date is picked again).
  const saveDayEntry = useCallback((date: string, groups: Record<string, GroupTotal>) => {
    ;(async () => {
      const saved = await persistDailyEntry(date, groups)
      setCumulative((prev) => [saved, ...prev.filter((e) => e.id !== saved.id)])
    })()
  }, [])

  const resetCumulative = useCallback((month: string) => {
    setCumulative((prev) => prev.filter((e) => e.id !== `cum-${month}`))
    void removeCumulative(`cum-${month}`)
  }, [])

  // Editable-style rows for ANY date (not just the one on-screen) — used to build
  // the date-range view, which needs to look across many days at once.
  const rowsForDate = useCallback(
    (date: string): MachineRow[] => {
      const ups = uploads.filter((u) => u.uploadDate === date)
      let id = 1
      return prioritise(ups.flatMap((u) => u.rows).map((r) => roundRow({ ...r, id: id++ })))
    },
    [uploads],
  )

  // When a date range is active: every date's rows (already group + shift filtered)
  // are combined into ONE row per machine — Plan/Achievement/Backlog/Rework/Rejection/
  // Downtime summed, efficiency recomputed from the totals — so the normal Dashboard
  // (KPI cards, Priority Alerts, charts, Register) can render exactly as it does for a
  // single day, just fed the whole period's combined performance.
  const combinedRangeRows = useMemo(() => {
    if (!dateRange) return null
    const dates = availableDates.filter((d) => d >= dateRange.from && d <= dateRange.to)
    type Merged = MachineRow & { _lastDate: string }
    const merged = new Map<string, Merged>()
    for (const d of dates) {
      const raw = rowsForDate(d)
      const byGroup = group === 'ALL' ? raw : raw.filter((r) => r.group === group)
      const byShift = filterByShift(byGroup, shift)
      for (const r of byShift) {
        if (!r.mc) continue
        const cur = merged.get(r.mc)
        if (!cur) {
          merged.set(r.mc, { ...r, _lastDate: d })
          continue
        }
        cur.planQty += r.planQty
        cur.runningPlan += r.runningPlan
        cur.achQty += r.achQty
        cur.backlog += r.backlog
        cur.rework += r.rework
        cur.rejection += r.rejection
        cur.turningRejection += r.turningRejection
        cur.totalDowntime += r.totalDowntime
        for (const [reason, val] of Object.entries(r.downtime)) {
          cur.downtime[reason] = (cur.downtime[reason] ?? 0) + val
        }
        // Descriptive fields aren't summable — keep whichever day is most recent.
        if (d >= cur._lastDate) {
          cur.itemCode = r.itemCode || cur.itemCode
          cur.operator = r.operator || cur.operator
          cur.setter = r.setter || cur.setter
          cur.remark = r.remark || cur.remark
          cur.cycleTime = r.cycleTime ?? cur.cycleTime
          cur._lastDate = d
        }
      }
    }
    let id = 1
    const out: MachineRow[] = [...merged.values()].map(({ _lastDate: _unused, ...r }) => {
      // Unit 1 measures against the running plan; the Shell and Roller sheets carry none,
      // so they fall back to plan qty — the same denominator their own rows use.
      const effBase = r.runningPlan > 0 ? r.runningPlan : r.planQty
      const efficiency = effBase > 0 ? Math.round((r.achQty / effBase) * 100) : null
      return {
        ...r,
        id: id++,
        efficiency,
        isCritical: efficiency !== null && efficiency < efficiencyTarget(),
        inPlan: r.planQty > 0 || r.runningPlan > 0 || r.achQty > 0,
      }
    })
    return prioritise(out)
  }, [dateRange, availableDates, rowsForDate, group, shift])

  // ---- Derived ----
  const filteredRows = useMemo(() => {
    if (dateRange) return combinedRangeRows ?? [] // already group + shift filtered above
    const byGroup = group === 'ALL' ? rows : rows.filter((r) => r.group === group)
    return filterByShift(byGroup, shift)
  }, [rows, group, shift, dateRange, combinedRangeRows])

  const kpis = useMemo(() => computeKpis(filteredRows), [filteredRows])
  const critical = useMemo(() => criticalMachines(filteredRows), [filteredRows])
  const downtime = useMemo(() => downtimeDetailed(meta.reasons, filteredRows), [meta.reasons, filteredRows])
  const remarks = useMemo(() => remarkSummary(filteredRows.filter((r) => r.inPlan)), [filteredRows])
  const chartRows = useMemo(() => filteredRows.filter((r) => r.inPlan), [filteredRows])

  // ---- Shift 1 vs Shift 2 split (only when "Both" is selected and both have data) ----
  // Group filter is applied; then each shift's own priority / charts / downtime / rows.
  const groupRows = useMemo(
    () => (group === 'ALL' ? rows : rows.filter((r) => r.group === group)),
    [rows, group],
  )
  const s1Rows = useMemo(() => groupRows.filter((r) => shiftNum(r.shift) === 1), [groupRows])
  const s2Rows = useMemo(() => groupRows.filter((r) => shiftNum(r.shift) === 2), [groupRows])
  // A combined date-range row mixes multiple days' shifts into one total, so
  // splitting it back into "Shift 1 | Shift 2" columns wouldn't mean anything.
  const hasBoth = !dateRange && shift === 'both' && s1Rows.some((r) => r.inPlan) && s2Rows.some((r) => r.inPlan)
  const s1 = useMemo(
    () => ({
      critical: criticalMachines(s1Rows),
      chartRows: s1Rows.filter((r) => r.inPlan),
      downtime: downtimeDetailed(meta.reasons, s1Rows),
      remarks: remarkSummary(s1Rows.filter((r) => r.inPlan)),
      rows: s1Rows,
    }),
    [s1Rows, meta.reasons],
  )
  const s2 = useMemo(
    () => ({
      critical: criticalMachines(s2Rows),
      chartRows: s2Rows.filter((r) => r.inPlan),
      downtime: downtimeDetailed(meta.reasons, s2Rows),
      remarks: remarkSummary(s2Rows.filter((r) => r.inPlan)),
      rows: s2Rows,
    }),
    [s2Rows, meta.reasons],
  )

  // Cp-Cpk + Cumulative derived
  // The Add Cp-Cpk form's Machine → Item Code autofill must match whatever date is
  // picked IN THAT FORM, not whatever day the Dashboard happens to be showing —
  // otherwise recording a past day's Cpk silently borrows today's item code.
  const igMachinesForDate = useCallback(
    (date: string) => {
      const seen = new Set<string>()
      const out: { mc: string; itemCode: string; operator: string }[] = []
      for (const r of rowsForDate(date))
        if (r.group === 'IG' && r.mc && !seen.has(r.mc)) {
          seen.add(r.mc)
          out.push({ mc: r.mc, itemCode: r.itemCode, operator: r.operator })
        }
      return out
    },
    [rowsForDate],
  )
  const todayGroups = useMemo(() => groupTotals(rows), [rows])
  // Any date's own group totals, straight from whatever Excel was uploaded for it —
  // so the Cumulative page can prefill a past/future-picked date, not just "today".
  const groupsForDate = useCallback((date: string) => groupTotals(rowsForDate(date)), [rowsForDate])

  // ---- Assembly derived + upload/save ----
  const assemblyDates = useMemo(() => availableAssemblyDates(assembly), [assembly])
  const activeAssemblyDate = assemblyDate || assemblyDates[0] || ''
  const savedAssemblyReport = useMemo(
    () => assembly.find((r) => r.date === activeAssemblyDate) ?? null,
    [assembly, activeAssemblyDate],
  )
  // Combined multi-day report + per-date groups when a date range is active.
  const assemblyRangeRecords = useMemo(
    () => (assemblyRange ? assembly.filter((r) => r.date >= assemblyRange.from && r.date <= assemblyRange.to).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [assembly, assemblyRange],
  )
  const combinedAssemblyReport = useMemo(
    () => (assemblyRangeRecords.length ? combineAssemblyReports(assemblyRangeRecords) : null),
    [assemblyRangeRecords],
  )
  const assemblyDateGroups = useMemo(
    () => assemblyRangeRecords.map((r) => ({ date: r.date, report: r as AssemblyReport })),
    [assemblyRangeRecords],
  )
  // What the dashboard shows: unsaved preview → combined range → the saved single-day report.
  const shownAssemblyReport = assemblyPreview ?? (assemblyRange ? combinedAssemblyReport : savedAssemblyReport)

  // ---- Monthly Planning: which plan is on screen, and the month's recorded actuals ----
  const shownMonthlyPlan = useMemo<MonthlyPlan | null>(() => {
    if (monthlyPlanPreview) return monthlyPlanPreview
    if (monthlyPlanMonth) return monthlyPlans.find((p) => p.month === monthlyPlanMonth) ?? null
    return monthlyPlans[0] ?? null // most recently saved
  }, [monthlyPlanPreview, monthlyPlanMonth, monthlyPlans])

  /** Route cards hold whole workbooks — three megabytes of them, so they are fetched only
   *  where they are actually read: the page that prints them, the hub that counts them, and
   *  the dashboard, which now carries the "still open" card. The fetch is gzipped to about
   *  260 KB and lands after first paint, so the dashboard does not wait on it. */
  useEffect(() => {
    if (view !== 'routecard' && view !== 'monthlyreport' && view !== 'dashboard' && view !== 'history') return
    let alive = true
    loadRouteCards().then((list) => {
      if (!alive) return
      // The dashboard keeps the SUMMARY, not the workbooks. Holding 12,850 rows of sheet in
      // React state to show one number and a list of 182 costs about 35 MB of heap — which
      // is exactly the kind of weight that made this app slow before. The two pages that
      // actually print the sheets keep the real thing.
      if (view === 'dashboard') setOpenRoute(routeCardDue(list, todayISO()))
      else setRouteCards(list)
    })
    return () => {
      alive = false
    }
  }, [unit, view])

  useEffect(() => {
    if (view !== 'maintenancereport' && view !== 'monthlyreport' && view !== 'history') return
    let alive = true
    loadMaintenanceReports().then((list) => {
      if (alive) setMaintenanceReports(list)
    })
    return () => {
      alive = false
    }
  }, [unit, view])

  const uploadMaintenanceReport = async (file: File, date: string) => {
    setMaintenanceBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const report = parseMaintenanceWorkbook(buf, file.name, date)
      const rec = await saveMaintenanceReport(report)
      setMaintenanceReports((prev) => [rec, ...prev.filter((x) => x.id !== rec.id)])
      setMaintenanceDate('')
      setShowMaintenanceUpload(false)
    } catch (err: any) {
      alert(err?.message || 'Failed to read Maintenance Report Excel')
    } finally {
      setMaintenanceBusy(false)
    }
  }

  const handleDeleteMaintenanceReport = async (id: string) => {
    try {
      await deleteMaintenanceReport(id)
      setMaintenanceReports((prev) => prev.filter((x) => x.id !== id))
    } catch {
      alert('Failed to delete maintenance report')
    }
  }

  const shownMaintenanceReport = useMemo<MaintenanceReportRecord | null>(() => {
    if (maintenanceDate) {
      return (
        maintenanceReports.find((r) => r.date === maintenanceDate || r.month === maintenanceDate || r.id === `maint-${maintenanceDate}`) ??
        maintenanceReports[0] ??
        null
      )
    }
    return maintenanceReports[0] ?? null
  }, [maintenanceDate, maintenanceReports])

  useEffect(() => {
    if (view !== 'toolingreport' && view !== 'monthlyreport' && view !== 'history') return
    let alive = true
    loadToolingReports().then((list) => {
      if (alive) setToolingReports(list)
    })
    return () => {
      alive = false
    }
  }, [unit, view])

  const uploadToolingReport = async (file: File, date: string) => {
    setToolingBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const report = parseToolingWorkbook(buf, file.name, date)
      const rec = await saveToolingReport(report)
      setToolingReports((prev) => [rec, ...prev.filter((x) => x.id !== rec.id)])
      setToolingDate('')
      setShowToolingUpload(false)
    } catch (err: any) {
      alert(err?.message || 'Failed to read Tooling Report Excel')
    } finally {
      setToolingBusy(false)
    }
  }

  const handleDeleteToolingReport = async (id: string) => {
    try {
      await deleteToolingReport(id)
      setToolingReports((prev) => prev.filter((x) => x.id !== id))
    } catch {
      alert('Failed to delete tooling report')
    }
  }

  const shownToolingReport = useMemo<ToolingReportRecord | null>(() => {
    if (toolingDate) {
      return (
        toolingReports.find((r) => r.date === toolingDate || r.month === toolingDate || r.id === `tool-${toolingDate}`) ??
        toolingReports[0] ??
        null
      )
    }
    return toolingReports[0] ?? null
  }, [toolingDate, toolingReports])

  useEffect(() => {
    if (view !== 'purchasereport' && view !== 'monthlyreport' && view !== 'history') return
    let alive = true
    loadPurchaseReports().then((list) => {
      if (alive) setPurchaseReports(list)
    })
    return () => {
      alive = false
    }
  }, [unit, view])

  const uploadPurchaseReport = async (file: File, date: string) => {
    setPurchaseBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const report = parsePurchaseWorkbook(buf, file.name, date)
      const rec = await savePurchaseReport(report)
      setPurchaseReports((prev) => [rec, ...prev.filter((x) => x.id !== rec.id)])
      setPurchaseDate('')
      setShowPurchaseUpload(false)
    } catch (err: any) {
      alert(err?.message || 'Failed to read Purchase Report Excel')
    } finally {
      setPurchaseBusy(false)
    }
  }

  const handleDeletePurchaseReport = async (id: string) => {
    try {
      await deletePurchaseReport(id)
      setPurchaseReports((prev) => prev.filter((x) => x.id !== id))
    } catch {
      alert('Failed to delete purchase report')
    }
  }

  const shownPurchaseReport = useMemo<PurchaseReportRecord | null>(() => {
    if (purchaseDate) {
      return (
        purchaseReports.find((r) => r.date === purchaseDate || r.month === purchaseDate || r.id === `purch-${purchaseDate}`) ??
        purchaseReports[0] ??
        null
      )
    }
    return purchaseReports[0] ?? null
  }, [purchaseDate, purchaseReports])

  /** Keep the summary in step with the workbooks whenever they ARE in memory — so uploading
   *  a route card updates the dashboard card without a second fetch. */
  useEffect(() => {
    if (routeCards.length) setOpenRoute(routeCardDue(routeCards, todayISO()))
  }, [routeCards])

  /** The route card on screen: an unsaved preview wins, else the chosen month, else latest. */
  const shownRouteCard = useMemo<RouteCard | null>(() => {
    if (routeCardPreview) return routeCardPreview
    if (routeCardMonth) return routeCards.find((c) => c.month === routeCardMonth) ?? null
    return routeCards[0] ?? null // most recently saved
  }, [routeCardPreview, routeCardMonth, routeCards])

  /** Years that actually have a card, newest first — the year picker offers only these. */
  const routeCardYears = useMemo(
    () => [...new Set(routeCards.map((c) => c.month.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [routeCards],
  )


  /**
   * The Monthly Planning quantity for TODAY — for the dashboard's "Today Planning" card.
   * Deliberately keyed off the real calendar date, not the report date being viewed: the
   * card answers "what is planned for today", whichever past day's report is on screen.
   */
  const todayPlanningKpi = useMemo(() => {
    const today = todayISO()
    const plan = monthlyPlans.find((p) => p.month === today.slice(0, 7))
    const i = plan ? plan.dayDates.indexOf(today) : -1
    const hasPlan = !!plan && i >= 0
    return {
      value: hasPlan ? plan!.dayTotals[i] : 0,
      date: today,
      hasPlan,
      title: plan?.title ?? '',
      // Pieces unless the sheet planned in kilograms (Roller). Older records predate the field.
      measure: plan?.measure ?? 'pcs',
      /** Items scheduled for today, biggest first — drives the card's breakdown popup. */
      items: hasPlan ? plan!.rows.filter((r) => r.days[i] > 0).map((r) => ({ ...r, todayQty: r.days[i] })).sort((a, b) => b.todayQty - a.todayQty) : [],
      monthTotals: plan
        ? {
            plan: plan.rows.reduce((s, r) => s + r.planQty, 0),
            confirm: plan.rows.reduce((s, r) => s + r.confirmQty, 0),
            pending: plan.rows.reduce((s, r) => s + r.pendingQty, 0),
          }
        : { plan: 0, confirm: 0, pending: 0 },
      /**
       * The figures the morning meeting writes on its whiteboard.
       *
       * TODAY's plan comes from the Monthly Planning sheet. The other six come from ONE
       * place only — the Daily Plan vs Achievement sheet uploaded that morning — because
       * that sheet IS the plant's own running tally, kept outside this app.
       *
       * They used to be summed from the saved shift reports when no sheet had been uploaded,
       * and those sums were simply a different quantity: a shift report holds the machines
       * that ran that shift, so adding its plan and achievement columns answers "what did
       * these machines do", not "where is the month". The two never agreed, and the wrong
       * one was on screen under the right label. So with no sheet, the six now read "—":
       * a blank that asks for the upload beats a number nobody can reconcile.
       */
      board: (() => {
        // The newest tally on or before today — normally the one uploaded this morning.
        const pva = planVsAch
          .filter((r) => r.date <= today)
          .sort((a, b) => a.date.localeCompare(b.date))
          .pop()
        const yst = new Date(today + 'T00:00:00')
        yst.setDate(yst.getDate() - 1)
        const ystISO = `${yst.getFullYear()}-${String(yst.getMonth() + 1).padStart(2, '0')}-${String(yst.getDate()).padStart(2, '0')}`
        // A row the sheet did not carry is unknown, not zero.
        const dayF = (v: number) => (pva && pva.dayFound !== false ? v : null)
        const monF = (v: number) => (pva && pva.monthFound !== false ? v : null)
        return {
          hasSheet: !!pva,
          /** The day the sheet's figures belong to, and the word the sheet used for it. */
          prevDate: pva?.date ?? '',
          dayLabel: pva?.dayLabel || 'Yesterday',
          /** The month those month figures cover — never assumed to be the month we are in. */
          sheetMonth: pva ? pva.date.slice(0, 7) : '',
          /** Older than yesterday: the tally on screen is not this morning's. */
          stale: !!pva && pva.date < ystISO,
          prevPlan: pva ? dayF(pva.day.plan) : null,
          prevAch: pva ? dayF(pva.day.ach) : null,
          prevBacklog: pva ? dayF(pva.day.backlog) : null,
          monthPlan: pva ? monF(pva.month.plan) : null,
          monthAch: pva ? monF(pva.month.ach) : null,
          monthBacklog: pva ? monF(pva.month.backlog) : null,
          pvaFile: pva?.fileName ?? '',
          /** The Monthly Planning sheet's own total for the month, for context. */
          sheetMonthPlan: plan ? plan.dayTotals.reduce((n, v) => n + v, 0) : null,
        }
      })(),
    }
  }, [monthlyPlans, planVsAch])

  /**
   * Rework / rejection / backlog actually recorded in the plan's month. The Plan
   * Confirmation sheet has no such columns, so these come from the SAVED daily production
   * reports (one record per date — `uploads` holds the same rows split per shift, so using
   * both would double-count).
   */
  /**
   * Every PD Report import in this workspace, read here so the Month Range and the KPI
   * Dashboard can work across them. The KPI page reads only the converted one — that is its
   * own concern, and it keeps making it.
   */
  const pdImports = useImports()
  /**
   * Fetched only on the screens that read it.
   *
   * The PD Report is by far the biggest thing the server holds — several months of a
   * thousand-odd rows each, about eight megabytes uncompressed — and the Dashboard does not
   * use a single row of it. Pulling it on every load was most of what made the app feel slow
   * on the plant's Wi-Fi. The KPI page loads it itself on mount, so opening it still works;
   * this covers the KPI Dashboard and the Month Range pill beside it.
   */
  useEffect(() => {
    if (view !== 'kpi' && view !== 'kpidash') return
    void loadPdImports()
  }, [unit, view])
  /**
   * Every imported month, with the rows behind it.
   *
   * The plant sends one workbook per month, so June, July and August are three separate
   * imports; a trend has to read them all, and the KPI page reads whichever one covers the
   * month picked in its header.
   *
   * When two imports cover the same month (a corrected re-upload), the newer one wins outright
   * rather than being added to the older — that would double every figure for that month. The
   * KPI page settles that tie the same way, so the two screens never read different rows.
   */
  const pdMonthRows = useMemo(() => {
    const byMonth = new Map<string, { at: number; rows: PdRow[] }>()
    for (const im of pdImports) {
      const at = im.savedAt || 0
      const groups = new Map<string, PdRow[]>()
      for (const r of im.rows) {
        const own = String(r.date || '').slice(0, 7)
        // A sheet with no dates falls back to the month chosen on the import screen.
        const m = /^\d{4}-\d{2}$/.test(own) ? own : im.month || ''
        if (!m) continue
        const list = groups.get(m)
        if (list) list.push(r)
        else groups.set(m, [r])
      }
      for (const [m, rows] of groups) {
        const cur = byMonth.get(m)
        if (!cur || at >= cur.at) byMonth.set(m, { at, rows })
      }
    }
    return new Map([...byMonth].map(([m, v]) => [m, v.rows]))
  }, [pdImports])

  /** Months there is data for, ascending — what the range picker may offer. */
  const pdMonths = useMemo(() => [...pdMonthRows.keys()].sort(), [pdMonthRows])

  /** The most recent upload, whichever month it covers. */
  const newestImportId = useMemo(
    () => [...pdImports].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0]?.id ?? '',
    [pdImports],
  )

  /*
   * A fresh upload — or a different workspace — releases a pinned month.
   * Someone who has just imported September's workbook means to look at September; leaving
   * the page on the August they pinned last week reads as a broken import. Setting it back
   * to null re-derives the newest month there is data for.
   */
  useEffect(() => setKpiMonth(null), [newestImportId, unit])

  /**
   * The month the KPI page is showing.
   *
   * That page describes ONE month — its cards, its sheet and its Plan vs Achievement tally
   * all have to belong to the same one — so it gets a month picker of its own. It used to
   * carry the Dashboard's from/to range instead, which opened on "June 2026 to August 2026"
   * over figures that were never a range, and left no way to ask for August.
   *
   * Until something is picked it opens on the newest month there is a report for: the month
   * the meeting is working in, and the one the reader would have picked first.
   */
  const kpiPageMonth = useMemo(() => {
    if (kpiMonth) return kpiMonth
    if (pdMonths.length) return pdMonths[pdMonths.length - 1]
    const pv = planVsAch.map((r) => r.date.slice(0, 7)).sort()
    return pv.length ? pv[pv.length - 1] : todayISO().slice(0, 7)
  }, [kpiMonth, pdMonths, planVsAch])

  /**
   * The whiteboard tally for the month on screen, in the shape the KPI page's two cards want.
   *
   * Keyed off the picked month rather than "the newest sheet on or before today", which is
   * what the dashboard's own block wants and is a different question: uploading August's
   * 31/08 sheet while sitting in September left the KPI page still printing September, with
   * no way to ask for the month just uploaded.
   *
   * Inside the month the LAST sheet wins — its Month row is the whole month to date — and a
   * month with no sheet of its own is left empty rather than borrowing the previous month's.
   */
  const kpiMonthlyBoard = useMemo<KpiMonthlyBoard>(() => {
    const pva = planVsAch
      .filter((r) => r.date.slice(0, 7) === kpiPageMonth)
      .sort((a, b) => a.date.localeCompare(b.date))
      .pop()
    // A row the sheet did not carry is unknown, not zero.
    const dayF = (v: number) => (pva && pva.dayFound !== false ? v : null)
    const monF = (v: number) => (pva && pva.monthFound !== false ? v : null)
    return {
      hasSheet: !!pva,
      fileName: pva?.fileName ?? '',
      month: kpiPageMonth,
      dayLabel: pva?.dayLabel || 'Yesterday',
      dayDate: pva?.date ?? '',
      dayPlan: pva ? dayF(pva.day.plan) : null,
      dayAch: pva ? dayF(pva.day.ach) : null,
      dayBacklog: pva ? dayF(pva.day.backlog) : null,
      monthPlan: pva ? monF(pva.month.plan) : null,
      monthAch: pva ? monF(pva.month.ach) : null,
      monthBacklog: pva ? monF(pva.month.backlog) : null,
    }
  }, [planVsAch, kpiPageMonth])

  /**
   * The range on screen. Defaults to the last three months held, which is the span a trend
   * actually reads from; a single month would show a chart with one point.
   */
  const kpiRange = useMemo(() => {
    if (!pdMonths.length) return null
    const last = pdMonths[pdMonths.length - 1]
    const first = pdMonths[Math.max(0, pdMonths.length - 3)]
    if (!kpiMonths) return { from: first, to: last }
    // A stored range can outlive the imports it was picked for.
    const from = pdMonths.includes(kpiMonths.from) ? kpiMonths.from : first
    const to = pdMonths.includes(kpiMonths.to) ? kpiMonths.to : last
    return from <= to ? { from, to } : { from: first, to: last }
  }, [pdMonths, kpiMonths])

  /**
   * The running order, and where it has got to.
   *
   * Built from what this workspace actually shows — a unit with no CG machines never gets a
   * CG slide, and a day with no downtime remarks skips that card. The group leads and the
   * sections run inside it, so the room sees one group's whole dashboard before the next.
   */
  const loopSections = useMemo(
    () => sectionsFor(unit, { hasRemarks: remarks.length > 0, hasPriority: critical.length > 0 }),
    [unit, remarks.length, critical.length],
  )
  const loopPlaylist = useMemo(
    () => buildPlaylist(loopSections, unit === 'ASS' ? [] : meta.groups),
    [loopSections, meta.groups, unit],
  )
  /** Only the two dashboards have cards to walk through, and only when they hold a report. */
  const loopRunning =
    loopOn &&
    loopPlaylist.length > 1 &&
    ((view === 'dashboard' && rows.length > 0) || (view === 'assembly' && !!shownAssemblyReport))
  const loopStep = loopPlaylist[loopIndex % loopPlaylist.length]
  /** Is this card the one on screen? Everything renders as usual when the loop is off. */
  const showSec = useCallback(
    (id: string) => !loopRunning || loopStep?.section.id === id,
    [loopRunning, loopStep],
  )
  const loopNext = useCallback(() => setLoopIndex((i) => (i + 1) % Math.max(1, loopPlaylist.length)), [loopPlaylist.length])
  const loopPrev = useCallback(
    () => setLoopIndex((i) => (i - 1 + Math.max(1, loopPlaylist.length)) % Math.max(1, loopPlaylist.length)),
    [loopPlaylist.length],
  )

  // The clock. One timeout per card rather than a repeating interval, so Pause, Next and a
  // changed dwell time all restart cleanly from the card on screen.
  useEffect(() => {
    if (!loopRunning || loopPaused) return
    const id = window.setTimeout(loopNext, Math.max(2, loopSecs) * 1000)
    return () => window.clearTimeout(id)
  }, [loopRunning, loopPaused, loopIndex, loopSecs, loopNext])

  // The loop drives the machine-group filter itself. Moving the real filter (rather than
  // shadowing it) means every card, chart and KPI already follows without being told, and
  // the dropdown in the header shows the room which group it is looking at.
  useEffect(() => {
    if (!loopRunning || !loopStep) return
    if (groupBeforeLoop.current === null) groupBeforeLoop.current = groupRef.current
    if (loopStep.group !== groupRef.current) setGroup(loopStep.group)
  }, [loopRunning, loopStep])
  useEffect(() => {
    if (loopRunning || groupBeforeLoop.current === null) return
    setGroup(groupBeforeLoop.current)
    groupBeforeLoop.current = null
  }, [loopRunning])
  /**
   * Keys, since the dial is the only control left on screen.
   *
   * Arrows and space are what a presentation remote sends, so the clicker in someone's hand
   * already works: step, hold, and Escape to stop.
   */
  useEffect(() => {
    if (!loopRunning) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') loopNext()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') loopPrev()
      else if (e.key === ' ') setLoopPaused((p) => !p)
      else if (e.key === 'Escape') setLoopOn(false)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loopRunning, loopNext, loopPrev, setLoopOn])

  // A playlist can shrink under the loop (a new upload with fewer groups) — never point past it.
  useEffect(() => {
    if (loopIndex >= loopPlaylist.length && loopPlaylist.length) setLoopIndex(0)
  }, [loopIndex, loopPlaylist.length])

  const monthlyPlanActuals = useMemo<MonthActuals>(() => {
    const month = shownMonthlyPlan?.month
    const empty: MonthActuals = { rework: 0, rejection: 0, backlog: 0, dates: [] }
    if (!month) return empty
    const dates = new Set<string>()
    let rework = 0
    let rejection = 0
    let backlog = 0
    for (const rec of history) {
      if (!String(rec.meetingDate || '').startsWith(month)) continue
      dates.add(rec.meetingDate)
      for (const r of rec.rows || []) {
        rework += r.rework || 0
        rejection += r.rejection || 0
        backlog += r.backlog || 0
      }
    }
    return { rework, rejection, backlog, dates: [...dates].sort() }
  }, [shownMonthlyPlan, history])

  // Upload Excel + chosen date -> parse into a preview (not persisted until Save).
  const uploadAssembly = useCallback(async (file: File, date: string) => {
    setAssemblyBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const report = { ...parseAssemblyWorkbook(buf, file.name), date }
      setAssemblyPreview(report)
      setAssemblyDate(date)
      setAssemblySavedNote('')
      setShowAssemblyUpload(false)
    } catch (e) {
      // Show the parser's own message — a generic "could not read" gave no way to tell a
      // wrong file from a renamed column, which is almost always the real cause.
      const why = e instanceof Error && e.message ? e.message : String(e)
      alert(`Could not read "${file.name}".\n\n${why}`)
      console.error('[assembly upload]', e)
    } finally {
      setAssemblyBusy(false)
    }
  }, [])

  // Save the previewed report -> persists to the server + Assembly History (shared across devices).
  const saveAssemblyMeeting = useCallback(() => {
    if (!assemblyPreview) return
    ;(async () => {
      const saved = await saveAssembly(assemblyPreview)
      setAssembly((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)])
      setAssemblyPreview(null)
      setAssemblyDate(saved.date)
      setAssemblySavedNote(`Saved Assembly report for ${saved.date}.`)
      postActivity('upload', `Assembly report saved — ${saved.date} · ${saved.rows.length} rows`)
    })()
  }, [assemblyPreview])

  const deleteAssemblyDate = useCallback((id: string) => {
    setAssembly((prev) => prev.filter((x) => x.id !== id))
    void deleteAssembly(id)
  }, [])

  // ---- Monthly Planning: upload -> preview -> save ----
  /** `month` is set only when the uploader chose one instead of the sheet's own. */
  const uploadMonthlyPlan = useCallback(async (file: File, month?: string) => {
    setMonthlyPlanBusy(true)
    try {
      const parsed = parseMonthlyPlanWorkbook(await file.arrayBuffer(), file.name)
      // Moving the month moves the day columns with it — see shiftPlanToMonth.
      const plan = month ? shiftPlanToMonth(parsed, month) : parsed
      setMonthlyPlanPreview(plan)
      setMonthlyPlanMonth(plan.month)
      setMonthlyPlanSavedNote('')
      setShowMonthlyPlanUpload(false)
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : String(e)
      alert(`Could not read "${file.name}".\n\n${why}`)
      console.error('[monthly plan upload]', e)
    } finally {
      setMonthlyPlanBusy(false)
    }
  }, [])

  const saveMonthlyPlanNow = useCallback(() => {
    if (!monthlyPlanPreview) return
    ;(async () => {
      const saved = await saveMonthlyPlan(monthlyPlanPreview)
      setMonthlyPlans((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)])
      setMonthlyPlanPreview(null)
      setMonthlyPlanMonth(saved.month)
      setMonthlyPlanSavedNote(`Saved Monthly Plan for ${saved.title}.`)
      postActivity('upload', `Monthly plan saved — ${saved.title} · ${saved.rows.length} items`)
    })()
  }, [monthlyPlanPreview])

  const deleteMonthlyPlanRec = useCallback((id: string) => {
    setMonthlyPlans((prev) => prev.filter((x) => x.id !== id))
    void deleteMonthlyPlan(id)
  }, [])

  const deleteRouteCardRec = useCallback((id: string) => {
    setRouteCards((prev) => prev.filter((x) => x.id !== id))
    void deleteRouteCard(id)
  }, [])

  const deletePlanVsAchRec = useCallback((id: string) => {
    setPlanVsAch((prev) => prev.filter((x) => x.id !== id))
    void deletePlanVsAch(id)
  }, [])

  /** Read a route card workbook into a preview. The month comes from the modal, not the sheet. */
  const uploadRouteCard = useCallback(async (file: File, month: string) => {
    setRouteCardBusy(true)
    try {
      const card = parseRouteCardWorkbook(await file.arrayBuffer(), file.name, month)
      setRouteCardPreview(card)
      setRouteCardMonth(card.month)
      setRouteCardSavedNote('')
      setShowRouteCardUpload(false)
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : String(e)
      alert(`Could not read "${file.name}".

${why}`)
      console.error('[route card upload]', e)
    } finally {
      setRouteCardBusy(false)
    }
  }, [])

  /**
   * Read the Day / Month tally and store it under its date.
   *
   * Saved straight away rather than previewed: it is six numbers, and re-uploading the same
   * date simply replaces them — there is nothing here a preview step would protect.
   */
  const uploadPlanVsAch = useCallback(
    async (file: File) => {
      setPvaBusy(true)
      setPvaError('')
      try {
        const parsed = parsePlanVsAchWorkbook(await file.arrayBuffer(), file.name, pvaDate)
        const saved = await savePlanVsAch(parsed)
        setPlanVsAch((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date)))
        setShowPvaUpload(false)
        setPvaNote(
          `Plan vs Achievement saved for ${new Date(saved.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
        )
        postActivity('upload', `Plan vs Achievement — ${saved.date} · day ${Math.round(saved.day.ach)} of ${Math.round(saved.day.plan)}`)
      } catch (e) {
        setPvaError(e instanceof Error ? e.message : String(e))
      } finally {
        setPvaBusy(false)
      }
    },
    [pvaDate],
  )

  const saveRouteCardNow = useCallback(() => {
    if (!routeCardPreview) return
    ;(async () => {
      const saved = await saveRouteCard(routeCardPreview)
      setRouteCards((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)])
      setRouteCardPreview(null)
      setRouteCardMonth(saved.month)
      setRouteCardSavedNote(`Saved Route Card for ${saved.title}.`)
      postActivity('upload', `Route card saved — ${saved.title} · ${saved.sheets.length} sheet(s), ${saved.rowCount} rows`)
    })()
  }, [routeCardPreview])
  // Every (date, machine, item) the sheet has, with rework/rejection summed across
  // shifts for that exact item — keyed per item (not just per machine) because a
  // machine often runs a different item in Shift 1 vs Shift 2. This is what lets a
  // Cp-Cpk entry carry forward on every date its item is still running.
  const cpkHistory = useMemo(() => {
    const map = new Map<string, CpkDayActual>()
    for (const u of uploads) {
      for (const r of u.rows) {
        if (!r.mc || !r.itemCode) continue
        const key = `${u.uploadDate}|${r.mc}|${r.itemCode}`
        const cur = map.get(key) ?? { date: u.uploadDate, machine: r.mc, itemCode: r.itemCode, rework: 0, rejection: 0 }
        cur.rework += r.rework
        cur.rejection += r.rejection
        map.set(key, cur)
      }
    }
    return [...map.values()]
  }, [uploads])
  /**
   * Months that carry at least one Cp-Cpk reading, newest first — the Monthly Report hub's
   * card counts them the way the other two count their saved workbooks. Readings are entered
   * per batch, so the month is the entry's own date; nothing else files them.
   */
  const cpkMonths = useMemo(
    () =>
      [...new Set(cpk.map((e) => String(e.date || '').slice(0, 7)))]
        .filter((m) => /^\d{4}-\d{2}$/.test(m))
        .sort((a, b) => b.localeCompare(a)),
    [cpk],
  )

  /** Machines a reading was actually recorded against — the page's machine filter lists these. */
  const cpkMachineList = useMemo(
    () => [...new Set(cpk.map((e) => e.machine).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [cpk],
  )

  const expandedCpk = useMemo(() => expandCpkEntries(cpk, cpkHistory), [cpk, cpkHistory])
  const cpkAlerts = useMemo(() => cpkQualityAlerts(expandedCpk), [expandedCpk])
  const cpkKpi = useMemo(() => {
    const s = cpkSummary(cpk)
    const low = lowestCpk(cpk)
    return {
      ...s,
      lowest: low && low.cpk !== null ? { machine: low.machine, cp: low.cp, cpk: low.cpk } : null,
    }
  }, [cpk])
  // Latest month that has ANY cumulative data (daily snapshots included — they are what
  // builds the cumulative now). Falls back to the current LOCAL month.
  const cumMonth = useMemo(
    () => monthsIn(cumulative)[0] ?? monthOf(new Date().toLocaleDateString('en-CA')),
    [cumulative],
  )
  // Repeat/unresolved "reporting issues": machines that had a problem on the
  // previous day's report and STILL have one on the current day (Shift 1 + 2).
  const reportKpi = useMemo(() => {
    const idx = availableDates.indexOf(effectiveDate)
    const prevDate = idx >= 0 ? availableDates[idx + 1] : undefined // next-older day with data
    let id = 1_000_000
    const prevAll = prevDate
      ? uploads
          .filter((u) => u.uploadDate === prevDate)
          .flatMap((u) => u.rows)
          .map((r) => roundRow({ ...r, id: id++ }))
      : []
    // Respect the machine-group filter on both the current and previous day.
    const prevRows = group === 'ALL' ? prevAll : prevAll.filter((r) => r.group === group)
    const prevLabel = prevDate
      ? new Date(prevDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      : ''
    // prevDate/prevRows travel with the summary so the click-through can show that day too.
    return { ...reportingIssues(groupRows, prevRows, !!prevDate, prevLabel), prevDate, prevRows }
  }, [availableDates, effectiveDate, uploads, groupRows, group])

  // The days a repeating issue is shown across. With no range that is the earlier reported
  // day and the selected one. With a range active it is EVERY reported day in the range, so
  // the popup answers the same question the range banner asks — the whole period, in full.
  // Days are taken unfiltered by shift on purpose: hiding a shift on one day only would make
  // the days look different when they are not.
  const compareDays = useMemo<CompareDay[]>(() => {
    if (!compareMc) return []
    if (dateRange) {
      return availableDates
        .filter((d) => d >= dateRange.from && d <= dateRange.to)
        .slice()
        .sort()
        .map((d) => ({ date: d, rows: rowsForDate(d).filter((r) => r.mc === compareMc) }))
        .filter((d) => d.rows.length > 0)
    }
    const out: CompareDay[] = []
    if (reportKpi.prevDate) {
      out.push({ date: reportKpi.prevDate, rows: reportKpi.prevRows.filter((r) => r.mc === compareMc) })
    }
    out.push({ date: effectiveDate, rows: rows.filter((r) => r.mc === compareMc) })
    return out
  }, [compareMc, dateRange, availableDates, rowsForDate, reportKpi, effectiveDate, rows])

  const cumKpi = useMemo(() => {
    const t = cumulativeForMonth(cumulative, cumMonth)
    // respect the top-bar group filter (e.g. only IG when IG is selected)
    const entries = Object.entries(t).filter(([g]) => group === 'ALL' || g === group)
    const plan = entries.reduce((s, [, x]) => s + x.plan, 0)
    const ach = entries.reduce((s, [, x]) => s + x.ach, 0)
    const backlog = entries.reduce((s, [, x]) => s + backlogOf(x), 0)
    const perGroup = entries
      .map(([g, x]) => ({ group: g, backlog: backlogOf(x) }))
      .sort((a, b) => b.backlog - a.backlog)
    const top = perGroup[0]
    return {
      plan,
      ach,
      backlog,
      achPct: plan ? Math.round((ach / plan) * 100) : 0,
      topGroup: top?.group ?? '',
      topBacklog: top?.backlog ?? 0,
    }
  }, [cumulative, cumMonth, group])

  // ---- KPI card -> machine-wise breakdown modal ----
  const openBreakdown = useCallback(
    (metric: string) => {
      // Today Planning drills into the items the Monthly Planning sheet schedules for
      // today — not into the machine rows the other cards use, so it is built here.
      if (metric === 'todayPlanning') {
        const tp = todayPlanningKpi
        const fmtInt = (n: number) => Math.round(n).toLocaleString('en-IN')
        const day = new Date(tp.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        const b = tp.board
        const unitOf = (n: number) => `${fmtInt(n)}${tp.measure === 'kg' ? ' kg' : ''}`
        const orDash = (n: number | null) => (n === null ? '—' : unitOf(n))
        const shortDay = (d: string) =>
          d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''
        const monthName = new Date(tp.date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        const monthOf = (m: string) =>
          m ? new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : monthName
        /** Achievement against its own plan — the one ratio the meeting works out in its head. */
        const pctOf = (ach: number | null, plan: number | null) =>
          ach !== null && plan ? `${Math.round((ach / plan) * 100)}% of plan` : undefined
        // The six figures below have exactly one source. When it is missing, the block says
        // so and offers the upload rather than leaving the reader to find it.
        const sheetSub = b.hasSheet
          ? `from ${b.pvaFile || 'the Daily Plan vs Achievement sheet'}`
          : 'Daily Plan vs Achievement sheet — not uploaded yet'
        const uploadAction = b.hasSheet
          ? undefined
          : {
              label: 'Upload Plan vs Achievement',
              onClick: () => {
                setBreakdown(null)
                setPvaError('')
                setShowPvaUpload(true)
              },
            }
        const board = {
          groups: [
            {
              title: `Today · ${shortDay(tp.date)}`,
              sub: 'from the Monthly Planning sheet',
              items: [
                { label: 'Today Planning', value: tp.hasPlan ? unitOf(tp.value) : '—', tone: 'lead' as const },
                { label: 'Items scheduled today', value: tp.hasPlan ? fmtInt(tp.items.length) : '—' },
                {
                  label: 'Month plan (sheet)',
                  value: orDash(b.sheetMonthPlan),
                  // The month the day columns actually cover, not the sheet's printed title —
                  // a workbook carried over from last month often still says the old name.
                  sub: monthName,
                },
              ],
            },
            {
              title: b.hasSheet ? `${b.dayLabel} · ${shortDay(b.prevDate)}` : 'Yesterday',
              sub: sheetSub,
              warn: !b.hasSheet
                ? undefined
                : b.prevPlan === null
                  ? 'That sheet had no Yesterday row — only the month was read.'
                  : b.stale
                    ? `This is ${shortDay(b.prevDate)}'s tally — today's sheet has not been uploaded yet.`
                    : undefined,
              action: uploadAction,
              items: [
                { label: 'Yesterday Planning', value: orDash(b.prevPlan), tone: 'plan' as const },
                { label: 'Yesterday Achievement', value: orDash(b.prevAch), sub: pctOf(b.prevAch, b.prevPlan), tone: 'ach' as const },
                { label: 'Yesterday Backlog', value: orDash(b.prevBacklog), tone: 'gap' as const },
              ],
            },
            {
              // The uploaded tally carries its own month; naming it "September" while showing
              // an August sheet's figures would be the one mistake this block cannot afford.
              title: `This Month · ${b.hasSheet ? monthOf(b.sheetMonth) : monthName}`,
              sub: sheetSub,
              warn: !b.hasSheet
                ? undefined
                : b.monthPlan === null
                  ? 'That sheet had no Month row.'
                  : b.sheetMonth !== tp.date.slice(0, 7)
                    ? `These are ${monthOf(b.sheetMonth)} figures — no sheet for ${monthName} yet.`
                    : undefined,
              // The upload button belongs on one block only: both read the same sheet, and
              // the same button twice looks like two different things to do.
              action: undefined,
              items: [
                { label: 'Monthly Plan', value: orDash(b.monthPlan), tone: 'plan' as const },
                { label: 'Monthly Achievement', value: orDash(b.monthAch), sub: pctOf(b.monthAch, b.monthPlan), tone: 'ach' as const },
                { label: 'Monthly Backlog', value: orDash(b.monthBacklog), tone: 'gap' as const },
              ],
            },
          ],
        }
        const tpAccent = accentFor('todayPlanning')
        setBreakdown(
          tp.hasPlan
            ? {
                accent: tpAccent,
                title: `Today Planning — ${day}`,
                note: `${tp.title} · ${tp.items.length} item(s) scheduled today · month plan ${fmtInt(tp.monthTotals.plan)} · confirmed ${fmtInt(tp.monthTotals.confirm)}`,
                board,
                columns: [
                  { key: 'itemCode', label: 'Item Code', primary: true, width: '110px' },
                  { key: 'itemName', label: 'Name of Item', wrap: true },
                  { key: 'todayQty', label: 'Today Plan Qty', align: 'right' as const, lead: true, width: '124px', render: (r: { todayQty: number }) => <b style={{ color: '#2a78d6' }}>{fmtInt(r.todayQty)}</b> },
                  { key: 'planQty', label: 'Plan Qty', align: 'right' as const, width: '96px', render: (r: { planQty: number }) => fmtInt(r.planQty) },
                  { key: 'confirmQty', label: 'Confirmed', align: 'right' as const, width: '100px', render: (r: { confirmQty: number }) => fmtInt(r.confirmQty) },
                  { key: 'pendingQty', label: 'Pending', align: 'right' as const, width: '92px', render: (r: { pendingQty: number }) => (r.pendingQty ? <span style={{ color: '#ea580c' }}>{fmtInt(r.pendingQty)}</span> : '—') },
                  { key: 'dateFrom', label: 'From', width: '96px', render: (r: { dateFrom: string }) => r.dateFrom || '—' },
                  { key: 'dateTo', label: 'To', width: '96px', render: (r: { dateTo: string }) => r.dateTo || '—' },
                ],
                rows: tp.items,
                total: {
                  todayQty: fmtInt(tp.value),
                  planQty: fmtInt(tp.items.reduce((s, r) => s + r.planQty, 0)),
                  confirmQty: fmtInt(tp.items.reduce((s, r) => s + r.confirmQty, 0)),
                  pendingQty: fmtInt(tp.items.reduce((s, r) => s + r.pendingQty, 0)),
                },
              }
            : {
                accent: tpAccent,
                title: `Today Planning — ${day}`,
                note: monthlyPlans.length
                  ? 'No Monthly Plan uploaded for this month. Upload the month’s Plan Confirmation Sheet in Monthly Planning.'
                  : 'No Monthly Plan uploaded yet. Upload a Plan Confirmation Sheet in Monthly Planning.',
                // The two sheets are independent: with no Monthly Plan, the uploaded tally
                // still fills the Yesterday and Month blocks — only Today reads as unknown.
                board,
                columns: [{ key: 'msg', label: 'Status', primary: true }],
                rows: [],
              },
        )
        return
      }
      // Route cards running out of time, for the month we are in. Comes from the Monthly
      // Report workbook rather than the day's report, so — like Today Planning — it is built
      // here instead of from the machine rows.
      if (metric === 'routecard') {
        const reg = openRouteKpi.current
        const fmtInt = (n: number) => Math.round(n).toLocaleString('en-IN')
        const num = (v: string) => {
          const n = parseFloat(String(v).replace(/,/g, ''))
          return Number.isFinite(n) ? n : 0
        }
        const rows = reg?.dueRows ?? []
        /** Print a column only where the register actually filled it — the tabs differ. */
        const has = (pick: (r: OpenRouteRow) => string) => rows.some((r) => pick(r).trim() !== '')
        /** "3 days left", "due today", "5 days over" — the thing the meeting acts on. */
        /** "30 August 2026" is more date than a half-width phone cell can hold. */
        const shortDate = (iso: string, raw: string) =>
          iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : raw || '—'
        const leftText = (n: number) => (n > 0 ? `${n} day${n === 1 ? '' : 's'} left` : n === 0 ? 'due today' : `${-n} day${n === -1 ? '' : 's'} over`)

        const columns = [
          { key: 'date', label: 'Opened', primary: true, width: '116px', render: (r: OpenRouteRow) => shortDate(r.dateISO, r.date) },
          ...(has((r) => r.itemCode) ? [{ key: 'itemCode', label: 'Item Code', width: '118px' }] : []),
          ...(has((r) => r.itemName) ? [{ key: 'itemName', label: 'Item Name', wrap: true }] : []),
          ...(has((r) => r.batch) ? [{ key: 'batch', label: 'Batch No.', width: '112px' }] : []),
          ...(has((r) => r.balance)
            ? [{ key: 'balance', label: 'Balance', align: 'right' as const, width: '96px', render: (r: OpenRouteRow) => (r.balance ? fmtInt(num(r.balance)) : '—') }]
            : []),
          { key: 'daysOpen', label: 'Days Open', align: 'right' as const, width: '96px' },
          {
            key: 'daysLeft',
            label: 'Time Left',
            width: '116px',
            lead: true,
            // The whole point of the list: red once the 28 days are gone, amber while they last.
            render: (r: OpenRouteRow) => (
              <b style={{ color: r.daysLeft > 0 ? '#ea580c' : '#d03b3b' }}>{leftText(r.daysLeft)}</b>
            ),
          },
          { key: 'deadline', label: 'Closing Deadline', width: '134px', render: (r: OpenRouteRow) => shortDate(r.deadlineISO, r.deadline) },
        ]

        setBreakdown({
          accent: accentFor('routecard'),
          title: reg
            ? `Route Card Deadline · ${reg.label} — ${fmtInt(reg.due)} card(s)`
            : 'Route Card Deadline',
          note: reg
            ? `Not closed and already ${DUE_AFTER_DAYS}+ days old, out of ${DEADLINE_DAYS} · from ${reg.card}${
                openRouteKpi.fallback ? ` · ${routeMonthLabel(todayISO().slice(0, 7))} has no dated rows yet` : ''
              }`
            : 'No route card workbook uploaded yet — upload one under Monthly Report → Route Card.',
          board: reg
            ? {
                groups: [
                  {
                    // The same four figures, in the same order, as the cards on the Route
                    // Card page — the number here has to be checkable against the sheet.
                    title: `${reg.label} · ${reg.card}`,
                    sub: `closing deadline = date + ${DEADLINE_DAYS} days`,
                    items: [
                      { label: 'Total Route Card', value: fmtInt(reg.total) },
                      { label: 'Closed', value: fmtInt(reg.closed), tone: 'ach' as const },
                      // Red for the ones out of time, the way the sheet itself colours them.
                      { label: `Open ${DUE_AFTER_DAYS}+ days`, value: fmtInt(reg.due), tone: 'gap' as const },
                      { label: `Open, under ${DUE_AFTER_DAYS} days`, value: fmtInt(reg.open), tone: 'plan' as const },
                    ],
                    warn: openRouteKpi.fallback
                      ? `This is ${reg.label}. The register for ${routeMonthLabel(todayISO().slice(0, 7))} has no dates in it yet.`
                      : undefined,
                  },
                  ...(rows.length
                    ? [
                        {
                          title: 'Running out first',
                          sub: rows[0].itemName || rows[0].itemCode || 'the one to chase today',
                          items: [
                            { label: 'Time left', value: leftText(rows[0].daysLeft), tone: 'gap' as const },
                            { label: 'Opened', value: shortDate(rows[0].dateISO, rows[0].date) },
                            { label: 'Batch', value: rows[0].batch || rows[0].itemCode || '—' },
                          ],
                        },
                      ]
                    : []),
                  ...(rows.length && has((r) => r.balance)
                    ? [
                        {
                          title: 'Quantity waiting',
                          sub: 'balance on these cards',
                          items: [
                            {
                              label: 'On these cards',
                              value: fmtInt(rows.reduce((n, r) => n + num(r.balance), 0)),
                              tone: 'lead' as const,
                            },
                            {
                              label: 'Deadline already gone',
                              value: fmtInt(rows.filter((r) => r.daysLeft <= 0).reduce((n, r) => n + num(r.balance), 0)),
                              tone: 'gap' as const,
                            },
                            { label: 'Cards past the date', value: fmtInt(rows.filter((r) => r.daysLeft <= 0).length) },
                          ],
                        },
                      ]
                    : []),
                ],
              }
            : undefined,
          columns,
          rows,
          total: rows.length
            ? {
                date: `${fmtInt(rows.length)} card(s)`,
                ...(has((r) => r.balance) ? { balance: fmtInt(rows.reduce((n, r) => n + num(r.balance), 0)) } : {}),
              }
            : undefined,
        })
        return
      }

      const active = filteredRows.filter((r) => r.inPlan)
      const orange = (n: number) => <span style={{ color: '#ea580c' }}>{n || '—'}</span>
      const effCell = (r: MachineRow) =>
        r.efficiency === null ? (
          '—'
        ) : (
          <span style={{ color: efficiencyColor(r.efficiency), fontWeight: 700 }}>{r.efficiency}%</span>
        )
      const prodCols = [
        { key: 'mc', label: 'Machine', primary: true, width: '96px' },
        { key: 'operator', label: 'Operator', width: '150px' },
        ...(hasMixedPlanHours(unit)
          ? [
              {
                key: 'planHrs',
                label: 'Hrs',
                align: 'right' as const,
                width: '64px',
                // Each row here is one shift's line, so its hours are a single shift's.
                render: (r: MachineRow) => planHoursFor(unit, r.group, false),
              },
            ]
          : []),
        {
          key: 'planQty',
          label: hasMixedPlanHours(unit) ? 'Plan' : `${planHours(unit, false)}hrs Plan`,
          align: 'right' as const,
          width: '104px',
        },
        ...(hasRunningPlan(unit)
          ? [{ key: 'runningPlan', label: 'Actual Running', align: 'right' as const, width: '128px' }]
          : []),
        { key: 'achQty', label: 'Achievement', align: 'right' as const, width: '120px' },
        { key: 'backlog', label: 'Backlog', align: 'right' as const, width: '100px', render: (r: MachineRow) => orange(r.backlog) },
        { key: 'efficiency', label: 'Eff %', align: 'right' as const, lead: true, width: '84px', render: effCell },
      ]
      const f = (n: number) => n.toLocaleString('en-IN')
      const prodTotal = (rowsArr: MachineRow[]) => {
        const p = rowsArr.reduce((s, r) => s + r.planQty, 0)
        const run = rowsArr.reduce((s, r) => s + r.runningPlan, 0)
        const a = rowsArr.reduce((s, r) => s + r.achQty, 0)
        const bl = rowsArr.reduce((s, r) => s + r.backlog, 0)
        return {
          planHrs: '',
          planQty: f(p),
          runningPlan: f(run),
          achQty: f(a),
          backlog: <span style={{ color: '#ea580c' }}>{f(bl)}</span>,
          // Same fallback as the headline card: no running plan means measure against plan qty.
          efficiency: `${run || p ? Math.round((a / (run || p)) * 100) : 0}%`,
        }
      }
      const ppmCell = (rejects: number, made: number, weight = 700) =>
        made ? (
          <span style={{ color: ppmColor(ppm(rejects, made)), fontWeight: weight }}>{f(ppm(rejects, made))}</span>
        ) : (
          '—'
        )
      const qualTotal = (rowsArr: MachineRow[]) => {
        const made = rowsArr.reduce((s, r) => s + r.achQty, 0)
        const rew = rowsArr.reduce((s, r) => s + r.rework, 0)
        const rej = rowsArr.reduce((s, r) => s + r.rejection, 0)
        const turn = rowsArr.reduce((s, r) => s + r.turningRejection, 0)
        // A group's PPM is rated on the group's own output, not the average of each machine's
        // PPM — a 5-piece machine must not weigh the same as a 5,000-piece one.
        return {
          achQty: f(made),
          rework: f(rew),
          reworkPpm: ppmCell(rew, made, 800),
          rejection: f(rej),
          turningRejection: f(turn),
          ppm: ppmCell(rej, made, 800),
        }
      }
      // When Shift 1 & 2 are combined, split the list into per-shift sections + subtotals
      // (not meaningful for a combined date range, where a row can span many days).
      const bothShifts =
        shiftsOn &&
        !dateRange &&
        shift === 'both' &&
        active.some((r) => shiftNum(r.shift) === 1) &&
        active.some((r) => shiftNum(r.shift) === 2)
      /**
       * `totalRows` matters when the listing is filtered (the quality views hide machines with
       * nothing to report). The subtotal must still be footed on every machine in that shift,
       * or the two shift subtotals will not add up to the grand total — and a rate like PPM
       * would be divided by only part of the output.
       */
      const groupsBy = (
        rowsArr: MachineRow[],
        totalFn: (rs: MachineRow[]) => Record<string, React.ReactNode>,
        totalRows: MachineRow[] = rowsArr,
      ) =>
        bothShifts
          ? ([1, 2] as const).map((sh) => {
              const inShift = (r: MachineRow) => shiftNum(r.shift) === sh
              return { shift: sh, rows: rowsArr.filter(inShift), total: totalFn(totalRows.filter(inShift)) }
            })
          : undefined

      let data: BreakdownData
      switch (metric) {
        case 'plan':
          data = { title: 'Machine-wise Plan Qty', note: groupSequenceFor(unit).join(' → '), columns: prodCols, rows: sortBySequence(active, unit), total: prodTotal(active), shiftGroups: groupsBy(sortBySequence(active, unit), prodTotal) }
          break
        case 'achievement':
          data = { title: 'Machine-wise Achievement', note: groupSequenceFor(unit).join(' → '), columns: prodCols, rows: sortBySequence(active, unit), total: prodTotal(active), shiftGroups: groupsBy(sortBySequence(active, unit), prodTotal) }
          break
        case 'backlog':
          data = { title: 'Machine-wise Backlog', note: groupSequenceFor(unit).join(' → '), columns: prodCols, rows: sortBySequence(active, unit), total: prodTotal(active), shiftGroups: groupsBy(sortBySequence(active, unit), prodTotal) }
          break
        case 'efficiency': {
          const sorted = sortBySequence(active, unit)
          data = {
            title: 'Machine-wise Efficiency',
            note: groupSequenceFor(unit).join(' → '),
            columns: prodCols,
            rows: sorted,
            total: prodTotal(active),
            shiftGroups: groupsBy(sorted, prodTotal),
          }
          break
        }
        case 'belowTarget':
          data = {
            title: withTarget('Machines Below 75% Efficiency'),
            note: `${critical.length} machine(s) · with remark`,
            columns: [...prodCols, { key: 'remark', label: 'Remark', wrap: true }],
            rows: critical,
            total: prodTotal(critical),
            shiftGroups: groupsBy(critical, prodTotal),
          }
          break
        case 'downtime': {
          const dtRows: { mc: string; group: string; itemCode: string; operator: string; reason: string; value: number; shift: MachineRow['shift'] }[] = []
          for (const r of active) {
            for (const [reason, val] of Object.entries(r.downtime)) {
              if (val > 0) dtRows.push({ mc: r.mc, group: r.group, itemCode: r.itemCode, operator: r.operator, reason, value: val, shift: r.shift })
            }
          }
          if (dtRows.length) {
            const dtTotal = (rowsArr: typeof dtRows) => ({ value: f(rowsArr.reduce((s, r) => s + r.value, 0)) })
            const sortDt = sortBySequence
            data = {
              title: 'Machine-wise Downtime',
              note: groupSequenceFor(unit).join(' → '),
              columns: [
                { key: 'mc', label: 'Machine', primary: true },
                { key: 'itemCode', label: 'Item Code' },
                { key: 'operator', label: 'Operator' },
                {
                  key: 'category',
                  label: 'Category',
                  render: (r: { reason: string }) => (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: downtimeColor(r.reason) }} />
                      {categoryLabel(r.reason)}
                    </span>
                  ),
                },
                { key: 'reason', label: 'Downtime' },
                { key: 'value', label: 'Minutes', align: 'right' as const, lead: true },
              ],
              rows: sortDt(dtRows),
              total: dtTotal(dtRows),
              shiftGroups: bothShifts
                ? ([1, 2] as const).map((sh) => {
                    const rs = dtRows.filter((r) => shiftNum(r.shift) === sh)
                    return { shift: sh, rows: sortDt(rs), total: dtTotal(rs) }
                  })
                : undefined,
            }
          } else {
            data = {
              title: 'Downtime — Remarks',
              note: 'No structured downtime filled — item, operator & remark',
              columns: [
                { key: 'mc', label: 'Machine', primary: true },
                { key: 'itemCode', label: 'Item Code' },
                { key: 'operator', label: 'Operator' },
                { key: 'remark', label: 'Remark / Downtime' },
              ],
              rows: active.filter((r) => r.remark),
              shiftGroups: groupsBy(
                active.filter((r) => r.remark),
                () => ({}),
              ),
            }
          }
          break
        }
        case 'rework':
        case 'rejection':
        case 'turningRejection': {
          const label = metric === 'rework' ? 'Rework' : metric === 'rejection' ? 'Rejection' : 'Turning Rejection'
          const key = metric as 'rework' | 'rejection' | 'turningRejection'
          const listed = sortBySequence(active.filter((r) => r[key] > 0), unit)
          data = {
            title: `Machine-wise ${label}`,
            note: `FG → CG → EG → IG → HO · PPM = count ÷ Achievement × 1,000,000 · listing only machines with ${label.toLowerCase()}, totals cover every machine that ran`,
            // Each count sits next to its own PPM so the rate is read against the right number.
            columns: [
              { key: 'mc', label: 'Machine', primary: true },
              { key: 'itemCode', label: 'Item Code' },
              { key: 'operator', label: 'Operator', render: (r: MachineRow) => r.operator || '—' },
              { key: 'achQty', label: 'Achievement', align: 'right' as const, width: '112px' },
              { key: 'rework', label: 'Rework', align: 'right' as const },
              // A machine with no output has no rate to report — ppmCell shows a dash rather
              // than 0, which would read as "perfect".
              { key: 'reworkPpm', label: 'Rework PPM', align: 'right' as const, width: '104px', render: (r: MachineRow) => ppmCell(r.rework, r.achQty) },
              { key: 'rejection', label: 'Rejection', align: 'right' as const },
              { key: 'ppm', label: 'Rej. PPM', align: 'right' as const, width: '96px', render: (r: MachineRow) => ppmCell(r.rejection, r.achQty) },
              { key: 'turningRejection', label: 'Turn.Rej', align: 'right' as const },
            ],
            rows: listed,
            total: qualTotal(active),
            shiftGroups: groupsBy(listed, qualTotal, active),
          }
          break
        }
        case 'cpk': {
          const alertIds = new Set(cpkAlerts.map((a) => a.id))
          const isAlertRow = (r: ExpandedCpk) => alertIds.has(`${r.id}-${r.forDate}`)
          data = {
            title: 'Machine-wise Cp-Cpk',
            note: `Date-wise · carried forward while the item runs${cpkAlerts.length ? ` · ${cpkAlerts.length} quality alert(s)` : ''}`,
            columns: [
              {
                key: 'date',
                label: 'Date',
                render: (r: ExpandedCpk) => (
                  <span style={isAlertRow(r) ? { color: '#d03b3b', fontWeight: 700 } : undefined}>
                    {new Date(r.forDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {r.carried ? ' ↻' : ''}
                  </span>
                ),
              },
              { key: 'machine', label: 'Machine', primary: true },
              { key: 'itemCode', label: 'Item Code', render: (r: ExpandedCpk) => r.itemCode || '—' },
              { key: 'setter', label: 'Setter', render: (r: ExpandedCpk) => r.setter || '—' },
              { key: 'operator', label: 'Operator', render: (r: ExpandedCpk) => r.operator || '—' },
              { key: 'cp', label: 'Cp', align: 'right' as const, render: (r: ExpandedCpk) => r.cp ?? '—' },
              {
                key: 'cpk',
                label: 'Cpk',
                align: 'right' as const,
                render: (r: ExpandedCpk) =>
                  r.cpk === null ? (
                    '—'
                  ) : (
                    <span style={{ color: cpkColor(r.cpk), fontWeight: 700 }}>
                      {r.cpk}
                      {r.cpk < CPK_TARGET ? ' ▼' : ''}
                    </span>
                  ),
              },
              { key: 'rework', label: 'Rework', align: 'right' as const, render: (r: ExpandedCpk) => (r.rework ? orange(r.rework) : '—') },
              { key: 'rejection', label: 'Rejection', align: 'right' as const, render: (r: ExpandedCpk) => (r.rejection ? orange(r.rejection) : '—') },
              {
                key: 'status',
                label: 'Status',
                render: (r: ExpandedCpk) =>
                  isAlertRow(r) ? (
                    <span style={{ color: '#d03b3b', fontWeight: 700 }}>⚠ Alert</span>
                  ) : r.cpk === null ? (
                    '—'
                  ) : r.cpk < CPK_TARGET ? (
                    <span style={{ color: '#d03b3b' }}>Below target</span>
                  ) : (
                    <span style={{ color: '#0ca30c' }}>OK</span>
                  ),
              },
            ],
            rows: sortExpanded(expandedCpk),
            total: {
              rework: f(expandedCpk.reduce((s, r) => s + r.rework, 0)),
              rejection: f(expandedCpk.reduce((s, r) => s + r.rejection, 0)),
            },
          }
          break
        }
        case 'cumulative': {
          const t = cumulativeForMonth(cumulative, cumMonth)
          const rows = Object.entries(t)
            .filter(([g]) => group === 'ALL' || g === group) // respect the group filter
            .map(([grp, x]) => ({
              group: grp,
              plan: x.plan,
              ach: x.ach,
              backlog: backlogOf(x),
              achPct: x.plan ? Math.round((x.ach / x.plan) * 100) : 0,
              backlogPct: x.plan ? Math.round((backlogOf(x) / x.plan) * 100) : 0,
            }))
          // This unit's own shop-floor order; anything it does not name falls to the end.
          const gi = (g: string) => groupRank(g, unit)
          rows.sort((a, b) => gi(a.group) - gi(b.group))
          const tPlan = rows.reduce((s, r) => s + r.plan, 0)
          const tAch = rows.reduce((s, r) => s + r.ach, 0)
          const tBack = rows.reduce((s, r) => s + r.backlog, 0)
          data = {
            title: `Cumulative — ${cumMonth}`,
            note: 'Per machine group · FG → CG → EG → IG → HO',
            columns: [
              { key: 'group', label: 'Group', primary: true },
              { key: 'plan', label: 'Cum Plan', align: 'right' as const },
              { key: 'ach', label: 'Cum Ach', align: 'right' as const },
              { key: 'backlog', label: 'Backlog', align: 'right' as const },
              { key: 'achPct', label: 'Ach %', align: 'right' as const, render: (r: { achPct: number }) => `${r.achPct}%` },
              { key: 'backlogPct', label: 'Backlog %', align: 'right' as const, render: (r: { backlogPct: number }) => `${r.backlogPct}%` },
            ],
            rows,
            total: {
              plan: tPlan.toLocaleString('en-IN'),
              ach: tAch.toLocaleString('en-IN'),
              backlog: tBack.toLocaleString('en-IN'),
              achPct: `${tPlan ? Math.round((tAch / tPlan) * 100) : 0}%`,
              backlogPct: `${tPlan ? Math.round((tBack / tPlan) * 100) : 0}%`,
            },
          }
          break
        }
        case 'reporting': {
          type IssueRow = {
            mc: string
            operator: string
            efficiency: number | null
            areas: IssueArea[]
            reasons: string[]
            shift: string
          }
          const areaCell = (r: IssueRow) => (
            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
              {r.areas.map((a: IssueArea) => (
                <span
                  key={a}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: AREA_META[a].color + '22',
                    color: AREA_META[a].color,
                    borderRadius: 6,
                    padding: '1px 6px',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: AREA_META[a].color }} />
                  {withTarget(AREA_META[a].label)}
                </span>
              ))}
            </span>
          )
          const effR = (r: IssueRow) =>
            r.efficiency === null ? (
              '—'
            ) : (
              <span style={{ color: efficiencyColor(r.efficiency), fontWeight: 700 }}>{r.efficiency}%</span>
            )
          // Repeat machines (group-filtered, both-day compare) → their CURRENT issue
          // rows from the filtered view, split by shift.
          const repeatSet = new Set(reportKpi.repeats.map((r) => r.mc))
          const issueRows: IssueRow[] = filteredRows
            .filter((r) => r.mc && repeatSet.has(r.mc))
            .map((r) => {
              const { areas, reasons } = machineIssueAreas(r)
              return { mc: r.mc, operator: r.operator, efficiency: r.efficiency, areas, reasons, shift: r.shift }
            })
            .filter((x) => x.areas.length > 0)
            .sort((a, b) => areaRank(a.areas) - areaRank(b.areas) || (a.efficiency ?? 999) - (b.efficiency ?? 999))
          const bothForReport =
            shift === 'both' &&
            issueRows.some((x) => shiftNum(x.shift) === 1) &&
            issueRows.some((x) => shiftNum(x.shift) === 2)
          data = {
            title: 'Repeating Issues',
            note: reportKpi.hasPrev
              ? `Machines still unresolved since ${reportKpi.prevLabel} · ${reportKpi.count} machine(s)`
              : 'Need an earlier day’s report to compare',
            columns: [
              { key: 'mc', label: 'Machine', primary: true },
              { key: 'operator', label: 'Operator', render: (r: IssueRow) => r.operator || '—' },
              { key: 'efficiency', label: 'Eff %', align: 'right' as const, lead: true, render: effR },
              { key: 'areas', label: 'Issue', render: areaCell },
              {
                key: 'reasons',
                label: 'Downtime',
                render: (r: IssueRow) => (r.reasons.length ? r.reasons.join(', ') : '—'),
              },
            ],
            rows: issueRows,
            shiftGroups: bothForReport
              ? ([1, 2] as const).map((sh) => ({
                  shift: sh,
                  rows: issueRows.filter((x) => shiftNum(x.shift) === sh),
                }))
              : undefined,
          }
          break
        }
        default:
          data = { title: 'Breakdown', columns: prodCols, rows: active }
      }
      // Every machine-level breakdown row opens that machine's full detail.
      if (metric !== 'cumulative') {
        data.onRowClick = (r: { mc?: string; machine?: string; shift?: MachineRow['shift'] }) => {
          const mc = r.mc || r.machine
          // A repeating issue is a claim about the earlier day AND this one, so it opens the
          // two-day comparison. This is checked BEFORE the range branch on purpose: the
          // Repeating Issues list is built from those same two days even while a range is
          // active, so sending the click to the range's day-by-day list would answer a
          // different question than the row the user just clicked.
          if (metric === 'reporting' && mc && reportKpi.prevDate) {
            setCompareMc(mc)
            return
          }
          // Match the machine AND its shift — the same machine appears in both Shift 1 and
          // Shift 2 when both are combined, so matching by name alone opened the wrong shift.
          // With a range active the row is a total across many days, so its "detail" has to be
          // the day-by-day list — the single-day modal would just repeat the same sums.
          if (dateRange && mc) {
            setMachineRange(mc)
            return
          }
          const found = rows.find((x) => x.mc === mc && x.shift === r.shift) || rows.find((x) => x.mc === mc)
          // Open the machine detail ON TOP of the breakdown list (don't close the list),
          // so closing the detail returns to the list instead of dismissing everything.
          if (found) setMachineDetail(found)
        }
      }
      // The colour of the card that was tapped travels with the breakdown.
      setBreakdown({ ...data, accent: accentFor(metric) })
    },
    [filteredRows, critical, cpk, cpkAlerts, cumulative, cumMonth, rows, group, reportKpi, shift, dateRange, todayPlanningKpi, monthlyPlans, openRouteKpi],
  )

  // The register's arrows live in the card header and page every table under it. Dashboard
  // and Machine List never render together, so one set of refs serves both.
  const regScroll = useRef<HTMLDivElement | null>(null)
  const regScroll1 = useRef<HTMLDivElement | null>(null)
  const regScroll2 = useRef<HTMLDivElement | null>(null)
  const regScrollers = useMemo(() => [regScroll, regScroll1, regScroll2], [])

  // Wait for the shared uploads before first paint (no empty-state flash).
  if (availableDates.length === 0 && !uploadsLoaded) {
    return <div className="min-h-screen grid place-items-center text-slate-400">Loading dashboard…</div>
  }

  // Views that read the day's machine rows (the empty/no-report hints only replace these;
  // Cp-Cpk, Cumulative, Notes, History and KPI have their own data and always render —
  // KPI in particular owns the PD Report upload, so it must not sit behind the
  // "no report for this day" screen.
  const dataView =
    view === 'dashboard' || view === 'priority' || view === 'machines' || view === 'efficiency' || view === 'downtime'

  // Edit/delete of the machine register & setter is admin-only (undefined = read-only).
  const editRow = canEdit ? updateRow : undefined
  const delRow = canEdit ? deleteRow : undefined

  const registerControls = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <HScrollButtons scrollRef={regScrollers} />
      {canEdit ? (
        <button className="icon-btn" onClick={resetRows} title="Discard edits, restore imported data">
          <RotateCcw size={14} /> Reset
        </button>
      ) : (
        <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1">
          <Lock size={12} /> View only · admin can edit
        </span>
      )}
      <button className="icon-btn" onClick={exportCsv} title="Download edited data as CSV">
        <Download size={14} /> Export
      </button>
    </div>
  )

  const emptyShiftBanner =
    shift !== 'both' && chartRows.length === 0 ? (
      <div className="bento bento-pad flex items-start gap-3">
        <Info size={18} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-600">
          {shiftsOn ? (
            <>
              No machines found for <b>{shiftLabel(shift)}</b>. Upload a {shiftLabel(shift)} report, or
              open <b>Upload Excel</b> and tag an imported file as {shiftLabel(shift)}.
            </>
          ) : (
            <>
              No machines found for this day. Open <b>Upload Excel</b> and import the day&apos;s report.
            </>
          )}
        </p>
      </div>
    ) : null

  return (
    <div className="flex min-h-screen">
      <Sidebar
        view={navView}
        setView={go}
        criticalCount={critical.length}
        historyCount={history.length}
        notesCount={notes.length}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        collapsed={collapsed}
        onCollapse={() => setCollapsed((c) => !c)}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        {/* Read-only workspaces say so once, at the top. Without this the page just looks
            like it is missing its buttons. */}
        {can.readOnly && (
          <div
            className="px-3 md:px-5 py-2 text-[12.5px] font-semibold flex items-center gap-2 flex-wrap border-b border-[var(--hairline)]"
            style={{ background: 'color-mix(in srgb, #3b82f6 12%, var(--surface))', color: 'var(--ink-2)' }}
          >
            <Eye size={14} style={{ color: '#2563eb' }} />
            {t('View only')} — {t('you can read everything in')} {UNIT_LABEL[unit]}, {t('but not upload or change it. Ask an admin for access.')}
          </div>
        )}
        {/* Top bar */}
        {/* Extra top padding on phones keeps the title clear of the status bar / notch
            (md:pt-0 → desktop is unchanged). */}
        <header className="sticky top-0 z-20 bg-[var(--page)]/90 backdrop-blur border-b border-[var(--hairline)] pt-[max(env(safe-area-inset-top),14px)] md:pt-0">
          <div className="flex items-center gap-2 md:gap-3 px-3 md:px-5 py-2.5 md:py-3.5 flex-wrap">
            {/* Phones navigate from the bottom tab bar (MobileNav), so no hamburger here. */}
            {/* Sub-pages of a hub get a way back up; the menu entry is the hub, not this page. */}
            {(view === 'monthlyplan' || view === 'routecard' || view === 'maintenancereport' || view === 'toolingreport' || view === 'purchasereport' || view === 'cpk' || view === 'kpidash') && (
              <button
                className="shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition"
                onClick={() => go(view === 'kpidash' ? 'kpi' : 'monthlyreport')}
                title={view === 'kpidash' ? t('Back to KPI') : t('Back to Monthly Report')}
                aria-label={view === 'kpidash' ? 'Back to KPI' : 'Back to Monthly Report'}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-xl font-extrabold text-slate-800 leading-tight truncate">
                {view === 'dashboard' && t(dashboardTitle(unit))}
                {view === 'monthlyreport' && t('Monthly Report')}
                {view === 'monthlyplan' && t('Monthly Planning')}
                {view === 'routecard' && t('Route Card')}
                {view === 'maintenancereport' && t('Maintenance Report')}
                {view === 'toolingreport' && t('Tooling Report')}
                {view === 'purchasereport' && t('Purchase Report')}
                {view === 'kpi' && t('KPI')}
                {view === 'kpidash' && t('KPI Dashboard')}
                {view === 'priority' && t('Priority Alerts')}
                {view === 'machines' && t('Machine List')}
                {view === 'efficiency' && t('Efficiency Overview')}
                {view === 'downtime' && t('Downtime Analysis')}
                {view === 'assembly' && t('Assembly')}
                {view === 'cpk' && t('Cp-Cpk')}
                {view === 'cumulative' && t('Cumulative')}
                {view === 'notes' && t('Notes')}
                {view === 'history' && t('Meeting Activity')}
                {view === 'settings' && t('Settings')}
                {view === 'aboutapp' && t('About Application')}
                {view === 'userhistory' && t('User Activity')}
                {view === 'backup' && t('Backup')}
                {view === 'notifications' && t('Notification Centre')}
              </h1>
              {view !== 'assembly' && view !== 'monthlyreport' && view !== 'monthlyplan' && view !== 'routecard' && view !== 'maintenancereport' && view !== 'toolingreport' && view !== 'purchasereport' && view !== 'kpidash' && view !== 'backup' && view !== 'userhistory' && view !== 'notifications' && (
                <div className="flex items-center gap-1.5 text-[11px] md:text-xs truncate" style={{ color: 'var(--ink-hint)' }}>
                  <CalendarDays size={12} className="shrink-0" />
                  <span className="truncate">
                    {shiftsOn ? `${shiftLabel(shift)} · ` : ''}
                    {meta.fileName || 'no report yet'}
                  </span>
                </div>
              )}
            </div>

            {/* The loop's countdown, the size of the refresh button beside it. */}
            {loopRunning && loopStep && (
              <LoopTimer
                step={loopStep}
                index={loopIndex % loopPlaylist.length}
                total={loopPlaylist.length}
                paused={loopPaused}
                seconds={loopSecs}
                groups={unit !== 'ASS' && meta.groups.length > 0}
                onPause={() => setLoopPaused((p) => !p)}
              />
            )}

            {/* Refresh — re-pull shared data (use if a filter/shift looks stale) */}
            <button
              className="shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition"
              onClick={refreshData}
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
            </button>

            {/* Import PD Report — only on the KPI page. It opens the import screen rather than
                a file picker: an upload has to be reviewed and converted before it counts. */}
            {/* KPI page: the month it reports on, and the way into the trend. The picker is a
                single month here — the range belongs to the Dashboard, one click away. */}
            {view === 'kpi' && unit === 'U1' && (
              <>
                {kpiRange && (
                  <button
                    onClick={() => go('kpidash')}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-white text-[13px] font-semibold shadow-sm transition"
                    style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                    title={t('Month-by-month KPI trend')}
                  >
                    <LayoutDashboard size={16} /> {t('Dashboard')}
                  </button>
                )}
                <MonthYearSelect value={kpiPageMonth} onChange={setKpiMonth} />
              </>
            )}

            {view === 'kpi' && can.canUpdate && (
              <button
                className="shrink-0 w-9 h-9 grid place-items-center rounded-xl bg-white border border-[var(--hairline)] text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition"
                onClick={unit === 'U1' ? openImportModal : openProdImportModal}
                title={unit === 'U1' ? 'Import PD Report' : 'Import Production Summary'}
                aria-label="Import PD Report"
              >
                <UploadCloud size={17} />
              </button>
            )}

            {/* Cp-Cpk page: which day and which machine the recorded readings are shown for.
                Same two controls the Dashboard carries, and the header's own Refresh sits
                beside them — the readings are shared, so a stale list is one click from
                being right. Both default to everything, which is what the page showed
                before it had filters at all. */}
            {view === 'cpk' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white rounded-lg border border-indigo-200 px-2 py-1 min-w-0">
                  <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                  <input
                    type="date"
                    value={cpkDate}
                    onChange={(e) => setCpkDate(e.target.value || '')}
                    className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 w-[8.4rem]"
                    title="Show one day's readings"
                    aria-label="Cp-Cpk date"
                  />
                  {cpkDate ? (
                    <button
                      onClick={() => setCpkDate('')}
                      className="shrink-0 text-slate-400 hover:text-indigo-600"
                      title="Show every day"
                      aria-label="Clear date"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-indigo-500 shrink-0 hidden sm:inline">{t('all days')}</span>
                  )}
                </div>
                <SelectMenu
                  value={cpkMachineSel}
                  onChange={setCpkMachineSel}
                  title="Filter by machine"
                  icon={<Filter size={14} className="shrink-0" style={{ color: 'var(--ink-hint)' }} />}
                  options={[
                    { value: 'ALL', label: t('All Machines') },
                    ...cpkMachineList.map((m) => ({ value: m, label: m })),
                  ]}
                />
              </div>
            )}

            {view === 'cpk' && (
              <button
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-[13px] font-semibold transition ${
                  cpkEnabled
                    ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-white border-[var(--hairline)] text-slate-500 hover:bg-slate-50'
                }`}
                onClick={toggleCpkEnabled}
                title={cpkEnabled ? 'Cp-Cpk is showing everywhere — click to hide' : 'Cp-Cpk is hidden — click to show everywhere'}
              >
                {cpkEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                {cpkEnabled ? 'Enabled' : 'Disabled'}
              </button>
            )}

            {/* Cumulative enable/disable — one button, only on the Cumulative page.
                Off = hide the Cumulative card from the dashboard everywhere. */}
            {view === 'cumulative' && (
              <button
                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border text-[13px] font-semibold transition ${
                  cumulativeEnabled
                    ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-white border-[var(--hairline)] text-slate-500 hover:bg-slate-50'
                }`}
                onClick={toggleCumulativeEnabled}
                title={cumulativeEnabled ? 'Cumulative is showing on the dashboard — click to hide' : 'Cumulative is hidden — click to show'}
              >
                {cumulativeEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                {cumulativeEnabled ? 'Enabled' : 'Disabled'}
              </button>
            )}

            {view === 'kpidash' && kpiRange && (
              <MonthRangePicker
                months={pdMonths}
                from={kpiRange.from}
                to={kpiRange.to}
                onChange={(from, to) => setKpiMonths({ from, to })}
              />
            )}

            {/* Maintenance Report controls — Date picker + Upload + Delete. */}
            {view === 'maintenancereport' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white rounded-xl border border-sky-200 px-2.5 py-1 min-w-0 shadow-xs">
                  <CalendarDays size={14} className="text-sky-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-600">Date:</span>
                  <input
                    type="date"
                    value={maintenanceDate}
                    onChange={(e) => setMaintenanceDate(e.target.value || '')}
                    className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 cursor-pointer"
                    title="Filter by date (leave empty to show all records)"
                  />
                  {maintenanceDate ? (
                    <button
                      onClick={() => setMaintenanceDate('')}
                      className="shrink-0 text-slate-400 hover:text-sky-600 p-0.5"
                      title="Show all dates / rows"
                      aria-label="Clear date filter"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded shrink-0">
                      All Rows
                    </span>
                  )}
                  {maintenanceReports.length > 1 && (
                    <select
                      value={shownMaintenanceReport?.date || shownMaintenanceReport?.month || maintenanceDate}
                      onChange={(e) => setMaintenanceDate(e.target.value)}
                      className="text-[12.5px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 ml-1 border-l border-slate-200 pl-1.5"
                    >
                      <option value="">{t('All Reports')}</option>
                      {maintenanceReports.map((r) => (
                        <option key={r.id} value={r.date || r.month}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {can.canUpdate && (
                  <button
                    onClick={() => setShowMaintenanceUpload(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-semibold shadow-sm transition"
                    title="Upload Maintenance Report"
                  >
                    <UploadCloud size={16} /> Upload Excel
                  </button>
                )}

                {shownMaintenanceReport && can.canDelete && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete Maintenance Report for ${shownMaintenanceReport.title}?`)) {
                        handleDeleteMaintenanceReport(shownMaintenanceReport.id)
                      }
                    }}
                    className="shrink-0 p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition"
                    title="Delete Report"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Tooling Report controls — Date picker + Upload + Delete. */}
            {view === 'toolingreport' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white rounded-xl border border-purple-200 px-2.5 py-1 min-w-0 shadow-xs">
                  <Hammer size={14} className="text-purple-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-600">Date:</span>
                  <input
                    type="date"
                    value={toolingDate}
                    onChange={(e) => setToolingDate(e.target.value || '')}
                    className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 cursor-pointer"
                    title="Filter by date (leave empty to show all records)"
                  />
                  {toolingDate ? (
                    <button
                      onClick={() => setToolingDate('')}
                      className="shrink-0 text-slate-400 hover:text-purple-600 p-0.5"
                      title="Show all dates / rows"
                      aria-label="Clear date filter"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded shrink-0">
                      All Rows
                    </span>
                  )}
                  {toolingReports.length > 1 && (
                    <select
                      value={shownToolingReport?.date || shownToolingReport?.month || toolingDate}
                      onChange={(e) => setToolingDate(e.target.value)}
                      className="text-[12.5px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 ml-1 border-l border-slate-200 pl-1.5"
                    >
                      <option value="">{t('All Reports')}</option>
                      {toolingReports.map((r) => (
                        <option key={r.id} value={r.date || r.month}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {can.canUpdate && (
                  <button
                    onClick={() => setShowToolingUpload(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-semibold shadow-sm transition"
                    title="Upload Tooling Report"
                  >
                    <UploadCloud size={16} /> Upload Excel
                  </button>
                )}

                {shownToolingReport && can.canDelete && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete Tooling Report for ${shownToolingReport.title}?`)) {
                        handleDeleteToolingReport(shownToolingReport.id)
                      }
                    }}
                    className="shrink-0 p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition"
                    title="Delete Report"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Purchase Report controls — Date picker + Upload + Delete. */}
            {view === 'purchasereport' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white rounded-xl border border-emerald-200 px-2.5 py-1 min-w-0 shadow-xs">
                  <ShoppingCart size={14} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-600">Date:</span>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value || '')}
                    className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 cursor-pointer"
                    title="Filter by date (leave empty to show all records)"
                  />
                  {purchaseDate ? (
                    <button
                      onClick={() => setPurchaseDate('')}
                      className="shrink-0 text-slate-400 hover:text-emerald-600 p-0.5"
                      title="Show all dates / rows"
                      aria-label="Clear date filter"
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shrink-0">
                      All Rows
                    </span>
                  )}
                  {purchaseReports.length > 1 && (
                    <select
                      value={shownPurchaseReport?.date || shownPurchaseReport?.month || purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className="text-[12.5px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 ml-1 border-l border-slate-200 pl-1.5"
                    >
                      <option value="">{t('All Reports')}</option>
                      {purchaseReports.map((r) => (
                        <option key={r.id} value={r.date || r.month}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {can.canUpdate && (
                  <button
                    onClick={() => setShowPurchaseUpload(true)}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold shadow-sm transition"
                    title="Upload Purchase Report"
                  >
                    <UploadCloud size={16} /> Upload Excel
                  </button>
                )}

                {shownPurchaseReport && can.canDelete && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete Purchase Report for ${shownPurchaseReport.title}?`)) {
                        handleDeletePurchaseReport(shownPurchaseReport.id)
                      }
                    }}
                    className="shrink-0 p-2 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 transition"
                    title="Delete Report"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}

            {/* Monthly Planning controls — month picker + Save + Upload. */}
            {view === 'monthlyplan' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {monthlyPlans.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-indigo-200 px-2 py-1 min-w-0">
                    <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                    <select
                      value={shownMonthlyPlan?.month ?? ''}
                      onChange={(e) => {
                        setMonthlyPlanMonth(e.target.value)
                        setMonthlyPlanPreview(null)
                      }}
                      className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0"
                      title="View a saved month"
                    >
                      {monthlyPlanPreview && <option value={monthlyPlanPreview.month}>{monthlyPlanPreview.title} (preview)</option>}
                      {monthlyPlans.map((p) => (
                        <option key={p.id} value={p.month}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {monthlyPlanPreview && can.canUpdate && (
                  <button
                    onClick={saveMonthlyPlanNow}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold shadow-sm"
                  >
                    <Save size={16} /> Save
                  </button>
                )}
                {can.canUpdate && <button
                  onClick={() => setShowMonthlyPlanUpload(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold shadow-sm"
                >
                  <UploadCloud size={16} /> Upload Excel
                </button>}
              </div>
            )}

            {/* Route Card controls — year + month picker, Save (while previewing) and Upload.
                Two pickers rather than one list: a shop floor keeps route cards for years,
                and a single dropdown of every month stops being pickable by the second year. */}
            {view === 'routecard' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {routeCards.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-indigo-200 px-2 py-1 min-w-0">
                    <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                    <select
                      value={(shownRouteCard?.month ?? '').slice(0, 4)}
                      onChange={(e) => {
                        const year = e.target.value
                        // Keep the same month within the new year when that card exists,
                        // otherwise land on that year's newest — never on an empty screen.
                        const month = (shownRouteCard?.month ?? '').slice(5, 7)
                        const pick =
                          routeCards.find((c) => c.month === `${year}-${month}`) ??
                          routeCards.find((c) => c.month.startsWith(year))
                        if (pick) {
                          setRouteCardMonth(pick.month)
                          setRouteCardPreview(null)
                        }
                      }}
                      className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0"
                      title="Year"
                      aria-label="Year"
                    >
                      {routeCardYears.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <span className="text-slate-300">·</span>
                    <select
                      value={shownRouteCard?.month ?? ''}
                      onChange={(e) => {
                        setRouteCardMonth(e.target.value)
                        setRouteCardPreview(null)
                      }}
                      className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0"
                      title="View a saved month"
                      aria-label="Month"
                    >
                      {routeCardPreview && (
                        <option value={routeCardPreview.month}>{routeCardPreview.title} (preview)</option>
                      )}
                      {routeCards
                        .filter((c) => c.month.slice(0, 4) === (shownRouteCard?.month ?? '').slice(0, 4))
                        .map((c) => (
                          <option key={c.id} value={c.month}>
                            {routeMonthLabel(c.month)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                {routeCardPreview && can.canUpdate && (
                  <button
                    onClick={saveRouteCardNow}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold shadow-sm"
                  >
                    <Save size={16} /> Save
                  </button>
                )}
                {can.canUpdate && <button
                  onClick={() => setShowRouteCardUpload(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold shadow-sm"
                >
                  <UploadCloud size={16} /> Upload Excel
                </button>}
              </div>
            )}

            {/* Assembly controls — date picker + range + Save + Upload, only on the Assembly page. */}
            {view === 'assembly' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {assemblyDates.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-white rounded-lg border border-indigo-200 px-2 py-1 min-w-0">
                    <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                    <input
                      type="date"
                      value={activeAssemblyDate}
                      onChange={(e) => {
                        setAssemblyDate(e.target.value || '')
                        setAssemblyPreview(null)
                        setAssemblyRange(null)
                      }}
                      className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 w-[8.2rem]"
                      title="View a saved report date"
                    />
                  </div>
                )}
                {assemblyDates.length > 0 && (
                  <DateRangePicker
                    value={assemblyRange}
                    onApply={(r) => {
                      setAssemblyRange(r)
                      setAssemblyPreview(null)
                    }}
                    onClear={() => setAssemblyRange(null)}
                    maxDate={todayISO()}
                    align="right"
                    allowFuture
                  />
                )}
                {assemblyPreview && (
                  <button
                    onClick={saveAssemblyMeeting}
                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold shadow-sm transition"
                    title="Save this Assembly report to history"
                  >
                    <Save size={15} /> Save
                  </button>
                )}
                {can.canUpdate && <button
                  onClick={() => setShowAssemblyUpload(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold shadow-sm transition"
                  title="Upload the Assembly Production Report Excel"
                >
                  <UploadCloud size={16} /> Upload Excel
                </button>}
              </div>
            )}

            {/* Notes date-range filter — only on the Notes page. Right-aligned popover
                since the trigger sits at the far-right of the header. */}
            {view === 'notes' && (
              <DateRangePicker
                value={notesRange}
                onApply={setNotesRange}
                onClear={() => setNotesRange(null)}
                maxDate={todayISO()}
                align="right"
              />
            )}

            {/* Top-bar controls — only on the Dashboard */}
            {view === 'dashboard' && (
              <>
                <NotifBell onAction={handleNotifAction} onOpenCentre={() => go('notifications')} />

                {/* Controls — a single wrapping row so it reflows cleanly at ANY width
                    (phone/tablet/desktop) instead of jumping between a fixed mobile
                    stack and a fixed desktop row. */}
                <div className="w-full lg:w-auto flex flex-wrap gap-1.5 lg:items-center">
                  {/* Dashboard date shortcut — jump to any day's Shift 1 + Shift 2.
                      Hidden while a range is active: the dashboard is then showing the whole
                      period, so a single-day picker sitting next to it only invites the reader
                      to think the figures belong to that one date. */}
                  {availableDates.length > 0 && !dateRange && (
                    <div className="flex items-center gap-1.5 bg-white rounded-lg border border-indigo-200 px-2 py-1 min-w-0">
                      <CalendarDays size={14} className="text-indigo-600 shrink-0" />
                      <input
                        type="date"
                        value={effectiveDate}
                        max={todayISO()}
                        onChange={(e) => setDashboardDate(e.target.value || '')}
                        className="text-[13px] font-semibold text-slate-800 bg-transparent outline-none min-w-0 w-[8.4rem]"
                        title="Pick a day to view its Shift 1 + Shift 2"
                      />
                      {effectiveDate === availableDates[0] && (
                        <span className="text-[10px] font-bold text-indigo-500 shrink-0 hidden sm:inline">latest</span>
                      )}
                    </div>
                  )}

                  {/* Date-range analysis — pick a range to see combined performance across it */}
                  {availableDates.length > 0 && (
                    <DateRangePicker
                      value={dateRange}
                      onApply={setDateRange}
                      onClear={() => setDateRange(null)}
                      maxDate={todayISO()}
                    />
                  )}

                  {/* Shift filter — pointless where the unit runs one shift. */}
                  {shiftsOn && (
                    <SelectMenu
                      value={shift}
                      onChange={(v) => setShift(v as ShiftSel)}
                      title="Filter by shift"
                      icon={<CalendarClock size={14} className="text-indigo-500 shrink-0" />}
                      options={[
                        { value: '1', label: t('Shift 1') },
                        { value: '2', label: t('Shift 2') },
                        { value: 'both', label: t('Shift 1 & 2 (Both)') },
                      ]}
                    />
                  )}

                  {/* Group filter */}
                  <SelectMenu
                    value={group}
                    onChange={setGroup}
                    title="Filter by machine group"
                    icon={<Filter size={14} className="shrink-0" style={{ color: 'var(--ink-hint)' }} />}
                    options={[
                      { value: 'ALL', label: t('All Machines') },
                      ...meta.groups.map((g) => ({ value: g, label: `${g} Machine` })),
                    ]}
                  />

                  {can.canUpdate && <button
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-[var(--hairline)] hover:bg-slate-50 text-slate-700 text-[13px] font-semibold px-2 py-1 sm:px-2.5 sm:py-1.5 shadow-sm transition"
                    onClick={() => setShowSave(true)}
                    title="Save this meeting to history"
                  >
                    <Save size={15} className="text-indigo-600" />
                    <span className="hidden sm:inline">{t('Save Meeting')}</span>
                  </button>}

                  {/* Upload Excel — tablet/desktop only (hidden on phones) */}
                  {can.canUpdate && <button
                    className="hidden md:inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold px-2.5 py-1.5 shadow-sm transition"
                    onClick={() => setShowUploadChoice(true)}
                    title="Import / manage Excel files"
                  >
                    <UploadCloud size={15} /> {t('Upload Excel')}
                    {dayUploads.length > 1 && (
                      <span className="text-[11px] font-bold bg-white/25 rounded-full px-1.5">
                        {dayUploads.length}
                      </span>
                    )}
                  </button>}
                </div>
              </>
            )}
          </div>
        </header>

        {/* pb-24 on phones keeps content clear of the fixed bottom tab bar */}
        <div className="p-3 md:p-5 pb-24 md:pb-5 flex flex-col gap-4 md:gap-5 scroll-area">
          {dataView && availableDates.length === 0 ? (
            /* Dashboard shell stays; just an inline hint until a report is imported. */
            <div className="bento bento-pad text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center grad-blue text-white shadow-sm mb-4">
                <UploadCloud size={30} />
              </div>
              <div className="text-xl font-extrabold text-slate-800 mb-1">No report on the dashboard yet</div>
              <p className="text-slate-500 mb-5 max-w-md mx-auto">
                <span className="hidden md:inline">
                  Click <b>Upload Excel</b> (top right) to import a report — it appears here and on every device.
                </span>
                <span className="md:hidden">
                  <b>Upload Excel</b> is available on tablet &amp; desktop — once imported there, it appears here
                  automatically.
                </span>
              </p>
              <div className="hidden md:flex flex-col items-center gap-2">
                {can.canUpdate && (
                  <button
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 shadow-sm transition"
                    onClick={() => setShowUploadChoice(true)}
                  >
                    <UploadCloud size={18} /> Upload Excel
                  </button>
                )}
                <button className="text-xs text-slate-400 hover:text-slate-600 underline" onClick={loadSample}>
                  or load sample data
                </button>
              </div>
            </div>
          ) : dataView && !dateRange && dayUploads.length === 0 ? (
            /* A date was picked that has no report — guide back to a day with data. */
            <div className="bento bento-pad text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center bg-amber-100 text-amber-600 shadow-sm mb-4">
                <CalendarDays size={30} />
              </div>
              <div className="text-xl font-extrabold text-slate-800 mb-1">
                No report for {new Date(effectiveDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <p className="text-slate-500 mb-5 max-w-md mx-auto">
                Pick a day that has data
                <span className="hidden md:inline">
                  , or <b>Upload Excel</b> for this date
                </span>
                .
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                {availableDates.map((d) => (
                  <button
                    key={d}
                    className="icon-btn"
                    onClick={() => setDashboardDate(d)}
                  >
                    <CalendarDays size={13} />
                    {new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {d === availableDates[0] ? ' · latest' : ''}
                  </button>
                ))}
              </div>
              {can.canUpdate && (
                <button
                  className="hidden md:inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 shadow-sm transition"
                  onClick={() => setShowUploadChoice(true)}
                >
                  <UploadCloud size={18} /> Upload Excel
                </button>
              )}
            </div>
          ) : (
          <>
          {/* ---------- DASHBOARD ---------- */}
          {view === 'dashboard' && (
            <>
              {dateRange && (
                <div className="bento bento-pad flex items-center gap-3 flex-wrap">
                  <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
                    <CalendarRange size={18} />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-bold text-slate-800">
                      Combined view · {new Date(dateRange.from + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} –{' '}
                      {new Date(dateRange.to + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                    <div className="text-xs text-slate-500">
                      Every KPI, chart and the register below are this whole period's data — Plan/Achievement/Backlog
                      summed per machine, efficiency recalculated from the totals.
                    </div>
                  </div>
                  <button
                    onClick={() => setDateRange(null)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[var(--hairline)] text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 shrink-0"
                  >
                    Back to today
                  </button>
                </div>
              )}
              {dateRange && (!combinedRangeRows || combinedRangeRows.length === 0) ? (
                <div className="bento bento-pad text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center bg-amber-100 text-amber-600 shadow-sm mb-4">
                    <CalendarRange size={30} />
                  </div>
                  <div className="text-xl font-extrabold text-slate-800 mb-1">No data in this range</div>
                  <p className="text-slate-500 mb-5 max-w-md mx-auto">
                    Pick a range that overlaps days you've uploaded reports for — reports are kept for 30 days.
                  </p>
                </div>
              ) : (
              <>
              {/* Confirmation that the Day / Month tally landed — the figures it changes are
                  three cards away, so without this the upload looks like it did nothing. */}
              {pvaNote && (
                <div className="bento bento-pad flex items-center gap-2.5 flex-wrap">
                  <Scale size={16} className="text-teal-600 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-600">✓ {pvaNote}</span>
                  <button onClick={() => setPvaNote('')} className="ml-auto text-[12px] font-bold text-slate-400 hover:text-slate-600">
                    {t('Dismiss')}
                  </button>
                </div>
              )}
              {showSec('kpi') && <KpiGrid
                k={kpis}
                cpk={cpkKpi}
                cum={cumKpi}
                report={reportKpi}
                cpkAlertCount={cpkAlerts.length}
                cpkEnabled={cpkEnabled}
                cumulativeEnabled={cumulativeEnabled}
                todayPlanning={todayPlanningKpi}
                routeCard={{
                  due: openRouteKpi.current?.due ?? 0,
                  register: openRouteKpi.current?.label ?? '',
                  hasData: openRouteKpi.hasData,
                }}
                planLabel={planQtyLabel(unit, shift === 'both')}
                planNote={planHoursNote(unit, shift === 'both')}
                runningPlan={hasRunningPlan(unit)}
                onCardClick={openBreakdown}
                qualityRow={hasQualityRow(unit)}
              />}
              {emptyShiftBanner}
              {showSec('priority') && <ShiftSplit
                enabled={hasBoth}
                single={<PriorityAlerts machines={critical} onEdit={editRow} onSelect={setMachineDetail} />}
                first={<PriorityAlerts machines={s1.critical} onEdit={editRow} onSelect={setMachineDetail} />}
                second={<PriorityAlerts machines={s2.critical} onEdit={editRow} onSelect={setMachineDetail} />}
              />}

              {/* Row 1: Plan vs Achievement (wide) + Downtime Remarks (matched height, scrolls inside) */}
              {/* Two cards share this row normally; under the loop each takes the screen alone. */}
              <div className={loopRunning ? 'min-w-0' : 'grid xl:grid-cols-3 gap-4 md:gap-5 min-w-0'}>
                {showSec('plan') && <div className={loopRunning ? 'min-w-0' : 'xl:col-span-2 min-w-0'}>
                  <SectionCard
                    title="Plan vs Achievement vs Backlog"
                    subtitle="Running plan, achieved qty and pending backlog per machine"
                    icon={<BarChart3 size={18} />}
                  >
                    <ShiftSplit
                      enabled={hasBoth}
                      single={<PlanAchievementChart rows={chartRows} />}
                      first={<PlanAchievementChart rows={s1.chartRows} />}
                      second={<PlanAchievementChart rows={s2.chartRows} />}
                    />
                  </SectionCard>
                </div>}

                {/* xl: absolutely fills the row so it matches the Plan chart's height; list scrolls.
                    Alone under the loop it is an ordinary card again — nothing to match. */}
                {showSec('remarks') && <div className={loopRunning ? 'min-w-0' : 'min-w-0 xl:relative'}>
                  <div className={`bento rise flex flex-col overflow-hidden ${loopRunning ? '' : 'xl:absolute xl:inset-0'}`}>
                    <div className="flex items-center gap-3 px-4 md:px-5 pt-4 pb-3 border-b border-[var(--hairline)] shrink-0">
                      <div className="w-9 h-9 rounded-xl grid place-items-center bg-indigo-50 text-indigo-600 shrink-0">
                        <Info size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-800">Downtime Remarks</div>
                        <div className="text-xs text-slate-500">Operator remarks by machine</div>
                      </div>
                    </div>
                    <div className="p-3 md:p-4 overflow-y-auto scroll-area min-h-0 flex-1 max-h-[60vh] xl:max-h-none">
                      <RemarkList remarks={remarks} />
                    </div>
                  </div>
                </div>}
              </div>

              {/* Row 2: full-width Efficiency (wider — each shift panel gets more room) */}
              {showSec('efficiency') && <SectionCard
                title="Efficiency by Machine"
                subtitle={withTarget("Gradient area with the 75% target line; dots coloured by band")}
                icon={<Gauge size={18} />}
              >
                <ShiftSplit
                  enabled={hasBoth}
                  single={<EfficiencyChart rows={chartRows} />}
                  first={<EfficiencyChart rows={s1.chartRows} />}
                  second={<EfficiencyChart rows={s2.chartRows} />}
                />
              </SectionCard>}

              {/* Row 3: full-width Downtime by Category */}
              {showSec('downtime') && <SectionCard
                title="Downtime by Category"
                subtitle="Reason-wise · Operator (green) · Maintenance (red) · Management (violet)"
                icon={<Timer size={18} />}
              >
                <ShiftSplit
                  enabled={hasBoth}
                  single={<DowntimeCategoryChart data={downtime} />}
                  first={<DowntimeCategoryChart data={s1.downtime} />}
                  second={<DowntimeCategoryChart data={s2.downtime} />}
                />
              </SectionCard>}

              {showSec('register') && <SectionCard
                title="Machine Register"
                subtitle={withTarget("Editable · critical machines (below 75%) listed first")}
                icon={<Table2 size={18} />}
                right={registerControls}
              >
                <ShiftSplit
                  enabled={hasBoth}
                  layout="stack"
                  single={<MachineTable rows={filteredRows} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll} />}
                  first={<MachineTable rows={s1.rows} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll1} />}
                  second={<MachineTable rows={s2.rows} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll2} />}
                />
              </SectionCard>}
              </>
              )}
            </>
          )}

          {/* ---------- PRIORITY ---------- */}
          {view === 'priority' && (
            <>
              <div className="bento bento-pad flex items-start gap-3">
                <Info size={18} className="text-indigo-500 mt-0.5" />
                <p className="text-sm text-slate-600">
                  These machines are running <b>below the {efficiencyTarget()}% efficiency target</b> and are shown
                  worst-first so the morning meeting can focus on the biggest losses. Each card
                  carries the operator remark for root-cause discussion.
                </p>
              </div>
              {emptyShiftBanner}
              <ShiftSplit
                enabled={hasBoth}
                single={<PriorityAlerts machines={critical} onEdit={editRow} onSelect={setMachineDetail} />}
                first={<PriorityAlerts machines={s1.critical} onEdit={editRow} onSelect={setMachineDetail} />}
                second={<PriorityAlerts machines={s2.critical} onEdit={editRow} onSelect={setMachineDetail} />}
              />
            </>
          )}

          {/* ---------- MACHINES ---------- */}
          {view === 'machines' && (
            <SectionCard
              title="All Machines"
              subtitle={`${filteredRows.length} machines · editable · FG → CG → EG → IG → HO`}
              icon={<Table2 size={18} />}
              right={registerControls}
            >
              <ShiftSplit
                enabled={hasBoth}
                layout="stack"
                single={<MachineTable rows={sortBySequence(filteredRows, unit)} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll} />}
                first={<MachineTable rows={sortBySequence(s1.rows, unit)} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll1} />}
                second={<MachineTable rows={sortBySequence(s2.rows, unit)} onEdit={can.canUpdate ? editRow : undefined} onDelete={canEdit ? delRow : undefined} scrollRef={regScroll2} />}
              />
            </SectionCard>
          )}

          {/* ---------- CP-CPK ---------- */}
          {view === 'cpk' && (
            <CpkView
              entries={cpk}
              expanded={expandedCpk}
              alerts={cpkAlerts}
              igMachinesForDate={igMachinesForDate}
              dateFilter={cpkDate}
              machineFilter={cpkMachineSel}
              onSave={doSaveCpk}
              onDelete={canEdit ? deleteCpkHandler : undefined}
            />
          )}

          {/* ---------- CUMULATIVE ---------- */}
          {view === 'cumulative' && (
            <CumulativeView
              entries={cumulative}
              todayGroups={todayGroups}
              groupsForDate={groupsForDate}
              groups={meta.groups}
              onAdd={doAddCumulative}
              onReset={canEdit ? resetCumulative : undefined}
              onSaveDay={saveDayEntry}
              onDetail={() => openBreakdown('cumulative')}
            />
          )}

          {/* ---------- NOTES ---------- */}
          {/* ---------- KPI ---------- */}
          {/* KPI renders unconditionally: its own PD Report upload lives here, so gating it
              on the day's shift report would hide the very button used to load data. */}
          {/* Unit 1 reads the PD Report; Units 2 and 3 read the Production Summary sheet. */}
          {view === 'kpi' &&
            (unit === 'U1' ? (
              <KpiPage k={kpis} cpk={cpkKpi} shift={shift} monthly={kpiMonthlyBoard} month={kpiPageMonth} />
            ) : (
              <ProdKpiPage unitLabel={UNIT_LABEL[unit] ?? unit} shifts={shiftsOn} />
            ))}

          {/* ---------- KPI DASHBOARD (month against month, from the PD Report) ---------- */}
          {view === 'kpidash' &&
            (kpiRange ? (
              <KpiTrendView monthRows={pdMonthRows} from={kpiRange.from} to={kpiRange.to} />
            ) : (
              <div className="bento bento-pad text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4" style={{ background: 'linear-gradient(150deg,#4f46e5,#7c3aed)' }}>
                  <LayoutDashboard size={30} />
                </div>
                <div className="text-lg font-bold text-slate-700">{t('No PD Report yet')}</div>
                <div className="text-sm text-slate-400 mt-1 mb-5">{t('Import a PD Report on the KPI page, then come back.')}</div>
                <button onClick={() => go('kpi')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 shadow-sm">
                  {t('Go to KPI')}
                </button>
              </div>
            ))}

          {view === 'notes' && (
            <NotesView
              notes={notesRange ? notes.filter((n) => n.date >= notesRange.from && n.date <= notesRange.to) : notes}
              range={notesRange ? { from: notesRange.from, to: notesRange.to } : null}
              onAdd={() => setShowAddNote(true)}
              onDelete={canEdit ? deleteNoteHandler : undefined}
            />
          )}

          {/* ---------- TO-DO LIST ---------- */}

          {/* ---------- SETTINGS ---------- */}
          {view === 'settings' && (
            <SettingsView
              themePref={themePref}
              onThemePref={changeTheme}
              notifEnabled={notifEnabled}
              loopOn={loopOn}
              onLoopOn={setLoopOn}
              loopSeconds={loopSecs}
              onLoopSeconds={setLoopSecsPref}
              onNotifEnabled={changeNotif}
              lang={lang}
              onLang={changeLang}
              deviceId={clientId()}
              account={user}
              onAccountUpdate={onUserUpdate}
              onLogout={onLogout}
              isAdmin={isAdmin}
              onOpenHistory={() => go('userhistory')}
              onOpenAbout={() => go('aboutapp')}
            />
          )}

          {view === 'aboutapp' && <AboutApplicationPage onBack={() => go('settings')} />}

          {/* ---------- MONTHLY REPORT (hub — the month-end reports live behind these cards) ---------- */}
          {view === 'monthlyreport' && (
            <MonthlyReportView
              planCount={monthlyPlans.length}
              latest={monthlyPlans[0]?.title ?? ''}
              routeCardCount={routeCards.length}
              routeCardLatest={routeCards[0]?.title ?? ''}
              cpkCount={cpkMonths.length}
              // 'Aug-2026' — the spelling the other two cards already print.
              cpkLatest={cpkMonths[0] ? monthShort(cpkMonths[0]).replace(' ', '-') : ''}
              maintenanceCount={maintenanceReports.length}
              maintenanceLatest={maintenanceReports[0]?.title ?? ''}
              toolingCount={toolingReports.length}
              toolingLatest={toolingReports[0]?.title ?? ''}
              purchaseCount={purchaseReports.length}
              purchaseLatest={purchaseReports[0]?.title ?? ''}
              onOpen={go}
            />
          )}

          {/* ---------- MAINTENANCE REPORT ---------- */}
          {view === 'maintenancereport' && (
            <MaintenanceReportView
              title="Maintenance Report"
              reports={maintenanceReports}
              activeDate={maintenanceDate}
              todayISO={todayISO()}
              onOpenUpload={() => setShowMaintenanceUpload(true)}
              onClearDate={() => setMaintenanceDate('')}
            />
          )}

          {/* ---------- TOOLING REPORT ---------- */}
          {view === 'toolingreport' && (
            <MaintenanceReportView
              title="Tooling Report"
              totalKpiLabel="Total Tooling Records"
              icon={<Hammer size={32} />}
              accentGrad="linear-gradient(150deg,#7c3aed,#a855f7 55%,#c084fc)"
              reports={toolingReports as unknown as MaintenanceReportRecord[]}
              activeDate={toolingDate}
              todayISO={todayISO()}
              onOpenUpload={() => setShowToolingUpload(true)}
              onClearDate={() => setToolingDate('')}
            />
          )}

          {/* ---------- PURCHASE REPORT ---------- */}
          {view === 'purchasereport' && (
            <MaintenanceReportView
              title="Purchase Report"
              totalKpiLabel="Total Purchase Orders"
              icon={<ShoppingCart size={32} />}
              accentGrad="linear-gradient(150deg,#059669,#10b981 55%,#34d399)"
              reports={purchaseReports as unknown as MaintenanceReportRecord[]}
              activeDate={purchaseDate}
              todayISO={todayISO()}
              onOpenUpload={() => setShowPurchaseUpload(true)}
              onClearDate={() => setPurchaseDate('')}
            />
          )}

          {/* ---------- ROUTE CARD (one workbook per month, printed as it was written) ---------- */}
          {view === 'routecard' && (
            <>
              {routeCardPreview ? (
                <div className="bento bento-pad flex items-center gap-3 flex-wrap bg-amber-50/60 border border-amber-200">
                  <TriangleAlert size={18} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-[160px] text-sm text-slate-700">
                    <b>Unsaved preview</b> for {routeCardPreview.title} · {routeCardPreview.fileName} — click <b>Save</b> to store it.
                  </div>
                  <button
                    onClick={saveRouteCardNow}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm"
                  >
                    <Save size={15} /> Save
                  </button>
                </div>
              ) : (
                routeCardSavedNote && (
                  <div className="bento bento-pad flex items-center gap-2.5 flex-wrap">
                    <CalendarDays size={16} className="text-indigo-500 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-600">✓ {routeCardSavedNote}</span>
                  </div>
                )
              )}
              {shownRouteCard ? (
                <RouteCardView card={shownRouteCard} todayISO={todayISO()} />
              ) : (
                <div className="bento bento-pad text-center py-16">
                  <div
                    className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4"
                    style={{ background: 'linear-gradient(150deg,#0d9488,#0ea5e9 55%,#4f46e5)' }}
                  >
                    <Route size={30} />
                  </div>
                  <div className="text-lg font-bold text-slate-700">No Route Card yet</div>
                  <div className="text-sm text-slate-400 mt-1 mb-5">Upload the month's route card workbook, then Save.</div>
                  {can.canUpdate && (
                    <button
                      onClick={() => setShowRouteCardUpload(true)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 shadow-sm"
                    >
                      <UploadCloud size={18} /> Upload Excel
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ---------- MONTHLY PLANNING (one Plan Confirmation sheet per month) ---------- */}
          {view === 'monthlyplan' && (
            <>
              {shownMonthlyPlan ? (
                <>
                  {monthlyPlanPreview ? (
                    <div className="bento bento-pad flex items-center gap-3 flex-wrap bg-amber-50/60 border border-amber-200">
                      <TriangleAlert size={18} className="text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-[160px] text-sm text-slate-700">
                        <b>Unsaved preview</b> for {monthlyPlanPreview.title} · {monthlyPlanPreview.fileName} — click <b>Save</b> to store it.
                      </div>
                      <button onClick={saveMonthlyPlanNow} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm">
                        <Save size={15} /> Save
                      </button>
                    </div>
                  ) : (
                    monthlyPlanSavedNote && (
                      <div className="bento bento-pad flex items-center gap-2.5 flex-wrap">
                        <CalendarDays size={16} className="text-indigo-500 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-600">✓ {monthlyPlanSavedNote}</span>
                      </div>
                    )
                  )}
                  <MonthlyPlanningView plan={shownMonthlyPlan} actuals={monthlyPlanActuals} todayISO={todayISO()} />
                </>
              ) : (
                <div className="bento bento-pad text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4" style={{ background: 'linear-gradient(150deg,#4f46e5,#7c3aed 55%,#db2777)' }}>
                    <CalendarRange size={30} />
                  </div>
                  <div className="text-lg font-bold text-slate-700">No Monthly Plan yet</div>
                  <div className="text-sm text-slate-400 mt-1 mb-5">Upload the month's Plan Confirmation Sheet, then Save.</div>
                  <button
                    onClick={() => setShowMonthlyPlanUpload(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 shadow-sm transition"
                  >
                    <UploadCloud size={18} /> Upload Excel
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---------- ASSEMBLY (Excel upload → production setup dashboard) ---------- */}
          {view === 'assembly' && (
            <>
              {shownAssemblyReport ? (
                <>
                  {assemblyPreview ? (
                    <div className="bento bento-pad flex items-center gap-3 flex-wrap bg-amber-50/60 border border-amber-200">
                      <TriangleAlert size={18} className="text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-[160px] text-sm text-slate-700">
                        <b>Unsaved preview</b> for {new Date(assemblyPreview.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {assemblyPreview.fileName} — click <b>Save</b> to store it.
                      </div>
                      <button onClick={saveAssemblyMeeting} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 shadow-sm">
                        <Save size={15} /> Save
                      </button>
                    </div>
                  ) : assemblyRange ? (
                    <div className="bento bento-pad flex items-center gap-3 flex-wrap">
                      <div className="w-9 h-9 rounded-xl grid place-items-center grad-violet text-white shrink-0">
                        <CalendarRange size={18} />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-bold text-slate-800">
                          Combined view · {new Date(assemblyRange.from + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} –{' '}
                          {new Date(assemblyRange.to + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </div>
                        <div className="text-xs text-slate-500">
                          Quantities summed across the range · {assemblyRangeRecords.length} saved report{assemblyRangeRecords.length !== 1 ? 's' : ''}:{' '}
                          {assemblyRangeRecords.map((r) => new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })).join(', ')}
                          {assemblyRangeRecords.length === 1 && ' — upload & Save other days to include them here.'}
                        </div>
                      </div>
                      <button
                        onClick={() => setAssemblyRange(null)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[var(--hairline)] text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 shrink-0"
                      >
                        Back to single day
                      </button>
                    </div>
                  ) : (
                    <div className="bento bento-pad flex items-center gap-2.5 flex-wrap">
                      <CalendarDays size={16} className="text-indigo-500 shrink-0" />
                      <span className="text-sm font-semibold text-slate-700">
                        {new Date(shownAssemblyReport.date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-xs text-slate-400 truncate">{shownAssemblyReport.fileName}</span>
                      {assemblySavedNote && <span className="text-xs font-semibold text-emerald-600">✓ {assemblySavedNote}</span>}
                    </div>
                  )}
                  <AssemblyDashboard report={shownAssemblyReport} dateGroups={assemblyRange && !assemblyPreview ? assemblyDateGroups : undefined} only={loopRunning ? loopStep?.section.id : undefined} />
                </>
              ) : (
                <div className="bento bento-pad text-center py-16">
                  <div className="w-16 h-16 mx-auto rounded-2xl grid place-items-center text-white shadow-sm mb-4" style={{ background: 'linear-gradient(150deg,#4f46e5,#7c3aed 55%,#db2777)' }}>
                    <Boxes size={30} />
                  </div>
                  <div className="text-lg font-bold text-slate-700">
                    {assemblyRange ? 'No Assembly reports in this range' : activeAssemblyDate ? 'No Assembly report for this date' : 'No Assembly report yet'}
                  </div>
                  <div className="text-sm text-slate-400 mt-1 mb-5">
                    {assemblyRange ? 'Pick a range that overlaps saved report dates.' : 'Upload the Assembly Production Report Excel, pick its date, then Save.'}
                  </div>
                  {assemblyRange && (
                    <button onClick={() => setAssemblyRange(null)} className="inline-flex items-center gap-2 rounded-xl bg-white border border-[var(--hairline)] text-slate-700 font-semibold px-4 py-2.5 hover:bg-slate-50 transition mb-2">
                      Back to single day
                    </button>
                  )}
                  <button
                    onClick={() => setShowAssemblyUpload(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 shadow-sm transition"
                  >
                    <UploadCloud size={18} /> Upload Excel
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---------- USER HISTORY (admin only) ---------- */}
          {view === 'userhistory' && <UserHistoryPage me={user.username} isAdmin={isAdmin} onBackup={() => go('backup')} />}
          {view === 'backup' && <BackupView onBack={() => go('userhistory')} />}
          {view === 'notifications' && <NotificationCentre onAction={handleNotifAction} />}

          {/* ---------- MEETING / UPLOAD / ACTIVITY HISTORY ---------- */}
          {view === 'history' && (
            <ActivityHub
              tab={historyTab}
              setTab={setHistoryTab}
              unit={unit}
              canEdit={canEdit}
              notesCount={notes.length}
              onOpenNotes={() => setView('notes')}
              // Meetings
              meetings={history}
              onOpenMeeting={openMeeting}
              onDeleteMeeting={canEdit ? deleteMeeting : undefined}
              // Uploads
              uploads={uploads}
              effectiveDate={effectiveDate}
              onViewUpload={setUploadDetail}
              onOpenDashboardDate={openDateOnDashboard}
              onDeleteUploadDate={canEdit ? deleteDateHandler : undefined}
              availableDatesCount={availableDates.length}
              // Daily Plan vs Ach
              planVsAch={planVsAch}
              onDeletePlanVsAch={canEdit ? deletePlanVsAchRec : undefined}
              // Monthly Planning
              monthlyPlans={monthlyPlans}
              onOpenMonthlyPlan={(m) => {
                setMonthlyPlanPreview(null)
                setMonthlyPlanMonth(m)
                go('monthlyplan')
              }}
              onDeleteMonthlyPlan={canEdit ? deleteMonthlyPlanRec : undefined}
              // Route Cards
              routeCards={routeCards}
              onOpenRouteCard={(m) => {
                setRouteCardPreview(null)
                setRouteCardMonth(m)
                go('routecard')
              }}
              onDeleteRouteCard={canEdit ? deleteRouteCardRec : undefined}
              // CP-CPK
              cpk={cpk}
              onOpenCpk={() => go('cpk')}
              onDeleteCpk={canEdit ? (id) => void removeCpk(id) : undefined}
              // Maintenance Reports
              maintenanceReports={maintenanceReports}
              onOpenMaintenance={(dateOrMonth) => {
                setMaintenanceDate(dateOrMonth)
                go('maintenancereport')
              }}
              onDeleteMaintenance={canEdit ? (id) => void handleDeleteMaintenanceReport(id) : undefined}
              // Tooling Reports
              toolingReports={toolingReports}
              onOpenTooling={(dateOrMonth) => {
                setToolingDate(dateOrMonth)
                go('toolingreport')
              }}
              onDeleteTooling={canEdit ? (id) => void handleDeleteToolingReport(id) : undefined}
              // Purchase Reports
              purchaseReports={purchaseReports}
              onOpenPurchase={(dateOrMonth) => {
                setPurchaseDate(dateOrMonth)
                go('purchasereport')
              }}
              onDeletePurchase={canEdit ? (id) => void handleDeletePurchaseReport(id) : undefined}
              // Assembly
              assembly={assembly}
              onOpenAssembly={(date) => {
                setAssemblyPreview(null)
                setAssemblyDate(date)
                go('assembly')
              }}
              onDeleteAssembly={canEdit ? (id) => {
                if (confirm('Delete this Assembly report?')) deleteAssemblyDate(id)
              } : undefined}
            />
          )}

          {/* ---------- EFFICIENCY ---------- */}
          {view === 'efficiency' && (
            <SectionCard
              title="Efficiency by Machine"
              subtitle={withTarget("Gradient area with the 75% target line; dots coloured by band")}
              icon={<Gauge size={18} />}
            >
              {emptyShiftBanner ?? (
                <ShiftSplit
                  enabled={hasBoth}
                  single={<EfficiencyChart rows={chartRows} />}
                  first={<EfficiencyChart rows={s1.chartRows} />}
                  second={<EfficiencyChart rows={s2.chartRows} />}
                />
              )}
            </SectionCard>
          )}

          {/* ---------- DOWNTIME ---------- */}
          {view === 'downtime' && (
            <>
              <SectionCard
                title="Downtime by Category"
                subtitle="Reason-wise · Operator (green) · Maintenance (red) · Management (violet)"
                icon={<Timer size={18} />}
              >
                <ShiftSplit
                  enabled={hasBoth}
                  single={<DowntimeCategoryChart data={downtime} />}
                  first={<DowntimeCategoryChart data={s1.downtime} />}
                  second={<DowntimeCategoryChart data={s2.downtime} />}
                />
              </SectionCard>
              <SectionCard title="Downtime Remarks" subtitle="Operator remarks by machine" icon={<Info size={18} />}>
                <RemarkList remarks={remarks} />
              </SectionCard>
            </>
          )}
          </>
          )}
        </div>
      </main>

      <MobileNav view={view} setView={go} onMore={() => setNavOpen(true)} />

      {showSave && (
        <SaveMeetingModal
          defaultDate={todayISO()}
          defaultShift={shiftLabel(shift)}
          onCancel={() => setShowSave(false)}
          onSave={doSaveMeeting}
        />
      )}

      {showAssemblyUpload && (
        <AssemblyUploadModal onClose={() => setShowAssemblyUpload(false)} onUpload={uploadAssembly} busy={assemblyBusy} />
      )}

      {showMonthlyPlanUpload && (
        <MonthlyPlanUploadModal onClose={() => setShowMonthlyPlanUpload(false)} onUpload={uploadMonthlyPlan} busy={monthlyPlanBusy} />
      )}

      {showUploadChoice && (
        <UploadChoiceModal
          onClose={() => setShowUploadChoice(false)}
          onMorningMeeting={() => {
            setShowUploadChoice(false)
            setShowImport(true)
          }}
          onPlanVsAch={() => {
            setShowUploadChoice(false)
            setPvaError('')
            setShowPvaUpload(true)
          }}
        />
      )}

      {showPvaUpload && (
        <PlanVsAchUploadModal
          date={pvaDate}
          onDate={setPvaDate}
          onUpload={uploadPlanVsAch}
          busy={pvaBusy}
          error={pvaError}
          onClose={() => setShowPvaUpload(false)}
        />
      )}

      {showRouteCardUpload && (
        <RouteCardUploadModal onClose={() => setShowRouteCardUpload(false)} onUpload={uploadRouteCard} busy={routeCardBusy} />
      )}

      {showMaintenanceUpload && (
        <MaintenanceReportUploadModal onClose={() => setShowMaintenanceUpload(false)} onUpload={uploadMaintenanceReport} busy={maintenanceBusy} />
      )}

      {showToolingUpload && (
        <MaintenanceReportUploadModal
          title="Upload Tooling Report"
          description="Every sheet in the tooling workbook will be read & stored."
          icon={<Hammer size={18} />}
          accentGrad="linear-gradient(150deg,#7c3aed,#a855f7 55%,#c084fc)"
          onClose={() => setShowToolingUpload(false)}
          onUpload={uploadToolingReport}
          busy={toolingBusy}
        />
      )}

      {showPurchaseUpload && (
        <MaintenanceReportUploadModal
          title="Upload Purchase Report"
          description="Every sheet in the purchase workbook will be read & stored."
          icon={<ShoppingCart size={18} />}
          accentGrad="linear-gradient(150deg,#059669,#10b981 55%,#34d399)"
          onClose={() => setShowPurchaseUpload(false)}
          onUpload={uploadPurchaseReport}
          busy={purchaseBusy}
        />
      )}

      {showImport && (
        <ImportModal
          pending={pending}
          saving={uploadSaving}
          saveError={uploadSaveError}
          activeDate={effectiveDate}
          activeMachines={rows.length}
          activeName={meta.fileName}
          onAdd={stageImport}
          onRemove={removePending}
          onSetShift={setPendingShift}
          onConvert={convertToDashboard}
          onClose={() => setShowImport(false)}
          shifts={shiftsOn}
          splitUpload={!oneUploadPerDay(unit)}
        />
      )}

      {showAddNote && (
        <AddNoteModal
          defaultDate={todayISO()}
          onCancel={() => setShowAddNote(false)}
          onSave={doSaveNote}
        />
      )}

      {breakdown && <KpiBreakdownModal data={breakdown} onClose={() => setBreakdown(null)} />}

      {machineDetail && (
        <MachineDetailModal row={machineDetail} cpk={cpkEnabled ? cpk : []} onClose={() => setMachineDetail(null)} />
      )}

      {compareMc && compareDays.length > 0 && (
        <MachineCompareModal
          mc={compareMc}
          days={compareDays}
          cpk={cpkEnabled ? cpk : []}
          onClose={() => setCompareMc(null)}
        />
      )}

      {machineRange && dateRange && (
        <MachineRangeModal
          mc={machineRange}
          range={dateRange}
          rowsForDate={rowsForDate}
          dates={availableDates.filter((d) => d >= dateRange.from && d <= dateRange.to).slice().sort()}
          onClose={() => setMachineRange(null)}
        />
      )}

      {uploadDetail && (
        <UploadDetailModal
          upload={uploadDetail}
          onClose={() => setUploadDetail(null)}
          onOpenDashboard={() => openDateOnDashboard(uploadDetail.uploadDate)}
        />
      )}

    </div>
  )
}

function RemarkList({ remarks }: { remarks: { remark: string; machines: string[] }[] }) {
  if (remarks.length === 0) {
    return <div className="text-sm text-slate-400 py-6 text-center">No remarks recorded.</div>
  }
  return (
    <div className="flex flex-col gap-2">
      {remarks.map((r) => (
        <div
          key={r.remark}
          className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] px-3 py-2"
        >
          <span className="text-sm font-medium text-slate-700 flex-1">{r.remark}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            {r.machines.map((m) => (
              <span key={m} className="text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-md px-1.5 py-0.5">
                {m}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
