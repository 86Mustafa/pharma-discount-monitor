import { reactive, computed } from 'vue'
import { liveQuery } from 'dexie'
import { db } from '../db/index.js'
import { getSettings, DEFAULT_SETTINGS } from '../db/repo.js'
import { enrich } from '../lib/analytics.js'
import { classify } from '../lib/calc.js'
import { displayName } from '../lib/catalog.js'

const TABLES = ['products', 'distributors', 'priceBatches', 'batchProducts', 'distributorDiscounts', 'priceMonitoring', 'priceHistory']

const state = reactive({
  loaded: new Set(),
  raw: Object.fromEntries(TABLES.map((t) => [t, []])),
  settings: { ...DEFAULT_SETTINGS },
})

let started = false
export function initStore() {
  if (started) return
  started = true
  for (const t of TABLES) {
    liveQuery(() => db.table(t).toArray()).subscribe({
      next: (v) => {
        state.raw[t] = v
        state.loaded.add(t)
      },
      error: (e) => console.error(t, e),
    })
  }
  liveQuery(getSettings).subscribe({ next: (s) => (state.settings = s), error: console.error })
}

const vis = (list) => (state.settings.showDemo ? list : list.filter((x) => !x.isDemo))
const toMap = (list) => new Map(list.map((x) => [x.id, x]))

const products = computed(() => vis(state.raw.products))
const distributors = computed(() => vis(state.raw.distributors))
const batches = computed(() => vis(state.raw.priceBatches).slice().sort((a, b) => (a.date === b.date ? b.code - a.code : a.date < b.date ? 1 : -1)))
const batchProducts = computed(() => vis(state.raw.batchProducts))
const overrides = computed(() => vis(state.raw.distributorDiscounts))
const history = computed(() => vis(state.raw.priceHistory))
const productMap = computed(() => toMap(state.raw.products))
const distributorMap = computed(() => toMap(state.raw.distributors))
const batchMap = computed(() => toMap(state.raw.priceBatches))

/** المتابعات مع جميع المؤشرات المحسوبة + التصنيف + الأسماء */
const monitoring = computed(() =>
  vis(state.raw.priceMonitoring).map((m) => {
    const e = enrich(m)
    e.category = classify(e, state.settings.classification)
    const prod = productMap.value.get(m.productId)
    e.productName = prod ? displayName(prod) : '—'
    e.dosageForm = prod?.dosageForm || ''
    e.packaging = prod?.packaging || ''
    e.distributorName = distributorMap.value.get(m.distributorId)?.name || '—'
    e.batchName = batchMap.value.get(m.batchId)?.name || '—'
    return e
  }),
)

/** لون ثابت لكل مذخر (اللون يتبع الكيان لا الترتيب) */
export const SERIES = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17', '#6a4ce2', '#ec4647']
const distributorColor = (id) => {
  const ids = state.raw.distributors.map((d) => d.id).sort((a, b) => a - b)
  const i = ids.indexOf(id)
  return SERIES[(i < 0 ? 0 : i) % SERIES.length]
}

const ready = computed(() => TABLES.every((t) => state.loaded.has(t)))

export function useStore() {
  return {
    state,
    ready,
    settings: computed(() => state.settings),
    products,
    distributors,
    batches,
    batchProducts,
    overrides,
    history,
    monitoring,
    productMap,
    distributorMap,
    batchMap,
    distributorColor,
    hasAnyData: computed(() => state.raw.products.length + state.raw.distributors.length > 0),
    hasDemo: computed(() => state.raw.products.some((p) => p.isDemo)),
  }
}
