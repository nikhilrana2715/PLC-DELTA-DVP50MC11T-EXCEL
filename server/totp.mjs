import crypto from 'crypto'

// RFC 6238 TOTP — the same scheme Microsoft / Google Authenticator use.
// No SMS gateway, no external service: the phone generates the code offline.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of buf) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const c of clean) {
    const idx = B32.indexOf(c)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A fresh base32 secret to show as a QR code / manual key. */
export function genSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes))
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const h = crypto.createHmac('sha1', secretBuf).update(buf).digest()
  const off = h[h.length - 1] & 0x0f
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff)
  return String(bin % 1000000).padStart(6, '0')
}

/** Verify a 6-digit code; ±`window` 30-second steps absorb clock drift. */
export function verifyTotp(secret, code, window = 1) {
  const c = String(code).replace(/\D/g, '')
  if (c.length !== 6 || !secret) return false
  const buf = base32Decode(secret)
  if (!buf.length) return false
  const step = Math.floor(Date.now() / 1000 / 30)
  for (let i = -window; i <= window; i++) {
    const expect = hotp(buf, step + i)
    if (crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(c))) return true
  }
  return false
}

/** The otpauth:// URI an authenticator app scans. */
export function otpauthUrl({ label, secret, issuer = 'Morning Meeting' }) {
  const i = encodeURIComponent(issuer)
  const l = encodeURIComponent(label)
  return `otpauth://totp/${i}:${l}?secret=${secret}&issuer=${i}&algorithm=SHA1&digits=6&period=30`
}
