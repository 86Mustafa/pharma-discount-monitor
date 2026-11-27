<script setup>
import { computed, reactive, ref } from 'vue'
import { Save, Plus, Trash2, Download, Upload, FlaskConical, RotateCcw, AlertOctagon } from 'lucide-vue-next'
import ClassBadge from '../components/ClassBadge.vue'
import { useStore } from '../composables/store.js'
import { toast, toastError, confirm } from '../composables/ui.js'
import { setSetting, DEFAULT_SETTINGS } from '../db/repo.js'
import { DEFAULT_CLASSIFICATION, classify, computeDiscount } from '../lib/calc.js'
import { exportBackup, restoreBackup, validateBackup, wipeAll } from '../lib/backup.js'
import { loadDemo, removeDemo } from '../lib/demo.js'
import { fmtDateTime, TONES } from '../lib/format.js'

const store = useStore()
const s = store.settings
const clone = (o) => JSON.parse(JSON.stringify(o))

const general = reactive({ currentUser: s.value.currentUser, currency: s.value.currency, pctDecimals: s.value.pctDecimals })
async function saveGeneral() {
  for (const [k, v] of Object.entries(general)) await setSetting(k, v)
  toast('تم حفظ الإعدادات العامة')
}

const cls = ref(clone(s.value.classification))
const TONE_LABELS = { amber: 'كهرماني', slate: 'رمادي', blue: 'أزرق', teal: 'فيروزي', green: 'أخضر', violet: 'بنفسجي', red: 'أحمر' }
function addCat() { cls.value.categories.push({ id: 'c' + Date.now(), label: 'فئة جديدة', min: 0, max: null, tone: 'slate' }) }
async function saveCls() {
  for (const c of cls.value.categories) {
    if (!c.label?.trim()) return toastError(new Error('اسم الفئة مطلوب'))
    if (c.max !== null && c.max !== '' && Number(c.max) <= Number(c.min)) return toastError(new Error(`الحد الأعلى يجب أن يكون أكبر من الأدنى في «${c.label}»`))
    if (c.max === '') c.max = null
  }
  await setSetting('classification', cls.value)
  toast('تم حفظ فئات المؤشرات الذكية')
}
function resetCls() { cls.value = clone(DEFAULT_CLASSIFICATION) }
const preview = computed(() => [9700, 9300, 8900, 8200, 7900, 7500].map((sp) => {
  const r = computeDiscount({ originalPrice: 10000, companyDiscount: 21, sellingPrice: sp })
  return { sp, r, c: classify(r, cls.value) }
}))

const th = reactive(clone(s.value.thresholds))
async function saveTh() { await setSetting('thresholds', { ...th }); toast('تم حفظ عتبات لوحة التحكم') }

/* النسخ الاحتياطي */
const restoreInfo = ref(null)
let restoreData = null
async function doBackup() { try { await exportBackup(); toast('تم تنزيل النسخة الاحتياطية') } catch (e) { toastError(e) } }
async function pickRestore(file) {
  if (!file) return
  try {
    restoreData = JSON.parse(await file.text())
    restoreInfo.value = validateBackup(restoreData)
  } catch (e) { restoreInfo.value = null; toastError(e.message?.includes('JSON') ? new Error('الملف ليس JSON صالحاً') : e) }
}
async function doRestore() {
  const i = restoreInfo.value
  const ok = await confirm({ title: 'استعادة نسخة احتياطية', danger: true, confirmText: 'استعادة',
    message: `سيتم استبدال جميع البيانات الحالية بمحتوى النسخة:\n${i.products} منتج، ${i.distributors} مذخر، ${i.priceBatches} قائمة، ${i.priceMonitoring} متابعة.\nسيتم تنزيل نسخة أمان من بياناتك الحالية تلقائياً قبل الاستعادة.` })
  if (!ok) return
  try { await restoreBackup(restoreData); restoreInfo.value = null; toast('تمت الاستعادة بنجاح') } catch (e) { toastError(e) }
}

/* البيانات التجريبية */
const busy = ref(false)
async function toggleDemo(v) { await setSetting('showDemo', v) }
async function doLoadDemo() {
  busy.value = true
  try { await loadDemo(); await setSetting('showDemo', true); toast('تم تحميل البيانات التجريبية') } catch (e) { toastError(e) } finally { busy.value = false }
}
async function doRemoveDemo() {
  if (!(await confirm({ title: 'حذف البيانات التجريبية', message: 'سيتم حذف جميع السجلات المعلّمة كتجريبية فقط. بياناتك الحقيقية لن تتأثر.', confirmText: 'حذف', danger: true }))) return
  await removeDemo()
  toast('تم حذف البيانات التجريبية')
}
async function doWipe() {
  if (!(await confirm({ title: 'حذف جميع البيانات', message: 'سيتم حذف كل المنتجات والمذاخر والقوائم والمتابعات نهائياً من هذا المتصفح.\nسيتم تنزيل نسخة احتياطية أولاً.', confirmText: 'متابعة', danger: true }))) return
  if (!(await confirm({ title: 'تأكيد نهائي', message: 'هل أنت متأكد تماماً؟ لا يمكن التراجع إلا من النسخة الاحتياطية.', confirmText: 'حذف الكل', danger: true }))) return
  await exportBackup('نسخة-قبل-الحذف-الكامل')
  await wipeAll()
  toast('تم حذف جميع البيانات')
}
</script>

<template>
  <div class="space-y-4 max-w-5xl">
    <div><h1 class="page-title">الإعدادات والنسخ الاحتياطي</h1></div>

    <div class="card">
      <div class="card-h"><div class="card-t">إعدادات عامة</div><button class="btn-primary btn-sm" @click="saveGeneral"><Save class="w-4 h-4" />حفظ</button></div>
      <div class="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label class="label">اسم المستخدم (يُسجَّل مع كل متابعة)</label><input v-model="general.currentUser" class="input" /></div>
        <div><label class="label">العملة</label><input v-model="general.currency" class="input" /></div>
        <div><label class="label">المنازل العشرية للنسب</label><select v-model.number="general.pctDecimals" class="input"><option :value="0">0</option><option :value="1">1</option><option :value="2">2</option><option :value="3">3</option><option :value="4">4</option></select></div>
      </div>
    </div>

    <div class="card">
      <div class="card-h flex-wrap"><div class="card-t">المؤشرات الذكية (فئات قابلة للتعديل)</div>
        <div class="flex gap-2"><button class="btn-ghost btn-sm" @click="resetCls"><RotateCcw class="w-4 h-4" />الافتراضي</button><button class="btn-primary btn-sm" @click="saveCls"><Save class="w-4 h-4" />حفظ</button></div></div>
      <div class="p-4 space-y-4">
        <p class="text-sm text-slate-600 leading-6">تعتمد الفئات على <b>الفرق بالنقاط المئوية</b> من السعر الأصلي، وليس على النسبة النسبية من خصم الشركة. الحد الأدنى مشمول والأعلى غير مشمول؛ اترك الأعلى فارغاً لـ «فأكثر».</p>
        <div class="max-w-xs"><label class="label">أساس التصنيف</label>
          <select v-model="cls.basis" class="input"><option value="reflected">الخصم المعكوس للصيدلية (نقاط)</option><option value="remaining">الخصم المتبقي للمذخر (نقاط)</option></select></div>
        <div class="overflow-x-auto">
          <table class="tbl">
            <thead><tr><th>اسم الفئة</th><th class="w-28">من (نقطة)</th><th class="w-28">إلى (نقطة)</th><th class="w-32">اللون</th><th></th></tr></thead>
            <tbody><tr v-for="(c, i) in cls.categories" :key="c.id">
              <td><input v-model="c.label" class="input py-1.5" /></td>
              <td><input v-model.number="c.min" type="number" step="any" class="input py-1.5 ltr text-right" /></td>
              <td><input v-model.number="c.max" type="number" step="any" class="input py-1.5 ltr text-right" placeholder="∞" /></td>
              <td><select v-model="c.tone" class="input py-1.5"><option v-for="(l, k) in TONE_LABELS" :key="k" :value="k">{{ l }}</option></select></td>
              <td class="text-left"><button class="icon-btn hover:text-red-600" @click="cls.categories.splice(i, 1)"><Trash2 class="w-4 h-4" /></button></td>
            </tr></tbody>
          </table>
        </div>
        <button class="btn-secondary btn-sm" @click="addCat"><Plus class="w-4 h-4" />إضافة فئة</button>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><label class="label">عند عكس كامل الخصم</label><input v-model="cls.fullLabel" class="input" /></div>
          <div><label class="label">عند تجاوز خصم الشركة</label><input v-model="cls.exceedLabel" class="input" /></div>
          <div><label class="label">عند البيع بأعلى من الأصلي</label><input v-model="cls.aboveOriginalLabel" class="input" /></div>
        </div>
        <div class="rounded-lg border border-slate-200">
          <div class="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100">معاينة: سعر أصلي 10,000 وخصم شركة 21%</div>
          <div class="divide-y divide-slate-100">
            <div v-for="p in preview" :key="p.sp" class="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span class="tabular-nums w-20">{{ p.sp.toLocaleString('en-US') }}</span>
              <span class="tabular-nums text-slate-500 w-40">معكوس {{ p.r.pharmacyDiscountPct }}% · متبقٍ {{ p.r.remainingDiscountPct }}%</span>
              <ClassBadge :category="p.c" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">عتبات مؤشرات لوحة التحكم (نقاط مئوية)</div><button class="btn-primary btn-sm" @click="saveTh"><Save class="w-4 h-4" />حفظ</button></div>
      <div class="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label class="label">«عكس معظم الخصم» إذا كان متوسط المتبقي ≤</label><input v-model.number="th.mostlyReflectedRemainingMax" type="number" step="any" class="input ltr text-right" /></div>
        <div><label class="label">«احتفظ بمعظم الخصم» إذا كان متوسط المعكوس ≤</label><input v-model.number="th.mostlyRetainedReflectedMax" type="number" step="any" class="input ltr text-right" /></div>
        <div><label class="label">«فرق كبير بين المذاخر» إذا تجاوز مدى المعكوس</label><input v-model.number="th.largeSpreadPoints" type="number" step="any" class="input ltr text-right" /></div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t">النسخ الاحتياطي والاستعادة</div></div>
      <div class="p-4 space-y-3">
        <p class="text-sm text-slate-600">تُحفظ البيانات في IndexedDB داخل هذا المتصفح. أنشئ نسخة JSON بانتظام واحفظها في مكان آمن. آخر نسخة: <b>{{ s.lastBackupAt ? fmtDateTime(s.lastBackupAt) : 'لا يوجد' }}</b></p>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary" @click="doBackup"><Download class="w-4 h-4" />تنزيل نسخة احتياطية JSON</button>
          <label class="btn-secondary cursor-pointer"><Upload class="w-4 h-4" />اختيار ملف للاستعادة<input type="file" accept=".json,application/json" class="hidden" @change="pickRestore($event.target.files[0]); $event.target.value = ''" /></label>
        </div>
        <div v-if="restoreInfo" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span>نسخة بتاريخ {{ fmtDateTime(restoreInfo.exportedAt) }}: {{ restoreInfo.products }} منتج، {{ restoreInfo.distributors }} مذخر، {{ restoreInfo.priceBatches }} قائمة، {{ restoreInfo.priceMonitoring }} متابعة.</span>
          <button class="btn-danger btn-sm" @click="doRestore">استعادة واستبدال البيانات الحالية</button>
          <button class="btn-ghost btn-sm" @click="restoreInfo = null">إلغاء</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><div class="card-t inline-flex items-center gap-2"><FlaskConical class="w-4 h-4 text-violet-600" />البيانات التجريبية</div></div>
      <div class="p-4 space-y-3">
        <p class="text-sm text-slate-600 leading-6">بيانات وهمية بالكامل (13 منتجاً بأنواع علاج وتغليف مختلفة، 6 مذاخر، 3 قوائم أسعار، ومتابعات تشمل المثال الاختباري 10,000 / 21% / 8,900). كل سجل معلَّم كتجريبي ويمكن إخفاؤه أو حذفه دون التأثير على بياناتك.</p>
        <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" :checked="s.showDemo" class="rounded border-slate-300" @change="toggleDemo($event.target.checked)" />إظهار البيانات التجريبية في التطبيق</label>
        <div class="flex flex-wrap gap-2">
          <button class="btn-secondary" :disabled="busy || store.hasDemo.value" @click="doLoadDemo"><FlaskConical class="w-4 h-4" />{{ busy ? 'جارٍ التحميل…' : 'تحميل البيانات التجريبية' }}</button>
          <button class="btn-secondary text-red-600" :disabled="!store.hasDemo.value" @click="doRemoveDemo"><Trash2 class="w-4 h-4" />حذف البيانات التجريبية</button>
        </div>
      </div>
    </div>

    <div class="card border-red-200">
      <div class="card-h"><div class="card-t inline-flex items-center gap-2 text-red-700"><AlertOctagon class="w-4 h-4" />منطقة الخطر</div></div>
      <div class="p-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-slate-600">حذف جميع البيانات من هذا المتصفح (تُنزَّل نسخة احتياطية تلقائياً قبل الحذف).</p>
        <button class="btn-danger" @click="doWipe"><Trash2 class="w-4 h-4" />حذف جميع البيانات</button>
      </div>
    </div>
  </div>
</template>
