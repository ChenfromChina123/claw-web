/**
 * Claude Code HAHA - 后端生产环境 Dockerfile
 *
 * 优化特性：
 * - 多阶段构建，减小镜像体积
 * - 使用 Bun 官方镜像作为运行时
 * - 支持多租户用户隔离
 * - 健康检查和优雅关闭
 */

# ==================== 构建阶段 ====================
FROM oven/bun:1 AS builder

WORKDIR /app

# 复制依赖文件
COPY server/package.json server/bun.lock ./

# 安装依赖（使用 bun 安装以获得最佳性能）
RUN bun install --frozen-lockfile --production=false

# 复制源代码
COPY server/ .

# TypeScript 编译
RUN bun run build

# ==================== 生产阶段 ====================
FROM oven/bun:1-alpine AS production

# 安装必要的系统依赖
RUN apk add --no-cache \
    mysql-client \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_DIR=/app/workspaces \
    # 多租户隔离配置
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=100 \
    USER_STORAGE_QUOTA_MB=500 \
    USER_SESSION_LIMIT=10 \
    USER_PTY_LIMIT=5

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .
COPY --from=builder /app/tsconfig.json .

# 创建工作区目录结构
RUN mkdir -p /app/workspaces/users /app/workspaces/sessions && \
    chown -R bun:bun /app/workspaces

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 优雅关闭信号处理
STOPSIGNAL SIGINT

# 启动命令（使用 Bun 运行时）
CMD ["bun", "run", "dist/index.js"]
