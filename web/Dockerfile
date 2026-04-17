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

# ✅ 使用国内镜像源加速（阿里云镜像）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app

# ✅ 关键优化：先复制依赖文件（变化少，利用缓存）
COPY web/package.json web/package-lock.json ./

# ✅ 安装依赖（package.json 不变时复用缓存层）
# 使用国内 npm 镜像加速
RUN npm install --legacy-peer-deps --registry=https://registry.npmmirror.com

# ✅ 再复制源代码（代码变化不影响依赖层缓存）
COPY web/ .

# ✅ 构建优化
ENV NODE_ENV=production
ENV VITE_FEATURE_PTY_SHELL=true
# 根据机器配置调整内存限制（默认 2GB）
ENV NODE_OPTIONS="--max-old-space-size=2048"
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
