// Notification model — shared by the in-app centre, the OS notification, and (later) the
// server that pushes them. Keep this file the single source of truth: the service worker
// and the backend contract in docs/NOTIFICATIONS.md both mirror these shapes.

export type Priority = 'low' | 'normal' | 'high' | 'critical'

export type CategoryId =
  | 'system'
  | 'message'
  | 'production'
  | 'machine'
  | 'maintenance'
  | 'quality'
  | 'rework'
  | 'rejection'
  | 'order'
  | 'activity'
  | 'reminder'
  | 'warning'
  | 'critical'

export interface CategoryInfo {
  id: CategoryId
  label: string
  /** Tailwind-free hex so it can also be used in the service worker / inline styles. */
  color: string
  /** Default priority when the sender does not set one. */
  defaultPriority: Priority
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'system', label: 'System Alerts', color: '#64748b', defaultPriority: 'normal' },
  { id: 'message', label: 'Messages', color: '#3b82f6', defaultPriority: 'normal' },
  { id: 'production', label: 'Production Updates', color: '#2a78d6', defaultPriority: 'normal' },
  { id: 'machine', label: 'Machine Alerts', color: '#f97316', defaultPriority: 'high' },
  { id: 'maintenance', label: 'Maintenance', color: '#8b5cf6', defaultPriority: 'normal' },
  { id: 'quality', label: 'Quality', color: '#0ea5e9', defaultPriority: 'high' },
  { id: 'rework', label: 'Rework', color: '#eab308', defaultPriority: 'normal' },
  { id: 'rejection', label: 'Rejection', color: '#ef4444', defaultPriority: 'high' },
  { id: 'order', label: 'Order Updates', color: '#14b8a6', defaultPriority: 'normal' },
  { id: 'activity', label: 'User Activity', color: '#6366f1', defaultPriority: 'low' },
  { id: 'reminder', label: 'Reminders', color: '#a855f7', defaultPriority: 'normal' },
  { id: 'warning', label: 'Warnings', color: '#f59e0b', defaultPriority: 'high' },
  { id: 'critical', label: 'Critical Alerts', color: '#dc2626', defaultPriority: 'critical' },
]

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryInfo>

export const PRIORITIES: { id: Priority; label: string; rank: number; color: string }[] = [
  { id: 'low', label: 'Low', rank: 0, color: '#94a3b8' },
  { id: 'normal', label: 'Normal', rank: 1, color: '#3b82f6' },
  { id: 'high', label: 'High', rank: 2, color: '#f59e0b' },
  { id: 'critical', label: 'Critical', rank: 3, color: '#dc2626' },
]

export const priorityRank = (p: Priority): number => PRIORITIES.find((x) => x.id === p)?.rank ?? 1

/** A button rendered both in the OS notification and in the in-app card. */
export interface NotifAction {
  /** Stable id sent back on click, e.g. 'open' | 'accept' | 'reject' | 'reply'. */
  id: string
  label: string
  /** Where clicking should take the app (hash route). */
  href?: string
  /** Marks the destructive/secondary styling in the in-app card. */
  tone?: 'primary' | 'default' | 'danger'
}

export interface AppNotif {
  /** Stable id. Re-delivering the same id updates instead of duplicating. */
  id: string
  category: CategoryId
  priority: Priority
  title: string
  /** One short line under the title. */
  subtitle?: string
  /** Full text — collapsed in the list, revealed when the card is expanded. */
  body?: string
  /** Epoch ms. */
  at: number
  read: boolean
  /** Optional hero image (rich notification). */
  image?: string
  /** 0-100; renders a progress bar when present. */
  progress?: number
  actions?: NotifAction[]
  /** Where a plain click goes. */
  href?: string
  /** Who/what raised it — shown as the source line. */
  source?: string
  /** Free-form payload the app can use on click. */
  data?: Record<string, unknown>
}

/** What a sender provides; the store fills in the rest. */
export type NotifInput = Omit<AppNotif, 'id' | 'at' | 'read' | 'priority'> & {
  id?: string
  at?: number
  priority?: Priority
}

export const DEFAULT_ACTIONS: Record<string, NotifAction> = {
  open: { id: 'open', label: 'Open', tone: 'primary' },
  view: { id: 'view', label: 'View Details', tone: 'primary' },
  reply: { id: 'reply', label: 'Reply' },
  accept: { id: 'accept', label: 'Accept', tone: 'primary' },
  reject: { id: 'reject', label: 'Reject', tone: 'danger' },
  dismiss: { id: 'dismiss', label: 'Dismiss' },
}
