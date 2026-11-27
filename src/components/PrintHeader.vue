<script setup>
import { todayISO } from '../lib/format.js'
import { useStore } from '../composables/store.js'
defineProps({ title: String, subtitle: String })
const { settings } = useStore()
</script>

<template>
  <div class="print-only mb-4 border-b-2 border-slate-800 pb-3">
    <div class="flex justify-between items-end">
      <div>
        <div class="text-lg font-bold">{{ title }}</div>
        <div v-if="subtitle" class="text-sm text-slate-600">{{ subtitle }}</div>
      </div>
      <div class="text-xs text-slate-500 text-left">
        <div>Pharma Discount Monitor — نظام مراقبة الأسعار وانعكاس الخصومات</div>
        <div>تاريخ الطباعة: {{ todayISO() }} — {{ settings.currentUser }}</div>
      </div>
    </div>
    <div class="text-[11px] text-slate-500 mt-1">جميع النسب نقاط مئوية من السعر الأصلي: خصم الشركة − الخصم المعكوس = الخصم المتبقي.</div>
  </div>
</template>
