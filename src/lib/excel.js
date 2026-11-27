import * as XLSX from 'xlsx'
import { todayISO } from './format.js'

const safeSheet = (s) => String(s || 'Sheet').replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31)

/**
 * تصدير عدة أوراق إلى ملف Excel واحد باتجاه من اليمين لليسار.
 * @param sheets [{ name, rows: [ { 'عنوان العمود': قيمة } ] }]
 */
export function exportExcel(filename, sheets) {
  const wb = XLSX.utils.book_new()
  wb.Workbook = { Views: [{ RTL: true }] }
  for (const s of sheets) {
    const rows = s.rows?.length ? s.rows : [{ 'لا توجد بيانات': '' }]
    const ws = XLSX.utils.json_to_sheet(rows)
    const headers = Object.keys(rows[0])
    ws['!cols'] = headers.map((h) => ({
      wch: Math.min(45, Math.max(h.length + 2, ...rows.slice(0, 200).map((r) => String(r[h] ?? '').length + 2))),
    }))
    XLSX.utils.book_append_sheet(wb, ws, safeSheet(s.name))
  }
  XLSX.writeFile(wb, `${filename}-${todayISO()}.xlsx`)
}

/** قراءة ملف Excel/CSV إلى أوراق، كل ورقة مصفوفة صفوف (مصفوفات خلايا) */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils
      .sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' })
      .filter((r) => r.some((c) => String(c).trim() !== '')),
  }))
}

const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-.:()]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه')

/** تخمين مطابقة الأعمدة اعتماداً على أسماء بديلة شائعة */
export function guessMapping(headers, fields) {
  const mapping = {}
  const used = new Set()
  for (const f of fields) {
    const aliases = [f.label, f.key, ...(f.aliases || [])].map(norm)
    const idx = headers.findIndex((h, i) => !used.has(i) && aliases.some((a) => norm(h) === a))
    const idx2 = idx >= 0 ? idx : headers.findIndex((h, i) => !used.has(i) && aliases.some((a) => a.length > 2 && norm(h).includes(a)))
    if (idx2 >= 0) {
      mapping[f.key] = idx2
      used.add(idx2)
    } else mapping[f.key] = -1
  }
  return mapping
}

/** تنزيل ملف قالب استيراد فارغ */
export function downloadTemplate(kind = 'batch') {
  const rows =
    kind === 'products'
      ? [{ 'اسم الدواء': 'دواء تجريبي', 'الاسم العلمي': '', 'الشركة المصنعة': '', 'الشكل الدوائي': 'أقراص', 'حجم العبوة': '20', 'السعر الأصلي': 10000, 'المجموعة الدوائية': '', 'ملاحظات': '' }]
      : [{ 'اسم المنتج': 'دواء تجريبي', 'السعر': 10000, 'الخصم %': 21 }]
  exportExcel(kind === 'products' ? 'قالب-منتجات' : 'قالب-قائمة-أسعار', [{ name: 'قالب', rows }])
}
