const PSL_FACES = [
  { label: '1 PSL', score: '1 PSL', path: 'M38 18c-6 2-10 10-9 18 1 7 4 12 4 18 0 4-2 8-4 10h22c-1-3-2-7-1-11 2-8 5-14 4-20-1-7-6-14-16-15z' },
  { label: 'Sub-3', score: '2 PSL', path: 'M40 16c-7 1-12 9-11 18 1 8 4 13 4 18 0 4-1 8-3 11h24c0-3-1-7 0-11 2-8 4-14 3-20-1-8-7-15-17-16z' },
  { label: 'Low-Tier Normie', score: '3 PSL', path: 'M42 14c-7 1-12 8-11 17 1 8 3 13 4 18 1 4 0 8-2 11h24c1-3 1-7 2-11 2-7 3-13 2-19 0-8-6-15-19-16z' },
  { label: 'Mid-Tier Normie', score: '4 PSL', path: 'M44 12c-8 1-13 8-12 17 1 8 3 14 4 19 1 4 1 7 0 10h22c2-3 2-7 3-11 2-7 3-13 2-19-1-8-7-15-19-16z' },
  { label: 'High-Tier Normie', score: '5 PSL', path: 'M46 11c-8 0-14 7-13 16 1 9 3 14 4 19 1 4 2 7 1 10h20c3-3 3-7 4-11 2-7 3-13 2-18-1-9-7-16-18-16z' },
  { label: 'Chadlite', score: '6 PSL', path: 'M48 10c-8 0-14 6-13 16 1 9 2 14 3 19 1 4 3 7 2 10h18c4-3 5-7 6-11 2-7 2-12 1-18-1-9-6-16-17-16z' },
  { label: 'Chad', score: '7 PSL', path: 'M50 9c-8-1-15 6-14 16 1 9 2 14 2 19 1 4 4 7 4 10h16c5-3 7-7 8-11 2-7 1-12 0-18-1-9-5-16-16-16z' },
  { label: 'True Adam', score: '8 PSL', path: 'M52 8c-8-1-15 5-14 15 1 10 1 14 1 19 1 4 5 8 5 11h14c6-3 9-7 10-12 2-7 1-12 0-17-1-10-5-16-16-16z' },
]

function PersonIcon({ color, glow }: { color: string; glow?: boolean }) {
  return (
    <span className={`person-icon${glow ? ' glow' : ''}`} style={{ color }}>
      <svg viewBox="0 0 24 40" aria-hidden="true">
        <circle cx="12" cy="7" r="5" fill="currentColor" />
        <path
          d="M4 36c0-8 3.5-14 8-14s8 6 8 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}

export function HypergamySlide({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const women = Array.from({ length: 10 })
  const men = Array.from({ length: 10 })

  return (
    <section className="edu-slide">
      <button type="button" className="edu-back" aria-label="Back" onClick={onBack}>
        ‹
      </button>

      <div className="hyper-visual">
        <div className="hyper-cols">
          <div className="hyper-col women">
            {women.map((_, i) => (
              <PersonIcon key={`w-${i}`} color="#ff4fa3" />
            ))}
          </div>
          <svg className="hyper-arrows" viewBox="0 0 120 360" preserveAspectRatio="none" aria-hidden="true">
            {women.map((_, i) => {
              const y1 = 18 + i * 34
              const target = Math.min(i, 3)
              const y2 = 18 + target * 34
              return (
                <path
                  key={`a-${i}`}
                  d={`M8 ${y1} C 45 ${y1}, 70 ${y2}, 112 ${y2}`}
                  fill="none"
                  stroke="rgba(200,210,220,0.55)"
                  strokeWidth="1.4"
                  strokeDasharray="4 4"
                  markerEnd="url(#arrowHead)"
                />
              )
            })}
            <defs>
              <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="rgba(200,210,220,0.7)" />
              </marker>
            </defs>
          </svg>
          <div className="hyper-col men">
            {men.map((_, i) => (
              <PersonIcon key={`m-${i}`} color={i < 4 ? '#2ee6d6' : '#1a5c58'} glow={i < 4} />
            ))}
          </div>
        </div>
        <p className="hyper-caption">80% of women&apos;s attention → top 20% of men</p>
      </div>

      <div className="edu-card">
        <h1>Hypergamy</h1>
        <p>
          Rooted in evolutionary biology, women naturally seek partners of at least equal or higher
          mate value. Due to the explosion of dating apps and social media, they now have access to
          the top men globally, meaning the average man is now competing with the top 20%.
        </p>
        <button type="button" className="btn-next-white" onClick={onNext}>
          Next
        </button>
      </div>
    </section>
  )
}

export function PslScaleSlide({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <section className="edu-slide">
      <button type="button" className="edu-back" aria-label="Back" onClick={onBack}>
        ‹
      </button>

      <div className="psl-visual">
        <h2 className="psl-title">PSL Scale</h2>
        <div className="psl-grid">
          {PSL_FACES.map((face, i) => (
            <article key={face.score} className={`psl-cell${i >= 6 ? ' bottom' : ''}`}>
              <span className="psl-label">{face.label}</span>
              <svg viewBox="0 0 80 70" className="psl-face" aria-hidden="true">
                <path d={face.path} fill="none" stroke="#f2f5f8" strokeWidth="2.2" strokeLinejoin="round" />
                <circle cx="52" cy="28" r="1.6" fill="#f2f5f8" />
              </svg>
              <span className="psl-score">{face.score}</span>
            </article>
          ))}
        </div>
      </div>

      <div className="edu-card">
        <h1>The Highest Leverage Solution</h1>
        <p>
          Improving your looks has undeniably become the most effective way to improve your dating
          life. Understanding, accepting, and adapting to this will make you one of the very few who
          improve their life dramatically.
        </p>
        <button type="button" className="btn-next-white" onClick={onNext}>
          Next
        </button>
      </div>
    </section>
  )
}
