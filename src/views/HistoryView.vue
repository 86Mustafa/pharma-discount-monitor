<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Download, History as HistoryIcon } from 'lucide-vue-next'
import ComboBox from '../components/ComboBox.vue'
import ChartCanvas from '../components/ChartCanvas.vue'
import EmptyState from '../components/EmptyState.vue'
import Pager from '../components/Pager.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { byDateDesc } from '../lib/analytics.js'
import { fmtMoney, fmtPct, fmtSigned, fmtDate, fmtDateTime } from '../lib/format.js'
import { exportMonitoring } from '../lib/reports.js'
import { exportExcel } from '../lib/excel.js'
import { lineOptions, priceOverTimeData } from '../lib/charts.js'

const route = useRoute()
const { products, distributors, monitoring, history, productMap, distributorMap, settings, distributorColor } = useStore()
const dec = computed(() => settings.value.pctDecimals)
const ids = computed(() => new Set(monitoring.value.map((m) => m.productId)))
const productOptions = computed(() => products.value.filter((p) => ids.value.has(p.id)).map((p) => ({ value: p.id, label: p.name })))
const f = reactive({ productId: Number(route.query.product) || productOptions.value[0]?.value || null, distributorId: Number(route.query.distributor) || '' })
const metric = ref('sellingPrice')
const METRICS = { sellingPrice: 'سعر البيع', pharmacyDiscountPct: 'الخصم المعكوس %', remainingDiscountPct: 'الخصم المتبقي %' }

const entries = computed(() => monitoring.value.filter((m) => m.productId === f.productId && (!f.distributorId || m.distributorId === f.distributorId)))
const chart = computed(() => priceOverTimeData(entries.value, distributorColor, metric.value))
const rows = computed(() => [...entries.value].sort(byDateDesc))
const table = useTable(rows, { pageSize: 20 })
const audit = computed(() => history.value.filter((h) => h.productId === f.productId && (!f.distributorId || h.distributorId === f.distributorId)).sort((a, b) => (a.at < b.at ? 1 : -1)))
const auditTable = useTable(audit, { pageSize: 15 })
const ACTIONS = { create: 'إنشاء', update: 'تعديل', delete: 'حذف' }

function exportAudit() {
  exportExcel('سجل-التعديلات', [{ name: 'سجل التعديلات', rows: audit.value.map((h) => ({ 'الإجراء': ACTIONS[h.action], 'الوقت': fmtDateTime(h.at), 'المنتج': productMap.value.get(h.productId)?.name, 'المذخر': distributorMap.value.get(h.distributorId)?.name, 'السعر السابق': h.oldPrice ?? '', 'السعر الجديد': h.newPrice ?? '', 'تاريخ المتابعة': fmtDate(h.date), 'المستخدم': h.user })) }])
}
</script>

<template>
  <div class="space-y-4">
    <div><h1 class="page-title">السجل التاريخي</h1><p class="page-sub">تطور أسعار كل منتج لدى كل مذخر عبر الزمن مع سجل كامل للتعديلات</p></div>
    <div class="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div><label class="label">المنتج</label><ComboBox v-model="f.productId" :options="productOptions" /></div>
      <div><label class="label">المذخر</label><select v-model="f.distributorId" class="input"><option value="">كل المذاخر</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select></div>
      <div><label class="label">المؤشر في المخطط</label><select v-model="metric" class="input"><option v-for="(l, k) in METRICS" :key="k" :value="k">{{ l }}</option></select></div>
    </div>

    <EmptyState v-if="!entries.length" :icon="HistoryIcon" title="لا يوجد سجل" text="اختر منتجاً له متابعات مسجّلة." />
    <template v-else>
      <div class="card"><div class="card-h"><div class="card-t">{{ METRICS[metric] }} بمرور الوقت</div></div>
        <div class="p-4"><ChartCanvas type="line" :data="chart" :options="lineOptions({ pct: metric !== 'sellingPrice' })" height="320px" /></div></div>

      <div class="card">
        <div class="card-h"><div class="card-t">جميع المتابعات ({{ rows.length }})</div><button class="btn-secondary btn-sm" @click="exportMonitoring('السجل-التاريخي', rows)"><Download class="w-4 h-4" />Excel</button></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>التاريخ</th><th>المذخر</th><th>القائمة (تاريخها)</th><th class="num">خصم الشركة</th><th class="num">السعر السابق</th><th class="num">سعر البيع</th><th class="num">الفرق</th><th class="num">المعكوس</th><th class="num">المتبقي</th><th>المستخدم</th></tr></thead>
            <tbody><tr v-for="e in table.paged.value" :key="e.id">
              <td class="tabular-nums">{{ e.date }}</td>
              <td>{{ e.distributorName }}</td>
              <td class="text-slate-500">{{ e.batchName }} <span class="text-xs">({{ e.batchDate || '—' }})</span></td>
              <td class="num">{{ fmtPct(e.companyDiscount, dec) }}</td>
              <td class="num text-slate-500">{{ e.previousPrice == null ? '—' : fmtMoney(e.previousPrice) }}</td>
              <td class="num font-semibold">{{ fmtMoney(e.sellingPrice) }}</td>
              <td :class="['num', e.priceChange > 0 ? 'text-red-600' : e.priceChange < 0 ? 'text-green-700' : 'text-slate-400']">{{ e.priceChange == null ? '—' : fmtSigned(e.priceChange) }}</td>
              <td class="num">{{ fmtPct(e.pharmacyDiscountPct, dec) }}</td>
              <td :class="['num', e.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(e.remainingDiscountPct, dec) }}</td>
              <td class="text-xs text-slate-500">{{ e.user || '—' }}</td>
            </tr></tbody>
          </table>
        </div>
        <Pager :table="table" />
      </div>

      <div class="card">
        <div class="card-h"><div class="card-t">سجل التعديلات (Audit log)</div><button class="btn-secondary btn-sm" @click="exportAudit"><Download class="w-4 h-4" />Excel</button></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>الإجراء</th><th>الوقت</th><th>المذخر</th><th class="num">السعر السابق</th><th class="num">السعر الجديد</th><th>تاريخ المتابعة</th><th>المستخدم</th></tr></thead>
            <tbody><tr v-for="h in auditTable.paged.value" :key="h.id">
              <td><span :class="['badge', h.action === 'delete' ? 'bg-red-50 text-red-700 ring-red-200' : h.action === 'update' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-100 text-slate-600 ring-slate-200']">{{ ACTIONS[h.action] }}</span></td>
              <td class="tabular-nums text-xs">{{ fmtDateTime(h.at) }}</td>
              <td>{{ distributorMap.get(h.distributorId)?.name || '—' }}</td>
              <td class="num">{{ h.oldPrice == null ? '—' : fmtMoney(h.oldPrice) }}</td>
              <td class="num">{{ h.newPrice == null ? '—' : fmtMoney(h.newPrice) }}</td>
              <td class="tabular-nums">{{ fmtDate(h.date) }}</td>
              <td class="text-xs">{{ h.user || '—' }}</td>
            </tr></tbody>
          </table>
        </div>
        <Pager :table="auditTable" />
      </div>
    </template>
  </div>
</template>
