import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  analyzeFrontAndSide,
  warmModels,
  yawHint,
  type AnalysisResult,
  type CaptureAngle,
  type ScoreFactor,
} from './lib/faceAnalysis'
import './App.css'

type Page = 'scan' | 'account' | 'profile' | 'faq' | 'about'
type ScanStep = 'home' | 'front' | 'side' | 'result' | 'flaws'

type Profile = {
  name: string
  email: string
}

const PROFILE_KEY = 'spejl-profile'

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

function scoreTo100(score: number): number {
  return Math.round(clamp(score * 10, 1, 100))
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function meterTone(score100: number): 'good' | 'mid' | 'low' {
  if (score100 >= 75) return 'good'
  if (score100 >= 60) return 'mid'
  return 'low'
}

function tierLabel(overall10: number): string {
  if (overall10 >= 8.5) return 'Excellent'
  if (overall10 >= 7.5) return 'Above average'
  if (overall10 >= 6) return 'Average'
  return 'Developing'
}

function potentialFrom(result: AnalysisResult): number {
  const best = Math.max(...result.factors.map((f) => f.score))
  return scoreTo100(clamp((result.overall + best) / 2 + 0.4, 1, 10))
}

function severity(score100: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score100 < 65) return 'HIGH'
  if (score100 < 75) return 'MEDIUM'
  return 'LOW'
}

function fixFor(factor: ScoreFactor): string {
  switch (factor.key) {
    case 'jawline':
      return 'Sideprofil og nakkeholdning kan fremhæve kæbelinjen. Prøv bedre sidelys.'
    case 'symmetry':
      return 'Ret hovedet frontalt og fordel lyset jævnt på begge sider af ansigtet.'
    case 'eyeBalance':
      return 'Kig lige ind i linsen med afslappede øjne og blødt frontlys.'
    case 'proportions':
      return 'Hold lidt afstand til kameraet, så hele ansigtet er skarpt i billedet.'
    case 'profile':
      return 'Drej til ren 90° profil med hagen i niveau og en rolig baggrund.'
    case 'presence':
      return 'Slap af i kæben, hold stillingen stabil, og undgå skarpt sidelys.'
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
  const [step, setStep] = useState<ScanStep>('home')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('Indlæser model…')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [frontUrl, setFrontUrl] = useState<string | null>(null)
  const [sideUrl, setSideUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
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
        setStatus('Klar til scan')
      })
      .catch(() => {
        if (cancelled) return
        setError('Kunne ikke indlæse ansigtsmodellen. Genindlæs siden.')
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
    void video.play().catch(() => setError('Kunne ikke starte kamerapreview.'))
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

  async function startCameraFor(angle: CaptureAngle, mode: 'user' | 'environment' = facingMode) {
    setPage('scan')
    setError(null)
    setHint(null)
    setResult(null)
    setStep(angle)
    setStatus(angle === 'front' ? 'Åbner kamera…' : 'Åbner sidekamera…')

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
      setError('Kamera nægtet — brug Upload i stedet.')
      setStatus('')
    }
  }

  function go(pageName: Page) {
    setMenuOpen(false)
    void stopCamera()
    setPage(pageName)
    if (pageName === 'scan' && step === 'flaws') setStep('result')
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
      setStatus('Front gemt — tag sideprofil')
      await startCameraFor('side')
    } else {
      setSide(url)
      setStatus('Analyserer…')
      if (frontUrlRef.current) await runCombined(frontUrlRef.current, url)
      else {
        setError('Mangler frontfoto')
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
      setStatus('Front fanget')
      await startCameraFor('side')
    } else {
      setSide(url)
      setStatus('Analyserer…')
      if (frontUrlRef.current) await runCombined(frontUrlRef.current, url)
      else {
        setError('Mangler frontfoto')
        setStep('front')
      }
    }
  }

  async function flipCamera() {
    const next = facingMode === 'user' ? 'environment' : 'user'
    const angle: CaptureAngle = step === 'side' ? 'side' : 'front'
    await startCameraFor(angle, next)
  }

  async function useSamples() {
    await stopCamera()
    setPage('scan')
    setResult(null)
    setError(null)
    setFront('/sample-front.jpg')
    setSide('/sample-side.jpg')
    setStep('side')
    setStatus('Kører eksempel…')
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
    setStatus('Scanner front + side…')
    try {
      const [frontImg, sideImg] = await Promise.all([loadImage(frontSrc), loadImage(sideSrc)])
      const scored = await analyzeFrontAndSide(frontImg, sideImg)
      setResult(scored)
      setStep('result')
      setStatus('Scan færdig')
      const frontHint = yawHint(scored.front.yaw, 'front')
      const sideHint = yawHint(scored.side.yaw, 'side')
      setHint([frontHint, sideHint].filter(Boolean).join(' ') || null)
    } catch (err) {
      setResult(null)
      if (err instanceof Error && err.message === 'NO_FACE_FRONT') {
        setError('Ingen ansigt i frontfotoet.')
        setStep('front')
      } else if (err instanceof Error && err.message === 'NO_FACE_SIDE') {
        setError('Ingen ansigt i sidefotoet.')
        setStep('side')
      } else {
        setError('Analysen fejlede. Prøv igen.')
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
    setStep('home')
    setPage('scan')
    setStatus(ready ? 'Klar til scan' : 'Indlæser model…')
  }

  function saveAccount(e: FormEvent) {
    e.preventDefault()
    if (!accountForm.name.trim() || !accountForm.email.trim()) {
      setError('Udfyld navn og e-mail.')
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
    overall100 >= 75 ? 'var(--lime)' : overall100 >= 60 ? 'var(--orange)' : 'var(--red)'

  return (
    <div className="app">
      <header className="nav">
        <button type="button" className="brand" onClick={() => void resetScan()}>
          SPE<span>JL</span>
        </button>
        <nav className={`nav-links${menuOpen ? ' open' : ''}`}>
          <button type="button" className={page === 'scan' ? 'active' : ''} onClick={() => go('scan')}>
            Scan
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
            className={`lime ${page === 'profile' ? 'active' : ''}`}
            onClick={() => go('profile')}
          >
            Profil
          </button>
        </nav>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ☰
        </button>
      </header>

      <main className="main">
        {page === 'scan' && step === 'home' ? (
          <section className="phone-shell home">
            <p className="eyebrow">LOOKSMAX FACE SCANNER</p>
            <h1>Scan dit look</h1>
            <p className="lede">
              Tag front og side. SPEJL analyserer lokalt og giver dig score, flaws og fixes.
            </p>
            <div className="home-cards">
              <article>
                <strong>1. Front</strong>
                <span>Kig lige ind i kameraet</span>
              </article>
              <article>
                <strong>2. Side</strong>
                <span>Drej 90° til højre</span>
              </article>
            </div>
            <button type="button" className="btn-lime wide" disabled={!ready || busy} onClick={() => void startCameraFor('front')}>
              Start scan
            </button>
            <div className="home-actions">
              <button type="button" className="btn-dark" disabled={!ready || busy} onClick={() => openUpload('front')}>
                Upload
              </button>
              <button type="button" className="btn-dark" disabled={!ready || busy} onClick={() => void useSamples()}>
                Prøv eksempel
              </button>
            </div>
            <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
          </section>
        ) : null}

        {page === 'scan' && (step === 'front' || step === 'side') ? (
          <section className="phone-shell capture">
            <div className="progress">
              <i className={step === 'front' || frontUrl ? 'on' : ''} />
              <i className={step === 'side' || sideUrl ? 'on' : ''} />
            </div>
            <h1>{activeAngle === 'front' ? 'Front profile' : 'Side profile'}</h1>
            <p className="lede">
              {activeAngle === 'front'
                ? 'Look straight into the camera, hair pulled back, relaxed face.'
                : 'Turn 90° to the right and keep your chin level.'}
            </p>

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
              <div className="guide" aria-hidden="true">
                {activeAngle === 'front' ? <div className="oval" /> : <div className="profile-guide" />}
              </div>
              <div className="corners" aria-hidden="true" />
              <div className="align-pill">Align your face inside the outline</div>
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
                aria-label="Tag billede"
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

            <div className="capture-extra">
              <button type="button" className="linkish" onClick={() => void resetScan()}>
                Annuller
              </button>
              {!cameraOn ? (
                <button type="button" className="linkish" onClick={() => void startCameraFor(activeAngle)} disabled={!ready}>
                  Åbn kamera
                </button>
              ) : null}
            </div>
            <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
          </section>
        ) : null}

        {page === 'scan' && step === 'result' && result ? (
          <section className="phone-shell results">
            <p className="eyebrow">YOUR SCAN</p>
            <h1>Results</h1>

            <div className="score-row">
              <div
                className="score-ring"
                style={{
                  background: `conic-gradient(${ringColor} ${overall100 * 3.6}deg, #222 0deg)`,
                }}
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
                  <strong className="lime-text">{potentialFrom(result)}</strong>
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

            <button type="button" className="btn-lime wide" onClick={() => setStep('flaws')}>
              See flaws and fixes
            </button>
            <button type="button" className="btn-dark wide" onClick={() => void resetScan()}>
              Ny scan
            </button>
            <p className="disclaimer">AI estimate. Not a measure of your worth.</p>
          </section>
        ) : null}

        {page === 'scan' && step === 'flaws' && result ? (
          <section className="phone-shell flaws">
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
            <div className="upsell">
              <strong>Flere metrics + glow-up plan</strong>
              <span>Opret konto for at gemme dine scans lokalt.</span>
              <button type="button" className="btn-lime wide" onClick={() => go('account')}>
                Opret konto
              </button>
            </div>
            <button type="button" className="btn-dark wide" onClick={() => setStep('result')}>
              Tilbage til results
            </button>
            <p className="disclaimer">AI estimate. Not a measure of your worth.</p>
          </section>
        ) : null}

        {page === 'account' ? (
          <section className="content-shell">
            <p className="eyebrow">ACCOUNT</p>
            <h1>Opret konto</h1>
            <p className="lede">Gem profil lokalt i browseren — ingen server, ingen betalt API.</p>
            <form className="form" onSubmit={saveAccount}>
              <label>
                Navn
                <input
                  value={accountForm.name}
                  onChange={(e) => setAccountForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Dit navn"
                  autoComplete="name"
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm((s) => ({ ...s, email: e.target.value }))}
                  placeholder="dig@mail.dk"
                  autoComplete="email"
                />
              </label>
              <label>
                Adgangskode
                <input
                  type="password"
                  value={accountForm.password}
                  onChange={(e) => setAccountForm((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Kun til demo-UI"
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" className="btn-lime wide">
                Opret konto
              </button>
            </form>
            {profile ? (
              <p className="status">Konto fundet — gå til Profil for at se den.</p>
            ) : null}
            {error && page === 'account' ? <p className="status error">{error}</p> : null}
          </section>
        ) : null}

        {page === 'profile' ? (
          <section className="content-shell">
            <p className="eyebrow">PROFILE</p>
            <h1>Profil</h1>
            {profile ? (
              <>
                <div className="profile-card">
                  <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{profile.name}</strong>
                    <span>{profile.email}</span>
                  </div>
                </div>
                <div className="profile-stats">
                  <article>
                    <span>Seneste score</span>
                    <strong>{result ? scoreTo100(result.overall) : '—'}</strong>
                  </article>
                  <article>
                    <span>Scans</span>
                    <strong>{result ? 1 : 0}</strong>
                  </article>
                </div>
                <button type="button" className="btn-lime wide" onClick={() => go('scan')}>
                  Start ny scan
                </button>
                <button type="button" className="btn-dark wide" onClick={logout}>
                  Log ud
                </button>
              </>
            ) : (
              <>
                <p className="lede">Du har endnu ingen lokal konto.</p>
                <button type="button" className="btn-lime wide" onClick={() => go('account')}>
                  Opret konto
                </button>
              </>
            )}
          </section>
        ) : null}

        {page === 'faq' ? (
          <section className="content-shell">
            <p className="eyebrow">HELP</p>
            <h1>FAQ</h1>
            <div className="faq-list">
              <details open>
                <summary>Hvordan virker scoren?</summary>
                <p>
                  SPEJL finder ansigtspunkter lokalt med MediaPipe. Front vægter symmetri,
                  proportioner og øjne. Side vægter profilsilhuet og kæbelinje. Samlet score er
                  1–10 (vist som 0–100 i results).
                </p>
              </details>
              <details>
                <summary>Skal jeg bruge kamera?</summary>
                <p>Kamera er foretrukket, men du kan uploade front- og sidefotos som fallback.</p>
              </details>
              <details>
                <summary>Sendes mine billeder til en server?</summary>
                <p>Nej. Analysen kører i browseren på localhost. Konto gemmes kun i localStorage.</p>
              </details>
              <details>
                <summary>Er det et videnskabeligt skønhedsmål?</summary>
                <p>
                  Nej. Det er en transparent demo-heuristik til looksmax-feedback — ikke et mål for
                  din værdi.
                </p>
              </details>
            </div>
          </section>
        ) : null}

        {page === 'about' ? (
          <section className="content-shell">
            <p className="eyebrow">SPEJL</p>
            <h1>About us</h1>
            <p className="lede">
              SPEJL er en lokal Looksmax Face Scanner bygget til hurtig front + side analyse uden
              betalte API’er.
            </p>
            <div className="about-grid">
              <article>
                <strong>Lokal først</strong>
                <span>Modeller og scoring kører i din browser på localhost.</span>
              </article>
              <article>
                <strong>To vinkler</strong>
                <span>Front og side kombineres til én score med konstruktive fixes.</span>
              </article>
              <article>
                <strong>Ærlig tone</strong>
                <span>Feedback er direkte, men ikke ond — fokus på forbedringer.</span>
              </article>
            </div>
            <button type="button" className="btn-lime wide" onClick={() => go('scan')}>
              Start scan
            </button>
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
