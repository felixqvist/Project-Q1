export type StatCard = {
  value: string
  label: string
  detail: string
  source: string
}

/** Publicly reported looksmaxxing / PSL figures for the dashboard. Demo context only. */
export const LOOKSMAX_STATS: StatCard[] = [
  {
    value: '301k',
    label: 'månedlige Google-søgninger',
    detail: '“looksmaxxing” er den største maxxing-søgeterm i Rising Trends-data.',
    source: 'Rising Trends',
  },
  {
    value: '12.1k',
    label: 'søgninger på PSL-skala',
    detail: 'PSL-rating-søgninger er steget fra næsten nul til ~12.100/md. på 18 måneder.',
    source: 'Rising Trends',
  },
  {
    value: '13.3B',
    label: 'TikTok-visninger · #PSL',
    detail: 'Hashtag #PSL havde milliarder af views (data indsamlet sep. 2024).',
    source: 'SAGE / TikTok study',
  },
  {
    value: '3.5B',
    label: 'views · #Looksmaxing',
    detail: '#Looksmaxing og #Lookmaxing ligger samlet i milliard-klassen på TikTok.',
    source: 'SAGE / TikTok study',
  },
  {
    value: '22.1B',
    label: 'views · #Mewing',
    detail: 'Mewing er stadig det største beslægtede hashtag — ofte indgangen til looksmax-content.',
    source: 'SAGE / TikTok study',
  },
  {
    value: '+170%',
    label: '“how to looksmaxx”',
    detail: 'Google-søgninger på “how to looksmaxx” er steget ca. 170% over fem år.',
    source: 'Bustle / Google trends coverage',
  },
  {
    value: '1–8',
    label: 'klassisk PSL-skala',
    detail: 'PSL graderer typisk ansigt ud fra harmony, angularity, dimorphism m.m. (pseudovidenskabeligt).',
    source: 'GQ / Conversation',
  },
  {
    value: '~93%',
    label: 'kaldes “normie”-båndet',
    detail: 'I populære PSL-guides falder langt de fleste (~1.5–5.5) i “normie”-intervallet.',
    source: 'Looksmax.org guide via GQ',
  },
]

export const PSL_TIERS = [
  { range: '0–1.5', name: 'Sub5 / low', note: 'Ofte beskrevet som “meget under gennemsnit” i community-guides' },
  { range: '1.5–5.5', name: 'Normie', note: 'Største gruppe — low / mid / high-tier' },
  { range: '5.5–7', name: 'Chadlite', note: 'Over gennemsnit i community-sprog' },
  { range: '7–8+', name: 'Chad / PSL God', note: 'Toppen af skalaen i looksmax-lingo' },
]
