import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            },
            '/ws': {
                target: 'ws://localhost:3000',
                ws: true
            }
        }
    },
    build: {
        rollupOptions: {
            output: {
                // 为 Monaco Editor worker 提供正确的 asset 文件名
                assetFileNames: function (assetInfo) {
                    if (assetInfo.name && assetInfo.name.includes('monaco-editor')) {
                        return 'assets/[name]-[hash][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                }
            }
        }
    },
    optimizeDeps: {
        include: ['monaco-editor']
    }
});
