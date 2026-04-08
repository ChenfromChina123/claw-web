/**
 * Claude Code HAHA - 后端生产环境 Dockerfile（含内存优化）
 *
 * 优化特性：
 * ✅ 多阶段构建，减小镜像体积
 * ✅ 使用 Bun 官方镜像作为运行时
 * ✅ 支持多租户用户隔离
 * ✅ 内存优化配置（V8 引擎参数）
 * ✅ 健康检查和优雅关闭
 * ✅ 生产级安全配置
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

# TypeScript 编译（优化编译输出）
RUN bun run build

# ==================== 生产阶段 ====================
FROM oven/bun:1-alpine AS production

# 元数据标签
LABEL maintainer="Claude Code HAHA Team"
LABEL description="Backend service with multi-tenant isolation and memory optimization"
LABEL version="1.0.0"

# 安装必要的系统依赖（最小化安装）
RUN apk add --no-cache \
    mysql-client \
    curl \
    tzdata \
    # 配置时区
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    # 清理缓存以减小镜像体积
    && rm -rf /var/cache/apk/*

WORKDIR /app

# 设置环境变量（包含内存优化配置）
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_DIR=/app/workspaces \
    TZ=Asia/Shanghai \
    # ==================== Node.js/Bun V8 引擎内存优化 ====================
    # 最大堆内存限制（关键参数！根据服务器内存调整）
    # 开发环境: 384MB | 标准生产: 1024MB | 高性能: 3072MB
    NODE_OPTIONS="--max-old-space-size=1024 \
                 --optimize-for-size \
                 --gc-interval=100" \
    # Bun I/O 线程池大小（建议 4-8，用于数据库查询、文件I/O等）
    UV_THREADPOOL_SIZE=4 \
    # ==================== 多租户隔离配置 ====================
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=100 \
    USER_STORAGE_QUOTA_MB=500 \
    USER_SESSION_LIMIT=10 \
    USER_PTY_LIMIT=5 \
    MAX_FILE_SIZE_MB=10 \
    MAX_FILES_PER_USER=1000 \
    # ==================== 性能优化 ====================
    API_TIMEOUT_MS=300000 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    DISABLE_TELEMETRY=1

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json .
COPY --from=builder /app/tsconfig.json .

# 创建工作区目录结构（用户隔离的核心：每个用户拥有独立空间）
RUN mkdir -p /app/workspaces/users /app/workspaces/sessions && \
    # 设置正确的权限（安全最佳实践）
    chown -R bun:bun /app/workspaces

# 暴露端口
EXPOSE 3000

# 健康检查（确保服务正常运行）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 优雅关闭信号处理（确保数据保存完成）
STOPSIGNAL SIGINT

# 非 root 用户运行（安全最佳实践）
USER bun

# 启动命令（使用 Bun 运行时）
CMD ["bun", "run", "dist/index.js"]
