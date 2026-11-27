<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { useStore } from '../composables/store.js'
import { toast, toastError } from '../composables/ui.js'
import { readWorkbook, guessMapping, downloadTemplate } from '../lib/excel.js'
import { toNumber, validateDiscount, validateOriginalPrice, distributorPurchasePrice, round } from '../lib/calc.js'
import { createBatch, saveProduct, productKey, nameKey, saveDistributor, addMonitoring, PRICE_SOURCES } from '../db/repo.js'
import { computeDiscount, resolveCompanyDiscount } from '../lib/calc.js'
import { parsePackaging, packagingLabel, DOSAGE_FORMS, displayName } from '../lib/catalog.js'
import { fmtMoney, fmtPct, todayISO } from '../lib/format.js'
import { db } from '../db/index.js'

const route = useRoute()
const router = useRouter()
const { products, settings, distributors, batches, batchProducts, overrides, productMap } = useStore()
const mode = ref(['products', 'distributor'].includes(route.query.mode) ? route.query.mode : 'batch')
const MODES = {
  batch: { label: 'قائمة أسعار الشركة', desc: 'أسعار الشركة الرسمية (قبل الخصم) مع نسبة خصم الشركة للمذخر. تُنشئ قائمة أسعار جديدة.' },
  distributor: { label: 'أسعار بيع مذخر للصيدليات', desc: 'الأسعار التي يبيع بها مذخر معيّن للصيدليات. تُسجَّل كمتابعات أسعار مرتبطة بقائمة أسعار موجودة.' },
  products: { label: 'منتجات فقط', desc: 'إضافة أو تحديث بطاقات الأدوية دون أسعار أو خصومات.' },
}
const step = ref(1)

const FIELDS = {
  name: { label: 'اسم المنتج', aliases: ['اسم الدواء', 'المنتج', 'الصنف', 'اسم الصنف', 'item', 'product', 'name', 'product name', 'trade name', 'الاسم التجاري'], required: true },
  originalPrice: { label: 'السعر الأصلي (قبل خصم الشركة)', aliases: ['السعر', 'سعر', 'price', 'السعر الاصلي', 'سعر المستهلك', 'public price', 'retail'], required: true, modes: ['batch', 'products'] },
  sellingPrice: { label: 'سعر بيع المذخر للصيدلية', aliases: ['السعر', 'سعر البيع', 'سعر', 'price', 'سعر الصيدلية', 'selling price'], required: true, modes: ['distributor'] },
  discount: { label: 'الخصم %', aliases: ['الخصم', 'خصم', 'discount', 'نسبة الخصم', 'disc', 'خصم الشركة'], modes: ['batch'] },
  scientificName: { label: 'الاسم العلمي', aliases: ['scientific', 'generic', 'المادة الفعالة', 'scientific name'], modes: ['batch', 'products'] },
  manufacturer: { label: 'الشركة المصنعة', aliases: ['الشركة', 'المصنع', 'manufacturer', 'company'], modes: ['batch', 'products'] },
  dosageForm: { label: 'نوع العلاج', aliases: ['الشكل الدوائي', 'الشكل', 'النوع', 'form', 'dosage form', 'type'] },
  packaging: { label: 'التغليف', aliases: ['نوع التغليف', 'الغلاف', 'مغلف', 'packaging', 'wrapped', 'wrap'] },
  packSize: { label: 'حجم العبوة', aliases: ['العبوة', 'pack', 'pack size', 'size'] },
  group: { label: 'المجموعة الدوائية', aliases: ['المجموعة', 'group', 'category', 'الفئة'], modes: ['batch', 'products'] },
  notes: { label: 'ملاحظات', aliases: ['notes', 'ملاحظة'] },
}
const fields = computed(() => Object.entries(FIELDS).filter(([, f]) => !f.modes || f.modes.includes(mode.value)).map(([key, f]) => ({ key, ...f })))

/* 1. الملف */
const fileName = ref('')
const sheets = ref([])
const sheetIdx = ref(0)
const headerRow = ref(1)
const dragging = ref(false)
async function onFile(file) {
  if (!file) return
  try {
    sheets.value = await readWorkbook(file)
    if (!sheets.value.length || !sheets.value.some((s) => s.rows.length)) throw new Error('الملف لا يحتوي على بيانات')
    fileName.value = file.name
    sheetIdx.value = Math.max(0, sheets.value.findIndex((s) => s.rows.length))
    headerRow.value = 1
    meta.name = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
    step.value = 2
  } catch (e) { toastError(e) }
}
const sheet = computed(() => sheets.value[sheetIdx.value] || { rows: [] })
const headers = computed(() => (sheet.value.rows[headerRow.value - 1] || []).map((h, i) => String(h || '').trim() || `عمود ${i + 1}`))
const dataRows = computed(() => sheet.value.rows.slice(headerRow.value))

/* 2. مطابقة الأعمدة */
const mapping = ref({})
watch([headers, mode], () => (mapping.value = guessMapping(headers.value, fields.value)), { immediate: true })
const mappingOk = computed(() => fields.value.filter((f) => f.required).every((f) => mapping.value[f.key] >= 0))

/* 3. المراجعة */
const meta = reactive({ name: '', date: todayISO(), lab: '', defaultDiscount: 21, notes: '' })
const opts = reactive({ createMissing: true, updateProductPrices: true, fractionDiscount: false, updateExisting: false })
const cell = (r, k) => (mapping.value[k] >= 0 ? r[mapping.value[k]] : '')
const productIndex = computed(() => new Map(products.value.map((p) => [productKey(p), p])))
watch(step, (s) => {
  if (s === 3 && mapping.value.discount >= 0) {
    const vals = dataRows.value.map((r) => toNumber(cell(r, 'discount'))).filter((v) => Number.isFinite(v) && v > 0)
    opts.fractionDiscount = vals.length > 0 && vals.every((v) => v < 1)
  }
})
const parsed = computed(() => {
  const seen = new Set()
  return dataRows.value.map((r, i) => {
    const name = String(cell(r, 'name') ?? '').trim()
    const packSize = String(cell(r, 'packSize') ?? '').trim()
    const packaging = parsePackaging(cell(r, 'packaging'))
    const dosageForm = String(cell(r, 'dosageForm') ?? '').trim()
    const price = toNumber(cell(r, 'originalPrice'))
    let disc = mapping.value.discount >= 0 && String(cell(r, 'discount')).trim() !== '' ? toNumber(cell(r, 'discount')) : toNumber(meta.defaultDiscount)
    if (opts.fractionDiscount && mapping.value.discount >= 0 && Number.isFinite(disc) && disc < 1) disc = round(disc * 100)
    const errors = []
    if (!name) errors.push('اسم فارغ')
    errors.push(...validateOriginalPrice(price))
    if (mode.value === 'batch') errors.push(...validateDiscount(disc))
    // المغلف وغير المغلف منتجان مختلفان
    const key = productKey({ name, dosageForm, packSize, packaging })
    const dup = name && seen.has(key)
    seen.add(key)
    const existing = productIndex.value.get(key)
    const status = errors.length ? 'error' : dup ? 'dup' : existing ? 'match' : 'new'
    return {
      row: i + headerRow.value + 1, name, packSize, packaging, dosageForm, price, disc, errors, status, existing,
      priceDiff: existing && Number.isFinite(price) ? round(((price - existing.originalPrice) / existing.originalPrice) * 100, 2) : null,
      extra: { scientificName: cell(r, 'scientificName'), manufacturer: cell(r, 'manufacturer'), dosageForm, group: cell(r, 'group'), notes: cell(r, 'notes') },
    }
  })
})
const summary = computed(() => {
  const s = { match: 0, new: 0, dup: 0, error: 0 }
  for (const p of parsed.value) s[p.status]++
  return s
})
const reviewFilter = ref('')
const reviewRows = computed(() => parsed.value.filter((p) => !reviewFilter.value || p.status === reviewFilter.value).slice(0, 300))
const STATUS = { match: ['مطابق لمنتج موجود', 'bg-green-50 text-green-700 ring-green-200'], new: ['منتج جديد', 'bg-blue-50 text-blue-700 ring-blue-200'], dup: ['مكرر في الملف (سيُتجاهل)', 'bg-amber-50 text-amber-800 ring-amber-200'], error: ['خطأ (سيُتجاهل)', 'bg-red-50 text-red-700 ring-red-200'] }
const importable = computed(() => parsed.value.filter((p) => p.status === 'match' || (p.status === 'new' && (mode.value === 'products' || opts.createMissing))))

/* 4. التنفيذ */
const running = ref(false)
async function run() {
  running.value = true
  try {
    const items = []
    let created = 0, updated = 0
    const rows = importable.value.slice()
    // معاملة واحدة لكل المنتجات: أسرع بكثير ولا تُحدَّث الواجهة إلا مرة واحدة في النهاية
    await db.transaction('rw', db.products, async () => {
    for (const p of rows) {
      let pid = p.existing?.id
      if (!pid) {
        pid = await saveProduct({ name: p.name, packSize: p.packSize, packaging: p.packaging, originalPrice: p.price, status: 'active', ...p.extra }, { allowDuplicate: true })
        created++
      } else if (mode.value === 'products' && opts.updateExisting) {
        const cur = await db.products.get(pid)
        const patch = Object.fromEntries(Object.entries(p.extra).filter(([, v]) => String(v ?? '').trim() !== ''))
        await saveProduct({ ...cur, ...patch, originalPrice: p.price }, { allowDuplicate: true })
        updated++
      }
      items.push({ productId: pid, originalPrice: p.price, companyDiscount: p.disc })
    }
    })
    if (mode.value === 'products') {
      toast(`تم استيراد المنتجات: ${created} جديد${opts.updateExisting ? `، ${updated} محدَّث` : ''}`)
      router.push('/products')
      return
    }
    const id = await createBatch({ ...meta, type: 'list' }, items, [], { updateProductPrices: opts.updateProductPrices })
    toast(`تم إنشاء قائمة أسعار جديدة بـ ${items.length} منتج (${created} منتج جديد)`)
    router.push(`/batches/${id}`)
  } catch (e) { toastError(e) } finally { running.value = false }
}
function reset() { step.value = 1; sheets.value = []; fileName.value = '' }

/* ======== وضع: أسعار بيع مذخر للصيدليات ======== */
const dm = reactive({ distributorId: null, newName: '', batchId: batches.value[0]?.id || null, date: todayISO(), source: 'invoice', notes: '' })
const batchItems = computed(() => batchProducts.value.filter((b) => b.batchId === dm.batchId).map((b) => ({ ...b, product: productMap.value.get(b.productId) })).filter((b) => b.product))
const batchIndex = computed(() => {
  const exact = new Map(), loose = new Map()
  for (const b of batchItems.value) {
    exact.set(productKey(b.product), b)
    const k = `${nameKey(b.product.name)}|${nameKey(b.product.dosageForm)}|${b.product.packaging || ''}`
    loose.set(k, loose.has(k) ? null : b) // null = غير فريد
  }
  return { exact, loose }
})
const distParsed = computed(() => {
  if (mode.value !== 'distributor') return []
  const seen = new Set()
  return dataRows.value.map((r, i) => {
    const name = String(cell(r, 'name') ?? '').trim()
    const dosageForm = String(cell(r, 'dosageForm') ?? '').trim()
    const packSize = String(cell(r, 'packSize') ?? '').trim()
    const packaging = parsePackaging(cell(r, 'packaging'))
    const raw = cell(r, 'sellingPrice')
    const price = toNumber(raw)
    const base = { row: i + headerRow.value + 1, name, dosageForm, packaging, price, note: String(cell(r, 'notes') ?? '').trim() }
    if (!name) return { ...base, status: 'error', msg: 'اسم فارغ' }
    if (String(raw ?? '').trim() === '') return { ...base, status: 'empty', msg: 'لا يوجد سعر' }
    if (!Number.isFinite(price) || price <= 0) return { ...base, status: 'error', msg: 'سعر غير صالح' }
    const key = productKey({ name, dosageForm, packSize, packaging })
    if (seen.has(key)) return { ...base, status: 'dup', msg: 'مكرر في الملف' }
    seen.add(key)
    const item = batchIndex.value.exact.get(key) || batchIndex.value.loose.get(`${nameKey(name)}|${nameKey(dosageForm)}|${packaging}`)
    if (!item) return { ...base, status: 'nomatch', msg: 'المنتج غير موجود في قائمة الأسعار المختارة' }
    const { discount } = resolveCompanyDiscount({ batchProduct: item, overrides: overrides.value, distributorId: dm.distributorId, productId: item.productId })
    const res = computeDiscount({ originalPrice: item.originalPrice, companyDiscount: discount, sellingPrice: price })
    return { ...base, status: 'ok', item, res }
  })
})
const distSummary = computed(() => {
  const s = { ok: 0, nomatch: 0, empty: 0, dup: 0, error: 0, alerts: 0 }
  for (const p of distParsed.value) { s[p.status]++; if (p.res && (p.res.exceedsCompany || p.res.aboveOriginal)) s.alerts++ }
  return s
})
const DSTATUS = { ok: ['جاهز للتسجيل', 'bg-green-50 text-green-700 ring-green-200'], nomatch: ['غير موجود في القائمة', 'bg-amber-50 text-amber-800 ring-amber-200'], empty: ['بدون سعر (يُتجاهل)', 'bg-slate-100 text-slate-500 ring-slate-200'], dup: ['مكرر (يُتجاهل)', 'bg-amber-50 text-amber-800 ring-amber-200'], error: ['خطأ (يُتجاهل)', 'bg-red-50 text-red-700 ring-red-200'], alerts: ['تنبيهات للتحقق', 'bg-red-50 text-red-700 ring-red-200'] }
const distFilter = ref('')
const distRows = computed(() => distParsed.value.filter((p) => !distFilter.value || (distFilter.value === 'alerts' ? p.res && (p.res.exceedsCompany || p.res.aboveOriginal) : p.status === distFilter.value)))
const distReady = computed(() => (dm.distributorId || dm.newName.trim()) && dm.batchId && dm.date && distSummary.value.ok > 0)
async function runDist() {
  running.value = true
  try {
    let did = dm.distributorId
    if (!did) did = await saveDistributor({ name: dm.newName.trim() })
    let ok = 0, skipped = 0
    for (const p of distParsed.value.filter((x) => x.status === 'ok')) {
      try {
        await addMonitoring({ distributorId: did, batchId: dm.batchId, productId: p.item.productId, sellingPrice: p.price, date: dm.date, source: dm.source, notes: p.note || dm.notes }, { user: settings.value.currentUser })
        ok++
      } catch (e) { if (e.code === 'duplicate') skipped++; else throw e }
    }
    toast(`تم تسجيل ${ok} سعر بيع${skipped ? ` (تم تجاهل ${skipped} مسجّل مسبقاً)` : ''}`)
    router.push(`/distributors/${did}`)
  } catch (e) { toastError(e) } finally { running.value = false }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">استيراد من Excel</h1><p class="page-sub">اختر نوع الملف أولاً — كل نوع يُعامل بطريقة مختلفة</p></div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <button v-for="(m, k) in MODES" :key="k" :disabled="step > 1" @click="mode = k"
        :class="['card p-4 text-right transition disabled:cursor-not-allowed', mode === k ? 'ring-2 ring-brand-500 border-brand-500' : 'hover:border-slate-300', step > 1 && mode !== k && 'opacity-50']">
        <div class="flex items-center gap-2 font-semibold text-slate-800"><span :class="['w-4 h-4 rounded-full border-2', mode === k ? 'border-brand-600 bg-brand-600 ring-2 ring-white ring-inset' : 'border-slate-300']"></span>{{ m.label }}</div>
        <p class="text-xs text-slate-500 mt-1.5 leading-5">{{ m.desc }}</p>
      </button>
    </div>
    <div v-if="mode === 'distributor' && !batches.length" class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">يجب أولاً استيراد «قائمة أسعار الشركة» حتى يُحسب الخصم المعكوس والمتبقي مقارنة بها.</div>

    <!-- مؤشر الخطوات -->
    <ol class="flex items-center gap-2 text-sm overflow-x-auto pb-1">
      <li v-for="(s, i) in ['اختيار الملف', 'المعاينة ومطابقة الأعمدة', 'المراجعة والتأكيد']" :key="i" class="flex items-center gap-2 shrink-0">
        <span :class="['w-7 h-7 rounded-full grid place-items-center text-xs font-bold', step > i + 1 ? 'bg-teal-500 text-white' : step === i + 1 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500']">{{ step > i + 1 ? '✓' : i + 1 }}</span>
        <span :class="step === i + 1 ? 'font-semibold text-slate-800' : 'text-slate-500'">{{ s }}</span>
        <span v-if="i < 2" class="w-8 h-px bg-slate-300"></span>
      </li>
    </ol>

    <!-- 1 -->
    <div v-if="step === 1" class="card p-6">
      <label :class="['flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 cursor-pointer transition', dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400']"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="dragging = false; onFile($event.dataTransfer.files[0])">
        <Upload class="w-10 h-10 text-slate-400 mb-3" />
        <div class="font-semibold text-slate-700">اسحب ملف Excel هنا أو انقر للاختيار</div>
        <div class="text-sm text-slate-500 mt-1">xlsx, xls, csv — يمكن أن تكون أسماء الأعمدة بأي صيغة، وستتم مطابقتها في الخطوة التالية</div>
        <input type="file" accept=".xlsx,.xls,.csv" class="hidden" @change="onFile($event.target.files[0])" />
      </label>
      <div class="flex justify-center mt-4"><button class="btn-ghost btn-sm" @click="downloadTemplate(mode)"><Download class="w-4 h-4" />تنزيل قالب جاهز</button></div>
    </div>

    <!-- 2 -->
    <template v-if="step === 2">
      <div class="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="flex items-center gap-2 text-sm"><FileSpreadsheet class="w-5 h-5 text-green-600" /><span class="font-medium truncate">{{ fileName }}</span></div>
        <div><label class="label">الورقة</label><select v-model="sheetIdx" class="input"><option v-for="(s, i) in sheets" :key="i" :value="i">{{ s.name }} ({{ s.rows.length }} صف)</option></select></div>
        <div><label class="label">رقم صف العناوين</label><input v-model.number="headerRow" type="number" min="1" :max="sheet.rows.length" class="input ltr text-right" /></div>
      </div>
      <div class="card">
        <div class="card-h"><div class="card-t">مطابقة الأعمدة مع حقول التطبيق</div></div>
        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div v-for="f in fields" :key="f.key">
            <label class="label">{{ f.label }} <span v-if="f.required" class="text-red-500">*</span></label>
            <select v-model="mapping[f.key]" :class="['input', f.required && mapping[f.key] < 0 && 'input-err']"><option :value="-1">— غير موجود —</option><option v-for="(h, i) in headers" :key="i" :value="i">{{ h }}</option></select>
          </div>
          <div v-if="mode === 'batch' && mapping.discount < 0" class="sm:col-span-2 lg:col-span-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">لا يوجد عمود للخصم — سيُطبق الخصم الافتراضي الذي تحدده في الخطوة التالية على جميع المنتجات.
            <b class="block mt-1">إذا كان هذا الملف أسعار بيع مذخر للصيدليات، فارجع واختر «أسعار بيع مذخر للصيدليات» بدلاً من «قائمة أسعار الشركة».</b></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><div class="card-t">معاينة البيانات (أول 10 صفوف)</div><span class="text-xs text-slate-500">{{ dataRows.length }} صف بيانات</span></div>
        <div class="overflow-x-auto"><table class="tbl"><thead><tr><th v-for="(h, i) in headers" :key="i">{{ h }}<div v-for="f in fields.filter((f) => mapping[f.key] === i)" :key="f.key" class="text-brand-600 font-normal">← {{ f.label }}</div></th></tr></thead>
          <tbody><tr v-for="(r, i) in dataRows.slice(0, 10)" :key="i"><td v-for="(h, j) in headers" :key="j" class="whitespace-nowrap">{{ r[j] }}</td></tr></tbody></table></div>
      </div>
      <div class="flex justify-between"><button class="btn-secondary" @click="reset"><ArrowRight class="w-4 h-4" />ملف آخر</button><button class="btn-primary" :disabled="!mappingOk" @click="step = 3">التالي: المراجعة<ArrowLeft class="w-4 h-4" /></button></div>
    </template>

    <!-- 3: أسعار مذخر -->
    <template v-if="step === 3 && mode === 'distributor'">
      <div class="card">
        <div class="card-h"><div class="card-t">بيانات المتابعة</div></div>
        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label class="label">المذخر *</label>
            <select v-model="dm.distributorId" class="input"><option :value="null">+ مذخر جديد</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select>
            <input v-if="!dm.distributorId" v-model="dm.newName" class="input mt-2" placeholder="اسم المذخر الجديد" /></div>
          <div><label class="label">قائمة أسعار الشركة المرجعية *</label>
            <select v-model="dm.batchId" class="input"><option :value="null" disabled>اختر</option><option v-for="b in batches" :key="b.id" :value="b.id">#{{ b.code }} — {{ b.name }} ({{ b.date }})</option></select>
            <p class="text-xs text-slate-400 mt-1">منها يُؤخذ السعر الأصلي وخصم الشركة.</p></div>
          <div><label class="label">تاريخ الأسعار *</label><input v-model="dm.date" type="date" class="input" /></div>
          <div><label class="label">مصدر السعر</label><select v-model="dm.source" class="input"><option v-for="(l, k) in PRICE_SOURCES" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="sm:col-span-2 lg:col-span-4"><label class="label">ملاحظات</label><input v-model="dm.notes" class="input" /></div>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        <button v-for="(v, k) in distSummary" :key="k" @click="distFilter = distFilter === k ? '' : k" :class="['card p-3 text-right transition', distFilter === k && 'ring-2 ring-brand-300']">
          <div class="text-xs text-slate-500">{{ DSTATUS[k][0] }}</div><div :class="['text-xl font-bold tabular-nums', k === 'alerts' && v && 'text-red-600']">{{ v }}</div>
        </button>
      </div>
      <div class="card">
        <div class="card-h"><div class="card-t">مراجعة الأسعار قبل التسجيل</div><span class="text-xs text-slate-500">سيتم تسجيل {{ distSummary.ok }} سعر</span></div>
        <div class="overflow-x-auto max-h-[560px]">
          <table class="tbl">
            <thead class="sticky top-0"><tr><th>صف</th><th>المنتج</th><th>الحالة</th><th class="num">السعر الأصلي</th><th class="num">خصم الشركة</th><th class="num">سعر بيع المذخر</th><th class="num">المعكوس</th><th class="num">المتبقي</th></tr></thead>
            <tbody><tr v-for="p in distRows" :key="p.row">
              <td class="text-slate-400 tabular-nums">{{ p.row }}</td>
              <td class="font-medium">{{ p.name }}<div class="text-xs text-slate-500">{{ p.dosageForm || 'نوع غير محدد' }} · {{ packagingLabel(p.packaging) }}</div></td>
              <td><span :class="['badge', DSTATUS[p.status][1]]">{{ DSTATUS[p.status][0] }}</span><div v-if="p.res && p.res.exceedsCompany" class="text-xs text-red-600 mt-0.5">المعكوس أكبر من خصم الشركة بـ {{ fmtMoney(p.res.exceedPoints) }} نقطة</div><div v-else-if="p.res && p.res.aboveOriginal" class="text-xs text-red-600 mt-0.5">سعر البيع أعلى من السعر الأصلي — تحقق</div></td>
              <td class="num">{{ p.item ? fmtMoney(p.item.originalPrice) : '—' }}</td>
              <td class="num">{{ p.res ? fmtPct(p.res.companyDiscount) : '—' }}</td>
              <td class="num font-semibold">{{ Number.isFinite(p.price) ? fmtMoney(p.price) : '—' }}</td>
              <td class="num">{{ p.res ? fmtPct(p.res.pharmacyDiscountPct) : '—' }}</td>
              <td :class="['num font-semibold', p.res && p.res.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ p.res ? fmtPct(p.res.remainingDiscountPct) : '—' }}</td>
            </tr></tbody>
          </table>
        </div>
      </div>
      <div class="rounded-lg bg-slate-100 p-3 text-sm text-slate-600 flex gap-2"><CheckCircle2 class="w-5 h-5 text-teal-600 shrink-0" />تُسجَّل الأسعار كمتابعات لهذا المذخر. لا تُعدَّل قائمة أسعار الشركة ولا أي سعر سابق.</div>
      <div class="flex justify-between"><button class="btn-secondary" @click="step = 2"><ArrowRight class="w-4 h-4" />رجوع</button>
        <button class="btn-primary" :disabled="running || !distReady" @click="runDist"><CheckCircle2 class="w-4 h-4" />تسجيل الأسعار ({{ distSummary.ok }})</button></div>
    </template>

    <!-- 3 -->
    <template v-if="step === 3 && mode !== 'distributor'">
      <div v-if="mode === 'batch'" class="card">
        <div class="card-h"><div class="card-t">بيانات قائمة الأسعار الجديدة</div></div>
        <div class="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="sm:col-span-2"><label class="label">اسم القائمة *</label><input v-model="meta.name" class="input" /></div>
          <div><label class="label">التاريخ *</label><input v-model="meta.date" type="date" class="input" /></div>
          <div><label class="label">المعمل</label><input v-model="meta.lab" class="input" /></div>
          <div><label class="label">الخصم الافتراضي % <span class="text-xs text-slate-400">(للصفوف بدون خصم)</span></label><input v-model.number="meta.defaultDiscount" type="number" step="any" class="input ltr text-right" /></div>
          <div class="lg:col-span-3"><label class="label">ملاحظات</label><input v-model="meta.notes" class="input" /></div>
          <label class="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="opts.createMissing" type="checkbox" class="rounded border-slate-300" />إنشاء المنتجات غير الموجودة تلقائياً</label>
          <label class="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="opts.updateProductPrices" type="checkbox" class="rounded border-slate-300" />تحديث السعر الحالي في بطاقة المنتج</label>
          <label v-if="mapping.discount >= 0" class="sm:col-span-2 lg:col-span-4 inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="opts.fractionDiscount" type="checkbox" class="rounded border-slate-300" />الخصم مكتوب ككسر عشري في الملف (0.21 = 21%)</label>
        </div>
      </div>
      <div v-else class="card p-4"><label class="inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="opts.updateExisting" type="checkbox" class="rounded border-slate-300" />تحديث بيانات وأسعار المنتجات المطابقة الموجودة (وإلا تُتجاهل)</label></div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button v-for="(v, k) in summary" :key="k" @click="reviewFilter = reviewFilter === k ? '' : k" :class="['card p-3 text-right transition', reviewFilter === k && 'ring-2 ring-brand-300']">
          <div class="text-xs text-slate-500">{{ STATUS[k][0] }}</div><div class="text-xl font-bold tabular-nums">{{ v }}</div>
        </button>
      </div>

      <div class="card">
        <div class="card-h"><div class="card-t">مراجعة الأسعار</div><span class="text-xs text-slate-500">سيتم استيراد {{ importable.length }} صف</span></div>
        <div class="overflow-x-auto max-h-[520px]">
          <table class="tbl">
            <thead class="sticky top-0"><tr><th>صف</th><th>اسم المنتج (كما في الملف)</th><th>الحالة</th><th class="num">السعر</th><th class="num">السعر الحالي</th><th class="num">التغير</th><th v-if="mode === 'batch'" class="num">الخصم</th><th v-if="mode === 'batch'" class="num">سعر شراء المذخر</th></tr></thead>
            <tbody><tr v-for="p in reviewRows" :key="p.row">
              <td class="text-slate-400 tabular-nums">{{ p.row }}</td>
              <td class="font-medium">{{ p.name || '—' }}<span v-if="p.packSize" class="text-xs text-slate-400"> · {{ p.packSize }}</span><div class="text-xs text-slate-500">{{ p.dosageForm || 'نوع غير محدد' }} · {{ packagingLabel(p.packaging) }}</div><div v-if="p.existing && p.existing.name !== p.name" class="text-xs text-slate-400">← {{ p.existing.name }}</div></td>
              <td><span :class="['badge', STATUS[p.status][1]]">{{ STATUS[p.status][0] }}</span><div v-if="p.errors.length" class="text-xs text-red-600 mt-0.5">{{ p.errors.join('، ') }}</div></td>
              <td class="num">{{ fmtMoney(p.price) }}</td>
              <td class="num text-slate-500">{{ p.existing ? fmtMoney(p.existing.originalPrice) : '—' }}</td>
              <td :class="['num', p.priceDiff > 0 ? 'text-red-600' : p.priceDiff < 0 ? 'text-green-700' : 'text-slate-400']">{{ p.priceDiff == null ? '—' : (p.priceDiff > 0 ? '+' : '') + fmtPct(p.priceDiff) }}</td>
              <td v-if="mode === 'batch'" class="num">{{ fmtPct(p.disc) }}</td>
              <td v-if="mode === 'batch'" class="num">{{ p.errors.length ? '—' : fmtMoney(distributorPurchasePrice(p.price, p.disc)) }}</td>
            </tr></tbody>
          </table>
        </div>
      </div>

      <div class="rounded-lg bg-slate-100 p-3 text-sm text-slate-600 flex gap-2"><CheckCircle2 class="w-5 h-5 text-teal-600 shrink-0" />{{ mode === 'batch' ? 'سيتم إنشاء قائمة أسعار جديدة مستقلة. لن تُعدَّل أي قائمة سابقة أو متابعة تاريخية.' : 'تُحفظ أسماء المنتجات كما وردت في الملف حرفياً.' }}</div>
      <div v-if="summary.error || summary.dup" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 flex gap-2"><AlertTriangle class="w-5 h-5 shrink-0" />{{ summary.error }} صف بأخطاء و{{ summary.dup }} صف مكرر لن يتم استيرادها.</div>
      <div class="flex justify-between"><button class="btn-secondary" @click="step = 2"><ArrowRight class="w-4 h-4" />رجوع</button>
        <button class="btn-primary" :disabled="running || !importable.length || (mode === 'batch' && (!meta.name || !meta.date))" @click="run"><CheckCircle2 class="w-4 h-4" />تأكيد الاستيراد ({{ importable.length }})</button></div>
    </template>
  </div>
</template>
