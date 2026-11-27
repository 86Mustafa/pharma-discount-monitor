<script setup>
defineProps({ label: String, value: [String, Number], hint: String, icon: [Object, Function], tone: { type: String, default: 'brand' }, to: [String, Object] })
const tones = { brand: 'bg-brand-50 text-brand-600', orange: 'bg-orange-50 text-orange-600', teal: 'bg-teal-50 text-teal-600', slate: 'bg-slate-100 text-slate-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600' }
</script>

<template>
  <component :is="to ? 'router-link' : 'div'" :to="to" class="card p-4 flex items-start gap-3 hover:border-slate-300 transition">
    <div v-if="icon" :class="['rounded-lg p-2 shrink-0', tones[tone]]"><component :is="icon" class="w-5 h-5" /></div>
    <div class="min-w-0">
      <div class="text-[13px] text-slate-500 leading-5">{{ label }}</div>
      <div class="text-2xl font-bold text-slate-900 tabular-nums mt-0.5 ltr text-right">{{ value }}</div>
      <div v-if="hint" class="text-xs text-slate-400 mt-0.5 leading-5">{{ hint }}</div>
    </div>
  </component>
</template>
