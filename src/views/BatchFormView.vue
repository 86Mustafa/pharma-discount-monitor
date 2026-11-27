<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Plus, Trash2, Save, ListPlus, Percent } from 'lucide-vue-next'
import ComboBox from '../components/ComboBox.vue'
import EmptyState from '../components/EmptyState.vue'
import { useStore } from '../composables/store.js'
import { toast } from '../composables/ui.js'
import { createBatch, BATCH_TYPES } from '../db/repo.js'
import { distributorPurchasePrice, validateDiscount, validateOriginalPrice } from '../lib/calc.js'
import { fmtMoney, todayISO } from '../lib/format.js'
import { groupByFormPackaging, displayName, formLabel, packagingLabel, PACKAGING, DOSAGE_FORMS } from '../lib/catalog.js'

const route = useRoute()
const router = useRouter()
const { products, distributors, batchMap, batchProducts, overrides: allOverrides, productMap, settings } = useStore()

const copyFrom = batchMap.value.get(Number(route.query.copy))
const meta = reactive({
  name: copyFrom ? `${copyFrom.name} (نسخة جديدة)` : '',
  date: todayISO(),
  lab: copyFrom?.lab || '',
  type: copyFrom?.type || 'list',
  distributorId: copyFrom?.distributorId || null,
  defaultDiscount: copyFrom?.defaultDiscount ?? 21,
  notes: '',
})
const updatePrices = ref(true)
const items = ref(
  copyFrom
    ? batchProducts.value.filter((b) => b.batchId === copyFrom.id).map((b) => ({ productId: b.productId, originalPrice: b.originalPrice, companyDiscount: b.companyDiscount }))
    : [],
)
const overrides = ref(copyFrom ? allOverrides.value.filter((o) => o.batchId === copyFrom.id).map((o) => ({ distributorId: o.distributorId, productId: o.productId, discount: o.discount })) : [])

const inList = computed(() => new Set(items.value.map((i) => i.productId)))
const addOptions = computed(() => products.value.filter((p) => !inList.value.has(p.id)).map((p) => ({ value: p.id, label: displayName(p), sub: `${formLabel(p.dosageForm)} · ${packagingLabel(p.packaging)} · السعر الحالي ${fmtMoney(p.originalPrice)}` })))
const pick = ref(null)
function addProduct(id) {
  const p = productMap.value.get(id)
  if (!p || inList.value.has(id)) return
  items.value.push({ productId: id, originalPrice: p.originalPrice, companyDiscount: meta.defaultDiscount })
  pick.value = null
}
function addAllActive() {
  for (const p of products.value) if (p.status === 'active') addProduct(p.id)
}
const groups = computed(() => groupByFormPackaging(items.value, (i) => productMap.value.get(i.productId)))
/** إضافة كل المنتجات الفعّالة من نوع علاج/تغليف معيّن */
const bulk = reactive({ form: '', packaging: '' })
function addByCategory() {
  for (const p of products.value) {
    if (p.status !== 'active') continue
    if (bulk.form && formLabel(p.dosageForm) !== bulk.form) continue
    if (bulk.packaging && (p.packaging || 'none') !== bulk.packaging) continue
    addProduct(p.id)
  }
}
/** تطبيق خصم على مجموعة واحدة فقط */
function applyToGroup(g, discount) {
  if (discount === '' || discount == null) return
  for (const i of g.rows) i.companyDiscount = Number(discount)
}
const groupDiscount = reactive({})
function applyDefault() {
  for (const i of items.value) i.companyDiscount = meta.defaultDiscount
}
const rowErr = (i) => [...validateOriginalPrice(i.originalPrice), ...validateDiscount(i.companyDiscount)][0]
const hasErrors = computed(() => items.value.some(rowErr))

const ov = reactive({ distributorId: null, productId: 0, discount: '' })
function addOverride() {
  if (!ov.distributorId || validateDiscount(ov.discount).length) return
  const i = overrides.value.findIndex((o) => o.distributorId === ov.distributorId && o.productId === ov.productId)
  const rec = { distributorId: ov.distributorId, productId: ov.productId || 0, discount: Number(ov.discount) }
  if (i >= 0) overrides.value[i] = rec
  else overrides.value.push(rec)
  ov.discount = ''
}

const err = ref('')
const saving = ref(false)
async function save() {
  err.value = ''
  if (!items.value.length) return (err.value = 'أضف منتجاً واحداً على الأقل إلى القائمة')
  if (hasErrors.value) return (err.value = 'يوجد أخطاء في بعض الأسعار أو الخصومات')
  saving.value = true
  try {
    const id = await createBatch(meta, items.value, overrides.value, { updateProductPrices: updatePrices.value })
    toast('تم إنشاء قائمة الأسعار كإصدار مستقل')
    router.replace(`/batches/${id}`)
  } catch (e) { err.value = e.message } finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div><h1 class="page-title">قائمة أسعار / طلبية جديدة</h1><p class="page-sub">{{ copyFrom ? `مبنية على «${copyFrom.name}» — القائمة الأصلية لن تتغير` : 'إصدار مستقل من الأسعار والخصومات' }}</p></div>
      <div class="flex gap-2"><router-link to="/batches" class="btn-secondary">إلغاء</router-link><button class="btn-primary" :disabled="saving" @click="save"><Save class="w-4 h-4" />حفظ القائمة</button></div>
    </div>

    <div class="card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="sm:col-span-2"><label class="label">اسم القائمة *</label><input v-model="meta.name" class="input" placeholder="مثال: قائمة أسعار ديسمبر 2026" /></div>
      <div><label class="label">تاريخ القائمة *</label><input v-model="meta.date" type="date" class="input" /></div>
      <div><label class="label">المعمل</label><input v-model="meta.lab" class="input" /></div>
      <div><label class="label">النوع</label><select v-model="meta.type" class="input"><option v-for="(l, k) in BATCH_TYPES" :key="k" :value="k">{{ l }}</option></select></div>
      <div v-if="meta.type === 'order'"><label class="label">المذخر صاحب الطلبية</label><select v-model="meta.distributorId" class="input"><option :value="null">—</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select></div>
      <div><label class="label">خصم الشركة الافتراضي %</label><input v-model.number="meta.defaultDiscount" type="number" step="any" min="0" max="99.99" class="input ltr text-right" /></div>
      <div :class="meta.type === 'order' ? '' : 'lg:col-span-2'"><label class="label">ملاحظات</label><input v-model="meta.notes" class="input" /></div>
      <label class="sm:col-span-2 lg:col-span-4 inline-flex items-center gap-2 text-sm text-slate-600"><input v-model="updatePrices" type="checkbox" class="rounded border-slate-300" />تحديث «السعر الأصلي الحالي» في بطاقة المنتج بأسعار هذه القائمة (لا يؤثر على القوائم السابقة أو المتابعات)</label>
    </div>

    <div class="card">
      <div class="card-h flex-wrap">
        <div class="card-t">منتجات القائمة ({{ items.length }})</div>
        <div class="flex flex-wrap gap-2 items-center">
          <div class="w-64"><ComboBox v-model="pick" :options="addOptions" placeholder="إضافة منتج…" @update:model-value="(v) => v && addProduct(v)" /></div>
          <button class="btn-secondary btn-sm" @click="addAllActive"><ListPlus class="w-4 h-4" />إضافة كل المنتجات الفعّالة</button>
          <button class="btn-secondary btn-sm" :disabled="!items.length" @click="applyDefault"><Percent class="w-4 h-4" />تطبيق الخصم الافتراضي على الكل</button>
        </div>
      </div>
      <EmptyState v-if="!items.length" title="لم تُضف منتجات بعد" :text="products.length ? 'أضف المنتجات من القائمة أعلاه.' : 'لا توجد منتجات في النظام. أضفها أولاً أو استورد القائمة من Excel.'">
        <router-link v-if="!products.length" to="/products" class="btn-secondary">إدارة الأدوية</router-link>
        <router-link to="/import" class="btn-secondary">استيراد Excel</router-link>
      </EmptyState>
      <div v-if="products.length" class="px-4 py-2.5 flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60">
        <span class="text-xs text-slate-500 pb-2">إضافة حسب التصنيف:</span>
        <select v-model="bulk.form" class="input w-auto py-1.5 text-[13px]"><option value="">كل الأنواع</option><option v-for="f in DOSAGE_FORMS" :key="f">{{ f }}</option><option>غير محدد</option></select>
        <select v-model="bulk.packaging" class="input w-auto py-1.5 text-[13px]"><option value="">مغلف وبدون غلاف</option><option v-for="(l, k) in PACKAGING" :key="k" :value="k">{{ l }}</option><option value="none">تغليف غير محدد</option></select>
        <button class="btn-secondary btn-sm" @click="addByCategory"><ListPlus class="w-4 h-4" />إضافة</button>
      </div>
      <div v-if="items.length" class="overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>المنتج</th><th class="num w-40">السعر الأصلي</th><th class="num w-32">خصم الشركة %</th><th class="num">سعر شراء المذخر</th><th></th></tr></thead>
          <tbody v-for="g in groups" :key="g.key">
            <tr class="bg-slate-100/80 hover:bg-slate-100">
              <td colspan="5" class="!py-2">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-semibold text-slate-700">{{ g.form }}</span>
                  <span :class="['badge', g.packaging === 'wrapped' ? 'bg-blue-50 text-blue-700 ring-blue-200' : g.packaging === 'unwrapped' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-white text-slate-500 ring-slate-200']">{{ PACKAGING[g.packaging] || 'تغليف غير محدد' }}</span>
                  <span class="text-xs text-slate-500">{{ g.rows.length }} منتج</span>
                  <span class="mr-auto inline-flex items-center gap-1">
                    <input v-model="groupDiscount[g.key]" type="number" step="any" placeholder="خصم %" class="input py-1 w-24 ltr text-right text-[13px]" />
                    <button class="btn-ghost btn-sm" @click="applyToGroup(g, groupDiscount[g.key])"><Percent class="w-3.5 h-3.5" />تطبيق على المجموعة</button>
                  </span>
                </div>
              </td>
            </tr>
            <tr v-for="i in g.rows" :key="i.productId">
              <td class="font-medium pr-6">{{ displayName(productMap.get(i.productId)) }}<div v-if="rowErr(i)" class="text-xs text-red-600">{{ rowErr(i) }}</div></td>
              <td><input v-model.number="i.originalPrice" type="number" step="any" min="0.01" class="input ltr text-right py-1.5" /></td>
              <td><input v-model.number="i.companyDiscount" type="number" step="any" min="0" max="99.99" class="input ltr text-right py-1.5" /></td>
              <td class="num font-medium">{{ rowErr(i) ? '—' : fmtMoney(distributorPurchasePrice(i.originalPrice, i.companyDiscount)) }}</td>
              <td class="text-left"><button class="icon-btn hover:text-red-600" @click="items.splice(items.indexOf(i), 1)"><Trash2 class="w-4 h-4" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">خصومات خاصة بمذاخر معينة <span class="text-xs font-normal text-slate-500">(اختياري — إذا منحت الشركة مذخراً خصماً مختلفاً)</span></div></div>
      <div class="p-4 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div><label class="label">المذخر</label><select v-model="ov.distributorId" class="input"><option :value="null">اختر…</option><option v-for="d in distributors" :key="d.id" :value="d.id">{{ d.name }}</option></select></div>
          <div><label class="label">المنتج</label><select v-model="ov.productId" class="input"><option :value="0">كل منتجات القائمة</option><option v-for="i in items" :key="i.productId" :value="i.productId">{{ displayName(productMap.get(i.productId)) }}</option></select></div>
          <div><label class="label">الخصم %</label><input v-model="ov.discount" type="number" step="any" class="input ltr text-right" /></div>
          <button class="btn-secondary" @click="addOverride"><Plus class="w-4 h-4" />إضافة</button>
        </div>
        <table v-if="overrides.length" class="tbl">
          <thead><tr><th>المذخر</th><th>المنتج</th><th class="num">الخصم</th><th></th></tr></thead>
          <tbody><tr v-for="(o, idx) in overrides" :key="idx">
            <td>{{ distributors.find((d) => d.id === o.distributorId)?.name }}</td>
            <td>{{ o.productId ? displayName(productMap.get(o.productId)) : 'كل المنتجات' }}</td>
            <td class="num">{{ o.discount }}%</td>
            <td class="text-left"><button class="icon-btn hover:text-red-600" @click="overrides.splice(idx, 1)"><Trash2 class="w-4 h-4" /></button></td>
          </tr></tbody>
        </table>
      </div>
    </div>
    <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
    <div class="flex justify-end"><button class="btn-primary" :disabled="saving" @click="save"><Save class="w-4 h-4" />حفظ القائمة</button></div>
  </div>
</template>
