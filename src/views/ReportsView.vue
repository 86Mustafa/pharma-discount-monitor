<script setup>
import { computed, reactive, ref } from 'vue'
import { Download, Printer, FileSpreadsheet, AlertTriangle } from 'lucide-vue-next'
import EmptyState from '../components/EmptyState.vue'
import PrintHeader from '../components/PrintHeader.vue'
import ClassBadge from '../components/ClassBadge.vue'
import { useStore } from '../composables/store.js'
import { latestByPair, avg } from '../lib/analytics.js'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { exportDiscountReport, exportMonitoring, exportDistributorPrices } from '../lib/reports.js'
import { exportBatch } from '../lib/batchExport.js'
import { exportExcel } from '../lib/excel.js'
import { PRODUCT_STATUS } from '../db/repo.js'

const store = useStore()
const { monitoring, batches, distributors, products, settings } = store
const dec = computed(() => settings.value.pctDecimals)
const kind = ref('reflected')
const KINDS = { reflected: 'تقرير الخصم المعكوس', remaining: 'تقرير الخصم المتبقي', alerts: 'تنبيهات التحقق' }
const f = reactive({ batchId: '', distributorId: '', from: '', to: '' })
const filtered = computed(() => monitoring.value.filter((m) => (!f.batchId || m.batchId === f.batchId) && (!f.distributorId || m.distributorId === f.distributorId) && (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to)))
const latest = computed(() => latestByPair(filtered.value))
const key = computed(() => (kind.value === 'remaining' ? 'remainingDiscountPct' : 'pharmacyDiscountPct'))

function group(by, nameKey) {
  const m = new Map()
  for (const e of latest.value) {
    if (!m.has(e[by])) m.set(e[by], { name: e[nameKey], list: [] })
    m.get(e[by]).list.push(e)
  }
  return [...m.values()].map(({ name, list }) => {
    const v = list.map((e) => e[key.value])
    return { name, count: list.length, company: avg(list.map((e) => e.companyDiscount)), avg: avg(v), min: Math.min(...v), max: Math.max(...v), other: avg(list.map((e) => (kind.value === 'remaining' ? e.pharmacyDiscountPct : e.remainingDiscountPct))), alerts: list.filter((e) => e.exceedsCompany).length }
  }).sort((a, b) => b.avg - a.avg)
}
const byDist = computed(() => group('distributorId', 'distributorName'))
const byProduct = computed(() => group('productId', 'productName'))
const alerts = computed(() => filtered.value.filter((e) => e.exceedsCompany || e.aboveOriginal).sort((a, b) => (a.date < b.date ? 1 : -1)))
const label = computed(() => (kind.value === 'remaining' ? 'المتبقي' : 'المعكوس'))
const otherLabel = computed(() => (kind.value === 'remaining' ? 'متوسط المعكوس' : 'متوسط المتبقي'))

function doExport() {
  if (kind.value === 'alerts') return exportMonitoring('تنبيهات-التحقق', alerts.value, 'التنبيهات')
  exportDiscountReport(kind.value, latest.value, filtered.value)
}
const exp = reactive({ batchId: '', distributorId: '' })
function exportProducts() {
  exportExcel('المنتجات', [{ name: 'المنتجات', rows: products.value.map((p) => ({ 'المعرف': p.id, 'اسم الدواء': p.name, 'الاسم العلمي': p.scientificName, 'الشركة المصنعة': p.manufacturer, 'الشكل الدوائي': p.dosageForm, 'حجم العبوة': p.packSize, 'السعر الأصلي': p.originalPrice, 'المجموعة الدوائية': p.group, 'الحالة': PRODUCT_STATUS[p.status], 'ملاحظات': p.notes })) }])
}
const printPage = () => window.print()
</script>

<template>
  <div class="space-y-4">
    <PrintHeader :title="KINDS[kind]" :subtitle="[f.from && `من ${f.from}`, f.to && `إلى ${f.to}`, f.batchId && batches.find((b) => b.id === f.batchId)?.name].filter(Boolean).join(' · ')" />
    <div class="flex flex-wrap items-end justify-between gap-3 no-print">
      <div><h1 class="page-title">التقارير</h1><p class="page-sub">جميع النسب نقاط مئوية من السعر الأصلي، محسوبة من أحدث متابعة لكل منتج لدى كل مذخر</p></div>
      <div class="flex gap-2">
        <button class="btn-secondary" :disabled="!filtered.length" @click="doExport"><Download class="w-4 h-4" />تصدير Excel</button>
        <button class="btn-secondary" :disabled="!filtered.length" @click="printPage"><Printer class="w-4 h-4" />طباعة / PDF</button>
      </div>
    </div>

    <div class="card p-3 space-y-3 no-print">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="(l, k) in KINDS" :key="k" @click="kind = k" :class="['rounded-lg px-3 py-1.5 text-sm border transition', kind === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50']">{{ l }}</button>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <select v-model="f.batchId" class="input"><option value="">كل القوائم</option><option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option></select>
        <select v-model="f.distributorId" class="input"><option value="">كل المذاخر</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select>
        <input v-model="f.from" type="date" class="input" title="من" />
        <input v-model="f.to" type="date" class="input" title="إلى" />
      </div>
    </div>

    <EmptyState v-if="!filtered.length" title="لا توجد متابعات ضمن الفلاتر" />
    <template v-else-if="kind !== 'alerts'">
      <div v-for="sec in [{ t: 'حسب المذخر', rows: byDist }, { t: 'حسب المنتج', rows: byProduct }]" :key="sec.t" class="card">
        <div class="card-h"><div class="card-t">{{ KINDS[kind] }} — {{ sec.t }}</div></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>{{ sec.t === 'حسب المذخر' ? 'المذخر' : 'المنتج' }}</th><th class="num">السجلات</th><th class="num">متوسط خصم الشركة</th><th class="num">متوسط {{ label }}</th><th class="num">أدنى {{ label }}</th><th class="num">أعلى {{ label }}</th><th class="num">{{ otherLabel }}</th><th class="num">تنبيهات</th></tr></thead>
            <tbody><tr v-for="r in sec.rows.value" :key="r.name">
              <td class="font-medium">{{ r.name }}</td>
              <td class="num">{{ r.count }}</td>
              <td class="num">{{ fmtPct(r.company, dec) }}</td>
              <td :class="['num font-semibold', kind === 'remaining' && r.avg < 0 ? 'text-red-600' : '']">{{ fmtPct(r.avg, dec) }}</td>
              <td class="num">{{ fmtPct(r.min, dec) }}</td>
              <td class="num">{{ fmtPct(r.max, dec) }}</td>
              <td class="num text-slate-500">{{ fmtPct(r.other, dec) }}</td>
              <td :class="['num', r.alerts && 'text-red-600 font-semibold']">{{ r.alerts }}</td>
            </tr></tbody>
          </table>
        </div>
      </div>
    </template>
    <div v-else class="card">
      <div class="card-h"><div class="card-t inline-flex items-center gap-2"><AlertTriangle class="w-4 h-4 text-red-500" />تنبيهات التحقق ({{ alerts.length }})</div></div>
      <p class="px-4 pt-3 text-xs text-slate-500">حالات يكون فيها الخصم المعكوس أكبر من خصم الشركة أو سعر البيع أعلى من الأصلي. هذه تنبيهات للتحقق من المعلومة وليست أحكاماً على المذخر.</p>
      <EmptyState v-if="!alerts.length" title="لا توجد تنبيهات" />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>التاريخ</th><th>المذخر</th><th>المنتج</th><th class="num">خصم الشركة</th><th class="num">سعر البيع</th><th class="num">المعكوس</th><th class="num">التجاوز</th><th>المؤشر</th><th>ملاحظات</th></tr></thead>
          <tbody><tr v-for="e in alerts" :key="e.id">
            <td class="tabular-nums">{{ e.date }}</td><td>{{ e.distributorName }}</td><td>{{ e.productName }}</td>
            <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td><td class="num">{{ fmtMoney(e.sellingPrice) }}</td>
            <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
            <td class="num text-red-600 font-semibold">{{ e.exceedsCompany ? fmtMoney(e.exceedPoints, dec) + ' نقطة' : '—' }}</td>
            <td><ClassBadge :category="e.category" /></td><td class="text-xs text-slate-500">{{ e.notes }}</td>
          </tr></tbody>
        </table>
      </div>
    </div>

    <div class="card no-print">
      <div class="card-h"><div class="card-t inline-flex items-center gap-2"><FileSpreadsheet class="w-4 h-4" />تصدير البيانات إلى Excel</div></div>
      <div class="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div class="rounded-lg border border-slate-200 p-3 space-y-2"><div class="font-medium text-sm">المنتجات</div><button class="btn-secondary btn-sm w-full" :disabled="!products.length" @click="exportProducts">تصدير</button></div>
        <div class="rounded-lg border border-slate-200 p-3 space-y-2"><div class="font-medium text-sm">قائمة أسعار</div>
          <select v-model="exp.batchId" class="input py-1.5 text-[13px]"><option value="">اختر القائمة…</option><option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option></select>
          <button class="btn-secondary btn-sm w-full" :disabled="!exp.batchId" @click="exportBatch(exp.batchId, store)">تصدير</button></div>
        <div class="rounded-lg border border-slate-200 p-3 space-y-2"><div class="font-medium text-sm">أسعار مذخر معين</div>
          <select v-model="exp.distributorId" class="input py-1.5 text-[13px]"><option value="">اختر المذخر…</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select>
          <button class="btn-secondary btn-sm w-full" :disabled="!exp.distributorId" @click="exportDistributorPrices(distributors.find((d) => d.id === exp.distributorId), monitoring)">تصدير</button></div>
        <div class="rounded-lg border border-slate-200 p-3 space-y-2"><div class="font-medium text-sm">كل المتابعات</div><button class="btn-secondary btn-sm w-full" :disabled="!monitoring.length" @click="exportMonitoring('كل-المتابعات', monitoring)">تصدير</button></div>
      </div>
    </div>
  </div>
</template>
