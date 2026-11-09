import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildCategoryRatings,
  marksForCategory,
  scoreTone,
  type CategoryId,
  type CategoryRating,
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
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const deltaX = useRef(0)
  const swiping = useRef(false)

  const current = categories[index] ?? categories[0]
  const marks = marksForCategory(current, result)

  function go(next: number) {
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
    swiping.current = true
    startX.current = e.clientX
    deltaX.current = 0
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
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

  return (
    <section className="results-screen" aria-label="Scan results">
      <header className="results-top">
        <p className="results-kicker">{answers.name.trim() || 'Your'} scan</p>
        <h1 className="results-title">{current.label}</h1>
        <div className={`results-score ${scoreTone(current.score)}`}>
          <strong>{current.score.toFixed(1)}</strong>
          <span>/ 10</span>
        </div>
        <div className="overall-bar lime results-bar">
          <i style={{ width: `${current.score100}%` }} />
        </div>
        <p className="results-blurb">{current.blurb}</p>
      </header>

      <div
        className="results-swipe"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <CategorySlide
          cat={current}
          marks={marks}
          frontUrl={frontUrl}
          sideUrl={sideUrl}
          all={categories}
          onJump={(id) => {
            const i = categories.findIndex((c) => c.id === id)
            if (i >= 0) setIndex(i)
          }}
        />
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
              onClick={() => setIndex(i)}
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
        Rescan
      </button>
      <p className="disclaimer dark">AI estimate. Not a measure of your worth.</p>
    </section>
  )
}

function CategorySlide({
  cat,
  marks,
  frontUrl,
  sideUrl,
  all,
  onJump,
}: {
  cat: CategoryRating
  marks: ReturnType<typeof marksForCategory>
  frontUrl: string | null
  sideUrl: string | null
  all: CategoryRating[]
  onJump: (id: CategoryId) => void
}) {
  const needsFront =
    cat.photo === 'both' || cat.photo === 'front' || cat.subs.some((s) => s.photo === 'front')
  const needsSide =
    cat.photo === 'both' || cat.photo === 'side' || cat.subs.some((s) => s.photo === 'side')
  const duo = needsFront && needsSide

  return (
    <div className="results-slide">
      <div className={`results-photos ${duo ? 'duo' : 'single'}`}>
        {needsFront ? (
          <FaceAnnotator src={frontUrl} alt="Front capture" marks={marks} side="front" />
        ) : null}
        {needsSide ? (
          <FaceAnnotator src={sideUrl} alt="Side capture" marks={marks} side="side" />
        ) : null}
      </div>

      {cat.id === 'overall' ? (
        <div className="results-jump-grid">
          {all
            .filter((c) => c.id !== 'overall')
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className={`results-jump ${scoreTone(c.score)}`}
                onClick={() => onJump(c.id)}
              >
                <span>{c.label}</span>
                <strong>{c.score.toFixed(1)}</strong>
                <div className="overall-bar lime">
                  <i style={{ width: `${c.score100}%` }} />
                </div>
              </button>
            ))}
        </div>
      ) : null}

      <div className="results-points">
        <h2>Points on your face</h2>
        {cat.subs.map((sub) => (
          <article key={sub.id} className={`results-point ${scoreTone(sub.score)}`}>
            <div className="results-point-top">
              <span className="results-point-name">{sub.label}</span>
              <strong>{sub.score.toFixed(1)}</strong>
            </div>
            <div className="overall-bar lime">
              <i style={{ width: `${sub.score100}%` }} />
            </div>
            <p className="results-why">
              <span>Why</span>
              {sub.why}
            </p>
            <p className="results-fix">
              <span>What to do</span>
              {sub.fix}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}
