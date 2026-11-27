<script setup>
import { AlertTriangle, HelpCircle } from 'lucide-vue-next'
import Modal from './Modal.vue'
import { confirmState, closeConfirm } from '../composables/ui.js'
</script>

<template>
  <Modal :open="confirmState.open" :title="confirmState.title" size="sm" @close="closeConfirm(false)">
    <div class="flex gap-3">
      <div :class="['shrink-0 rounded-full p-2 h-fit', confirmState.danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600']">
        <AlertTriangle v-if="confirmState.danger" class="w-5 h-5" /><HelpCircle v-else class="w-5 h-5" />
      </div>
      <p class="text-sm text-slate-600 leading-7 whitespace-pre-line">{{ confirmState.message }}</p>
    </div>
    <template #footer>
      <button class="btn-secondary" @click="closeConfirm(false)">إلغاء</button>
      <button :class="confirmState.danger ? 'btn-danger' : 'btn-primary'" @click="closeConfirm(true)">{{ confirmState.confirmText }}</button>
    </template>
  </Modal>
</template>
