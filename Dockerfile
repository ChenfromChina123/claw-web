# ===========================================
# Claude Code HAHA - 主 Dockerfile（多租户版本）
# ===========================================
#
# 此 Dockerfile 用于单容器部署场景
# 推荐使用 docker-compose.yml 进行多服务部署
#
# 特性：
# ✅ 多阶段构建，优化镜像体积
# ✅ 支持 Bun 运行时（高性能）
# ✅ 内置多租户用户隔离
# ✅ 生产级安全配置

# ==================== 构建阶段：前端 ====================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/web

# 复制前端依赖文件
COPY web/package.json web/package-lock.json ./

# 安装前端依赖（使用国内镜像源加速）
RUN npm ci --registry=https://registry.npmmirror.com

# 复制前端源代码
COPY web/ .

# 构建前端生产版本
ENV NODE_ENV=production
RUN npm run build

# ==================== 构建阶段：后端 ====================
FROM oven/bun:1 AS backend-builder

WORKDIR /app/server

# 复制后端依赖文件
COPY server/package.json server/bun.lock ./

# 安装后端依赖
RUN bun install --frozen-lockfile

# 复制后端源代码
COPY server/ .

# TypeScript 编译
RUN bun run build

# ==================== 生产运行阶段 ====================
FROM oven/bun:1-alpine AS production

# 元数据标签
LABEL maintainer="Claude Code HAHA Team"
LABEL description="Claude Code Web with Multi-Tenant Isolation"
LABEL version="1.0.0"

# 安装必要的系统依赖
RUN apk add --no-cache \
    mysql-client \
    curl \
    tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_DIR=/app/workspaces \
    TZ=Asia/Shanghai \
    # 多租户隔离配置
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=100 \
    USER_STORAGE_QUOTA_MB=500 \
    USER_SESSION_LIMIT=10 \
    USER_PTY_LIMIT=5

# 从前端构建阶段复制产物到 Nginx 目录
COPY --from=frontend-builder /app/web/dist ./web/dist

# 从后端构建阶段复制产物
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY --from=backend-builder /app/server/dist ./server/dist
COPY --from=backend-builder /app/server/package.json ./server/
COPY --from=backend-builder /app/server/tsconfig.json ./server/

# 创建工作区目录结构（用户隔离的核心）
RUN mkdir -p /app/workspaces/users /app/workspaces/sessions && \
    chown -R bun:bun /app/workspaces

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 非 root 用户运行（安全最佳实践）
USER bun

# 优雅关闭信号处理
STOPSIGNAL SIGINT

# 启动命令
CMD ["bun", "run", "server/dist/index.js"]
