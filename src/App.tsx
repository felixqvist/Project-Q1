import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  analyzeFrontAndSide,
  warmModels,
  type AnalysisResult,
  type CaptureAngle,
} from './lib/faceAnalysis'
import { LOOKSMAX_STATS, PSL_TIERS } from './data/stats'
import Onboarding from './components/Onboarding'
import OverallResults from './components/OverallResults'
import {
  EMPTY_ANSWERS,
  type OnboardingAnswers,
} from './data/onboarding'
import './App.css'

type Page = 'scan' | 'stats' | 'account' | 'profile' | 'faq' | 'about'
type ScanStep = 'onboarding' | 'front' | 'side' | 'analyzing' | 'result'

const ANALYZE_QUOTE =
  "You didn't choose your genetics, but you chose to be here — which means you're already ahead of 97% of people."

type Profile = { name: string; email: string }

const PROFILE_KEY = 'spejl-profile'
const ONBOARD_KEY = 'spejl-onboard-v2'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load'))
    img.src = src
  })
}

function revokeIfBlob(url: string | null) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
}

export default function App() {
  const [page, setPage] = useState<Page>('scan')
  const [step, setStep] = useState<ScanStep>('onboarding')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [sideUrl, setSideUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      return raw ? (JSON.parse(raw) as Profile) : null
    } catch {
      return null
    }
  })
  const [accountForm, setAccountForm] = useState({ name: '', email: '', password: '' })
  const [menuOpen, setMenuOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
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
        setStatus('Ready')
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load face model. Reload the page.')
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
    void video.play().catch(() => setError('Could not start camera preview.'))
  }, [cameraOn, step, facingMode])

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

  function go(pageName: Page) {
    setMenuOpen(false)
    void stopCamera()
    setPage(pageName)
  }

  function finishOnboarding(next: OnboardingAnswers) {
    setAnswers(next)
    localStorage.setItem(ONBOARD_KEY, JSON.stringify(next))
    if (next.name.trim()) {
      const p = { name: next.name.trim(), email: profile?.email ?? '' }
      setProfile(p)
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
    }
    setPage('scan')
    void startCameraFor('front')
  }

  async function startCameraFor(angle: CaptureAngle, mode: 'user' | 'environment' = facingMode) {
    setPage('scan')
    setError(null)
    setResult(null)
    setStep(angle)
    setStatus(angle === 'front' ? 'Opening camera…' : 'Opening side camera…')
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setFacingMode(mode)
      setCameraOn(true)
      setStatus(angle === 'front' ? 'Align front' : 'Align side')
    } catch {
      setCameraOn(false)
      setError('Camera denied — use Upload instead.')
      setStatus('')
    }
  }

  function openUpload(angle: CaptureAngle) {
    setError(null)
    uploadTargetRef.current = angle
    setPage('scan')
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
    const angle = uploadTargetRef.current
    const url = URL.createObjectURL(file)
    if (angle === 'front') {
      setFront(url)
      setStep('side')
      setStatus('Front saved — take side profile')
      await startCameraFor('side')
    } else {
      setSide(url)
      setStatus('Analyzing…')
      if (frontUrlRef.current) await runCombined(frontUrlRef.current, url)
      else {
        setError('Front photo missing')
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
    if (angle === 'front') {
      setFront(url)
      setStatus('Front captured')
      await startCameraFor('side')
    } else {
      setSide(url)
      setStatus('Analyzing…')
      if (frontUrlRef.current) await runCombined(frontUrlRef.current, url)
      else {
        setError('Front photo missing')
        setStep('front')
      }
    }
  }

  function tweenProgress(from: number, to: number, ms: number) {
    return new Promise<void>((resolve) => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        const eased = 1 - (1 - t) ** 3
        setAnalyzeProgress(Math.round(from + (to - from) * eased))
        if (t < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  async function runCombined(frontSrc: string, sideSrc: string) {
    if (!ready) {
      setError('Model is not ready yet.')
      return
    }
    setBusy(true)
    setError(null)
    setAnalyzeProgress(0)
    setStep('analyzing')
    setStatus('Scanning…')

    const analysis = (async () => {
      const [frontImg, sideImg] = await Promise.all([loadImage(frontSrc), loadImage(sideSrc)])
      return analyzeFrontAndSide(frontImg, sideImg)
    })()

    try {
      const minSpin = tweenProgress(0, 88, 4200)
      const scored = await analysis
      await minSpin
      await tweenProgress(88, 100, 700)
      setResult(scored)
      setStep('result')
      setStatus('Scan complete')
    } catch (err) {
      setResult(null)
      setAnalyzeProgress(0)
      if (err instanceof Error && err.message === 'NO_FACE_FRONT') {
        setError('No face in front photo.')
        setStep('front')
      } else if (err instanceof Error && err.message === 'NO_FACE_SIDE') {
        setError('No face in side photo.')
        setStep('side')
      } else {
        setError('Analysis failed. Try again.')
        setStep('side')
      }
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function resetScan() {
    await stopCamera()
    setResult(null)
    setError(null)
    setFront(null)
    setSide(null)
    setStep('onboarding')
    setPage('scan')
    setStatus(ready ? 'Ready' : 'Loading…')
  }

  function saveAccount(e: FormEvent) {
    e.preventDefault()
    if (!accountForm.name.trim() || !accountForm.email.trim()) {
      setError('Fill name and email.')
      return
    }
    const next = { name: accountForm.name.trim(), email: accountForm.email.trim() }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    setProfile(next)
    setAccountForm({ name: '', email: '', password: '' })
    setError(null)
    setPage('profile')
  }

  function logout() {
    localStorage.removeItem(PROFILE_KEY)
    setProfile(null)
    setPage('account')
  }

  const activeAngle: CaptureAngle = step === 'side' ? 'side' : 'front'
  const hideChrome =
    page === 'scan' &&
    (step === 'onboarding' || step === 'analyzing' || step === 'front' || step === 'side' || step === 'result')
  const showChrome = !hideChrome

  return (
    <div
      className={`app${page === 'scan' && step === 'onboarding' ? ' landing-mode' : ''}${
        page === 'scan' && step === 'analyzing' ? ' analyze-mode' : ''
      }${page === 'scan' && (step === 'front' || step === 'side' || step === 'result') ? ' scan-dark' : ''}`}
    >
      {showChrome ? (
        <header className="nav">
          <button type="button" className="brand" onClick={() => void resetScan()}>
            AI PSL <span className="brand-scan">Scan</span>
          </button>
          <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
            <button
              type="button"
              className={page === 'scan' ? 'active' : ''}
              onClick={() => {
                go('scan')
                if (step === 'onboarding') return
                setStep('front')
              }}
            >
              Scan
            </button>
            <button type="button" className={page === 'stats' ? 'active' : ''} onClick={() => go('stats')}>
              Stats
            </button>
            <button type="button" className={page === 'faq' ? 'active' : ''} onClick={() => go('faq')}>
              FAQ
            </button>
            <button type="button" className={page === 'about' ? 'active' : ''} onClick={() => go('about')}>
              About us
            </button>
            <button
              type="button"
              className={`ghost ${page === 'account' ? 'active' : ''}`}
              onClick={() => go('account')}
            >
              Opret konto
            </button>
            <button
              type="button"
              className={`primary ${page === 'profile' ? 'active' : ''}`}
              onClick={() => go('profile')}
            >
              Profil
            </button>
          </nav>
          <button type="button" className="menu-toggle" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
            ☰
          </button>
        </header>
      ) : null}

      <main className={`main${page === 'scan' && step === 'onboarding' ? ' main-landing' : ''}`}>
        {page === 'scan' && step === 'onboarding' ? (
          <Onboarding ready={ready} onComplete={finishOnboarding} />
        ) : null}

        {page === 'scan' && (step === 'front' || step === 'side') ? (
          <section className="psl-scan">
            <h1>AI PSL Scan</h1>
            <div className="psl-trust">
              <p>
                <span aria-hidden="true">🔒</span> Your privacy is our priority
              </p>
              <p>
                <span aria-hidden="true">✓</span> 10,000+ PSL ratings completed
              </p>
            </div>
            <p className="psl-instruction">
              {activeAngle === 'front'
                ? 'Face forward, neutral expression, good lighting'
                : 'Side profile, show jawline and facial structure'}
            </p>
            <div
              className={`psl-viewport ${activeAngle}${busy ? ' scanning' : ''}${
                cameraOn || (activeAngle === 'front' ? frontUrl : sideUrl) ? ' live' : ''
              }`}
            >
              {/* Reference pose only when camera is not live */}
              {!cameraOn && !(activeAngle === 'front' ? frontUrl : sideUrl) ? (
                <img
                  className="psl-guide"
                  src={activeAngle === 'front' ? '/guides/front-guide.jpg' : '/guides/side-guide.jpg'}
                  alt=""
                  draggable={false}
                />
              ) : null}
              {cameraOn ? (
                <video
                  ref={videoRef}
                  className={`psl-live${facingMode === 'user' ? ' mirror' : ''}`}
                  playsInline
                  muted
                  autoPlay
                />
              ) : activeAngle === 'front' && frontUrl ? (
                <img className="psl-live" src={frontUrl} alt="Front capture" />
              ) : activeAngle === 'side' && sideUrl ? (
                <img className="psl-live" src={sideUrl} alt="Side capture" />
              ) : null}
              <div className="psl-face-guide" aria-hidden="true">
                {activeAngle === 'front' ? (
                  <div className="psl-face-oval" />
                ) : (
                  <div className="psl-face-profile" />
                )}
              </div>
              <div className="psl-angle-chip">{activeAngle === 'front' ? 'FRONT' : 'SIDE'}</div>
              <div className="psl-guide-hint">
                {activeAngle === 'front'
                  ? 'Align face inside the oval'
                  : 'Align profile inside the outline'}
              </div>
            </div>
            <div className="psl-dots" aria-hidden="true">
              <i className={activeAngle === 'front' ? 'on' : ''} />
              <i className={activeAngle === 'side' ? 'on' : ''} />
            </div>
            <button
              type="button"
              className="btn-take"
              disabled={busy || !ready}
              onClick={() => {
                if (cameraOn) void captureFromCamera()
                else void startCameraFor(activeAngle)
              }}
            >
              <span className="cam-ico" aria-hidden="true" />
              Take Picture
            </button>
            <button
              type="button"
              className="psl-upload-link"
              onClick={() => openUpload(activeAngle)}
              disabled={!ready || busy}
            >
              Upload instead
            </button>
            <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
          </section>
        ) : null}

        {page === 'scan' && step === 'analyzing' ? (
          <section className="analyze-screen" aria-live="polite">
            <p className="analyze-name">{answers.name.trim() || 'You'}</p>
            <p className="analyze-quote">{ANALYZE_QUOTE}</p>
            <div className="analyze-meter" aria-label={`Analyzing ${analyzeProgress} percent`}>
              <strong>{analyzeProgress}</strong>
              <span>/ 100</span>
            </div>
            <div className="analyze-bar">
              <i style={{ width: `${analyzeProgress}%` }} />
            </div>
            <p className="analyze-caption">Reading front + side structure…</p>
          </section>
        ) : null}

        {page === 'scan' && step === 'result' && result ? (
          <OverallResults
            result={result}
            answers={answers}
            frontUrl={frontUrl}
            sideUrl={sideUrl}
            onRescan={() => void resetScan()}
          />
        ) : null}

        {page === 'stats' ? (
          <section className="content-shell">
            <p className="eyebrow">TIKTOK · GOOGLE · PSL</p>
            <h1>Looksmaxing stats</h1>
            <div className="stats-grid">
              {LOOKSMAX_STATS.map((stat) => (
                <article key={stat.label} className="stat-card">
                  <strong>{stat.value}</strong>
                  <span>{stat.label}</span>
                  <p>{stat.detail}</p>
                  <small>{stat.source}</small>
                </article>
              ))}
            </div>
            <div className="tier-strip">
              {PSL_TIERS.map((tier) => (
                <article key={tier.range}>
                  <b>{tier.range}</b>
                  <div>
                    <strong>{tier.name}</strong>
                    <span>{tier.note}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {page === 'account' ? (
          <section className="content-shell">
            <p className="eyebrow">ACCOUNT</p>
            <h1>Opret konto</h1>
            <form className="form" onSubmit={saveAccount}>
              <label>
                Navn
                <input
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Dit navn"
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="dig@mail.dk"
                />
              </label>
              <label>
                Adgangskode
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Demo only"
                />
              </label>
              <button type="submit" className="btn-blue wide">
                Opret konto
              </button>
            </form>
          </section>
        ) : null}

        {page === 'profile' ? (
          <section className="content-shell">
            <p className="eyebrow">PROFILE</p>
            <h1>Profil</h1>
            {profile?.name || answers.name ? (
              <>
                <div className="profile-card">
                  <div className="avatar">
                    {(profile?.name || answers.name).slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong>{profile?.name || answers.name}</strong>
                    <span>{profile?.email || answers.looksmaxPlan || 'AI PSL Scan user'}</span>
                  </div>
                </div>
                <button type="button" className="btn-blue wide" onClick={() => void startCameraFor('front')}>
                  Start scan
                </button>
                <button type="button" className="btn-dark wide" onClick={logout}>
                  Log ud
                </button>
              </>
            ) : (
              <button type="button" className="btn-blue wide" onClick={() => go('account')}>
                Opret konto
              </button>
            )}
          </section>
        ) : null}

        {page === 'faq' ? (
          <section className="content-shell">
            <p className="eyebrow">HELP</p>
            <h1>FAQ</h1>
            <div className="faq-list">
              <details open>
                <summary>Why so many questions?</summary>
                <p>They personalize your plan, lock hardmaxing to 18+, and set your PSL reference look.</p>
              </details>
              <details>
                <summary>Are my photos uploaded?</summary>
                <p>No. Face analysis runs locally in your browser on localhost.</p>
              </details>
            </div>
          </section>
        ) : null}

        {page === 'about' ? (
          <section className="content-shell">
            <p className="eyebrow">AI PSL SCAN</p>
            <h1>About us</h1>
            <p className="lede">
              Modern looksmax scanner: cinematic intro, PSL context, profile intake, then front +
              side scoring — fully local.
            </p>
          </section>
        ) : null}
      </main>

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
