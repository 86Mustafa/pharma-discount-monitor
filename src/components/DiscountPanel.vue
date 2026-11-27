<script setup>
import { computed } from 'vue'
import { AlertTriangle, Equal, Minus } from 'lucide-vue-next'
import { fmtMoney, fmtPct } from '../lib/format.js'
import { describe } from '../lib/calc.js'
import ClassBadge from './ClassBadge.vue'

const props = defineProps({ result: Object, category: Object, currency: { type: String, default: 'دينار' }, decimals: { type: Number, default: 2 } })
const r = computed(() => props.result)
const scale = computed(() => Math.max(r.value?.companyDiscount || 0, r.value?.pharmacyDiscountPct || 0, 1))
const reflW = computed(() => Math.max(0, Math.min(r.value.pharmacyDiscountPct, r.value.companyDiscount)) / scale.value * 100)
const remW = computed(() => Math.max(0, r.value.remainingDiscountPct) / scale.value * 100)
const excW = computed(() => (r.value.exceedPoints || 0) / scale.value * 100)
</script>

<template>
  <div v-if="r && r.valid" class="space-y-4">
    <!-- القاعدة الجوهرية -->
    <div v-if="r.hasSelling" class="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div class="flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-center">
        <div class="px-3"><div class="text-xs text-slate-500">خصم الشركة</div><div class="text-2xl font-bold text-[#1b64be] tabular-nums">{{ fmtPct(r.companyDiscount, decimals) }}</div></div>
        <Minus class="w-5 h-5 text-slate-400" />
        <div class="px-3"><div class="text-xs text-slate-500">الخصم المعكوس للصيدلية</div><div class="text-2xl font-bold text-[#c2531c] tabular-nums">{{ fmtPct(r.pharmacyDiscountPct, decimals) }}</div></div>
        <Equal class="w-5 h-5 text-slate-400" />
        <div class="px-3"><div class="text-xs text-slate-500">الخصم المتبقي للمذخر</div><div :class="['text-2xl font-bold tabular-nums', r.remainingDiscountPct < 0 ? 'text-red-600' : 'text-[#007a62]']">{{ fmtPct(r.remainingDiscountPct, decimals) }}</div></div>
      </div>
      <!-- شريط بصري للنقاط -->
      <div class="mt-4">
        <div class="flex h-3 w-full overflow-hidden rounded-full bg-slate-200 gap-[2px]" dir="rtl">
          <div class="bg-[#f47230]" :style="{ width: reflW + '%' }" title="الخصم المعكوس"></div>
          <div v-if="remW" class="bg-[#00b894]" :style="{ width: remW + '%' }" title="المتبقي"></div>
          <div v-if="excW" class="bg-[repeating-linear-gradient(45deg,#ec4647_0_4px,#fecaca_4px_8px)]" :style="{ width: excW + '%' }" title="تجاوز خصم الشركة"></div>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
          <span class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-[#f47230]"></i>معكوس للصيدلية</span>
          <span class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-[#00b894]"></i>متبقٍ للمذخر</span>
          <span v-if="excW" class="inline-flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-[#ec4647]"></i>تجاوز خصم الشركة</span>
        </div>
      </div>
    </div>

    <div v-if="r.hasSelling && (r.exceedsCompany || r.aboveOriginal)" class="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 leading-6">
      <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <div class="font-semibold">تنبيه للتحقق</div>
        <div v-if="r.exceedsCompany">الخصم المعكوس للصيدلية أكبر من خصم الشركة بمقدار <b class="tabular-nums">{{ fmtMoney(r.exceedPoints, decimals) }}</b> نقطة مئوية. هذا تنبيه للتحقق فقط ولا يمثل حكماً على المذخر.</div>
        <div v-else>سعر البيع أعلى من السعر الأصلي — يُنصح بالتحقق من المعلومة.</div>
      </div>
    </div>

    <dl class="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-sm">
      <div class="bg-white p-3"><dt class="text-xs text-slate-500">السعر الأصلي</dt><dd class="font-semibold tabular-nums mt-0.5">{{ fmtMoney(r.originalPrice) }} <span class="text-xs text-slate-400">{{ currency }}</span></dd></div>
      <div class="bg-white p-3"><dt class="text-xs text-slate-500">خصم الشركة</dt><dd class="font-semibold tabular-nums mt-0.5">{{ fmtPct(r.companyDiscount, decimals) }}</dd></div>
      <div class="bg-white p-3"><dt class="text-xs text-slate-500">سعر شراء المذخر</dt><dd class="font-semibold tabular-nums mt-0.5">{{ fmtMoney(r.purchasePrice) }} <span class="text-xs text-slate-400">{{ currency }}</span></dd></div>
      <div class="bg-white p-3"><dt class="text-xs text-slate-500">سعر البيع للصيدلية</dt><dd class="font-semibold tabular-nums mt-0.5">{{ r.hasSelling ? fmtMoney(r.sellingPrice) : '—' }} <span v-if="r.hasSelling" class="text-xs text-slate-400">{{ currency }}</span></dd></div>
      <template v-if="r.hasSelling">
        <div class="bg-white p-3"><dt class="text-xs text-slate-500">الخصم المعكوس %</dt><dd class="font-semibold tabular-nums mt-0.5">{{ fmtPct(r.pharmacyDiscountPct, decimals) }}</dd></div>
        <div class="bg-white p-3"><dt class="text-xs text-slate-500">الخصم المتبقي %</dt><dd :class="['font-semibold tabular-nums mt-0.5', r.remainingDiscountPct < 0 && 'text-red-600']">{{ fmtPct(r.remainingDiscountPct, decimals) }}</dd></div>
        <div class="bg-white p-3"><dt class="text-xs text-slate-500">قيمة الخصم المعكوس</dt><dd class="font-semibold tabular-nums mt-0.5">{{ fmtMoney(r.pharmacyDiscountAmount) }} <span class="text-xs text-slate-400">{{ currency }}</span></dd></div>
        <div class="bg-white p-3"><dt class="text-xs text-slate-500">قيمة الخصم المتبقي</dt><dd :class="['font-semibold tabular-nums mt-0.5', r.remainingDiscountAmount < 0 && 'text-red-600']">{{ fmtMoney(r.remainingDiscountAmount) }} <span class="text-xs text-slate-400">{{ currency }}</span></dd></div>
      </template>
    </dl>

    <div v-if="r.hasSelling" class="flex flex-wrap items-center gap-2 text-sm text-slate-600 leading-6">
      <ClassBadge :category="category" />
      <span>{{ describe(r) }}</span>
    </div>
  </div>
  <div v-else-if="r && r.errors?.length" class="text-sm text-red-600">{{ r.errors[0] }}</div>
</template>
