/*
  Xuất CSV cho Excel: có BOM để Excel đọc đúng tiếng Việt, ô có dấu phẩy/ngoặc kép/xuống dòng được bọc ngoặc kép.
  Ô chữ bắt đầu bằng = + - @ (vd. tên khách gõ "=HYPERLINK(...)") được thêm dấu nháy để Excel không chạy như công thức.
*/
export function csvCell(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(header, rows) {
  return `${String.fromCharCode(0xfeff)}${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
}

export function downloadCsv(filename, header, rows) {
  const url = URL.createObjectURL(new Blob([buildCsv(header, rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
