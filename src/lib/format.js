import { round } from './calc.js'

const nf = (d) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 })

export function fmtMoney(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  return nf(d).format(round(Number(n), d))
}

export function fmtPct(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  return `${nf(d).format(round(Number(n), d))}%`
}

/** نقاط مئوية مع إشارة */
export function fmtPts(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  const v = round(Number(n), d)
  return `${v > 0 ? '+' : ''}${nf(d).format(v)} نقطة`
}

export function fmtSigned(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  const v = round(Number(n), d)
  return `${v > 0 ? '+' : ''}${nf(d).format(v)}`
}

export function fmtDate(s) {
  if (!s) return '—'
  return String(s).slice(0, 10)
}

export function fmtDateTime(s) {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`
}

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** ألوان النبرات الدلالية (فئات المؤشرات) */
export const TONES = {
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  green: 'bg-green-50 text-green-800 ring-green-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
}
