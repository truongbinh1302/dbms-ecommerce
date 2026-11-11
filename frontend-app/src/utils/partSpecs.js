// Bảng thông số theo loại linh kiện (dữ liệu ComponentSpecs của Build PC), dùng ở trang So sánh và trang sản phẩm.
const yesNo = (value) => (value === null || value === undefined ? null : value ? 'Có' : 'Không')
const mm = (value) => (value ? `${value} mm` : null)
const watts = (value) => (value ? `${value} W` : null)
const capacity = (value) => (value ? (value >= 1000 ? `${value / 1000} TB` : `${value} GB`) : null)

export const PART_ROWS = {
  cpu: [['Socket', (p) => p.socket], ['Công suất', (p) => watts(p.powerW)], ['Đồ hoạ tích hợp', (p) => yesNo(p.hasIntegratedGraphics)], ['Kèm tản nhiệt', (p) => yesNo(p.includesCooler)]],
  mainboard: [['Socket', (p) => p.socket], ['Kích thước', (p) => p.formFactor], ['Loại RAM', (p) => p.memoryType], ['Số khe RAM', (p) => p.memorySlots], ['Số khe M.2', (p) => p.m2Slots]],
  ram: [['Loại', (p) => p.memoryType], ['Dung lượng', (p) => capacity(p.capacityGB)], ['Số thanh', (p) => p.modules]],
  gpu: [['VRAM', (p) => (p.vramGB ? `${p.vramGB} GB` : null)], ['Chiều dài', (p) => mm(p.lengthMm)], ['Công suất', (p) => watts(p.powerW)]],
  storage: [['Dung lượng', (p) => capacity(p.capacityGB)], ['Chuẩn kết nối', (p) => p.storageInterface]],
  psu: [['Công suất', (p) => watts(p.psuWatts)]],
  case: [['Mainboard hỗ trợ', (p) => p.supportedFormFactors], ['Card dài tối đa', (p) => mm(p.maxGpuLengthMm)], ['Tản cao tối đa', (p) => mm(p.maxCoolerHeightMm)]],
  cooler: [['Chiều cao', (p) => mm(p.heightMm)], ['Socket hỗ trợ', (p) => p.supportedSockets]],
}

/** Các dòng [nhãn, giá trị] có dữ liệu của một linh kiện. */
export function partSpecRows(part) {
  return (PART_ROWS[part?.type] || [])
    .map(([label, read]) => [label, read(part)])
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
}
