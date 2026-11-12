/*
  Đọc file DxDiag.txt ngay trên trình duyệt và chỉ giữ các dòng cần cho việc ước tính
  (hãng, model, CPU, RAM, card đồ hoạ). Tên máy, tên người dùng và các dòng khác không được gửi đi.
  Cùng danh sách với backend-app/src/utils/dxdiag.js (KEEP_KEYS).
*/
export const KEEP_KEYS = ['System Manufacturer', 'System Model', 'Processor', 'Memory', 'Card name', 'Chip type', 'Dedicated Memory']
export const MAX_FILE_BYTES = 2 * 1024 * 1024

const KEEP_PATTERNS = KEEP_KEYS.map((key) => new RegExp(`^\\s*${key}\\s*:`, 'i'))

/** Đoán mã hoá: DxDiag có thể lưu UTF-16 (có BOM) hoặc ANSI/UTF-8 tuỳ máy. */
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3))
  // Không có BOM nhưng nửa số byte lẻ là 0: UTF-16 little-endian.
  const sample = bytes.subarray(0, Math.min(bytes.length, 400))
  let zeros = 0
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) zeros += 1
  if (sample.length > 20 && zeros > sample.length / 4) return new TextDecoder('utf-16le').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

export function keepRelevantLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((line) => KEEP_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n')
}

/** Đọc file, trả về các dòng cần thiết (chuỗi rỗng nếu không thấy dòng nào). */
export async function readDxDiagFile(file) {
  if (!file) throw new Error('Hãy chọn file DxDiag.txt')
  if (file.size > MAX_FILE_BYTES) throw new Error('File quá lớn, hãy chọn đúng file DxDiag.txt')
  const text = decodeText(await file.arrayBuffer())
  const lines = keepRelevantLines(text)
  if (!lines) throw new Error('Không thấy thông tin máy trong file. Hãy lưu bằng nút "Save All Information..." trong DxDiag rồi chọn file .txt vừa lưu.')
  return lines
}
