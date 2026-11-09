import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  analyzeFrontAndSide,
  warmModels,
  yawHint,
  type AnalysisResult,
  type CaptureAngle,
} from './lib/faceAnalysis'
import './App.css'

type Step = 'landing' | 'front' | 'side' | 'result'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load'))
    img.src = src
  })
}

function drawLandmarks(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  landmarks: AnalysisResult['front']['landmarks'],
) {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, width, height)
  if (!landmarks.length) return

  // Sparse BlazeFace keypoints (side fallback)
  if (landmarks.length < 50) {
    ctx.fillStyle = 'rgba(200, 245, 66, 0.95)'
    ctx.strokeStyle = 'rgba(232, 168, 124, 0.85)'
    ctx.lineWidth = 2
    landmarks.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x * width, p.y * height, 4, 0, Math.PI * 2)
      ctx.fill()
    })
    if (landmarks.length >= 2) {
      ctx.beginPath()
      landmarks.forEach((p, i) => {
        const x = p.x * width
        const y = p.y * height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    return
  }

  ctx.fillStyle = 'rgba(200, 245, 66, 0.85)'
  for (let i = 0; i < landmarks.length; i += 4) {
    const p = landmarks[i]
    ctx.beginPath()
    ctx.arc(p.x * width, p.y * height, 1.35, 0, Math.PI * 2)
    ctx.fill()
  }

  const ring = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ]
  ctx.strokeStyle = 'rgba(232, 168, 124, 0.75)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ring.forEach((idx, i) => {
    const p = landmarks[idx]
    if (!p) return
    const x = p.x * width
    const y = p.y * height
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.stroke()
}

function revokeIfBlob(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

export default function App() {
  const [step, setStep] = useState<Step>('landing')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Indlæser ansigtsmodel…')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [sideUrl, setSideUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [cameraOn, setCameraOn] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const frontOverlayRef = useRef<HTMLCanvasElement>(null)
  const sideOverlayRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frontUrlRef = useRef<string | null>(null)
  const sideUrlRef = useRef<string | null>(null)
  const uploadTargetRef = useRef<CaptureAngle>('front')

  useEffect(() => {
    let cancelled = false
    warmModels()
      .then(() => {
        if (cancelled) return
        setReady(true)
        setStatus('Klar — fang front og side for en samlet score.')
      })
      .catch(() => {
        if (cancelled) return
        setError(
          'Kunne ikke indlæse ansigtsmodellen. Tjek netværk til MediaPipe WASM, og genindlæs.',
        )
        setStatus('')
      })
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      revokeIfBlob(frontUrlRef.current)
      revokeIfBlob(sideUrlRef.current)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!cameraOn || !video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => {
      setError('Kunne ikke starte kamerapreview.')
    })
  }, [cameraOn, step])

  useEffect(() => {
    if (!result || !frontUrl || !sideUrl) return
    let cancelled = false
    void (async () => {
      try {
        const [frontImg, sideImg] = await Promise.all([
          loadImage(frontUrl),
          loadImage(sideUrl),
        ])
        if (cancelled) return
        if (frontOverlayRef.current) {
          drawLandmarks(
            frontOverlayRef.current,
            frontImg.naturalWidth,
            frontImg.naturalHeight,
            result.front.landmarks,
          )
        }
        if (sideOverlayRef.current) {
          drawLandmarks(
            sideOverlayRef.current,
            sideImg.naturalWidth,
            sideImg.naturalHeight,
            result.side.landmarks,
          )
        }
      } catch {
        /* preview overlays are optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [result, frontUrl, sideUrl])

  function setFront(url: string | null) {
    revokeIfBlob(frontUrlRef.current)
    frontUrlRef.current = url
    setFrontUrl(url)
  }

  function setSide(url: string | null) {
    revokeIfBlob(sideUrlRef.current)
    sideUrlRef.current = url
    setSideUrl(url)
  }

  async function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  async function startCameraFor(angle: CaptureAngle) {
    setError(null)
    setHint(null)
    setResult(null)
    setStep(angle)
    setStatus(angle === 'front' ? 'Åbner kamera til front…' : 'Åbner kamera til sideprofil…')

    try {
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        streamRef.current = stream
      }
      setCameraOn(true)
      setStatus(
        angle === 'front'
          ? 'Front: kig lige ind i kameraet, og tag billedet.'
          : 'Side: drej hovedet ca. 90°, og tag profilbilledet.',
      )
    } catch {
      setCameraOn(false)
      setError('Kameraadgang blev nægtet. Du kan stadig uploade front- og sidefotos.')
      setStatus('')
    }
  }

  function beginFlow() {
    void startCameraFor('front')
  }

  function openUpload(angle: CaptureAngle) {
    setError(null)
    setHint(null)
    uploadTargetRef.current = angle
    setStep(angle)
    fileRef.current?.click()
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    await stopCamera()
    setResult(null)
    setError(null)
    setHint(null)

    const angle = uploadTargetRef.current
    const url = URL.createObjectURL(file)
    if (angle === 'front') {
      setFront(url)
      setStatus('Frontfoto gemt. Fortsæt med sideprofil.')
      setStep('side')
    } else {
      setSide(url)
      setStatus('Sidefoto gemt. Analyserer front + side…')
      if (frontUrlRef.current) {
        await runCombined(frontUrlRef.current, url)
      } else {
        setError('Mangler stadig et frontfoto.')
        setStep('front')
      }
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current
    if (!video || !cameraOn) return
    const angle: CaptureAngle = step === 'side' ? 'side' : 'front'

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.92)

    await stopCamera()
    setResult(null)
    setError(null)
    setHint(null)

    if (angle === 'front') {
      setFront(url)
      setStatus('Front fanget. Nu sideprofil.')
      await startCameraFor('side')
    } else {
      setSide(url)
      setStatus('Side fanget. Analyserer front + side…')
      if (frontUrlRef.current) {
        await runCombined(frontUrlRef.current, url)
      } else {
        setError('Mangler stadig et frontfoto.')
        setStep('front')
      }
    }
  }

  async function useSamples() {
    await stopCamera()
    setResult(null)
    setError(null)
    setHint(null)
    setFront('/sample-front.jpg')
    setSide('/sample-side.jpg')
    setStep('side')
    setStatus('Indlæser eksempel (front + side)…')
    await runCombined('/sample-front.jpg', '/sample-side.jpg')
  }

  async function runCombined(frontSrc: string, sideSrc: string) {
    if (!ready) {
      setError('Modellen er ikke klar endnu.')
      return
    }
    setBusy(true)
    setError(null)
    setHint(null)
    setStatus('Analyserer front og side sammen…')

    try {
      const [frontImg, sideImg] = await Promise.all([
        loadImage(frontSrc),
        loadImage(sideSrc),
      ])
      const scored = await analyzeFrontAndSide(frontImg, sideImg)
      setResult(scored)
      setStep('result')
      setStatus('Analyse færdig — samlet score fra front + side.')

      const frontHint = yawHint(scored.front.yaw, 'front')
      const sideHint = yawHint(scored.side.yaw, 'side')
      setHint([frontHint, sideHint].filter(Boolean).join(' ') || null)
    } catch (err) {
      setResult(null)
      if (err instanceof Error && err.message === 'NO_FACE_FRONT') {
        setError('Ingen ansigt i frontfotoet. Tag et skarpt, frontalt billede.')
        setStep('front')
      } else if (err instanceof Error && err.message === 'NO_FACE_SIDE') {
        setError('Ingen ansigt i sidefotoet. Tag et tydeligt profilbillede.')
        setStep('side')
      } else {
        setError('Analysen fejlede. Prøv skarpere front- og sidefotos.')
      }
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function resetAll() {
    await stopCamera()
    setResult(null)
    setError(null)
    setHint(null)
    setFront(null)
    setSide(null)
    setStep('landing')
    setStatus(ready ? 'Klar — fang front og side for en samlet score.' : 'Indlæser ansigtsmodel…')
  }

  const activeAngle: CaptureAngle = step === 'side' ? 'side' : 'front'
  const showCapture = step === 'front' || step === 'side'
  const showResult = step === 'result'

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />
      <div className="shell">
        <header className="topbar">
          <div className="brand-mark">
            SPE<span>JL</span>
          </div>
          <div className="pill">Front + side · 1–10</div>
        </header>

        {step === 'landing' ? (
          <section className="hero">
            <div className="hero-copy">
              <h1>
                SPEJL
                <br />
                <em>ser dig</em>
              </h1>
              <p className="lede">
                Tag ét foto forfra og ét fra siden. SPEJL analyserer begge vinkler lokalt
                og giver én samlet score fra 1 til 10 — med konstruktive forklaringer.
              </p>
              <ol className="flow-steps">
                <li>
                  <strong>1. Front</strong>
                  <span>Kig lige ind i kameraet</span>
                </li>
                <li>
                  <strong>2. Side</strong>
                  <span>Drej til ren profil</span>
                </li>
                <li>
                  <strong>3. Score</strong>
                  <span>Samlet 1–10 analyse</span>
                </li>
              </ol>
              <div className="cta-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={beginFlow}
                  disabled={!ready || busy}
                >
                  Start med kamera
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => openUpload('front')}
                  disabled={!ready || busy}
                >
                  Upload front først
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={useSamples}
                  disabled={!ready || busy}
                >
                  Prøv eksempel
                </button>
              </div>
              <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
            </div>

            <div className="hero-stage">
              <div className="duo-preview">
                <div className="stage-frame mini">
                  <div className="stage-empty">
                    <strong>Front</strong>
                    <span>Ansigtsfront</span>
                  </div>
                </div>
                <div className="stage-frame mini">
                  <div className="stage-empty">
                    <strong>Side</strong>
                    <span>Profil</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {showCapture ? (
          <section className="workspace">
            <div className="workspace-header">
              <div>
                <p className="step-kicker">
                  Trin {activeAngle === 'front' ? '1' : '2'} af 2
                </p>
                <h2>{activeAngle === 'front' ? 'Frontfoto' : 'Sideprofil'}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={resetAll}>
                Annuller
              </button>
            </div>

            <div className="progress-track" aria-hidden="true">
              <i className={frontUrl || step !== 'front' ? 'done' : 'active'} />
              <i className={sideUrl || step === 'side' ? (sideUrl ? 'done' : 'active') : ''} />
            </div>

            <div className="panel-grid capture-grid">
              <div className="preview-panel">
                <div className={`stage-frame${busy ? ' is-scanning' : ''}`}>
                  {cameraOn ? (
                    <video ref={videoRef} playsInline muted autoPlay />
                  ) : activeAngle === 'front' && frontUrl ? (
                    <img src={frontUrl} alt="Frontfoto" />
                  ) : activeAngle === 'side' && sideUrl ? (
                    <img src={sideUrl} alt="Sidefoto" />
                  ) : (
                    <div className="stage-empty">
                      <strong>{activeAngle === 'front' ? 'Front' : 'Side'}</strong>
                      <span>
                        {activeAngle === 'front'
                          ? 'Kig lige ind i kameraet, eller upload et frontfoto.'
                          : 'Drej hovedet til siden, eller upload et profilfoto.'}
                      </span>
                    </div>
                  )}
                  <div className="scan-line" />
                  <div className="angle-badge">{activeAngle === 'front' ? 'FRONT' : 'SIDE'}</div>
                </div>

                <div className="controls">
                  {cameraOn ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={captureFromCamera}
                      disabled={busy}
                    >
                      Tag {activeAngle === 'front' ? 'front' : 'side'}billede
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => startCameraFor(activeAngle)}
                      disabled={!ready || busy}
                    >
                      Åbn kamera
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => openUpload(activeAngle)}
                    disabled={!ready || busy}
                  >
                    Upload {activeAngle === 'front' ? 'front' : 'side'}
                  </button>
                  {activeAngle === 'side' && frontUrl ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        void stopCamera()
                        setStep('front')
                        setStatus('Tilbage til frontfoto.')
                      }}
                    >
                      Ret front
                    </button>
                  ) : null}
                </div>
                <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
              </div>

              <aside className="shot-rail">
                <article className={`shot-card${frontUrl ? ' filled' : ''}`}>
                  <p className="shot-label">1 · Front</p>
                  {frontUrl ? (
                    <img src={frontUrl} alt="Gemt front" />
                  ) : (
                    <div className="shot-placeholder">Afventer</div>
                  )}
                </article>
                <article className={`shot-card${sideUrl ? ' filled' : ''}`}>
                  <p className="shot-label">2 · Side</p>
                  {sideUrl ? (
                    <img src={sideUrl} alt="Gemt side" />
                  ) : (
                    <div className="shot-placeholder">Afventer</div>
                  )}
                </article>
                <p className="shot-note">
                  Scoren beregnes først, når både front og side er på plads. Kamera er
                  foretrukket; upload virker som fallback.
                </p>
              </aside>
            </div>
          </section>
        ) : null}

        {showResult && result ? (
          <section className="workspace">
            <div className="workspace-header">
              <h2>Samlet analyse</h2>
              <div className="cta-row">
                <button type="button" className="btn btn-ghost" onClick={resetAll}>
                  Ny analyse
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !frontUrl || !sideUrl}
                  onClick={() => frontUrl && sideUrl && runCombined(frontUrl, sideUrl)}
                >
                  Analyser igen
                </button>
              </div>
            </div>

            <div className="panel-grid result-grid">
              <div className="duo-result">
                <div className="stage-frame">
                  {frontUrl ? <img src={frontUrl} alt="Front til analyse" /> : null}
                  <canvas ref={frontOverlayRef} className="overlay" />
                  <div className="angle-badge">FRONT</div>
                </div>
                <div className="stage-frame">
                  {sideUrl ? <img src={sideUrl} alt="Side til analyse" /> : null}
                  <canvas ref={sideOverlayRef} className="overlay" />
                  <div className="angle-badge">SIDE</div>
                </div>
              </div>

              <div className="result-panel">
                <div className="score-hero">
                  <p className="score-label">Helhedsscore (front + side)</p>
                  <div className="score-value">
                    {result.overall.toFixed(1)}
                    <span>/ 10</span>
                  </div>
                  <p className="score-tip">{result.tip}</p>
                  {hint ? <p className="score-hint">{hint}</p> : null}
                </div>
                <div className="factors">
                  {result.factors.map((factor) => (
                    <article key={`${factor.key}-${factor.source}`} className="factor">
                      <div className="factor-top">
                        <strong>{factor.label}</strong>
                        <span>{factor.score.toFixed(1)}</span>
                      </div>
                      <p>{factor.summary}</p>
                      <div className="meter" aria-hidden="true">
                        <i style={{ width: `${(factor.score / 10) * 100}%` }} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <p className="footnote">
              SPEJL bruger MediaPipe Face Landmarker lokalt i browseren. Frontvægt: symmetri,
              proportioner, øjenbalance og presence. Sidevægt: profilsilhuet, kæbelinje og
              side-presence. Samlet score er en gennemsigtig heuristik — ikke et videnskabeligt
              skønhedsmål.
            </p>
            <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
          </section>
        ) : null}
      </div>

      <input
        ref={fileRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        capture="user"
        onChange={onFileChange}
      />
    </div>
  )
}
