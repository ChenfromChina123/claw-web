import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

/** 开发时 API/WS 代理目标：本机直连用 localhost；前端跑在 Docker 里时用 http://backend:3000 */
const devProxyHttp =
  process.env.VITE_DEV_PROXY_TARGET?.trim() || 'http://localhost:3000'
const devProxyWs = devProxyHttp.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [
    vue(),
    (monacoEditorPlugin as unknown as { default: { configure: (config: unknown) => { } } }).default.configure({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'css', 'html']
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: devProxyHttp,
        changeOrigin: true
      },
      '/ws': {
        target: devProxyWs,
        ws: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // 为 Monaco Editor worker 提供正确的 asset 文件名
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.includes('monaco-editor')) {
            return 'assets/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    }
  },
  optimizeDeps: {
    include: ['monaco-editor']
  }
})
