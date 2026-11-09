import type { AnalysisResult, AngleSnapshot, ScoreFactor } from '../lib/faceAnalysis'
import type { OnboardingAnswers } from './onboarding'

export type CategoryId = 'overall' | 'psl' | 'potential' | 'eyes' | 'midface' | 'lower' | 'upper'

export type SubRating = {
  id: string
  label: string
  score: number
  score100: number
  note: string
  why: string
  fix: string
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

function offset(base: number, delta: number) {
  return round1(clamp(base + delta, 1.4, 8.8))
}

function pick(score: number, weak: string, ok: string, strong: string) {
  if (score < 5.0) return weak
  if (score < 6.8) return ok
  return strong
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
  let potBoost = 0.05
  if (answers.looksmaxPlan === 'softmaxing' || answers.looksmaxPlan === 'natural') potBoost += 0.08
  if (answers.looksmaxPlan === 'hardmaxing') potBoost += 0.2
  const potential = round1(clamp((result.overall + best) / 2 + potBoost - 0.7, 2.0, 8.7))

  const midface = round1(clamp(proportions * 0.55 + symmetry * 0.45 - 0.7, 1.4, 8.8))
  const lower = round1(clamp(jaw * 0.65 + profile * 0.35 - 0.65, 1.4, 8.8))
  const upper = round1(clamp(presence * 0.5 + proportions * 0.3 + eyes * 0.2 - 0.7, 1.4, 8.8))
  const psl = round1(result.overall)

  const mk = (
    id: string,
    label: string,
    score: number,
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
    note: label,
    landmarkIndex,
    photo,
    why: pick(score, whyWeak, whyOk, whyStrong),
    fix: pick(score, fixWeak, fixOk, fixStrong),
  })

  return [
    {
      id: 'overall',
      label: 'OVERALL',
      score: psl,
      score100: to100(psl),
      photo: 'both',
      blurb: 'Samlet PSL. Swipe → for hvert område og hvad der løfter dig.',
      subs: [
        mk(
          'harmony',
          'Harmoni',
          offset(psl, 0.1),
          1,
          'front',
          'Trækkene spiller ikke sammen — det koster hårdt på PSL.',
          'Harmonien er middel. Ikke elite.',
          'Harmonien er blandt dine stærkere træk.',
          'Sænk ansigtsfedt, ret holdning, og vælg frisure der balancerer panden og kæben.',
          'Træn nakke + bagskulder, hold vægten stabil, finpuds bryn/hår.',
          'Vedligehold: søvn, vægt og grooming — små fald koster hurtigt tier.',
        ),
        mk(
          'front-read',
          'Front signal',
          offset(symmetry, -0.2),
          168,
          'front',
          'Frontale knogle-signaler er for bløde til høj PSL.',
          'Front er okay, men mangler “hunter” sharpness.',
          'Front signal er stærkt.',
          'Lavere bodyfat i ansigtet, skarpere bryn, eventuelt mewing-konsistens.',
          'Grooming + lean face + bedre posture (ører over skuldre).',
          'Hold lean physique — det er det der holder front-signalet.',
        ),
        mk(
          'side-read',
          'Profil',
          offset(profile, -0.25),
          152,
          'side',
          'Profilen mangler fremspring i næse/hage/kæbe.',
          'Profilen er middel — ikke model-tier.',
          'Profilen bærer godt.',
          'Mewing, tungen i loftet, næsedråbning, lean neck. Hardmax først efter soft er maxet.',
          'Fokusér hage/kæbe-definition via fedttab og nakke.',
          'Beskyt fremspringet: undgå vægtøgning i ansigtet.',
        ),
      ],
    },
    {
      id: 'psl',
      label: 'PSL',
      score: psl,
      score100: to100(psl),
      photo: 'front',
      blurb: 'Hård PSL-læsning. 10 er næsten kun AI-perfekte ansigter.',
      subs: [
        mk(
          'harmony',
          'Harmoni',
          offset(psl, 0.05),
          1,
          'front',
          'Ujævn harmoni = lavere tier. Punktum.',
          'Mid-tier harmoni.',
          'Høj harmoni — sjældent.',
          'Prioritér det svageste træk (ofte midface eller kæbe) før alt andet.',
          'Stack: lean face → frisure → bryn → posture.',
          'Hold rutinen — harmoni falder hurtigt med vægt og dårlig søvn.',
        ),
        mk(
          'dimorphism',
          'Kønstræk',
          offset(psl, -0.55),
          152,
          'front',
          'For bløde kønstræk. PSL straffer det hårdt.',
          'Der er signal, men det er ikke skarpt.',
          'Klare dimorfe træk.',
          'Mænd: lean + nakke + evt. stubskæg der markerer kæbe. Kvinder: brow/lash balance uden at blødgøre knogler.',
          'Træn frame (nakke, traps, bagskulder) og hold ansigtet magert.',
          'Behold grooming der understøtter dine knogler — ikke trends der skjuler dem.',
        ),
        mk(
          'shadow',
          'Knoglestruktur',
          offset(profile, -0.35),
          234,
          'front',
          'Knoglerne læses flade — for lidt zygoma/mandible.',
          'Strukturen er synlig, men ikke carved.',
          'Stærk knoglelæsning.',
          'Kom under ~12–15% ansigtsfedt (mænd) / tilsvarende lean look. Softmax før fillers.',
          'Konsistent deficit + styrketræning. Overvej soft contour kun som midlertidigt fix.',
          'Hold lean — struktur forsvinder med 2–3 kg i ansigtet.',
        ),
        mk(
          'tier-fit',
          'Tier',
          offset(psl, -0.3),
          10,
          'front',
          'Du er fanget under dit loft af ét svagt område.',
          'Mid-tier. Op kræver det røde område.',
          'Høj tier — men stadig under “perfect”.',
          'Løft kun det laveste punkt i 8–12 uger. Ikke 10 ting på én gang.',
          'Ugeplan: vægt, søvn, hår, det røde område.',
          'Defend tier: vægt, hår og hud først.',
        ),
      ],
    },
    {
      id: 'potential',
      label: 'POTENTIAL',
      score: potential,
      score100: to100(potential),
      photo: 'front',
      blurb: 'Hvor meget PSL du realistisk kan stige med rigtige fixes.',
      subs: [
        mk(
          'soft-ceiling',
          'Softmax loft',
          offset(potential, -0.65),
          454,
          'front',
          'Dit soft-loft er lavt, indtil fedt/hår/søvn er fikset.',
          'Der er stadig bløde points at hente.',
          'Soft er næsten maxet.',
          'Strict diet, 7–9 timers søvn, frisure til knogleform, brow shaping.',
          '12 uger: cut, gym, hudrutine, hårprotokol.',
          'Vedligehold soft — næste step er kun selektiv hardmax.',
        ),
        mk(
          'hard-ceiling',
          'Hardmax loft',
          offset(potential, 0.15),
          152,
          'side',
          'Knogleloftet er begrænset uden kliniske valg.',
          'Hardmax kunne løfte ét klart svagt punkt.',
          'Knogleloftet er allerede højt.',
          'Kun efter soft er maxet: snak med kirurg om det ENE svageste træk (ofte hage/kæbe).',
          'Research: chin/jaw vs næse — vælg det med størst PSL-ROI.',
          'Hardmax ROI er lav for dig — beskyt det du har.',
        ),
        mk(
          'consistency',
          'Stabilitet',
          offset(presence, -0.3),
          1,
          'front',
          'Dit look svinger for meget med vægt og styling.',
          'Nogenlunde stabilt look.',
          'Stabilt high-tier look.',
          'Fast frisure, fast vægtzone, fast grooming — ingen store swings.',
          'Lock en “uniform”: hår, skæg/bryn, tøjframe.',
          'Hold uniformen — stabilitet er en PSL-fordel.',
        ),
        mk(
          'leverage',
          'Størst ROI',
          offset(potential, -0.45),
          33,
          'front',
          'Du spilder tid hvis du ikke fikser det røde først.',
          'ROI ligger i 1–2 områder.',
          'Du udnytter allerede dine styrker.',
          'Åbn det røde område og kør KUN det i 30 dage.',
          'Put ugentlig indsats i gule/røde punkter.',
          'Små polish-gevinster: hud, hårkant, brow micro.',
        ),
      ],
    },
    {
      id: 'eyes',
      label: 'EYES',
      score: round1(clamp(eyes - 0.45, 1.4, 8.8)),
      score100: to100(clamp(eyes - 0.45, 1.4, 8.8)),
      photo: 'front',
      blurb: 'Øjne er top-3 for PSL. Svage øjne = lavere tier.',
      subs: [
        mk(
          'ipd',
          'Afstand',
          offset(eyes, -0.25),
          168,
          'front',
          'Øjenafstand vs ansigtsbredde er ude af elite-båndet.',
          'Afstand er acceptabel, ikke ideal.',
          'Afstand understøtter midface godt.',
          'Du kan ikke ændre IPD — kompensér med frisure/tindinge-volumen og lean kinder.',
          'Style hår så tindingerne balancerer optisk.',
          'Ingen prioritet — beskyt midface i stedet.',
        ),
        mk(
          'canthal',
          'Hældning',
          offset(eyes, -0.55),
          263,
          'front',
          'Negativ/flad canthal tilt. Det er et hårdt PSL-hit.',
          'Mild positiv tilt — ikke hunter-tier.',
          'Positiv tilt læses skarpt.',
          'Brynform opad-udad. Søvn. Undgå allergi-hævelse. Softmax før kirurgi.',
          'Groom bryn til at følge den ydre krog. Overvej laterale soft fixes kun sent.',
          'Behold søvn/hud — tilt er en asset.',
        ),
        mk(
          'openness',
          'Åbenhed',
          offset(eyes, -0.35),
          159,
          'front',
          'Smalle/trætte øjne sænker presence hårdt.',
          'Åbenhed er middel.',
          'God aperture.',
          'Søvn, salt/alkohol ned, allergi-kontrol. Eventuelt ptosis-vurdering hvis det er strukturelt.',
          'Hudpleje + konsekvent søvn i 4 uger før du overvejer mere.',
          'Hold vanerne — åbenhed er din styrke.',
        ),
        mk(
          'spacing',
          'Balance',
          offset(eyes, -0.4),
          133,
          'front',
          'Ujævn øjenbalance trækker symmetri og PSL.',
          'Små forskelle — synlige i close-up.',
          'Fin balance.',
          'Du kan ikke flytte knogler selv — fokusér bryn ens, og undgå vaner der forstærker den ene side (tyg, sove-side).',
          'Gør bryn/skin-care ens på begge sider.',
          'Ingen action — symmetri er god.',
        ),
        mk(
          'symmetry-eyes',
          'Symmetri',
          offset(symmetry, -0.35),
          33,
          'front',
          'Én side af øjnene er klart svagere.',
          'Mild asymmetri.',
          'Stærk øjen-symmetri.',
          'Tyg jævnt, skift sove-side, hold bryn spejlede. Store forskelle = faglig vurdering.',
          'Micro-grooming for at matche den stærke side.',
          'Vedligehold — det er en PSL-fordel.',
        ),
      ],
    },
    {
      id: 'midface',
      label: 'MIDFACE',
      score: midface,
      score100: to100(midface),
      photo: 'front',
      blurb: 'Midface er PSL-kerne. Flad midte = svært at mogge.',
      subs: [
        mk(
          'cheekbones',
          'Kindben',
          offset(midface, 0.05),
          234,
          'front',
          'For lidt zygoma. Ansigter uden cheek pop scorer lavere.',
          'Kindben findes, men er ikke carved.',
          'Tydelig zygoma.',
          'Lean face først. Softmax: posture. Hardmax/fillers kun hvis soft er maxet og det stadig mangler.',
          'Cut + styrketræning. Undgå bloat.',
          'Hold lean — cheek loss er det første der forsvinder.',
        ),
        mk(
          'maxilla',
          'Maxilla',
          offset(midface, -0.55),
          4,
          'front',
          'Recessed midface-læsning. Stort PSL-anker.',
          'Maxilla er middel.',
          'God forward growth-læsning.',
          'Mewing-konsistens, næsedråbning, undgå mundånding. Hardmax er sidste udvej.',
          'Tongue posture hver dag + lean neck.',
          'Strukturen er stærk — beskyt den med lean vægt.',
        ),
        mk(
          'nose',
          'Næse',
          offset(proportions, -0.45),
          1,
          'front',
          'Næsen kæmper med harmoni — trækker midface.',
          'Næsen er acceptabel i stacken.',
          'Næsen passer.',
          'Du ændrer ikke næsen soft. Hvis den er #1 problem efter soft max: rhino er den ærlige hardmax.',
          'Fokusér i stedet på kinder/kæbe hvis næsen kun er mid-issue.',
          'Lav prioritet — brug energi på svagere træk.',
        ),
        mk(
          'fwhr',
          'Bredde (fWHR)',
          offset(proportions, -0.15),
          454,
          'front',
          'For smalt/langt ansigt ift. elite fWHR.',
          'fWHR er middel.',
          'Gunstig bredde.',
          'Lean face + frisure med sidevolumen. Frame-træning (skuldre) hjælper det samlede look.',
          'Hold low BF så bredden ikke “smelter”.',
          'Hold vægt — din ratio er en asset.',
        ),
        mk(
          'compactness',
          'Kompakthed',
          offset(midface, -0.6),
          48,
          'front',
          'For lang midface. Ser “strakt” ud — PSL hader det.',
          'Lidt for strakt, men okay.',
          'Kompakt midface.',
          'Frisure der ikke forlænger panden. Lean lower face. Undgå vægt der fylder under øjnene.',
          'Hår + lean + posture for at forkorte det visuelle midtparti.',
          'Behold kompaktheden — det er elite-signal.',
        ),
      ],
    },
    {
      id: 'lower',
      label: 'LOWER THIRD',
      score: lower,
      score100: to100(lower),
      photo: 'side',
      blurb: 'Kæbe/hage er PSL-power. Blød underdel = lavere tier.',
      subs: [
        mk(
          'jawline',
          'Kæbe',
          offset(jaw, -0.3),
          172,
          'side',
          'Kæben er for blød. Det er et af de dyreste PSL-hits.',
          'Kæben er synlig, ikke razor.',
          'Skarp mandible.',
          'Cut ansigtsfedt, træn nakke, salt/alkohol ned. Softmax før implants.',
          '8–12 ugers lean + nakke. Stubskæg kun hvis det skærper vinklen.',
          'Hold BF% — kæben er din penge.',
        ),
        mk(
          'chin',
          'Hage',
          offset(jaw, -0.55),
          152,
          'side',
          'Under-projected hage. Profilen falder sammen.',
          'Hagen er næsten nok.',
          'Stærk hageprojektion.',
          'Mewing + lean. Hvis soft maxet og stadig short: chin filler/implant er den direkte PSL-fix.',
          'Posture + tongue posture dagligt.',
          'Hagen er stark — beskyt med lean vægt.',
        ),
        mk(
          'gonial',
          'Gonial vinkel',
          offset(profile, -0.35),
          397,
          'side',
          'Rund gonial — mangler “bite”.',
          'Vinklen er middel.',
          'Defineret gonial.',
          'Lean + nakke. Masseter-chewing er overhyped; fokusér fedt og frame. Hardmax angle kun sent.',
          'Cut + evt. let stub der markerer vinklen.',
          'Vedligehold lean — vinklen forsvinder med bloat.',
        ),
        mk(
          'lips',
          'Læber',
          offset(presence, -0.55),
          13,
          'front',
          'Læberne understøtter ikke lower third.',
          'Læberne er okay.',
          'God lip support.',
          'Hydrering, undgå mundånding. Fillers kun hvis ratio er klart off efter soft.',
          'Simple lip care + neutral mundhvile.',
          'Ingen prioritet.',
        ),
        mk(
          'ramus',
          'Ramus',
          offset(jaw, -0.4),
          58,
          'side',
          'Lav ramus-læsning — less jaw power.',
          'Ramus er middel.',
          'God ramus-højde.',
          'Du ændrer ikke ramus soft. Løft synlig kæbe via lean/nakke; hardmax kun hvis det er dit #1 anker.',
          'Max soft first: BF% + neck.',
          'Lav prioritet.',
        ),
      ],
    },
    {
      id: 'upper',
      label: 'UPPER THIRD',
      score: upper,
      score100: to100(upper),
      photo: 'front',
      blurb: 'Pande, hår og bryn — ofte undervurderet for PSL.',
      subs: [
        mk(
          'forehead',
          'Pande',
          offset(upper, -0.4),
          10,
          'front',
          'For høj/dominerende pande sænker upper harmony.',
          'Pandeproportion er middel.',
          'Panden balancerer.',
          'Frisure med forward texture. Undgå slick-back hvis panden er høj.',
          'Find en cut der forkorter panden visuelt.',
          'Behold stylen — panden er fin.',
        ),
        mk(
          'hairline',
          'Hårlinje',
          offset(upper, -0.2),
          67,
          'front',
          'Tynde tindinger/hårlinje = instant PSL-drop.',
          'Hårlinjen er okay med mild temple weakness.',
          'Stærk hårlinje.',
          'Start hårtabsprotokol tidligt (derm/minoxidil efter råd). Undgå tight styles.',
          'Strategic fringe mens density bygges. Tag det seriøst — hår er PSL.',
          'Beskyt density som en asset.',
        ),
        mk(
          'brow',
          'Bryn',
          offset(eyes, -0.45),
          70,
          'front',
          'Bløde/ujævne bryn svækker hunter-read.',
          'Bryn er middel.',
          'Bryn støtter ridge godt.',
          'Sharper brow shape, behold density forrest, match højde.',
          'Professionel brow shaping én gang, så vedligehold.',
          'Behold formen.',
        ),
        mk(
          'temples',
          'Tindinger',
          offset(upper, -0.6),
          297,
          'front',
          'Hule tindinger gør dig smallere og ældre i PSL.',
          'Tindinger lidt flade.',
          'God temporal fylde.',
          'Hårvolumen over tindinger. Softmax fillers kun hvis hår ikke kan skjule det.',
          'Cut + styling der fylder temporalt.',
          'Fylde er god — hold håret.',
        ),
        mk(
          'upper-symmetry',
          'Øvre symmetri',
          offset(symmetry, -0.35),
          300,
          'front',
          'Skæv upper third er synlig i PSL-reads.',
          'Mild asymmetri.',
          'Ren spejling.',
          'Match bryn, part hår til den svage side, tyg jævnt.',
          'Grooming der balancerer den svage temple/brow.',
          'Ingen ændring nødvendig.',
        ),
      ],
    },
  ]
}

export function resolveLandmark(
  snap: AngleSnapshot | undefined,
  index: number,
): { x: number; y: number } | null {
  if (!snap?.landmarks?.length) return null
  const lm = snap.landmarks
  if (snap.via === 'landmarker' && lm[index]) {
    return { x: lm[index].x, y: lm[index].y }
  }
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
  if (score < 5.0) return 'bad'
  if (score < 6.8) return 'mid'
  return 'good'
}
