# Claw-Web Backend - Master/Worker 服务 Dockerfile
#
# 支持双模式：
# - Master: 控制层（认证、数据库、容器编排）- 不需要 node-pty
# - Worker: 执行层（沙箱、命令执行、PTY）- 需要 node-pty
#
# 优化：
# - Master 和 Worker 使用独立的构建阶段
# - Master 不安装编译工具，不编译 node-pty
# - Worker 安装完整工具链

# ==================== 公共阶段：Docker CLI ====================
FROM docker:cli AS docker-cli

# ==================== Master 构建阶段 ====================
FROM node:20-slim AS master-builder

WORKDIR /app

# 只复制 Master 需要的依赖文件
COPY server/package.json server/package-lock.json* ./

# 配置 npm 使用国内镜像并安装依赖
# 使用 --ignore-scripts 跳过原生模块编译（node-pty 不需要）
# 然后单独安装 sharp（使用预编译版本）
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --production --ignore-scripts && \
    npm install @img/sharp-linux-x64 --save-optional

# 复制源代码
COPY server/src/shared/ ./src/shared/
COPY server/src/shared/ ./shared/
COPY server/src/master/ ./src/

# ==================== Master 生产阶段 ====================
# 使用 Bun 运行时（代码使用了 Bun.serve 等 Bun 特有 API）
FROM oven/bun:1-debian AS production-master

# 安装最小依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 复制 docker CLI
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
RUN chmod +x /usr/local/bin/docker

WORKDIR /app

# 从构建阶段复制产物
COPY --from=master-builder /app/node_modules ./node_modules
COPY --from=master-builder /app/src ./src
COPY --from=master-builder /app/shared ./shared

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]

# ==================== Worker 构建阶段 ====================
FROM oven/bun:1 AS worker-builder

# 安装原生模块编译所需的工具链（只有 Worker 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖文件
COPY server/package.json server/bun.lock* ./

# 安装所有依赖（包括 node-pty）
RUN bun install --production

# 复制源代码
COPY server/src/shared/ ./src/shared/
COPY server/src/shared/ ./shared/
COPY server/src/worker/ ./src/

# ==================== Worker 生产阶段 ====================
# 重要：使用 Node.js 而不是 Bun！
# node-pty 是原生模块，Bun 不支持其使用的 libuv 函数
FROM node:20-slim AS production-worker

# 安装工具链和运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3-full \
    python3-pip \
    python3-venv \
    python3-dev \
    make \
    g++ \
    wget \
    iputils-ping \
    dnsutils \
    net-tools \
    iproute2 \
    openssh-client \
    rsync \
    vim-tiny \
    nano \
    procps \
    tree \
    less \
    file \
    traceroute \
    whois \
    ca-certificates \
    git \
    htop \
    jq \
    zip \
    unzip \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制产物
COPY --from=worker-builder /app/node_modules ./node_modules
COPY --from=worker-builder /app/src ./src
COPY --from=worker-builder /app/shared ./shared

# 确保 node-pty 使用 Node.js 预编译版本
RUN cd /app && rm -rf node_modules/node-pty && npm install node-pty@1.1.0
RUN cd /app && npm install ws @types/ws tsx

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

EXPOSE 4000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4000/internal/health || exit 1

# 使用 Node.js + tsx 运行 TypeScript
ENTRYPOINT ["node"]
CMD ["--import", "./node_modules/tsx/dist/loader.mjs", "src/index.ts"]
