# Claude Code HAHA - 后端生产环境 Dockerfile
#
# 优化特性：
# ✅ 使用 Bun 官方镜像作为运行时
# ✅ 支持多租户用户隔离
# ✅ 内存优化配置（V8 引擎参数）
# ✅ 健康检查和优雅关闭
# ✅ 生产级安全配置

# 使用官方 Bun 镜像
FROM oven/bun:1 AS production

# 元数据标签
LABEL maintainer="Claude Code HAHA Team"
LABEL description="Backend service with multi-tenant isolation and memory optimization"
LABEL version="1.0.0"

# ✅ 使用国内镜像源加速（阿里云镜像 - HTTP 协议避免 SSL 证书问题）
RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources

# 安装必要的系统依赖（包含 node-pty 编译所需的构建工具和 docker 客户端）
# ✅ 安全优化：移除不必要的工具，减少攻击面
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    curl \
    tzdata \
    bash \
    python3 \
    make \
    g++ \
    gcc \
    docker.io \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/archives/*

WORKDIR /app

# 复制依赖文件（先复制，利用 Docker 缓存）
COPY server/package.json ./

# 安装依赖（使用国内镜像源加速）
ENV BUN_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN bun install --registry=https://registry.npmmirror.com

# 复制源代码
COPY server/ .

# 复制 Supervisor 主配置文件
COPY server/config/supervisord.conf /etc/supervisor/supervisord.conf

# 清理环境变量文件（防止覆盖docker-compose设置）
RUN rm -f .env .env.local .env.*.local 2>/dev/null || true && \
    echo "# Environment variables set by container orchestrator" > .env

# 设置环境变量
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_DIR=/app/workspaces \
    TZ=Asia/Shanghai \
    # 内存优化
    NODE_OPTIONS="--max-old-space-size=512" \
    UV_THREADPOOL_SIZE=4 \
    # 租户隔离配置
    TENANT_ISOLATION_ENABLED=true \
    CONTAINER_ROLE=master

# 创建工作区目录结构、Supervisor 配置目录和日志目录
RUN mkdir -p /app/workspaces/users \
             /app/workspaces/sessions \
             /app/logs \
             /etc/supervisor/conf.d \
             /var/log/supervisor \
    && chown -R bun:bun /app/workspaces /app/logs

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 停止信号
STOPSIGNAL SIGINT

# 启动命令
CMD ["bun", "--bun", "run", "src/index.ts"]
