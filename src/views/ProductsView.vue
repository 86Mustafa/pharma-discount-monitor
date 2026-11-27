<script setup>
import { computed, reactive, ref } from 'vue'
import { Plus, Pencil, Trash2, Download, Upload, Pill, LineChart } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import SearchInput from '../components/SearchInput.vue'
import SortTh from '../components/SortTh.vue'
import Pager from '../components/Pager.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { saveProduct, deleteProduct, PRODUCT_STATUS } from '../db/repo.js'
import { fmtMoney } from '../lib/format.js'
import { exportExcel } from '../lib/excel.js'

const { products, settings, monitoring } = useStore()
const filters = reactive({ status: '', group: '', manufacturer: '' })
const groups = computed(() => [...new Set(products.value.map((p) => p.group).filter(Boolean))].sort())
const manufacturers = computed(() => [...new Set(products.value.map((p) => p.manufacturer).filter(Boolean))].sort())
const counts = computed(() => {
  const m = new Map()
  for (const e of monitoring.value) m.set(e.productId, (m.get(e.productId) || 0) + 1)
  return m
})
const rows = computed(() =>
  products.value
    .filter((p) => (!filters.status || p.status === filters.status) && (!filters.group || p.group === filters.group) && (!filters.manufacturer || p.manufacturer === filters.manufacturer))
    .map((p) => ({ ...p, followups: counts.value.get(p.id) || 0 })),
)
const table = useTable(rows, { search: ['name', 'scientificName', 'manufacturer', 'group', 'dosageForm'], sortKey: 'name' })

const empty = () => ({ id: null, name: '', scientificName: '', manufacturer: '', dosageForm: '', packSize: '', originalPrice: '', group: '', notes: '', status: 'active' })
const form = ref(empty())
const open = ref(false)
const err = ref('')
const saving = ref(false)
function openNew() { form.value = empty(); err.value = ''; open.value = true }
function openEdit(p) { form.value = { ...p }; err.value = ''; open.value = true }

async function save(allowDuplicate = false) {
  saving.value = true
  err.value = ''
  try {
    await saveProduct({ ...form.value, isDemo: form.value.isDemo }, { allowDuplicate })
    toast(form.value.id ? 'تم تحديث بيانات الدواء' : 'تمت إضافة الدواء')
    open.value = false
  } catch (e) {
    if (e.code === 'duplicate') {
      if (await confirm({ title: 'منتج مكرر محتمل', message: e.message + '\nهل تريد الحفظ رغم ذلك؟', confirmText: 'حفظ على أي حال' })) return save(true)
    } else err.value = e.message
  } finally { saving.value = false }
}

async function remove(p) {
  if (!(await confirm({ title: 'حذف دواء', message: `هل أنت متأكد من حذف «${p.name}»؟`, confirmText: 'حذف', danger: true }))) return
  try { await deleteProduct(p.id); toast('تم حذف الدواء') } catch (e) { toastError(e) }
}

function exportRows() {
  exportExcel('المنتجات', [{
    name: 'المنتجات',
    rows: table.filtered.value.map((p) => ({
      'المعرف': p.id, 'اسم الدواء': p.name, 'الاسم العلمي': p.scientificName, 'الشركة المصنعة': p.manufacturer, 'الشكل الدوائي': p.dosageForm,
      'حجم العبوة': p.packSize, 'السعر الأصلي': p.originalPrice, 'المجموعة الدوائية': p.group, 'الحالة': PRODUCT_STATUS[p.status] || p.status,
      'عدد المتابعات': p.followups, 'ملاحظات': p.notes, 'بيانات تجريبية': p.isDemo ? 'نعم' : '',
    })),
  }])
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">الأدوية</h1><p class="page-sub">إدارة قائمة المنتجات وأسعارها الأصلية الحالية</p></div>
      <div class="flex flex-wrap gap-2">
        <router-link to="/import?mode=products" class="btn-secondary"><Upload class="w-4 h-4" />استيراد</router-link>
        <button class="btn-secondary" @click="exportRows" :disabled="!rows.length"><Download class="w-4 h-4" />تصدير Excel</button>
        <button class="btn-primary" @click="openNew"><Plus class="w-4 h-4" />إضافة دواء</button>
      </div>
    </div>

    <div class="card">
      <div class="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 border-b border-slate-100">
        <SearchInput v-model="table.q.value" placeholder="بحث بالاسم، الاسم العلمي، الشركة…" />
        <select v-model="filters.group" class="input"><option value="">كل المجموعات</option><option v-for="g in groups" :key="g">{{ g }}</option></select>
        <select v-model="filters.manufacturer" class="input"><option value="">كل الشركات المصنعة</option><option v-for="g in manufacturers" :key="g">{{ g }}</option></select>
        <select v-model="filters.status" class="input"><option value="">كل الحالات</option><option v-for="(l, k) in PRODUCT_STATUS" :key="k" :value="k">{{ l }}</option></select>
      </div>

      <EmptyState v-if="!products.length" :icon="Pill" title="لا توجد أدوية بعد" text="أضف الأدوية يدوياً أو استوردها من ملف Excel، أو حمّل البيانات التجريبية من الإعدادات.">
        <button class="btn-primary" @click="openNew"><Plus class="w-4 h-4" />إضافة دواء</button>
        <router-link to="/import?mode=products" class="btn-secondary"><Upload class="w-4 h-4" />استيراد Excel</router-link>
      </EmptyState>
      <EmptyState v-else-if="!table.filtered.value.length" title="لا توجد نتائج مطابقة" text="جرّب تعديل البحث أو الفلاتر." />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="name" :table="table">اسم الدواء</SortTh>
            <SortTh k="scientificName" :table="table">الاسم العلمي</SortTh>
            <SortTh k="manufacturer" :table="table" class="hidden md:table-cell">الشركة المصنعة</SortTh>
            <th class="hidden lg:table-cell">الشكل / العبوة</th>
            <SortTh k="group" :table="table" class="hidden lg:table-cell">المجموعة</SortTh>
            <SortTh k="originalPrice" :table="table" num>السعر الأصلي</SortTh>
            <SortTh k="followups" :table="table" num class="hidden sm:table-cell">المتابعات</SortTh>
            <th>الحالة</th><th class="no-print"></th>
          </tr></thead>
          <tbody>
            <tr v-for="p in table.paged.value" :key="p.id">
              <td class="font-medium"><router-link :to="`/products/${p.id}`" class="text-slate-900 hover:text-brand-700">{{ p.name }}</router-link> <span v-if="p.isDemo" class="chip-demo">تجريبي</span></td>
              <td class="text-slate-500">{{ p.scientificName || '—' }}</td>
              <td class="hidden md:table-cell text-slate-500">{{ p.manufacturer || '—' }}</td>
              <td class="hidden lg:table-cell text-slate-500">{{ [p.dosageForm, p.packSize].filter(Boolean).join(' · ') || '—' }}</td>
              <td class="hidden lg:table-cell text-slate-500">{{ p.group || '—' }}</td>
              <td class="num font-medium">{{ fmtMoney(p.originalPrice) }}</td>
              <td class="num hidden sm:table-cell">{{ p.followups }}</td>
              <td><span :class="['badge', p.status === 'active' ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-slate-100 text-slate-600 ring-slate-200']">{{ PRODUCT_STATUS[p.status] || p.status }}</span></td>
              <td class="no-print whitespace-nowrap text-left">
                <router-link :to="`/products/${p.id}`" class="icon-btn" title="تحليل"><LineChart class="w-4 h-4" /></router-link>
                <button class="icon-btn" title="تعديل" @click="openEdit(p)"><Pencil class="w-4 h-4" /></button>
                <button class="icon-btn hover:text-red-600" title="حذف" @click="remove(p)"><Trash2 class="w-4 h-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :table="table" />
    </div>

    <Modal :open="open" :title="form.id ? 'تعديل دواء' : 'إضافة دواء'" @close="open = false">
      <form class="grid grid-cols-1 sm:grid-cols-2 gap-3" @submit.prevent="save()">
        <div class="sm:col-span-2"><label class="label">اسم الدواء *</label><input v-model="form.name" class="input" required autofocus /><p class="text-xs text-slate-400 mt-1">يُحفظ الاسم كما تُدخله تماماً.</p></div>
        <div><label class="label">الاسم العلمي</label><input v-model="form.scientificName" class="input" dir="auto" /></div>
        <div><label class="label">الشركة المصنعة</label><input v-model="form.manufacturer" class="input" list="mf-list" /><datalist id="mf-list"><option v-for="m in manufacturers" :key="m" :value="m" /></datalist></div>
        <div><label class="label">الشكل الدوائي</label><input v-model="form.dosageForm" class="input" list="df-list" placeholder="أقراص، كبسول، شراب…" /><datalist id="df-list"><option v-for="d in ['أقراص','كبسول','شراب','حقن','فيال حقن','مرهم','كريم','قطرة','بخاخ','تحاميل']" :key="d" :value="d" /></datalist></div>
        <div><label class="label">حجم العبوة</label><input v-model="form.packSize" class="input" /></div>
        <div><label class="label">السعر الأصلي ({{ settings.currency }}) *</label><input v-model="form.originalPrice" class="input ltr text-right" type="number" min="0.01" step="any" required /></div>
        <div><label class="label">المجموعة الدوائية</label><input v-model="form.group" class="input" list="gr-list" /><datalist id="gr-list"><option v-for="g in groups" :key="g" :value="g" /></datalist></div>
        <div><label class="label">حالة المنتج</label><select v-model="form.status" class="input"><option v-for="(l, k) in PRODUCT_STATUS" :key="k" :value="k">{{ l }}</option></select></div>
        <div class="sm:col-span-2"><label class="label">ملاحظات</label><textarea v-model="form.notes" class="input" rows="2" /></div>
        <p v-if="err" class="sm:col-span-2 text-sm text-red-600">{{ err }}</p>
        <button type="submit" class="hidden" />
      </form>
      <template #footer>
        <button class="btn-secondary" @click="open = false">إلغاء</button>
        <button class="btn-primary" :disabled="saving" @click="save()">حفظ</button>
      </template>
    </Modal>
  </div>
</template>
