import { useState, useRef } from 'react'
import StoreGlyph from './StoreGlyph'
import { uploadProductImage, getStoredToken } from '../api/client'

export default function ProductImageUpload({ onImageUploaded, token, disabled = false }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh')
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File ảnh phải nhỏ hơn 5MB')
      return
    }

    setError('')
    
    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target.result)
    }
    reader.readAsDataURL(file)

    // Upload file
    uploadFile(file)
  }

  const uploadFile = async (file) => {
    setUploading(true)
    try {
      const authToken = token || getStoredToken()
      if (!authToken) {
        throw new Error('Bạn cần đăng nhập bằng tài khoản admin trước khi upload ảnh')
      }
      const data = await uploadProductImage(file, authToken)
      onImageUploaded(data.imageUrl)
      setPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err.message?.includes('token') ? 'Token admin đã hết hạn. Vui lòng đăng nhập admin lại rồi upload ảnh.' : (err.message || 'Upload thất bại'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">
        Ảnh sản phẩm
      </label>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={uploading || disabled}
        className="hidden"
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || disabled}
        className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-slate-400 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex flex-col items-center gap-2">
          <StoreGlyph name="cloud-upload" className="size-6 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              {uploading ? 'Đang upload...' : 'Kéo file ảnh hoặc nhấp để chọn'}
            </p>
            <p className="text-xs text-slate-500">PNG, JPG, GIF hoặc WebP (tối đa 5MB)</p>
          </div>
        </div>
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="relative rounded-lg overflow-hidden bg-slate-100">
          <img
            src={preview}
            alt="Preview"
            className="w-full h-48 object-cover"
          />
          <p className="text-xs text-slate-500 p-2 text-center">
            Đang upload...
          </p>
        </div>
      )}
    </div>
  )
}
