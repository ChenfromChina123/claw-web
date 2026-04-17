# Docker 构建优化方案 - 代码实时更新篇

## 🎯 核心目标
**修改代码后无需重建镜像，秒级同步到容器中**

---

## 🔍 当前问题分析

### 构建慢的核心原因

#### 1. **使用了 `--no-cache` 标志**
每次构建都从头开始，无法利用缓存层。

#### 2. **代码更新流程低效**
当前流程：
```
修改代码 → docker-compose build --no-cache (5-10 分钟) → 重启容器 → 生效
```

理想流程：
```
修改代码 → 自动同步到容器 → 自动重载 (秒级) → 生效
```

---

## 🚀 优化方案 - 代码实时更新

### 📌 方案对比

| 方案 | 适用场景 | 更新速度 | 实施难度 |
|------|----------|----------|----------|
| **方案 1：Bind Mount（强烈推荐）** | 日常开发 | 秒级 | ⭐ |
| 方案 2：Docker Compose 热重载 | 后端开发 | 秒级 | ⭐⭐ |
| 方案 3：优化构建缓存 | 生产部署 | 分钟级 | ⭐⭐ |

---

## 🎯 方案 1：Bind Mount + 热重载（强烈推荐）

**核心思路**：将代码目录挂载到容器中，利用 Bun 和 Vite 的热重载功能

### 1.1 创建开发环境配置文件

创建 `docker-compose.dev.yml`：

```yaml
# docker-compose.dev.yml
# 开发环境专用配置 - 代码实时同步

version: '3.8'

services:
  # ==================== Master 服务（开发模式）====================
  master:
    # 复用主配置，覆盖开发特定设置
    volumes:
      # ✅ 关键：挂载源代码，修改后自动同步到容器
      - ./server/src:/app/src:ro
      - ./server/shared:/app/shared:ro
      - master_logs:/app/logs
      - ${HOST_WORKSPACE_PATH:-/data/claws/workspaces}:/app/workspaces
      - /var/run/docker.sock:/var/run/docker.sock
    
    # ✅ 使用 Bun 的热重载模式
    command: ["bun", "run", "--watch", "src/index.ts"]
    
    # 开发环境不需要资源限制
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 2G

  # ==================== Worker 服务（开发模式）====================
  worker:
    image: claw-web-backend-worker:latest
    volumes:
      # ✅ 挂载 Worker 源代码
      - ./server/src:/app/src:ro
      - ./server/shared:/app/shared:ro
      - worker_workspace:/workspace
      - worker_logs:/app/logs
    
    # ✅ 使用 Bun 的热重载模式
    command: ["bun", "run", "--watch", "src/index.ts"]
    
    environment:
      # 开发环境配置
      NODE_ENV: development
      PTY_ENABLED: "true"
    
    networks:
      - worker-network
    
    # 开发环境增加资源
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1G

  # ==================== Frontend 服务（开发模式）====================
  frontend:
    # ✅ 使用 Vite 开发服务器而非 Nginx
    command: ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "80"]
    
    volumes:
      # ✅ 挂载前端源代码
      - ./web/src:/app/src:ro
      - ./web/public:/app/public:ro
      - ./web/vite.config.ts:/app/vite.config.ts:ro
      - ./web/index.html:/app/index.html:ro
    
    environment:
      - NODE_ENV=development
      - VITE_FEATURE_PTY_SHELL=true
      - VITE_API_BASE_URL=http://localhost:3000
```

### 1.2 使用方式

```bash
# 步骤 1：首次构建镜像（只需要执行一次）
docker-compose build

# 步骤 2：启动开发环境（代码修改后自动重载）
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# 步骤 3：修改代码
# - 后端：保存文件后，Bun 自动检测并重载（2-3 秒）
# - 前端：保存文件后，Vite HMR 热更新（毫秒级）
```

### 1.3 优势

✅ **秒级更新**：修改代码后无需重建镜像  
✅ **保持状态**：容器不重启，内存状态保留  
✅ **开发体验好**：前端 HMR，后端热重载  
✅ **隔离性好**：开发配置不影响生产  

---

## 🎯 方案 2：Docker Compose Watch（Docker 新特性）

**核心思路**：使用 Docker Compose 的 watch 功能自动同步代码

### 2.1 修改 docker-compose.yml

在现有配置基础上添加 `develop` 配置：

```yaml
services:
  master:
    build:
      context: .
      dockerfile: server/Dockerfile
      target: production-master
    develop:
      watch:
        # ✅ 监控代码变化，自动同步到容器
        - path: ./server/src/
          action: sync
          target: /app/src
          ignore:
            - node_modules/
        
        # ✅ 代码变化后自动重启服务
        - path: ./server/shared/
          action: sync+restart
          target: /app/shared
        
        # ✅ 监控 package.json，自动重新安装依赖
        - path: ./server/package.json
          action: rebuild
          target: /app/package.json

  frontend:
    build:
      context: .
      dockerfile: web/Dockerfile
    develop:
      watch:
        - path: ./web/src/
          action: sync
          target: /app/src
        - path: ./web/vite.config.ts
          action: sync+restart
          target: /app/vite.config.ts
```

### 2.2 使用方式

```bash
# 启动 watch 模式（Docker Compose v2.20+）
docker-compose up --watch
```

### 2.3 优势

✅ **自动化**：无需手动重启容器  
✅ **细粒度控制**：可配置不同文件的不同行为  
✅ **Docker 原生**：无需额外配置文件  

### 2.4 限制

⚠️ 需要 Docker Compose v2.20+  
⚠️ Windows 上性能可能不如 Linux  

---

## 🎯 方案 3：优化构建缓存（生产环境）

**核心思路**：优化 Dockerfile 层缓存，减少构建时间

### 3.1 优化 server/Dockerfile

```dockerfile
# ==================== 构建阶段 ====================
FROM oven/bun:1 AS builder

ARG ENTRY_POINT=master

# 安装编译工具（系统依赖变化少，放前面）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ✅ 关键优化：先复制依赖文件（变化少）
COPY server/package.json server/bun.lock* ./

# ✅ 安装依赖（package.json 不变时使用缓存）
RUN if [ -f bun.lock ]; then bun install --production; else bun install --production; fi

# ✅ 再复制源代码（代码变化不影响依赖层）
COPY server/src/shared/ ./src/shared/
COPY server/src/shared/ ./shared/

# 根据 ENTRY_POINT 复制对应代码
COPY server/src/master/ /tmp/master-src/
COPY server/src/worker/ /tmp/worker-src/
RUN mkdir -p ./src && \
    if [ "$ENTRY_POINT" = "worker" ]; then \
        cp -r /tmp/worker-src/* ./src/; \
    else \
        cp -r /tmp/master-src/* ./src/; \
    fi && \
    rm -rf /tmp/master-src /tmp/worker-src
```

### 3.2 优化 web/Dockerfile

```dockerfile
# ==================== 构建阶段 ====================
FROM node:20-alpine AS builder

# ✅ 使用国内镜像源
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app

# ✅ 先复制依赖文件
COPY web/package.json web/package-lock.json ./

# ✅ 使用国内 npm 镜像
RUN npm install --legacy-peer-deps --registry=https://registry.npmmirror.com

# ✅ 再复制源代码
COPY web/ .

# ✅ 构建优化
ENV NODE_ENV=production
ENV VITE_FEATURE_PTY_SHELL=true
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx vite build
```

### 3.3 使用方式

```bash
# 日常构建（使用缓存）
docker-compose build

# 只构建特定服务（更快）
docker-compose build master
docker-compose build frontend

# 强制重建（仅当必要时）
docker-compose build --no-cache master
```

---

## 📊 优化效果对比

| 场景 | 优化前 | 优化后（方案 1） | 优化后（方案 3） | 提升 |
|------|--------|----------------|----------------|------|
| 首次构建 | 5-10 分钟 | 5-10 分钟 | 5-10 分钟 | - |
| 代码修改后 | 5-10 分钟 | **2-3 秒** | 30 秒 -2 分钟 | **99%** |
| 依赖修改后 | 5-10 分钟 | 1-2 分钟 | 1-3 分钟 | **80%** |
| 前端修改后 | 5-10 分钟 | **毫秒级** | 30 秒 -1 分钟 | **99.9%** |

---

## 🎯 推荐实践

### 日常开发流程（推荐方案 1）

```bash
# 步骤 1：首次构建（只需一次）
docker-compose build

# 步骤 2：启动开发环境
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# 步骤 3：开始编码
# - 后端：保存文件 → Bun 自动重载（2-3 秒）
# - 前端：保存文件 → Vite HMR（毫秒级）
```

### 生产部署流程（推荐方案 3）

```bash
# 使用缓存加速构建
docker-compose build --parallel

# 或使用 buildx 优化缓存
docker buildx build --cache-from type=registry,ref=claw-web-master:latest \
  --cache-to type=inline \
  -t claw-web-master:latest \
  -f server/Dockerfile .
```

---

## ⚠️ 注意事项

### Windows 特定问题

1. **文件监听性能**
   - Windows 上文件监听可能不如 Linux 灵敏
   - 如遇到问题，可尝试使用 WSL2

2. **路径问题**
   - 确保使用正斜杠 `/` 或双反斜杠 `\\`
   - Windows 路径示例：`D:/Users/Administrator/AistudyProject/claw-web`

3. **权限问题**
   - 确保 Docker Desktop 有权限访问项目目录
   - 在 Docker Desktop 设置中添加项目目录

### 性能优化技巧

1. **排除不必要的文件**
   ```yaml
   # .dockerignore
   node_modules/
   dist/
   *.log
   .git/
   ```

2. **使用 .dockerignore 减少上下文**
   - 排除大文件
   - 排除不需要的配置文件

3. **定期清理 Docker**
   ```bash
   # 清理悬空镜像
   docker image prune -f
   
   # 清理所有未使用资源
   docker system prune -a
   ```

---

## 📝 总结

### 最佳实践

1. ✅ **开发环境**：使用 `docker-compose.dev.yml` + Bind Mount
2. ✅ **生产环境**：使用优化后的 Dockerfile + 缓存策略
3. ✅ **前端**：Vite HMR 实现毫秒级热更新
4. ✅ **后端**：Bun `--watch` 实现秒级热重载

### 核心原则

- **开发求快**：秒级更新，保持状态
- **生产求稳**：完整构建，确保一致性
- **缓存优先**：充分利用 Docker 层缓存
- **按需重建**：只重建必要的服务

### 实施步骤

1. 创建 `docker-compose.dev.yml`（方案 1）
2. 启动开发环境：`docker-compose -f docker-compose.yml -f docker-compose.dev.yml up`
3. 享受秒级代码更新！
