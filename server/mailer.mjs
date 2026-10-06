import nodemailer from 'nodemailer'

// Email OTP sender. Configure with env vars (a free Gmail app-password works):
//   GMAIL_USER=yourname@gmail.com  GMAIL_PASS=<16-char app password>
// or any SMTP:  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
let transport = null
let checked = false

function getTransport() {
  if (checked) return transport
  checked = true
  const user = process.env.SMTP_USER || process.env.GMAIL_USER
  const pass = process.env.SMTP_PASS || process.env.GMAIL_PASS
  if (!user || !pass) return null
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: { user, pass },
  })
  return transport
}

/** True when an SMTP account is configured (emails will really be sent). */
export function mailConfigured() {
  return !!getTransport()
}

/** Send the 6-digit OTP; returns false when mail isn't configured / fails. */
export async function sendOtpMail(to, code) {
  const t = getTransport()
  if (!t) return false
  try {
    await t.sendMail({
      from: `"Morning Meeting" <${process.env.SMTP_USER || process.env.GMAIL_USER}>`,
      to,
      subject: `${code} is your Morning Meeting OTP`,
      text: `Your Morning Meeting verification code is ${code}. It is valid for 5 minutes.`,
      html: `<div style="font-family:sans-serif;max-width:420px">
        <h2 style="color:#4f46e5">Morning Meeting</h2>
        <p>Your verification code is:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0f172a">${code}</div>
        <p style="color:#64748b;font-size:13px">Valid for 5 minutes. If you didn't request this, ignore this email.</p>
      </div>`,
    })
    return true
  } catch {
    return false
  }
}
