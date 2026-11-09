import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  analyzeFrontAndSide,
  warmModels,
  yawHint,
  type AnalysisResult,
  type CaptureAngle,
  type ScoreFactor,
} from './lib/faceAnalysis'
import { LOOKSMAX_STATS, PSL_TIERS } from './data/stats'
import Onboarding from './components/Onboarding'
import PoseGuide from './components/PoseGuide'
import {
  EMPTY_ANSWERS,
  IDOLS,
  type OnboardingAnswers,
} from './data/onboarding'
import './App.css'

type Page = 'scan' | 'stats' | 'account' | 'profile' | 'faq' | 'about'
type ScanStep = 'onboarding' | 'front' | 'side' | 'analyzing' | 'result' | 'flaws'

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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function scoreTo100(score: number): number {
  return Math.round(clamp(score * 10, 1, 100))
}

function meterTone(score100: number): 'good' | 'mid' | 'low' {
  if (score100 >= 75) return 'good'
  if (score100 >= 60) return 'mid'
  return 'low'
}

function tierLabel(overall10: number): string {
  if (overall10 >= 8.5) return 'Chadlite+'
  if (overall10 >= 7.5) return 'High normie'
  if (overall10 >= 6) return 'Mid normie'
  return 'Developing'
}

function potentialFrom(result: AnalysisResult, answers: OnboardingAnswers): number {
  const best = Math.max(...result.factors.map((f) => f.score))
  let boost = 0.4
  if (answers.preferPsl === 'with') boost += 0.25
  if (answers.looksmaxPlan === 'softmaxing' || answers.looksmaxPlan === 'natural') boost += 0.1
  return scoreTo100(clamp((result.overall + best) / 2 + boost, 1, 10))
}

function severity(score100: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score100 < 65) return 'HIGH'
  if (score100 < 75) return 'MEDIUM'
  return 'LOW'
}

function fixFor(factor: ScoreFactor): string {
  switch (factor.key) {
    case 'jawline':
      return 'Sideprofil, posture og blødt sidelys kan fremhæve kæbelinjen (soft-max først).'
    case 'symmetry':
      return 'Ret hovedet frontalt og fordel lyset jævnt — small asymmetri er normalt.'
    case 'eyeBalance':
      return 'Kig lige i linsen med afslappede øjne. Søvn og hydrering hjælper presence.'
    case 'proportions':
      return 'Hold lidt afstand til kameraet, så hele ansigtet er skarpt i frame.'
    case 'profile':
      return 'Drej til ren 90° profil med hagen i niveau — det er her PSL-sidefeedback bliver tydelig.'
    case 'presence':
      return 'Slap af i kæben, hold stillingen, og undgå skarpt sidelys.'
    default:
      return factor.summary
  }
}

function shortMetricName(factor: ScoreFactor): string {
  switch (factor.key) {
    case 'symmetry':
      return 'Symmetry'
    case 'proportions':
      return 'Proportion'
    case 'eyeBalance':
      return 'Eyes'
    case 'jawline':
      return 'Jawline'
    case 'profile':
      return 'Profile'
    case 'presence':
      return factor.source === 'front' ? 'Front' : 'Side'
    default:
      return factor.label
  }
}

export default function App() {
  const [page, setPage] = useState<Page>('scan')
  const [step, setStep] = useState<ScanStep>('onboarding')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
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

  const metrics = useMemo(() => {
    if (!result) return []
    return result.factors.map((f) => {
      const score100 = scoreTo100(f.score)
      return { ...f, score100, tone: meterTone(score100), short: shortMetricName(f) }
    })
  }, [result])

  const flaws = useMemo(() => {
    return [...metrics]
      .sort((a, b) => a.score100 - b.score100)
      .slice(0, 5)
      .filter((m) => m.score100 < 85)
      .map((m) => ({
        title: m.label,
        score100: m.score100,
        level: severity(m.score100),
        text: fixFor(m),
      }))
  }, [metrics])

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
    setHint(null)
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

  async function flipCamera() {
    const next = facingMode === 'user' ? 'environment' : 'user'
    const angle: CaptureAngle = step === 'side' ? 'side' : 'front'
    await startCameraFor(angle, next)
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
    setHint(null)
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
      const frontHint = yawHint(scored.front.yaw, 'front')
      const sideHint = yawHint(scored.side.yaw, 'side')
      const idol = IDOLS.find((i) => i.id === answers.idol)?.name
      const idolHint = idol ? `Reference look: ${idol}.` : null
      setHint([frontHint, sideHint, idolHint].filter(Boolean).join(' ') || null)
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
    setHint(null)
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
  const overall100 = result ? scoreTo100(result.overall) : 0
  const ringColor =
    overall100 >= 75 ? 'var(--blue)' : overall100 >= 60 ? 'var(--orange)' : 'var(--red)'
  const hideChrome = page === 'scan' && (step === 'onboarding' || step === 'analyzing')
  const showChrome = !hideChrome

  return (
    <div
      className={`app${page === 'scan' && step === 'onboarding' ? ' landing-mode' : ''}${
        page === 'scan' && step === 'analyzing' ? ' analyze-mode' : ''
      }`}
    >
      {showChrome ? (
        <header className="nav">
          <button type="button" className="brand" onClick={() => void resetScan()}>
            SPE<span>JL</span>
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
          <section className="phone-shell">
            <div className="progress two">
              <i className={step === 'front' || frontUrl ? 'on' : ''} />
              <i className={step === 'side' || sideUrl ? 'on' : ''} />
            </div>
            <h1>{activeAngle === 'front' ? 'Front profile' : 'Side profile'}</h1>
            <p className="lede">
              {activeAngle === 'front'
                ? 'Look straight into the camera — hair back, relaxed face.'
                : 'Turn 90° to the right and keep your chin level.'}
            </p>
            {answers.name ? <div className="summary-chips"><span>Hi {answers.name}</span></div> : null}
            <div className={`viewfinder ${activeAngle}${busy ? ' scanning' : ''}`}>
              {cameraOn ? (
                <video ref={videoRef} playsInline muted autoPlay />
              ) : activeAngle === 'front' && frontUrl ? (
                <img src={frontUrl} alt="Front" />
              ) : activeAngle === 'side' && sideUrl ? (
                <img src={sideUrl} alt="Side" />
              ) : (
                <div className="view-empty" />
              )}
              <div className="pose-layer" aria-hidden="true">
                <PoseGuide angle={activeAngle} />
              </div>
              <div className="guide" aria-hidden="true">
                {activeAngle === 'front' ? <div className="oval" /> : <div className="profile-guide" />}
              </div>
              <div className="corners" aria-hidden="true" />
              <div className="align-pill">
                {activeAngle === 'front'
                  ? 'Match the AI guide — face the camera'
                  : 'Match the AI guide — turn to the side'}
              </div>
            </div>
            <div className="hint-row">
              <span>Good light</span>
              <span>No glasses</span>
              <span>Neutral face</span>
            </div>
            <div className="shutter-row">
              <button type="button" className="btn-dark round" onClick={() => openUpload(activeAngle)} disabled={!ready || busy}>
                Upload
              </button>
              <button
                type="button"
                className="shutter"
                aria-label="Take photo"
                disabled={busy || (!cameraOn && !(activeAngle === 'front' ? frontUrl : sideUrl))}
                onClick={() => {
                  if (cameraOn) void captureFromCamera()
                  else void startCameraFor(activeAngle)
                }}
              />
              <button type="button" className="btn-dark round" onClick={() => void flipCamera()} disabled={busy}>
                Flip
              </button>
            </div>
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
          <section className="phone-shell">
            <p className="eyebrow">YOUR SCAN</p>
            <h1>Results</h1>
            <div className="summary-chips">
              {answers.name ? <span>{answers.name}</span> : null}
              {answers.looksmaxPlan ? <span>{answers.looksmaxPlan}</span> : null}
              {answers.preferPsl === 'with' ? <span>With PSL</span> : null}
            </div>
            <div className="score-row">
              <div
                className="score-ring"
                style={{ background: `conic-gradient(${ringColor} ${overall100 * 3.6}deg, #1e293b 0deg)` }}
              >
                <div className="score-core">
                  <strong>{overall100}</strong>
                  <span>OVERALL</span>
                </div>
              </div>
              <div className="tier-box">
                <p>
                  Tier
                  <strong>{tierLabel(result.overall)}</strong>
                </p>
                <p>
                  Potential
                  <strong className="cyan-text">{potentialFrom(result, answers)}</strong>
                </p>
              </div>
            </div>
            {hint ? <p className="hint-banner">{hint}</p> : null}
            <div className="metric-grid">
              {metrics.map((m) => (
                <article key={`${m.key}-${m.source}`} className="metric-card">
                  <div className="metric-top">
                    <span>{m.short}</span>
                    <strong>{m.score100}</strong>
                  </div>
                  <div className="bar">
                    <i className={m.tone} style={{ width: `${m.score100}%` }} />
                  </div>
                </article>
              ))}
            </div>
            <div className="duo-thumbs">
              {frontUrl ? <img src={frontUrl} alt="Front" /> : null}
              {sideUrl ? <img src={sideUrl} alt="Side" /> : null}
            </div>
            <button type="button" className="btn-blue wide" onClick={() => setStep('flaws')}>
              See flaws and fixes
            </button>
            <button type="button" className="btn-dark wide" onClick={() => void resetScan()}>
              New scan
            </button>
            <p className="disclaimer">AI estimate. Not a measure of your worth.</p>
          </section>
        ) : null}

        {page === 'scan' && step === 'flaws' && result ? (
          <section className="phone-shell">
            <p className="eyebrow">{flaws.length} FLAWS FOUND</p>
            <h1>Flaws & fixes</h1>
            <div className="flaw-list">
              {flaws.map((f) => (
                <article key={f.title} className="flaw-card">
                  <div className="flaw-top">
                    <strong>{f.title}</strong>
                    <span className={f.level === 'HIGH' ? 'bad' : f.level === 'MEDIUM' ? 'mid' : 'ok'}>
                      {f.level} · {f.score100}/100
                    </span>
                  </div>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
            <button type="button" className="btn-dark wide" onClick={() => setStep('result')}>
              Back to results
            </button>
            <p className="disclaimer">AI estimate. Not a measure of your worth.</p>
          </section>
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
                    <span>{profile?.email || answers.looksmaxPlan || 'SPEJL user'}</span>
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
            <p className="eyebrow">SPEJL</p>
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
