/**
 * محرك الحسابات — Pharma Discount Monitor
 *
 * القاعدة الجوهرية (بالنقاط المئوية من السعر الأصلي):
 *   خصم الشركة − الخصم الذي عكسه المذخر للصيدلية = الخصم المتبقي للمذخر
 *
 * لا يُحسب أي "استهلاك نسبي للخصم" (مثل 11 من 21 = 52.38%). جميع النسب
 * هنا نقاط مئوية من السعر الأصلي، وتُطرح من بعضها مباشرة.
 */

/** دقة النسب المئوية الداخلية (منازل عشرية) */
export const PCT_PRECISION = 4
/** دقة المبالغ النقدية (منازل عشرية) */
export const MONEY_PRECISION = 2
/** هامش التسامح عند مقارنة النسب (نقاط مئوية) */
export const TOLERANCE = 0.005

/** تقريب متماثل حول الصفر يزيل أخطاء الفاصلة العائمة (11.000000000000002 → 11) */
export function round(n, digits = PCT_PRECISION) {
  if (!Number.isFinite(n)) return n
  const f = 10 ** digits
  const r = (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f
  return Object.is(r, -0) ? 0 : r
}

export function toNumber(v) {
  if (typeof v === 'number') return v
  if (v === null || v === undefined) return NaN
  // يقبل الأرقام العربية-الهندية والفواصل
  const s = String(v)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٬,\s]/g, '')
    .replace('٫', '.')
    .replace('%', '')
    .trim()
  if (s === '') return NaN
  return Number(s)
}

/* ------------------------------------------------------------------ */
/* المعادلات الأساسية A–G                                              */
/* ------------------------------------------------------------------ */

/** B. سعر شراء المذخر = السعر الأصلي × (1 − خصم الشركة / 100) */
export function distributorPurchasePrice(originalPrice, companyDiscount) {
  return round(originalPrice * (1 - companyDiscount / 100), MONEY_PRECISION)
}

/** G. سعر البيع المرجعي للمذخر وفق الخصم الممنوح (يساوي سعر الشراء) */
export function referenceSellingPrice(originalPrice, companyDiscount) {
  return distributorPurchasePrice(originalPrice, companyDiscount)
}

/** C. الخصم الذي عكسه المذخر للصيدلية % = (الأصلي − سعر البيع) / الأصلي × 100 */
export function pharmacyDiscountPct(originalPrice, sellingPrice) {
  return round(((originalPrice - sellingPrice) / originalPrice) * 100)
}

/** D. الخصم المتبقي للمذخر % = خصم الشركة − الخصم المعكوس (طرح مباشر للنقاط) */
export function remainingDiscountPct(companyDiscount, pharmacyPct) {
  return round(companyDiscount - pharmacyPct)
}

/** E. الخصم المعكوس بالدينار = الأصلي − سعر البيع */
export function pharmacyDiscountAmount(originalPrice, sellingPrice) {
  return round(originalPrice - sellingPrice, MONEY_PRECISION)
}

/** قيمة خصم الشركة بالدينار = الأصلي × خصم الشركة / 100 */
export function companyDiscountAmount(originalPrice, companyDiscount) {
  return round((originalPrice * companyDiscount) / 100, MONEY_PRECISION)
}

/** F. الخصم المتبقي بالدينار = الأصلي × خصم الشركة / 100 − الخصم المعكوس بالدينار */
export function remainingDiscountAmount(originalPrice, companyDiscount, sellingPrice) {
  return round(
    (originalPrice * companyDiscount) / 100 - (originalPrice - sellingPrice),
    MONEY_PRECISION,
  )
}

/**
 * الحساب الكامل لتسجيل سعر واحد.
 * @returns كائن يحوي جميع المؤشرات + أعلام التنبيه
 */
export function computeDiscount({ originalPrice, companyDiscount, sellingPrice }) {
  const op = toNumber(originalPrice)
  const cd = toNumber(companyDiscount)
  const sp = toNumber(sellingPrice)

  const errors = [
    ...validateOriginalPrice(op),
    ...validateDiscount(cd),
    ...(sellingPrice === undefined || sellingPrice === null || sellingPrice === ''
      ? []
      : validateSellingPrice(sp)),
  ]
  const base = {
    originalPrice: op,
    companyDiscount: cd,
    purchasePrice: errors.length && !(op > 0) ? NaN : distributorPurchasePrice(op, cd),
    companyDiscountAmount: companyDiscountAmount(op, cd),
    referenceSellingPrice: referenceSellingPrice(op, cd),
    errors,
    valid: errors.length === 0,
  }
  if (!base.valid || !Number.isFinite(sp)) {
    return { ...base, sellingPrice: sp, hasSelling: false }
  }

  const pharmacyPct = pharmacyDiscountPct(op, sp)
  const remainingPct = remainingDiscountPct(cd, pharmacyPct)
  return {
    ...base,
    hasSelling: true,
    sellingPrice: sp,
    pharmacyDiscountPct: pharmacyPct,
    remainingDiscountPct: remainingPct,
    pharmacyDiscountAmount: pharmacyDiscountAmount(op, sp),
    remainingDiscountAmount: remainingDiscountAmount(op, cd, sp),
    /** هامش المذخر الفعلي بالدينار مقارنة بسعر شرائه */
    distributorMarginAmount: round(sp - distributorPurchasePrice(op, cd), MONEY_PRECISION),
    /** الخصم المعكوس أكبر من خصم الشركة */
    exceedsCompany: remainingPct < -TOLERANCE,
    /** مقدار التجاوز بالنقاط المئوية (موجب) */
    exceedPoints: remainingPct < -TOLERANCE ? round(-remainingPct) : 0,
    /** عكس كامل خصم الشركة */
    fullyReflected: Math.abs(remainingPct) <= TOLERANCE,
    /** سعر البيع أعلى من السعر الأصلي */
    aboveOriginal: sp > op,
  }
}

/* ------------------------------------------------------------------ */
/* التحقق من المدخلات                                                  */
/* ------------------------------------------------------------------ */

export function validateOriginalPrice(v) {
  const n = toNumber(v)
  if (!Number.isFinite(n)) return ['السعر الأصلي غير صالح']
  if (n <= 0) return ['السعر الأصلي يجب أن يكون أكبر من صفر']
  return []
}

export function validateSellingPrice(v) {
  const n = toNumber(v)
  if (!Number.isFinite(n)) return ['سعر البيع غير صالح']
  if (n < 0) return ['لا يُسمح بسعر بيع سالب']
  if (n === 0) return ['سعر البيع يجب أن يكون أكبر من صفر']
  return []
}

export function validateDiscount(v) {
  const n = toNumber(v)
  if (!Number.isFinite(n)) return ['نسبة الخصم غير صالحة']
  if (n < 0) return ['لا يُسمح بخصم سالب']
  if (n >= 100) return ['نسبة الخصم يجب أن تكون أقل من 100%']
  return []
}

/* ------------------------------------------------------------------ */
/* تحديد خصم الشركة الفعّال لمذخر ضمن قائمة أسعار                       */
/* ------------------------------------------------------------------ */

/**
 * الأولوية:
 *   1. خصم خاص بالمذخر لهذا المنتج في هذه القائمة
 *   2. خصم خاص بالمذخر لكامل القائمة (productId = 0)
 *   3. خصم الشركة المسجّل للمنتج في القائمة
 */
export function resolveCompanyDiscount({ batchProduct, overrides = [], distributorId, productId }) {
  const pid = productId ?? batchProduct?.productId
  const specific = overrides.find(
    (o) => o.distributorId === distributorId && o.productId === pid && o.batchId === batchProduct?.batchId,
  )
  if (specific) return { discount: specific.discount, source: 'distributor-product' }
  const general = overrides.find(
    (o) => o.distributorId === distributorId && (o.productId === 0 || o.productId == null) && o.batchId === batchProduct?.batchId,
  )
  if (general) return { discount: general.discount, source: 'distributor' }
  return { discount: batchProduct?.companyDiscount, source: 'batch' }
}

/* ------------------------------------------------------------------ */
/* المؤشرات الذكية — قابلة للتعديل من الإعدادات                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_CLASSIFICATION = {
  /** الأساس: reflected = الخصم المعكوس بالنقاط، remaining = المتبقي بالنقاط */
  basis: 'reflected',
  categories: [
    { id: 'c1', label: 'احتفاظ مرتفع بالخصم', min: 0, max: 5, tone: 'amber' },
    { id: 'c2', label: 'احتفاظ متوسط', min: 5, max: 10, tone: 'slate' },
    { id: 'c3', label: 'عكس مرتفع للصيدلية', min: 10, max: 15, tone: 'blue' },
    { id: 'c4', label: 'عكس شبه كامل', min: 15, max: null, tone: 'teal' },
  ],
  fullLabel: 'عكس كامل الخصم',
  exceedLabel: 'تنبيه للتحقق',
  aboveOriginalLabel: 'سعر أعلى من الأصلي',
}

/**
 * يعيد تصنيف النتيجة. لا يصدر حكماً على المذخر — فقط وصف رقمي قابل للضبط.
 */
export function classify(result, classification = DEFAULT_CLASSIFICATION) {
  if (!result?.hasSelling) return null
  const cfg = { ...DEFAULT_CLASSIFICATION, ...(classification || {}) }
  if (result.aboveOriginal) {
    return { id: 'above', label: cfg.aboveOriginalLabel, tone: 'red', special: true }
  }
  if (result.exceedsCompany) {
    return {
      id: 'exceed',
      label: cfg.exceedLabel,
      tone: 'red',
      special: true,
      note: `الخصم المعكوس للصيدلية أكبر من خصم الشركة بمقدار ${fmtNum(result.exceedPoints)} نقطة مئوية`,
    }
  }
  if (result.fullyReflected) {
    return { id: 'full', label: cfg.fullLabel, tone: 'teal', special: true }
  }
  const value = cfg.basis === 'remaining' ? result.remainingDiscountPct : result.pharmacyDiscountPct
  const cats = [...(cfg.categories || [])].sort((a, b) => toNumber(a.min) - toNumber(b.min))
  const hit = cats.find((c) => {
    const min = toNumber(c.min)
    const max = c.max === null || c.max === '' || c.max === undefined ? Infinity : toNumber(c.max)
    return value >= min - TOLERANCE && value < max - TOLERANCE
  })
  if (!hit) return { id: 'none', label: 'خارج الفئات المحددة', tone: 'slate', special: false }
  return { id: hit.id, label: hit.label, tone: hit.tone || 'slate', special: false }
}

/** جملة تفسيرية بالنقاط المئوية */
export function describe(result) {
  if (!result?.hasSelling) return ''
  const r = fmtNum(result.pharmacyDiscountPct)
  const c = fmtNum(result.companyDiscount)
  const k = fmtNum(Math.abs(result.remainingDiscountPct))
  if (result.aboveOriginal) {
    return `سعر البيع أعلى من السعر الأصلي بمقدار ${fmtNum(-result.pharmacyDiscountPct)}% — يُنصح بالتحقق من المعلومة.`
  }
  if (result.exceedsCompany) {
    return `المذخر يعكس ${r}% للصيدلية بينما خصم الشركة ${c}% — أي أكبر بمقدار ${k} نقطة مئوية. يُنصح بالتحقق دون إصدار حكم تلقائي.`
  }
  if (result.fullyReflected) return `المذخر يعكس كامل خصم الشركة (${c}%) للصيدلية، والمتبقي له 0%.`
  return `المذخر يعكس ${r}% من السعر الأصلي للصيدلية من أصل خصم شركة ${c}%، ويحتفظ بـ ${k}%.`
}

function fmtNum(n) {
  return String(round(n, 2))
}
