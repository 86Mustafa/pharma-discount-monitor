import { exportExcel } from './excel.js'
import { latestByPair, byDateDesc } from './analytics.js'
import { round } from './calc.js'
import { PRICE_SOURCES } from '../db/repo.js'
import { formLabel, packagingLabel } from './catalog.js'

const r2 = (n) => (Number.isFinite(n) ? round(n, 2) : '')

/** صف تصدير موحّد لمتابعة سعر (جميع النسب نقاط مئوية من السعر الأصلي) */
export function monitoringRow(e) {
  return {
    'التاريخ': e.date,
    'المذخر': e.distributorName,
    'المنتج': e.productName,
    'نوع العلاج': formLabel(e.dosageForm),
    'التغليف': packagingLabel(e.packaging),
    'قائمة الأسعار / الطلبية': e.batchName,
    'السعر الأصلي': e.originalPrice,
    'خصم الشركة %': r2(e.companyDiscount),
    'سعر شراء المذخر': r2(e.purchasePrice),
    'سعر البيع للصيدلية': e.sellingPrice,
    'الخصم المعكوس %': r2(e.pharmacyDiscountPct),
    'الخصم المتبقي %': r2(e.remainingDiscountPct),
    'قيمة الخصم المعكوس': r2(e.pharmacyDiscountAmount),
    'قيمة الخصم المتبقي': r2(e.remainingDiscountAmount),
    'السعر السابق': e.previousPrice ?? '',
    'التغير عن السابق': e.priceChange ?? '',
    'المؤشر': e.category?.label || '',
    'تنبيه': e.exceedsCompany ? `أكبر من خصم الشركة بـ ${r2(e.exceedPoints)} نقطة` : e.aboveOriginal ? 'أعلى من السعر الأصلي' : '',
    'مصدر السعر': PRICE_SOURCES[e.source] || e.source || '',
    'المستخدم': e.user || '',
    'ملاحظات': e.notes || '',
  }
}

export function exportMonitoring(filename, entries, sheetName = 'المتابعات') {
  exportExcel(filename, [{ name: sheetName, rows: [...entries].sort(byDateDesc).map(monitoringRow) }])
}

export function exportDistributorPrices(distributor, monitoring) {
  const mine = monitoring.filter((e) => e.distributorId === distributor.id)
  exportExcel(`أسعار-${distributor.name}`, [
    { name: 'أحدث الأسعار', rows: latestByPair(mine).sort((a, b) => a.productName.localeCompare(b.productName, 'ar')).map(monitoringRow) },
    { name: 'كل المتابعات', rows: mine.sort(byDateDesc).map(monitoringRow) },
  ])
}

/** تقرير الخصم المعكوس أو المتبقي: ملخص حسب المذخر + حسب المنتج + التفاصيل */
export function exportDiscountReport(kind, latest, all) {
  const key = kind === 'reflected' ? 'pharmacyDiscountPct' : 'remainingDiscountPct'
  const label = kind === 'reflected' ? 'الخصم المعكوس' : 'الخصم المتبقي'
  const group = (by, name) => {
    const m = new Map()
    for (const e of latest) {
      const k = e[by]
      if (!m.has(k)) m.set(k, { name: e[name], list: [] })
      m.get(k).list.push(e)
    }
    return [...m.values()].map(({ name: n, list }) => {
      const vals = list.map((e) => e[key])
      return {
        [name === 'distributorName' ? 'المذخر' : 'المنتج']: n,
        'عدد السجلات': list.length,
        'متوسط خصم الشركة %': r2(list.reduce((s, e) => s + e.companyDiscount, 0) / list.length),
        [`متوسط ${label} %`]: r2(vals.reduce((s, v) => s + v, 0) / vals.length),
        [`أدنى ${label} %`]: r2(Math.min(...vals)),
        [`أعلى ${label} %`]: r2(Math.max(...vals)),
        'تنبيهات تجاوز': list.filter((e) => e.exceedsCompany).length,
      }
    })
  }
  exportExcel(`تقرير-${label.replace(' ', '-')}`, [
    { name: 'حسب المذخر', rows: group('distributorId', 'distributorName') },
    { name: 'حسب المنتج', rows: group('productId', 'productName') },
    { name: 'أحدث المتابعات', rows: latest.map(monitoringRow) },
    { name: 'كل المتابعات', rows: [...all].sort(byDateDesc).map(monitoringRow) },
  ])
}
