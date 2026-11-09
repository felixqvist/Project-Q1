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

/** Keep subs related but slightly different — and keep them harsh. */
function offset(base: number, delta: number) {
  return round1(clamp(base + delta, 1.8, 9.3))
}

function pick(score: number, weak: string, ok: string, strong: string) {
  if (score < 5.5) return weak
  if (score < 7.2) return ok
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
  let potBoost = 0.1
  if (answers.looksmaxPlan === 'softmaxing' || answers.looksmaxPlan === 'natural') potBoost += 0.1
  if (answers.looksmaxPlan === 'hardmaxing') potBoost += 0.25
  const potential = round1(clamp((result.overall + best) / 2 + potBoost - 0.4, 2.5, 9.2))

  const midface = round1(clamp(proportions * 0.55 + symmetry * 0.45 - 0.35, 1.8, 9.3))
  const lower = round1(clamp(jaw * 0.65 + profile * 0.35 - 0.3, 1.8, 9.3))
  const upper = round1(clamp(presence * 0.5 + proportions * 0.3 + eyes * 0.2 - 0.35, 1.8, 9.3))
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
      blurb: 'Din samlede score. Swipe → for hvert område på dit billede.',
      subs: [
        mk(
          'harmony',
          'Harmoni',
          offset(psl, 0.15),
          1,
          'front',
          'Ansigtets dele matcher ikke helt — det trækker scoren ned.',
          'Harmonien er okay, men ikke skarp.',
          'Delene i ansigtet passer godt sammen.',
          'Tag billeder med lige belysning og kamera i øjenhøjde.',
          'Brug blødt lys fra siden, så knoglerne ses tydeligere.',
          'Behold samme lys — det virker allerede godt.',
        ),
        mk(
          'front-read',
          'Front',
          offset(symmetry, -0.1),
          168,
          'front',
          'Frontbilledet er ikke skarpt nok til en høj score.',
          'Frontbilledet er fint, men kan blive skarpere.',
          'Frontbilledet er tydeligt og stærkt.',
          'Kig lige ind i kameraet. Lys begge sider af ansigtet ens.',
          'Løft hagen lidt og undgå hårdt lys ovenfra.',
          'Brug samme front-setup næste gang.',
        ),
        mk(
          'side-read',
          'Side',
          offset(profile, -0.15),
          152,
          'side',
          'Sideprofilen er svær at læse — kæbe/næse mister score.',
          'Siden er okay, men linjerne kunne være skarpere.',
          'Sideprofilen er klar.',
          'Drej hovedet ca. 90°. Træk håret væk. Brug blødt lys foran.',
          'Brug mørkere baggrund, så kanten af ansigtet ses.',
          'Behold denne sidevinkel.',
        ),
      ],
    },
    {
      id: 'psl',
      label: 'PSL',
      score: psl,
      score100: to100(psl),
      photo: 'front',
      blurb: 'Hvor stærkt dit look scorer. 10 er næsten umuligt.',
      subs: [
        mk(
          'harmony',
          'Harmoni',
          offset(psl, 0.1),
          1,
          'front',
          'Trækkene sidder lidt skævt ift. hinanden.',
          'Harmonien er middel.',
          'Harmonien er stærk.',
          'Fokusér på midterste del af ansigtet og jævnt lys.',
          'Træn holdning og vælg en frisure der balancerer ansigtet.',
          'Hold vægt og frisure stabile.',
        ),
        mk(
          'dimorphism',
          'Kønstræk',
          offset(psl, -0.45),
          152,
          'front',
          'Kæbe/bryn læses blødt — scoren falder.',
          'Kønstrækkene er synlige, men ikke skarpe.',
          'Tydelige, stærke træk.',
          'Form bryn, hold lav fedtprocent i ansigtet, brug sidelys.',
          'Træn nakke/skuldre og hold ansigtet magert.',
          'Behold grooming der allerede virker.',
        ),
        mk(
          'shadow',
          'Skygger',
          offset(profile, -0.2),
          234,
          'front',
          'Fladt lys vasker knoglerne væk.',
          'Der er lidt struktur, men skyggerne er svage.',
          'Skyggerne viser kindben og kæbe godt.',
          'Sæt lyset 45° fra siden — undgå blitz lige forfra.',
          'Lidt mere sidelys på kindben og kæbe.',
          'Behold det retningsbestemte lys.',
        ),
        mk(
          'tier-fit',
          'Niveau',
          offset(psl, -0.2),
          10,
          'front',
          'Det svageste område holder dig nede.',
          'Middel niveau — der er plads op.',
          'Du ligger højt, men 10 kræver næsten perfektion.',
          'Løft det laveste område først — det rykker mest.',
          'Start med øjne eller kæbe, alt efter hvad der er rødt.',
          'Beskyt hår og vægt, så niveauet holder.',
        ),
      ],
    },
    {
      id: 'potential',
      label: 'POTENTIAL',
      score: potential,
      score100: to100(potential),
      photo: 'front',
      blurb: 'Hvor meget du kan stige, hvis du forbedrer de røde områder.',
      subs: [
        mk(
          'soft-ceiling',
          'Uden kirurgi',
          offset(potential, -0.55),
          454,
          'front',
          'Søvn, fedt og frisure trækker dig ned lige nu.',
          'Der er stadig tydelige bløde gevinster.',
          'Du er tæt på dit bløde loft.',
          'Sov bedre, spis renere, find en frisure der passer til dit ansigt.',
          'Lav en 12-ugers plan: vægt, træning, hud og hår.',
          'Vedligehold — de nemme greb er næsten brugt.',
        ),
        mk(
          'hard-ceiling',
          'Med kirurgi',
          offset(potential, 0.25),
          152,
          'side',
          'Profilen har huller som soft fixes ikke løser alene.',
          'Udvalgte kliniske valg kunne løfte det svageste område.',
          'Knoglerne bærer allerede et højt loft.',
          'Prøv bløde ændringer mindst 1 år før du overvejer mere.',
          'Hvis du går videre: start med det laveste punkt (ofte kæbe/hage).',
          'Kirurgi giver lidt ekstra her — beskyt det du har.',
        ),
        mk(
          'consistency',
          'Stabilitet',
          offset(presence, -0.15),
          1,
          'front',
          'Front og side fortæller to forskellige historier.',
          'Vinklerne er næsten enige.',
          'Front og side matcher godt.',
          'Tag begge billeder i samme rum med samme lys.',
          'Hold kameraet i samme højde på begge billeder.',
          'Dine to vinkler understøtter hinanden.',
        ),
        mk(
          'leverage',
          'Størst effekt',
          offset(potential, -0.35),
          33,
          'front',
          'Ét svagt træk trækker hele scoren ned.',
          'Størst effekt ligger i 1–2 områder nedenfor.',
          'Du får allerede god effekt af små forbedringer.',
          'Åbn det røde område næste slide og følg “Sådan forbedrer du det”.',
          'Brug ugen på de gule/røde punkter på kortet.',
          'Fortsæt med hår + lys — det betaler sig.',
        ),
      ],
    },
    {
      id: 'eyes',
      label: 'EYES',
      score: round1(clamp(eyes - 0.25, 1.8, 9.3)),
      score100: to100(clamp(eyes - 0.25, 1.8, 9.3)),
      photo: 'front',
      blurb: 'Afstand, hældning, åbenhed og venstre/højre match.',
      subs: [
        mk(
          'ipd',
          'Afstand',
          offset(eyes, -0.1),
          168,
          'front',
          'Afstanden mellem øjnene passer ikke helt til ansigtsbredden.',
          'Afstanden er okay.',
          'Afstanden passer godt.',
          'Vælg en frisure der rammer tindingerne ind eller ud.',
          'Undgå ekstrem nærbillede — det forstørrer afstanden.',
          'Behold den framing du har.',
        ),
        mk(
          'canthal',
          'Hældning',
          offset(eyes, -0.4),
          263,
          'front',
          'Ydre øjenkroge ser flade eller lidt nedad.',
          'Lidt positiv hældning — ikke skarp endnu.',
          'Hældningen ser skarp og vågen ud.',
          'Form brynene opad udad. Sov mere.',
          'Lad brynene følge den ydre øjenkrog.',
          'Hold søvn og hudrolig — hældningen er fin.',
        ),
        mk(
          'openness',
          'Åbenhed',
          offset(eyes, -0.2),
          159,
          'front',
          'Øjnene ser trætte eller smalle ud.',
          'Åbenheden er middel.',
          'Øjnene ser åbne og klare ud.',
          'Søvn, mindre allergi, undgå hårdt lys ovenfra.',
          'Vip hovedet en smule ned i billedet.',
          'Behold dette udtryk.',
        ),
        mk(
          'spacing',
          'Balance',
          offset(eyes, -0.3),
          133,
          'front',
          'Venstre/højre side af øjnene matcher ikke helt.',
          'Små forskelle — normalt, men synligt tæt på.',
          'Balancen er fin.',
          'Hold kameraet lige. Ret hovedet.',
          'Gør brynene ens i højde.',
          'Ingen ændring nødvendig.',
        ),
        mk(
          'symmetry-eyes',
          'Symmetri',
          offset(symmetry, -0.2),
          33,
          'front',
          'Ét øje sidder højere eller ser anderledes ud.',
          'Lidt asymmetri — helt almindeligt.',
          'Øjnene matcher godt.',
          'Ret hovedet og kameraet før næste scan.',
          'Gør brynene ens.',
          'Symmetri er en styrke — behold jævnt lys.',
        ),
      ],
    },
    {
      id: 'midface',
      label: 'MIDFACE',
      score: midface,
      score100: to100(midface),
      photo: 'front',
      blurb: 'Kinder, midte, næse og “tæthed” i midteransigtet.',
      subs: [
        mk(
          'cheekbones',
          'Kindben',
          offset(midface, 0.15),
          234,
          'front',
          'Kindbenene ses næsten ikke.',
          'Kindbenene er der, men ikke skarpe.',
          'Kindbenene står tydeligt.',
          'Lavere ansigtsfedt + lys fra 45°.',
          'Ret holdningen, så midteransigtet kommer frem.',
          'Behold lyset der allerede viser kinderne.',
        ),
        mk(
          'maxilla',
          'Midte',
          offset(midface, -0.4),
          4,
          'front',
          'Midteransigtet ser lidt tilbagetrukket ud.',
          'Midten er middel.',
          'Midten ser stærk og fremme ud.',
          'Luk munden i hvile. Træk vejret gennem næsen.',
          'Tjek sideprofil en gang om måneden i samme lys.',
          'Strukturen er allerede stærk her.',
        ),
        mk(
          'nose',
          'Næse',
          offset(proportions, -0.35),
          1,
          'front',
          'Næsen fylder for meget ift. resten.',
          'Næsen er okay i ansigtet.',
          'Næsen passer godt.',
          'Hold kameraet lidt over øjenhøjde.',
          'Undgå vidvinkel tæt på — det gør næsen større.',
          'Næsen er balanceret — lav prioritet.',
        ),
        mk(
          'fwhr',
          'Bredde',
          offset(proportions, 0.05),
          454,
          'front',
          'Ansigtet ser for langt eller for smalt ud.',
          'Bredde/højde er middel.',
          'Bredden passer godt.',
          'Mere volumen i siderne af håret kan hjælpe visuelt.',
          'Hold ansigtet magert, så bredden står frem.',
          'Hold vægten — ratioen er god.',
        ),
        mk(
          'compactness',
          'Tæthed',
          offset(midface, -0.5),
          48,
          'front',
          'Midteransigtet ser langt og “tyndt” ud.',
          'Lidt strakt, men okay.',
          'Midten ser kompakt og stærk ud.',
          'Frisure der ikke forlænger panden ekstra.',
          'Hagen en smule ned i billedet.',
          'Tæthed er en styrke her.',
        ),
      ],
    },
    {
      id: 'lower',
      label: 'LOWER THIRD',
      score: lower,
      score100: to100(lower),
      photo: 'side',
      blurb: 'Kæbe, hage, vinkel og læber.',
      subs: [
        mk(
          'jawline',
          'Kæbe',
          offset(jaw, -0.15),
          172,
          'side',
          'Kæbelinjen forsvinder ind i halsen.',
          'Kæben ses, men er ikke skarp.',
          'Kæbelinjen er skarp.',
          'Lavere ansigtsfedt, træn nakke, brug lys under kæben.',
          'Ren sideprofil med blødt lys foran ansigtet.',
          'Hold vægten — kæben popper allerede.',
        ),
        mk(
          'chin',
          'Hage',
          offset(jaw, -0.4),
          152,
          'side',
          'Hagen stikker ikke nok frem i profil.',
          'Hagen er næsten balanceret.',
          'Hagen er stærk i profil.',
          'Ret holdningen (ører over skuldre).',
          'Undgå kamera nedefra — det gør hagen mindre.',
          'Hagen er allerede en styrke.',
        ),
        mk(
          'gonial',
          'Kæbevinkel',
          offset(profile, -0.2),
          397,
          'side',
          'Vinklen ved kæben er blød.',
          'Vinklen er middel.',
          'Vinklen er tydelig.',
          'Lavere fedtprocent + lys bagfra/siden på kæben.',
          'Let skægstub kan skabe kontrast, hvis det passer dig.',
          'Vinklen er fin — vedligehold.',
        ),
        mk(
          'lips',
          'Læber',
          offset(presence, -0.45),
          13,
          'front',
          'Læberne støtter den nederste del dårligt.',
          'Læberne er okay.',
          'Læberne passer godt.',
          'Drik vand. Hold munden afslappet på billedet.',
          'Neutralt lukket mund — ikke smil for stort.',
          'Læberne understøtter allerede godt.',
        ),
        mk(
          'ramus',
          'Kæbehøjde',
          offset(jaw, -0.25),
          58,
          'side',
          'Den bageste del af kæben ser lav ud.',
          'Højden er middel.',
          'Højden støtter kæben godt.',
          'Tag håret bag øret, så siden ses.',
          'Træn nakke/frame først — bløde greb før hårde.',
          'Ingen prioritet her.',
        ),
      ],
    },
    {
      id: 'upper',
      label: 'UPPER THIRD',
      score: upper,
      score100: to100(upper),
      photo: 'front',
      blurb: 'Pande, hårlinje, bryn og tindinger.',
      subs: [
        mk(
          'forehead',
          'Pande',
          offset(upper, -0.3),
          10,
          'front',
          'Panden fylder for meget.',
          'Pandens størrelse er okay.',
          'Panden passer til resten.',
          'Frisure med lidt volumen foran kan gøre panden mindre.',
          'Undgå helt glat tilbagekæmmet hår, hvis panden er høj.',
          'Panden er balanceret.',
        ),
        mk(
          'hairline',
          'Hårlinje',
          offset(upper, -0.1),
          67,
          'front',
          'Hårlinje/tindinger gør den øvre del tynd.',
          'Hårlinjen er okay med lidt svage tindinger.',
          'Stærk hårlinje.',
          'Start tidligt med hårtab-plan. Undgå stramme styles.',
          'Let pandehår mens tætheden bygges op.',
          'Beskyt tætheden — det er en asset.',
        ),
        mk(
          'brow',
          'Bryn',
          offset(eyes, -0.35),
          70,
          'front',
          'Brynene er bløde eller ujævne.',
          'Brynene er middel — formen kan skærpes.',
          'Brynene sidder godt.',
          'Rens formen. Behold tæthed forrest.',
          'Gør begge bryn samme højde.',
          'Behold formen.',
        ),
        mk(
          'temples',
          'Tindinger',
          offset(upper, -0.5),
          297,
          'front',
          'Hule tindinger gør ansigtet smallere.',
          'Tindingerne er lidt flade.',
          'God fylde i tindingerne.',
          'Mere hårvolumen over tindingerne.',
          'Undgå lys der graver tindingerne ind i skygge.',
          'Fylde er fin — behold den.',
        ),
        mk(
          'upper-symmetry',
          'Øvre symmetri',
          offset(symmetry, -0.25),
          300,
          'front',
          'Venstre og højre side øverst matcher ikke.',
          'Lidt forskel — okay.',
          'Den øvre del spejler fint.',
          'Ret kameraet. Gør brynene ens.',
          'Skill håret til den side der balancerer bedst.',
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
  if (score < 5.5) return 'bad'
  if (score < 7.0) return 'mid'
  return 'good'
}
