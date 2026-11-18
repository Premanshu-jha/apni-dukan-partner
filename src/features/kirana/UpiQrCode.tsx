import { useEffect, useState } from 'react'
import type { UpiQr } from '../../api/kirana'
import { rupees } from '../../lib/money'

/**
 * The UPI QR for a bill: drawn on this phone from the backend's upi:// link (the qrcode library is loaded only when a
 * QR is shown), with the amount and the payee in words under it, for the customer to scan with any UPI app.
 */
export function UpiQrCode({ upi }: { upi: UpiQr }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setSrc(null)
    setFailed(false)
    import('qrcode')
      .then((q) => q.toDataURL(upi.uri, { errorCorrectionLevel: 'M', margin: 2, width: 560 }))
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [upi.uri])
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="flex aspect-square w-full max-w-72 items-center justify-center rounded-2xl bg-white p-2">
        {src ? (
          <img src={src} alt={`UPI QR to pay ${rupees(upi.amountPaise)} to ${upi.payeeName}`} className="h-full w-full" />
        ) : (
          <span className="text-sm text-black/60">{failed ? "Couldn't draw the QR. Ask them to pay to the UPI ID below." : 'Drawing the QR…'}</span>
        )}
      </div>
      <figcaption className="text-center">
        <p className="text-2xl font-bold">{rupees(upi.amountPaise)}</p>
        <p className="text-sm text-muted break-all">
          To {upi.payeeName} · {upi.upiId}
        </p>
      </figcaption>
    </figure>
  )
}
