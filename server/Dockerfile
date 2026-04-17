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

WORKDIR /app

# 根据 ENTRY_POINT 参数复制对应的源代码和共享模块
COPY server/src/${ENTRY_POINT}/ ./src/
COPY server/src/shared/ ./src/shared/
COPY server/package.json server/bun.lock* ./

# 安装生产依赖
RUN if [ -f bun.lock ]; then bun install --production; fi

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

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

# 暴露端口
EXPOSE 3000 4000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]

# ==================== Worker 生产阶段 ====================
FROM oven/bun:1 AS production-worker

# Debian 使用 apt-get 安装工具
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

# 暴露端口
EXPOSE 3000 4000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "run", "src/index.ts"]
