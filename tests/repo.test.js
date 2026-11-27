import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db/index.js'
import * as repo from '../src/db/repo.js'
import { enrich, dashboardKpis } from '../src/lib/analytics.js'
import { loadDemo, removeDemo } from '../src/lib/demo.js'

beforeEach(async () => {
  for (const t of db.tables) await t.clear()
})

async function setup() {
  const p = await repo.saveProduct({ name: '  Panadol Extra  ', originalPrice: 10000 })
  const d1 = await repo.saveDistributor({ name: 'مذخر أ', city: 'بغداد' })
  const d2 = await repo.saveDistributor({ name: 'مذخر ب', city: 'بغداد' })
  const b = await repo.createBatch({ name: 'قائمة نوفمبر', date: '2026-11-01' }, [{ productId: p, originalPrice: 10000, companyDiscount: 21 }], [{ distributorId: d2, productId: 0, discount: 24 }])
  return { p, d1, d2, b }
}

describe('المنتجات', () => {
  it('يحفظ الاسم كما أُدخل ويمنع التكرار', async () => {
    const { p } = await setup()
    expect((await db.products.get(p)).name).toBe('Panadol Extra')
    await expect(repo.saveProduct({ name: 'panadol  extra', originalPrice: 5 })).rejects.toThrow('يوجد منتج')
  })
  it('يمنع السعر السالب', async () => {
    await expect(repo.saveProduct({ name: 'x', originalPrice: -1 })).rejects.toThrow()
  })
  it('يمنع حذف منتج مرتبط بسجل تاريخي', async () => {
    const { p } = await setup()
    await expect(repo.deleteProduct(p)).rejects.toThrow('لا يمكن حذف')
  })
})

describe('متابعة الأسعار', () => {
  it('يحسب من القائمة ويطبّق خصم المذخر الخاص', async () => {
    const { p, d1, d2, b } = await setup()
    const id1 = await repo.addMonitoring({ distributorId: d1, batchId: b, productId: p, sellingPrice: 8900, date: '2026-11-10' })
    const id2 = await repo.addMonitoring({ distributorId: d2, batchId: b, productId: p, sellingPrice: 8500, date: '2026-11-10' })
    const e1 = enrich(await db.priceMonitoring.get(id1))
    const e2 = enrich(await db.priceMonitoring.get(id2))
    expect([e1.companyDiscount, e1.pharmacyDiscountPct, e1.remainingDiscountPct]).toEqual([21, 11, 10])
    expect([e2.companyDiscount, e2.pharmacyDiscountPct, e2.remainingDiscountPct]).toEqual([24, 15, 9])
  })
  it('يحتفظ بالسعر السابق ويحسب الفرق ويسجل التاريخ', async () => {
    const { p, d1, b } = await setup()
    await repo.addMonitoring({ distributorId: d1, batchId: b, productId: p, sellingPrice: 8900, date: '2026-11-10' })
    const id = await repo.addMonitoring({ distributorId: d1, batchId: b, productId: p, sellingPrice: 8700, date: '2026-11-20' })
    const m = await db.priceMonitoring.get(id)
    expect(m.previousPrice).toBe(8900)
    expect(m.priceChange).toBe(-200)
    expect(await db.priceMonitoring.count()).toBe(2)
    expect(await db.priceHistory.count()).toBe(2)
  })
  it('يمنع التكرار غير المقصود', async () => {
    const { p, d1, b } = await setup()
    const inp = { distributorId: d1, batchId: b, productId: p, sellingPrice: 8900, date: '2026-11-10' }
    await repo.addMonitoring(inp)
    await expect(repo.addMonitoring(inp)).rejects.toThrow('مسبقاً')
  })
  it('تعديل القائمة لاحقاً لا يغيّر الحسابات التاريخية', async () => {
    const { p, d1, b } = await setup()
    const id = await repo.addMonitoring({ distributorId: d1, batchId: b, productId: p, sellingPrice: 8900, date: '2026-11-10' })
    await repo.upsertBatchItem(b, { productId: p, originalPrice: 12000, companyDiscount: 30 })
    const e = enrich(await db.priceMonitoring.get(id))
    expect([e.originalPrice, e.companyDiscount, e.pharmacyDiscountPct]).toEqual([10000, 21, 11])
  })
  it('التعديل يُسجَّل في السجل', async () => {
    const { p, d1, b } = await setup()
    const id = await repo.addMonitoring({ distributorId: d1, batchId: b, productId: p, sellingPrice: 8900, date: '2026-11-10' })
    await repo.updateMonitoring(id, { sellingPrice: 8800, date: '2026-11-10' }, { user: 'س' })
    const h = await db.priceHistory.where({ monitoringId: id }).toArray()
    expect(h.map((x) => x.action)).toEqual(['create', 'update'])
    expect(h[1].oldPrice).toBe(8900)
  })
  it('إنشاء قائمة جديدة لا يغيّر القائمة القديمة', async () => {
    const { p, b } = await setup()
    await repo.createBatch({ name: 'ديسمبر', date: '2026-12-01' }, [{ productId: p, originalPrice: 11000, companyDiscount: 24 }])
    const old = await db.batchProducts.where({ batchId: b }).first()
    expect([old.originalPrice, old.companyDiscount, old.purchasePrice]).toEqual([10000, 21, 7900])
  })
})

describe('البيانات التجريبية', () => {
  it('تُحمَّل وتُحذف دون المساس ببيانات المستخدم', async () => {
    await setup()
    await loadDemo()
    const k = dashboardKpis({ entries: await db.priceMonitoring.toArray(), products: await db.products.toArray(), distributors: await db.distributors.toArray(), thresholds: repo.DEFAULT_SETTINGS.thresholds })
    expect(k.monitoringCount).toBeGreaterThan(50)
    const ex = (await db.priceMonitoring.toArray()).map(enrich).find((e) => e.sellingPrice === 8900 && e.originalPrice === 10000 && e.companyDiscount === 21 && e.isDemo)
    expect([ex.pharmacyDiscountPct, ex.remainingDiscountPct]).toEqual([11, 10])
    await removeDemo()
    expect(await db.products.count()).toBe(1)
    expect(await db.distributors.count()).toBe(2)
    expect(await db.priceBatches.count()).toBe(1)
  })
})

import { groupByFormPackaging, parsePackaging, displayName } from '../src/lib/catalog.js'

describe('نوع العلاج والتغليف', () => {
  it('المغلف وغير المغلف منتجان مختلفان وليسا تكراراً', async () => {
    await repo.saveProduct({ name: 'باراسيتامول', originalPrice: 2500, dosageForm: 'حبوب', packaging: 'wrapped' })
    await repo.saveProduct({ name: 'باراسيتامول', originalPrice: 2000, dosageForm: 'حبوب', packaging: 'unwrapped' })
    await expect(repo.saveProduct({ name: 'باراسيتامول', originalPrice: 2100, dosageForm: 'حبوب', packaging: 'unwrapped' })).rejects.toThrow('يوجد منتج')
    const all = await db.products.toArray()
    expect(all.map((p) => p.packaging).sort()).toEqual(['unwrapped', 'wrapped'])
    expect(displayName(all.find((p) => p.packaging === 'unwrapped'))).toBe('باراسيتامول (بدون غلاف)')
  })
  it('يجمّع حسب نوع العلاج ثم التغليف بالترتيب المحدد', () => {
    const g = groupByFormPackaging([
      { id: 1, dosageForm: 'قطرة', packaging: 'wrapped' },
      { id: 2, dosageForm: 'شراب', packaging: 'unwrapped' },
      { id: 3, dosageForm: 'شراب', packaging: 'wrapped' },
      { id: 4, dosageForm: '', packaging: '' },
      { id: 5, dosageForm: 'حبوب', packaging: 'wrapped' },
    ])
    expect(g.map((x) => x.label)).toEqual(['شراب — مغلف', 'شراب — بدون غلاف', 'حبوب — مغلف', 'قطرة — مغلف', 'غير محدد — غير محدد'])
  })
  it('يقرأ التغليف من نص Excel', () => {
    expect(parsePackaging('مغلف')).toBe('wrapped')
    expect(parsePackaging('بدون غلاف')).toBe('unwrapped')
    expect(parsePackaging('غير مغلف')).toBe('unwrapped')
    expect(parsePackaging('')).toBe('')
  })
})

describe('مفتاح المنتج يشمل نوع العلاج', () => {
  it('بتنوسام كريم وبتنوسام مرهم منتجان مختلفان', async () => {
    await repo.saveProduct({ name: 'بتنوسام', originalPrice: 790, dosageForm: 'كريم', packaging: 'unwrapped' })
    await repo.saveProduct({ name: 'بتنوسام ', originalPrice: 790, dosageForm: 'مرهم', packaging: 'unwrapped' })
    expect(await db.products.count()).toBe(2)
    await expect(repo.saveProduct({ name: 'بتنوسام', originalPrice: 800, dosageForm: 'كريم', packaging: 'unwrapped' })).rejects.toThrow('يوجد منتج')
  })
})
