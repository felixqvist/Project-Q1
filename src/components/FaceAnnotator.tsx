import { scoreTone, type FaceMark } from '../data/ratings'

type Props = {
  src: string | null
  alt: string
  marks: FaceMark[]
  side: 'front' | 'side'
  numbered?: boolean
  limit?: number
}

export default function FaceAnnotator({
  src,
  alt,
  marks,
  side,
  numbered = true,
  limit = 4,
}: Props) {
  if (!src) {
    return <div className="face-anno empty">No {side} photo</div>
  }

  const visible = marks
    .filter((m) => m.photo === side)
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)

  return (
    <div className={`face-anno${numbered ? ' numbered' : ''}`}>
      <img src={src} alt={alt} draggable={false} />
      <svg className="face-anno-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {visible.map((m) => (
          <circle
            key={m.id}
            cx={m.x}
            cy={m.y}
            r={numbered ? 0.028 : 0.018}
            className={`face-anno-dot ${scoreTone(m.score)}`}
          />
        ))}
      </svg>
      {visible.map((m, i) =>
        numbered ? (
          <span
            key={`${m.id}-num`}
            className={`face-anno-num ${scoreTone(m.score)}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            {i + 1}
          </span>
        ) : (
          <span
            key={`${m.id}-label`}
            className={`face-anno-tag ${scoreTone(m.score)}`}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            {m.label}
            <em>{m.score.toFixed(1)}</em>
          </span>
        ),
      )}
    </div>
  )
}
