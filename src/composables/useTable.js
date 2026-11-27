import { ref, computed, watch, unref } from 'vue'

/**
 * بحث + فرز + ترقيم صفحات لجداول البيانات.
 * @param rows ref/computed مصفوفة
 * @param opts { search: [keys], sortKey, sortDir, pageSize }
 */
export function useTable(rows, opts = {}) {
  const q = ref('')
  const sortKey = ref(opts.sortKey || null)
  const sortDir = ref(opts.sortDir || 'asc')
  const page = ref(1)
  const pageSize = ref(opts.pageSize || 25)

  const filtered = computed(() => {
    const term = q.value.trim().toLowerCase()
    let list = unref(rows) || []
    if (term && opts.search) {
      list = list.filter((r) => opts.search.some((k) => String(typeof k === 'function' ? k(r) : r[k] ?? '').toLowerCase().includes(term)))
    }
    if (sortKey.value) {
      const k = sortKey.value
      const dir = sortDir.value === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const va = a[k], vb = b[k]
        if (va === vb) return 0
        if (va === null || va === undefined || va === '') return 1
        if (vb === null || vb === undefined || vb === '') return -1
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
        return String(va).localeCompare(String(vb), 'ar') * dir
      })
    }
    return list
  })
  const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
  const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
  watch([q, () => unref(rows)?.length], () => (page.value = 1))
  watch(pages, (p) => { if (page.value > p) page.value = p })

  function sortBy(k, dir) {
    if (dir) { sortKey.value = k; sortDir.value = dir; return }
    if (sortKey.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    else { sortKey.value = k; sortDir.value = 'asc' }
  }
  return { q, sortKey, sortDir, sortBy, page, pages, pageSize, filtered, paged }
}
