import { fmtMoney, fmtPct } from './format.js'
import { byDateDesc } from './analytics.js'

/** ألوان الأدوار الثابتة (من لوحة الألوان المعتمدة) */
export const ROLE = { company: '#257de0', reflected: '#f47230', remaining: '#00b894', price: '#257de0', alert: '#ec4647', neutral: '#94a3b8' }

const pctTick = { callback: (v) => `${v}%` }
const moneyTick = { callback: (v) => fmtMoney(v, 0) }

export function barOptions({ horizontal = false, pct = false, legend = true, stacked = false } = {}) {
  const valueAxis = { beginAtZero: true, ticks: pct ? pctTick : moneyTick, grid: { color: '#eef2f6' }, border: { display: false } }
  const catAxis = { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, font: { size: 11 } }, stacked }
  return {
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'nearest', intersect: false, axis: horizontal ? 'y' : 'x' },
    plugins: {
      legend: { display: legend },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${pct ? fmtPct(c.raw) : fmtMoney(c.raw)}` } },
    },
    scales: horizontal ? { x: { ...valueAxis, stacked }, y: { ...catAxis, reverse: false } } : { x: catAxis, y: { ...valueAxis, stacked } },
  }
}

export function lineOptions({ pct = false } = {}) {
  return {
    interaction: { mode: 'index', intersect: false },
    plugins: { tooltip: { callbacks: { label: (c) => (c.raw == null ? null : `${c.dataset.label}: ${pct ? fmtPct(c.raw) : fmtMoney(c.raw)}`) } } },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
      y: { ticks: pct ? pctTick : moneyTick, grid: { color: '#eef2f6' }, border: { display: false } },
    },
    spanGaps: true,
  }
}

/** أسعار بيع منتج واحد لدى المذاخر (أحدث متابعة لكل مذخر) */
export function priceByDistributorData(latest) {
  const rows = [...latest].sort((a, b) => a.sellingPrice - b.sellingPrice)
  return {
    labels: rows.map((e) => e.distributorName),
    datasets: [
      { label: 'سعر البيع للصيدلية', data: rows.map((e) => e.sellingPrice), backgroundColor: ROLE.price, maxBarThickness: 26 },
      { label: 'سعر شراء المذخر', data: rows.map((e) => e.purchasePrice), backgroundColor: '#cbd5e1', maxBarThickness: 26 },
    ],
  }
}

/** خصم الشركة / المعكوس / المتبقي لكل مذخر */
export function discountByDistributorData(rows) {
  return {
    labels: rows.map((r) => r.label),
    datasets: [
      { label: 'خصم الشركة', data: rows.map((r) => r.company), backgroundColor: ROLE.company, maxBarThickness: 22 },
      { label: 'الخصم المعكوس', data: rows.map((r) => r.reflected), backgroundColor: ROLE.reflected, maxBarThickness: 22 },
      { label: 'الخصم المتبقي', data: rows.map((r) => r.remaining), backgroundColor: ROLE.remaining, maxBarThickness: 22 },
    ],
  }
}

/** تغير سعر البيع بمرور الوقت — سلسلة لكل مذخر */
export function priceOverTimeData(entries, colorOf, field = 'sellingPrice', maxSeries = 8) {
  const dates = [...new Set(entries.map((e) => e.date))].sort()
  const byDist = new Map()
  for (const e of [...entries].sort(byDateDesc).reverse()) {
    if (!byDist.has(e.distributorId)) byDist.set(e.distributorId, { name: e.distributorName, points: new Map() })
    byDist.get(e.distributorId).points.set(e.date, e[field]) // آخر قيمة في اليوم
  }
  const series = [...byDist.entries()].slice(0, maxSeries)
  return {
    labels: dates,
    datasets: series.map(([id, s]) => ({
      label: s.name,
      data: dates.map((d) => (s.points.has(d) ? s.points.get(d) : null)),
      borderColor: colorOf(id),
      backgroundColor: colorOf(id),
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      tension: 0.15,
    })),
    truncated: byDist.size > maxSeries,
  }
}
