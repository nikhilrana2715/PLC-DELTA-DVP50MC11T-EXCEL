import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Renders an otpauth:// URI as a QR the Authenticator app can scan. */
export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(''))
    return () => {
      alive = false
    }
  }, [value, size])

  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-slate-100 grid place-items-center text-xs text-slate-400 shrink-0"
      >
        Generating…
      </div>
    )
  }
  return (
    <img
      src={url}
      width={size}
      height={size}
      alt="Scan with your Authenticator app"
      className="rounded-xl bg-white p-1.5 border border-slate-200 shrink-0"
    />
  )
}
