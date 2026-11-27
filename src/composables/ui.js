import { reactive } from 'vue'

export const toasts = reactive([])
let tid = 0
export function toast(message, type = 'success', timeout = 3800) {
  const id = ++tid
  toasts.push({ id, message, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, timeout)
}
export const toastError = (e) => toast(e?.message || String(e), 'error', 6000)

export const confirmState = reactive({ open: false, title: '', message: '', confirmText: 'تأكيد', danger: false, resolve: null })
export function confirm({ title = 'تأكيد', message = '', confirmText = 'تأكيد', danger = false } = {}) {
  return new Promise((resolve) => Object.assign(confirmState, { open: true, title, message, confirmText, danger, resolve }))
}
export function closeConfirm(result) {
  confirmState.open = false
  confirmState.resolve?.(result)
  confirmState.resolve = null
}
