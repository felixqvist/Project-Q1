import type { AnalysisResult, ScoreFactor } from '../lib/faceAnalysis'
import type { OnboardingAnswers } from './onboarding'

export type CategoryId = 'psl' | 'potential' | 'eyes' | 'midface' | 'lower' | 'upper'

export type SubRating = {
  id: string
  label: string
  score: number // 0–10 one decimal
  score100: number
  note: string
}

export type CategoryRating = {
  id: CategoryId
  label: string
  score: number
  score100: number
  subs: SubRating[]
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function to100(score10: number) {
  return Math.round(clamp(score10 * 10, 1, 100))
}

function factor(result: AnalysisResult, key: ScoreFactor['key'], source?: ScoreFactor['source']) {
  return result.factors.find((f) => f.key === key && (!source || f.source === source))
}

/** Deterministic slight offset so sub-metrics feel related but distinct. */
function offset(base: number, delta: number) {
  return round1(clamp(base + delta, 3.2, 9.8))
}

export function buildCategoryRatings(
  result: AnalysisResult,
  answers: OnboardingAnswers,
): CategoryRating[] {
  const symmetry = factor(result, 'symmetry')?.score ?? result.overall
  const proportions = factor(result, 'proportions')?.score ?? result.overall
  const eyes = factor(result, 'eyeBalance')?.score ?? result.overall
  const jaw = factor(result, 'jawline')?.score ?? result.overall
  const profile = factor(result, 'profile')?.score ?? result.overall
  const presence =
    factor(result, 'presence', 'front')?.score ??
    factor(result, 'presence')?.score ??
    result.overall

  const best = Math.max(...result.factors.map((f) => f.score), result.overall)
  let potBoost = 0.35
  if (answers.looksmaxPlan === 'softmaxing' || answers.looksmaxPlan === 'natural') potBoost += 0.15
  if (answers.looksmaxPlan === 'hardmaxing') potBoost += 0.35
  const potential = round1(clamp((result.overall + best) / 2 + potBoost, 4, 9.8))

  const midface = round1((proportions * 0.55 + symmetry * 0.45))
  const lower = round1((jaw * 0.65 + profile * 0.35))
  const upper = round1((presence * 0.5 + proportions * 0.3 + eyes * 0.2))
  const psl = round1(result.overall)

  const mk = (id: string, label: string, score: number, note: string): SubRating => ({
    id,
    label,
    score,
    score100: to100(score),
    note,
  })

  return [
    {
      id: 'psl',
      label: 'PSL',
      score: psl,
      score100: to100(psl),
      subs: [
        mk('harmony', 'Harmony', offset(psl, 0.2), 'Overall facial harmony across thirds.'),
        mk('dimorphism', 'Dimorphism', offset(psl, -0.3), 'Masculine/feminine signal clarity.'),
        mk('shadow', 'Shadowing', offset(profile, 0.1), 'How light reads bone structure.'),
        mk('tier-fit', 'Tier fit', offset(psl, 0), 'Where you land on the PSL scale.'),
      ],
    },
    {
      id: 'potential',
      label: 'POTENTIAL',
      score: potential,
      score100: to100(potential),
      subs: [
        mk('soft-ceiling', 'Softmax ceiling', offset(potential, -0.4), 'Gains without surgery.'),
        mk('hard-ceiling', 'Hardmax ceiling', offset(potential, 0.5), 'Clinical / surgical upside.'),
        mk('consistency', 'Consistency', offset(presence, 0.2), 'How stable ratings look across angles.'),
        mk('leverage', 'Leverage', offset(potential, -0.1), 'Highest ROI areas to train first.'),
      ],
    },
    {
      id: 'eyes',
      label: 'EYES',
      score: round1(eyes),
      score100: to100(eyes),
      subs: [
        mk('ipd', 'IPD', offset(eyes, 0.15), 'Interpupillary distance vs face width.'),
        mk('canthal', 'Canthal tilt', offset(eyes, -0.25), 'Outer corner tilt and hunter-eye read.'),
        mk('openness', 'Openness', offset(eyes, 0.05), 'Palpebral aperture / eye openness.'),
        mk('spacing', 'Spacing', offset(eyes, -0.1), 'Medial/lateral balance between eyes.'),
        mk('symmetry-eyes', 'Eye symmetry', offset(symmetry, 0.1), 'Left/right eye match.'),
      ],
    },
    {
      id: 'midface',
      label: 'MIDFACE',
      score: midface,
      score100: to100(midface),
      subs: [
        mk('cheekbones', 'Cheekbones', offset(midface, 0.35), 'Zygomatic projection and width.'),
        mk('maxilla', 'Maxilla', offset(midface, -0.2), 'Midface forward growth read.'),
        mk('nose', 'Nose', offset(proportions, -0.15), 'Nasal length/width harmony.'),
        mk('ipd-mid', 'IPD', offset(eyes, 0.05), 'Eye spacing relative to midface.'),
        mk('fwhr', 'fWHR', offset(proportions, 0.25), 'Facial width-to-height ratio.'),
        mk('compactness', 'Compactness', offset(midface, -0.35), 'Midface density / lack of elongation.'),
      ],
    },
    {
      id: 'lower',
      label: 'LOWER THIRD',
      score: lower,
      score100: to100(lower),
      subs: [
        mk('jawline', 'Jawline', offset(jaw, 0.1), 'Mandible definition from side + front.'),
        mk('chin', 'Chin', offset(jaw, -0.2), 'Menton projection and balance.'),
        mk('gonial', 'Gonial angle', offset(profile, 0.15), 'Jaw angle sharpness.'),
        mk('lips', 'Lips', offset(presence, -0.25), 'Lip ratio and support.'),
        mk('ramus', 'Ramus', offset(jaw, 0.05), 'Vertical jaw height contribution.'),
      ],
    },
    {
      id: 'upper',
      label: 'UPPER THIRD',
      score: upper,
      score100: to100(upper),
      subs: [
        mk('forehead', 'Forehead', offset(upper, -0.1), 'Forehead height vs midface.'),
        mk('hairline', 'Hairline', offset(upper, 0.2), 'Hairline shape and temple density.'),
        mk('brow', 'Brow', offset(eyes, -0.15), 'Brow position and ridge.'),
        mk('temples', 'Temples', offset(upper, -0.3), 'Temporal fullness.'),
        mk('upper-symmetry', 'Upper symmetry', offset(symmetry, -0.05), 'Brow/forehead left-right balance.'),
      ],
    },
  ]
}
