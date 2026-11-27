<script setup>
import { onMounted, onBeforeUnmount, watch } from 'vue'
import { X } from 'lucide-vue-next'
const props = defineProps({ open: Boolean, title: String, size: { type: String, default: 'md' } })
const emit = defineEmits(['close'])
const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }
const onKey = (e) => { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' })
watch(() => props.open, (o) => (document.body.style.overflow = o ? 'hidden' : ''))
</script>

<template>
  <Teleport to="body">
    <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition duration-150" leave-active-class="transition duration-100">
      <div v-if="open" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-0 sm:p-4" @mousedown.self="emit('close')">
        <div :class="['w-full bg-white sm:rounded-xl rounded-t-2xl shadow-xl flex flex-col max-h-[92vh]', sizes[size]]" role="dialog" aria-modal="true">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 class="text-base font-semibold text-slate-900">{{ title }}</h3>
            <button class="icon-btn" @click="emit('close')" aria-label="إغلاق"><X class="w-5 h-5" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto"><slot /></div>
          <div v-if="$slots.footer" class="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60 sm:rounded-b-xl">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
