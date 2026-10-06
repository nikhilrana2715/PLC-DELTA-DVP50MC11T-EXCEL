import type { AccessMap } from './access'

export interface AuthUser {
  username: string
  fullName: string
  email: string
  phone: string
  employeeId: string
  role: 'user' | 'admin' | 'qa'
  /** What this account may do in each workspace, already resolved by the server. */
  access?: AccessMap
}

const TOKEN_KEY = 'mm.auth.token'

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}
export function setToken(t: string) {
  try {
    localStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* ignore */
  }
}
export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Headers that identify the signed-in user (so the server can log who did what). */
export function authHeaders(json = true): Record<string, string> {
  const t = getToken()
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(t ? { Authorization: 'Bearer ' + t } : {}),
  }
}

async function post<T = Record<string, unknown>>(url: string, body: unknown, auth = false): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + getToken() } : {}),
    },
    body: JSON.stringify(body),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error((j.error as string) || 'Something went wrong. Please try again.')
  return j as T
}

/** Authenticator setup returned when starting an ADMIN registration. */
export interface TotpSetup {
  ok: boolean
  secret: string
  otpauthUrl: string
}
/** Result of sending an email OTP (devOtp is only set when no mail server is configured). */
export interface EmailOtpResult {
  ok: boolean
  sent: boolean
  devOtp?: string
}
export interface ForgotVerifyResult extends EmailOtpResult {
  method: 'email' | 'totp'
}
export interface AuthResult {
  ok: boolean
  token: string
  user: AuthUser
}

export interface RegisterInput {
  fullName: string
  username: string
  password: string
  email: string
  phone: string
  otp: string
  employeeId?: string
}

export const authApi = {
  /** Step 1: mail a 6-digit OTP to the address the user entered. */
  registerOtp: (d: { username: string; email: string }) => post<EmailOtpResult>('/api/auth/register/emailotp', d),
  /** Step 2: confirm with the OTP from the email. */
  register: (d: RegisterInput) => post<AuthResult>('/api/auth/register', d),
  login: (d: { username: string; password: string }) => post<AuthResult>('/api/auth/login', d),
  forgotVerify: (d: { username: string; email: string }) => post<ForgotVerifyResult>('/api/auth/forgot/verify', d),
  reset: (d: { username: string; otp: string; password: string }) => post('/api/auth/reset', d),
  changePassword: (d: { currentPassword: string; newPassword: string }) =>
    post('/api/auth/change-password', d, true),
  /** Update name/phone/employee ID immediately (no OTP needed for these). */
  updateProfile: (d: { fullName?: string; phone?: string; employeeId?: string }) =>
    post<{ ok: boolean; user: AuthUser }>('/api/auth/profile', d, true),
  /** Email change step 1: OTP is mailed to the NEW address, proving ownership. */
  emailChangeOtp: (d: { newEmail: string }) => post<EmailOtpResult>('/api/auth/profile/email-otp', d, true),
  /** Email change step 2: confirm the OTP to switch the email over. */
  emailChangeConfirm: (d: { newEmail: string; otp: string }) =>
    post<{ ok: boolean; user: AuthUser }>('/api/auth/profile/email-confirm', d, true),
  async logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() } })
    } catch {
      /* ignore */
    }
    clearToken()
  },
  async me(): Promise<AuthUser | null> {
    const token = getToken()
    if (!token) return null
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      if (!r.ok) return null
      const j = (await r.json()) as { user: AuthUser }
      return j.user
    } catch {
      return null
    }
  },
  /** 'ok' = valid, 'revoked' = signed out elsewhere (401), 'error' = network hiccup. */
  async checkSession(): Promise<'ok' | 'revoked' | 'error'> {
    const token = getToken()
    if (!token) return 'revoked'
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
      if (r.status === 401) return 'revoked'
      return r.ok ? 'ok' : 'error'
    } catch {
      return 'error'
    }
  },
}

// ---- Admin: User History ----
export interface HistoryUser {
  username: string
  fullName: string
  role: 'user' | 'admin' | 'qa'
  email: string
  phone: string
  employeeId: string
  createdAt: number
  disabled: boolean
  access: AccessMap
  /** False while the account has never been given an explicit map — it predates access
   *  control and still holds everything until an admin sets it. */
  accessSet: boolean
}
export interface HistoryEvent {
  id: string
  at: number
  type: 'login' | 'logout' | 'import' | 'meeting' | 'delete' | 'note' | 'cpk' | 'cumulative' | 'access'
  username: string
  role: 'user' | 'admin' | 'qa'
  detail: string
}

// ---- Admin: a separate login door. The token it returns IS the app session. ----
/** How much disk one part of the data takes, straight off the filesystem. */
export interface StorageGroup {
  key: string
  label: string
  bytes: number
  count: number
  unit?: string
  /** Rebuildable data (previews, LibreOffice profile) — safe to delete, not user content. */
  cache?: boolean
  /** Still being measured in the background (node_modules takes a while to walk). */
  pending?: boolean
  detail?: { label: string; bytes: number; count?: number }[]
}
/** One file a user actually put into the app. */
export interface StorageFile {
  kind: 'sheet' | 'attachment'
  name: string
  date: string
  bytes: number
  shift?: string
  rows?: number
}
export interface StorageReport {
  totalBytes: number
  totalFiles: number
  attachmentFiles: number
  groups: StorageGroup[]
  /** The application itself, separate from the data it holds. */
  app: { totalBytes: number; pending: boolean; groups: StorageGroup[] }
  files: StorageFile[]
  generatedAt: number
}

export const adminApi = {
  async history(): Promise<{ users: HistoryUser[]; events: HistoryEvent[] } | null> {
    try {
      const r = await fetch('/api/admin/history', { headers: authHeaders(false) })
      if (!r.ok) return null
      return (await r.json()) as { users: HistoryUser[]; events: HistoryEvent[] }
    } catch {
      return null
    }
  },
  /** Disk usage per data group — what an admin needs before cleaning anything. */
  async storage(): Promise<StorageReport | null> {
    try {
      const r = await fetch('/api/admin/storage', { headers: authHeaders(false) })
      if (!r.ok) return null
      return (await r.json()) as StorageReport
    } catch {
      return null
    }
  },
  /** Turn a user's login access on/off. */
  setEnabled: (username: string, enabled: boolean) =>
    post(`/api/admin/users/${encodeURIComponent(username)}/enabled`, { enabled }, true),
  /** Set what one user may do in each workspace. */
  async setAccess(username: string, access: AccessMap) {
    const r = await fetch(`/api/admin/users/${encodeURIComponent(username)}/access`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ access }),
    })
    const j = (await r.json().catch(() => ({}))) as { error?: string; access?: AccessMap }
    if (!r.ok) throw new Error(j.error || 'Could not save access.')
    return j.access as AccessMap
  },
  /** Remove an account for good (also clears its history). */
  async removeUser(username: string) {
    const r = await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: authHeaders(false),
    })
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    if (!r.ok) throw new Error(j.error || 'Could not remove the account.')
    return j
  },
  exists: () =>
    fetch('/api/auth/admin/exists')
      .then((r) => r.json())
      .then((j: { exists: boolean }) => j.exists)
      .catch(() => true),
  registerTotp: (d: { username: string; email: string }) => post<TotpSetup>('/api/auth/register/totp', d),
  register: (d: RegisterInput) => post<AuthResult>('/api/auth/admin/register', d),
  /** Admin sign-in is 2FA: password + email + a live Authenticator code. */
  login: (d: { username: string; password: string; email: string; otp: string }) =>
    post<AuthResult>('/api/auth/admin/login', d),
}

// ---- QA: a separate login door. Same username+password flow as users, role 'qa'.
// Registration reuses the shared email-OTP step (authApi.registerOtp). ----
export const qaApi = {
  register: (d: RegisterInput) => post<AuthResult>('/api/auth/qa/register', d),
  login: (d: { username: string; password: string }) => post<AuthResult>('/api/auth/qa/login', d),
}
