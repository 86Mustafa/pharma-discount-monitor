<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Download, Printer, BarChart3, Trophy } from 'lucide-vue-next'
import ComboBox from '../components/ComboBox.vue'
import ChartCanvas from '../components/ChartCanvas.vue'
import ClassBadge from '../components/ClassBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import PrintHeader from '../components/PrintHeader.vue'
import { useStore } from '../composables/store.js'
import { latestByPair, avg, byDateDesc } from '../lib/analytics.js'
import { round } from '../lib/calc.js'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { exportExcel } from '../lib/excel.js'
import { monitoringRow } from '../lib/reports.js'
import { barOptions, lineOptions, discountByDistributorData, priceOverTimeData } from '../lib/charts.js'

const route = useRoute()
const { products, distributors, monitoring, productMap, batchMap, settings, distributorColor } = useStore()
const dec = computed(() => settings.value.pctDecimals)

const monitoredIds = computed(() => new Set(monitoring.value.map((m) => m.productId)))
const productOptions = computed(() => products.value.filter((p) => monitoredIds.value.has(p.id)).map((p) => ({ value: p.id, label: p.name, sub: p.scientificName })))
const f = reactive({ productId: Number(route.query.product) || productOptions.value[0]?.value || null, from: '', to: '', distributors: [] })
const sortMode = ref('reflected')

const productEntries = computed(() => monitoring.value.filter((m) => m.productId === f.productId))
const availableDist = computed(() => distributors.value.filter((d) => productEntries.value.some((m) => m.distributorId === d.id)))
const selected = computed(() => (f.distributors.length ? new Set(f.distributors) : new Set(availableDist.value.map((d) => d.id))))
function toggleDist(id) {
  const all = availableDist.value.map((d) => d.id)
  let cur = f.distributors.length ? [...f.distributors] : [...all]
  cur = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  f.distributors = cur.length === all.length ? [] : cur
}
const inRange = computed(() => productEntries.value.filter((m) => selected.value.has(m.distributorId) && (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to)))
const latest = computed(() => latestByPair(inRange.value))
const SORTS = {
  reflected: { label: 'أكبر خصم معكوس', fn: (a, b) => b.pharmacyDiscountPct - a.pharmacyDiscountPct },
  remaining: { label: 'أكبر خصم متبقٍ', fn: (a, b) => b.remainingDiscountPct - a.remainingDiscountPct },
  lowPrice: { label: 'أقل سعر بيع', fn: (a, b) => a.sellingPrice - b.sellingPrice },
  highPrice: { label: 'أعلى سعر بيع', fn: (a, b) => b.sellingPrice - a.sellingPrice },
  recent: { label: 'أحدث متابعة', fn: byDateDesc },
}
const ranked = computed(() => [...latest.value].sort(SORTS[sortMode.value].fn))
const summary = computed(() => latest.value.length ? {
  company: avg(latest.value.map((e) => e.companyDiscount)),
  reflected: avg(latest.value.map((e) => e.pharmacyDiscountPct)),
  remaining: avg(latest.value.map((e) => e.remainingDiscountPct)),
  spread: round(Math.max(...latest.value.map((e) => e.pharmacyDiscountPct)) - Math.min(...latest.value.map((e) => e.pharmacyDiscountPct))),
} : null)

const barData = computed(() => discountByDistributorData(ranked.value.map((e) => ({ label: e.distributorName, company: e.companyDiscount, reflected: e.pharmacyDiscountPct, remaining: e.remainingDiscountPct }))))
const lineData = computed(() => priceOverTimeData(inRange.value, distributorColor))

/* مقارنة تاريخية: المذخر × القائمة → المعكوس / المتبقي لأحدث متابعة */
const historical = computed(() => {
  const batchIds = [...new Set(inRange.value.map((m) => m.batchId))].map((id) => batchMap.value.get(id)).filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1))
  const rows = availableDist.value.filter((d) => selected.value.has(d.id)).map((d) => ({
    name: d.name,
    cells: batchIds.map((b) => {
      const e = inRange.value.filter((m) => m.distributorId === d.id && m.batchId === b.id).sort(byDateDesc)[0]
      return e ? { reflected: e.pharmacyDiscountPct, remaining: e.remainingDiscountPct, company: e.companyDiscount, price: e.sellingPrice } : null
    }),
  }))
  return { batches: batchIds, rows }
})

function exportAll() {
  const p = productMap.value.get(f.productId)
  exportExcel(`مقارنة-سوقية-${p?.name || ''}`, [
    { name: 'المقارنة', rows: ranked.value.map((e, i) => ({ 'الترتيب': i + 1, 'المذخر': e.distributorName, 'التاريخ': e.date, 'القائمة': e.batchName, 'السعر الأصلي': e.originalPrice, 'خصم الشركة %': e.companyDiscount, 'سعر البيع': e.sellingPrice, 'الخصم المعكوس %': round(e.pharmacyDiscountPct, 2), 'المتبقي %': round(e.remainingDiscountPct, 2), 'قيمة المتبقي': e.remainingDiscountAmount, 'المؤشر': e.category?.label })) },
    { name: 'مقارنة تاريخية', rows: historical.value.rows.map((r) => Object.fromEntries([['المذخر', r.name], ...historical.value.batches.flatMap((b, i) => [[`${b.name} — معكوس %`, r.cells[i] ? round(r.cells[i].reflected, 2) : ''], [`${b.name} — متبقٍ %`, r.cells[i] ? round(r.cells[i].remaining, 2) : '']])])) },
    { name: 'كل المتابعات', rows: [...inRange.value].sort(byDateDesc).map(monitoringRow) },
  ])
}
const printPage = () => window.print()
</script>

<template>
  <div class="space-y-4">
    <PrintHeader :title="`المقارنة السوقية: ${productMap.get(f.productId)?.name || ''}`" :subtitle="`الفترة: ${f.from || 'البداية'} — ${f.to || 'اليوم'}`" />
    <div class="flex flex-wrap items-end justify-between gap-3 no-print">
      <div><h1 class="page-title">المقارنة السوقية</h1><p class="page-sub">قارن انعكاس خصم الشركة بين المذاخر لمنتج محدد خلال فترة زمنية</p></div>
      <div class="flex gap-2">
        <button class="btn-secondary" :disabled="!latest.length" @click="exportAll"><Download class="w-4 h-4" />تصدير Excel</button>
        <button class="btn-secondary" :disabled="!latest.length" @click="printPage"><Printer class="w-4 h-4" />طباعة / PDF</button>
      </div>
    </div>

    <div class="card p-4 space-y-3 no-print">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div class="md:col-span-2"><label class="label">المنتج</label><ComboBox v-model="f.productId" :options="productOptions" placeholder="اختر منتجاً له متابعات…" @update:model-value="f.distributors = []" /></div>
        <div><label class="label">من تاريخ</label><input v-model="f.from" type="date" class="input" /></div>
        <div><label class="label">إلى تاريخ</label><input v-model="f.to" type="date" class="input" /></div>
      </div>
      <div v-if="availableDist.length">
        <label class="label">المذاخر ({{ selected.size }} من {{ availableDist.length }})</label>
        <div class="flex flex-wrap gap-1.5">
          <button v-for="d in availableDist" :key="d.id" @click="toggleDist(d.id)" :class="['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition', selected.has(d.id) ? 'bg-white border-slate-400 text-slate-800' : 'bg-slate-50 border-slate-200 text-slate-400 line-through']">
            <i class="w-2 h-2 rounded-full" :style="{ background: selected.has(d.id) ? distributorColor(d.id) : '#cbd5e1' }"></i>{{ d.name }}
          </button>
          <button v-if="f.distributors.length" class="text-xs text-brand-600 underline px-2" @click="f.distributors = []">تحديد الكل</button>
        </div>
      </div>
    </div>

    <EmptyState v-if="!productOptions.length" :icon="BarChart3" title="لا توجد متابعات بعد" text="سجّل أسعار البيع لدى المذاخر أولاً لتظهر المقارنة السوقية."><router-link to="/monitoring" class="btn-primary">متابعة الأسعار</router-link></EmptyState>
    <EmptyState v-else-if="!latest.length" title="لا توجد بيانات ضمن الفلاتر المحددة" />
    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="card p-3"><div class="text-xs text-slate-500">متوسط خصم الشركة</div><div class="text-xl font-bold tabular-nums text-[#1b64be]">{{ fmtPct(summary.company, dec) }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">متوسط الخصم المعكوس</div><div class="text-xl font-bold tabular-nums text-[#c2531c]">{{ fmtPct(summary.reflected, dec) }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">متوسط الخصم المتبقي</div><div class="text-xl font-bold tabular-nums text-[#007a62]">{{ fmtPct(summary.remaining, dec) }}</div></div>
        <div class="card p-3"><div class="text-xs text-slate-500">الفرق بين أعلى وأدنى انعكاس</div><div class="text-xl font-bold tabular-nums">{{ fmtMoney(summary.spread, dec) }} <span class="text-sm font-normal">نقطة</span></div></div>
      </div>

      <div class="card">
        <div class="card-h flex-wrap"><div class="card-t">جدول المقارنة (أحدث سعر لكل مذخر ضمن الفترة)</div>
          <select v-model="sortMode" class="input w-auto py-1.5 text-[13px] no-print"><option v-for="(s, k) in SORTS" :key="k" :value="k">ترتيب: {{ s.label }}</option></select></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>#</th><th>المذخر</th><th>التاريخ</th><th class="num">السعر الأصلي</th><th class="num">خصم الشركة</th><th class="num">سعر البيع</th><th class="num">الخصم المعكوس</th><th class="num">المتبقي</th><th class="num">قيمة المتبقي</th><th>المؤشر</th></tr></thead>
            <tbody>
              <tr v-for="(e, i) in ranked" :key="e.id">
                <td class="tabular-nums text-slate-400"><Trophy v-if="i === 0" class="w-4 h-4 text-amber-500 inline" /><span v-else>{{ i + 1 }}</span></td>
                <td class="font-medium"><i class="inline-block w-2 h-2 rounded-full ml-1.5" :style="{ background: distributorColor(e.distributorId) }"></i>{{ e.distributorName }}</td>
                <td class="tabular-nums">{{ e.date }}<div class="text-xs text-slate-400">{{ e.batchName }}</div></td>
                <td class="num">{{ fmtMoney(e.originalPrice) }}</td>
                <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td>
                <td class="num font-semibold">{{ fmtMoney(e.sellingPrice) }}</td>
                <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
                <td :class="['num font-semibold', e.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(e.remainingDiscountPct, dec) }}</td>
                <td class="num">{{ fmtMoney(e.remainingDiscountAmount) }}</td>
                <td><ClassBadge :category="e.category" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="card"><div class="card-h"><div class="card-t">خصم الشركة مقابل المعكوس والمتبقي</div></div>
          <div class="p-4"><ChartCanvas :data="barData" :options="barOptions({ pct: true })" height="300px" /></div></div>
        <div class="card"><div class="card-h"><div class="card-t">تطور سعر البيع</div></div>
          <div class="p-4"><ChartCanvas type="line" :data="lineData" :options="lineOptions()" height="300px" /></div></div>
      </div>

      <div class="card">
        <div class="card-h"><div class="card-t">المقارنة التاريخية حسب قائمة الأسعار</div><span class="text-xs text-slate-500">معكوس / متبقٍ (نقاط مئوية)</span></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>المذخر</th><th v-for="b in historical.batches" :key="b.id" class="text-center">{{ b.name }}<div class="font-normal text-slate-400">{{ b.date }}</div></th></tr></thead>
            <tbody><tr v-for="r in historical.rows" :key="r.name">
              <td class="font-medium">{{ r.name }}</td>
              <td v-for="(c, i) in r.cells" :key="i" class="text-center tabular-nums">
                <template v-if="c"><span class="text-[#c2531c]">{{ fmtPct(c.reflected, dec) }}</span> / <span :class="c.remaining < 0 ? 'text-red-600' : 'text-teal-700'">{{ fmtPct(c.remaining, dec) }}</span><div class="text-xs text-slate-400">من {{ fmtPct(c.company, dec) }} · {{ fmtMoney(c.price) }}</div></template>
                <span v-else class="text-slate-300">—</span>
              </td>
            </tr></tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>
