import { useEffect, useState } from 'react'
import CapabilityReport from './CapabilityReport'
import { fetchProductCapabilities } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'

/*
  "Máy này chạy được gì?" trên trang PC/laptop: ước tính theo thông số của model
  (laptop có trong bảng LaptopModels) hoặc theo thông số PC bán sẵn, kèm khả năng nâng cấp của laptop.
*/
export default function ProductCapabilities({ productId }) {
  const [state, setState] = useState({ id: null, data: null })

  useEffect(() => {
    let cancelled = false
    fetchProductCapabilities(productId)
      .then((data) => !cancelled && setState({ id: productId, data }))
      .catch(() => !cancelled && setState({ id: productId, data: null }))
    return () => {
      cancelled = true
    }
  }, [productId])

  const data = state.id === productId ? state.data : null
  if (!data?.capabilities) return null
  const model = data.laptopModel

  return (
    <section className="rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]" aria-labelledby="capabilities-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="capabilities-title" className="text-xl font-black text-slate-900">Máy này chạy được gì?</h2>
        <a href={hrefFor('/kiem-tra-may')} className="text-sm font-semibold text-red-600 hover:underline">So với máy bạn đang dùng</a>
      </div>
      {model ? (
        <div className="mt-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
          <p><span className="font-semibold">Nâng cấp sau này:</span> {model.upgradeSummary}</p>
          {model.note ? <p className="mt-1 text-xs text-slate-500">{model.note}</p> : null}
          {model.ramSlots > 0 || model.m2Slots > 0 ? (
            <a href={hrefFor(`/kiem-tra-may?model=${model.id}`)} className="mt-2 inline-block text-xs font-bold text-red-600 hover:underline">
              Xem RAM, SSD lắp vừa và nâng xong chạy thêm được gì
            </a>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4">
        <CapabilityReport capabilities={data.capabilities} />
      </div>
      {data.source === 'specs' ? (
        <p className="mt-2 text-xs text-slate-500">Ước tính từ thông số in trên trang (RAM, card đồ hoạ, dòng CPU).</p>
      ) : null}
    </section>
  )
}
