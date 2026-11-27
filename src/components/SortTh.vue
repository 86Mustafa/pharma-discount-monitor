<script setup>
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-vue-next'
const props = defineProps({ k: String, table: Object, num: Boolean })
</script>

<template>
  <th :class="['cursor-pointer select-none hover:text-slate-800', num && 'num']" @click="table.sortBy(k)">
    <span class="inline-flex items-center gap-1">
      <slot />
      <ChevronUp v-if="table.sortKey.value === k && table.sortDir.value === 'asc'" class="w-3.5 h-3.5" />
      <ChevronDown v-else-if="table.sortKey.value === k" class="w-3.5 h-3.5" />
      <ChevronsUpDown v-else class="w-3.5 h-3.5 opacity-30" />
    </span>
  </th>
</template>
