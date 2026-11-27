import { db } from './index.js'
import {
  computeDiscount,
  distributorPurchasePrice,
  resolveCompanyDiscount,
  toNumber,
  validateDiscount,
  validateOriginalPrice,
  validateSellingPrice,
  DEFAULT_CLASSIFICATION,
} from '../lib/calc.js'

export class ValidationError extends Error {
  constructor(message, code = 'validation') {
    super(message)
    this.code = code
  }
}

const now = () => new Date().toISOString()
const clean = (s) => (s === undefined || s === null ? '' : String(s).trim())

/** مفتاح مقارنة لاكتشاف التكرار فقط — لا يُستخدم لتغيير الاسم المخزّن */
export const nameKey = (s) => clean(s).replace(/\s+/g, ' ').toLowerCase()

/* ================================================================== */
/* الإعدادات                                                            */
/* ================================================================== */

export const DEFAULT_SETTINGS = {
  currentUser: 'السوبرفايزر',
  currency: 'دينار',
  pctDecimals: 2,
  classification: DEFAULT_CLASSIFICATION,
  thresholds: {
    /** المذخر "عكس معظم الخصم" إذا كان المتبقي ≤ هذه النقاط */
    mostlyReflectedRemainingMax: 5,
    /** المذخر "احتفظ بمعظم الخصم" إذا كان المعكوس ≤ هذه النقاط */
    mostlyRetainedReflectedMax: 5,
    /** فرق كبير بين المذاخر في المنتج الواحد إذا تجاوز مدى الخصم المعكوس هذه النقاط */
    largeSpreadPoints: 5,
  },
  showDemo: true,
  lastBackupAt: null,
}

export async function getSettings() {
  const rows = await db.settings.toArray()
  const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    ...DEFAULT_SETTINGS,
    ...obj,
    thresholds: { ...DEFAULT_SETTINGS.thresholds, ...(obj.thresholds || {}) },
    classification: { ...DEFAULT_CLASSIFICATION, ...(obj.classification || {}) },
  }
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value: JSON.parse(JSON.stringify(value)) })
}

/* ================================================================== */
/* المنتجات                                                             */
/* ================================================================== */

export const PRODUCT_STATUS = { active: 'فعّال', inactive: 'غير فعّال', discontinued: 'متوقف' }

/**
 * مفتاح التكرار: الاسم + نوع العلاج + حجم العبوة + نوع التغليف.
 * (بتنوسام كريم ≠ بتنوسام مرهم، والمغلف ≠ غير المغلف)
 */
export const productKey = (p) => `${nameKey(p.name)}|${nameKey(p.dosageForm)}|${nameKey(p.packSize)}|${p.packaging || ''}`

export async function findDuplicateProduct(input, excludeId) {
  const key = productKey(input)
  const all = await db.products.toArray()
  return all.find((p) => p.id !== excludeId && productKey(p) === key) || null
}

export async function saveProduct(input, { allowDuplicate = false } = {}) {
  const name = clean(input.name)
  if (!name) throw new ValidationError('اسم الدواء مطلوب')
  const priceErr = validateOriginalPrice(input.originalPrice)
  if (priceErr.length) throw new ValidationError(priceErr[0])
  if (!allowDuplicate) {
    const dup = await findDuplicateProduct({ ...input, name }, input.id)
    if (dup) throw new ValidationError(`يوجد منتج بنفس الاسم ونوع العلاج وحجم العبوة والتغليف: «${dup.name}»`, 'duplicate')
  }
  const record = {
    // الاسم يُحفظ كما أُدخل حرفياً (بعد إزالة المسافات الطرفية فقط)
    name,
    scientificName: clean(input.scientificName),
    manufacturer: clean(input.manufacturer),
    dosageForm: clean(input.dosageForm),
    packSize: clean(input.packSize),
    packaging: input.packaging === 'wrapped' || input.packaging === 'unwrapped' ? input.packaging : '',
    originalPrice: toNumber(input.originalPrice),
    group: clean(input.group),
    notes: clean(input.notes),
    status: input.status || 'active',
    isDemo: input.isDemo ? 1 : 0,
    updatedAt: now(),
  }
  if (input.id) {
    await db.products.update(input.id, record)
    return input.id
  }
  return db.products.add({ ...record, createdAt: now() })
}

export async function deleteProduct(id) {
  const used =
    (await db.batchProducts.where({ productId: id }).count()) +
    (await db.priceMonitoring.where({ productId: id }).count())
  if (used) {
    throw new ValidationError(
      'لا يمكن حذف المنتج لأنه مرتبط بقوائم أسعار أو متابعات تاريخية. يمكنك تغيير حالته إلى «غير فعّال» للحفاظ على السجل.',
      'in-use',
    )
  }
  await db.products.delete(id)
}

/* ================================================================== */
/* المذاخر                                                              */
/* ================================================================== */

export async function saveDistributor(input, { allowDuplicate = false } = {}) {
  const name = clean(input.name)
  if (!name) throw new ValidationError('اسم المذخر مطلوب')
  if (!allowDuplicate) {
    const all = await db.distributors.toArray()
    const dup = all.find((d) => d.id !== input.id && nameKey(d.name) === nameKey(name) && nameKey(d.city) === nameKey(input.city))
    if (dup) throw new ValidationError(`يوجد مذخر بنفس الاسم والمدينة: «${dup.name}»`, 'duplicate')
  }
  const record = {
    name,
    governorate: clean(input.governorate),
    region: clean(input.region),
    city: clean(input.city),
    contactPerson: clean(input.contactPerson),
    phone: clean(input.phone),
    contactInfo: clean(input.contactInfo),
    notes: clean(input.notes),
    isDemo: input.isDemo ? 1 : 0,
    updatedAt: now(),
  }
  if (input.id) {
    await db.distributors.update(input.id, record)
    return input.id
  }
  return db.distributors.add({ ...record, createdAt: input.createdAt || now() })
}

export async function deleteDistributor(id) {
  const used = await db.priceMonitoring.where({ distributorId: id }).count()
  if (used) {
    throw new ValidationError(`لا يمكن حذف المذخر لوجود ${used} متابعة سعر مرتبطة به (السجل التاريخي محمي).`, 'in-use')
  }
  await db.transaction('rw', db.distributors, db.distributorDiscounts, async () => {
    await db.distributorDiscounts.where({ distributorId: id }).delete()
    await db.distributors.delete(id)
  })
}

/* ================================================================== */
/* قوائم الأسعار / الطلبيات                                              */
/* ================================================================== */

export const BATCH_TYPES = { list: 'قائمة أسعار', order: 'طلبية مذخر' }

async function nextBatchCode() {
  const last = await db.priceBatches.orderBy('code').last()
  return (last?.code || 0) + 1
}

function validateItem(it) {
  const e1 = validateOriginalPrice(it.originalPrice)
  if (e1.length) throw new ValidationError(e1[0])
  const e2 = validateDiscount(it.companyDiscount)
  if (e2.length) throw new ValidationError(e2[0])
}

function buildItem(batchId, it, isDemo) {
  const op = toNumber(it.originalPrice)
  const cd = toNumber(it.companyDiscount)
  return {
    batchId,
    productId: it.productId,
    originalPrice: op,
    companyDiscount: cd,
    purchasePrice: distributorPurchasePrice(op, cd),
    notes: clean(it.notes),
    isDemo: isDemo ? 1 : 0,
  }
}

/**
 * إنشاء قائمة أسعار جديدة كإصدار مستقل. لا يعدّل أي قائمة سابقة.
 * @param meta { name, date, lab, type, distributorId, notes, defaultDiscount }
 * @param items [{ productId, originalPrice, companyDiscount }]
 * @param overrides [{ distributorId, productId (0 = الكل), discount }]
 * @param options { updateProductPrices }
 */
export async function createBatch(meta, items = [], overrides = [], options = {}) {
  if (!clean(meta.name)) throw new ValidationError('اسم القائمة مطلوب')
  if (!meta.date) throw new ValidationError('تاريخ القائمة مطلوب')
  const seen = new Set()
  for (const it of items) {
    if (seen.has(it.productId)) throw new ValidationError('يوجد منتج مكرر داخل القائمة')
    seen.add(it.productId)
    validateItem(it)
  }
  for (const o of overrides) {
    const e = validateDiscount(o.discount)
    if (e.length) throw new ValidationError(e[0])
  }
  const isDemo = meta.isDemo ? 1 : 0
  return db.transaction('rw', db.priceBatches, db.batchProducts, db.distributorDiscounts, db.products, async () => {
    const id = await db.priceBatches.add({
      code: meta.code || (await nextBatchCode()),
      name: clean(meta.name),
      date: meta.date,
      lab: clean(meta.lab),
      type: meta.type || 'list',
      distributorId: meta.distributorId || null,
      defaultDiscount: meta.defaultDiscount === '' || meta.defaultDiscount == null ? null : toNumber(meta.defaultDiscount),
      notes: clean(meta.notes),
      isDemo,
      createdAt: now(),
    })
    if (items.length) await db.batchProducts.bulkAdd(items.map((it) => buildItem(id, it, isDemo)))
    if (overrides.length) {
      await db.distributorDiscounts.bulkAdd(
        overrides.map((o) => ({ batchId: id, distributorId: o.distributorId, productId: o.productId || 0, discount: toNumber(o.discount), isDemo })),
      )
    }
    if (options.updateProductPrices) {
      for (const it of items) await db.products.update(it.productId, { originalPrice: toNumber(it.originalPrice), updatedAt: now() })
    }
    return id
  })
}

export async function updateBatchMeta(id, meta) {
  if (!clean(meta.name)) throw new ValidationError('اسم القائمة مطلوب')
  if (!meta.date) throw new ValidationError('تاريخ القائمة مطلوب')
  await db.priceBatches.update(id, {
    name: clean(meta.name),
    date: meta.date,
    lab: clean(meta.lab),
    type: meta.type || 'list',
    distributorId: meta.distributorId || null,
    defaultDiscount: meta.defaultDiscount === '' || meta.defaultDiscount == null ? null : toNumber(meta.defaultDiscount),
    notes: clean(meta.notes),
    updatedAt: now(),
  })
}

/** إضافة أو تعديل منتج داخل قائمة (تعديل يدوي صريح فقط). المتابعات السابقة تحتفظ بلقطتها. */
export async function upsertBatchItem(batchId, item) {
  validateItem(item)
  const batch = await db.priceBatches.get(batchId)
  const existing = await db.batchProducts.where({ batchId, productId: item.productId }).first()
  const rec = buildItem(batchId, item, batch?.isDemo)
  if (existing) await db.batchProducts.update(existing.id, rec)
  else await db.batchProducts.add(rec)
}

export async function removeBatchItem(batchId, productId) {
  const used = await db.priceMonitoring.where({ batchId }).filter((m) => m.productId === productId).count()
  if (used) throw new ValidationError('لا يمكن حذف المنتج من القائمة لوجود متابعات أسعار تعتمد عليه.', 'in-use')
  await db.batchProducts.where({ batchId, productId }).delete()
}

export async function setOverride(batchId, distributorId, productId, discount) {
  const e = validateDiscount(discount)
  if (e.length) throw new ValidationError(e[0])
  const batch = await db.priceBatches.get(batchId)
  const pid = productId || 0
  const existing = await db.distributorDiscounts.where({ batchId, distributorId }).filter((o) => o.productId === pid).first()
  const rec = { batchId, distributorId, productId: pid, discount: toNumber(discount), isDemo: batch?.isDemo ? 1 : 0 }
  if (existing) await db.distributorDiscounts.update(existing.id, rec)
  else await db.distributorDiscounts.add(rec)
}

export async function removeOverride(id) {
  await db.distributorDiscounts.delete(id)
}

export async function deleteBatch(id) {
  const used = await db.priceMonitoring.where({ batchId: id }).count()
  if (used) throw new ValidationError(`لا يمكن حذف القائمة لوجود ${used} متابعة سعر تعتمد عليها.`, 'in-use')
  await db.transaction('rw', db.priceBatches, db.batchProducts, db.distributorDiscounts, async () => {
    await db.batchProducts.where({ batchId: id }).delete()
    await db.distributorDiscounts.where({ batchId: id }).delete()
    await db.priceBatches.delete(id)
  })
}

/** يحدد السعر الأصلي وخصم الشركة الفعّال لمذخر/منتج/قائمة */
export async function resolvePricing({ batchId, productId, distributorId }) {
  const batchProduct = await db.batchProducts.where({ batchId, productId }).first()
  if (!batchProduct) throw new ValidationError('المنتج غير موجود في قائمة الأسعار المختارة')
  const overrides = await db.distributorDiscounts.where({ batchId }).toArray()
  const { discount, source } = resolveCompanyDiscount({ batchProduct, overrides, distributorId, productId })
  return { originalPrice: batchProduct.originalPrice, companyDiscount: discount, discountSource: source }
}

/* ================================================================== */
/* متابعة الأسعار + السجل التاريخي                                      */
/* ================================================================== */

export const PRICE_SOURCES = {
  invoice: 'فاتورة',
  invoice_photo: 'صورة فاتورة',
  field: 'متابعة ميدانية',
  call: 'اتصال بالمذخر',
  pharmacy: 'معلومة من صيدلية',
  other: 'مصدر آخر',
}

/** أحدث متابعة سابقة لنفس المنتج لدى نفس المذخر (حسب التاريخ ثم وقت الإنشاء) */
async function findPrevious(productId, distributorId, date, excludeId) {
  const list = await db.priceMonitoring.where('[productId+distributorId]').equals([productId, distributorId]).toArray()
  return (
    list
      .filter((m) => m.id !== excludeId && (m.date < date || (m.date === date && (excludeId ? m.id < excludeId : true))))
      .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))[0] || null
  )
}

/**
 * تسجيل سعر بيع جديد. لا يحذف أي سعر سابق؛ يسجّل الفرق عن السعر السابق.
 * يحفظ لقطة (snapshot) من السعر الأصلي وخصم الشركة وقت التسجيل حتى لا تتغير
 * الحسابات التاريخية إذا عُدّلت القائمة لاحقاً.
 */
export async function addMonitoring(input, { force = false, user } = {}) {
  const { distributorId, batchId, productId, date } = input
  if (!distributorId) throw new ValidationError('اختر المذخر')
  if (!batchId) throw new ValidationError('اختر قائمة الأسعار / الطلبية')
  if (!productId) throw new ValidationError('اختر المنتج')
  if (!date) throw new ValidationError('تاريخ المتابعة مطلوب')
  const spErr = validateSellingPrice(input.sellingPrice)
  if (spErr.length) throw new ValidationError(spErr[0])
  const sellingPrice = toNumber(input.sellingPrice)

  const pricing = await resolvePricing({ batchId, productId, distributorId })
  const result = computeDiscount({ ...pricing, sellingPrice })
  if (!result.valid) throw new ValidationError(result.errors[0])

  if (!force) {
    const dup = await db.priceMonitoring
      .where('[productId+distributorId]')
      .equals([productId, distributorId])
      .filter((m) => m.batchId === batchId && m.date === date && m.sellingPrice === sellingPrice)
      .first()
    if (dup) throw new ValidationError('تم تسجيل نفس السعر لنفس المذخر والمنتج والقائمة في هذا التاريخ مسبقاً.', 'duplicate')
  }

  const prev = await findPrevious(productId, distributorId, date)
  const batch = await db.priceBatches.get(batchId)
  const isDemo = input.isDemo ? 1 : 0
  const record = {
    distributorId,
    batchId,
    productId,
    date,
    sellingPrice,
    originalPrice: pricing.originalPrice,
    companyDiscount: pricing.companyDiscount,
    discountSource: pricing.discountSource,
    batchDate: batch?.date || null,
    source: input.source || 'field',
    notes: clean(input.notes),
    user: user || input.user || '',
    previousId: prev?.id ?? null,
    previousPrice: prev?.sellingPrice ?? null,
    priceChange: prev ? sellingPrice - prev.sellingPrice : null,
    isDemo,
    createdAt: input.createdAt || now(),
  }
  return db.transaction('rw', db.priceMonitoring, db.priceHistory, async () => {
    const id = await db.priceMonitoring.add(record)
    await db.priceHistory.add({
      monitoringId: id,
      productId,
      distributorId,
      batchId,
      action: 'create',
      oldPrice: prev?.sellingPrice ?? null,
      newPrice: sellingPrice,
      date,
      user: record.user,
      at: record.createdAt,
      isDemo,
    })
    return id
  })
}

/** تعديل متابعة مع تسجيل القيم القديمة في السجل. لا تتغير لقطة الخصم. */
export async function updateMonitoring(id, changes, { user } = {}) {
  const old = await db.priceMonitoring.get(id)
  if (!old) throw new ValidationError('السجل غير موجود')
  const spErr = validateSellingPrice(changes.sellingPrice)
  if (spErr.length) throw new ValidationError(spErr[0])
  const sellingPrice = toNumber(changes.sellingPrice)
  const date = changes.date || old.date
  const prev = await findPrevious(old.productId, old.distributorId, date, id)
  const patch = {
    sellingPrice,
    date,
    source: changes.source || old.source,
    notes: clean(changes.notes),
    previousId: prev?.id ?? null,
    previousPrice: prev?.sellingPrice ?? null,
    priceChange: prev ? sellingPrice - prev.sellingPrice : null,
    updatedAt: now(),
    updatedBy: user || '',
  }
  await db.transaction('rw', db.priceMonitoring, db.priceHistory, async () => {
    await db.priceMonitoring.update(id, patch)
    await db.priceHistory.add({
      monitoringId: id,
      productId: old.productId,
      distributorId: old.distributorId,
      batchId: old.batchId,
      action: 'update',
      oldPrice: old.sellingPrice,
      newPrice: sellingPrice,
      oldDate: old.date,
      date,
      user: user || '',
      at: now(),
      isDemo: old.isDemo,
    })
  })
}

export async function deleteMonitoring(id, { user } = {}) {
  const old = await db.priceMonitoring.get(id)
  if (!old) return
  await db.transaction('rw', db.priceMonitoring, db.priceHistory, async () => {
    await db.priceMonitoring.delete(id)
    await db.priceHistory.add({
      monitoringId: id,
      productId: old.productId,
      distributorId: old.distributorId,
      batchId: old.batchId,
      action: 'delete',
      oldPrice: old.sellingPrice,
      newPrice: null,
      date: old.date,
      user: user || '',
      at: now(),
      isDemo: old.isDemo,
      snapshot: old,
    })
  })
}
