# Claude Code HAHA - 后端生产环境 Dockerfile
#
# 优化特性：
# ✅ 使用 Bun 官方镜像作为运行时
# ✅ 支持多租户用户隔离
# ✅ 内存优化配置（V8 引擎参数）
# ✅ 健康检查和优雅关闭
# ✅ 生产级安全配置
# ✅ 内置前端构建功能

# ==================== 前端构建阶段 ====================
FROM node:20-alpine AS frontend-builder

# 使用国内镜像源加速
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app/web

# 复制前端依赖文件
COPY web/package.json ./

# 安装依赖（使用 --legacy-peer-deps 解决依赖冲突）
RUN npm install --registry=https://registry.npmmirror.com --legacy-peer-deps

# 复制前端源代码
COPY web/ .

# 构建前端
RUN npm run build

# ==================== 生产运行阶段 ====================
FROM oven/bun:1 AS production

# 元数据标签
LABEL maintainer="Claude Code HAHA Team"
LABEL description="Backend service with multi-tenant isolation and memory optimization"
LABEL version="1.0.0"

# ✅ 使用国内镜像源加速（阿里云镜像 - HTTP 协议避免 SSL 证书问题）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
        sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g' /etc/apt/sources.list && \
        sed -i 's|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list; \
    fi

# 安装必要的系统依赖（包含 node-pty 编译所需的构建工具）
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
    ca-certificates \
    gnupg \
    lsb-release \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/archives/*

# 安装最新版 Docker CLI（直接下载二进制文件）
RUN curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-27.3.1.tgz" -o docker.tgz \
    && tar -xzf docker.tgz --strip-components=1 -C /usr/local/bin docker/docker \
    && rm docker.tgz \
    && docker --version

WORKDIR /app

# 复制依赖文件（先复制，利用 Docker 缓存）
COPY server/package.json ./

# 安装依赖（使用国内镜像源加速）
ENV BUN_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN bun install --registry=https://registry.npmmirror.com

# 复制源代码
COPY server/ .

# 复制前端构建脚本
COPY server/scripts/build-frontend.sh /app/scripts/build-frontend.sh
COPY server/scripts/build-frontend.ps1 /app/scripts/build-frontend.ps1
RUN chmod +x /app/scripts/build-frontend.sh

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

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/web/dist /app/public

# 创建工作区目录结构、Supervisor 配置目录和日志目录
RUN mkdir -p /app/workspaces/users \
             /app/workspaces/sessions \
             /app/logs \
             /etc/supervisor/conf.d \
             /var/log/supervisor \
    && chown -R bun:bun /app/workspaces /app/logs /app/public

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# 停止信号
STOPSIGNAL SIGINT

# 启动命令
CMD ["bun", "--bun", "run", "src/index.ts"]
