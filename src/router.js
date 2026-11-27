import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('./views/DashboardView.vue'), meta: { title: 'لوحة التحكم' } },
  { path: '/monitoring', name: 'monitoring', component: () => import('./views/MonitoringView.vue'), meta: { title: 'متابعة الأسعار' } },
  { path: '/products', name: 'products', component: () => import('./views/ProductsView.vue'), meta: { title: 'الأدوية' } },
  { path: '/products/:id', name: 'product', component: () => import('./views/ProductDetailView.vue'), meta: { title: 'تحليل المنتج' } },
  { path: '/distributors', name: 'distributors', component: () => import('./views/DistributorsView.vue'), meta: { title: 'المذاخر' } },
  { path: '/distributors/:id', name: 'distributor', component: () => import('./views/DistributorDetailView.vue'), meta: { title: 'تفاصيل المذخر' } },
  { path: '/batches', name: 'batches', component: () => import('./views/BatchesView.vue'), meta: { title: 'قوائم الأسعار' } },
  { path: '/batches/new', name: 'batch-new', component: () => import('./views/BatchFormView.vue'), meta: { title: 'قائمة أسعار جديدة' } },
  { path: '/batches/:id', name: 'batch', component: () => import('./views/BatchDetailView.vue'), meta: { title: 'تفاصيل القائمة' } },
  { path: '/market', name: 'market', component: () => import('./views/MarketView.vue'), meta: { title: 'المقارنة السوقية' } },
  { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue'), meta: { title: 'السجل التاريخي' } },
  { path: '/reports', name: 'reports', component: () => import('./views/ReportsView.vue'), meta: { title: 'التقارير' } },
  { path: '/import', name: 'import', component: () => import('./views/ImportView.vue'), meta: { title: 'استيراد Excel' } },
  { path: '/calculator', name: 'calculator', component: () => import('./views/CalculatorView.vue'), meta: { title: 'حاسبة الخصم' } },
  { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { title: 'الإعدادات' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  document.title = `${to.meta.title || ''} | Pharma Discount Monitor`
})
