import { scoreTone, type FaceMark } from '../data/ratings'
import type { AngleSnapshot } from '../lib/faceAnalysis'

type Props = {
  src: string | null
  alt: string
  marks?: FaceMark[]
  side: 'front' | 'side'
  numbered?: boolean
  limit?: number
  /** Draw a light face mesh from landmarks */
  mesh?: AngleSnapshot | null
  compact?: boolean
}

const MESH_EDGES: Array<[number, number]> = [
  [10, 338],
  [338, 297],
  [297, 332],
  [332, 284],
  [284, 251],
  [251, 389],
  [389, 356],
  [356, 454],
  [454, 323],
  [323, 361],
  [361, 288],
  [288, 397],
  [397, 365],
  [365, 379],
  [379, 378],
  [378, 400],
  [400, 377],
  [377, 152],
  [152, 148],
  [148, 176],
  [176, 149],
  [149, 150],
  [150, 136],
  [136, 172],
  [172, 58],
  [58, 132],
  [132, 93],
  [93, 234],
  [234, 127],
  [127, 162],
  [162, 21],
  [21, 54],
  [54, 103],
  [103, 67],
  [67, 109],
  [109, 10],
  [33, 133],
  [133, 160],
  [160, 159],
  [159, 158],
  [158, 33],
  [263, 362],
  [362, 385],
  [385, 386],
  [386, 387],
  [387, 263],
  [61, 146],
  [146, 91],
  [91, 181],
  [181, 84],
  [84, 17],
  [17, 314],
  [314, 405],
  [405, 321],
  [321, 375],
  [375, 291],
  [291, 61],
  [1, 4],
  [4, 6],
  [6, 168],
  [168, 8],
]

export default function FaceAnnotator({
  src,
  alt,
  marks = [],
  side,
  numbered = false,
  limit = 4,
  mesh = null,
  compact = false,
}: Props) {
  if (!src) {
    return <div className={`face-anno empty${compact ? ' compact' : ''}`}>No {side} photo</div>
  }

  const visible = marks
    .filter((m) => m.photo === side)
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)

  const lm = mesh?.via === 'landmarker' && mesh.landmarks.length >= 400 ? mesh.landmarks : null

  return (
    <div className={`face-anno${numbered ? ' numbered' : ''}${compact ? ' compact' : ''}${mesh ? ' meshed' : ''}`}>
      <img src={src} alt={alt} draggable={false} />
      <svg className="face-anno-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {lm
          ? MESH_EDGES.map(([a, b], i) => {
              const p = lm[a]
              const q = lm[b]
              if (!p || !q) return null
              return (
                <line
                  key={`e${i}`}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  className="face-mesh-line"
                />
              )
            })
          : null}
        {visible.map((m) => (
          <circle
            key={m.id}
            cx={m.x}
            cy={m.y}
            r={numbered ? 0.028 : 0.014}
            className={`face-anno-dot ${scoreTone(m.score)}`}
          />
        ))}
      </svg>
      {numbered
        ? visible.map((m, i) => (
            <span
              key={`${m.id}-num`}
              className={`face-anno-num ${scoreTone(m.score)}`}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
            >
              {i + 1}
            </span>
          ))
        : null}
    </div>
  )
}
