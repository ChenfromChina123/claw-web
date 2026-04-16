import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'

/**
 * 开发模式代理配置说明：
 * 
 * 场景1 - 前端在本地运行 (npm run dev)，后端在 Docker：
 *   不需要设置任何环境变量，proxy 默认指向 http://localhost:3000
 * 
 * 场景2 - 前端和后端都在 Docker (docker-compose.dev.yml)：
 *   设置 VITE_DEV_PROXY_TARGET=http://backend:3000
 */
const devProxyHttp = process.env.VITE_DEV_PROXY_TARGET?.trim() || 'http://localhost:3000'
const devProxyWs = devProxyHttp.replace(/^http/, 'ws')

console.log('[Vite Config] Dev proxy target:', devProxyHttp)

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
        changeOrigin: true,
        configure: (proxy) => {
          // 确保 Authorization 头被转发
          proxy.on('proxyReq', (proxyReq) => {
            if (proxyReq.getHeader('authorization')) {
              console.log('[Vite Proxy] Forwarding Authorization header')
            }
          })
        }
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
