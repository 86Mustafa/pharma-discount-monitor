/**
 * تصنيف المنتجات: نوع العلاج + نوع التغليف.
 * المنتج نفسه بغلاف وبدون غلاف يُعامل كمنتجين منفصلين لأن أسعارهما مختلفة.
 */

export const DOSAGE_FORMS = ['شراب', 'حبوب', 'كريم', 'مرهم', 'معلق', 'معقم', 'قطرة']

export const PACKAGING = { wrapped: 'مغلف', unwrapped: 'بدون غلاف' }
const PACKAGING_ORDER = ['wrapped', 'unwrapped', '']

export const UNSPECIFIED = 'غير محدد'

export const packagingLabel = (v) => PACKAGING[v] || UNSPECIFIED
export const formLabel = (v) => (v && String(v).trim()) || UNSPECIFIED

/** اسم العرض: الاسم كما أُدخل + التغليف للتمييز (لا يغيّر الاسم المخزّن) */
export function displayName(p) {
  if (!p) return '—'
  return PACKAGING[p.packaging] ? `${p.name} (${PACKAGING[p.packaging]})` : p.name
}

/** قراءة نوع التغليف من نص حر (استيراد Excel) */
export function parsePackaging(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return ''
  if (/بدون|غير مغلف|بلا|unwrapped|without|no|loose|bulk/.test(s)) return 'unwrapped'
  if (/مغلف|غلاف|wrapped|with|boxed|box|yes/.test(s)) return 'wrapped'
  return ''
}

const formRank = (f) => {
  const i = DOSAGE_FORMS.indexOf(formLabel(f))
  if (i >= 0) return [0, i, '']
  return f && String(f).trim() ? [1, 0, String(f)] : [2, 0, '']
}

export function compareFormPackaging(a, b) {
  const ra = formRank(a.dosageForm), rb = formRank(b.dosageForm)
  if (ra[0] !== rb[0]) return ra[0] - rb[0]
  if (ra[1] !== rb[1]) return ra[1] - rb[1]
  if (ra[2] !== rb[2]) return ra[2].localeCompare(rb[2], 'ar')
  return PACKAGING_ORDER.indexOf(a.packaging || '') - PACKAGING_ORDER.indexOf(b.packaging || '')
}

/**
 * تجميع صفوف حسب نوع العلاج ثم نوع التغليف.
 * @param rows صفوف
 * @param getProduct (row) => المنتج (يحوي dosageForm و packaging)
 * @returns [{ key, form, packaging, label, rows }]
 */
export function groupByFormPackaging(rows, getProduct = (r) => r) {
  const groups = new Map()
  for (const r of rows) {
    const p = getProduct(r) || {}
    const form = formLabel(p.dosageForm)
    const packaging = PACKAGING[p.packaging] ? p.packaging : ''
    const key = `${form}|${packaging}`
    if (!groups.has(key)) groups.set(key, { key, form, packaging, dosageForm: p.dosageForm, label: `${form} — ${packagingLabel(packaging)}`, rows: [] })
    groups.get(key).rows.push(r)
  }
  return [...groups.values()].sort((a, b) => compareFormPackaging({ dosageForm: a.form === UNSPECIFIED ? '' : a.form, packaging: a.packaging }, { dosageForm: b.form === UNSPECIFIED ? '' : b.form, packaging: b.packaging }))
}
