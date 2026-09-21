import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api/v1 → backend Express (chạy trên cùng máy host)
    // Khi dùng port forwarding, người xem chỉ cần truy cập port 5173.
    // Vite server sẽ tự chuyển tiếp request API sang backend thay cho browser.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
