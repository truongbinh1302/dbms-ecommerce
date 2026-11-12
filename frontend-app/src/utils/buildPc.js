/*
  Tiện ích cho trang Build PC.
  Lọc nhanh danh sách lựa chọn theo linh kiện đã chọn để khách khỏi chọn nhầm;
  kết quả kiểm tra tương thích chính thức vẫn do server trả về (POST /builder/check).
*/

export const BUILD_STORAGE_KEY = 'binhtinhstore-build'

// Số lượng tối đa cho mỗi ô; ô còn lại chỉ chọn 1.
export const MAX_QUANTITY = { ram: 2, storage: 4, gpu: 2 }

const listHas = (list, value) => String(list || '')
  .toUpperCase()
  .split(',')
  .map((item) => item.trim())
  .includes(String(value || '').toUpperCase())

/** Linh kiện `part` có hợp với các linh kiện đã chọn ở ô khác không (theo các quy tắc chắc chắn). */
export function fitsSelection(part, selected) {
  const cpu = selected.cpu
  const board = selected.mainboard
  const ram = selected.ram
  const pcCase = selected.case
  const cooler = selected.cooler
  const gpu = selected.gpu

  switch (part.type) {
    case 'cpu':
      return (!board || board.socket === part.socket) && (!cooler || listHas(cooler.supportedSockets, part.socket))
    case 'mainboard':
      return (!cpu || cpu.socket === part.socket)
        && (!ram || ram.memoryType === part.memoryType)
        && (!pcCase || listHas(pcCase.supportedFormFactors, part.formFactor))
    case 'ram':
      return !board || (board.memoryType === part.memoryType && (part.modules || 1) <= (board.memorySlots || 4))
    case 'cooler':
      return (!cpu || listHas(part.supportedSockets, cpu.socket))
        && (!pcCase || !pcCase.maxCoolerHeightMm || !part.heightMm || part.heightMm <= pcCase.maxCoolerHeightMm)
    case 'case':
      return (!board || listHas(part.supportedFormFactors, board.formFactor))
        && (!gpu || !gpu.lengthMm || !part.maxGpuLengthMm || gpu.lengthMm <= part.maxGpuLengthMm)
        && (!cooler || !cooler.heightMm || !part.maxCoolerHeightMm || cooler.heightMm <= part.maxCoolerHeightMm)
    case 'gpu':
      return !pcCase || !pcCase.maxGpuLengthMm || !part.lengthMm || part.lengthMm <= pcCase.maxGpuLengthMm
    default:
      return true
  }
}

/** Mô tả ngắn thông số chính để hiện dưới tên linh kiện. */
export function describePart(part) {
  switch (part.type) {
    case 'cpu':
      return [part.socket, part.powerW && `${part.powerW} W`, part.hasIntegratedGraphics ? 'có iGPU' : 'không iGPU', part.includesCooler ? 'kèm tản' : 'không kèm tản'].filter(Boolean).join(' · ')
    case 'mainboard':
      return [part.socket, part.formFactor, part.memoryType, part.memorySlots && `${part.memorySlots} khe RAM`, part.m2Slots !== null && `${part.m2Slots} khe M.2`].filter(Boolean).join(' · ')
    case 'ram':
      return [part.memoryType, part.capacityGB && `${part.capacityGB} GB`, part.modules && `${part.modules} thanh`].filter(Boolean).join(' · ')
    case 'gpu':
      return [part.vramGB && `${part.vramGB} GB VRAM`, part.lengthMm && `dài ${part.lengthMm} mm`, part.powerW && `${part.powerW} W`].filter(Boolean).join(' · ')
    case 'storage':
      return [
        part.capacityGB && (part.capacityGB >= 1000 ? `${part.capacityGB / 1000} TB` : `${part.capacityGB} GB`),
        part.storageInterface === 'M.2' && part.m2Size ? `M.2 ${part.m2Size}` : part.storageInterface,
        part.pcieGen && `PCIe ${part.pcieGen}.0`,
      ].filter(Boolean).join(' · ')
    case 'cooler':
      return [part.heightMm && `cao ${part.heightMm} mm`, part.supportedSockets].filter(Boolean).join(' · ')
    case 'psu':
      return part.psuWatts ? `${part.psuWatts} W` : ''
    case 'case':
      return [part.supportedFormFactors, part.maxGpuLengthMm && `card ≤ ${part.maxGpuLengthMm} mm`, part.maxCoolerHeightMm && `tản ≤ ${part.maxCoolerHeightMm} mm`].filter(Boolean).join(' · ')
    default:
      return ''
  }
}

/** Đọc cấu hình đã lưu trên trình duyệt: { [type]: { productId, quantity, owned } }. */
export function loadSavedBuild() {
  try {
    const raw = window.localStorage.getItem(BUILD_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function saveBuild(build) {
  try {
    window.localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(build))
  } catch {
    // trình duyệt chặn lưu trữ: cấu hình chỉ mất khi tải lại trang
  }
}

/** Chuyển danh sách linh kiện (từ gợi ý hoặc báo giá) thành cấu hình theo ô. */
export function partsToBuild(parts) {
  const build = {}
  for (const part of parts) {
    if (!part.type || build[part.type]) continue
    build[part.type] = { productId: part.productId, quantity: part.quantity || 1, owned: Boolean(part.owned) }
  }
  return build
}

export function buildToItems(build) {
  return Object.values(build)
    .filter((slot) => slot && slot.productId)
    .map((slot) => ({ productId: Number(slot.productId), quantity: slot.quantity || 1, owned: Boolean(slot.owned) }))
}

/** Linh kiện cần mua, gộp theo sản phẩm và sắp theo mã: cùng cách server lưu cấu hình đang theo dõi giá. */
export function canonicalItems(items) {
  const merged = new Map()
  for (const item of items) {
    if (item.owned) continue
    merged.set(item.productId, (merged.get(item.productId) || 0) + (item.quantity || 1))
  }
  return [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([productId, quantity]) => ({ productId, quantity }))
}
