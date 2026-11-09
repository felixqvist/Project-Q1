import { useState } from 'react'
import {
  buildCategoryRatings,
  type CategoryId,
  type CategoryRating,
} from '../data/ratings'
import type { AnalysisResult } from '../lib/faceAnalysis'
import type { OnboardingAnswers } from '../data/onboarding'

type Props = {
  result: AnalysisResult
  answers: OnboardingAnswers
  frontUrl: string | null
  sideUrl: string | null
  onRescan: () => void
}

export default function OverallResults({ result, answers, frontUrl, sideUrl, onRescan }: Props) {
  const categories = buildCategoryRatings(result, answers)
  const [openId, setOpenId] = useState<CategoryId | null>(null)
  const open = categories.find((c) => c.id === openId) ?? null

  if (open) {
    return (
      <section className="overall-screen">
        <button type="button" className="overall-back" onClick={() => setOpenId(null)}>
          ← Overall
        </button>
        <h1 className="overall-title">{open.label}</h1>
        <div className="detail-hero">
          <strong>{open.score.toFixed(1)}</strong>
          <span>/ 10</span>
          <div className="overall-bar lime">
            <i style={{ width: `${open.score100}%` }} />
          </div>
        </div>
        <div className="detail-list">
          {open.subs.map((sub) => (
            <article key={sub.id} className="detail-row">
              <div className="detail-row-top">
                <span>{sub.label}</span>
                <strong>{sub.score.toFixed(1)}</strong>
              </div>
              <div className="overall-bar lime">
                <i style={{ width: `${sub.score100}%` }} />
              </div>
              <p>{sub.note}</p>
            </article>
          ))}
        </div>
        <div className="duo-thumbs tight">
          {frontUrl ? <img src={frontUrl} alt="Front" /> : null}
          {sideUrl ? <img src={sideUrl} alt="Side" /> : null}
        </div>
      </section>
    )
  }

  return (
    <section className="overall-screen">
      <h1 className="overall-title">Overall</h1>
      <div className="overall-grid">
        {categories.map((cat) => (
          <CategoryCard key={cat.id} cat={cat} onOpen={() => setOpenId(cat.id)} />
        ))}
      </div>
      <div className="overall-dots" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <i key={i} className={i === 0 ? 'on' : ''} />
        ))}
      </div>
      <button type="button" className="btn-take" onClick={onRescan}>
        New scan
      </button>
      <p className="disclaimer dark">AI estimate. Not a measure of your worth.</p>
    </section>
  )
}

function CategoryCard({ cat, onOpen }: { cat: CategoryRating; onOpen: () => void }) {
  return (
    <button type="button" className="overall-card" onClick={onOpen}>
      <span className="overall-card-label">{cat.label}</span>
      <div className="overall-card-score">
        <strong>{cat.score.toFixed(1)}</strong>
      </div>
      <div className="overall-bar lime">
        <i style={{ width: `${cat.score100}%` }} />
      </div>
    </button>
  )
}
