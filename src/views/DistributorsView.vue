<script setup>
import { computed, ref } from 'vue'
import { Plus, Pencil, Trash2, Download, Warehouse, Eye, Phone } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import SearchInput from '../components/SearchInput.vue'
import SortTh from '../components/SortTh.vue'
import Pager from '../components/Pager.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { saveDistributor, deleteDistributor } from '../db/repo.js'
import { latestByPair, distributorStats } from '../lib/analytics.js'
import { fmtPct, fmtDate } from '../lib/format.js'
import { exportExcel } from '../lib/excel.js'
import { exportDistributorPrices } from '../lib/reports.js'

const store = useStore()
const { distributors, monitoring, settings } = store
const gov = ref('')
const governorates = computed(() => [...new Set(distributors.value.map((d) => d.governorate).filter(Boolean))].sort())
const stats = computed(() => new Map(distributorStats(latestByPair(monitoring.value)).map((s) => [s.distributorId, s])))
const counts = computed(() => { const m = new Map(); for (const e of monitoring.value) m.set(e.distributorId, (m.get(e.distributorId) || 0) + 1); return m })
const rows = computed(() =>
  distributors.value
    .filter((d) => !gov.value || d.governorate === gov.value)
    .map((d) => {
      const s = stats.value.get(d.id)
      return { ...d, followups: counts.value.get(d.id) || 0, avgReflected: s?.avgReflected ?? null, avgRemaining: s?.avgRemaining ?? null, lastDate: s?.lastDate || null }
    }),
)
const table = useTable(rows, { search: ['name', 'governorate', 'region', 'city', 'contactPerson', 'phone'], sortKey: 'name' })

const empty = () => ({ id: null, name: '', governorate: '', region: '', city: '', contactPerson: '', phone: '', contactInfo: '', notes: '' })
const form = ref(empty())
const open = ref(false)
const err = ref('')
function openNew() { form.value = empty(); err.value = ''; open.value = true }
function openEdit(d) { form.value = { ...d }; err.value = ''; open.value = true }
async function save(allowDuplicate = false) {
  err.value = ''
  try {
    await saveDistributor(form.value, { allowDuplicate })
    toast(form.value.id ? 'تم تحديث بيانات المذخر' : 'تمت إضافة المذخر')
    open.value = false
  } catch (e) {
    if (e.code === 'duplicate') {
      if (await confirm({ title: 'مذخر مكرر محتمل', message: e.message + '\nهل تريد الحفظ رغم ذلك؟', confirmText: 'حفظ على أي حال' })) return save(true)
    } else err.value = e.message
  }
}
async function remove(d) {
  if (!(await confirm({ title: 'حذف مذخر', message: `هل أنت متأكد من حذف «${d.name}»؟`, confirmText: 'حذف', danger: true }))) return
  try { await deleteDistributor(d.id); toast('تم حذف المذخر') } catch (e) { toastError(e) }
}
function exportList() {
  exportExcel('المذاخر', [{ name: 'المذاخر', rows: table.filtered.value.map((d) => ({
    'المعرف': d.id, 'اسم المذخر': d.name, 'المحافظة': d.governorate, 'المنطقة': d.region, 'المدينة': d.city, 'المسؤول': d.contactPerson,
    'الهاتف': d.phone, 'معلومات الاتصال': d.contactInfo, 'عدد المتابعات': d.followups,
    'متوسط الخصم المعكوس %': d.avgReflected, 'متوسط الخصم المتبقي %': d.avgRemaining, 'آخر متابعة': d.lastDate, 'ملاحظات': d.notes, 'تاريخ الإنشاء': fmtDate(d.createdAt),
  })) }])
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">المذاخر</h1><p class="page-sub">بيانات المذاخر ومتوسط انعكاس الخصم لديها (من أحدث متابعة لكل منتج)</p></div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" @click="exportList" :disabled="!rows.length"><Download class="w-4 h-4" />تصدير Excel</button>
        <button class="btn-primary" @click="openNew"><Plus class="w-4 h-4" />إضافة مذخر</button>
      </div>
    </div>

    <div class="card">
      <div class="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-slate-100">
        <SearchInput v-model="table.q.value" class="sm:col-span-2" placeholder="بحث بالاسم، المدينة، المسؤول، الهاتف…" />
        <select v-model="gov" class="input"><option value="">كل المحافظات</option><option v-for="g in governorates" :key="g">{{ g }}</option></select>
      </div>
      <EmptyState v-if="!distributors.length" :icon="Warehouse" title="لا توجد مذاخر بعد" text="أضف المذاخر التي تتابع أسعارها ميدانياً.">
        <button class="btn-primary" @click="openNew"><Plus class="w-4 h-4" />إضافة مذخر</button>
      </EmptyState>
      <EmptyState v-else-if="!table.filtered.value.length" title="لا توجد نتائج مطابقة" />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="name" :table="table">المذخر</SortTh>
            <SortTh k="governorate" :table="table">الموقع</SortTh>
            <th class="hidden md:table-cell">المسؤول / الهاتف</th>
            <SortTh k="followups" :table="table" num>المتابعات</SortTh>
            <SortTh k="avgReflected" :table="table" num>متوسط المعكوس</SortTh>
            <SortTh k="avgRemaining" :table="table" num>متوسط المتبقي</SortTh>
            <SortTh k="lastDate" :table="table" class="hidden sm:table-cell">آخر متابعة</SortTh>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="d in table.paged.value" :key="d.id">
              <td class="font-medium"><router-link :to="`/distributors/${d.id}`" class="hover:text-brand-700">{{ d.name }}</router-link> <span v-if="d.isDemo" class="chip-demo">تجريبي</span></td>
              <td class="text-slate-500">{{ [d.governorate, d.region, d.city].filter(Boolean).join(' / ') || '—' }}</td>
              <td class="hidden md:table-cell text-slate-500">{{ d.contactPerson || '—' }}<div v-if="d.phone" class="text-xs ltr text-right inline-flex items-center gap-1"><Phone class="w-3 h-3" />{{ d.phone }}</div></td>
              <td class="num">{{ d.followups }}</td>
              <td class="num">{{ fmtPct(d.avgReflected, settings.pctDecimals) }}</td>
              <td :class="['num', d.avgRemaining < 0 && 'text-red-600']">{{ fmtPct(d.avgRemaining, settings.pctDecimals) }}</td>
              <td class="hidden sm:table-cell text-slate-500 tabular-nums">{{ fmtDate(d.lastDate) }}</td>
              <td class="whitespace-nowrap text-left">
                <router-link :to="`/distributors/${d.id}`" class="icon-btn" title="عرض"><Eye class="w-4 h-4" /></router-link>
                <button class="icon-btn" title="تصدير أسعار المذخر" @click="exportDistributorPrices(d, monitoring)"><Download class="w-4 h-4" /></button>
                <button class="icon-btn" title="تعديل" @click="openEdit(d)"><Pencil class="w-4 h-4" /></button>
                <button class="icon-btn hover:text-red-600" title="حذف" @click="remove(d)"><Trash2 class="w-4 h-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :table="table" />
    </div>

    <Modal :open="open" :title="form.id ? 'تعديل مذخر' : 'إضافة مذخر'" @close="open = false">
      <form class="grid grid-cols-1 sm:grid-cols-2 gap-3" @submit.prevent="save()">
        <div class="sm:col-span-2"><label class="label">اسم المذخر *</label><input v-model="form.name" class="input" required /></div>
        <div><label class="label">المحافظة</label><input v-model="form.governorate" class="input" list="gov-list" /><datalist id="gov-list"><option v-for="g in governorates" :key="g" :value="g" /></datalist></div>
        <div><label class="label">المنطقة</label><input v-model="form.region" class="input" /></div>
        <div><label class="label">المدينة</label><input v-model="form.city" class="input" /></div>
        <div><label class="label">اسم المسؤول</label><input v-model="form.contactPerson" class="input" /></div>
        <div><label class="label">رقم الهاتف</label><input v-model="form.phone" class="input ltr text-right" type="tel" /></div>
        <div><label class="label">معلومات الاتصال</label><input v-model="form.contactInfo" class="input" placeholder="بريد، عنوان، واتساب…" /></div>
        <div class="sm:col-span-2"><label class="label">ملاحظات</label><textarea v-model="form.notes" class="input" rows="2" /></div>
        <p v-if="err" class="sm:col-span-2 text-sm text-red-600">{{ err }}</p>
        <button type="submit" class="hidden" />
      </form>
      <template #footer>
        <button class="btn-secondary" @click="open = false">إلغاء</button>
        <button class="btn-primary" @click="save()">حفظ</button>
      </template>
    </Modal>
  </div>
</template>
