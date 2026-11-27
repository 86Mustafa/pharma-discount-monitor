<script setup>
import { Inbox } from 'lucide-vue-next'
defineProps({ title: { type: String, default: 'لا توجد بيانات' }, text: String, icon: [Object, Function] })
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-12 px-6">
    <div class="rounded-full bg-slate-100 p-3 text-slate-400 mb-3"><component :is="icon || Inbox" class="w-7 h-7" /></div>
    <div class="font-semibold text-slate-700">{{ title }}</div>
    <p v-if="text" class="text-sm text-slate-500 mt-1 max-w-md leading-6">{{ text }}</p>
    <div v-if="$slots.default" class="mt-4 flex flex-wrap gap-2 justify-center"><slot /></div>
  </div>
</template>
