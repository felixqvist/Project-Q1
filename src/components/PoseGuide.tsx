/** Semi-transparent AI pose reference shown in the camera viewfinder. */

type Props = {
  angle: 'front' | 'side'
}

export default function PoseGuide({ angle }: Props) {
  if (angle === 'side') {
    return (
      <svg
        className="pose-ai side"
        viewBox="0 0 220 360"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="poseSideFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.22" />
          </linearGradient>
          <filter id="poseGlow">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g fill="url(#poseSideFill)" stroke="#a5f3fc" strokeWidth="1.5" strokeOpacity="0.75" filter="url(#poseGlow)">
          {/* head profile */}
          <path d="M128 38c18 2 30 18 28 36-1 10-6 17-13 22-2 2-3 4-3 6 1 1 2 2 2 3 8 4 14 13 13 24-1 12-9 20-20 23v10c22 6 38 28 38 54 0 28-16 50-42 58v42c0 9-5 14-14 14h-20c-8 0-13-5-13-14v-44c-22-7-36-28-36-54 0-28 18-52 44-58v-10c-12-3-20-12-19-24 1-11 8-19 18-23 0-2 1-4 0-6-8-6-12-14-11-24 2-18 16-32 28-29z" />
          {/* nose tip accent */}
          <path
            d="M154 78c4 2 6 6 5 10"
            fill="none"
            stroke="#ecfeff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.7"
          />
          {/* ear */}
          <path d="M118 72c-4 2-6 8-4 12 2 3 5 4 7 3" fill="none" stroke="#ecfeff" strokeOpacity="0.45" />
        </g>
        <text x="110" y="340" textAnchor="middle" className="pose-label">
          SIDE 90°
        </text>
      </svg>
    )
  }

  return (
    <svg
      className="pose-ai front"
      viewBox="0 0 220 360"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="poseFrontFill" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.58" />
          <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.14" />
        </linearGradient>
        <filter id="poseGlowFront">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g
        fill="url(#poseFrontFill)"
        stroke="#bfdbfe"
        strokeWidth="1.5"
        strokeOpacity="0.8"
        filter="url(#poseGlowFront)"
      >
        {/* hair mass */}
        <path d="M70 54c8-24 28-38 50-38s42 14 50 38c6 4 10 12 10 22 0 8-3 14-8 18-4-18-22-30-42-30s-38 12-42 30c-5-4-8-10-8-18 0-10 4-18 10-22z" />
        {/* face */}
        <path d="M78 70c6-16 22-28 42-28s36 12 42 28c8 10 12 24 10 38-3 22-16 40-42 44h-20c-26-4-39-22-42-44-2-14 2-28 10-38z" />
        {/* neck + shoulders + torso */}
        <path d="M96 148c4 10 10 16 24 16s20-6 24-16c22 10 40 34 42 64 2 36-20 70-66 70s-68-34-66-70c2-30 20-54 42-64z" />
        <path d="M78 278c8 20 18 36 28 48h-22c-9 0-14-6-14-14v-24c0-6 3-10 8-10z" />
        <path d="M142 278c-8 20-18 36-28 48h22c9 0 14-6 14-14v-24c0-6-3-10-8-10z" />
        {/* brows / eyes / nose / mouth — subtle anatomy */}
        <path d="M92 86c6-3 14-3 20 0" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
        <path d="M128 86c6-3 14-3 20 0" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.55" />
        <ellipse cx="102" cy="98" rx="5.5" ry="3.2" fill="#e2e8f0" fillOpacity="0.5" stroke="none" />
        <ellipse cx="138" cy="98" rx="5.5" ry="3.2" fill="#e2e8f0" fillOpacity="0.5" stroke="none" />
        <path d="M120 104v16c0 4 2 7 5 8" fill="none" stroke="#e2e8f0" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.45" />
        <path d="M108 132c8 6 16 6 24 0" fill="none" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.5" />
      </g>
      <text x="110" y="340" textAnchor="middle" className="pose-label">
        FRONT
      </text>
    </svg>
  )
}
