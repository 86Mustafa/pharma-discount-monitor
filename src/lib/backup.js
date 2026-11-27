import { db, TABLES } from '../db/index.js'
import { setSetting } from '../db/repo.js'

export const BACKUP_APP = 'pharma-discount-monitor'
export const BACKUP_VERSION = 1

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

export async function collectBackup() {
  const tables = {}
  for (const t of TABLES) tables[t] = await db.table(t).toArray()
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

export async function exportBackup(prefix = 'نسخة-احتياطية') {
  const data = await collectBackup()
  const stamp = data.exportedAt.replace(/[:T]/g, '-').slice(0, 16)
  download(`${prefix}-pharma-monitor-${stamp}.json`, data)
  if (prefix === 'نسخة-احتياطية') await setSetting('lastBackupAt', data.exportedAt)
  return data
}

export function validateBackup(data) {
  if (!data || data.app !== BACKUP_APP) throw new Error('الملف ليس نسخة احتياطية صالحة لهذا التطبيق')
  if (!data.tables || typeof data.tables !== 'object') throw new Error('بنية النسخة الاحتياطية غير صالحة')
  for (const t of ['products', 'distributors', 'priceBatches', 'priceMonitoring']) {
    if (!Array.isArray(data.tables[t])) throw new Error(`الجدول ${t} مفقود في النسخة`)
  }
  return {
    products: data.tables.products.length,
    distributors: data.tables.distributors.length,
    priceBatches: data.tables.priceBatches.length,
    priceMonitoring: data.tables.priceMonitoring.length,
    exportedAt: data.exportedAt,
  }
}

/** استعادة كاملة (استبدال). تُنزَّل نسخة أمان من البيانات الحالية أولاً. */
export async function restoreBackup(data, { safetyCopy = true } = {}) {
  validateBackup(data)
  if (safetyCopy) await exportBackup('نسخة-أمان-قبل-الاستعادة')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      if (Array.isArray(data.tables[t]) && data.tables[t].length) await db.table(t).bulkAdd(data.tables[t])
    }
  })
}

export async function wipeAll() {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) if (t !== 'settings') await db.table(t).clear()
  })
}
