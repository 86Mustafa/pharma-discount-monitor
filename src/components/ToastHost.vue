<script setup>
import { CheckCircle2, XCircle, Info } from 'lucide-vue-next'
import { toasts } from '../composables/ui.js'
const style = { success: 'border-green-200 text-green-800', error: 'border-red-200 text-red-700', info: 'border-brand-200 text-brand-800' }
</script>

<template>
  <div class="fixed z-[60] bottom-4 left-4 right-4 sm:right-auto sm:w-96 flex flex-col gap-2 no-print" aria-live="polite">
    <TransitionGroup enter-from-class="opacity-0 translate-y-2" leave-to-class="opacity-0" enter-active-class="transition" leave-active-class="transition">
      <div v-for="t in toasts" :key="t.id" :class="['flex items-start gap-2.5 rounded-xl border bg-white px-4 py-3 shadow-lg text-sm', style[t.type]]">
        <CheckCircle2 v-if="t.type === 'success'" class="w-5 h-5 shrink-0" />
        <XCircle v-else-if="t.type === 'error'" class="w-5 h-5 shrink-0" />
        <Info v-else class="w-5 h-5 shrink-0" />
        <span class="leading-6">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
