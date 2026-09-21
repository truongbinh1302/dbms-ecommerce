import { useState } from 'react'
import StoreGlyph from './StoreGlyph'
import ProductImageUpload from './ProductImageUpload'

export default function ProductManagementModal({ product, token, categories: dbCategories = [], onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: product?.name || '',
    brand: product?.brand || '',
    description: product?.description || '',
    price: product?.price || 0,
    oldPrice: product?.oldPrice || 0,
    stock: product?.stock || 0,
    categoryId: product?.category?.id || 1,
    images: product?.images?.[0] || '',
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const fallbackCategories = [
    { id: 1, name: 'Gaming PC' },
    { id: 2, name: 'Gaming Laptops' },
    { id: 3, name: 'Office Laptops' },
    { id: 4, name: 'Monitors' },
    { id: 5, name: 'Keyboards' },
    { id: 6, name: 'Mice' },
    { id: 7, name: 'Headsets' },
    { id: 8, name: 'Components' },
    { id: 9, name: 'Storage' },
    { id: 10, name: 'Networking' },
    { id: 11, name: 'Cameras' },
    { id: 12, name: 'Printers' },
    { id: 13, name: 'Chairs' },
    { id: 14, name: 'Smart Devices' },
    { id: 15, name: 'Accessories' },
  ]
  const categories = dbCategories.length > 0 ? dbCategories : fallbackCategories

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'price' || name === 'oldPrice' || name === 'stock' || name === 'categoryId' ? parseInt(value) || 0 : value,
    }))
  }

  const handleImageUploaded = (imageUrl) => {
    setFormData((prev) => ({
      ...prev,
      images: imageUrl,
    }))
  }

  const resolveImageUrl = (imageUrl) => {
    if (!imageUrl) return ''
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl
    return imageUrl
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!formData.name || !formData.price) {
      setError('Vui lòng nhập tên sản phẩm và giá bán')
      return
    }

    setIsLoading(true)

    try {
      await onSave(formData)
      onClose()
    } catch (err) {
      setError(err.message || 'Lỗi lưu sản phẩm')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            {product?.id ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm mới'}
          </h2>
          <button
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full hover:bg-slate-100 transition"
          >
            <StoreGlyph name="x" className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tên sản phẩm
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Tên sản phẩm"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Thương hiệu
              </label>
              <input
                type="text"
                name="brand"
                value={formData.brand}
                onChange={handleInputChange}
                placeholder="Thương hiệu"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Giá bán
              </label>
              <input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleInputChange}
                placeholder="Giá bán"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Giá cũ
              </label>
              <input
                type="number"
                name="oldPrice"
                value={formData.oldPrice}
                onChange={handleInputChange}
                placeholder="Giá cũ"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Tồn kho
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleInputChange}
                placeholder="Tồn kho"
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Danh mục
              </label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mô tả sản phẩm
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Mô tả sản phẩm"
              rows={4}
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <ProductImageUpload
            onImageUploaded={handleImageUploaded}
            token={token}
            disabled={isLoading}
          />

          {formData.images && (
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Ảnh hiện tại:</p>
              <img
                src={resolveImageUrl(formData.images)}
                alt="Product"
                className="max-h-40 rounded-lg"
              />
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? 'Đang lưu...' : 'Lưu sản phẩm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
