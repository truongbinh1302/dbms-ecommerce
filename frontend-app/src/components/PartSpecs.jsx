import { useEffect, useState } from 'react'
import { fetchBuilderComponents } from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import { fitsSelection, loadSavedBuild, saveBuild } from '../utils/buildPc'
import { partSpecRows } from '../utils/partSpecs'

// Danh sách linh kiện Build PC ít thay đổi: tải một lần cho cả phiên, lỗi thì lần sau thử lại.
let componentsPromise = null
function loadComponents() {
  if (!componentsPromise) {
    componentsPromise = fetchBuilderComponents().catch((err) => {
      componentsPromise = null
      throw err
    })
  }
  return componentsPromise
}

/*
  Trang sản phẩm của một linh kiện Build PC: bảng thông số kỹ thuật, có hợp với cấu hình đang chọn ở Build PC không
  (gợi ý nhanh theo socket, loại RAM, kích thước; kiểm tra chính thức vẫn ở trang Build PC), nút đưa vào cấu hình.
*/
export default function PartSpecs({ productId }) {
  const [state, setState] = useState({ id: null, part: null, components: [], slots: [] })
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadComponents()
      .then((data) => {
        if (cancelled) return
        const components = data.components || []
        setState({ id: productId, part: components.find((item) => item.productId === Number(productId)) || null, components, slots: data.slots || [] })
      })
      .catch(() => !cancelled && setState({ id: productId, part: null, components: [], slots: [] }))
    return () => {
      cancelled = true
    }
  }, [productId])

  if (state.id !== productId || !state.part) return null
  const part = state.part
  const rows = partSpecRows(part)
  const slotLabel = state.slots.find((slot) => slot.type === part.type)?.label || part.type

  const build = loadSavedBuild()
  const current = build[part.type]
  const inBuild = current && Number(current.productId) === part.productId
  const selected = {}
  for (const [type, slot] of Object.entries(build)) {
    if (type === part.type || !slot?.productId) continue
    const found = state.components.find((item) => item.productId === Number(slot.productId))
    if (found) selected[type] = found
  }
  const hasSelection = Object.keys(selected).length > 0
  const fits = hasSelection ? fitsSelection(part, selected) : null

  function addToBuild() {
    saveBuild({ ...build, [part.type]: { productId: part.productId, quantity: 1, owned: false } })
    setAdded(true)
    navigate('/build-pc')
  }

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" aria-labelledby="part-specs-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="part-specs-title" className="text-xl font-black text-slate-900">Thông số linh kiện</h2>
          <p className="mt-1 text-sm text-slate-600">Dùng trong Build PC ở ô {slotLabel}.</p>
        </div>
        {inBuild ? (
          <a href={hrefFor('/build-pc')} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-red-200 hover:text-red-700">
            Đã có trong cấu hình · Mở Build PC
          </a>
        ) : (
          <button type="button" onClick={addToBuild} disabled={added} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60">
            {current ? `Thay ${slotLabel} trong cấu hình Build PC` : 'Thêm vào cấu hình Build PC'}
          </button>
        )}
      </div>
      {rows.length ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-slate-100 py-1.5">
              <dt className="text-slate-600">{label}</dt>
              <dd className="font-semibold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {fits === true && !inBuild ? (
        <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Hợp với các linh kiện bạn đang chọn ở Build PC (socket, loại RAM, kích thước).</p>
      ) : null}
      {fits === false && !inBuild ? (
        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Có thể không hợp với cấu hình bạn đang chọn ở Build PC (khác socket, loại RAM hoặc quá kích thước). Mở Build PC để kiểm tra chi tiết.
        </p>
      ) : null}
    </section>
  )
}
