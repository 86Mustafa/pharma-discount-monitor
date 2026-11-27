<script setup>
import { onMounted, onBeforeUnmount, ref, watch, toRaw } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)
Chart.defaults.font.family = "'IBM Plex Sans Arabic', Tahoma, sans-serif"
Chart.defaults.font.size = 12
Chart.defaults.color = '#64748b'
Chart.defaults.borderColor = '#eef2f6'
Chart.defaults.plugins.legend.position = 'bottom'
Chart.defaults.plugins.legend.rtl = true
Chart.defaults.plugins.legend.labels.usePointStyle = true
Chart.defaults.plugins.legend.labels.boxWidth = 8
Chart.defaults.plugins.legend.labels.padding = 14
Chart.defaults.plugins.tooltip.rtl = true
Chart.defaults.plugins.tooltip.textDirection = 'rtl'
Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a'
Chart.defaults.plugins.tooltip.padding = 10
Chart.defaults.plugins.tooltip.cornerRadius = 8
Chart.defaults.elements.bar.borderRadius = 4
Chart.defaults.elements.line.borderWidth = 2
Chart.defaults.elements.point.radius = 3.5
Chart.defaults.elements.point.hoverRadius = 6
Chart.defaults.maintainAspectRatio = false
Chart.defaults.animation = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 }

const props = defineProps({
  type: { type: String, default: 'bar' },
  data: { type: Object, required: true },
  options: { type: Object, default: () => ({}) },
  height: { type: String, default: '280px' },
  label: { type: String, default: 'مخطط بياني' },
})
const el = ref(null)
let chart = null

const clone = (o) => JSON.parse(JSON.stringify(toRaw(o), (k, v) => (typeof v === 'function' ? undefined : v)))
function build() {
  chart?.destroy()
  // نسخ البيانات لتجنب تفاعل Vue مع Chart.js، مع الإبقاء على الدوال في الخيارات
  chart = new Chart(el.value, { type: props.type, data: clone(props.data), options: props.options })
}
onMounted(build)
watch(() => props.data, () => {
  if (!chart) return build()
  chart.data = clone(props.data)
  chart.update()
}, { deep: true })
watch(() => [props.type, props.options], build)
onBeforeUnmount(() => chart?.destroy())
</script>

<template>
  <div class="relative w-full" :style="{ height }">
    <canvas ref="el" role="img" :aria-label="label" />
  </div>
</template>
