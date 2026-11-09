import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DAYS,
  EMPTY_ANSWERS,
  IDOLS,
  MONTHS,
  YEARS,
  isAdult,
  type OnboardingAnswers,
} from '../data/onboarding'

type Step =
  | 'landing'
  | 'hypergamy'
  | 'psl'
  | 'name'
  | 'gender'
  | 'birthday'
  | 'height'
  | 'weight'
  | 'looksmaxType'
  | 'idol'
  | 'pslCompare'

const STEPS: Step[] = [
  'landing',
  'hypergamy',
  'psl',
  'name',
  'gender',
  'birthday',
  'height',
  'weight',
  'looksmaxType',
  'idol',
  'pslCompare',
]

type Props = {
  ready: boolean
  onComplete: (answers: OnboardingAnswers) => void
}

export default function Onboarding({ ready, onComplete }: Props) {
  const [step, setStep] = useState<Step>('landing')
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS)
  const [error, setError] = useState<string | null>(null)

  const adult = useMemo(() => isAdult(answers), [answers])
  const stepIndex = STEPS.indexOf(step)

  // Lock page scroll + block browser/history back during the linear onboarding flow.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevHtmlOverscroll = html.style.overscrollBehavior
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'

    const lockKey = 'spejl-ob-lock'
    if (!window.history.state?.[lockKey]) {
      window.history.pushState({ [lockKey]: true }, '')
    }
    const onPop = () => {
      window.history.pushState({ [lockKey]: true }, '')
    }
    window.addEventListener('popstate', onPop)

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      html.style.overscrollBehavior = prevHtmlOverscroll
      window.removeEventListener('popstate', onPop)
    }
  }, [])

  function patch(partial: Partial<OnboardingAnswers>) {
    setAnswers((prev) => ({ ...prev, ...partial }))
    setError(null)
  }

  function goNext() {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1])
      setError(null)
      return
    }
    onComplete(answers)
  }

  function validateAndNext() {
    switch (step) {
      case 'name':
        if (!answers.name.trim()) return setError('Enter your name to continue.')
        break
      case 'gender':
        if (!answers.gender) return setError('Choose your gender.')
        break
      case 'birthday':
        if (!answers.birthDay || !answers.birthMonth || !answers.birthYear) {
          return setError('Select day, month and year.')
        }
        break
      case 'height':
        if (answers.heightUnit === 'cm' && !Number(answers.heightCm)) {
          return setError('Enter your height.')
        }
        if (
          answers.heightUnit === 'ftin' &&
          (!Number(answers.heightFt) || answers.heightIn === '')
        ) {
          return setError('Enter feet and inches.')
        }
        break
      case 'weight':
        if (!Number(answers.weight)) return setError('Enter your weight.')
        break
      case 'looksmaxType':
        if (!answers.looksmaxPlan) return setError('Choose a plan.')
        if (answers.looksmaxPlan === 'hardmaxing' && !adult) {
          return setError('Hardmaxing requires age 18+.')
        }
        break
      case 'idol':
        if (!answers.idol) return setError('Pick someone you want to look like.')
        break
      case 'pslCompare':
        // Informational only — always continue with PSL path.
        patch({ preferPsl: 'with' })
        break
      default:
        break
    }
    goNext()
  }

  function continuePslSlide() {
    const next = { ...answers, preferPsl: 'with' as const }
    setAnswers(next)
    onComplete(next)
  }

  return (
    <div className={`onboard step-${step}`}>
      {step === 'landing' ? (
        <section className="landing-hero">
          <div className="landing-video-wrap">
            <video
              className="landing-video"
              src="/video/looksmax-loop.mp4"
              autoPlay
              muted
              loop
              playsInline
              poster="/video/looksmax-poster.jpg"
            />
          </div>
          <div className="landing-copy">
            <p className="landing-tagline">become the best looking version of yourself</p>
            <button type="button" className="btn-get-started" onClick={goNext} disabled={!ready}>
              get started
            </button>
          </div>
        </section>
      ) : null}

      {step === 'hypergamy' ? (
        <ScreenshotSlide src="/slides/hypergamy.jpg" alt="Hypergamy" onNext={goNext} />
      ) : null}

      {step === 'psl' ? (
        <ScreenshotSlide src="/slides/psl-scale.jpg" alt="PSL Scale" onNext={goNext} />
      ) : null}

      {step === 'name' ? (
        <FormSlide title="What's your name?" progress={stepIndex} total={STEPS.length}>
          <input
            className="ob-input"
            value={answers.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Your name"
            autoFocus
          />
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'gender' ? (
        <FormSlide title="Choose your gender" progress={stepIndex} total={STEPS.length}>
          <div className="ob-choices">
            {(
              [
                ['male', 'Male'],
                ['female', 'Female'],
                ['other', 'Other'],
                ['prefer_not', 'Prefer not to say'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`ob-choice${answers.gender === id ? ' selected' : ''}`}
                onClick={() => patch({ gender: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'birthday' ? (
        <FormSlide title="When were you born?" progress={stepIndex} total={STEPS.length}>
          <div className="ob-triple">
            <label>
              Day
              <select
                value={answers.birthDay}
                onChange={(e) => patch({ birthDay: e.target.value })}
              >
                <option value="">—</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Month
              <select
                value={answers.birthMonth}
                onChange={(e) => patch({ birthMonth: e.target.value })}
              >
                <option value="">—</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <select
                value={answers.birthYear}
                onChange={(e) => patch({ birthYear: e.target.value })}
              >
                <option value="">—</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'height' ? (
        <FormSlide title="How tall are you?" progress={stepIndex} total={STEPS.length}>
          <div className="ob-units">
            <button
              type="button"
              className={answers.heightUnit === 'cm' ? 'selected' : ''}
              onClick={() => patch({ heightUnit: 'cm' })}
            >
              cm
            </button>
            <button
              type="button"
              className={answers.heightUnit === 'ftin' ? 'selected' : ''}
              onClick={() => patch({ heightUnit: 'ftin' })}
            >
              ft/in
            </button>
          </div>
          {answers.heightUnit === 'cm' ? (
            <input
              className="ob-input"
              type="number"
              min={120}
              max={230}
              value={answers.heightCm}
              onChange={(e) => patch({ heightCm: e.target.value })}
              placeholder="cm"
            />
          ) : (
            <div className="ob-dual">
              <input
                className="ob-input"
                type="number"
                min={4}
                max={8}
                value={answers.heightFt}
                onChange={(e) => patch({ heightFt: e.target.value })}
                placeholder="ft"
              />
              <input
                className="ob-input"
                type="number"
                min={0}
                max={11}
                value={answers.heightIn}
                onChange={(e) => patch({ heightIn: e.target.value })}
                placeholder="in"
              />
            </div>
          )}
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'weight' ? (
        <FormSlide title="What do you weigh?" progress={stepIndex} total={STEPS.length}>
          <div className="ob-units">
            <button
              type="button"
              className={answers.weightUnit === 'kg' ? 'selected' : ''}
              onClick={() => patch({ weightUnit: 'kg' })}
            >
              kg
            </button>
            <button
              type="button"
              className={answers.weightUnit === 'lb' ? 'selected' : ''}
              onClick={() => patch({ weightUnit: 'lb' })}
            >
              lb
            </button>
          </div>
          <input
            className="ob-input"
            type="number"
            min={30}
            max={400}
            value={answers.weight}
            onChange={(e) => patch({ weight: e.target.value })}
            placeholder={answers.weightUnit}
          />
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'looksmaxType' ? (
        <FormSlide
          title="What type of looksmaxing are you planning?"
          progress={stepIndex}
          total={STEPS.length}
        >
          <div className="ob-choices">
            <button
              type="button"
              className={`ob-choice${answers.looksmaxPlan === 'softmaxing' ? ' selected' : ''}`}
              onClick={() => patch({ looksmaxPlan: 'softmaxing' })}
            >
              Softmaxing
              <small>Hair, skin, gym, style — no surgery</small>
            </button>
            <button
              type="button"
              className={`ob-choice${answers.looksmaxPlan === 'natural' ? ' selected' : ''}`}
              onClick={() => patch({ looksmaxPlan: 'natural' })}
            >
              Natural
              <small>Optimization within genetics</small>
            </button>
            <button
              type="button"
              className={`ob-choice${answers.looksmaxPlan === 'hardmaxing' ? ' selected' : ''}${
                !adult ? ' locked' : ''
              }`}
              onClick={() => {
                if (!adult) {
                  setError('Hardmaxing is 18+ only. Update your birthday first.')
                  return
                }
                patch({ looksmaxPlan: 'hardmaxing' })
              }}
            >
              Hardmaxing <span className="badge-18">18+</span>
              <small>Surgical / clinical routes</small>
            </button>
          </div>
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'idol' ? (
        <FormSlide
          title="Who do you want to look like?"
          progress={stepIndex}
          total={STEPS.length}
        >
          <div className="idol-grid">
            {IDOLS.map((idol) => (
              <button
                key={idol.id}
                type="button"
                className={`idol-card${answers.idol === idol.id ? ' selected' : ''}`}
                onClick={() => patch({ idol: idol.id })}
              >
                <img src={idol.img} alt={idol.name} />
                <span>{idol.name}</span>
              </button>
            ))}
          </div>
          <NextButton onClick={validateAndNext} />
          {error ? <p className="ob-error">{error}</p> : null}
        </FormSlide>
      ) : null}

      {step === 'pslCompare' ? (
        <FormSlide title="One last thing" progress={stepIndex} total={STEPS.length}>
          <p className="ob-sub">
            With PSL awareness you optimize for the metrics that actually move the scale. Guesswork
            without it compounds slower.
          </p>
          <div className="psl-curve-card" aria-hidden="true">
            <svg className="psl-curve" viewBox="0 0 320 160" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pslWithFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Without PSL — flatter */}
              <path
                d="M8 128 C 70 120, 120 112, 160 104 S 260 92, 312 86"
                fill="none"
                stroke="#64748b"
                strokeWidth="3"
                strokeDasharray="6 6"
              />
              {/* With PSL — steeper compounding */}
              <path
                d="M8 128 C 60 118, 100 96, 150 70 S 240 28, 312 14"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="3.5"
              />
              <path
                d="M8 128 C 60 118, 100 96, 150 70 S 240 28, 312 14 L 312 150 L 8 150 Z"
                fill="url(#pslWithFill)"
              />
              <text x="24" y="148" className="curve-label muted">
                Without PSL
              </text>
              <text x="210" y="28" className="curve-label accent">
                With PSL
              </text>
            </svg>
            <p className="psl-curve-caption">Best results come from using the app’s PSL framework.</p>
          </div>
          <NextButton label="Start face scan" onClick={continuePslSlide} />
        </FormSlide>
      ) : null}
    </div>
  )
}

function ScreenshotSlide({
  src,
  alt,
  onNext,
}: {
  src: string
  alt: string
  onNext: () => void
}) {
  return (
    <section className="shot-slide">
      <div className="shot-frame">
        <img src={src} alt={alt} draggable={false} />
        <div className="shot-back-block" aria-hidden="true" />
        <div className="shot-next-bar">
          <button type="button" className="btn-next-white" onClick={onNext}>
            Next
          </button>
        </div>
      </div>
    </section>
  )
}

function FormSlide({
  title,
  progress,
  total,
  children,
}: {
  title: string
  progress: number
  total: number
  children: ReactNode
}) {
  return (
    <section className="form-slide">
      <div className="form-progress" aria-hidden="true">
        {Array.from({ length: total - 3 }).map((_, i) => (
          <i key={i} className={i <= progress - 3 ? 'on' : ''} />
        ))}
      </div>
      <h1>{title}</h1>
      <div className="form-body">{children}</div>
    </section>
  )
}

function NextButton({ onClick, label = 'Next' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn-next-white" onClick={onClick}>
      {label}
    </button>
  )
}
