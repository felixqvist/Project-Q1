export type Gender = 'male' | 'female' | 'other' | 'prefer_not'

export type LooksmaxPlan = 'softmaxing' | 'natural' | 'hardmaxing'

export type IdolId =
  | 'henry-cavill'
  | 'jordan-barrett'
  | 'clark-kent'
  | 'chris-hemsworth'
  | 'jacob-elordi'
  | 'brad-pitt'
  | 'sean-opry'
  | 'chico-lachowski'
  | 'david-gandy'
  | 'zendaya'
  | 'ana-de-armas'
  | 'sydney-sweeney'

export type OnboardingAnswers = {
  name: string
  gender: Gender | ''
  birthDay: string
  birthMonth: string
  birthYear: string
  heightUnit: 'cm' | 'ftin'
  heightCm: string
  heightFt: string
  heightIn: string
  weightUnit: 'kg' | 'lb'
  weight: string
  looksmaxPlan: LooksmaxPlan | ''
  idol: IdolId | ''
  preferPsl: 'with' | 'without' | ''
}

export const EMPTY_ANSWERS: OnboardingAnswers = {
  name: '',
  gender: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  heightUnit: 'cm',
  heightCm: '178',
  heightFt: '5',
  heightIn: '10',
  weightUnit: 'kg',
  weight: '75',
  looksmaxPlan: '',
  idol: '',
  preferPsl: '',
}

export const IDOLS: { id: IdolId; name: string; img: string }[] = [
  { id: 'henry-cavill', name: 'Henry Cavill', img: '/idols/henry.jpg' },
  { id: 'jordan-barrett', name: 'Jordan Barrett', img: '/idols/jordan.jpg' },
  { id: 'clark-kent', name: 'Clark Kent (Smallville)', img: '/idols/clark.jpg' },
  { id: 'chris-hemsworth', name: 'Chris Hemsworth', img: '/idols/hemsworth.jpg' },
  { id: 'jacob-elordi', name: 'Jacob Elordi', img: '/idols/elordi.jpg' },
  { id: 'brad-pitt', name: 'Brad Pitt', img: '/idols/brad.jpg' },
  { id: 'sean-opry', name: "Sean O'Pry", img: '/idols/sean.jpg' },
  { id: 'chico-lachowski', name: 'Chico Lachowski', img: '/idols/chico.jpg' },
  { id: 'david-gandy', name: 'David Gandy', img: '/idols/gandy.jpg' },
  { id: 'zendaya', name: 'Zendaya', img: '/idols/zendaya.jpg' },
  { id: 'ana-de-armas', name: 'Ana de Armas', img: '/idols/ana.jpg' },
  { id: 'sydney-sweeney', name: 'Sydney Sweeney', img: '/idols/sydney.jpg' },
]

export function isAdult(answers: OnboardingAnswers): boolean {
  const y = Number(answers.birthYear)
  const m = Number(answers.birthMonth)
  const d = Number(answers.birthDay)
  if (!y || !m || !d) return false
  const born = new Date(y, m - 1, d)
  if (Number.isNaN(born.getTime())) return false
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const md = now.getMonth() - born.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < born.getDate())) age -= 1
  return age >= 18
}

export const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))
export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
export const YEARS = Array.from({ length: 80 }, (_, i) => String(2020 - i))
