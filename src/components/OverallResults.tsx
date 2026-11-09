import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  buildCategoryRatings,
  marksForCategory,
  scoreTone,
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
  const startX = useRef(0)
  const deltaX = useRef(0)
  const swiping = useRef(false)

  const current = categories[index] ?? categories[0]
  const marks = marksForCategory(current, result)
  const detailMarks = marks
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)

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
    // Don't steal taps on buttons
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
  const useMarks = detailMarks.filter((m) => m.photo === useSide)
  // Keep list order aligned with numbered markers on the photo
  const slideSubs = useMarks
    .map((m) => current.subs.find((s) => s.id === m.id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .slice(0, 4)

  return (
    <section className="results-screen simple" aria-label="Scan results">
      <header className="results-top">
        <p className="results-kicker">
          {index + 1} / {categories.length} · {answers.name.trim() || 'Your'} scan
        </p>
        <h1 className="results-title">{current.label}</h1>
        <div className={`results-score ${scoreTone(current.score)}`}>
          <strong>{current.score.toFixed(1)}</strong>
          <span>/ 10</span>
        </div>
        <p className="results-blurb">
          {current.id === 'overall'
            ? 'Your total score. Swipe → to see each area on your photo.'
            : current.blurb}
        </p>
      </header>

      <div
        className="results-swipe"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {current.id === 'overall' ? (
          <div className="results-slide overview">
            <div className="results-photos duo clean">
              <figure>
                <img src={frontUrl ?? undefined} alt="Front" />
                <figcaption>Front</figcaption>
              </figure>
              <figure>
                <img src={sideUrl ?? undefined} alt="Side" />
                <figcaption>Side</figcaption>
              </figure>
            </div>

            <div className="results-simple-list">
              <p className="results-list-title">Areas · tap or swipe →</p>
              {categories
                .filter((c) => c.id !== 'overall')
                .map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`results-row ${scoreTone(c.score)}`}
                    onClick={() => go(i + 1)}
                  >
                    <span className="results-row-name">{prettyLabel(c)}</span>
                    <strong>{c.score.toFixed(1)}</strong>
                    <span className="results-row-go" aria-hidden="true">
                      ›
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="results-slide detail">
            <FaceAnnotator
              src={useUrl}
              alt={`${current.label} photo`}
              marks={useMarks}
              side={useSide}
              numbered
              limit={4}
            />
            <p className="results-map-hint">Numbers on the photo match the list below</p>

            <div className="results-simple-list">
              {slideSubs.map((sub, i) => (
                <article key={sub.id} className={`results-card ${scoreTone(sub.score)}`}>
                  <div className="results-card-top">
                    <span className="results-card-num">{i + 1}</span>
                    <span className="results-card-name">{sub.label}</span>
                    <strong>{sub.score.toFixed(1)}</strong>
                  </div>
                  <p>
                    <b>Problem</b> {shorten(sub.why)}
                  </p>
                  <p>
                    <b>Fix</b> {shorten(sub.fix)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
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

function prettyLabel(c: CategoryRating) {
  if (c.id === 'lower') return 'Lower third'
  if (c.id === 'upper') return 'Upper third'
  if (c.id === 'psl') return 'PSL'
  if (c.id === 'potential') return 'Potential'
  return c.label.charAt(0) + c.label.slice(1).toLowerCase()
}

function shorten(text: string, max = 110) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const last = cut.lastIndexOf(' ')
  return `${cut.slice(0, last > 60 ? last : max)}…`
}
