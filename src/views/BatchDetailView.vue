<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Pencil, Trash2, Download, Printer, Plus, Copy, ArrowRight } from 'lucide-vue-next'
import Modal from '../components/Modal.vue'
import EmptyState from '../components/EmptyState.vue'
import ComboBox from '../components/ComboBox.vue'
import PrintHeader from '../components/PrintHeader.vue'
import SortTh from '../components/SortTh.vue'
import { useStore } from '../composables/store.js'
import { useTable } from '../composables/useTable.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { updateBatchMeta, upsertBatchItem, removeBatchItem, setOverride, removeOverride, deleteBatch, BATCH_TYPES } from '../db/repo.js'
import { distributorPurchasePrice, validateDiscount, validateOriginalPrice } from '../lib/calc.js'
import { avg } from '../lib/analytics.js'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { exportBatch } from '../lib/batchExport.js'

const route = useRoute()
const router = useRouter()
const store = useStore()
const { batchMap, batchProducts, overrides, monitoring, productMap, distributorMap, distributors, products, settings } = store
const id = Number(route.params.id)
const batch = computed(() => batchMap.value.get(id))
const items = computed(() =>
  batchProducts.value.filter((b) => b.batchId === id).map((b) => {
    const mons = monitoring.value.filter((m) => m.batchId === id && m.productId === b.productId)
    return { ...b, name: productMap.value.get(b.productId)?.name || '—', followups: mons.length, avgReflected: avg(mons.map((m) => m.pharmacyDiscountPct)), avgRemaining: avg(mons.map((m) => m.remainingDiscountPct)) }
  }),
)
const table = useTable(items, { search: ['name'], sortKey: 'name' })
const ovr = computed(() => overrides.value.filter((o) => o.batchId === id))
const followups = computed(() => monitoring.value.filter((m) => m.batchId === id).length)

/* تعديل البيانات العامة */
const metaForm = ref(null)
const metaErr = ref('')
async function saveMeta() {
  try { await updateBatchMeta(id, metaForm.value); toast('تم تحديث بيانات القائمة'); metaForm.value = null } catch (e) { metaErr.value = e.message }
}
/* منتج */
const item = ref(null)
const itemErr = ref('')
const itemOptions = computed(() => products.value.filter((p) => !items.value.some((i) => i.productId === p.id)).map((p) => ({ value: p.id, label: p.name })))
function newItem() { item.value = { isNew: true, productId: null, originalPrice: '', companyDiscount: batch.value?.defaultDiscount ?? '' }; itemErr.value = '' }
function editItem(i) { item.value = { ...i, isNew: false }; itemErr.value = '' }
function onPickProduct(pid) { const p = productMap.value.get(pid); if (p && !item.value.originalPrice) item.value.originalPrice = p.originalPrice }
async function saveItem() {
  itemErr.value = ''
  if (!item.value.productId) return (itemErr.value = 'اختر المنتج')
  const e = [...validateOriginalPrice(item.value.originalPrice), ...validateDiscount(item.value.companyDiscount)]
  if (e.length) return (itemErr.value = e[0])
  if (!item.value.isNew && item.value.followups) {
    const ok = await confirm({ title: 'تعديل سعر تاريخي', message: `يوجد ${item.value.followups} متابعة مرتبطة بهذا المنتج في هذه القائمة.\nالمتابعات السابقة ستحتفظ بالسعر والخصم المحفوظين وقت تسجيلها، والتعديل يؤثر على المتابعات الجديدة فقط.\nهل تريد المتابعة؟`, confirmText: 'تعديل' })
    if (!ok) return
  }
  try { await upsertBatchItem(id, item.value); toast('تم الحفظ'); item.value = null } catch (er) { itemErr.value = er.message }
}
async function removeItem(i) {
  if (!(await confirm({ title: 'إزالة منتج', message: `إزالة «${i.name}» من القائمة؟`, confirmText: 'إزالة', danger: true }))) return
  try { await removeBatchItem(id, i.productId); toast('تمت الإزالة') } catch (e) { toastError(e) }
}
/* خصومات المذاخر */
const ov = reactive({ distributorId: null, productId: 0, discount: '' })
async function addOv() {
  try {
    if (!ov.distributorId) throw new Error('اختر المذخر')
    await setOverride(id, ov.distributorId, ov.productId, ov.discount)
    ov.discount = ''
    toast('تم حفظ الخصم الخاص')
  } catch (e) { toastError(e) }
}
async function delOv(o) {
  if (await confirm({ title: 'حذف خصم خاص', message: 'سيُطبق خصم القائمة على هذا المذخر في المتابعات الجديدة. المتابعات السابقة لن تتغير.', confirmText: 'حذف', danger: true })) await removeOverride(o.id)
}
async function removeBatch() {
  if (!(await confirm({ title: 'حذف قائمة', message: `حذف «${batch.value.name}»؟`, confirmText: 'حذف', danger: true }))) return
  try { await deleteBatch(id); toast('تم حذف القائمة'); router.replace('/batches') } catch (e) { toastError(e) }
}
const print = () => window.print()
</script>

<template>
  <div v-if="!batch"><EmptyState title="القائمة غير موجودة"><router-link to="/batches" class="btn-secondary">العودة</router-link></EmptyState></div>
  <div v-else class="space-y-4">
    <PrintHeader :title="`قائمة الأسعار #${batch.code} — ${batch.name}`" :subtitle="`التاريخ ${batch.date} · ${batch.lab || ''}`" />
    <div class="flex flex-wrap items-start justify-between gap-3 no-print">
      <div>
        <router-link to="/batches" class="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ArrowRight class="w-4 h-4" />قوائم الأسعار</router-link>
        <h1 class="page-title mt-1">#{{ batch.code }} — {{ batch.name }} <span v-if="batch.isDemo" class="chip-demo align-middle">تجريبي</span></h1>
        <p class="page-sub">{{ BATCH_TYPES[batch.type] }} · {{ batch.date }}<span v-if="batch.lab"> · {{ batch.lab }}</span><span v-if="batch.distributorId"> · {{ distributorMap.get(batch.distributorId)?.name }}</span></p>
        <p v-if="batch.notes" class="text-sm text-slate-500 mt-1">{{ batch.notes }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" @click="metaForm = { ...batch }; metaErr = ''"><Pencil class="w-4 h-4" />تعديل</button>
        <router-link :to="`/batches/new?copy=${id}`" class="btn-secondary"><Copy class="w-4 h-4" />قائمة جديدة منها</router-link>
        <button class="btn-secondary" @click="exportBatch(id, store)"><Download class="w-4 h-4" />Excel</button>
        <button class="btn-secondary" @click="print"><Printer class="w-4 h-4" />طباعة</button>
        <button class="btn-ghost text-red-600" @click="removeBatch"><Trash2 class="w-4 h-4" /></button>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="card p-3"><div class="text-xs text-slate-500">عدد المنتجات</div><div class="text-xl font-bold tabular-nums">{{ items.length }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">متوسط خصم الشركة</div><div class="text-xl font-bold tabular-nums">{{ fmtPct(avg(items.map((i) => i.companyDiscount)), settings.pctDecimals) }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">خصومات خاصة بمذاخر</div><div class="text-xl font-bold tabular-nums">{{ ovr.length }}</div></div>
      <div class="card p-3"><div class="text-xs text-slate-500">متابعات مرتبطة</div><div class="text-xl font-bold tabular-nums">{{ followups }}</div></div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">المنتجات والأسعار</div><button class="btn-secondary btn-sm no-print" @click="newItem"><Plus class="w-4 h-4" />إضافة منتج</button></div>
      <EmptyState v-if="!items.length" title="القائمة فارغة" />
      <div v-else class="overflow-x-auto">
        <table class="tbl">
          <thead><tr>
            <SortTh k="name" :table="table">المنتج</SortTh>
            <SortTh k="originalPrice" :table="table" num>السعر الأصلي</SortTh>
            <SortTh k="companyDiscount" :table="table" num>خصم الشركة</SortTh>
            <SortTh k="purchasePrice" :table="table" num>سعر شراء المذخر</SortTh>
            <SortTh k="followups" :table="table" num>المتابعات</SortTh>
            <SortTh k="avgReflected" :table="table" num>متوسط المعكوس</SortTh>
            <SortTh k="avgRemaining" :table="table" num>متوسط المتبقي</SortTh>
            <th class="no-print"></th>
          </tr></thead>
          <tbody>
            <tr v-for="i in table.filtered.value" :key="i.id">
              <td class="font-medium"><router-link :to="`/products/${i.productId}`" class="hover:text-brand-700">{{ i.name }}</router-link></td>
              <td class="num">{{ fmtMoney(i.originalPrice) }}</td>
              <td class="num">{{ fmtPct(i.companyDiscount, settings.pctDecimals) }}</td>
              <td class="num font-medium">{{ fmtMoney(i.purchasePrice) }}</td>
              <td class="num">{{ i.followups }}</td>
              <td class="num">{{ fmtPct(i.avgReflected, settings.pctDecimals) }}</td>
              <td :class="['num', i.avgRemaining < 0 && 'text-red-600']">{{ fmtPct(i.avgRemaining, settings.pctDecimals) }}</td>
              <td class="no-print whitespace-nowrap text-left">
                <button class="icon-btn" @click="editItem(i)"><Pencil class="w-4 h-4" /></button>
                <button class="icon-btn hover:text-red-600" @click="removeItem(i)"><Trash2 class="w-4 h-4" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">خصومات خاصة بمذاخر</div></div>
      <div class="p-4 space-y-3">
        <p class="text-xs text-slate-500">الأولوية عند الحساب: خصم المذخر للمنتج ← خصم المذخر لكامل القائمة ← خصم القائمة للمنتج.</p>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end no-print">
          <div><label class="label">المذخر</label><select v-model="ov.distributorId" class="input"><option :value="null">اختر…</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select></div>
          <div><label class="label">المنتج</label><select v-model="ov.productId" class="input"><option :value="0">كل منتجات القائمة</option><option v-for="i in items" :key="i.productId" :value="i.productId">{{ i.name }}</option></select></div>
          <div><label class="label">الخصم %</label><input v-model="ov.discount" type="number" step="any" class="input ltr text-right" /></div>
          <button class="btn-secondary" @click="addOv"><Plus class="w-4 h-4" />حفظ</button>
        </div>
        <table v-if="ovr.length" class="tbl">
          <thead><tr><th>المذخر</th><th>المنتج</th><th class="num">الخصم</th><th class="no-print"></th></tr></thead>
          <tbody><tr v-for="o in ovr" :key="o.id">
            <td>{{ distributorMap.get(o.distributorId)?.name }}</td>
            <td>{{ o.productId ? productMap.get(o.productId)?.name : 'كل المنتجات' }}</td>
            <td class="num">{{ fmtPct(o.discount) }}</td>
            <td class="text-left no-print"><button class="icon-btn hover:text-red-600" @click="delOv(o)"><Trash2 class="w-4 h-4" /></button></td>
          </tr></tbody>
        </table>
        <p v-else class="text-sm text-slate-400">لا توجد خصومات خاصة — يُطبق خصم القائمة على جميع المذاخر.</p>
      </div>
    </div>

    <Modal :open="!!metaForm" title="تعديل بيانات القائمة" @close="metaForm = null">
      <div v-if="metaForm" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2"><label class="label">اسم القائمة</label><input v-model="metaForm.name" class="input" /></div>
        <div><label class="label">التاريخ</label><input v-model="metaForm.date" type="date" class="input" /></div>
        <div><label class="label">المعمل</label><input v-model="metaForm.lab" class="input" /></div>
        <div><label class="label">النوع</label><select v-model="metaForm.type" class="input"><option v-for="(l, k) in BATCH_TYPES" :key="k" :value="k">{{ l }}</option></select></div>
        <div><label class="label">الخصم الافتراضي %</label><input v-model="metaForm.defaultDiscount" type="number" step="any" class="input ltr text-right" /></div>
        <div v-if="metaForm.type === 'order'" class="sm:col-span-2"><label class="label">المذخر</label><select v-model="metaForm.distributorId" class="input"><option :value="null">—</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select></div>
        <div class="sm:col-span-2"><label class="label">ملاحظات</label><textarea v-model="metaForm.notes" class="input" rows="2" /></div>
        <p v-if="metaErr" class="text-sm text-red-600 sm:col-span-2">{{ metaErr }}</p>
      </div>
      <template #footer><button class="btn-secondary" @click="metaForm = null">إلغاء</button><button class="btn-primary" @click="saveMeta">حفظ</button></template>
    </Modal>

    <Modal :open="!!item" :title="item?.isNew ? 'إضافة منتج إلى القائمة' : 'تعديل سعر المنتج في القائمة'" size="sm" @close="item = null">
      <div v-if="item" class="space-y-3">
        <div><label class="label">المنتج</label>
          <ComboBox v-if="item.isNew" v-model="item.productId" :options="itemOptions" @update:model-value="onPickProduct" />
          <div v-else class="font-medium">{{ item.name }}</div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label">السعر الأصلي</label><input v-model="item.originalPrice" type="number" step="any" class="input ltr text-right" /></div>
          <div><label class="label">خصم الشركة %</label><input v-model="item.companyDiscount" type="number" step="any" class="input ltr text-right" /></div>
        </div>
        <div v-if="item.originalPrice && item.companyDiscount !== ''" class="text-sm text-slate-600">سعر شراء المذخر: <b class="tabular-nums">{{ fmtMoney(distributorPurchasePrice(Number(item.originalPrice), Number(item.companyDiscount))) }}</b></div>
        <p v-if="itemErr" class="text-sm text-red-600">{{ itemErr }}</p>
      </div>
      <template #footer><button class="btn-secondary" @click="item = null">إلغاء</button><button class="btn-primary" @click="saveItem">حفظ</button></template>
    </Modal>
  </div>
</template>
