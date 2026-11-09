import type { AnalysisResult, AngleSnapshot, ScoreFactor } from '../lib/faceAnalysis'
import type { OnboardingAnswers } from './onboarding'

export type CategoryId = 'overall' | 'psl' | 'potential' | 'eyes' | 'midface' | 'lower' | 'upper'

export type SubRating = {
  id: string
  label: string
  score: number // 0–10 one decimal
  score100: number
  note: string
  why: string
  fix: string
  /** MediaPipe landmark index on the preferred photo */
  landmarkIndex: number
  photo: 'front' | 'side'
}

export type CategoryRating = {
  id: CategoryId
  label: string
  score: number
  score100: number
  photo: 'front' | 'side' | 'both'
  blurb: string
  subs: SubRating[]
}

export type FaceMark = {
  id: string
  label: string
  x: number
  y: number
  score: number
  photo: 'front' | 'side'
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

function toneCopy(score: number, weakWhy: string, okWhy: string, strongWhy: string) {
  if (score < 6.2) return weakWhy
  if (score < 7.8) return okWhy
  return strongWhy
}

function fixCopy(score: number, weakFix: string, okFix: string, strongFix: string) {
  if (score < 6.2) return weakFix
  if (score < 7.8) return okFix
  return strongFix
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

  const midface = round1(proportions * 0.55 + symmetry * 0.45)
  const lower = round1(jaw * 0.65 + profile * 0.35)
  const upper = round1(presence * 0.5 + proportions * 0.3 + eyes * 0.2)
  const psl = round1(result.overall)

  const mk = (
    id: string,
    label: string,
    score: number,
    note: string,
    landmarkIndex: number,
    photo: 'front' | 'side',
    whyWeak: string,
    whyOk: string,
    whyStrong: string,
    fixWeak: string,
    fixOk: string,
    fixStrong: string,
  ): SubRating => ({
    id,
    label,
    score,
    score100: to100(score),
    note,
    landmarkIndex,
    photo,
    why: toneCopy(score, whyWeak, whyOk, whyStrong),
    fix: fixCopy(score, fixWeak, fixOk, fixStrong),
  })

  const categories: CategoryRating[] = [
    {
      id: 'overall',
      label: 'OVERALL',
      score: psl,
      score100: to100(psl),
      photo: 'both',
      blurb: 'Full face read from your front + side captures.',
      subs: [
        mk(
          'harmony',
          'Harmony',
          offset(psl, 0.2),
          'Overall facial harmony across thirds.',
          1,
          'front',
          'Thirds feel slightly uneven, so the face reads less balanced.',
          'Harmony is solid — small third imbalances still show in photos.',
          'Strong harmony: features sit in a clean, balanced frame.',
          'Match lighting on both sides and keep the camera at eye level.',
          'Tighten hairline + jaw contrast with soft side light.',
          'Keep the same lighting setup — it already flatters your structure.',
        ),
        mk(
          'front-read',
          'Front read',
          offset(symmetry, 0.05),
          'How clean the front angle scores.',
          168,
          'front',
          'Front capture loses some symmetry or proportion clarity.',
          'Front look is decent with room to sharpen bone read.',
          'Front capture shows a clear, balanced structure.',
          'Retake front straight-on with even light on both cheeks.',
          'Raise chin slightly and soften overhead shadows.',
          'Use this front setup as your reference for future scans.',
        ),
        mk(
          'side-read',
          'Side read',
          offset(profile, 0.1),
          'How clean the profile scores.',
          152,
          'side',
          'Profile under-reads jaw / nose projection.',
          'Profile is readable but not maximally sharp.',
          'Profile shows clear jaw and midface projection.',
          'Shoot true 90° profile with soft light from the face front.',
          'Pull hair back and use a darker background for edge contrast.',
          'Keep this side angle — bone lines already read well.',
        ),
      ],
    },
    {
      id: 'psl',
      label: 'PSL',
      score: psl,
      score100: to100(psl),
      photo: 'front',
      blurb: 'Looksmax tier signal from harmony, dimorphism and shadowing.',
      subs: [
        mk(
          'harmony',
          'Harmony',
          offset(psl, 0.2),
          'Overall facial harmony across thirds.',
          1,
          'front',
          'Feature spacing pulls the face slightly off balance.',
          'Harmony is mid-tier — good bones with soft drift in thirds.',
          'High harmony: proportions lock together cleanly.',
          'Focus on midface compactness and even cheek light.',
          'Mewing posture + cheek highlight training photos.',
          'Maintain weight and hair that keep thirds clear.',
        ),
        mk(
          'dimorphism',
          'Dimorphism',
          offset(psl, -0.3),
          'Masculine/feminine signal clarity.',
          152,
          'front',
          'Sex-typical cues are soft — jaw/brow signal is muted.',
          'Dimorphism is present but not sharp in stills.',
          'Clear dimorphic signal in jaw, brow and midface.',
          'Grow/shape brows, add jaw contrast with lighting & stubble rules.',
          'Train neck + rear-delt for frame; keep low body fat on face.',
          'Keep grooming that already supports your dimorphic read.',
        ),
        mk(
          'shadow',
          'Shadowing',
          offset(profile, 0.1),
          'How light reads bone structure.',
          234,
          'front',
          'Flat light washes bone — cheeks/jaw lack shadow definition.',
          'Some structure shows; shadows could carve more.',
          'Shadowing carves cheek and jaw lines cleanly.',
          'Use 45° key light and avoid flat flash.',
          'Slightly stronger side light on cheekbone and mandible.',
          'Keep directional light — it already sells structure.',
        ),
        mk(
          'tier-fit',
          'Tier fit',
          offset(psl, 0),
          'Where you land on the PSL scale.',
          10,
          'front',
          'Current tier is held back by the weakest region below.',
          'Solid mid-tier fit with a clear ceiling if weak points rise.',
          'You already sit in a strong PSL band for this capture.',
          'Raise your lowest category first — that moves tier fastest.',
          'Stack soft gains on eyes + lower third before hardmax talk.',
          'Protect hair density and body-fat range that hold this tier.',
        ),
      ],
    },
    {
      id: 'potential',
      label: 'POTENTIAL',
      score: potential,
      score100: to100(potential),
      photo: 'front',
      blurb: 'Upside left if you train the highest-ROI changes.',
      subs: [
        mk(
          'soft-ceiling',
          'Softmax ceiling',
          offset(potential, -0.4),
          'Gains without surgery.',
          454,
          'front',
          'Softmax upside is limited by fat, hair, or posture noise.',
          'Meaningful soft gains still available without procedures.',
          'Softmax ceiling is already high on this face.',
          'Cut face fat, fix sleep, optimize hairstyle and brows first.',
          '12-week plan: diet, gym posture, hair + skin consistency.',
          'Maintain — soft levers are mostly maxed for photos.',
        ),
        mk(
          'hard-ceiling',
          'Hardmax ceiling',
          offset(potential, 0.5),
          'Clinical / surgical upside.',
          152,
          'side',
          'Hardmax would mainly target projection gaps in profile.',
          'Selective hardmax could lift the weakest third.',
          'Bones already support a high hard ceiling.',
          'Only consider clinical options after a year of soft work.',
          'If pursuing hardmax, prioritize the lowest third (often jaw/chin).',
          'Hardmax ROI is low — protect what already works.',
        ),
        mk(
          'consistency',
          'Consistency',
          offset(presence, 0.2),
          'How stable ratings look across angles.',
          1,
          'front',
          'Front and side tell different stories — rating swings.',
          'Angles mostly agree with small drift.',
          'Front/side consistency is strong.',
          'Retake both angles in the same room and lighting.',
          'Match camera height and distance on both shots.',
          'Your two angles already corroborate each other.',
        ),
        mk(
          'leverage',
          'Leverage',
          offset(potential, -0.1),
          'Highest ROI areas to train first.',
          33,
          'front',
          'Leverage is stuck on a weak feature that tanks the stack.',
          'Best leverage sits in 1–2 categories below.',
          'High leverage already unlocked — compounding small wins.',
          'Open the lowest scoring category next and follow its fixes.',
          'Put weekly effort into the red/yellow marks on your map.',
          'Keep iterating hair + lighting; leverage is already good.',
        ),
      ],
    },
    {
      id: 'eyes',
      label: 'EYES',
      score: round1(eyes),
      score100: to100(eyes),
      photo: 'front',
      blurb: 'Spacing, tilt, openness and left/right match.',
      subs: [
        mk(
          'ipd',
          'IPD',
          offset(eyes, 0.15),
          'Interpupillary distance vs face width.',
          168,
          'front',
          'Eye spacing fights face width — looks slightly off-balance.',
          'IPD is acceptable relative to cheek width.',
          'IPD sits in a harmonious band for your face width.',
          'Hairstyle that frames temples can visually rebalance spacing.',
          'Avoid extreme close-ups that exaggerate spacing.',
          'Keep current framing — IPD already supports the face.',
        ),
        mk(
          'canthal',
          'Canthal tilt',
          offset(eyes, -0.25),
          'Outer corner tilt and hunter-eye read.',
          263,
          'front',
          'Outer corners read flat or slightly negative.',
          'Mild positive tilt — not fully “hunter” yet.',
          'Positive canthal tilt reads sharp and alert.',
          'Brow shape + slight squint in photos can lift the outer corner read.',
          'Groom brows to follow the outer canthus line.',
          'Protect sleep and low inflammation — tilt already reads well.',
        ),
        mk(
          'openness',
          'Openness',
          offset(eyes, 0.05),
          'Palpebral aperture / eye openness.',
          159,
          'front',
          'Eyes look heavy or narrow in this capture.',
          'Openness is average — neither hooded nor ultra open.',
          'Good aperture — eyes look open and present.',
          'Sleep, allergy control, and avoid tired overhead lighting.',
          'Slight head tilt down can open the visible aperture in photos.',
          'Keep this expression — openness is already a strength.',
        ),
        mk(
          'spacing',
          'Spacing',
          offset(eyes, -0.1),
          'Medial/lateral balance between eyes.',
          133,
          'front',
          'Medial/lateral balance feels uneven in stills.',
          'Spacing is mostly even with minor asymmetry.',
          'Clean spacing between medial and lateral canthi.',
          'Center the nose in frame; check both catchlights.',
          'Use straight-on camera — no yaw — for accurate spacing.',
          'No change needed on spacing.',
        ),
        mk(
          'symmetry-eyes',
          'Eye symmetry',
          offset(symmetry, 0.1),
          'Left/right eye match.',
          33,
          'front',
          'Left/right eye height or shape diverges.',
          'Mild asymmetry — normal but visible in close-ups.',
          'Eyes match well left to right.',
          'Level the camera; correct head tilt before retaking.',
          'Match brow grooming height on both sides.',
          'Symmetry is a strength — keep even lighting.',
        ),
      ],
    },
    {
      id: 'midface',
      label: 'MIDFACE',
      score: midface,
      score100: to100(midface),
      photo: 'front',
      blurb: 'Cheeks, maxilla, nose and midface density.',
      subs: [
        mk(
          'cheekbones',
          'Cheekbones',
          offset(midface, 0.35),
          'Zygomatic projection and width.',
          234,
          'front',
          'Cheeks read flat — little zygomatic pop in this light.',
          'Cheekbones show, but projection is moderate.',
          'Clear zygomatic width and projection.',
          'Lower body fat + 45° light to reveal cheek planes.',
          'Contour only for photos; train posture so midface sits forward.',
          'Keep lighting that already shows your cheek structure.',
        ),
        mk(
          'maxilla',
          'Maxilla',
          offset(midface, -0.2),
          'Midface forward growth read.',
          4,
          'front',
          'Midface looks slightly recessed vs ideal forward growth.',
          'Maxilla read is average — not recessed, not extreme.',
          'Forward midface support reads strong.',
          'Tongue posture / mewing consistency; avoid mouth breathing.',
          'Side-light profile checks monthly to track soft changes.',
          'Structure already supports a strong maxilla read.',
        ),
        mk(
          'nose',
          'Nose',
          offset(proportions, -0.15),
          'Nasal length/width harmony.',
          1,
          'front',
          'Nose length/width fights surrounding thirds.',
          'Nose is acceptable within facial proportions.',
          'Nose sits harmoniously in the midface.',
          'Angle camera slightly above eye line to soften length.',
          'Avoid wide-angle lenses that enlarge the nose.',
          'Nose is already balanced — no priority change.',
        ),
        mk(
          'ipd-mid',
          'IPD',
          offset(eyes, 0.05),
          'Eye spacing relative to midface.',
          6,
          'front',
          'Eye spacing vs cheek width looks stretched or tight.',
          'IPD vs midface is within a normal band.',
          'Eye spacing supports midface width well.',
          'Frame hair to visually adjust effective face width.',
          'Keep straight portrait focal length (~50–85mm eq.).',
          'Leave as-is — midface/IPD relationship is strong.',
        ),
        mk(
          'fwhr',
          'fWHR',
          offset(proportions, 0.25),
          'Facial width-to-height ratio.',
          454,
          'front',
          'Width-to-height ratio reads long or narrow.',
          'fWHR is mid-range for attractiveness studies.',
          'Favorable width-to-height ratio.',
          'Hairstyle volume at sides can widen a long face optically.',
          'Maintain lean face fat to keep width reading strong.',
          'Ratio is already working — protect it with body-fat control.',
        ),
        mk(
          'compactness',
          'Compactness',
          offset(midface, -0.35),
          'Midface density / lack of elongation.',
          48,
          'front',
          'Midface looks elongated — density is low in stills.',
          'Moderate compactness with some vertical stretch.',
          'Compact, dense midface read.',
          'Shorten visual midface with bangs/fringe or volume on top carefully.',
          'Chin-down micro pose can compact the midface in photos.',
          'Compactness is a strength on this scan.',
        ),
      ],
    },
    {
      id: 'lower',
      label: 'LOWER THIRD',
      score: lower,
      score100: to100(lower),
      photo: 'side',
      blurb: 'Jaw, chin, gonial angle, lips and ramus.',
      subs: [
        mk(
          'jawline',
          'Jawline',
          offset(jaw, 0.1),
          'Mandible definition from side + front.',
          172,
          'side',
          'Jawline softens into the neck — edge is unclear.',
          'Jawline is visible but not razor-defined.',
          'Sharp mandible edge from ear to chin.',
          'Drop face fat, train neck, shoot with under-jaw shadow.',
          'Soft key light from front of face on a true profile.',
          'Keep BF% and this lighting — jaw already pops.',
        ),
        mk(
          'chin',
          'Chin',
          offset(jaw, -0.2),
          'Menton projection and balance.',
          152,
          'side',
          'Chin projection lags the ideal facial plane.',
          'Chin is balanced enough, slight under-projection.',
          'Strong chin projection on profile.',
          'Posture (ears over shoulders); consider soft mewing support.',
          'Avoid camera angles from below that shorten the chin.',
          'Chin projection is already a strong trait.',
        ),
        mk(
          'gonial',
          'Gonial angle',
          offset(profile, 0.15),
          'Jaw angle sharpness.',
          397,
          'side',
          'Gonial area looks rounded — angle lacks bite.',
          'Gonial angle is moderate.',
          'Defined gonial angle with clear shadow.',
          'Lower BF% and use rear/side light on the jaw angle.',
          'Slight stubble can fake gonial contrast if it fits your style.',
          'Angle already reads masculine/structured — maintain.',
        ),
        mk(
          'lips',
          'Lips',
          offset(presence, -0.25),
          'Lip ratio and support.',
          13,
          'front',
          'Lip ratio or support looks flat vs lower third.',
          'Lips are fine with minor ratio imbalance.',
          'Good lip support and ratio.',
          'Hydration + avoid over-smiling in scan photos.',
          'Neutral mouth; slight closed-lip posture.',
          'Lips support the lower third well already.',
        ),
        mk(
          'ramus',
          'Ramus',
          offset(jaw, 0.05),
          'Vertical jaw height contribution.',
          58,
          'side',
          'Ramus height under-contributes to lower-third power.',
          'Ramus contribution is average.',
          'Healthy ramus height supports the jaw stack.',
          'Profile photos with hair tucked behind ear to show ramus.',
          'Neck training for adjacent frame; softmax before hardmax.',
          'Ramus already helps the lower third — no priority fix.',
        ),
      ],
    },
    {
      id: 'upper',
      label: 'UPPER THIRD',
      score: upper,
      score100: to100(upper),
      photo: 'front',
      blurb: 'Forehead, hairline, brow and temples.',
      subs: [
        mk(
          'forehead',
          'Forehead',
          offset(upper, -0.1),
          'Forehead height vs midface.',
          10,
          'front',
          'Forehead height dominates the upper third.',
          'Forehead proportion is acceptable.',
          'Forehead balances well vs midface.',
          'Hairstyle with forward texture can shorten a tall forehead.',
          'Avoid slick-back if forehead already reads long.',
          'Forehead proportion is already harmonious.',
        ),
        mk(
          'hairline',
          'Hairline',
          offset(upper, 0.2),
          'Hairline shape and temple density.',
          67,
          'front',
          'Hairline/temples thin the upper frame.',
          'Hairline is okay with mild temple weakness.',
          'Strong hairline and temple density.',
          'Hair-loss protocol early; avoid tight styles that expose temples.',
          'Strategic fringe or forward crop while density recovers.',
          'Protect density — hairline is a current asset.',
        ),
        mk(
          'brow',
          'Brow',
          offset(eyes, -0.15),
          'Brow position and ridge.',
          70,
          'front',
          'Brows sit soft or uneven vs the brow ridge.',
          'Brow position is mid — shape could sharpen.',
          'Brows sit well on a clear ridge.',
          'Clean shape; keep density at the head of the brow.',
          'Align both brows to the same height in grooming.',
          'Brow game is strong — maintain the shape.',
        ),
        mk(
          'temples',
          'Temples',
          offset(upper, -0.3),
          'Temporal fullness.',
          297,
          'front',
          'Hollow temples narrow the upper face.',
          'Temples are slightly flat but acceptable.',
          'Good temporal fullness.',
          'Hairstyle volume over temples; consider softmax fillers only later.',
          'Avoid lighting that sinks the temples into shadow.',
          'Temple fullness already supports width — keep it.',
        ),
        mk(
          'upper-symmetry',
          'Upper symmetry',
          offset(symmetry, -0.05),
          'Brow/forehead left-right balance.',
          300,
          'front',
          'Left/right upper face looks mismatched.',
          'Mild upper asymmetry only.',
          'Upper third mirrors cleanly left to right.',
          'Level camera + match brow grooming.',
          'Part hair to the side that balances the weaker temple.',
          'Symmetry is fine — no action needed.',
        ),
      ],
    },
  ]

  return categories
}

/** Resolve a landmark to normalized x/y for annotation overlays. */
export function resolveLandmark(
  snap: AngleSnapshot | undefined,
  index: number,
): { x: number; y: number } | null {
  if (!snap?.landmarks?.length) return null
  const lm = snap.landmarks
  if (snap.via === 'landmarker' && lm[index]) {
    return { x: lm[index].x, y: lm[index].y }
  }
  // BlazeFace short-range keypoints: 0 rightEye, 1 leftEye, 2 nose, 3 mouth, 4 rightEar, 5 leftEar
  if (snap.via === 'detector' && lm.length >= 6) {
    const map: Record<number, number> = {
      33: 1,
      133: 1,
      159: 1,
      145: 1,
      263: 0,
      362: 0,
      1: 2,
      4: 2,
      6: 2,
      13: 3,
      14: 3,
      152: 3,
      10: 0,
      67: 4,
      297: 5,
      234: 5,
      454: 4,
      172: 5,
      397: 4,
      58: 5,
      288: 4,
      168: 2,
      48: 2,
      70: 0,
      300: 1,
    }
    const kp = lm[map[index] ?? 2]
    if (!kp) return null
    return { x: kp.x, y: kp.y }
  }
  if (lm[index]) return { x: lm[index].x, y: lm[index].y }
  return null
}

export function marksForCategory(
  category: CategoryRating,
  result: AnalysisResult,
): FaceMark[] {
  const out: FaceMark[] = []
  for (const sub of category.subs) {
    const snap = sub.photo === 'side' ? result.side : result.front
    const pt = resolveLandmark(snap, sub.landmarkIndex)
    if (!pt) continue
    out.push({
      id: sub.id,
      label: sub.label,
      x: pt.x,
      y: pt.y,
      score: sub.score,
      photo: sub.photo,
    })
  }
  return out
}

export function scoreTone(score: number): 'bad' | 'mid' | 'good' {
  if (score < 6.2) return 'bad'
  if (score < 7.8) return 'mid'
  return 'good'
}
