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

# 构建阶段
FROM oven/bun:1 AS builder

WORKDIR /app

# 根据 ENTRY_POINT 参数复制对应的源代码和共享模块
COPY server/src/${ENTRY_POINT}/ ./src/
COPY server/src/shared/ ./src/shared/
COPY server/package.json server/bun.lockb* ./

# 安装生产依赖
RUN if [ -f bun.lockb ]; then bun install --production; fi

# ==================== 生产阶段 ====================
FROM oven/bun:1-slim AS production

# 设置环境变量
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

# 安装必要的系统依赖
RUN apk add --no-cache \
    curl \
    tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src

# 根据 ENTRY_POINT 复制对应的 tsconfig
COPY --from=builder /app/src/tsconfig.build.json ./src/tsconfig.json 2>/dev/null || true

# 创建必要目录
RUN mkdir -p /app/logs /app/workspaces/users

# 暴露端口
# - 3000: Master 公共 API 端口
# - 4000: Worker Internal API 端口
EXPOSE 3000 4000

# 健康检查（根据角色使用不同端点）
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}${HEALTH_PATH:-/api/health} || exit 1

# 默认启动命令（通过 docker-compose 覆盖）
CMD ["bun", "run", "src/index.ts"]
