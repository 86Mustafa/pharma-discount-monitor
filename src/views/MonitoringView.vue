<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Save, Pencil, Trash2, History, Download, ClipboardEdit, ArrowUp, ArrowDown, Info } from 'lucide-vue-next'
import ComboBox from '../components/ComboBox.vue'
import DiscountPanel from '../components/DiscountPanel.vue'
import ClassBadge from '../components/ClassBadge.vue'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import SearchInput from '../components/SearchInput.vue'
import SortTh from '../components/SortTh.vue'
import Pager from '../components/Pager.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { addMonitoring, updateMonitoring, deleteMonitoring, PRICE_SOURCES } from '../db/repo.js'
import { computeDiscount, classify, resolveCompanyDiscount } from '../lib/calc.js'
import { byDateDesc } from '../lib/analytics.js'
import { fmtMoney, fmtPct, fmtSigned, fmtDate, fmtDateTime, todayISO } from '../lib/format.js'
import { exportMonitoring } from '../lib/reports.js'
import { displayName, formLabel, packagingLabel } from '../lib/catalog.js'

const route = useRoute()
const store = useStore()
const { distributors, batches, batchProducts, overrides, monitoring, productMap, settings, history } = store

/* ---------------- نموذج الإدخال ---------------- */
const form = reactive({
  distributorId: Number(route.query.distributor) || null,
  batchId: Number(route.query.batch) || batches.value[0]?.id || null,
  productId: Number(route.query.product) || null,
  sellingPrice: '',
  date: todayISO(),
  source: 'field',
  notes: '',
})
const saving = ref(false)
const err = ref('')

const distOptions = computed(() => distributors.value.map((d) => ({ value: d.id, label: d.name, sub: [d.governorate, d.city].filter(Boolean).join(' / ') })))
const batchItems = computed(() => batchProducts.value.filter((b) => b.batchId === form.batchId))
const productOptions = computed(() =>
  batchItems.value
    .map((b) => ({ value: b.productId, label: displayName(productMap.value.get(b.productId)), sub: `${formLabel(productMap.value.get(b.productId)?.dosageForm)} · ${packagingLabel(productMap.value.get(b.productId)?.packaging)} · السعر الأصلي ${fmtMoney(b.originalPrice)} · خصم ${fmtPct(b.companyDiscount)}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ar')),
)
watch(() => form.batchId, () => { if (form.productId && !batchItems.value.some((b) => b.productId === form.productId)) form.productId = null })

const pricing = computed(() => {
  const bp = batchItems.value.find((b) => b.productId === form.productId)
  if (!bp) return null
  const res = resolveCompanyDiscount({ batchProduct: bp, overrides: overrides.value, distributorId: form.distributorId, productId: form.productId })
  return { originalPrice: bp.originalPrice, companyDiscount: res.discount, source: res.source }
})
const result = computed(() => (pricing.value ? computeDiscount({ ...pricing.value, sellingPrice: form.sellingPrice === '' ? undefined : form.sellingPrice }) : null))
const category = computed(() => classify(result.value, settings.value.classification))
const previous = computed(() => {
  if (!form.productId || !form.distributorId) return null
  return monitoring.value.filter((m) => m.productId === form.productId && m.distributorId === form.distributorId).sort(byDateDesc)[0] || null
})
const overrideLabel = { 'distributor-product': 'خصم خاص بهذا المذخر لهذا المنتج', distributor: 'خصم خاص بهذا المذخر في هذه القائمة', batch: 'خصم القائمة' }

async function submit(force = false) {
  err.value = ''
  saving.value = true
  try {
    await addMonitoring({ ...form }, { force, user: settings.value.currentUser })
    toast('تم تسجيل السعر وحفظه في السجل التاريخي')
    form.productId = null
    form.sellingPrice = ''
    form.notes = ''
  } catch (e) {
    if (e.code === 'duplicate') {
      if (await confirm({ title: 'تسجيل مكرر', message: e.message + '\nهل تريد تسجيله مرة أخرى؟', confirmText: 'تسجيل على أي حال' })) return submit(true)
    } else err.value = e.message
  } finally { saving.value = false }
}

/* ---------------- جدول المتابعات ---------------- */
const f = reactive({ distributorId: '', productId: '', batchId: '', from: '', to: '', alerts: false })
const productFilterOptions = computed(() => [...new Map(monitoring.value.map((m) => [m.productId, m.productName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')))
const rows = computed(() =>
  monitoring.value.filter((m) =>
    (!f.distributorId || m.distributorId === f.distributorId) && (!f.productId || m.productId === f.productId) && (!f.batchId || m.batchId === f.batchId) &&
    (!f.from || m.date >= f.from) && (!f.to || m.date <= f.to) && (!f.alerts || m.exceedsCompany || m.aboveOriginal),
  ),
)
const table = useTable(rows, { search: ['productName', 'distributorName', 'batchName', 'notes'], sortKey: 'date', sortDir: 'desc' })

/* تعديل */
const edit = ref(null)
const editErr = ref('')
const editResult = computed(() => edit.value && computeDiscount({ originalPrice: edit.value.originalPrice, companyDiscount: edit.value.companyDiscount, sellingPrice: edit.value.sellingPrice }))
function openEdit(m) { edit.value = { ...m }; editErr.value = '' }
async function saveEdit() {
  try {
    await updateMonitoring(edit.value.id, edit.value, { user: settings.value.currentUser })
    toast('تم تحديث السجل مع حفظ القيمة السابقة في سجل التعديلات')
    edit.value = null
  } catch (e) { editErr.value = e.message }
}
async function remove(m) {
  if (!(await confirm({ title: 'حذف متابعة', message: `حذف سعر ${fmtMoney(m.sellingPrice)} لـ «${m.productName}» لدى «${m.distributorName}» بتاريخ ${m.date}؟\nسيُحفظ أثر الحذف في سجل التعديلات.`, confirmText: 'حذف', danger: true }))) return
  try { await deleteMonitoring(m.id, { user: settings.value.currentUser }); toast('تم الحذف') } catch (e) { toastError(e) }
}
/* سجل التعديلات */
const audit = ref(null)
const auditRows = computed(() => (audit.value ? history.value.filter((h) => h.monitoringId === audit.value.id).sort((a, b) => (a.at < b.at ? 1 : -1)) : []))
const ACTIONS = { create: 'إنشاء', update: 'تعديل', delete: 'حذف' }
</script>

<template>
  <div class="space-y-5">
    <div><h1 class="page-title">متابعة الأسعار الميدانية</h1><p class="page-sub">سجّل سعر بيع المذخر للصيدلية وشاهد التحليل فوراً. لا يُحذف أي سعر سابق.</p></div>

    <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
      <!-- النموذج -->
      <div class="card xl:col-span-2">
        <div class="card-h"><div class="card-t">تسجيل سعر جديد</div></div>
        <EmptyState v-if="!distributors.length || !batches.length" :icon="ClipboardEdit" title="يلزم وجود مذخر وقائمة أسعار" text="أضف مذخراً واحداً على الأقل وقائمة أسعار تحتوي على المنتجات قبل تسجيل المتابعات.">
          <router-link to="/distributors" class="btn-secondary">المذاخر</router-link>
          <router-link to="/batches/new" class="btn-primary">قائمة أسعار جديدة</router-link>
        </EmptyState>
        <form v-else class="p-4 space-y-3" @submit.prevent="submit()">
          <div><label class="label">1. المذخر *</label><ComboBox v-model="form.distributorId" :options="distOptions" placeholder="ابحث عن المذخر…" /></div>
          <div>
            <label class="label">2. قائمة الأسعار / الطلبية *</label>
            <select v-model="form.batchId" class="input"><option :value="null" disabled>اختر القائمة</option><option v-for="b in batches" :key="b.id" :value="b.id">#{{ b.code }} — {{ b.name }} ({{ b.date }})</option></select>
          </div>
          <div><label class="label">3. المنتج *</label><ComboBox v-model="form.productId" :options="productOptions" :disabled="!form.batchId" placeholder="ابحث عن المنتج في القائمة…" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="label">4. سعر البيع للصيدلية *</label><input v-model="form.sellingPrice" type="number" inputmode="decimal" min="0.01" step="any" class="input ltr text-right text-lg font-semibold" :placeholder="pricing ? fmtMoney(pricing.originalPrice) : ''" /></div>
            <div><label class="label">5. تاريخ المتابعة *</label><input v-model="form.date" type="date" class="input" :max="todayISO()" /></div>
          </div>
          <div><label class="label">مصدر السعر</label>
            <div class="flex flex-wrap gap-1.5">
              <button v-for="(l, k) in PRICE_SOURCES" :key="k" type="button" @click="form.source = k" :class="['rounded-full px-3 py-1 text-xs border transition', form.source === k ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400']">{{ l }}</button>
            </div>
          </div>
          <div><label class="label">ملاحظات</label><textarea v-model="form.notes" rows="2" class="input" placeholder="رقم الفاتورة، اسم الصيدلية، ظروف البيع…" /></div>
          <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
          <button class="btn-primary w-full py-2.5" :disabled="saving || !result?.hasSelling || !form.distributorId"><Save class="w-4 h-4" />حفظ السعر</button>
        </form>
      </div>

      <!-- النتائج الفورية -->
      <div class="card xl:col-span-3">
        <div class="card-h"><div class="card-t">التحليل الفوري</div><span v-if="pricing" class="text-xs text-slate-500">{{ overrideLabel[pricing.source] }}</span></div>
        <div class="p-4">
          <div v-if="!pricing" class="py-14 text-center text-sm text-slate-400">اختر المذخر والقائمة والمنتج ثم أدخل سعر البيع لعرض الحسابات فوراً.</div>
          <template v-else>
            <DiscountPanel :result="result" :category="category" :currency="settings.currency" :decimals="settings.pctDecimals" />
            <div v-if="previous" class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span class="inline-flex items-center gap-1"><Info class="w-4 h-4 text-slate-400" />آخر سعر مسجّل لهذا المذخر: <b class="tabular-nums">{{ fmtMoney(previous.sellingPrice) }}</b> بتاريخ {{ previous.date }} (معكوس {{ fmtPct(previous.pharmacyDiscountPct) }})</span>
              <span v-if="result?.hasSelling" :class="['inline-flex items-center gap-1 tabular-nums', result.sellingPrice > previous.sellingPrice ? 'text-red-600' : result.sellingPrice < previous.sellingPrice ? 'text-green-700' : '']">
                <ArrowUp v-if="result.sellingPrice > previous.sellingPrice" class="w-4 h-4" /><ArrowDown v-else-if="result.sellingPrice < previous.sellingPrice" class="w-4 h-4" />
                الفرق: {{ fmtSigned(result.sellingPrice - previous.sellingPrice) }}
              </span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- السجل -->
    <div class="card">
      <div class="card-h flex-wrap">
        <div class="card-t">سجل المتابعات <span class="text-slate-400 font-normal text-sm">({{ table.filtered.value.length }})</span></div>
        <button class="btn-secondary btn-sm" :disabled="!rows.length" @click="exportMonitoring('متابعات-الأسعار', table.filtered.value)"><Download class="w-4 h-4" />تصدير Excel</button>
      </div>
      <div class="p-3 grid grid-cols-2 lg:grid-cols-7 gap-2 border-b border-slate-100">
        <SearchInput v-model="table.q.value" class="col-span-2" />
        <select v-model="f.distributorId" class="input"><option value="">كل المذاخر</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select>
        <select v-model="f.productId" class="input"><option value="">كل المنتجات</option><option v-for="[id, n] in productFilterOptions" :key="id" :value="id">{{ n }}</option></select>
        <select v-model="f.batchId" class="input"><option value="">كل القوائم</option><option v-for="b in batches" :key="b.id" :value="b.id">{{ b.name }}</option></select>
        <input v-model="f.from" type="date" class="input" title="من تاريخ" />
        <input v-model="f.to" type="date" class="input" title="إلى تاريخ" />
        <label class="col-span-2 lg:col-span-7 inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="f.alerts" type="checkbox" class="rounded border-slate-300" />تنبيهات التحقق فقط (معكوس أكبر من خصم الشركة أو سعر أعلى من الأصلي)</label>
      </div>
      <EmptyState v-if="!table.filtered.value.length" title="لا توجد متابعات" text="ستظهر هنا جميع أسعار البيع المسجّلة." />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="date" :table="table">التاريخ</SortTh>
            <SortTh k="distributorName" :table="table">المذخر</SortTh>
            <SortTh k="productName" :table="table">المنتج</SortTh>
            <th class="num hidden lg:table-cell">الأصلي</th>
            <SortTh k="companyDiscount" :table="table" num>خصم الشركة</SortTh>
            <SortTh k="sellingPrice" :table="table" num>سعر البيع</SortTh>
            <SortTh k="pharmacyDiscountPct" :table="table" num>المعكوس</SortTh>
            <SortTh k="remainingDiscountPct" :table="table" num>المتبقي</SortTh>
            <th class="num hidden md:table-cell">التغير</th>
            <th class="hidden md:table-cell">المؤشر</th>
            <th class="hidden xl:table-cell">المصدر</th>
            <th></th>
          </tr></thead>
          <tbody>
            <tr v-for="m in table.paged.value" :key="m.id">
              <td class="tabular-nums whitespace-nowrap">{{ m.date }}</td>
              <td><router-link :to="`/distributors/${m.distributorId}`" class="hover:text-brand-700">{{ m.distributorName }}</router-link></td>
              <td><router-link :to="`/products/${m.productId}`" class="hover:text-brand-700">{{ m.productName }}</router-link> <span v-if="m.isDemo" class="chip-demo">تجريبي</span><div class="text-xs text-slate-400">{{ m.batchName }}</div></td>
              <td class="num hidden lg:table-cell text-slate-500">{{ fmtMoney(m.originalPrice) }}</td>
              <td class="num">{{ fmtPct(m.companyDiscount, settings.pctDecimals) }}</td>
              <td class="num font-semibold">{{ fmtMoney(m.sellingPrice) }}</td>
              <td class="num">{{ fmtPct(m.pharmacyDiscountPct, settings.pctDecimals) }}</td>
              <td :class="['num font-semibold', m.remainingDiscountPct < 0 ? 'text-red-600' : 'text-teal-700']">{{ fmtPct(m.remainingDiscountPct, settings.pctDecimals) }}</td>
              <td :class="['num hidden md:table-cell', m.priceChange > 0 ? 'text-red-600' : m.priceChange < 0 ? 'text-green-700' : 'text-slate-400']">{{ m.priceChange == null ? '—' : fmtSigned(m.priceChange) }}</td>
              <td class="hidden md:table-cell"><ClassBadge :category="m.category" /></td>
              <td class="hidden xl:table-cell text-slate-500 text-xs">{{ PRICE_SOURCES[m.source] }}</td>
              <td class="whitespace-nowrap text-left">
                <button class="icon-btn" title="سجل التعديلات" @click="audit = m"><History class="w-4 h-4" /></button>
                <button class="icon-btn" title="تعديل" @click="openEdit(m)"><Pencil class="w-4 h-4" /></button>
                <button class="icon-btn hover:text-red-600" title="حذف" @click="remove(m)"><Trash2 class="w-4 h-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <Pager :table="table" />
    </div>

    <Modal :open="!!edit" title="تعديل متابعة" size="lg" @close="edit = null">
      <div v-if="edit" class="space-y-4">
        <div class="text-sm text-slate-600">{{ edit.productName }} · {{ edit.distributorName }} · {{ edit.batchName }}</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label class="label">سعر البيع</label><input v-model="edit.sellingPrice" type="number" step="any" min="0.01" class="input ltr text-right" /></div>
          <div><label class="label">التاريخ</label><input v-model="edit.date" type="date" class="input" /></div>
          <div><label class="label">المصدر</label><select v-model="edit.source" class="input"><option v-for="(l, k) in PRICE_SOURCES" :key="k" :value="k">{{ l }}</option></select></div>
          <div class="sm:col-span-3"><label class="label">ملاحظات</label><textarea v-model="edit.notes" rows="2" class="input" /></div>
        </div>
        <p class="text-xs text-slate-500">السعر الأصلي وخصم الشركة محفوظان كلقطة وقت التسجيل ولا يتغيران. القيمة القديمة تُحفظ في سجل التعديلات.</p>
        <DiscountPanel :result="editResult" :category="classify(editResult, settings.classification)" :currency="settings.currency" :decimals="settings.pctDecimals" />
        <p v-if="editErr" class="text-sm text-red-600">{{ editErr }}</p>
      </div>
      <template #footer><button class="btn-secondary" @click="edit = null">إلغاء</button><button class="btn-primary" @click="saveEdit">حفظ التعديل</button></template>
    </Modal>

    <Modal :open="!!audit" title="سجل التعديلات" @close="audit = null">
      <table v-if="auditRows.length" class="tbl">
        <thead><tr><th>الإجراء</th><th>الوقت</th><th class="num">السعر السابق</th><th class="num">السعر الجديد</th><th>التاريخ</th><th>المستخدم</th></tr></thead>
        <tbody><tr v-for="h in auditRows" :key="h.id">
          <td>{{ ACTIONS[h.action] }}</td><td class="tabular-nums text-xs">{{ fmtDateTime(h.at) }}</td>
          <td class="num">{{ h.oldPrice == null ? '—' : fmtMoney(h.oldPrice) }}</td><td class="num">{{ h.newPrice == null ? '—' : fmtMoney(h.newPrice) }}</td>
          <td class="tabular-nums">{{ fmtDate(h.date) }}</td><td>{{ h.user || '—' }}</td>
        </tr></tbody>
      </table>
      <EmptyState v-else title="لا يوجد سجل" />
      <p class="text-xs text-slate-500 mt-3">في إجراء «إنشاء» يمثل «السعر السابق» آخر سعر مسجّل لنفس المنتج لدى نفس المذخر قبل هذه المتابعة.</p>
    </Modal>
  </div>
</template>
