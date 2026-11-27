<script setup>
import { computed } from 'vue'
import { Plus, Upload, Layers, Eye, Download, Trash2, Copy } from 'lucide-vue-next'
import EmptyState from '../components/EmptyState.vue'
import SearchInput from '../components/SearchInput.vue'
import SortTh from '../components/SortTh.vue'
import Pager from '../components/Pager.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { deleteBatch, BATCH_TYPES } from '../db/repo.js'
import { avg } from '../lib/analytics.js'
import { fmtPct } from '../lib/format.js'
import { exportBatch } from '../lib/batchExport.js'

const store = useStore()
const { batches, batchProducts, monitoring, distributorMap, settings } = store
const rows = computed(() =>
  batches.value.map((b) => {
    const items = batchProducts.value.filter((x) => x.batchId === b.id)
    return {
      ...b,
      items: items.length,
      avgDiscount: avg(items.map((i) => i.companyDiscount)),
      followups: monitoring.value.filter((m) => m.batchId === b.id).length,
      typeLabel: BATCH_TYPES[b.type] || b.type,
      distributorName: b.distributorId ? distributorMap.value.get(b.distributorId)?.name : '',
    }
  }),
)
const table = useTable(rows, { search: ['name', 'lab', 'notes', 'distributorName'], sortKey: 'date', sortDir: 'desc' })

async function remove(b) {
  if (!(await confirm({ title: 'حذف قائمة', message: `هل أنت متأكد من حذف «${b.name}» وجميع منتجاتها؟`, confirmText: 'حذف', danger: true }))) return
  try { await deleteBatch(b.id); toast('تم حذف القائمة') } catch (e) { toastError(e) }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">قوائم الأسعار والطلبيات</h1><p class="page-sub">كل قائمة إصدار مستقل من الأسعار والخصومات — لا تتغير القوائم القديمة بإنشاء قائمة جديدة</p></div>
      <div class="flex flex-wrap gap-2">
        <router-link to="/import" class="btn-secondary"><Upload class="w-4 h-4" />استيراد من Excel</router-link>
        <router-link to="/batches/new" class="btn-primary"><Plus class="w-4 h-4" />قائمة جديدة</router-link>
      </div>
    </div>
    <div class="card">
      <div class="p-3 border-b border-slate-100"><SearchInput v-model="table.q.value" class="max-w-md" placeholder="بحث باسم القائمة أو المعمل…" /></div>
      <EmptyState v-if="!batches.length" :icon="Layers" title="لا توجد قوائم أسعار" text="أنشئ قائمة أسعار يدوياً أو استوردها من ملف Excel الخاص بالمعمل.">
        <router-link to="/batches/new" class="btn-primary"><Plus class="w-4 h-4" />قائمة جديدة</router-link>
        <router-link to="/import" class="btn-secondary"><Upload class="w-4 h-4" />استيراد</router-link>
      </EmptyState>
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="code" :table="table" num>رقم</SortTh>
            <SortTh k="name" :table="table">اسم القائمة</SortTh>
            <SortTh k="date" :table="table">التاريخ</SortTh>
            <th class="hidden md:table-cell">النوع</th>
            <SortTh k="lab" :table="table" class="hidden lg:table-cell">المعمل</SortTh>
            <SortTh k="items" :table="table" num>المنتجات</SortTh>
            <SortTh k="avgDiscount" :table="table" num>متوسط خصم الشركة</SortTh>
            <SortTh k="followups" :table="table" num class="hidden sm:table-cell">المتابعات</SortTh>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="b in table.paged.value" :key="b.id">
              <td class="num text-slate-500">#{{ b.code }}</td>
              <td class="font-medium"><router-link :to="`/batches/${b.id}`" class="hover:text-brand-700">{{ b.name }}</router-link> <span v-if="b.isDemo" class="chip-demo">تجريبي</span></td>
              <td class="tabular-nums">{{ b.date }}</td>
              <td class="hidden md:table-cell text-slate-500">{{ b.typeLabel }}<span v-if="b.distributorName"> · {{ b.distributorName }}</span></td>
              <td class="hidden lg:table-cell text-slate-500">{{ b.lab || '—' }}</td>
              <td class="num">{{ b.items }}</td>
              <td class="num">{{ fmtPct(b.avgDiscount, settings.pctDecimals) }}</td>
              <td class="num hidden sm:table-cell">{{ b.followups }}</td>
              <td class="whitespace-nowrap text-left">
                <router-link :to="`/batches/${b.id}`" class="icon-btn" title="عرض"><Eye class="w-4 h-4" /></router-link>
                <router-link :to="`/batches/new?copy=${b.id}`" class="icon-btn" title="إنشاء قائمة جديدة بناءً عليها"><Copy class="w-4 h-4" /></router-link>
                <button class="icon-btn" title="تصدير" @click="exportBatch(b.id, store)"><Download class="w-4 h-4" /></button>
                <button class="icon-btn hover:text-red-600" title="حذف" @click="remove(b)"><Trash2 class="w-4 h-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :table="table" />
    </div>
  </div>
</template>
