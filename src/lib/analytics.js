import { computeDiscount, round } from './calc.js'

/** يضيف جميع المؤشرات المحسوبة إلى سجل متابعة (من لقطته المحفوظة) */
export function enrich(m) {
  const r = computeDiscount({ originalPrice: m.originalPrice, companyDiscount: m.companyDiscount, sellingPrice: m.sellingPrice })
  return { ...m, ...r, id: m.id, notes: m.notes }
}

export const byDateDesc = (a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1)
export const avg = (arr) => (arr.length ? round(arr.reduce((s, v) => s + v, 0) / arr.length) : null)

/** أحدث متابعة لكل (منتج، مذخر) */
export function latestByPair(entries) {
  const map = new Map()
  for (const e of entries) {
    const k = `${e.productId}-${e.distributorId}`
    const cur = map.get(k)
    if (!cur || byDateDesc(e, cur) < 0) map.set(k, e)
  }
  return [...map.values()]
}

/** إحصاءات لكل مذخر بناءً على أحدث المتابعات */
export function distributorStats(latest) {
  const groups = new Map()
  for (const e of latest) {
    if (!e.hasSelling) continue
    if (!groups.has(e.distributorId)) groups.set(e.distributorId, [])
    groups.get(e.distributorId).push(e)
  }
  return [...groups.entries()].map(([distributorId, list]) => ({
    distributorId,
    count: list.length,
    avgCompany: avg(list.map((e) => e.companyDiscount)),
    avgReflected: avg(list.map((e) => e.pharmacyDiscountPct)),
    avgRemaining: avg(list.map((e) => e.remainingDiscountPct)),
    exceedCount: list.filter((e) => e.exceedsCompany).length,
    lastDate: list.map((e) => e.date).sort().at(-1),
  }))
}

/** الفروقات بين المذاخر لكل منتج (بالنقاط المئوية للخصم المعكوس) */
export function productSpreads(latest) {
  const groups = new Map()
  for (const e of latest) {
    if (!e.hasSelling) continue
    if (!groups.has(e.productId)) groups.set(e.productId, [])
    groups.get(e.productId).push(e)
  }
  return [...groups.entries()].map(([productId, list]) => {
    const refl = list.map((e) => e.pharmacyDiscountPct)
    const prices = list.map((e) => e.sellingPrice)
    return {
      productId,
      distributors: list.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minReflected: Math.min(...refl),
      maxReflected: Math.max(...refl),
      spreadPoints: round(Math.max(...refl) - Math.min(...refl)),
      avgReflected: avg(refl),
      avgRemaining: avg(list.map((e) => e.remainingDiscountPct)),
    }
  })
}

/** مؤشرات لوحة التحكم */
export function dashboardKpis({ entries, products, distributors, thresholds, today = new Date() }) {
  const enriched = entries.map(enrich)
  const latest = latestByPair(enriched)
  const dStats = distributorStats(latest)
  const spreads = productSpreads(latest)
  const month = today.toISOString().slice(0, 7)
  return {
    products: products.length,
    distributors: distributors.length,
    monitoringCount: entries.length,
    monthCount: entries.filter((e) => (e.date || '').startsWith(month)).length,
    avgReflected: avg(latest.filter((e) => e.hasSelling).map((e) => e.pharmacyDiscountPct)),
    avgRemaining: avg(latest.filter((e) => e.hasSelling).map((e) => e.remainingDiscountPct)),
    avgCompany: avg(latest.filter((e) => e.hasSelling).map((e) => e.companyDiscount)),
    mostlyReflected: dStats.filter((d) => d.avgRemaining <= thresholds.mostlyReflectedRemainingMax).length,
    mostlyRetained: dStats.filter((d) => d.avgReflected <= thresholds.mostlyRetainedReflectedMax).length,
    largeSpreadProducts: spreads.filter((s) => s.distributors > 1 && s.spreadPoints > thresholds.largeSpreadPoints).length,
    exceedAlerts: latest.filter((e) => e.exceedsCompany || e.aboveOriginal).length,
    enriched,
    latest,
    dStats,
    spreads,
  }
}

/** توزيع قيم إلى فئات (للمدرج التكراري) */
export function histogram(values, step = 2) {
  if (!values.length) return []
  const min = Math.floor(Math.min(...values) / step) * step
  const max = Math.ceil((Math.max(...values) + 0.0001) / step) * step
  const bins = []
  for (let x = min; x < max; x += step) bins.push({ from: x, to: x + step, count: 0 })
  for (const v of values) {
    const i = Math.min(bins.length - 1, Math.floor((v - min) / step))
    bins[i].count++
  }
  return bins
}
