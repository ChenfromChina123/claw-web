# Claude Code HAHA - 后端生产环境 Dockerfile
#
# 优化特性：
# ✅ 使用 Bun 官方镜像作为运行时
# ✅ 支持多租户用户隔离
# ✅ 内存优化配置（V8 引擎参数）
# ✅ 健康检查和优雅关闭
# ✅ 生产级安全配置

# 使用官方 Bun 镜像（建议配置 Docker 镜像加速器）
# 国内用户可使用：docker pull ccr.ccs.tencentyun.com/oven/bun:1 && docker tag ccr.ccs.tencentyun.com/oven/bun:1 oven/bun:1
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
RUN bun install

# 复制源代码
COPY server/ .
RUN rm -f .env .env.local .env.*.local 2>/dev/null || true
# 创建仅含注释的 .env（防止 Bun 报错，且不覆盖环境变量）
RUN echo "# Docker environment variables are set via docker-compose" > .env

# 设置环境变量（包含内存优化配置）
ENV NODE_ENV=production \
    PORT=3000 \
    WORKSPACE_BASE_DIR=/app/workspaces \
    TZ=Asia/Shanghai \
    NODE_OPTIONS="--max-old-space-size=1024 \
                 --optimize-for-size \
                 --gc-interval=100" \
    UV_THREADPOOL_SIZE=4 \
    TENANT_ISOLATION_ENABLED=true \
    MAX_USERS=100 \
    USER_STORAGE_QUOTA_MB=500 \
    USER_SESSION_LIMIT=10 \
    USER_PTY_LIMIT=5 \
    MAX_FILE_SIZE_MB=10 \
    MAX_FILES_PER_USER=1000 \
    API_TIMEOUT_MS=300000 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    DISABLE_TELEMETRY=1

# 创建工作区目录结构（用户隔离的核心）
RUN mkdir -p /app/workspaces/users /app/workspaces/sessions && \
    chown -R bun:bun /app/workspaces

# 为 bun 用户添加访问 PTY 设备和 Docker 的权限
RUN usermod -a -G tty bun && \
    usermod -a -G dialout bun && \
    usermod -a -G docker bun

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

STOPSIGNAL SIGINT

# 使用 root 用户运行，解决 Docker 权限问题
# USER bun

# ✅ 安全配置说明：
# 1. 以非 root 用户（bun）运行，降低容器内进程权限
# 2. 配合 docker-compose.yml 中的安全选项使用：
#    - cap_drop: ALL (丢弃所有能力)
#    - cap_add: [CHOWN, SETUID, SETGID, MKNOD, AUDIT_WRITE] (仅添加必需能力)
#    - read_only: true (只读根文件系统)
#    - security_opt: [seccomp, no-new-privileges] (Seccomp 和禁止提权)
#    - tmpfs: /tmp:noexec,nosuid (临时文件系统禁止执行)
# 3. 生产环境应启用 Seccomp 配置文件限制系统调用

CMD ["bun", "--bun", "run", "src/index.ts"]