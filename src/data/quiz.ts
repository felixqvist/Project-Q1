export type QuizQuestion = {
  id: string
  prompt: string
  hint?: string
  options: { id: string; label: string }[]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'goal',
    prompt: 'Hvad vil du bruge scannen til?',
    hint: 'Vælg det der passer bedst lige nu.',
    options: [
      { id: 'curious', label: 'Bare nysgerrig på mit look' },
      { id: 'selfies', label: 'Bedre selfies / content' },
      { id: 'dating', label: 'Mere confidence til dating' },
      { id: 'psl', label: 'Forstå PSL / looksmax-sprog' },
    ],
  },
  {
    id: 'exposure',
    prompt: 'Hvor ofte ser du looksmax / mewing / PSL på TikTok eller Google?',
    options: [
      { id: 'never', label: 'Næsten aldrig' },
      { id: 'weekly', label: 'Et par gange om ugen' },
      { id: 'daily', label: 'Dagligt' },
      { id: 'heavy', label: 'Flere timer om ugen' },
    ],
  },
  {
    id: 'pslKnow',
    prompt: 'Kender du PSL-skalaen?',
    hint: 'PSL er et community-ratingssystem (typisk 1–8), ikke videnskab.',
    options: [
      { id: 'no', label: 'Nej, første gang' },
      { id: 'heard', label: 'Har hørt om den' },
      { id: 'use', label: 'Ja, jeg bruger den' },
    ],
  },
  {
    id: 'focus',
    prompt: 'Hvad vil du gerne have feedback på først?',
    options: [
      { id: 'jaw', label: 'Kæbe / sideprofil' },
      { id: 'eyes', label: 'Øjne / blik' },
      { id: 'skin', label: 'Hud / presence' },
      { id: 'symmetry', label: 'Symmetri / helhed' },
    ],
  },
  {
    id: 'sleep',
    prompt: 'Hvor meget sover du typisk?',
    options: [
      { id: 'low', label: 'Under 6 timer' },
      { id: 'mid', label: '6–7 timer' },
      { id: 'good', label: '7–8 timer' },
      { id: 'great', label: '8+ timer' },
    ],
  },
  {
    id: 'routine',
    prompt: 'Hvilken soft-max routine har du allerede?',
    options: [
      { id: 'none', label: 'Ingen særlig' },
      { id: 'skincare', label: 'Hudpleje / SPF' },
      { id: 'gym', label: 'Træning / posture' },
      { id: 'both', label: 'Hud + træning' },
    ],
  },
]
