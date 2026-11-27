import Dexie from 'dexie'

/**
 * مخطط قاعدة البيانات (IndexedDB عبر Dexie)
 *
 * products ─┐
 *           ├─< batchProducts >── priceBatches ──< distributorDiscounts >── distributors
 *           │                         │                                        │
 *           └──────────< priceMonitoring (snapshot: originalPrice, companyDiscount) >┘
 *                               │
 *                               └──< priceHistory (سجل تدقيق: create / update / delete)
 *
 * settings: مفتاح/قيمة
 * isDemo: 1 للبيانات التجريبية، 0 لبيانات المستخدم (منفصلة ويمكن حذفها وحدها)
 */
export const db = new Dexie('pharma-discount-monitor')

db.version(1).stores({
  products: '++id, name, scientificName, manufacturer, group, status, isDemo',
  distributors: '++id, name, governorate, city, isDemo',
  priceBatches: '++id, code, date, lab, distributorId, isDemo',
  batchProducts: '++id, batchId, productId, &[batchId+productId], isDemo',
  // productId = 0 يعني خصماً خاصاً بالمذخر لكامل القائمة
  distributorDiscounts: '++id, batchId, distributorId, productId, &[batchId+distributorId+productId], isDemo',
  priceMonitoring: '++id, distributorId, productId, batchId, date, [productId+distributorId], isDemo',
  priceHistory: '++id, monitoringId, productId, distributorId, batchId, at, isDemo',
  settings: 'key',
})

export const TABLES = [
  'products',
  'distributors',
  'priceBatches',
  'batchProducts',
  'distributorDiscounts',
  'priceMonitoring',
  'priceHistory',
  'settings',
]

/** طلب تخزين دائم من المتصفح لتقليل خطر فقدان البيانات */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* غير مدعوم */
  }
  return false
}
