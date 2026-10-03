import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 本地开发反向代理：quote.shiora.cc 不返回 CORS 头，
    // 直连会被浏览器拦截（200 OK 但读不到数据），开发期走同源代理
    proxy: {
      '/quote-api': {
        target: 'https://quote.shiora.cc',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/quote-api/, ''),
      },
    },
  },
})
