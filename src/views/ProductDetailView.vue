<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, ClipboardEdit, Download, Printer, BarChart3 } from 'lucide-vue-next'
import ChartCanvas from '../components/ChartCanvas.vue'
import ClassBadge from '../components/ClassBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import PrintHeader from '../components/PrintHeader.vue'
import { useStore } from '../composables/store.js'
import { PRICE_SOURCES, PRODUCT_STATUS } from '../db/repo.js'
import { latestByPair, avg, byDateDesc } from '../lib/analytics.js'
import { round } from '../lib/calc.js'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { exportMonitoring } from '../lib/reports.js'
import { PACKAGING } from '../lib/catalog.js'
import { barOptions, lineOptions, priceByDistributorData, priceOverTimeData } from '../lib/charts.js'

const route = useRoute()
const store = useStore()
const { productMap, batchProducts, batchMap, monitoring, settings, distributorColor } = store
const id = Number(route.params.id)
const product = computed(() => productMap.value.get(id))
const dec = computed(() => settings.value.pctDecimals)

const productBatches = computed(() =>
  batchProducts.value.filter((b) => b.productId === id).map((b) => ({ ...b, batch: batchMap.value.get(b.batchId) })).filter((b) => b.batch)
    .sort((a, b) => (a.batch.date < b.batch.date ? 1 : -1)),
)
const latestBatch = computed(() => productBatches.value[0])
const scope = ref('latest') // latest | all | batchId
const entries = computed(() => monitoring.value.filter((m) => m.productId === id))
const scoped = computed(() => {
  if (scope.value === 'all') return entries.value
  const bid = scope.value === 'latest' ? latestBatch.value?.batchId : Number(scope.value)
  return entries.value.filter((m) => m.batchId === bid)
})
const latest = computed(() => latestByPair(scoped.value))

const market = computed(() => {
  const l = latest.value
  if (!l.length) return null
  return {
    company: avg(l.map((e) => e.companyDiscount)),
    reflected: avg(l.map((e) => e.pharmacyDiscountPct)),
    remaining: avg(l.map((e) => e.remainingDiscountPct)),
    reflectedAmt: round(l.reduce((s, e) => s + e.pharmacyDiscountAmount, 0) / l.length, 2),
    remainingAmt: round(l.reduce((s, e) => s + e.remainingDiscountAmount, 0) / l.length, 2),
    minPrice: Math.min(...l.map((e) => e.sellingPrice)),
    maxPrice: Math.max(...l.map((e) => e.sellingPrice)),
    spread: round(Math.max(...l.map((e) => e.pharmacyDiscountPct)) - Math.min(...l.map((e) => e.pharmacyDiscountPct))),
  }
})

const sortMode = ref('lowPrice')
const SORTS = {
  lowPrice: { label: 'أقل سعر بيع', fn: (a, b) => a.sellingPrice - b.sellingPrice },
  highPrice: { label: 'أعلى سعر بيع', fn: (a, b) => b.sellingPrice - a.sellingPrice },
  reflected: { label: 'أكبر خصم معكوس', fn: (a, b) => b.pharmacyDiscountPct - a.pharmacyDiscountPct },
  remaining: { label: 'أكبر خصم متبقٍ', fn: (a, b) => b.remainingDiscountPct - a.remainingDiscountPct },
  recent: { label: 'أحدث متابعة', fn: byDateDesc },
}
const sorted = computed(() => [...latest.value].sort(SORTS[sortMode.value].fn))
const priceChart = computed(() => priceByDistributorData(latest.value))
const timeChart = computed(() => priceOverTimeData(entries.value, distributorColor))
const printPage = () => window.print()
</script>

<template>
  <EmptyState v-if="!product" title="المنتج غير موجود"><router-link to="/products" class="btn-secondary">العودة</router-link></EmptyState>
  <div v-else class="space-y-4">
    <PrintHeader :title="`تحليل المنتج: ${product.name}`" :subtitle="latestBatch ? `آخر قائمة: ${latestBatch.batch.name}` : ''" />
    <div class="flex flex-wrap items-start justify-between gap-3 no-print">
      <div>
        <router-link to="/products" class="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ArrowRight class="w-4 h-4" />الأدوية</router-link>
        <h1 class="page-title mt-1">{{ product.name }} <span v-if="PACKAGING[product.packaging]" :class="['badge align-middle', product.packaging === 'wrapped' ? 'bg-blue-50 text-blue-700 ring-blue-200' : 'bg-amber-50 text-amber-800 ring-amber-200']">{{ PACKAGING[product.packaging] }}</span> <span v-if="product.isDemo" class="chip-demo align-middle">تجريبي</span></h1>
        <p class="page-sub">{{ [product.scientificName, product.dosageForm, product.packSize, product.manufacturer].filter(Boolean).join(' · ') }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <router-link :to="{ path: '/monitoring', query: { product: id, batch: latestBatch?.batchId } }" class="btn-primary"><ClipboardEdit class="w-4 h-4" />تسجيل سعر</router-link>
        <router-link :to="{ path: '/market', query: { product: id } }" class="btn-secondary"><BarChart3 class="w-4 h-4" />مقارنة سوقية</router-link>
        <button class="btn-secondary" :disabled="!entries.length" @click="exportMonitoring(`تحليل-${product.name}`, entries)"><Download class="w-4 h-4" />Excel</button>
        <button class="btn-secondary" @click="printPage"><Printer class="w-4 h-4" />طباعة</button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- بطاقة المنتج -->
      <div class="card">
        <div class="card-h"><div class="card-t">بطاقة المنتج</div><span :class="['badge', product.status === 'active' ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-slate-100 text-slate-600 ring-slate-200']">{{ PRODUCT_STATUS[product.status] }}</span></div>
        <dl class="grid grid-cols-2 gap-px bg-slate-100 text-sm">
          <div class="bg-white p-4"><dt class="text-xs text-slate-500">السعر الأصلي (آخر قائمة)</dt><dd class="text-xl font-bold tabular-nums mt-1">{{ fmtMoney(latestBatch?.originalPrice ?? product.originalPrice) }} <span class="text-xs font-normal text-slate-400">{{ settings.currency }}</span></dd></div>
          <div class="bg-white p-4"><dt class="text-xs text-slate-500">آخر قائمة أسعار</dt><dd class="font-semibold mt-1">{{ latestBatch?.batch.name || '—' }}</dd><dd class="text-xs text-slate-400">{{ latestBatch?.batch.date }}</dd></div>
          <div class="bg-white p-4"><dt class="text-xs text-slate-500">آخر خصم من الشركة</dt><dd class="text-xl font-bold tabular-nums mt-1 text-[#1b64be]">{{ fmtPct(latestBatch?.companyDiscount, dec) }}</dd></div>
          <div class="bg-white p-4"><dt class="text-xs text-slate-500">سعر شراء المذخر</dt><dd class="text-xl font-bold tabular-nums mt-1">{{ fmtMoney(latestBatch?.purchasePrice) }} <span class="text-xs font-normal text-slate-400">{{ settings.currency }}</span></dd></div>
        </dl>
      </div>

      <!-- بطاقة تحليل الخصم -->
      <div class="card">
        <div class="card-h"><div class="card-t">تحليل الخصم في السوق</div><span class="text-xs text-slate-500">متوسط أحدث سعر لكل مذخر</span></div>
        <div v-if="!market" class="p-8 text-center text-sm text-slate-400">لا توجد متابعات ضمن النطاق المحدد.</div>
        <div v-else class="p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-around gap-3 text-center">
            <div><div class="text-xs text-slate-500">خصم الشركة</div><div class="text-2xl font-bold tabular-nums text-[#1b64be]">{{ fmtPct(market.company, dec) }}</div></div>
            <div class="text-slate-300 text-xl">−</div>
            <div><div class="text-xs text-slate-500">المعكوس للصيدلية</div><div class="text-2xl font-bold tabular-nums text-[#c2531c]">{{ fmtPct(market.reflected, dec) }}</div></div>
            <div class="text-slate-300 text-xl">=</div>
            <div><div class="text-xs text-slate-500">المتبقي للمذخر</div><div :class="['text-2xl font-bold tabular-nums', market.remaining < 0 ? 'text-red-600' : 'text-[#007a62]']">{{ fmtPct(market.remaining, dec) }}</div></div>
          </div>
          <dl class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded-lg bg-slate-50 p-2.5"><dt class="text-xs text-slate-500">متوسط قيمة الخصم المعكوس</dt><dd class="font-semibold tabular-nums">{{ fmtMoney(market.reflectedAmt) }}</dd></div>
            <div class="rounded-lg bg-slate-50 p-2.5"><dt class="text-xs text-slate-500">متوسط قيمة الخصم المتبقي</dt><dd class="font-semibold tabular-nums">{{ fmtMoney(market.remainingAmt) }}</dd></div>
            <div class="rounded-lg bg-slate-50 p-2.5"><dt class="text-xs text-slate-500">مدى أسعار البيع</dt><dd class="font-semibold tabular-nums">{{ fmtMoney(market.minPrice) }} – {{ fmtMoney(market.maxPrice) }}</dd></div>
            <div class="rounded-lg bg-slate-50 p-2.5"><dt class="text-xs text-slate-500">الفرق بين المذاخر</dt><dd class="font-semibold tabular-nums">{{ fmtMoney(market.spread, dec) }} نقطة</dd></div>
          </dl>
        </div>
      </div>
    </div>

    <!-- مقارنة المذاخر -->
    <div class="card">
      <div class="card-h flex-wrap">
        <div class="card-t">مقارنة المذاخر <span class="text-sm font-normal text-slate-400">({{ latest.length }})</span></div>
        <div class="flex flex-wrap gap-2 no-print">
          <select v-model="scope" class="input py-1.5 w-auto text-[13px]">
            <option value="latest">آخر قائمة أسعار</option><option value="all">كل القوائم (أحدث سعر)</option>
            <option v-for="b in productBatches" :key="b.batchId" :value="String(b.batchId)">{{ b.batch.name }}</option>
          </select>
          <select v-model="sortMode" class="input py-1.5 w-auto text-[13px]"><option v-for="(s, k) in SORTS" :key="k" :value="k">ترتيب: {{ s.label }}</option></select>
        </div>
      </div>
      <EmptyState v-if="!sorted.length" title="لا توجد متابعات لهذا المنتج" text="سجّل أسعار البيع لدى المذاخر لعرض المقارنة.">
        <router-link :to="{ path: '/monitoring', query: { product: id, batch: latestBatch?.batchId } }" class="btn-primary">تسجيل سعر</router-link>
      </EmptyState>
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>#</th><th>المذخر</th><th>تاريخ المتابعة</th><th class="num">خصم الشركة</th><th class="num">سعر البيع</th><th class="num">الخصم المعكوس</th><th class="num">الخصم المتبقي</th><th class="num">قيمة المتبقي</th><th>المؤشر</th><th class="hidden md:table-cell">المصدر</th><th class="hidden lg:table-cell">ملاحظات</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in sorted" :key="e.id">
              <td class="text-slate-400 tabular-nums">{{ i + 1 }}</td>
              <td class="font-medium"><span class="inline-block w-2 h-2 rounded-full ml-1.5" :style="{ background: distributorColor(e.distributorId) }"></span><router-link :to="`/distributors/${e.distributorId}`" class="hover:text-brand-700">{{ e.distributorName }}</router-link></td>
              <td class="tabular-nums">{{ e.date }}</td>
              <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td>
              <td class="num font-semibold">{{ fmtMoney(e.sellingPrice) }}</td>
              <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
              <td :class="['num font-semibold', e.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(e.remainingDiscountPct, dec) }}</td>
              <td :class="['num', e.remainingDiscountAmount < 0 && 'text-red-600']">{{ fmtMoney(e.remainingDiscountAmount) }}</td>
              <td><ClassBadge :category="e.category" /></td>
              <td class="hidden md:table-cell text-xs text-slate-500">{{ PRICE_SOURCES[e.source] }}</td>
              <td class="hidden lg:table-cell text-xs text-slate-500 max-w-[220px] truncate" :title="e.notes">{{ e.notes || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="entries.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card"><div class="card-h"><div class="card-t">سعر البيع مقابل سعر الشراء حسب المذخر</div></div>
        <div class="p-4"><ChartCanvas :data="priceChart" :options="barOptions({ horizontal: true })" :height="Math.max(220, latest.length * 46) + 'px'" /></div></div>
      <div class="card"><div class="card-h"><div class="card-t">تغير سعر البيع بمرور الوقت</div></div>
        <div class="p-4"><ChartCanvas type="line" :data="timeChart" :options="lineOptions()" height="300px" /><p v-if="timeChart.truncated" class="text-xs text-slate-400 mt-2">يُعرض أول 8 مذاخر فقط — استخدم المقارنة السوقية لاختيار مذاخر محددة.</p></div></div>
    </div>
  </div>
</template>
