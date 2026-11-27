<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard, ClipboardEdit, Pill, Warehouse, Layers, BarChart3, History, FileText, Upload,
  Calculator, Settings, Menu, X, Search, FlaskConical, DatabaseBackup, Activity,
} from 'lucide-vue-next'
import ToastHost from './components/ToastHost.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { useStore } from './composables/store.js'
import { exportBackup } from './lib/backup.js'
import { toast, toastError } from './composables/ui.js'

const route = useRoute()
const router = useRouter()
const store = useStore()
const drawer = ref(false)
watch(() => route.fullPath, () => (drawer.value = false))

const nav = [
  { title: 'الرئيسية', items: [
    { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/monitoring', label: 'متابعة الأسعار', icon: ClipboardEdit },
  ] },
  { title: 'البيانات', items: [
    { to: '/products', label: 'الأدوية', icon: Pill },
    { to: '/distributors', label: 'المذاخر', icon: Warehouse },
    { to: '/batches', label: 'قوائم الأسعار والطلبيات', icon: Layers },
  ] },
  { title: 'التحليل', items: [
    { to: '/market', label: 'المقارنة السوقية', icon: BarChart3 },
    { to: '/history', label: 'السجل التاريخي', icon: History },
    { to: '/reports', label: 'التقارير', icon: FileText },
  ] },
  { title: 'الأدوات', items: [
    { to: '/import', label: 'استيراد Excel', icon: Upload },
    { to: '/calculator', label: 'حاسبة الخصم', icon: Calculator },
    { to: '/settings', label: 'الإعدادات والنسخ الاحتياطي', icon: Settings },
  ] },
]
const isActive = (to) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

// بحث سريع
const q = ref('')
const searchOpen = ref(false)
const results = computed(() => {
  const t = q.value.trim().toLowerCase()
  if (!t) return []
  const p = store.products.value
    .filter((x) => [x.name, x.scientificName, x.group].join(' ').toLowerCase().includes(t))
    .slice(0, 6)
    .map((x) => ({ key: 'p' + x.id, label: x.name, sub: 'دواء · ' + (x.scientificName || x.group || ''), to: `/products/${x.id}` }))
  const d = store.distributors.value
    .filter((x) => [x.name, x.city, x.governorate].join(' ').toLowerCase().includes(t))
    .slice(0, 5)
    .map((x) => ({ key: 'd' + x.id, label: x.name, sub: 'مذخر · ' + [x.governorate, x.city].filter(Boolean).join(' / '), to: `/distributors/${x.id}` }))
  const b = store.batches.value
    .filter((x) => x.name.toLowerCase().includes(t))
    .slice(0, 3)
    .map((x) => ({ key: 'b' + x.id, label: x.name, sub: 'قائمة أسعار · ' + x.date, to: `/batches/${x.id}` }))
  return [...p, ...d, ...b]
})
function go(r) { router.push(r.to); q.value = ''; searchOpen.value = false }

const showDemoBanner = computed(() => store.settings.value.showDemo && store.hasDemo.value)
const needBackup = computed(() => {
  if (!store.state.raw.priceMonitoring.some((m) => !m.isDemo)) return false
  const last = store.settings.value.lastBackupAt
  return !last || Date.now() - new Date(last).getTime() > 7 * 864e5
})
async function backupNow() {
  try { await exportBackup(); toast('تم تنزيل النسخة الاحتياطية') } catch (e) { toastError(e) }
}
</script>

<template>
  <div class="min-h-screen lg:pr-64">
    <!-- الشريط الجانبي -->
    <div v-if="drawer" class="fixed inset-0 z-40 bg-slate-900/40 lg:hidden no-print" @click="drawer = false"></div>
    <aside :class="['fixed inset-y-0 right-0 z-40 w-64 bg-white border-l border-slate-200 flex flex-col transition-transform lg:translate-x-0', drawer ? 'translate-x-0' : 'translate-x-full']">
      <div class="flex items-center gap-2.5 px-4 h-16 border-b border-slate-100">
        <div class="rounded-lg bg-brand-600 text-white p-1.5"><Activity class="w-5 h-5" /></div>
        <div class="leading-tight min-w-0">
          <div class="font-bold text-slate-900 text-[15px]">Pharma Discount Monitor</div>
          <div class="text-[11px] text-slate-500 truncate">مراقبة الأسعار وانعكاس الخصومات</div>
        </div>
        <button class="icon-btn mr-auto lg:hidden" @click="drawer = false"><X class="w-5 h-5" /></button>
      </div>
      <nav class="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div v-for="g in nav" :key="g.title">
          <div class="px-2 mb-1 text-[11px] font-semibold text-slate-400">{{ g.title }}</div>
          <router-link v-for="it in g.items" :key="it.to" :to="it.to"
            :class="['flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition', isActive(it.to) ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900']">
            <component :is="it.icon" class="w-[18px] h-[18px]" />{{ it.label }}
          </router-link>
        </div>
      </nav>
      <div class="p-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-slate-100 grid place-items-center font-semibold text-slate-600">{{ (store.settings.value.currentUser || 'م').slice(0, 1) }}</div>
        <div class="min-w-0"><div class="font-medium text-slate-700 truncate">{{ store.settings.value.currentUser }}</div><div>بيانات محلية · IndexedDB</div></div>
      </div>
    </aside>

    <!-- الشريط العلوي -->
    <header class="app-top sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 no-print">
      <div class="flex items-center gap-3 px-4 md:px-6 h-16">
        <button class="icon-btn lg:hidden" @click="drawer = true" aria-label="القائمة"><Menu class="w-5 h-5" /></button>
        <div class="font-semibold text-slate-800 hidden sm:block">{{ route.meta.title }}</div>
        <div class="relative flex-1 max-w-md mr-auto" @focusout="(e) => !e.currentTarget.contains(e.relatedTarget) && (searchOpen = false)">
          <Search class="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input v-model="q" @focus="searchOpen = true" @keydown.enter="results[0] && go(results[0])" type="search" placeholder="بحث سريع: دواء، مذخر، قائمة…" class="input pr-9 bg-slate-50" />
          <div v-if="searchOpen && q" tabindex="-1" class="absolute mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-40">
            <button v-for="r in results" :key="r.key" class="block w-full text-right px-3 py-2 hover:bg-slate-50" @mousedown.prevent="go(r)">
              <div class="text-sm text-slate-800">{{ r.label }}</div><div class="text-xs text-slate-400">{{ r.sub }}</div>
            </button>
            <div v-if="!results.length" class="px-3 py-3 text-sm text-slate-400 text-center">لا توجد نتائج</div>
          </div>
        </div>
        <router-link to="/monitoring" class="btn-primary hidden md:inline-flex"><ClipboardEdit class="w-4 h-4" />تسجيل سعر</router-link>
      </div>
      <div v-if="showDemoBanner" class="flex items-center gap-2 px-4 md:px-6 py-1.5 bg-violet-50 border-t border-violet-100 text-xs text-violet-800">
        <FlaskConical class="w-3.5 h-3.5" />
        تُعرض بيانات تجريبية معلَّمة بشارة «تجريبي» ومنفصلة عن بياناتك.
        <router-link to="/settings" class="underline mr-auto">إخفاء / حذف</router-link>
      </div>
      <div v-if="needBackup" class="flex items-center gap-2 px-4 md:px-6 py-1.5 bg-amber-50 border-t border-amber-100 text-xs text-amber-900">
        <DatabaseBackup class="w-3.5 h-3.5" />
        لم تُنشأ نسخة احتياطية منذ أكثر من 7 أيام. البيانات محفوظة في هذا المتصفح فقط.
        <button class="underline mr-auto" @click="backupNow">نسخ احتياطي الآن</button>
      </div>
    </header>

    <main class="px-4 md:px-6 py-5 max-w-[1400px] mx-auto">
      <div v-if="!store.ready.value" class="py-24 text-center text-slate-400">جارٍ تحميل البيانات…</div>
      <router-view v-else v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </router-view>
    </main>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
