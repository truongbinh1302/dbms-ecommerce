import { useEffect, useState } from 'react'
import StoreGlyph from '../components/StoreGlyph'
import ProductManagementModal from '../components/ProductManagementModal'
import { fetchProducts, createProduct, updateProduct, deleteProduct, fetchCategories, getStoredToken } from '../api/client'
import { formatCurrency } from '../utils/format'

export default function ProductManagement({ token, onBackToAdmin }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [categories, setCategories] = useState([])

  const authToken = token || getStoredToken()

  const loadProducts = async (pageNum = 1, query = '') => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchProducts({
        q: query,
        page: pageNum,
        limit: 12,
      })
      setProducts(result.items)
      setTotalPages(result.pagination?.totalPages || 1)
      setPage(pageNum)
    } catch (err) {
      setError(err.message)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }


  const loadCategories = async () => {
    try {
      const result = await fetchCategories()
      setCategories(Array.isArray(result) ? result : [])
    } catch {
      setCategories([])
    }
  }

  useEffect(() => {
    loadProducts(1)
    loadCategories()
  }, [])

  const handleSearch = (e) => {
    const query = e.target.value
    setSearchQuery(query)
    setPage(1)
    loadProducts(1, query)
  }

  const handleAddProduct = () => {
    setSelectedProduct(null)
    setShowModal(true)
  }

  const handleEditProduct = (product) => {
    setSelectedProduct(product)
    setShowModal(true)
  }

  const handleSaveProduct = async (formData) => {
    if (selectedProduct?.id) {
      // Update existing product
      await updateProduct(selectedProduct.id, {
        name: formData.name,
        brand: formData.brand,
        description: formData.description,
        price: formData.price,
        oldPrice: formData.oldPrice,
        stock: formData.stock,
        images: formData.images ? [formData.images] : undefined,
        categoryId: formData.categoryId || selectedProduct.category?.id,
      }, authToken)
    } else {
      // Create new product
      await createProduct({
        name: formData.name,
        brand: formData.brand,
        description: formData.description,
        price: formData.price,
        oldPrice: formData.oldPrice,
        stock: formData.stock,
        images: formData.images ? [formData.images] : [],
        categoryId: formData.categoryId || 1,
        specs: [],
      }, authToken)
    }

    // Reload products
    await loadProducts(page, searchQuery)
  }


  const handleDeleteProduct = async (product) => {
    if (!authToken) {
      setError('Bạn cần đăng nhập bằng tài khoản admin trước khi xóa sản phẩm.')
      return
    }

    const ok = window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product.name}"? Sản phẩm sẽ được ẩn khỏi storefront.`)
    if (!ok) return

    setLoading(true)
    setError('')
    try {
      await deleteProduct(product.id, authToken)
      await loadProducts(page, searchQuery)
    } catch (err) {
      setError(err.message || 'Không thể xóa sản phẩm')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Quản lý Sản phẩm</h1>
            <p className="mt-2 text-slate-600">Thêm, sửa, xóa sản phẩm và cập nhật ảnh</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBackToAdmin}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <StoreGlyph name="chevron-left" className="size-4" />
              Quay lại
            </button>
            <button
              onClick={handleAddProduct}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700"
            >
              <StoreGlyph name="plus" className="size-4" />
              Thêm sản phẩm
            </button>
          </div>
        </div>

        {!authToken && (
          <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-amber-800">
            Bạn chưa có token admin trong trình duyệt. Hãy đăng nhập bằng tài khoản admin trước khi thêm, sửa, xóa hoặc upload ảnh sản phẩm.
          </div>
        )}

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Tìm kiếm sản phẩm..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full rounded-lg border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {/* Products Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full py-12 text-center">
              <p className="text-slate-500">Đang tải...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="col-span-full py-12 text-center">
              <StoreGlyph name="inbox" className="mx-auto size-12 text-slate-300" />
              <p className="mt-4 text-slate-500">Không tìm thấy sản phẩm</p>
            </div>
          ) : (
            products.map((product) => (
              <div
                key={product.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                {/* Image */}
                <div className="aspect-square bg-slate-100 overflow-hidden flex items-center justify-center">
                  {product.images && product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center text-slate-400">
                      <StoreGlyph name="image" className="size-12" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-bold text-slate-900 line-clamp-2">{product.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{product.brand}</p>

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-red-600">
                        {formatCurrency(product.price)}
                      </div>
                      {product.oldPrice && (
                        <div className="text-sm text-slate-400 line-through">
                          {formatCurrency(product.oldPrice)}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-slate-600">Tồn kho: <strong>{product.stock}</strong></p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                    >
                      <StoreGlyph name="edit" className="inline size-4 mr-1" />
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product)}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <StoreGlyph name="trash" className="inline size-4 mr-1" />
                      Xóa
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={() => loadProducts(Math.max(1, page - 1), searchQuery)}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Trước
            </button>
            <span className="text-sm text-slate-600">
              Trang {page} / {totalPages}
            </span>
            <button
              onClick={() => loadProducts(Math.min(totalPages, page + 1), searchQuery)}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tiếp
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <ProductManagementModal
          product={selectedProduct}
          token={authToken}
          categories={categories}
          onClose={() => setShowModal(false)}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  )
}
