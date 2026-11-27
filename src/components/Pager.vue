<script setup>
defineProps({ table: Object })
</script>

<template>
  <div v-if="table.pages.value > 1" class="flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-slate-500 no-print">
    <span>{{ table.filtered.value.length }} سجل</span>
    <div class="flex items-center gap-1">
      <button class="btn-ghost btn-sm" :disabled="table.page.value <= 1" @click="table.page.value--">السابق</button>
      <span class="tabular-nums px-2">{{ table.page.value }} / {{ table.pages.value }}</span>
      <button class="btn-ghost btn-sm" :disabled="table.page.value >= table.pages.value" @click="table.page.value++">التالي</button>
    </div>
  </div>
</template>
