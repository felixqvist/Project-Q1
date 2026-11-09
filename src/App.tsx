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
import { QUIZ_QUESTIONS } from './data/quiz'
import './App.css'

type Page = 'scan' | 'stats' | 'account' | 'profile' | 'faq' | 'about'
type ScanStep = 'home' | 'quiz' | 'front' | 'side' | 'result' | 'flaws'

type Profile = { name: string; email: string }

const PROFILE_KEY = 'spejl-profile'
const QUIZ_KEY = 'spejl-quiz'

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

function potentialFrom(result: AnalysisResult, answers: Record<string, string>): number {
  const best = Math.max(...result.factors.map((f) => f.score))
  let boost = 0.4
  if (answers.sleep === 'great' || answers.sleep === 'good') boost += 0.2
  if (answers.routine === 'both' || answers.routine === 'gym') boost += 0.15
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

function quizLabel(questionId: string, optionId: string): string {
  const q = QUIZ_QUESTIONS.find((item) => item.id === questionId)
  return q?.options.find((o) => o.id === optionId)?.label ?? optionId
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
  const [statIndex, setStatIndex] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(QUIZ_KEY)
      return raw ? (JSON.parse(raw) as Record<string, string>) : {}
    } catch {
      return {}
    }
  })
  const [selected, setSelected] = useState<string | null>(null)
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
        setStatus('Klar — start med statistik')
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

  const quizDone = QUIZ_QUESTIONS.every((q) => answers[q.id])
  const currentQuestion = QUIZ_QUESTIONS[quizIndex]

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

  function startQuiz() {
    setPage('scan')
    setError(null)
    setStep('quiz')
    const firstUnanswered = QUIZ_QUESTIONS.findIndex((q) => !answers[q.id])
    const idx = firstUnanswered === -1 ? 0 : firstUnanswered
    setQuizIndex(idx)
    setSelected(answers[QUIZ_QUESTIONS[idx].id] ?? null)
  }

  function nextStat() {
    if (statIndex < LOOKSMAX_STATS.length - 1) {
      setStatIndex((i) => i + 1)
      return
    }
    startQuiz()
  }

  function prevStat() {
    if (statIndex > 0) setStatIndex((i) => i - 1)
  }

  function commitQuizAnswer(optionId: string) {
    if (!currentQuestion) return
    setSelected(optionId)
    const nextAnswers = { ...answers, [currentQuestion.id]: optionId }
    setAnswers(nextAnswers)
    localStorage.setItem(QUIZ_KEY, JSON.stringify(nextAnswers))

    if (quizIndex < QUIZ_QUESTIONS.length - 1) {
      const nextIdx = quizIndex + 1
      window.setTimeout(() => {
        setQuizIndex(nextIdx)
        setSelected(nextAnswers[QUIZ_QUESTIONS[nextIdx].id] ?? null)
      }, 180)
      return
    }
    setStatus('Quiz færdig — klar til frontfoto')
    window.setTimeout(() => {
      void startCameraFor('front')
    }, 220)
  }

  function nextQuiz() {
    if (!currentQuestion || !selected) return
    commitQuizAnswer(selected)
  }

  function prevQuiz() {
    if (quizIndex === 0) {
      setStatIndex(LOOKSMAX_STATS.length - 1)
      setStep('home')
      return
    }
    const prev = quizIndex - 1
    setQuizIndex(prev)
    setSelected(answers[QUIZ_QUESTIONS[prev].id] ?? null)
  }

  async function startCameraFor(angle: CaptureAngle, mode: 'user' | 'environment' = facingMode) {
    if (!quizDone && angle === 'front' && step !== 'quiz' && Object.keys(answers).length < QUIZ_QUESTIONS.length) {
      // require quiz before first capture unless already completed
    }
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

  function beginScanFlow() {
    setPage('scan')
    setStatIndex(0)
    setStep('home')
    setError(null)
  }

  function openUpload(angle: CaptureAngle) {
    if (!QUIZ_QUESTIONS.every((q) => answers[q.id]) && angle === 'front') {
      startQuiz()
      return
    }
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
      const focusHint =
        answers.focus === 'jaw'
          ? 'Dit fokus ønskede kæbe/side-feedback — se Profile + Jawline.'
          : answers.focus === 'eyes'
            ? 'Dit fokus var øjne — se Eyes-metricen.'
            : null
      setHint([frontHint, sideHint, focusHint].filter(Boolean).join(' ') || null)
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
    setStatIndex(0)
    setStep('home')
    setPage('scan')
    setStatus(ready ? 'Klar — start med statistik' : 'Indlæser model…')
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
    overall100 >= 75 ? 'var(--blue)' : overall100 >= 60 ? 'var(--orange)' : 'var(--red)'

  return (
    <div className="app">
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
              setStatIndex(0)
              setStep('home')
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

      <main className="main">
        {page === 'scan' && step === 'home' ? (
          <section className="phone-shell intro-stat">
            <div className="progress">
              {LOOKSMAX_STATS.map((stat, i) => (
                <i key={stat.label} className={i <= statIndex ? 'on' : ''} />
              ))}
            </div>
            <div className="quiz-meta">
              <span>
                Statistik {statIndex + 1}/{LOOKSMAX_STATS.length}
              </span>
              <span>Før spørgsmål</span>
            </div>
            <p className="eyebrow">LOOKSMAX · PSL · TIKTOK</p>
            <h1>Vidste du det?</h1>
            <p className="lede">Først lidt kontekst — tryk Næste for at fortsætte.</p>

            <article className="stat-card feature-stat" key={LOOKSMAX_STATS[statIndex].label}>
              <strong>{LOOKSMAX_STATS[statIndex].value}</strong>
              <span>{LOOKSMAX_STATS[statIndex].label}</span>
              <p>{LOOKSMAX_STATS[statIndex].detail}</p>
              <small>{LOOKSMAX_STATS[statIndex].source}</small>
            </article>

            <div className="home-actions">
              <button type="button" className="btn-blue wide" onClick={nextStat}>
                {statIndex === LOOKSMAX_STATS.length - 1 ? 'Næste · spørgsmål' : 'Næste'}
              </button>
              <button
                type="button"
                className="btn-dark wide"
                onClick={prevStat}
                disabled={statIndex === 0}
              >
                Tilbage
              </button>
            </div>
            <p className={`status${error ? ' error' : ''}`}>{error ?? status}</p>
            <p className="disclaimer">
              Tal fra offentlige kilder (TikTok-hashtags, Google-søgeinteresse). PSL er
              community-baseret — ikke videnskab.
            </p>
          </section>
        ) : null}

        {page === 'scan' && step === 'quiz' && currentQuestion ? (
          <section className="phone-shell">
            <div className="progress">
              {QUIZ_QUESTIONS.map((q, i) => (
                <i key={q.id} className={i <= quizIndex ? 'on' : ''} />
              ))}
            </div>
            <div className="quiz-meta">
              <span>
                Spørgsmål {quizIndex + 1}/{QUIZ_QUESTIONS.length}
              </span>
              <span>Før kamera</span>
            </div>
            <div className="quiz-card">
              <h2>{currentQuestion.prompt}</h2>
              {currentQuestion.hint ? <p className="lede" style={{ marginBottom: 0 }}>{currentQuestion.hint}</p> : null}
              <div className="quiz-options">
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={selected === opt.id ? 'selected' : ''}
                    onClick={() => commitQuizAnswer(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="quiz-actions">
              <button type="button" className="btn-blue wide" disabled={!selected} onClick={nextQuiz}>
                {quizIndex === QUIZ_QUESTIONS.length - 1 ? 'Gå til kamera' : 'Næste'}
              </button>
              <button type="button" className="btn-dark wide" onClick={prevQuiz}>
                Tilbage
              </button>
            </div>
          </section>
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
                ? 'Kig lige ind i kameraet — hår væk fra ansigt, afslappet look.'
                : 'Drej 90° til højre og hold hagen i niveau.'}
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
          <section className="phone-shell">
            <p className="eyebrow">YOUR SCAN</p>
            <h1>Results</h1>
            <div className="summary-chips">
              {answers.goal ? <span>{quizLabel('goal', answers.goal)}</span> : null}
              {answers.focus ? <span>{quizLabel('focus', answers.focus)}</span> : null}
              {answers.pslKnow ? <span>{quizLabel('pslKnow', answers.pslKnow)}</span> : null}
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
              Ny scan
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
            <div className="upsell">
              <strong>Gem dine quiz-svar + scans</strong>
              <span>Opret en lokal konto for at huske profilen i browseren.</span>
              <button type="button" className="btn-blue wide" onClick={() => go('account')}>
                Opret konto
              </button>
            </div>
            <button type="button" className="btn-dark wide" onClick={() => setStep('result')}>
              Tilbage til results
            </button>
            <p className="disclaimer">AI estimate. Not a measure of your worth.</p>
          </section>
        ) : null}

        {page === 'stats' ? (
          <section className="content-shell">
            <p className="eyebrow">TIKTOK · GOOGLE · PSL</p>
            <h1>Looksmaxing stats</h1>
            <p className="lede">
              Udvalgte offentlige tal om looksmaxxing, mewing og PSL-skalaen — til kontekst før din
              egen scan.
            </p>
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
            <h2 style={{ fontFamily: 'var(--font-display)', margin: '0.4rem 0 0.7rem' }}>PSL-tier guide</h2>
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
            <button type="button" className="btn-blue wide" onClick={beginScanFlow}>
              {quizDone ? 'Gå til scan' : 'Start spørgeskema'}
            </button>
            <p className="disclaimer">
              Kilder bl.a. Rising Trends, GQ, The Conversation, Bustle og SAGE TikTok-studie (sep.
              2024 hashtag-data). Tal kan ændre sig over tid.
            </p>
          </section>
        ) : null}

        {page === 'account' ? (
          <section className="content-shell">
            <p className="eyebrow">ACCOUNT</p>
            <h1>Opret konto</h1>
            <p className="lede">Gem profil lokalt i browseren — ingen server.</p>
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
              <button type="submit" className="btn-blue wide">
                Opret konto
              </button>
            </form>
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
                    <span>Quiz</span>
                    <strong>{quizDone ? 'Done' : '—'}</strong>
                  </article>
                </div>
                <button type="button" className="btn-blue wide" onClick={beginScanFlow}>
                  Start scan
                </button>
                <button type="button" className="btn-dark wide" onClick={logout}>
                  Log ud
                </button>
              </>
            ) : (
              <>
                <p className="lede">Ingen lokal konto endnu.</p>
                <button type="button" className="btn-blue wide" onClick={() => go('account')}>
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
                <summary>Hvorfor skal jeg svare på spørgsmål først?</summary>
                <p>
                  Quizzen tilpasser tip og potentiale (søvn, fokus, PSL-kendskab), så feedbacken
                  matcher det, du faktisk vil forbedre.
                </p>
              </details>
              <details>
                <summary>Hvad er PSL?</summary>
                <p>
                  PSL er et community-ratingsystem fra looksmax-kultur (typisk 1–8). Det er
                  populært på TikTok, men pseudovidenskabeligt — SPEJL bruger det kun som kontekst.
                </p>
              </details>
              <details>
                <summary>Sendes mine billeder væk?</summary>
                <p>Nej. Analyse kører lokalt i browseren på localhost.</p>
              </details>
              <details>
                <summary>Er statsene opdaterede?</summary>
                <p>
                  De er taget fra offentlige kilder (Rising Trends, TikTok-studie sep. 2024, m.fl.)
                  og kan ændre sig. Se Stats-siden for kildehenvisninger.
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
              SPEJL er en moderne, lokal looksmax-scanner: quiz → front/side → score + fixes, med
              PSL/TikTok-kontekst — uden at sende dit ansigt til en betalt cloud-API.
            </p>
            <div className="about-grid">
              <article>
                <strong>Blå, clean UI</strong>
                <span>Mere moderne scanner-look med blå/cyan actions i stedet for neon-lime.</span>
              </article>
              <article>
                <strong>Data med forbehold</strong>
                <span>Stats fra Google/TikTok-dækning — til orientering, ikke som facit.</span>
              </article>
              <article>
                <strong>Soft-max først</strong>
                <span>Vi foreslår konstruktive fixes — ikke ekstrem hardmax.</span>
              </article>
            </div>
            <button type="button" className="btn-blue wide" onClick={beginScanFlow}>
              Start spørgeskema
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
