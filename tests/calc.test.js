import { describe, it, expect } from 'vitest'
import {
  computeDiscount, classify, resolveCompanyDiscount, validateDiscount,
  validateSellingPrice, validateOriginalPrice, toNumber, round, DEFAULT_CLASSIFICATION,
} from '../src/lib/calc.js'

const run = (op, cd, sp) => computeDiscount({ originalPrice: op, companyDiscount: cd, sellingPrice: sp })

describe('المثال الاختباري الأساسي (القسم 3)', () => {
  const r = run(10000, 21, 8900)
  it('يطابق الجدول حرفياً', () => {
    expect(r.originalPrice).toBe(10000)
    expect(r.companyDiscount).toBe(21)
    expect(r.purchasePrice).toBe(7900)
    expect(r.sellingPrice).toBe(8900)
    expect(r.pharmacyDiscountPct).toBe(11)
    expect(r.remainingDiscountPct).toBe(10)
    expect(r.pharmacyDiscountAmount).toBe(1100)
    expect(r.remainingDiscountAmount).toBe(1000)
    expect(r.referenceSellingPrice).toBe(7900)
    expect(r.companyDiscountAmount).toBe(2100)
  })
  it('لا يستخدم النسبة النسبية 52.38%', () => {
    expect(Object.values(r)).not.toContain(52.38)
    expect(r.pharmacyDiscountPct).not.toBeCloseTo(52.38, 1)
  })
  it('القاعدة الجوهرية: خصم الشركة − المعكوس = المتبقي', () => {
    expect(r.companyDiscount - r.pharmacyDiscountPct).toBe(r.remainingDiscountPct)
  })
})

describe('اختبارات القسم 19', () => {
  const cases = [
    { n: 1, op: 10000, cd: 21, sp: 8900, refl: 11, rem: 10, ra: 1000 },
    { n: 2, op: 10000, cd: 24, sp: 8500, refl: 15, rem: 9, ra: 900 },
    { n: 3, op: 10000, cd: 17, sp: 9500, refl: 5, rem: 12, ra: 1200 },
    { n: 4, op: 10000, cd: 21, sp: 7900, refl: 21, rem: 0, ra: 0 },
    { n: 5, op: 10000, cd: 21, sp: 7500, refl: 25, rem: -4, ra: -400 },
  ]
  for (const c of cases) {
    it(`اختبار ${c.n}: خصم ${c.cd}% / بيع ${c.sp} → معكوس ${c.refl}% ومتبقٍ ${c.rem}%`, () => {
      const r = run(c.op, c.cd, c.sp)
      expect(r.companyDiscount).toBe(c.cd)
      expect(r.pharmacyDiscountPct).toBe(c.refl)
      expect(r.remainingDiscountPct).toBe(c.rem)
      expect(r.remainingDiscountAmount).toBe(c.ra)
    })
  }
  it('اختبار 4: عكس كامل', () => {
    const r = run(10000, 21, 7900)
    expect(r.fullyReflected).toBe(true)
    expect(r.exceedsCompany).toBe(false)
    expect(classify(r).id).toBe('full')
  })
  it('اختبار 5: تنبيه تجاوز بمقدار 4 نقاط دون حكم', () => {
    const r = run(10000, 21, 7500)
    expect(r.exceedsCompany).toBe(true)
    expect(r.exceedPoints).toBe(4)
    const c = classify(r)
    expect(c.id).toBe('exceed')
    expect(c.note).toContain('4 نقطة مئوية')
  })
})

describe('دقة الأرقام', () => {
  it('يزيل أخطاء الفاصلة العائمة', () => {
    expect(round(11.000000000000002)).toBe(11)
    expect(round(-0.0000001)).toBe(0)
  })
  it('يدعم الكسور', () => {
    const r = run(12750, 22.5, 10900)
    expect(r.pharmacyDiscountPct).toBe(14.5098)
    expect(r.remainingDiscountPct).toBe(7.9902)
    expect(r.purchasePrice).toBe(9881.25)
    expect(r.remainingDiscountAmount).toBe(1018.75)
  })
  it('يقرأ الأرقام العربية والفواصل', () => {
    expect(toNumber('١٠٬٠٠٠')).toBe(10000)
    expect(toNumber('10,000')).toBe(10000)
    expect(toNumber('21%')).toBe(21)
  })
})

describe('التحقق من المدخلات', () => {
  it('يرفض الأسعار السالبة والصفرية', () => {
    expect(validateSellingPrice(-1).length).toBe(1)
    expect(validateSellingPrice(0).length).toBe(1)
    expect(validateOriginalPrice(0).length).toBe(1)
    expect(run(-5, 21, 100).valid).toBe(false)
  })
  it('يتحقق من نسب الخصم', () => {
    expect(validateDiscount(-1).length).toBe(1)
    expect(validateDiscount(100).length).toBe(1)
    expect(validateDiscount(21)).toEqual([])
  })
  it('سعر البيع أعلى من الأصلي يُعلَّم', () => {
    const r = run(10000, 21, 10500)
    expect(r.pharmacyDiscountPct).toBe(-5)
    expect(r.aboveOriginal).toBe(true)
    expect(classify(r).id).toBe('above')
  })
})

describe('تحديد خصم الشركة الفعّال', () => {
  const bp = { batchId: 1, productId: 7, companyDiscount: 21 }
  const overrides = [
    { batchId: 1, distributorId: 2, productId: 0, discount: 23 },
    { batchId: 1, distributorId: 3, productId: 7, discount: 25 },
    { batchId: 1, distributorId: 3, productId: 0, discount: 19 },
  ]
  it('الافتراضي من القائمة', () => expect(resolveCompanyDiscount({ batchProduct: bp, overrides, distributorId: 1 }).discount).toBe(21))
  it('خصم المذخر للقائمة', () => expect(resolveCompanyDiscount({ batchProduct: bp, overrides, distributorId: 2 }).discount).toBe(23))
  it('خصم المذخر للمنتج له الأولوية', () => expect(resolveCompanyDiscount({ batchProduct: bp, overrides, distributorId: 3 }).discount).toBe(25))
})

describe('المؤشرات الذكية بالنقاط', () => {
  it('تعتمد على النقاط وليس النسبة النسبية', () => {
    expect(classify(run(10000, 21, 9700)).id).toBe('c1') // 3 نقاط
    expect(classify(run(10000, 21, 9300)).id).toBe('c2') // 7 نقاط
    expect(classify(run(10000, 21, 8900)).id).toBe('c3') // 11 نقطة
    expect(classify(run(10000, 21, 8200)).id).toBe('c4') // 18 نقطة
  })
  it('الفئات قابلة للتعديل', () => {
    const custom = { ...DEFAULT_CLASSIFICATION, basis: 'remaining', categories: [{ id: 'x', label: 'متبقٍ منخفض', min: 0, max: 8 }, { id: 'y', label: 'متبقٍ عالٍ', min: 8, max: null }] }
    expect(classify(run(10000, 21, 8900), custom).id).toBe('y') // متبقٍ 10
    expect(classify(run(10000, 21, 8500), custom).id).toBe('x') // متبقٍ 6
  })
})
