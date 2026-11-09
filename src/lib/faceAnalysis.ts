import {
  FaceDetector,
  FaceLandmarker,
  FilesetResolver,
  type Detection,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

export type FactorKey =
  | 'symmetry'
  | 'proportions'
  | 'eyeBalance'
  | 'jawline'
  | 'profile'
  | 'presence'

export type CaptureAngle = 'front' | 'side'

export interface ScoreFactor {
  key: FactorKey
  label: string
  score: number
  summary: string
  source: 'front' | 'side' | 'combined'
}

export interface AngleSnapshot {
  angle: CaptureAngle
  landmarks: NormalizedLandmark[]
  yaw: number
  detected: true
  via: 'landmarker' | 'detector'
}

export interface AnalysisResult {
  overall: number
  factors: ScoreFactor[]
  tip: string
  front: AngleSnapshot
  side: AngleSnapshot
}

type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>

let filesetPromise: Promise<VisionFileset> | null = null
let landmarkerPromise: Promise<FaceLandmarker> | null = null
let detectorPromise: Promise<FaceDetector> | null = null

async function getFileset(): Promise<VisionFileset> {
  if (!filesetPromise) {
    filesetPromise = FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm',
    )
  }
  return filesetPromise
}

export async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await getFileset()
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
    })()
  }
  return landmarkerPromise
}

async function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision = await getFileset()
      return FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.4,
      })
    })()
  }
  return detectorPromise
}

/** Warm both models so the UI can unlock once analysis is ready. */
export async function warmModels(): Promise<void> {
  await Promise.all([getFaceLandmarker(), getFaceDetector()])
}

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Map a 0–1 quality signal to a harsh PSL-style grade.
 * A true 10 is reserved for near-perfect bone + harmony reads.
 */
function grade(quality: number, floor = 1.6, ceil = 8.9): number {
  const q = clamp(quality, 0, 1)
  // Steeper concave curve — average faces land mid/low; elite is rare
  const curved = Math.pow(q, 1.75)
  return round1(floor + curved * (ceil - floor))
}

function mid(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function faceBasics(face: NormalizedLandmark[]) {
  const L_CHEEK = face[234]
  const R_CHEEK = face[454]
  const FOREHEAD = face[10]
  const CHIN = face[152]
  const NOSE_TIP = face[1]
  const NOSE_BRIDGE = face[6]
  const L_EYE_OUTER = face[33]
  const R_EYE_OUTER = face[263]
  const faceWidth = dist(L_CHEEK, R_CHEEK)
  const faceHeight = dist(FOREHEAD, CHIN)
  const midX = (NOSE_TIP.x + NOSE_BRIDGE.x) / 2
  const cheekMidX = (L_CHEEK.x + R_CHEEK.x) / 2
  const yaw = faceWidth > 0 ? (NOSE_TIP.x - cheekMidX) / faceWidth : 0
  const eyeSpan = dist(L_EYE_OUTER, R_EYE_OUTER) / (faceWidth || 1)
  return {
    face,
    L_CHEEK,
    R_CHEEK,
    FOREHEAD,
    CHIN,
    NOSE_TIP,
    NOSE_BRIDGE,
    L_EYE_OUTER,
    R_EYE_OUTER,
    faceWidth,
    faceHeight,
    midX,
    yaw,
    eyeSpan,
  }
}

function snapshotFromLandmarks(
  result: FaceLandmarkerResult,
  angle: CaptureAngle,
): AngleSnapshot | null {
  const face = result.faceLandmarks[0]
  if (!face || face.length < 400) return null
  const basics = faceBasics(face)
  if (basics.faceWidth < 0.04 || basics.faceHeight < 0.04) return null
  return {
    angle,
    landmarks: face,
    yaw: basics.yaw,
    detected: true,
    via: 'landmarker',
  }
}

/** BlazeFace keypoints: rightEye, leftEye, noseTip, mouthCenter, rightEarTragion, leftEarTragion */
function snapshotFromDetection(
  detection: Detection,
  angle: CaptureAngle,
): AngleSnapshot | null {
  const box = detection.boundingBox
  if (!box) return null
  const kps = detection.keypoints ?? []
  const landmarks: NormalizedLandmark[] = kps.map((k) => ({
    x: k.x,
    y: k.y,
    z: 0,
    visibility: 1,
  }))

  // Approximate yaw from eye/ear asymmetry when keypoints exist
  let yaw = angle === 'side' ? 0.35 : 0
  if (kps.length >= 6) {
    const rightEye = kps[0]
    const leftEye = kps[1]
    const nose = kps[2]
    const eyeMidX = (rightEye.x + leftEye.x) / 2
    const eyeSpan = Math.abs(leftEye.x - rightEye.x) || 0.01
    yaw = (nose.x - eyeMidX) / eyeSpan
  } else if (box) {
    // Wider boxes tend to be more frontal; narrow boxes more profile-like
    const ratio = box.width / (box.height || 1)
    yaw = angle === 'side' ? clamp(0.55 - ratio, 0.15, 0.55) : 0
  }

  return {
    angle,
    landmarks,
    yaw,
    detected: true,
    via: 'detector',
  }
}

function scoreFrontFactors(face: NormalizedLandmark[]): ScoreFactor[] {
  const b = faceBasics(face)
  const {
    faceWidth,
    faceHeight,
    midX,
    L_EYE_OUTER,
    R_EYE_OUTER,
    FOREHEAD,
    CHIN,
  } = b
  const L_EYE_INNER = face[133]
  const R_EYE_INNER = face[362]
  const L_EYE_TOP = face[159]
  const R_EYE_TOP = face[386]
  const L_EYE_BOT = face[145]
  const R_EYE_BOT = face[374]
  const L_CHEEK = face[234]
  const R_CHEEK = face[454]
  const L_MOUTH = face[61]
  const R_MOUTH = face[291]
  const MOUTH_TOP = face[13]
  const MOUTH_BOT = face[14]
  const L_JAW = face[172]
  const R_JAW = face[397]
  const L_BROW = face[70]
  const R_BROW = face[300]

  const pairs: Array<[NormalizedLandmark, NormalizedLandmark]> = [
    [L_EYE_OUTER, R_EYE_OUTER],
    [L_EYE_INNER, R_EYE_INNER],
    [L_CHEEK, R_CHEEK],
    [L_MOUTH, R_MOUTH],
    [L_JAW, R_JAW],
    [L_BROW, R_BROW],
  ]

  let symError = 0
  for (const [L, R] of pairs) {
    const leftOff = Math.abs(L.x - midX)
    const rightOff = Math.abs(R.x - midX)
    const yDiff = Math.abs(L.y - R.y)
    symError += Math.abs(leftOff - rightOff) / faceWidth + yDiff / faceHeight
  }
  symError /= pairs.length
  const symmetry = grade(clamp(1 - symError * 6.2, 0, 1))

  const browY = (L_BROW.y + R_BROW.y) / 2
  const noseBaseY = face[2].y
  const thirds = [browY - FOREHEAD.y, noseBaseY - browY, CHIN.y - noseBaseY].filter(
    (t) => t > 0,
  )
  const avgThird = thirds.reduce((a, c) => a + c, 0) / thirds.length
  const thirdsVar =
    thirds.reduce((s, t) => s + Math.abs(t - avgThird), 0) / (avgThird * thirds.length)
  // Ideal compact masculine/feminine harmonic band is narrow
  const ratioScore = 1 - clamp(Math.abs(faceHeight / faceWidth - 1.35) / 0.28, 0, 1)
  const cheekWidth = dist(L_CHEEK, R_CHEEK) / faceWidth
  const jawWidthFront = dist(L_JAW, R_JAW) / faceWidth
  const taper = clamp((cheekWidth - jawWidthFront + 0.08) / 0.22, 0, 1)
  const midCompact = clamp(1 - Math.abs((noseBaseY - browY) / faceHeight - 0.32) / 0.14, 0, 1)
  const proportions = grade(
    clamp(1 - thirdsVar * 4.1, 0, 1) * 0.35 +
      ratioScore * 0.25 +
      taper * 0.2 +
      midCompact * 0.2,
  )

  const eyeSpacing = dist(L_EYE_OUTER, R_EYE_OUTER) / faceWidth
  const spacingScore = 1 - clamp(Math.abs(eyeSpacing - 0.46) / 0.14, 0, 1)
  const lOpen = dist(L_EYE_TOP, L_EYE_BOT)
  const rOpen = dist(R_EYE_TOP, R_EYE_BOT)
  const openSym = 1 - clamp(Math.abs(lOpen - rOpen) / ((lOpen + rOpen) / 2 + 1e-6), 0, 1)
  // Canthal tilt proxy: outer corner should sit slightly above inner
  const lTilt = (L_EYE_OUTER.y - L_EYE_INNER.y) / faceHeight
  const rTilt = (R_EYE_OUTER.y - R_EYE_INNER.y) / faceHeight
  const tiltScore =
    (clamp((-lTilt + 0.012) / 0.03, 0, 1) + clamp((-rTilt + 0.012) / 0.03, 0, 1)) / 2
  const aperture = clamp(((lOpen + rOpen) / 2 / faceHeight - 0.028) / 0.03, 0, 1)
  const eyeBalance = grade(
    spacingScore * 0.3 + openSym * 0.2 + tiltScore * 0.3 + aperture * 0.2,
  )

  const eyeMid = mid(L_EYE_OUTER, R_EYE_OUTER)
  const mouthMid = mid(L_MOUTH, R_MOUTH)
  const poseSkew = Math.abs(eyeMid.x - mouthMid.x) / faceWidth
  const frontality = clamp(1 - poseSkew * 8, 0.05, 1)
  const mouthOpen = dist(MOUTH_TOP, MOUTH_BOT) / faceHeight
  const expressionCalm = clamp(1 - Math.abs(mouthOpen - 0.018) / 0.06, 0.15, 1)
  const frontalBonus = clamp(1 - Math.abs(b.yaw) / 0.11, 0.1, 1)
  const browStrength =
    1 - clamp(Math.abs((browY - eyeMid.y) / faceHeight - 0.07) / 0.05, 0, 1)
  const presence = grade(
    frontality * 0.3 + expressionCalm * 0.15 + frontalBonus * 0.25 + browStrength * 0.3,
  )

  return [
    {
      key: 'symmetry',
      label: 'Symmetri (front)',
      score: symmetry,
      source: 'front',
      summary:
        symmetry >= 7.5
          ? 'Meget jævn venstre/højre balance.'
          : symmetry >= 5.5
            ? 'Synlig asymmetri — trækker PSL ned.'
            : 'Tydelig asymmetri i knogle/bløddele.',
    },
    {
      key: 'proportions',
      label: 'Proportioner (front)',
      score: proportions,
      source: 'front',
      summary:
        proportions >= 7.5
          ? 'Tredjedele og bredde ligger tæt på elite-båndet.'
          : proportions >= 5.5
            ? 'Proportionerne er middel — midface/taper kan løftes.'
            : 'Lange/smalle eller ujævne tredjedele holder PSL nede.',
    },
    {
      key: 'eyeBalance',
      label: 'Øjenbalance (front)',
      score: eyeBalance,
      source: 'front',
      summary:
        eyeBalance >= 7.5
          ? 'Stærk tilt, afstand og åbenhed.'
          : eyeBalance >= 5.5
            ? 'Øjne er okay, men tilt/åbenhed er ikke elite.'
            : 'Svage øjne ift. PSL-standard (tilt, spacing eller aperture).',
    },
    {
      key: 'presence',
      label: 'Front-presence',
      score: presence,
      source: 'front',
      summary:
        presence >= 7.5
          ? 'Stærkt frontalt signal og brow support.'
          : presence >= 5.5
            ? 'Presence er middel — brow/frame kan skærpes.'
            : 'Svagt frontalt signal ift. høje PSL-ansigter.',
    },
  ]
}

function scoreSideFromLandmarks(face: NormalizedLandmark[], yaw: number): ScoreFactor[] {
  const b = faceBasics(face)
  const { FOREHEAD, CHIN, NOSE_TIP, faceHeight, faceWidth, eyeSpan } = b
  const NOSE_BRIDGE = face[6]
  const NOSE_BASE = face[2]
  const L_JAW = face[172]
  const R_JAW = face[397]
  const L_CHEEK = face[234]
  const R_CHEEK = face[454]

  const absYaw = Math.abs(yaw)
  const profileAngle = clamp((absYaw - 0.1) / 0.35, 0, 1)
  const eyeCollapse = clamp((0.48 - eyeSpan) / 0.22, 0, 1)
  const angleRaw = profileAngle * 0.65 + eyeCollapse * 0.35
  const profilePresence = grade(angleRaw)

  const chordX =
    NOSE_BRIDGE.x +
    ((NOSE_TIP.y - NOSE_BRIDGE.y) / (CHIN.y - NOSE_BRIDGE.y + 1e-6)) * (CHIN.x - NOSE_BRIDGE.x)
  const projection = Math.abs(NOSE_TIP.x - chordX) / (faceWidth + 1e-6)
  const zPush = Math.abs((NOSE_TIP.z ?? 0) - (NOSE_BRIDGE.z ?? 0))
  const noseRaw = clamp(projection * 4.0 + zPush * 1.8, 0.05, 1)

  const jawWidth = dist(L_JAW, R_JAW)
  const jawRatio = jawWidth / (faceHeight + 1e-6)
  const chinDrop = (CHIN.y - NOSE_BASE.y) / (faceHeight + 1e-6)
  const jawShape = 1 - clamp(Math.abs(jawRatio - 0.5) / 0.24, 0, 1)
  const chinShape = 1 - clamp(Math.abs(chinDrop - 0.26) / 0.14, 0, 1)
  const cheekEdge =
    Math.max(Math.abs(L_CHEEK.x - NOSE_TIP.x), Math.abs(R_CHEEK.x - NOSE_TIP.x)) /
    (faceWidth + 1e-6)
  const edgeClarity = clamp(cheekEdge / 0.62, 0.1, 1)
  const gonialProxy = clamp((chinDrop - 0.18) / 0.16, 0, 1)
  const jawline = grade(
    jawShape * 0.3 + chinShape * 0.3 + edgeClarity * 0.2 + gonialProxy * 0.2,
  )

  const silhouette =
    1 - clamp(Math.abs(FOREHEAD.x - CHIN.x) / (faceWidth * 0.45 + 1e-6), 0, 1)
  const foreheadSlope = clamp(1 - Math.abs(FOREHEAD.x - NOSE_BRIDGE.x) / (faceWidth * 0.35), 0, 1)
  const profileHarmony = grade(
    noseRaw * 0.3 + angleRaw * 0.25 + silhouette * 0.25 + foreheadSlope * 0.2,
  )

  return sideFactorRows(profileHarmony, jawline, profilePresence, absYaw, eyeCollapse)
}

function scoreSideFromDetection(snap: AngleSnapshot, detection: Detection): ScoreFactor[] {
  const box = detection.boundingBox!
  const conf = detection.categories?.[0]?.score ?? 0.5
  const ratio = box.width / (box.height || 1)
  // Profile boxes are often taller/narrower than frontal
  const profileShape = clamp((0.95 - ratio) / 0.45, 0.15, 1)
  const absYaw = Math.abs(snap.yaw)

  let noseRaw = clamp(absYaw / 0.7, 0.2, 1)
  const kps = detection.keypoints ?? []
  if (kps.length >= 4) {
    const rightEye = kps[0]
    const leftEye = kps[1]
    const nose = kps[2]
    const mouth = kps[3]
    const eyeMid = { x: (rightEye.x + leftEye.x) / 2, y: (rightEye.y + leftEye.y) / 2 }
    const faceH = box.height || 0.2
    const stack = Math.abs(mouth.y - eyeMid.y) / faceH
    const noseOff = Math.abs(nose.x - eyeMid.x) / (box.width || 0.2)
    noseRaw = clamp(noseOff * 1.4 + stack * 0.5, 0.2, 1)
  }

  const profileHarmony = grade(profileShape * 0.45 + noseRaw * 0.35 + conf * 0.2)
  const jawline = grade(profileShape * 0.55 + conf * 0.45)
  const presence = grade(clamp(absYaw / 0.45, 0.15, 1) * 0.5 + conf * 0.5)

  return sideFactorRows(profileHarmony, jawline, presence, absYaw, profileShape)
}

function sideFactorRows(
  profileHarmony: number,
  jawline: number,
  presence: number,
  absYaw: number,
  eyeCollapse: number,
): ScoreFactor[] {
  return [
    {
      key: 'profile',
      label: 'Profilsilhuet (side)',
      score: profileHarmony,
      source: 'side',
      summary:
        profileHarmony >= 8
          ? 'Sideprofilen tegner en klar, harmonisk silhuet.'
          : profileHarmony >= 6.5
            ? 'God profilform — næse, pandelinje og hage spiller rimeligt sammen.'
            : 'Prøv et skarpere sidebillede med ansigtet i ren profil mod en rolig baggrund.',
    },
    {
      key: 'jawline',
      label: 'Kæbelinje (side)',
      score: jawline,
      source: 'side',
      summary:
        jawline >= 8
          ? 'Kæbe og hage tegner en tydelig linje i profil.'
          : jawline >= 6.5
            ? 'Naturlig kæbelinje set fra siden.'
            : 'Lidt mere sidevinkel og blødt sidelys kan fremhæve kæbelinjen.',
    },
    {
      key: 'presence',
      label: 'Side-presence',
      score: presence,
      source: 'side',
      summary:
        absYaw >= 0.16 || eyeCollapse > 0.35
          ? 'God sidevinkel til profilanalyse.'
          : absYaw >= 0.08
            ? 'Delvist drejet — endnu mere sideprofil giver et stærkere sidebidrag.'
            : 'Billedet ligner stadig forfra. Drej hovedet ca. 70–90° til siden.',
    },
  ]
}

function combineScores(
  front: AngleSnapshot,
  side: AngleSnapshot,
  sideDetection?: Detection | null,
): AnalysisResult {
  if (front.landmarks.length < 400) {
    throw new Error('NO_FACE_FRONT')
  }
  const frontFactors = scoreFrontFactors(front.landmarks)
  const sideFactors =
    side.via === 'landmarker' && side.landmarks.length >= 400
      ? scoreSideFromLandmarks(side.landmarks, side.yaw)
      : scoreSideFromDetection(side, sideDetection!)

  const factors = [...frontFactors, ...sideFactors]
  const weights: Partial<Record<FactorKey, number>> = {
    symmetry: 0.2,
    proportions: 0.16,
    eyeBalance: 0.14,
    jawline: 0.16,
    profile: 0.18,
    presence: 0.16,
  }

  let weighted = 0
  let weightSum = 0
  for (const f of factors) {
    const w = weights[f.key] ?? 0.1
    const adj = f.key === 'presence' ? w / 2 : w
    weighted += f.score * adj
    weightSum += adj
  }

  // Very strict PSL stack — elite faces only clear 8+, 10 is almost unreachable.
  const raw = weighted / weightSum
  const overall = round1(clamp(raw * 0.92 - 1.15, 1, 9.2))
  const harshFactors = factors.map((f) => ({
    ...f,
    score: round1(clamp(f.score - 0.85, 1, 9.0)),
  }))
  const weakest = [...harshFactors].sort((a, b) => a.score - b.score)[0]
  const tip =
    overall >= 7.5
      ? 'Højt PSL-bånd — næste løft kommer fra det svageste træk, ikke fra “næsten perfekt”.'
      : weakest.key === 'jawline' || weakest.key === 'profile'
        ? 'Løft kæbe/hage først: lavere ansigtsfedt, nakke, eventuelt mewing-konsistens.'
        : weakest.key === 'eyeBalance'
          ? 'Øjne trækker dig ned — søvn, brynform og evt. soft fixes før hårdere valg.'
          : weakest.key === 'symmetry'
            ? 'Asymmetri trækker PSL — holdning, tyggemønster og jævn muskelbrug hjælper lidt.'
            : 'Start med fedtprocent, frisure der passer til knoglerne, og det røde område i din scan.'

  return { overall, factors: harshFactors, tip, front, side }
}

async function detectAngle(
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  angle: CaptureAngle,
): Promise<{ snap: AngleSnapshot; detection: Detection | null }> {
  const landmarker = await getFaceLandmarker()
  const lm = snapshotFromLandmarks(landmarker.detect(image), angle)
  if (lm) return { snap: lm, detection: null }

  // True profiles often miss Face Landmarker — fall back to Face Detector
  const detector = await getFaceDetector()
  const detections = detector.detect(image).detections
  const best = detections[0]
  if (!best) {
    throw new Error(angle === 'front' ? 'NO_FACE_FRONT' : 'NO_FACE_SIDE')
  }
  const snap = snapshotFromDetection(best, angle)
  if (!snap) {
    throw new Error(angle === 'front' ? 'NO_FACE_FRONT' : 'NO_FACE_SIDE')
  }
  // Front analysis still requires dense landmarks for symmetry/proportions
  if (angle === 'front') {
    throw new Error('NO_FACE_FRONT')
  }
  return { snap, detection: best }
}

export async function analyzeFrontAndSide(
  frontImage: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  sideImage: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): Promise<AnalysisResult> {
  const [front, side] = await Promise.all([
    detectAngle(frontImage, 'front'),
    detectAngle(sideImage, 'side'),
  ])
  return combineScores(front.snap, side.snap, side.detection)
}

export function yawHint(yaw: number, angle: CaptureAngle): string | null {
  const abs = Math.abs(yaw)
  if (angle === 'front' && abs > 0.2) {
    return 'Frontbilledet ser drejet ud — prøv mere lige ind i kameraet.'
  }
  if (angle === 'side' && abs < 0.08) {
    return 'Sidebilledet ligner forfra — drej hovedet tydeligt til siden.'
  }
  return null
}
