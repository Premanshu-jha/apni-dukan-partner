import { useEffect, useRef, useState } from 'react'
import { Banner, Button } from '../../components/ui'

/**
 * The phone's back camera reading barcodes on packs. Chrome on Android reads them itself (BarcodeDetector); other
 * browsers (iPhone Safari) use the ZXing library, loaded only then. The digits can always be typed instead (a pack that
 * won't scan, a phone with no camera or the camera refused). The same code seen again within 2 seconds counts once, so
 * holding a pack in front of the camera adds it once; scanning it again after that adds another.
 */
export function Scanner({ onCode, paused = false }: { onCode: (code: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'on' | 'denied' | 'none'>('starting')
  const [typed, setTyped] = useState('')
  const last = useRef<{ code: string; at: number } | null>(null)
  const handler = useRef(onCode)
  const pausedRef = useRef(paused)
  useEffect(() => {
    handler.current = onCode
    pausedRef.current = paused
  }, [onCode, paused])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('none')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (e) {
        if (!stopped) setState((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'none')
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const v = video.current
      if (!v) return
      v.srcObject = stream
      await v.play().catch(() => undefined)
      let read: Read
      try {
        read = await reader()
      } catch {
        // The reader didn't load (offline on first use, an old phone): stop the camera, typing still works
        stream.getTracks().forEach((t) => t.stop())
        if (!stopped) setState('none')
        return
      }
      if (stopped) return
      setState('on')
      const tick = async () => {
        if (stopped) return
        if (!pausedRef.current && v.readyState >= 2) {
          const code = await read(v).catch(() => null)
          if (code) {
            const now = Date.now()
            const seen = last.current
            if (!seen || seen.code !== code || now - seen.at > 2000) {
              last.current = { code, at: now }
              navigator.vibrate?.(60)
              handler.current(code)
            } else {
              last.current = { code, at: now }
            }
          }
        }
        timer = setTimeout(() => void tick(), 200)
      }
      void tick()
    }
    void start()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function submitTyped() {
    const code = typed.replace(/\s+/g, '')
    if (!code) return
    setTyped('')
    handler.current(code)
  }

  return (
    <div className="flex flex-col gap-3">
      {state !== 'denied' && state !== 'none' && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
          <video ref={video} className="h-full w-full object-cover" muted playsInline aria-label="Camera: hold the barcode inside the box" />
          <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/3 bottom-1/3 rounded-lg border-2 border-brand/80" />
          {state === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting the camera…</p>}
        </div>
      )}
      {state === 'denied' && (
        <Banner tone="warn">
          The camera is blocked for this app. Allow it in the browser's site settings (the lock next to the address), or
          type the barcode's digits below.
        </Banner>
      )}
      {state === 'none' && <Banner tone="info">This phone's camera can't be used here. Type the barcode's digits below.</Banner>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submitTyped()
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="typed-barcode" className="text-sm text-muted">
            Or type the digits under the barcode
          </label>
          <input
            id="typed-barcode"
            inputMode="numeric"
            autoComplete="off"
            value={typed}
            maxLength={32}
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-ink focus:border-brand focus:outline-none"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!typed.trim()}>
          Use
        </Button>
      </form>
    </div>
  )
}

type Read = (v: HTMLVideoElement) => Promise<string | null>

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

/** The fastest reader this browser has: its own BarcodeDetector, else ZXing on a canvas copy of the frame. */
async function reader(): Promise<Read> {
  const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
  if (Native) {
    try {
      const d = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] })
      return async (v) => (await d.detect(v))[0]?.rawValue ?? null
    } catch {
      /* formats not supported: ZXing below */
    }
  }
  const z = await import('@zxing/library')
  const hints = new Map()
  hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [
    z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E,
    z.BarcodeFormat.CODE_128, z.BarcodeFormat.CODE_39, z.BarcodeFormat.ITF,
  ])
  hints.set(z.DecodeHintType.TRY_HARDER, true)
  const decoder = new z.MultiFormatReader()
  decoder.setHints(hints)
  const canvas = document.createElement('canvas')
  return async (v) => {
    // A smaller copy reads as well and much faster on a slow phone
    const scale = Math.min(1, 640 / (v.videoWidth || 640))
    canvas.width = Math.round((v.videoWidth || 640) * scale)
    canvas.height = Math.round((v.videoHeight || 480) * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    try {
      const source = new z.HTMLCanvasElementLuminanceSource(canvas)
      return decoder.decodeWithState(new z.BinaryBitmap(new z.HybridBinarizer(source))).getText()
    } catch {
      return null
    } finally {
      decoder.reset()
    }
  }
}
