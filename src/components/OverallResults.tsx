import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildCategoryRatings,
  buildFeatureGrid,
  marksForCategory,
  scoreTone,
  type FeatureGauge,
  type SubRating,
} from '../data/ratings'
import type { AnalysisResult } from '../lib/faceAnalysis'
import type { OnboardingAnswers } from '../data/onboarding'
import FaceAnnotator from './FaceAnnotator'

type Props = {
  result: AnalysisResult
  answers: OnboardingAnswers
  frontUrl: string | null
  sideUrl: string | null
  onRescan: () => void
}

export default function OverallResults({ result, answers, frontUrl, sideUrl, onRescan }: Props) {
  const categories = buildCategoryRatings(result, answers)
  const features = buildFeatureGrid(result, answers)
  const [index, setIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const startX = useRef(0)
  const deltaX = useRef(0)
  const swiping = useRef(false)

  const current = categories[index] ?? categories[0]
  const marks = marksForCategory(current, result)
  const detailMarks = marks
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 6)

  function go(next: number) {
    setSelectedId(null)
    setIndex(Math.max(0, Math.min(categories.length - 1, next)))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, categories.length])

  function onPointerDown(e: ReactPointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    swiping.current = true
    startX.current = e.clientX
    deltaX.current = 0
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!swiping.current) return
    deltaX.current = e.clientX - startX.current
  }

  function onPointerUp() {
    if (!swiping.current) return
    swiping.current = false
    if (deltaX.current < -56) go(index + 1)
    else if (deltaX.current > 56) go(index - 1)
    deltaX.current = 0
  }

  const preferSide =
    current.photo === 'side' ||
    (current.photo === 'both' &&
      detailMarks.filter((m) => m.photo === 'side').length >
        detailMarks.filter((m) => m.photo === 'front').length)
  const preferred: 'front' | 'side' = preferSide ? 'side' : 'front'
  const preferredMarks = detailMarks.filter((m) => m.photo === preferred)
  const useSide: 'front' | 'side' =
    preferredMarks.length > 0 ? preferred : preferred === 'side' ? 'front' : 'side'
  const useUrl = useSide === 'side' ? sideUrl : frontUrl
  const useMesh = useSide === 'side' ? result.side : result.front

  const gauges: FeatureGauge[] =
    current.id === 'overall'
      ? features
      : current.subs.slice(0, 9).map((s) => ({ id: s.id, label: s.label, score: s.score }))

  const selectedSub: SubRating | null =
    current.id === 'overall'
      ? null
      : (current.subs.find((s) => s.id === selectedId) ?? current.subs[0] ?? null)

  return (
    <section className="results-screen gauge-mode" aria-label="Scan results">
      <header className="results-top compact">
        <p className="results-kicker">
          {index + 1} / {categories.length} · {answers.name.trim() || 'Din'} scan
        </p>
        <h1 className="results-title">{current.label}</h1>
      </header>

      <div
        className="results-swipe"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="results-slide gauge-slide">
          <FaceAnnotator
            src={current.id === 'overall' ? frontUrl : useUrl}
            alt={`${current.label} photo`}
            marks={current.id === 'overall' ? [] : detailMarks}
            side={current.id === 'overall' ? 'front' : useSide}
            numbered={current.id !== 'overall'}
            limit={6}
            mesh={current.id === 'overall' ? result.front : useMesh}
            compact
          />

          <div className="gauge-grid" role="list">
            {gauges.map((g) => (
              <GaugeRing
                key={g.id}
                label={g.label}
                score={g.score}
                active={selectedId === g.id}
                onClick={() => setSelectedId(g.id)}
              />
            ))}
          </div>

          {current.id !== 'overall' && selectedSub ? (
            <div className={`gauge-tip ${scoreTone(selectedSub.score)}`}>
              <p>
                <b>{selectedSub.label}</b> — {selectedSub.why}
              </p>
              <p>
                <b>Sådan hæver du PSL</b> {selectedSub.fix}
              </p>
            </div>
          ) : null}

          {current.id === 'overall' ? (
            <p className="gauge-tip soft">
              Swipe › for PSL, øjne, midface m.m. — og konkrete tips til at hæve scoren.
            </p>
          ) : null}
        </div>
      </div>

      <div className="overall-dock">
        <span className="overall-dock-label">
          <i aria-hidden="true" />
          Overall
        </span>
        <strong className={scoreTone(categories[0]?.score ?? result.overall)}>
          {(categories[0]?.score ?? result.overall).toFixed(1)}
        </strong>
      </div>

      <nav className="results-nav" aria-label="Result pages">
        <button
          type="button"
          className="results-arrow"
          aria-label="Previous"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          ‹
        </button>
        <div className="results-dots" aria-hidden="true">
          {categories.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={i === index ? 'on' : ''}
              aria-label={c.label}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="results-arrow"
          aria-label="Next"
          disabled={index === categories.length - 1}
          onClick={() => go(index + 1)}
        >
          ›
        </button>
      </nav>

      <button type="button" className="results-rescan" onClick={onRescan}>
        Retake photos
      </button>
      <p className="disclaimer dark">AI-estimat. Ikke et mål for din værdi.</p>
    </section>
  )
}

function GaugeRing({
  score,
  label,
  active,
  onClick,
}: {
  score: number
  label: string
  active?: boolean
  onClick?: () => void
}) {
  const tone = scoreTone(score)
  const r = 34
  const c = 2 * Math.PI * r
  const pct = Math.max(0.04, Math.min(1, score / 10))

  return (
    <button
      type="button"
      className={`gauge-ring ${tone}${active ? ' active' : ''}`}
      onClick={onClick}
      role="listitem"
      aria-label={`${label} ${score.toFixed(1)}`}
    >
      <span className="gauge-ring-viz" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle className="gauge-track" cx="50" cy="50" r={r} />
          <circle
            className="gauge-fill"
            cx="50"
            cy="50"
            r={r}
            strokeDasharray={`${c * pct} ${c}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <strong>{score.toFixed(1)}</strong>
      </span>
      <span className="gauge-label">{label}</span>
    </button>
  )
}

