<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRight, ClipboardEdit, Download, Printer, Phone, MapPin, User } from 'lucide-vue-next'
import ChartCanvas from '../components/ChartCanvas.vue'
import ClassBadge from '../components/ClassBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import PrintHeader from '../components/PrintHeader.vue'
import SortTh from '../components/SortTh.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { latestByPair, avg } from '../lib/analytics.js'
import { fmtMoney, fmtPct, fmtSigned } from '../lib/format.js'
import { exportDistributorPrices } from '../lib/reports.js'
import { barOptions, lineOptions, discountByDistributorData, ROLE } from '../lib/charts.js'

const route = useRoute()
const { distributorMap, monitoring, settings, batches } = useStore()
const id = Number(route.params.id)
const dist = computed(() => distributorMap.value.get(id))
const dec = computed(() => settings.value.pctDecimals)
const batchId = ref('')
const mine = computed(() => monitoring.value.filter((m) => m.distributorId === id && (!batchId.value || m.batchId === batchId.value)))
const latest = computed(() => latestByPair(mine.value))
const kpi = computed(() => ({
  count: mine.value.length,
  products: latest.value.length,
  company: avg(latest.value.map((e) => e.companyDiscount)),
  reflected: avg(latest.value.map((e) => e.pharmacyDiscountPct)),
  remaining: avg(latest.value.map((e) => e.remainingDiscountPct)),
  alerts: latest.value.filter((e) => e.exceedsCompany || e.aboveOriginal).length,
}))
const table = useTable(latest, { search: ['productName', 'batchName'], sortKey: 'productName' })
const discountChart = computed(() =>
  discountByDistributorData([...latest.value].sort((a, b) => b.pharmacyDiscountPct - a.pharmacyDiscountPct).map((e) => ({ label: e.productName, company: e.companyDiscount, reflected: e.pharmacyDiscountPct, remaining: e.remainingDiscountPct }))),
)
const histProduct = ref(null)
const histOptions = computed(() => latest.value.map((e) => ({ id: e.productId, name: e.productName })))
const histData = computed(() => {
  const pid = histProduct.value || histOptions.value[0]?.id
  const rows = mine.value.filter((m) => m.productId === pid).sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
  return {
    labels: rows.map((r) => r.date),
    datasets: [
      { label: 'الخصم المعكوس %', data: rows.map((r) => r.pharmacyDiscountPct), borderColor: ROLE.reflected, backgroundColor: ROLE.reflected },
      { label: 'الخصم المتبقي %', data: rows.map((r) => r.remainingDiscountPct), borderColor: ROLE.remaining, backgroundColor: ROLE.remaining },
      { label: 'خصم الشركة %', data: rows.map((r) => r.companyDiscount), borderColor: ROLE.company, backgroundColor: ROLE.company, borderDash: [5, 4], pointRadius: 0 },
    ],
  }
})
const printPage = () => window.print()
</script>

<template>
  <EmptyState v-if="!dist" title="المذخر غير موجود"><router-link to="/distributors" class="btn-secondary">العودة</router-link></EmptyState>
  <div v-else class="space-y-4">
    <PrintHeader :title="`تقرير المذخر: ${dist.name}`" :subtitle="[dist.governorate, dist.city].filter(Boolean).join(' / ')" />
    <div class="flex flex-wrap items-start justify-between gap-3 no-print">
      <div>
        <router-link to="/distributors" class="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ArrowRight class="w-4 h-4" />المذاخر</router-link>
        <h1 class="page-title mt-1">{{ dist.name }} <span v-if="dist.isDemo" class="chip-demo align-middle">تجريبي</span></h1>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
          <span v-if="dist.governorate || dist.city" class="inline-flex items-center gap-1"><MapPin class="w-4 h-4" />{{ [dist.governorate, dist.region, dist.city].filter(Boolean).join(' / ') }}</span>
          <span v-if="dist.contactPerson" class="inline-flex items-center gap-1"><User class="w-4 h-4" />{{ dist.contactPerson }}</span>
          <span v-if="dist.phone" class="inline-flex items-center gap-1 ltr"><Phone class="w-4 h-4" />{{ dist.phone }}</span>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <router-link :to="{ path: '/monitoring', query: { distributor: id } }" class="btn-primary"><ClipboardEdit class="w-4 h-4" />تسجيل سعر</router-link>
        <button class="btn-secondary" @click="exportDistributorPrices(dist, monitoring)"><Download class="w-4 h-4" />تصدير الأسعار</button>
        <button class="btn-secondary" @click="printPage"><Printer class="w-4 h-4" />طباعة</button>
      </div>
    </div>

    <div class="flex no-print"><select v-model="batchId" class="input w-auto"><option value="">كل القوائم (أحدث سعر لكل منتج)</option><option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option></select></div>

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <div class="card p-3"><div class="text-xs text-slate-500">عدد المتابعات</div><div class="text-xl font-bold tabular-nums">{{ kpi.count }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">منتجات متابَعة</div><div class="text-xl font-bold tabular-nums">{{ kpi.products }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">متوسط خصم الشركة</div><div class="text-xl font-bold tabular-nums text-[#1b64be]">{{ fmtPct(kpi.company, dec) }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">متوسط المعكوس</div><div class="text-xl font-bold tabular-nums text-[#c2531c]">{{ fmtPct(kpi.reflected, dec) }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">متوسط المتبقي</div><div :class="['text-xl font-bold tabular-nums', kpi.remaining < 0 ? 'text-red-600' : 'text-[#007a62]']">{{ fmtPct(kpi.remaining, dec) }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">تنبيهات للتحقق</div><div :class="['text-xl font-bold tabular-nums', kpi.alerts && 'text-red-600']">{{ kpi.alerts }}</div></div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">أحدث الأسعار لكل منتج</div></div>
      <EmptyState v-if="!latest.length" title="لا توجد متابعات لهذا المذخر" />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="productName" :table="table">المنتج</SortTh>
            <SortTh k="date" :table="table">التاريخ</SortTh>
            <th class="num">الأصلي</th>
            <SortTh k="companyDiscount" :table="table" num>خصم الشركة</SortTh>
            <SortTh k="sellingPrice" :table="table" num>سعر البيع</SortTh>
            <SortTh k="pharmacyDiscountPct" :table="table" num>المعكوس</SortTh>
            <SortTh k="remainingDiscountPct" :table="table" num>المتبقي</SortTh>
            <SortTh k="remainingDiscountAmount" :table="table" num>قيمة المتبقي</SortTh>
            <th class="num">التغير</th><th>المؤشر</th>
          </tr></thead>
          <tbody>
            <tr v-for="e in table.filtered.value" :key="e.id">
              <td class="font-medium"><router-link :to="`/products/${e.productId}`" class="hover:text-brand-700">{{ e.productName }}</router-link><div class="text-xs text-slate-400">{{ e.batchName }}</div></td>
              <td class="tabular-nums">{{ e.date }}</td>
              <td class="num text-slate-500">{{ fmtMoney(e.originalPrice) }}</td>
              <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td>
              <td class="num font-semibold">{{ fmtMoney(e.sellingPrice) }}</td>
              <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
              <td :class="['num font-semibold', e.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(e.remainingDiscountPct, dec) }}</td>
              <td class="num">{{ fmtMoney(e.remainingDiscountAmount) }}</td>
              <td :class="['num', e.priceChange > 0 ? 'text-red-600' : e.priceChange < 0 ? 'text-green-700' : 'text-slate-400']">{{ e.priceChange == null ? '—' : fmtSigned(e.priceChange) }}</td>
              <td><ClassBadge :category="e.category" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="latest.length" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card"><div class="card-h"><div class="card-t">خصم الشركة / المعكوس / المتبقي حسب المنتج</div></div>
        <div class="p-4"><ChartCanvas :data="discountChart" :options="barOptions({ horizontal: true, pct: true })" :height="Math.max(240, latest.length * 52) + 'px'" /></div></div>
      <div class="card"><div class="card-h flex-wrap"><div class="card-t">التطور التاريخي للمنتج</div>
        <select v-model="histProduct" class="input w-auto py-1.5 text-[13px] no-print"><option :value="null">{{ histOptions[0]?.name }}</option><option v-for="o in histOptions.slice(1)" :key="o.id" :value="o.id">{{ o.name }}</option></select></div>
        <div class="p-4"><ChartCanvas type="line" :data="histData" :options="lineOptions({ pct: true })" height="300px" /></div></div>
    </div>
  </div>
</template>
