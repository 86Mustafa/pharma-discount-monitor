import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router.js'
import { initStore } from './composables/store.js'
import { requestPersistence } from './db/index.js'

initStore()
requestPersistence()
createApp(App).use(router).mount('#app')
