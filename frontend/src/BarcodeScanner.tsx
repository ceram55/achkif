import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, X } from 'lucide-react'

type Props = { onScan: (value: string) => void; onClose: () => void; error: string }

export default function BarcodeScanner({ onScan, onClose, error }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanCallback = useRef(onScan)
  const [cameraError, setCameraError] = useState('')
  const [manualValue, setManualValue] = useState('')

  scanCallback.current = onScan

  useEffect(() => {
    let active = true
    let stopScanner: (() => void) | undefined

    async function startCamera() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!videoRef.current || !active) return
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && active) {
            active = false
            controls.stop()
            scanCallback.current(result.getText())
          }
        })
        stopScanner = () => controls.stop()
        if (!active) controls.stop()
      } catch (reason) {
        if (active) setCameraError(reason instanceof Error ? reason.message : 'Camera access is unavailable.')
      }
    }

    void startCamera()
    return () => {
      active = false
      stopScanner?.()
    }
  }, [])

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = manualValue.trim()
    if (value) onScan(value)
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal scanner-modal" role="dialog" aria-modal="true" aria-label="Scan product">
      <header className="modal-head"><div><h2>Scan product</h2><p>Use the camera or enter a product reference.</p></div><button className="icon-button" title="Close scanner" onClick={onClose}><X /></button></header>
      <div className="modal-body">
        <div className="scanner-frame"><video ref={videoRef} muted playsInline /><div className="scanner-guide" /></div>
        {cameraError && <div className="notice">{cameraError} Camera access needs your permission and works on localhost or HTTPS.</div>}
        {error && <div className="alert">{error}</div>}
        <form className="scanner-manual" onSubmit={submitManual}><input className="field" aria-label="Product reference" placeholder="Enter reference, e.g. ZL-2045" value={manualValue} onChange={(event) => setManualValue(event.target.value)} required /><button className="button"><Camera /> Find product</button></form>
      </div>
    </section>
  </div>
}