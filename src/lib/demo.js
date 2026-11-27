import { db, TABLES } from '../db/index.js'
import { addMonitoring, createBatch, saveDistributor, saveProduct } from '../db/repo.js'

/**
 * بيانات تجريبية — جميعها معلَّمة isDemo = 1، أسماء وهمية بالكامل،
 * ويمكن حذفها دون المساس ببيانات المستخدم.
 */

function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LAB = 'المعمل النموذجي (تجريبي)'

const PRODUCTS = [
  { name: 'دواء تجريبي', scientificName: 'Demo Substance', dosageForm: 'حبوب', packaging: 'wrapped', packSize: '20 حبة', originalPrice: 10000, group: 'تجريبي', notes: 'المثال الاختباري الأساسي' },
  { name: 'أموكسيل-نموذج معلق', scientificName: 'Amoxicillin 250mg/5ml', dosageForm: 'معلق', packaging: 'wrapped', packSize: '100 مل', originalPrice: 6000, group: 'مضادات حيوية' },
  { name: 'أزيترو-نموذج 250', scientificName: 'Azithromycin 250mg', dosageForm: 'حبوب', packaging: 'wrapped', packSize: '6 حبات', originalPrice: 9500, group: 'مضادات حيوية' },
  { name: 'بارا-نموذج 500', scientificName: 'Paracetamol 500mg', dosageForm: 'حبوب', packaging: 'wrapped', packSize: '24 حبة', originalPrice: 2500, group: 'مسكنات' },
  { name: 'بارا-نموذج 500', scientificName: 'Paracetamol 500mg', dosageForm: 'حبوب', packaging: 'unwrapped', packSize: '24 حبة', originalPrice: 2000, group: 'مسكنات', notes: 'نفس المنتج بدون غلاف — سعر مختلف' },
  { name: 'فيوسي-نموذج كريم', scientificName: 'Fusidic acid 2%', dosageForm: 'كريم', packaging: 'wrapped', packSize: '15 غم', originalPrice: 7500, group: 'جلدية' },
  { name: 'ميتفور-نموذج 850', scientificName: 'Metformin 850mg', dosageForm: 'حبوب', packaging: 'unwrapped', packSize: '30 حبة', originalPrice: 5000, group: 'سكري' },
  { name: 'أتورفا-نموذج 20', scientificName: 'Atorvastatin 20mg', dosageForm: 'حبوب', packaging: 'wrapped', packSize: '30 حبة', originalPrice: 14000, group: 'قلب وأوعية' },
  { name: 'بيتا-نموذج مرهم', scientificName: 'Betamethasone 0.1%', dosageForm: 'مرهم', packaging: 'unwrapped', packSize: '30 غم', originalPrice: 6500, group: 'جلدية' },
  { name: 'بوفي-نموذج معقم', scientificName: 'Povidone-iodine 10%', dosageForm: 'معقم', packaging: 'unwrapped', packSize: '120 مل', originalPrice: 4000, group: 'مطهرات' },
  { name: 'كلورا-نموذج قطرة', scientificName: 'Chloramphenicol 0.5%', dosageForm: 'قطرة', packaging: 'wrapped', packSize: '10 مل', originalPrice: 8000, group: 'عيون' },
  { name: 'إيبو-نموذج شراب', scientificName: 'Ibuprofen 100mg/5ml', dosageForm: 'شراب', packaging: 'wrapped', packSize: '100 مل', originalPrice: 3500, group: 'مسكنات' },
  { name: 'سالبو-نموذج شراب', scientificName: 'Salbutamol 2mg/5ml', dosageForm: 'شراب', packaging: 'unwrapped', packSize: '120 مل', originalPrice: 12000, group: 'جهاز تنفسي' },
]

const DISTRIBUTORS = [
  { name: 'مذخر الرافدين (تجريبي)', governorate: 'بغداد', region: 'الكرخ', city: 'بغداد', contactPerson: 'مسؤول تجريبي 1', phone: '0770 000 0001', ratio: 0.52 },
  { name: 'مذخر النور (تجريبي)', governorate: 'بغداد', region: 'الرصافة', city: 'بغداد', contactPerson: 'مسؤول تجريبي 2', phone: '0770 000 0002', ratio: 0.72 },
  { name: 'مذخر الفرات (تجريبي)', governorate: 'بابل', region: 'المركز', city: 'الحلة', contactPerson: 'مسؤول تجريبي 3', phone: '0770 000 0003', ratio: 0.3 },
  { name: 'مذخر دجلة (تجريبي)', governorate: 'البصرة', region: 'المركز', city: 'البصرة', contactPerson: 'مسؤول تجريبي 4', phone: '0770 000 0004', ratio: 0.9 },
  { name: 'مذخر الشفاء (تجريبي)', governorate: 'نينوى', region: 'الساحل الأيسر', city: 'الموصل', contactPerson: 'مسؤول تجريبي 5', phone: '0770 000 0005', ratio: 0.18 },
  { name: 'مذخر الأمل (تجريبي)', governorate: 'أربيل', region: 'المركز', city: 'أربيل', contactPerson: 'مسؤول تجريبي 6', phone: '0770 000 0006', ratio: 0.62 },
]

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function hasDemo() {
  return (await db.products.where('isDemo').equals(1).count()) > 0
}

export async function loadDemo() {
  if (await hasDemo()) throw new Error('البيانات التجريبية محمّلة مسبقاً')
  const rand = rng(20261127)
  const today = new Date().toISOString().slice(0, 10)

  const productIds = []
  for (const p of PRODUCTS) {
    productIds.push(await saveProduct({ ...p, manufacturer: LAB, status: 'active', isDemo: true }, { allowDuplicate: true }))
  }
  const distIds = []
  for (const d of DISTRIBUTORS) {
    distIds.push(await saveDistributor({ ...d, contactInfo: 'بيانات وهمية', notes: 'سجل تجريبي', isDemo: true }, { allowDuplicate: true }))
  }

  const batchesDef = [
    { name: 'قائمة أسعار سبتمبر 2026', date: '2026-09-05', discount: 17, priceUp: 0, overrides: [] },
    { name: 'قائمة أسعار أكتوبر 2026', date: '2026-10-04', discount: 21, priceUp: 0, overrides: [{ distributorId: distIds[1], productId: 0, discount: 23 }] },
    { name: 'قائمة أسعار نوفمبر 2026', date: '2026-11-03', discount: 24, priceUp: 0.05, overrides: [] },
  ]

  for (const [bi, b] of batchesDef.entries()) {
    const items = PRODUCTS.map((p, i) => {
      const bumped = b.priceUp && (i === 7 || i === 12 || i === 5) ? Math.round((p.originalPrice * (1 + b.priceUp)) / 250) * 250 : p.originalPrice
      // المنتج التجريبي يبقى دائماً 10,000 بخصم 21% في قائمة نوفمبر للمطابقة مع المثال
      const disc = i === 0 ? (bi === 2 ? 21 : b.discount) : b.discount
      return { productId: productIds[i], originalPrice: bumped, companyDiscount: disc }
    })
    const batchId = await createBatch(
      { name: b.name, date: b.date, lab: LAB, type: 'list', notes: 'قائمة تجريبية', isDemo: true },
      items,
      b.overrides,
      { updateProductPrices: bi === 2 },
    )

    for (const [di, dId] of distIds.entries()) {
      const d = DISTRIBUTORS[di]
      for (const [pi, pId] of productIds.entries()) {
        if (pi === 0) continue // المنتج التجريبي يُسجَّل يدوياً أدناه
        if (rand() > 0.72) continue
        const item = items[pi]
        const disc = b.overrides.find((o) => o.distributorId === dId)?.discount ?? item.companyDiscount
        const reflected = Math.max(0, disc * d.ratio + (rand() - 0.5) * 4)
        const selling = Math.round((item.originalPrice * (1 - reflected / 100)) / 50) * 50
        let date = addDays(b.date, 3 + Math.floor(rand() * 18))
        if (date > today) date = today
        await addMonitoring(
          { distributorId: dId, batchId, productId: pId, sellingPrice: selling, date, source: ['field', 'invoice', 'call', 'pharmacy', 'invoice_photo'][Math.floor(rand() * 5)], notes: '', isDemo: true },
          { force: true, user: 'مستخدم تجريبي' },
        )
      }
    }

    if (bi === 2) {
      // المثال الاختباري + حالات القسم 19 على المنتج التجريبي
      const examples = [
        { di: 0, sp: 8900, note: 'المثال الأساسي: معكوس 11% ومتبقٍ 10%' },
        { di: 1, sp: 8500, note: 'معكوس 15% ومتبقٍ 6%' },
        { di: 2, sp: 9500, note: 'معكوس 5% ومتبقٍ 16%' },
        { di: 3, sp: 7900, note: 'عكس كامل: متبقٍ 0%' },
        { di: 4, sp: 7500, note: 'معكوس 25% — أكبر من خصم الشركة بـ 4 نقاط' },
      ]
      for (const ex of examples) {
        await addMonitoring(
          { distributorId: distIds[ex.di], batchId, productId: productIds[0], sellingPrice: ex.sp, date: addDays(b.date, 10), source: 'invoice', notes: ex.note, isDemo: true },
          { force: true, user: 'مستخدم تجريبي' },
        )
      }
    }
  }
}

export async function removeDemo() {
  await db.transaction('rw', TABLES.filter((t) => t !== 'settings').map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      if (t === 'settings') continue
      await db.table(t).where('isDemo').equals(1).delete()
    }
  })
}
