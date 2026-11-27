<script setup>
import { Search } from 'lucide-vue-next'
defineProps({ modelValue: String, placeholder: { type: String, default: 'بحث…' } })
defineEmits(['update:modelValue'])
</script>

<template>
  <div class="relative">
    <Search class="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3 pointer-events-none" />
    <input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" :placeholder="placeholder" class="input pr-9" type="search" />
  </div>
</template>
