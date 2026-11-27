<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown, X } from 'lucide-vue-next'
const props = defineProps({ modelValue: [Number, String, null], options: { type: Array, default: () => [] }, placeholder: { type: String, default: 'اختر…' }, disabled: Boolean })
const emit = defineEmits(['update:modelValue'])
const open = ref(false)
const q = ref('')
const active = ref(0)
const selected = computed(() => props.options.find((o) => o.value === props.modelValue))
const list = computed(() => {
  const t = q.value.trim().toLowerCase()
  const l = t ? props.options.filter((o) => (o.label + ' ' + (o.sub || '')).toLowerCase().includes(t)) : props.options
  return l.slice(0, 80)
})
watch(q, () => (active.value = 0))
function pick(o) { emit('update:modelValue', o.value); open.value = false; q.value = '' }
function onKey(e) {
  if (e.key === 'ArrowDown') { active.value = Math.min(list.value.length - 1, active.value + 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { active.value = Math.max(0, active.value - 1); e.preventDefault() }
  else if (e.key === 'Enter' && list.value[active.value]) { pick(list.value[active.value]); e.preventDefault() }
  else if (e.key === 'Escape') open.value = false
}
</script>

<template>
  <div class="relative" @focusout="(e) => !e.currentTarget.contains(e.relatedTarget) && (open = false)">
    <div class="relative">
      <input
        class="input pl-14"
        :disabled="disabled"
        :placeholder="selected ? '' : placeholder"
        :value="open ? q : selected?.label || ''"
        @focus="open = true"
        @input="(e) => { q = e.target.value; open = true }"
        @keydown="onKey"
      />
      <div class="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-slate-400">
        <button v-if="selected && !disabled" type="button" class="p-1 hover:text-slate-700" @mousedown.prevent="emit('update:modelValue', null)"><X class="w-3.5 h-3.5" /></button>
        <ChevronDown class="w-4 h-4" />
      </div>
    </div>
    <ul v-if="open && !disabled" tabindex="-1" class="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
      <li v-for="(o, i) in list" :key="o.value" :class="['px-3 py-2 cursor-pointer text-sm', i === active ? 'bg-brand-50' : 'hover:bg-slate-50', o.value === modelValue && 'font-semibold text-brand-700']" @mousedown.prevent="pick(o)" @mouseenter="active = i">
        <div>{{ o.label }}</div>
        <div v-if="o.sub" class="text-xs text-slate-400">{{ o.sub }}</div>
      </li>
      <li v-if="!list.length" class="px-3 py-3 text-sm text-slate-400 text-center">لا توجد نتائج</li>
    </ul>
  </div>
</template>
