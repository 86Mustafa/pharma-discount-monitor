<script setup>
import { AlertTriangle } from 'lucide-vue-next'
import { TONES } from '../lib/format.js'
defineProps({ category: Object })
</script>

<template>
  <span v-if="category" :class="['badge', TONES[category.tone] || TONES.slate]" :title="category.note || category.label">
    <AlertTriangle v-if="category.tone === 'red'" class="w-3 h-3" />{{ category.label }}
  </span>
  <span v-else class="text-slate-400">—</span>
</template>
