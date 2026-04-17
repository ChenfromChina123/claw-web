# Claw-Web Backend - Master/Worker 服务 Dockerfile
#
# 支持双模式：
# - Master: 控制层（认证、数据库、容器编排）
# - Worker: 执行层（沙箱、命令执行、PTY）
#
# 使用 Bun 运行时优化性能
# 多阶段构建减小镜像体积

# 支持构建参数：ENTRY_POINT=master 或 worker
ARG ENTRY_POINT=master

# ==================== Docker CLI 阶段 ====================
FROM docker:cli AS docker-cli

# ==================== 构建阶段 ====================
FROM oven/bun:1 AS builder

ARG ENTRY_POINT=master

# 安装原生模块编译所需的工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ✅ 关键优化：先复制依赖文件（变化少，利用缓存）
COPY server/package.json server/bun.lock* ./

# ✅ 安装依赖（package.json 不变时复用缓存层）
# node-pty 等原生模块在此阶段编译
RUN if [ -f bun.lock ]; then bun install --production; else bun install --production; fi

# ✅ 再复制源代码（代码变化不影响依赖层缓存）
COPY server/src/shared/ ./src/shared/
COPY server/src/shared/ ./shared/

# 根据 ENTRY_POINT 复制对应代码到临时目录，再选择
COPY server/src/master/ /tmp/master-src/
COPY server/src/worker/ /tmp/worker-src/
RUN mkdir -p ./src && \
    if [ "$ENTRY_POINT" = "worker" ]; then \
        cp -r /tmp/worker-src/* ./src/; \
    else \
        cp -r /tmp/master-src/* ./src/; \
    fi && \
    rm -rf /tmp/master-src /tmp/worker-src

# ==================== Master 生产阶段 ====================
FROM debian:bookworm-slim AS production-master

# 安装基础工具和 Bun
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && cp /root/.bun/bin/bun /usr/local/bin/ \
    && rm -rf /var/lib/apt/lists/*

# 复制 docker CLI 到容器中
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN chmod +x /usr/local/bin/docker

WORKDIR /app

# 从构建阶段复制产物（CACHE_BUST: 随 ENTRY_POINT 变化而失效）
ARG CACHE_BUST=master
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/shared ./shared

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

# 暴露端口
EXPOSE 3000 4000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]

# ==================== Worker 生产阶段 ====================
# 重要：使用 Node.js 而不是 Bun！
# node-pty 是原生模块，Bun 不支持其使用的 libuv 函数（uv_version_string）
FROM node:20-slim AS production-worker

# 安装工具链和运行时依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
# 复制共享模块到容器内，供 Worker 使用
COPY --from=builder /app/shared ./shared

# 确保 node_modules 中的原生模块已正确编译（node-pty）
# node-pty 是原生模块，需要在 Linux 环境下重新安装以获取正确的预编译二进制文件
RUN cd /app && rm -rf node_modules/node-pty && npm install node-pty@1.1.0 --build-from-source

# 安装 tsx 用于运行 TypeScript（比 ts-node 更快）
RUN npm install -g tsx

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

# 暴露端口
EXPOSE 3000 4000

# 健康检查（Worker 内部 API 在 4000 端口）
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:4000/internal/health || exit 1

# Worker 容器入口：使用 Node.js + tsx 运行 TypeScript
ENTRYPOINT ["node"]
CMD ["--import", "tsx", "src/index.ts"]
