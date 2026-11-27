<script setup>
import { computed, reactive } from 'vue'
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-vue-next'
import DiscountPanel from '../components/DiscountPanel.vue'
import { useStore } from '../composables/store.js'
import { computeDiscount, classify } from '../lib/calc.js'
import { fmtMoney, fmtPct } from '../lib/format.js'

const { settings } = useStore()
const EXAMPLE = { originalPrice: 10000, companyDiscount: 21, sellingPrice: 8900 }
const f = reactive({ ...EXAMPLE })
const result = computed(() => computeDiscount(f))
const category = computed(() => classify(result.value, settings.value.classification))

/** حالات القسم 19 — تُتحقق مباشرة داخل المتصفح */
const CASES = [
  { n: 1, op: 10000, cd: 21, sp: 8900, refl: 11, rem: 10 },
  { n: 2, op: 10000, cd: 24, sp: 8500, refl: 15, rem: 9 },
  { n: 3, op: 10000, cd: 17, sp: 9500, refl: 5, rem: 12 },
  { n: 4, op: 10000, cd: 21, sp: 7900, refl: 21, rem: 0 },
  { n: 5, op: 10000, cd: 21, sp: 7500, refl: 25, rem: -4, alert: true },
]
const checks = computed(() => CASES.map((c) => {
  const r = computeDiscount({ originalPrice: c.op, companyDiscount: c.cd, sellingPrice: c.sp })
  const pass = r.companyDiscount === c.cd && r.pharmacyDiscountPct === c.refl && r.remainingDiscountPct === c.rem && (!c.alert || (r.exceedsCompany && r.exceedPoints === 4))
  return { ...c, r, pass }
}))
const exampleRows = computed(() => {
  const r = computeDiscount(EXAMPLE)
  return [
    ['السعر الأصلي', fmtMoney(r.originalPrice), '10,000'],
    ['خصم الشركة', fmtPct(r.companyDiscount), '21%'],
    ['سعر شراء المذخر', fmtMoney(r.purchasePrice), '7,900'],
    ['سعر البيع للصيدلية', fmtMoney(r.sellingPrice), '8,900'],
    ['الخصم المعكوس', fmtPct(r.pharmacyDiscountPct), '11%'],
    ['الخصم المتبقي', fmtPct(r.remainingDiscountPct), '10%'],
    ['قيمة الخصم المعكوس', fmtMoney(r.pharmacyDiscountAmount), '1,100'],
    ['قيمة الخصم المتبقي', fmtMoney(r.remainingDiscountAmount), '1,000'],
  ].map(([l, got, exp]) => ({ l, got, exp, ok: got === exp }))
})
</script>

<template>
  <div class="space-y-4">
    <div><h1 class="page-title">حاسبة الخصم</h1><p class="page-sub">حساب سريع دون حفظ، مع التحقق الحي من المعادلات الأساسية</p></div>

    <div class="grid grid-cols-1 xl:grid-cols-5 gap-4">
      <div class="card xl:col-span-2 p-4 space-y-3">
        <div><label class="label">السعر الأصلي ({{ settings.currency }})</label><input v-model="f.originalPrice" type="number" step="any" class="input ltr text-right text-lg" /></div>
        <div><label class="label">خصم الشركة للمذخر %</label><input v-model="f.companyDiscount" type="number" step="any" class="input ltr text-right text-lg" /></div>
        <div><label class="label">سعر بيع المذخر للصيدلية</label><input v-model="f.sellingPrice" type="number" step="any" class="input ltr text-right text-lg" /></div>
        <button class="btn-ghost btn-sm" @click="Object.assign(f, EXAMPLE)"><RotateCcw class="w-4 h-4" />إعادة المثال الاختباري</button>
        <div class="rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-600 ltr text-left font-mono">
          Purchase = Original × (1 − Company%/100)<br />
          Reflected% = (Original − Selling) / Original × 100<br />
          Remaining% = Company% − Reflected%<br />
          ReflectedAmt = Original − Selling<br />
          RemainingAmt = Original × Company%/100 − ReflectedAmt
        </div>
      </div>
      <div class="card xl:col-span-3 p-4"><DiscountPanel :result="result" :category="category" :currency="settings.currency" :decimals="settings.pctDecimals" /></div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="card">
        <div class="card-h"><div class="card-t">المثال الاختباري الأساسي</div><span class="badge bg-teal-50 text-teal-700 ring-teal-200">{{ exampleRows.every((r) => r.ok) ? 'مطابق' : 'غير مطابق' }}</span></div>
        <table class="tbl"><thead><tr><th>البيان</th><th class="num">النتيجة المحسوبة</th><th class="num">المتوقع</th><th></th></tr></thead>
          <tbody><tr v-for="r in exampleRows" :key="r.l"><td>{{ r.l }}</td><td class="num font-semibold">{{ r.got }}</td><td class="num text-slate-500">{{ r.exp }}</td><td><CheckCircle2 v-if="r.ok" class="w-4 h-4 text-teal-600" /><XCircle v-else class="w-4 h-4 text-red-600" /></td></tr></tbody></table>
      </div>
      <div class="card">
        <div class="card-h"><div class="card-t">اختبارات الحسابات</div><span class="badge bg-teal-50 text-teal-700 ring-teal-200">{{ checks.filter((c) => c.pass).length }} / {{ checks.length }} ناجح</span></div>
        <table class="tbl"><thead><tr><th>#</th><th class="num">خصم الشركة</th><th class="num">سعر البيع</th><th class="num">المعكوس</th><th class="num">المتبقي</th><th></th></tr></thead>
          <tbody><tr v-for="c in checks" :key="c.n">
            <td>{{ c.n }}</td><td class="num">{{ fmtPct(c.r.companyDiscount) }}</td><td class="num">{{ fmtMoney(c.sp) }}</td>
            <td class="num">{{ fmtPct(c.r.pharmacyDiscountPct) }}</td><td :class="['num font-semibold', c.r.remainingDiscountPct < 0 && 'text-red-600']">{{ fmtPct(c.r.remainingDiscountPct) }}</td>
            <td class="whitespace-nowrap"><CheckCircle2 v-if="c.pass" class="w-4 h-4 text-teal-600 inline" /><XCircle v-else class="w-4 h-4 text-red-600 inline" /><span v-if="c.alert" class="text-xs text-red-600 mr-1">تنبيه: +{{ c.r.exceedPoints }} نقاط</span></td>
          </tr></tbody></table>
        <p class="px-4 py-3 text-xs text-slate-500">نسبة الخصم المعكوس هي نقاط مئوية من السعر الأصلي، وليست نسبة من خصم الشركة (لا يُعرض 52.38%).</p>
      </div>
    </div>
  </div>
</template>
