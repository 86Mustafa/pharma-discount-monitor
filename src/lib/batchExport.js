import { exportExcel } from './excel.js'
import { monitoringRow } from './reports.js'
import { BATCH_TYPES } from '../db/repo.js'
import { round } from './calc.js'
import { compareFormPackaging, formLabel, packagingLabel } from './catalog.js'

/** تصدير قائمة أسعار كاملة: البيانات العامة + المنتجات + خصومات المذاخر + المتابعات */
export function exportBatch(batchId, store) {
  const b = store.batchMap.value.get(batchId)
  if (!b) return
  const items = store.batchProducts.value.filter((x) => x.batchId === batchId)
  const ovr = store.overrides.value.filter((o) => o.batchId === batchId)
  const mon = store.monitoring.value.filter((m) => m.batchId === batchId)
  exportExcel(`قائمة-${b.code}-${b.name}`, [
    {
      name: 'بيانات القائمة',
      rows: [{ 'رقم القائمة': b.code, 'اسم القائمة': b.name, 'التاريخ': b.date, 'النوع': BATCH_TYPES[b.type] || b.type, 'المعمل': b.lab, 'المذخر': b.distributorId ? store.distributorMap.value.get(b.distributorId)?.name : '', 'ملاحظات': b.notes }],
    },
    {
      name: 'المنتجات',
      rows: items
        .map((i) => ({ i, p: store.productMap.value.get(i.productId) || {} }))
        .sort((a, b) => compareFormPackaging(a.p, b.p) || String(a.p.name).localeCompare(String(b.p.name), 'ar'))
        .map(({ i, p }) => ({
        'نوع العلاج': formLabel(p.dosageForm),
        'التغليف': packagingLabel(p.packaging),
        'المنتج': p.name || '',
        'الاسم العلمي': store.productMap.value.get(i.productId)?.scientificName || '',
        'السعر الأصلي': i.originalPrice,
        'خصم الشركة %': i.companyDiscount,
        'سعر شراء المذخر': i.purchasePrice,
        'قيمة خصم الشركة': round(i.originalPrice - i.purchasePrice, 2),
      })),
    },
    {
      name: 'خصومات المذاخر',
      rows: ovr.map((o) => ({
        'المذخر': store.distributorMap.value.get(o.distributorId)?.name || '',
        'المنتج': o.productId ? store.productMap.value.get(o.productId)?.name : 'كل المنتجات',
        'الخصم %': o.discount,
      })),
    },
    { name: 'المتابعات', rows: mon.map(monitoringRow) },
  ])
}
