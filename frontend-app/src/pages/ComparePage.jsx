import { useEffect, useState } from 'react'
import PageMessage from '../components/PageMessage'
import { fetchBuilderComponents, fetchProductsByIds } from '../api/client'
import { hrefFor, navigate } from '../hooks/useHashRoute'
import { removeCompare } from '../hooks/useCompare'
import { formatCurrency } from '../utils/format'
import { describePart } from '../utils/buildPc'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const yesNo = (value) => (value === null || value === undefined ? null : value ? 'Có' : 'Không')
const mm = (value) => (value ? `${value} mm` : null)
const watts = (value) => (value ? `${value} W` : null)
const capacity = (value) => (value ? (value >= 1000 ? `${value / 1000} TB` : `${value} GB`) : null)

// Thông số so sánh theo loại linh kiện (từ bảng ComponentSpecs của Build PC).
const PART_ROWS = {
  cpu: [['Socket', (p) => p.socket], ['Công suất', (p) => watts(p.powerW)], ['Đồ hoạ tích hợp', (p) => yesNo(p.hasIntegratedGraphics)], ['Kèm tản nhiệt', (p) => yesNo(p.includesCooler)]],
  mainboard: [['Socket', (p) => p.socket], ['Kích thước', (p) => p.formFactor], ['Loại RAM', (p) => p.memoryType], ['Số khe RAM', (p) => p.memorySlots], ['Số khe M.2', (p) => p.m2Slots]],
  ram: [['Loại', (p) => p.memoryType], ['Dung lượng', (p) => capacity(p.capacityGB)], ['Số thanh', (p) => p.modules]],
  gpu: [['VRAM', (p) => (p.vramGB ? `${p.vramGB} GB` : null)], ['Chiều dài', (p) => mm(p.lengthMm)], ['Công suất', (p) => watts(p.powerW)]],
  storage: [['Dung lượng', (p) => capacity(p.capacityGB)], ['Chuẩn kết nối', (p) => p.storageInterface]],
  psu: [['Công suất', (p) => watts(p.psuWatts)]],
  case: [['Mainboard hỗ trợ', (p) => p.supportedFormFactors], ['Card dài tối đa', (p) => mm(p.maxGpuLengthMm)], ['Tản cao tối đa', (p) => mm(p.maxCoolerHeightMm)]],
  cooler: [['Chiều cao', (p) => mm(p.heightMm)], ['Socket hỗ trợ', (p) => p.supportedSockets]],
}

function parseIds(value) {
  return [...new Set(String(value || '').split(',').map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 3)
}

function priceOf(product) {
  return product.promotion?.active && product.promotion.salePrice < product.price ? product.promotion.salePrice : product.price
}

/* So sánh tối đa 3 sản phẩm: giá, tình trạng, đánh giá, thông số; linh kiện cùng loại có bảng thông số chi tiết. */
export default function ComparePage({ ids: rawIds, onAddToCart }) {
  const ids = parseIds(rawIds)
  const key = ids.join(',')
  const [state, setState] = useState({ key: null, products: [], parts: [], error: '' })

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    Promise.all([fetchProductsByIds(key.split(',').map(Number)), fetchBuilderComponents().catch(() => ({ components: [] }))])
      .then(([products, builder]) => {
        if (cancelled) return
        const list = Array.isArray(products) ? products : products.items || []
        const order = key.split(',').map(Number)
        setState({
          key,
          products: order.map((id) => list.find((item) => Number(item.id) === id)).filter(Boolean),
          parts: builder.components || [],
          error: '',
        })
      })
      .catch((err) => !cancelled && setState({ key, products: [], parts: [], error: err.message || 'Không tải được sản phẩm' }))
    return () => {
      cancelled = true
    }
  }, [key])

  if (ids.length < 2) {
    return <PageMessage title="Chọn ít nhất 2 sản phẩm để so sánh" description="Bấm “So sánh” ở thẻ sản phẩm hoặc trang sản phẩm, tối đa 3 sản phẩm." action={<a href={hrefFor('/')} className="font-bold text-red-600">Về trang chủ</a>} />
  }
  if (state.key !== key) return <PageMessage title="Đang tải..." />
  if (state.error) return <PageMessage title="Không tải được sản phẩm" description={state.error} />
  if (state.products.length < 2) return <PageMessage title="Một số sản phẩm không còn bán" description="Hãy chọn lại sản phẩm để so sánh." />

  const products = state.products
  const parts = products.map((product) => state.parts.find((part) => part.productId === Number(product.id)) || null)
  const sameType = parts.every(Boolean) && parts.every((part) => part.type === parts[0].type) ? parts[0].type : null
  const lowest = Math.min(...products.map(priceOf))

  const rows = [
    ['Giá', (product) => (
      <span>
        <strong className={priceOf(product) === lowest ? 'text-emerald-700' : 'text-slate-900'}>{formatCurrency(priceOf(product))}</strong>
        {priceOf(product) < product.price ? <span className="block text-xs text-red-700">Hot Deal (giá thường {formatCurrency(product.price)})</span> : null}
        {priceOf(product) === lowest ? <span className="block text-xs text-emerald-700">Rẻ nhất</span> : null}
      </span>
    )],
    ['Tình trạng', (product) => (product.stock > 0 ? `Còn ${product.stock}` : <span className="text-red-700">Tạm hết hàng</span>)],
    ['Hãng', (product) => product.brand || '—'],
    ['Đánh giá', (product) => (product.reviewsCount > 0 ? `${Number(product.rating).toFixed(1)}/5 (${product.reviewsCount})` : 'Chưa có')],
  ]
  if (sameType) {
    for (const [label, read] of PART_ROWS[sameType] || []) {
      rows.push([label, (product, index) => read(parts[index]) ?? '—'])
    }
  } else if (parts.some(Boolean)) {
    rows.push(['Thông số linh kiện', (product, index) => (parts[index] ? describePart(parts[index]) || '—' : '—')])
  }
  rows.push(['Thông số', (product) => (
    product.specs?.length ? <ul className="space-y-1">{product.specs.map((spec) => <li key={spec}>{spec}</li>)}</ul> : '—'
  )])

  return (
    <section className={CARD} aria-labelledby="compare-title">
      <h1 id="compare-title" className="text-2xl font-black text-slate-900">So sánh sản phẩm</h1>
      {sameType ? <p className="mt-1 text-sm text-slate-600">Cùng loại linh kiện: có thêm thông số kỹ thuật từ bảng Build PC.</p> : null}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed text-left text-sm">
          <caption className="sr-only">Bảng so sánh {products.length} sản phẩm</caption>
          <thead>
            <tr>
              <th scope="col" className="w-32 p-2 align-bottom text-xs font-bold uppercase text-slate-500">Sản phẩm</th>
              {products.map((product) => (
                <th key={product.id} scope="col" className="p-2 align-top">
                  <a href={hrefFor(`/san-pham/${product.id}`)} className="line-clamp-3 font-bold text-slate-900 hover:text-red-600">{product.name}</a>
                  <button
                    type="button"
                    onClick={() => {
                      removeCompare(product.id)
                      navigate(`/so-sanh?ids=${ids.filter((id) => id !== Number(product.id)).join(',')}`)
                    }}
                    className="mt-1 text-xs font-semibold text-slate-600 underline hover:text-red-600">Bỏ khỏi danh sách</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([label, render]) => (
              <tr key={label}>
                <th scope="row" className="p-2 align-top text-xs font-bold text-slate-600">{label}</th>
                {products.map((product, index) => <td key={product.id} className="p-2 align-top text-slate-700">{render(product, index)}</td>)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="p-2"><span className="sr-only">Mua</span></th>
              {products.map((product) => (
                <td key={product.id} className="p-2">
                  <button type="button" disabled={product.stock <= 0} onClick={() => onAddToCart(product)} className="w-full rounded-2xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-700">
                    {product.stock > 0 ? 'Thêm vào giỏ' : 'Hết hàng'}
                  </button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-slate-500">Link trang này giữ đúng danh sách đang so sánh, gửi cho người khác xem được.</p>
    </section>
  )
}
