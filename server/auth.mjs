import crypto from 'crypto'
import { genSecret, verifyTotp, otpauthUrl } from './totp.mjs'
import { DEFAULT_NEW_ACCESS, accessOf } from './access.mjs'
import { sendOtpMail } from './mailer.mjs'

/**
 * Auth: users + sessions as JSON, scrypt-hashed passwords (no external deps).
 * The one-time code comes from an Authenticator app (TOTP, RFC 6238) — the phone
 * generates it offline, so there is no SMS gateway and nothing to pay for.
 *
 * Two separate doors (chosen for security):
 *   /api/auth/login        → normal users only  (admin accounts are rejected)
 *   /api/auth/admin/login  → admin accounts only
 * A user's role lives on the user record, so the session role is always accurate.
 */
export function setupAuth(app, _DATA_DIR, audit = { log: () => {} }, database) {
  const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
    salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex')
  const verifyPw = (pw, stored) => {
    try {
      const [salt, h] = String(stored).split(':')
      const cand = crypto.scryptSync(String(pw), salt, 64).toString('hex')
      return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(cand, 'hex'))
    } catch {
      return false
    }
  }
  const genToken = () => crypto.randomBytes(24).toString('hex')
  const cleanPhone = (p) => String(p).replace(/\D/g, '')
  const publicUser = (u) => ({
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    employeeId: u.employeeId || '',
    role: u.role || 'user',
    disabled: !!u.disabled,
    // Resolved, not raw: an admin reads as full access, and so does an account from before
    // access control existed. The client can then gate on this one map alone.
    access: accessOf(u),
  })
  const DISABLED_MSG =
    'This account is currently disabled. Please try again after some time. If the issue continues, please contact the Technical Department.'

  // A user may be signed in on at most 3 devices at once; a 4th login evicts the OLDEST
  // session, so that device is signed out and the three newest keep working. Every login
  // door — user, QA and admin — goes through createSession(), so this one number governs
  // all three roles.
  const MAX_SESSIONS = 3
  const createSession = (username) => {
    const token = genToken()
    database.transaction(() => {
      database.saveSession(token, { username, at: Date.now() })
      database.deleteOldestSessions(username, MAX_SESSIONS)
    })()
    return token
  }
  const createSessionWithAudit = (username, entry) => database.transaction(() => {
    const token = createSession(username)
    audit.logStrict(entry)
    return token
  })()
  const tokenOf = (req) => (req.headers.authorization || '').replace('Bearer ', '')
  const userOf = (req) => {
    const s = database.getSession(tokenOf(req))
    if (!s) return null
    return database.getUser(s.username)
  }

  // Authenticator secrets for ADMIN registrations that haven't completed yet.
  const pending = new Map() // username -> { secret, expires }
  const PENDING_TTL = 10 * 60 * 1000

  // Email OTPs (users register / reset with a code mailed to them).
  const emailOtps = new Map() // key -> { code, expires, email }
  const OTP_TTL = 5 * 60 * 1000
  const genOtp = () => String(Math.floor(100000 + Math.random() * 900000))
  const issueEmailOtp = async (key, email) => {
    const code = genOtp()
    emailOtps.set(key, { code, expires: Date.now() + OTP_TTL, email })
    const sent = await sendOtpMail(email, code)
    // Without an SMTP account the code is returned so the flow stays usable.
    return { sent, devOtp: sent ? undefined : code }
  }
  const checkEmailOtp = (key, otp) => {
    const rec = emailOtps.get(key)
    if (!rec || rec.expires < Date.now()) return 'OTP expired — please request a new one.'
    if (rec.code !== String(otp).trim()) return 'Incorrect OTP. Check your email and try again.'
    return null
  }

  const validNewAccount = (uname, mail) => {
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return 'Username must be 3–20 characters (letters, numbers, _).'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return 'Enter a valid email address.'
    if (database.getUser(uname)) return 'This username is already taken.'
    return null
  }

  // ---- ADMIN registration step 1: get a secret / QR for the Authenticator app ----
  app.post('/api/auth/register/totp', (req, res) => {
    const { username = '', email = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const mail = String(email).trim()
    const bad = validNewAccount(uname, mail)
    if (bad) return res.status(400).json({ error: bad })
    const secret = genSecret()
    pending.set(uname, { secret, expires: Date.now() + PENDING_TTL })
    res.json({ ok: true, secret, otpauthUrl: otpauthUrl({ label: mail, secret }) })
  })

  // ---- USER registration step 1: OTP goes to the email they entered ----
  app.post('/api/auth/register/emailotp', async (req, res) => {
    const { username = '', email = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const mail = String(email).trim()
    const bad = validNewAccount(uname, mail)
    if (bad) return res.status(400).json({ error: bad })
    res.json({ ok: true, email: mail, ...(await issueEmailOtp('reg:' + uname, mail)) })
  })

  const takePending = (uname, otp) => {
    const p = pending.get(uname)
    if (!p || p.expires < Date.now()) return { error: 'Setup expired — start again.' }
    if (!verifyTotp(p.secret, otp)) return { error: 'Incorrect code. Check your Authenticator app and try again.' }
    return { secret: p.secret }
  }

  // ---- Step 2 of registration ----
  // Users verify the OTP mailed to them (min 6-char password, no Authenticator);
  // admins verify their Authenticator app's code (min 10-char password).
  const registerHandler = (role, minPw, verifyOtp) => (req, res) => {
    const { fullName = '', username = '', password = '', email = '', phone = '', otp = '', employeeId = '' } =
      req.body || {}
    const uname = String(username).trim().toLowerCase()
    const v = verifyOtp(uname, otp)
    if (v.error) return res.status(400).json({ error: v.error })
    if (String(password).length < minPw)
      return res.status(400).json({ error: `Password must be at least ${minPw} characters.` })
    if (database.getUser(uname)) return res.status(409).json({ error: 'This username is already taken.' })
    const user = {
      username: uname,
      fullName: String(fullName).trim() || uname,
      email: String(email).trim(),
      phone: cleanPhone(phone),
      employeeId: String(employeeId).trim(),
      role,
      pw: hashPw(password),
      // A new account can look at Unit 1 and nothing else until an admin says otherwise.
      ...(role === 'user' ? { access: { ...DEFAULT_NEW_ACCESS } } : {}),
      ...(v.secret ? { totpSecret: v.secret } : {}),
      createdAt: Date.now(),
    }
    let token
    try {
      database.transaction(() => {
        database.saveUser(user)
        token = createSession(uname)
        audit.logStrict({ type: 'login', username: uname, role, detail: `Registered & signed in (${role})` })
      })()
    } catch {
      return res.status(409).json({ error: 'This username is already taken.' })
    }
    v.cleanup?.()
    res.json({ ok: true, token, user: publicUser(user) })
  }
  app.post(
    '/api/auth/register',
    registerHandler('user', 6, (uname, otp) => {
      const err = checkEmailOtp('reg:' + uname, otp)
      return err ? { error: err } : { cleanup: () => emailOtps.delete('reg:' + uname) }
    }),
  )
  app.post(
    '/api/auth/admin/register',
    registerHandler('admin', 10, (uname, otp) => {
      const p = takePending(uname, otp)
      return p.error ? { error: p.error } : { secret: p.secret, cleanup: () => pending.delete(uname) }
    }),
  )
  // QA accounts register exactly like users (email OTP), but carry the 'qa' role.
  app.post(
    '/api/auth/qa/register',
    registerHandler('qa', 6, (uname, otp) => {
      const err = checkEmailOtp('reg:' + uname, otp)
      return err ? { error: err } : { cleanup: () => emailOtps.delete('reg:' + uname) }
    }),
  )

  // ---- Login: two separate doors ----
  app.post('/api/auth/login', (req, res) => {
    const { username = '', password = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const user = database.getUser(uname)
    if (!user || !verifyPw(password, user.pw)) return res.status(401).json({ error: 'Wrong username or password.' })
    if (user.disabled) return res.status(403).json({ error: DISABLED_MSG })
    if ((user.role || 'user') === 'admin')
      return res.status(403).json({ error: 'This is an admin account — please use the Admin login page.' })
    if ((user.role || 'user') === 'qa')
      return res.status(403).json({ error: 'This is a QA account — please use the QA login page.' })
    try {
      const token = createSessionWithAudit(uname, { type: 'login', username: uname, role: 'user', detail: 'Signed in (user)' })
      res.json({ ok: true, token, user: publicUser(user) })
    } catch {
      res.status(500).json({ error: 'Could not create session. Please try again.' })
    }
  })

  // QA login is a plain username + password door (like users), but only 'qa' accounts.
  app.post('/api/auth/qa/login', (req, res) => {
    const { username = '', password = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const user = database.getUser(uname)
    if (!user || (user.role || 'user') !== 'qa' || !verifyPw(password, user.pw))
      return res.status(401).json({ error: 'Wrong QA username or password.' })
    if (user.disabled) return res.status(403).json({ error: DISABLED_MSG })
    try {
      const token = createSessionWithAudit(uname, { type: 'login', username: uname, role: 'qa', detail: 'Signed in (qa)' })
      res.json({ ok: true, token, user: publicUser(user) })
    } catch {
      res.status(500).json({ error: 'Could not create session. Please try again.' })
    }
  })

  // Admin login is 2-factor: username + password + email + a live Authenticator code.
  app.post('/api/auth/admin/login', (req, res) => {
    const { username = '', password = '', email = '', otp = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const user = database.getUser(uname)
    if (!user || (user.role || 'user') !== 'admin' || !verifyPw(password, user.pw))
      return res.status(401).json({ error: 'Wrong admin username or password.' })
    if (user.disabled) return res.status(403).json({ error: DISABLED_MSG })
    if ((user.email || '').toLowerCase() !== String(email).trim().toLowerCase())
      return res.status(401).json({ error: 'Email does not match this admin account.' })
    if (!verifyTotp(user.totpSecret, otp))
      return res.status(401).json({ error: 'Incorrect Authenticator code. Check your app and try again.' })
    try {
      const token = createSessionWithAudit(uname, { type: 'login', username: uname, role: 'admin', detail: 'Signed in (admin)' })
      res.json({ ok: true, token, user: publicUser(user) })
    } catch {
      res.status(500).json({ error: 'Could not create session. Please try again.' })
    }
  })

  app.get('/api/auth/admin/exists', (_req, res) => {
    res.json({ exists: !!database.handle.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get() })
  })

  // ---- Forgot password. Users get an OTP on their email; admins use their Authenticator. ----
  app.post('/api/auth/forgot/verify', async (req, res) => {
    const { username = '', email = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const user = database.getUser(uname)
    if (!user || (user.email || '').toLowerCase() !== String(email).trim().toLowerCase())
      return res.status(404).json({ error: 'No account matches that username and email.' })
    if (user.totpSecret) return res.json({ ok: true, method: 'totp' })
    res.json({ ok: true, method: 'email', ...(await issueEmailOtp('forgot:' + uname, user.email)) })
  })

  app.post('/api/auth/reset', (req, res) => {
    const { username = '', otp = '', password = '' } = req.body || {}
    const uname = String(username).trim().toLowerCase()
    const user = database.getUser(uname)
    if (!user) return res.status(404).json({ error: 'Account not found.' })
    if (user.totpSecret) {
      if (!verifyTotp(user.totpSecret, otp))
        return res.status(400).json({ error: 'Incorrect code. Check your Authenticator app and try again.' })
    } else {
      const err = checkEmailOtp('forgot:' + uname, otp)
      if (err) return res.status(400).json({ error: err })
      emailOtps.delete('forgot:' + uname)
    }
    const min = (user.role || 'user') === 'admin' ? 10 : 6
    if (String(password).length < min)
      return res.status(400).json({ error: `Password must be at least ${min} characters.` })
    user.pw = hashPw(password)
    database.saveUser(user)
    res.json({ ok: true })
  })

  // ---- Change password (signed in) ----
  app.post('/api/auth/change-password', (req, res) => {
    const user = userOf(req)
    if (!user) return res.status(401).json({ error: 'Not logged in.' })
    const { currentPassword = '', newPassword = '' } = req.body || {}
    if (!verifyPw(currentPassword, user.pw)) return res.status(400).json({ error: 'Current password is incorrect.' })
    const min = (user.role || 'user') === 'admin' ? 10 : 6
    if (String(newPassword).length < min)
      return res.status(400).json({ error: `New password must be at least ${min} characters.` })
    user.pw = hashPw(newPassword)
    database.saveUser(user)
    res.json({ ok: true })
  })

  // ---- Profile: name / phone / employee ID update instantly; email needs an OTP ----
  app.post('/api/auth/profile', (req, res) => {
    const user = userOf(req)
    if (!user) return res.status(401).json({ error: 'Not logged in.' })
    const { fullName, phone, employeeId } = req.body || {}
    const u = user
    if (fullName !== undefined) {
      const name = String(fullName).trim()
      if (!name) return res.status(400).json({ error: 'Full name cannot be empty.' })
      u.fullName = name
    }
    if (phone !== undefined) u.phone = cleanPhone(phone)
    if (employeeId !== undefined) u.employeeId = String(employeeId).trim()
    database.saveUser(u)
    res.json({ ok: true, user: publicUser(u) })
  })

  // Step 1 of an email change: mail an OTP to the NEW address (not the old one —
  // this proves the user actually owns the inbox they're switching to).
  app.post('/api/auth/profile/email-otp', async (req, res) => {
    const user = userOf(req)
    if (!user) return res.status(401).json({ error: 'Not logged in.' })
    const mail = String((req.body || {}).newEmail || '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (mail.toLowerCase() === (user.email || '').toLowerCase())
      return res.status(400).json({ error: 'That is already your current email.' })
    if (database.handle.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?) AND username <> ? LIMIT 1').get(mail, user.username))
      return res.status(409).json({ error: 'Another account already uses that email.' })
    res.json({ ok: true, ...(await issueEmailOtp('emailchange:' + user.username, mail)) })
  })

  // Step 2: confirm the OTP and switch the email over.
  app.post('/api/auth/profile/email-confirm', (req, res) => {
    const user = userOf(req)
    if (!user) return res.status(401).json({ error: 'Not logged in.' })
    const { newEmail = '', otp = '' } = req.body || {}
    const mail = String(newEmail).trim()
    const err = checkEmailOtp('emailchange:' + user.username, otp)
    if (err) return res.status(400).json({ error: err })
    emailOtps.delete('emailchange:' + user.username)
    user.email = mail
    database.saveUser(user)
    res.json({ ok: true, user: publicUser(u) })
  })

  // ---- Session ----
  app.get('/api/auth/me', (req, res) => {
    const user = userOf(req)
    if (!user) return res.status(401).json({ error: 'Not logged in.' })
    res.json({ ok: true, user: publicUser(user) })
  })
  app.post('/api/auth/logout', (req, res) => {
    const who = userOf(req)
    try {
      database.transaction(() => {
        database.deleteSession(tokenOf(req))
        if (who) audit.logStrict({ type: 'logout', username: who.username, role: who.role || 'user', detail: 'Signed out' })
      })()
    } catch {
      return res.status(500).json({ error: 'Could not sign out. Please try again.' })
    }
    res.json({ ok: true })
  })
}
