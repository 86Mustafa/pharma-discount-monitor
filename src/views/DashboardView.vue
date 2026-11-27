<script setup>
import { computed, ref } from 'vue'
import {
  Pill, Warehouse, ClipboardList, ArrowDownToLine, PiggyBank, Share2, Lock, GitCompareArrows, CalendarDays,
  FlaskConical, Plus, AlertTriangle, Upload,
} from 'lucide-vue-next'
import StatCard from '../components/StatCard.vue'
import ChartCanvas from '../components/ChartCanvas.vue'
import ClassBadge from '../components/ClassBadge.vue'
import EmptyState from '../components/EmptyState.vue'
import { useStore } from '../composables/store.js'
import { toast, toastError } from '../composables/ui.js'
import { dashboardKpis, avg, histogram, latestByPair } from '../lib/analytics.js'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { loadDemo } from '../lib/demo.js'
import { setSetting } from '../db/repo.js'
import { barOptions, lineOptions, discountByDistributorData, priceByDistributorData, priceOverTimeData, ROLE } from '../lib/charts.js'

const store = useStore()
const { products, distributors, monitoring, batches, settings, productMap, distributorMap, distributorColor } = store
const dec = computed(() => settings.value.pctDecimals)
const batchFilter = ref('')
const entries = computed(() => monitoring.value.filter((m) => !batchFilter.value || m.batchId === batchFilter.value))
const k = computed(() => dashboardKpis({ entries: entries.value, products: products.value, distributors: distributors.value, thresholds: settings.value.thresholds }))
// نستخدم السجلات المُثرية من المتجر (فيها الأسماء والتصنيف)
const latest = computed(() => latestByPair(entries.value))

/* المخطط 1: حسب قائمة الأسعار */
const chart1 = computed(() => {
  const ids = [...new Set(entries.value.map((e) => e.batchId))]
  const rows = batches.value.filter((b) => ids.includes(b.id)).slice().reverse().map((b) => {
    const l = latest.value.filter((e) => e.batchId === b.id)
    const lb = latestByPair(entries.value.filter((e) => e.batchId === b.id))
    return { label: b.name, company: avg(lb.map((e) => e.companyDiscount)), reflected: avg(lb.map((e) => e.pharmacyDiscountPct)), remaining: avg(lb.map((e) => e.remainingDiscountPct)), n: l.length }
  })
  return discountByDistributorData(rows)
})

/* المخطط 2 و 4: منتج محدد */
const productCounts = computed(() => {
  const m = new Map()
  for (const e of entries.value) m.set(e.productId, (m.get(e.productId) || 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})
const selProduct = ref(null)
const productId = computed(() => selProduct.value || productCounts.value[0]?.[0])
const chart2 = computed(() => priceByDistributorData(latest.value.filter((e) => e.productId === productId.value)))
const chart2Count = computed(() => latest.value.filter((e) => e.productId === productId.value).length)
const chart4 = computed(() => priceOverTimeData(entries.value.filter((e) => e.productId === productId.value), distributorColor))

/* المخطط 3: متوسط المعكوس حسب المذخر */
const distRows = computed(() => k.value.dStats.map((s) => ({ ...s, name: distributorMap.value.get(s.distributorId)?.name || '—' })).sort((a, b) => b.avgReflected - a.avgReflected))
const chart3 = computed(() => ({
  labels: distRows.value.map((d) => d.name),
  datasets: [
    { label: 'متوسط خصم الشركة', data: distRows.value.map((d) => d.avgCompany), backgroundColor: ROLE.company, maxBarThickness: 18 },
    { label: 'متوسط الخصم المعكوس', data: distRows.value.map((d) => d.avgReflected), backgroundColor: ROLE.reflected, maxBarThickness: 18 },
  ],
}))
/* المخطط 5: توزيع الخصم المتبقي */
const bins = computed(() => histogram(latest.value.map((e) => e.remainingDiscountPct), 2))
const chart5 = computed(() => ({
  labels: bins.value.map((b) => String(b.from)),
  datasets: [{ label: 'عدد الأسعار', data: bins.value.map((b) => b.count), backgroundColor: bins.value.map((b) => (b.to <= 0 ? ROLE.alert : ROLE.remaining)), maxBarThickness: 40 }],
}))
const chart5Opts = { plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => { const b = bins.value[c[0].dataIndex]; return `المتبقي من ${b.from} إلى أقل من ${b.to} نقطة` }, label: (c) => `${c.raw} سعر` } } }, scales: { x: { grid: { display: false }, title: { display: true, text: 'الخصم المتبقي (بداية الفئة، نقاط)' } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f6' }, border: { display: false } } } }
const chart3Opts = computed(() => barOptions({ horizontal: true, pct: true }))

const recent = computed(() => [...entries.value].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 6))
const alerts = computed(() => latest.value.filter((e) => e.exceedsCompany || e.aboveOriginal).slice(0, 6))
const spreads = computed(() => k.value.spreads.filter((s) => s.distributors > 1 && s.spreadPoints > settings.value.thresholds.largeSpreadPoints).sort((a, b) => b.spreadPoints - a.spreadPoints).slice(0, 6))

const loading = ref(false)
async function demo() {
  loading.value = true
  try { await loadDemo(); await setSetting('showDemo', true); toast('تم تحميل البيانات التجريبية') } catch (e) { toastError(e) } finally { loading.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">لوحة تحكم السوبرفايزر</h1><p class="page-sub">خصم الشركة − الخصم المعكوس للصيدلية = الخصم المتبقي للمذخر (نقاط مئوية من السعر الأصلي)</p></div>
      <select v-if="batches.length" v-model="batchFilter" class="input w-auto"><option value="">كل قوائم الأسعار</option><option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option></select>
    </div>

    <div v-if="!store.hasAnyData.value" class="card">
      <EmptyState :icon="ClipboardList" title="مرحباً بك في نظام مراقبة الخصومات" text="ابدأ بإضافة الأدوية والمذاخر، ثم أنشئ قائمة أسعار المعمل، وسجّل أسعار البيع الميدانية لتظهر التحليلات هنا. أو جرّب التطبيق ببيانات تجريبية منفصلة يمكن حذفها لاحقاً.">
        <router-link to="/products" class="btn-primary"><Plus class="w-4 h-4" />إضافة الأدوية</router-link>
        <router-link to="/import" class="btn-secondary"><Upload class="w-4 h-4" />استيراد قائمة أسعار</router-link>
        <button class="btn-secondary" :disabled="loading" @click="demo"><FlaskConical class="w-4 h-4" />{{ loading ? 'جارٍ التحميل…' : 'تحميل بيانات تجريبية' }}</button>
      </EmptyState>
    </div>

    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard :icon="Pill" label="عدد المنتجات" :value="k.products" to="/products" />
        <StatCard :icon="Warehouse" label="عدد المذاخر" :value="k.distributors" to="/distributors" />
        <StatCard :icon="ClipboardList" label="عمليات متابعة الأسعار" :value="k.monitoringCount" to="/monitoring" />
        <StatCard :icon="CalendarDays" label="متابعات هذا الشهر" :value="k.monthCount" tone="slate" />
        <StatCard :icon="ArrowDownToLine" label="متوسط الخصم المعكوس في السوق" :value="fmtPct(k.avgReflected, dec)" :hint="`من متوسط خصم شركة ${fmtPct(k.avgCompany, dec)}`" tone="orange" />
        <StatCard :icon="PiggyBank" label="متوسط الخصم المتبقي لدى المذاخر" :value="fmtPct(k.avgRemaining, dec)" tone="teal" />
        <StatCard :icon="Share2" label="مذاخر عكست معظم خصم الشركة" :value="k.mostlyReflected" :hint="`متوسط المتبقي ≤ ${settings.thresholds.mostlyReflectedRemainingMax} نقاط`" tone="orange" />
        <StatCard :icon="Lock" label="مذاخر احتفظت بمعظم الخصم" :value="k.mostlyRetained" :hint="`متوسط المعكوس ≤ ${settings.thresholds.mostlyRetainedReflectedMax} نقاط`" tone="amber" />
        <StatCard :icon="GitCompareArrows" label="منتجات بفروقات كبيرة بين المذاخر" :value="k.largeSpreadProducts" :hint="`مدى المعكوس > ${settings.thresholds.largeSpreadPoints} نقاط`" tone="slate" to="/market" />
        <StatCard :icon="AlertTriangle" label="تنبيهات للتحقق" :value="k.exceedAlerts" hint="معكوس أكبر من خصم الشركة" tone="red" to="/reports" />
      </div>

      <EmptyState v-if="!entries.length" title="لا توجد متابعات أسعار بعد" text="سجّل أول سعر بيع لدى مذخر لتظهر المخططات والتحليلات."><router-link to="/monitoring" class="btn-primary">تسجيل سعر</router-link></EmptyState>
      <template v-else>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div class="card"><div class="card-h"><div class="card-t">خصم الشركة مقابل المعكوس والمتبقي (حسب القائمة)</div></div>
            <div class="p-4"><ChartCanvas :data="chart1" :options="barOptions({ pct: true })" height="290px" label="مقارنة الخصومات حسب قائمة الأسعار" /></div></div>
          <div class="card"><div class="card-h"><div class="card-t">متوسط الخصم المعكوس حسب المذخر</div></div>
            <div class="p-4"><ChartCanvas :data="chart3" :options="chart3Opts" :height="Math.max(260, distRows.length * 44) + 'px'" /></div></div>
        </div>

        <div class="card">
          <div class="card-h flex-wrap">
            <div class="card-t">تحليل منتج</div>
            <select v-model="selProduct" class="input w-auto py-1.5 text-[13px]">
              <option :value="null">{{ productMap.get(productCounts[0]?.[0])?.name }} (الأكثر متابعة)</option>
              <option v-for="[pid] in productCounts.slice(1)" :key="pid" :value="pid">{{ productMap.get(pid)?.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
            <div><div class="text-sm font-medium text-slate-600 mb-2">أسعار البيع بين المذاخر (أحدث سعر)</div><ChartCanvas :data="chart2" :options="barOptions({ horizontal: true })" :height="Math.max(220, chart2Count * 46) + 'px'" /></div>
            <div><div class="text-sm font-medium text-slate-600 mb-2">تغير سعر البيع بمرور الوقت</div><ChartCanvas type="line" :data="chart4" :options="lineOptions()" height="280px" /></div>
          </div>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="card xl:col-span-1"><div class="card-h"><div class="card-t">توزيع الخصم المتبقي (نقاط)</div></div>
            <div class="p-4"><ChartCanvas :data="chart5" :options="chart5Opts" height="260px" /><p class="text-xs text-slate-400 mt-2">الأعمدة الحمراء: متبقٍ سالب (معكوس أكبر من خصم الشركة).</p></div></div>
          <div class="card xl:col-span-2">
            <div class="card-h"><div class="card-t">أحدث المتابعات</div><router-link to="/monitoring" class="text-sm text-brand-600 hover:underline">عرض الكل</router-link></div>
            <div class="overflow-x-auto"><table class="tbl">
              <thead><tr><th>التاريخ</th><th>المذخر</th><th>المنتج</th><th class="num">خصم الشركة</th><th class="num">سعر البيع</th><th class="num">المعكوس</th><th class="num">المتبقي</th><th class="hidden md:table-cell">المؤشر</th></tr></thead>
              <tbody><tr v-for="e in recent" :key="e.id">
                <td class="tabular-nums">{{ e.date }}</td><td>{{ e.distributorName }}</td>
                <td><router-link :to="`/products/${e.productId}`" class="hover:text-brand-700">{{ e.productName }}</router-link></td>
                <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td><td class="num font-semibold">{{ fmtMoney(e.sellingPrice) }}</td>
                <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
                <td :class="['num font-semibold', e.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(e.remainingDiscountPct, dec) }}</td>
                <td class="hidden md:table-cell"><ClassBadge :category="e.category" /></td>
              </tr></tbody>
            </table></div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card">
            <div class="card-h"><div class="card-t inline-flex items-center gap-2"><AlertTriangle class="w-4 h-4 text-red-500" />تنبيهات للتحقق</div><router-link to="/reports" class="text-sm text-brand-600 hover:underline">التقرير</router-link></div>
            <div v-if="!alerts.length" class="p-6 text-center text-sm text-slate-400">لا توجد حالات يتجاوز فيها الخصم المعكوس خصم الشركة.</div>
            <ul v-else class="divide-y divide-slate-100">
              <li v-for="e in alerts" :key="e.id" class="px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2">
                <div><div class="font-medium">{{ e.productName }}</div><div class="text-xs text-slate-500">{{ e.distributorName }} · {{ e.date }}</div></div>
                <div class="text-left text-xs"><span class="text-red-600 font-semibold tabular-nums">{{ e.exceedsCompany ? `+${fmtMoney(e.exceedPoints, dec)} نقطة فوق خصم الشركة` : 'أعلى من السعر الأصلي' }}</span><div class="text-slate-500 tabular-nums">معكوس {{ fmtPct(e.pharmacyDiscountPct, dec) }} من {{ fmtPct(e.companyDiscount, dec) }}</div></div>
              </li>
            </ul>
          </div>
          <div class="card">
            <div class="card-h"><div class="card-t">منتجات بفروقات كبيرة بين المذاخر</div><router-link to="/market" class="text-sm text-brand-600 hover:underline">المقارنة</router-link></div>
            <div v-if="!spreads.length" class="p-6 text-center text-sm text-slate-400">لا توجد فروقات تتجاوز العتبة المحددة.</div>
            <ul v-else class="divide-y divide-slate-100">
              <li v-for="s in spreads" :key="s.productId" class="px-4 py-2.5 text-sm flex items-center justify-between gap-2">
                <router-link :to="{ path: '/market', query: { product: s.productId } }" class="font-medium hover:text-brand-700">{{ productMap.get(s.productId)?.name }}</router-link>
                <div class="text-left text-xs tabular-nums"><b>{{ fmtMoney(s.spreadPoints, dec) }} نقطة</b><div class="text-slate-500">{{ fmtMoney(s.minPrice) }} – {{ fmtMoney(s.maxPrice) }} · {{ s.distributors }} مذاخر</div></div>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
