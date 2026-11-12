import { useEffect, useMemo, useRef, useState } from 'react'
import CapabilityReport from '../components/CapabilityReport'
import { analyzeMachine, fetchLaptopModels } from '../api/client'
import { hrefFor } from '../hooks/useHashRoute'
import { formatCurrency } from '../utils/format'
import { mapApiProductToStoreProduct } from '../utils/productMapping'
import { readDxDiagFile } from '../utils/dxdiagFile'

const CARD = 'rounded-[36px] bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]'
const FIELD = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm'

const TABS = [
  { id: 'dxdiag', label: 'Đọc file DxDiag (Windows)' },
  { id: 'laptop', label: 'Chọn model laptop' },
  { id: 'manual', label: 'Tự nhập cấu hình' },
]
const RAM_CHOICES = [4, 8, 12, 16, 24, 32, 48, 64, 96, 128]
const VRAM_CHOICES = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32]

function SlotsUsedField({ value, onChange, id }) {
  return (
    <div className="block text-sm">
      <label htmlFor={id} className="font-semibold text-slate-700">Số khe RAM đang cắm thanh rời</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={FIELD}>
        <option value="">Không rõ</option>
        <option value="0">0 (chỉ có RAM hàn)</option>
        <option value="1">1 khe</option>
        <option value="2">2 khe</option>
      </select>
      <span className="mt-1 block text-xs text-slate-500">Xem ở Task Manager → Performance (Hiệu suất) → Memory (Bộ nhớ), dòng “Slots used”.</span>
    </div>
  )
}

/*
  "Máy này chạy được gì?" cho máy khách đang dùng: đọc file DxDiag, chọn model laptop, hoặc tự nhập.
  Có model laptop thì kèm tư vấn nâng cấp RAM/SSD lắp được và "nâng xong chạy thêm được gì".
  File DxDiag đọc trên trình duyệt, chỉ các dòng hãng/model/CPU/RAM/card được gửi đi, máy chủ không lưu.
*/
export default function MachineCheckPage({ initialModelId = null, onAddToCart }) {
  const [tab, setTab] = useState(initialModelId ? 'laptop' : 'dxdiag')
  const [models, setModels] = useState({ loaded: false, items: [] })
  const [file, setFile] = useState(null)
  const [laptopForm, setLaptopForm] = useState({ modelId: initialModelId ? String(initialModelId) : '', ramGB: '' })
  const [manual, setManual] = useState({ ramGB: '16', gpuKind: 'none', vramGB: '8' })
  const [slotsUsed, setSlotsUsed] = useState('')
  // Mở từ trang sản phẩm laptop (#/kiem-tra-may?model=ID): xem luôn kết quả của model đó.
  const [state, setState] = useState({ busy: Boolean(initialModelId), data: null, error: '' })
  const resultRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchLaptopModels()
      .then((items) => {
        if (!cancelled) setModels({ loaded: true, items: Array.isArray(items) ? items : [] })
      })
      .catch(() => {
        if (!cancelled) setModels({ loaded: true, items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedModel = models.items.find((model) => String(model.id) === laptopForm.modelId) || null
  const ramChoices = useMemo(() => {
    if (!selectedModel) return []
    return [...new Set([...RAM_CHOICES, selectedModel.ramGB])]
      .filter((value) => value >= Math.max(selectedModel.ramSolderedGB, 4) && value <= selectedModel.maxRamGB)
      .sort((a, b) => a - b)
  }, [selectedModel])
  const brands = [...new Set(models.items.map((model) => model.brand))]

  async function run(body) {
    setState({ busy: true, data: null, error: '' })
    try {
      const data = await analyzeMachine(body)
      setState({ busy: false, data, error: '' })
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err) {
      setState({ busy: false, data: null, error: err.message || 'Không phân tích được' })
    }
  }

  useEffect(() => {
    if (!initialModelId) return undefined
    let cancelled = false
    analyzeMachine({ source: 'laptop', laptopModelId: Number(initialModelId) })
      .then((data) => !cancelled && setState({ busy: false, data, error: '' }))
      .catch((err) => !cancelled && setState({ busy: false, data: null, error: err.message || 'Không phân tích được' }))
    return () => {
      cancelled = true
    }
  }, [initialModelId])

  async function handleSubmit(event) {
    event.preventDefault()
    const slots = slotsUsed === '' ? undefined : Number(slotsUsed)
    if (tab === 'dxdiag') {
      try {
        const text = await readDxDiagFile(file)
        await run({ source: 'dxdiag', text, slotsUsed: slots })
      } catch (err) {
        setState({ busy: false, data: null, error: err.message })
      }
      return
    }
    if (tab === 'laptop') {
      if (!selectedModel) {
        setState({ busy: false, data: null, error: 'Hãy chọn model laptop' })
        return
      }
      await run({
        source: 'laptop',
        laptopModelId: selectedModel.id,
        ramGB: laptopForm.ramGB ? Number(laptopForm.ramGB) : undefined,
        slotsUsed: slots,
      })
      return
    }
    await run({
      source: 'manual',
      ramGB: Number(manual.ramGB),
      gpuKind: manual.gpuKind,
      vramGB: manual.gpuKind === 'none' ? undefined : Number(manual.vramGB),
    })
  }

  return (
    <div className="space-y-5">
      <section className={CARD}>
        <h1 className="text-2xl font-black text-slate-900">Máy này chạy được gì?</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Xem máy đang dùng chạy được mô hình AI cỡ nào, có đủ cho Docker, Android Studio, máy ảo, Blender hay dựng video không.
          Với laptop có trong dữ liệu của cửa hàng, trang này cho biết RAM và SSD nâng cấp được đến đâu, linh kiện nào lắp vừa, và nâng xong chạy thêm được gì.
        </p>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Cách nhập thông tin máy">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => {
                setTab(item.id)
                setState((current) => ({ ...current, error: '' }))
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === item.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={handleSubmit} className={CARD}>
        {tab === 'dxdiag' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h2 className="text-xl font-black text-slate-900">Đọc cấu hình từ DxDiag</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                <li>Nhấn <kbd className="rounded bg-slate-100 px-1.5 font-mono text-xs">Win</kbd> + <kbd className="rounded bg-slate-100 px-1.5 font-mono text-xs">R</kbd>, gõ <strong>dxdiag</strong> rồi Enter.</li>
                <li>Chờ thanh tiến trình ở góc dưới chạy xong, bấm <strong>Save All Information...</strong> và lưu file DxDiag.txt.</li>
                <li>Chọn file vừa lưu ở ô bên dưới.</li>
              </ol>
              <label htmlFor="dxdiag-file" className="mt-4 block text-sm font-semibold text-slate-700">File DxDiag.txt</label>
              <input
                id="dxdiag-file"
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
              />
              <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                File được đọc ngay trên trình duyệt của bạn. Chỉ các dòng hãng máy, model, CPU, dung lượng RAM và card đồ hoạ được gửi đi để ước tính;
                tên máy, tên người dùng và các thông tin khác không được gửi, và cửa hàng không lưu file.
              </p>
            </div>
            <div className="space-y-4">
              <SlotsUsedField id="slots-dxdiag" value={slotsUsed} onChange={setSlotsUsed} />
              <p className="text-xs text-slate-500">Máy Mac không có DxDiag: dùng tab “Chọn model laptop” hoặc “Tự nhập cấu hình”.</p>
            </div>
          </div>
        ) : null}

        {tab === 'laptop' ? (
          <div>
            <h2 className="text-xl font-black text-slate-900">Chọn model laptop</h2>
            <p className="mt-1 text-sm text-slate-500">Tên model in ở mặt dưới máy, hoặc xem dòng “System Model” trong DxDiag.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="block text-sm">
                <label htmlFor="laptop-model" className="font-semibold text-slate-700">Model</label>
                <select
                  id="laptop-model"
                  value={laptopForm.modelId}
                  onChange={(event) => setLaptopForm({ modelId: event.target.value, ramGB: '' })}
                  className={FIELD}
                >
                  <option value="">{models.loaded ? '— Chọn model —' : 'Đang tải...'}</option>
                  {brands.map((brand) => (
                    <optgroup key={brand} label={brand}>
                      {models.items.filter((model) => model.brand === brand).map((model) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="block text-sm">
                <label htmlFor="laptop-ram" className="font-semibold text-slate-700">RAM máy đang có</label>
                <select
                  id="laptop-ram"
                  value={laptopForm.ramGB}
                  disabled={!selectedModel || selectedModel.ramSlots === 0}
                  onChange={(event) => setLaptopForm((current) => ({ ...current, ramGB: event.target.value }))}
                  className={FIELD}
                >
                  <option value="">{selectedModel ? `Như bản bán ra (${selectedModel.ramGB} GB)` : 'Chọn model trước'}</option>
                  {ramChoices.map((value) => <option key={value} value={value}>{value} GB</option>)}
                </select>
              </div>
              {selectedModel && selectedModel.ramSlots > 0 ? (
                <SlotsUsedField id="slots-laptop" value={slotsUsed} onChange={setSlotsUsed} />
              ) : null}
            </div>
            {selectedModel ? (
              <p className="mt-3 text-xs text-slate-500">{selectedModel.cpuName} · {selectedModel.gpuName || 'đồ hoạ tích hợp'}</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">Không thấy model của bạn? Dùng tab “Tự nhập cấu hình” để xem máy chạy được gì (chưa có tư vấn nâng cấp).</p>
          </div>
        ) : null}

        {tab === 'manual' ? (
          <div>
            <h2 className="text-xl font-black text-slate-900">Tự nhập cấu hình</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="block text-sm">
                <label htmlFor="manual-ram" className="font-semibold text-slate-700">RAM</label>
                <select id="manual-ram" value={manual.ramGB} onChange={(event) => setManual((current) => ({ ...current, ramGB: event.target.value }))} className={FIELD}>
                  {RAM_CHOICES.map((value) => <option key={value} value={value}>{value} GB</option>)}
                </select>
              </div>
              <div className="block text-sm">
                <label htmlFor="manual-gpu" className="font-semibold text-slate-700">Card đồ hoạ rời</label>
                <select id="manual-gpu" value={manual.gpuKind} onChange={(event) => setManual((current) => ({ ...current, gpuKind: event.target.value }))} className={FIELD}>
                  <option value="none">Không có (chỉ đồ hoạ tích hợp)</option>
                  <option value="nvidia">NVIDIA GeForce / RTX</option>
                  <option value="amd">AMD Radeon</option>
                  <option value="intel">Intel Arc</option>
                </select>
              </div>
              <div className="block text-sm">
                <label htmlFor="manual-vram" className="font-semibold text-slate-700">VRAM của card</label>
                <select
                  id="manual-vram"
                  value={manual.vramGB}
                  disabled={manual.gpuKind === 'none'}
                  onChange={(event) => setManual((current) => ({ ...current, vramGB: event.target.value }))}
                  className={FIELD}
                >
                  {VRAM_CHOICES.map((value) => <option key={value} value={value}>{value} GB</option>)}
                </select>
              </div>
            </div>
          </div>
        ) : null}

        <button type="submit" disabled={state.busy} className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:bg-slate-300">
          {state.busy ? 'Đang ước tính...' : 'Xem máy chạy được gì'}
        </button>
        {state.error ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{state.error}</p> : null}
      </form>

      {state.data ? (
        <div ref={resultRef} className="scroll-mt-28 space-y-5">
          <MachineResult data={state.data} onAddToCart={onAddToCart} />
        </div>
      ) : null}
    </div>
  )
}

function MachineResult({ data, onAddToCart }) {
  const { detected, laptopModel, hint, capabilities, upgrade } = data
  return (
    <>
      <section className={CARD} aria-labelledby="machine-result-title">
        <h2 id="machine-result-title" className="text-xl font-black text-slate-900">
          {laptopModel ? `${laptopModel.brand} ${laptopModel.name}` : 'Kết quả ước tính'}
        </h2>
        {detected ? (
          <p className="mt-2 text-sm text-slate-600">
            Đọc từ DxDiag: {[detected.manufacturer, detected.model].filter(Boolean).join(' ') || 'không rõ model'}
            {detected.cpuName ? ` · ${detected.cpuName}${detected.cpuThreads ? ` (${detected.cpuThreads} luồng)` : ''}` : ''}
            {` · ${detected.ramGB} GB RAM`}
            {detected.gpuName ? ` · ${detected.gpuName} ${detected.vramGB} GB` : ' · không có card rời'}
          </p>
        ) : null}
        {laptopModel ? (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-semibold">Nâng cấp:</span> {laptopModel.upgradeSummary}
            {laptopModel.note ? <span className="block text-xs text-slate-500">{laptopModel.note}</span> : null}
          </p>
        ) : null}
        {hint ? <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{hint}</p> : null}
        <div className="mt-5">
          <CapabilityReport capabilities={capabilities} />
        </div>
      </section>

      {upgrade ? <UpgradeOptions upgrade={upgrade} onAddToCart={onAddToCart} /> : null}
    </>
  )
}

function addPartToCart(onAddToCart, part) {
  onAddToCart(mapApiProductToStoreProduct({
    id: part.productId,
    name: part.name,
    brand: part.brand,
    price: part.price,
    oldPrice: part.oldPrice,
    stock: part.stock,
    images: part.image ? [part.image] : [],
  }))
}

function UpgradeOptions({ upgrade, onAddToCart }) {
  const { ram, storage } = upgrade
  return (
    <section className={`${CARD} space-y-6`} aria-labelledby="upgrade-title">
      <div>
        <h2 id="upgrade-title" className="text-xl font-black text-slate-900">Nâng cấp được gì</h2>
        <p className="mt-1 text-sm text-slate-600">{upgrade.fixed} Chỉ liệt kê linh kiện còn hàng lắp vừa máy này.</p>
      </div>

      <div>
        <h3 className="font-bold text-slate-900">RAM</h3>
        {!ram.upgradable ? <p className="mt-2 text-sm text-slate-600">{ram.reason}</p> : null}
        {ram.tip ? <p className="mt-2 text-xs text-slate-500">{ram.tip}</p> : null}
        {ram.upgradable && ram.options.length === 0 ? <p className="mt-2 text-sm text-slate-600">Hiện chưa có thanh RAM phù hợp còn hàng.</p> : null}
        {ram.options.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {ram.options.map((option) => (
              <li key={`${option.action}-${option.productId}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-slate-900">{option.summary}</p>
                  <a href={hrefFor(`/san-pham/${option.productId}`)} className="text-slate-600 hover:text-red-600">{option.name}</a>
                  {option.note ? <p className="text-xs text-amber-800">{option.note}</p> : null}
                  {option.improves?.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-emerald-800">
                      {option.improves.map((item) => (
                        <li key={item.id}>Nâng xong: {item.label} — {item.from} → {item.to}</li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-xs text-slate-500">Không đổi mức ở các việc trong bảng, chủ yếu mở được nhiều ứng dụng cùng lúc hơn.</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-slate-900">{formatCurrency(option.price)}</p>
                  <button type="button" onClick={() => addPartToCart(onAddToCart, option)} className="mt-1 text-xs font-bold text-red-600 hover:underline">
                    Thêm vào giỏ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <h3 className="font-bold text-slate-900">SSD</h3>
        {!storage.upgradable ? <p className="mt-2 text-sm text-slate-600">{storage.reason}</p> : null}
        {storage.tip ? <p className="mt-2 text-xs text-slate-500">{storage.tip}</p> : null}
        {storage.upgradable && storage.options.length === 0 ? <p className="mt-2 text-sm text-slate-600">Hiện chưa có ổ M.2 {storage.slotSize} còn hàng.</p> : null}
        {storage.options.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-100">
            {storage.options.map((option) => (
              <li key={option.productId} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <a href={hrefFor(`/san-pham/${option.productId}`)} className="font-semibold text-slate-900 hover:text-red-600">{option.name}</a>
                  <p className="text-xs text-slate-500">
                    {option.capacityGB >= 1000 ? `${option.capacityGB / 1000} TB` : `${option.capacityGB} GB`} · M.2 {option.m2Size || '2280'}
                    {option.pcieGen ? ` · PCIe ${option.pcieGen}.0` : ''}
                  </p>
                  {option.note ? <p className="text-xs text-amber-800">{option.note}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-slate-900">{formatCurrency(option.price)}</p>
                  <button type="button" onClick={() => addPartToCart(onAddToCart, option)} className="mt-1 text-xs font-bold text-red-600 hover:underline">
                    Thêm vào giỏ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Không muốn tự tháo máy?{' '}
        <a href={hrefFor('/dich-vu/tai-nha?dv=upgrade')} className="font-bold text-red-600 underline">Đặt kỹ thuật viên nâng cấp tại nhà</a>
      </p>
    </section>
  )
}
