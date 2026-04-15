# Claude Code HAHA - 前端生产环境 Dockerfile
#
# 优化特性：
# - 多阶段构建（构建 + Nginx 服务）
# - 使用 npm 作为包管理器
# - 启用 Gzip 压缩和缓存优化
# - 支持反向代理配置

# ==================== 构建阶段 ====================
# 国内用户可使用：docker pull registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine && docker tag registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine node:20-alpine
FROM node:20-alpine AS builder

# ✅ 增大 Node.js 堆内存限制，防止 OOM
ENV NODE_OPTIONS="--max-old-space-size=6144"

# ✅ 使用国内镜像源加速（阿里云镜像）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app

# 复制依赖文件
COPY web/package.json web/package-lock.json ./

# 安装依赖（使用 npm install 解决 lock 文件不同步问题）
RUN npm install --legacy-peer-deps --registry=https://registry.npmmirror.com

# 复制源代码
COPY web/ .

# 构建生产版本（跳过类型检查，仅打包）
ENV NODE_ENV=production
ENV VITE_FEATURE_PTY_SHELL=true
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npx vite build

# ==================== 生产阶段（Nginx） ====================
FROM nginx:1.25-alpine AS production

# ✅ 使用国内镜像源加速（阿里云镜像）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

# 安装必要的工具
RUN apk add --no-cache curl

# 移除默认 Nginx 配置
RUN rm /etc/nginx/conf.d/default.conf

# 从构建阶段复制构建产物到 Nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制自定义 Nginx 配置
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
