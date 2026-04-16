# Claw-Web Docker 部署指南

## 📋 快速开始

### 1️⃣ 环境要求

- **Docker**: 20.10+
- **Docker Compose**: v2.0+
- **内存**: 至少 4GB（推荐 8GB）
- **磁盘**: 至少 10GB 可用空间
- **操作系统**: Linux / macOS / Windows (WSL2)

### 2️⃣ 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置（必须修改以下项！）
nano .env
```

**⚠️ 生产环境必须修改的配置：**

```env
# 数据库密码（请使用强密码）
MYSQL_ROOT_PASSWORD=your-strong-password-here
MYSQL_PASSWORD=your-strong-password-here

# JWT 密钥（用于用户认证）
JWT_SECRET=your-random-jwt-secret-key-minimum-32-chars

# Master-Worker 内部通信 Token（保持 Master 和 Worker 一致）
MASTER_INTERNAL_TOKEN=your-internal-token-for-master-worker-comm

# Anthropic API Key（AI Agent 功能必需）
ANTHROPIC_AUTH_TOKEN=sk-ant-your-api-key-here
```

### 3️⃣ 启动服务

#### 方式一：使用启动脚本（推荐）

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh build    # 首次构建镜像
./start.sh          # 启动所有服务
```

**Windows:**
```cmd
start.bat build     # 首次构建镜像
start.bat           # 启动所有服务
```

#### 方式二：手动命令

```bash
# 构建镜像
docker compose build

# 启动服务
docker compose up -d

# 查看日志
docker compose logs -f
```

---

## 🏗️ 服务架构

```
┌─────────────────────────────────────────────────────┐
│                   用户浏览器                         │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP :80
                   ▼
┌─────────────────────────────────────────────────────┐
│              Frontend (Nginx)                       │
│         - 静态文件托管                               │
│         - API 反向代理                              │
│         - WebSocket 转发                            │
└──────────────────┬──────────────────────────────────┘
                   │ /api/*, /ws
                   ▼
┌─────────────────────────────────────────────────────┐
│              Master Service (Bun)                   │
│   Port: 3000                                        │
│   - 用户认证与授权 (JWT)                             │
│   - API 路由分发 (23个路由模块)                      │
│   - 容器编排调度                                    │
│   - WebSocket 管理                                  │
│   - 数据库操作                                      │
├──────────────────┬──────────────────────────────────┤
│                  │ Internal API / WS                │
│                  │ (X-Master-Token)                 │
│                  ▼                                  │
│        ┌─────────────────────┐                      │
│        │ Worker Service ×N   │                      │
│        │ Port: 4000 (内部)   │                      │
│        ├─────────────────────┤                      │
│        │ - 命令沙箱执行      │                      │
│        │ - PTY 终端管理      │                      │
│        │ - 文件系统操作       │                      │
│        └─────────────────────┘                      │
├──────────────────┬──────────────────────────────────┤
│                  │ MySQL Protocol                    │
│                  ▼                                  │
│        ┌─────────────────────┐                      │
│        │ MySQL 8.0           │                      │
│        │ Port: 3306          │                      │
│        └─────────────────────┘                      │
└─────────────────────────────────────────────────────┘
```

### 网络隔离设计

| 网络 | 成员 | 说明 |
|-----|------|------|
| `frontend-network` | Frontend, Nginx | 公共访问层 |
| `claude-network` | Master, MySQL | 控制层+数据层 |
| `worker-network` | Master, Workers | 执行层（**无法访问 MySQL**）|

**安全特性：**
- ✅ Worker 容器在独立网络，即使被攻破也无法直接访问数据库
- ✅ 所有 Master→Worker 通信需 Token 认证
- ✅ 每个用户分配独立 Worker 容器，完全隔离

---

## 📁 创建的文件清单

### Docker 配置文件

```
claw-web/
├── docker-compose.yml          # 服务编排配置 ⭐核心
├── server/Dockerfile            # 后端 Master/Worker 镜像 ⭐核心
├── web/Dockerfile              # 前端生产环境镜像（已存在）
├── web/Dockerfile.dev          # 前端开发环境镜像（已存在）
├── .dockerignore               # Docker 构建忽略规则
├── .env.example                # 环境变量模板
├── docker/
│   └── nginx.conf              # Nginx 反向代理配置
├── start.sh                    # Linux/macOS 启动脚本
└── start.bat                   # Windows 启动脚本
```

---

## 🔧 常用运维命令

### 服务管理

```bash
# 启动所有服务
docker compose up -d

# 停止所有服务
docker compose down

# 重启某个服务
docker compose restart master

# 查看服务状态
docker compose ps

# 查看资源占用
docker compose stats
```

### 日志查看

```bash
# 查看所有服务日志
docker compose logs -f --tail=100

# 仅查看 Master 日志
docker compose logs -f master

# 仅查看 Worker 日志
docker compose logs -f worker-template

# 仅查看 MySQL 日志
docker compose logs -f mysql
```

### 容器操作

```bash
# 进入 Master 容器 Shell
docker compose exec master /bin/sh

# 进入 Worker 容器 Shell
docker compose exec worker-template /bin/sh

# 进入 MySQL 命令行
docker compose exec mysql mysql -u clawuser -pclawpass2024 claw_web
```

### 数据备份

```bash
# 备份数据库
docker compose exec mysql mysqldump -u clawuser -pclawpass2024 claw_web > backup_$(date +%Y%m%d).sql

# 恢复数据库
cat backup_20260416.sql | docker exec -i claw-web-mysql mysql -u clawuser -pclawpass2024 claw_web
```

### 清理资源

```bash
# 停止并删除容器、网络
docker compose down

# 停止并删除容器、网络、卷（⚠️ 会删除所有数据！）
docker compose down -v

# 清理未使用的镜像
docker image prune -a

# 清理未使用的卷
docker volume prune
```

---

## 🌐 访问地址

启动成功后，可通过以下地址访问：

| 服务 | 地址 | 说明 |
|-----|------|------|
| **前端界面** | http://localhost | 主界面 |
| **Master API** | http://localhost:3000/api | 后端 API |
| **MySQL** | localhost:3306 | 数据库（仅内网） |

### API 端点示例

```bash
# 健康检查
curl http://localhost:3000/api/health

# 用户登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# 查看容器状态（需要认证）
curl http://localhost:3000/api/admin/containers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 🛠️ 开发模式

### 使用开发环境前端

修改 `docker-compose.yml`，将 frontend 服务替换为：

```yaml
frontend:
  build:
    context: .
    dockerfile: web/Dockerfile.dev
  ports:
    - "5173:5173"
  volumes:
    - ./web:/app  # 热重载源码
    - /app/node_modules
```

然后访问 http://localhost:5173

### 单独调试 Worker

Worker 默认不启动（使用 `profiles: worker`），如需调试：

```bash
# 启动包含 Worker 的完整服务
docker compose --profile worker up -d

# 或单独启动 Worker
docker compose run --rm worker-template
```

---

## ⚠️ 故障排查

### 常见问题

#### 1. MySQL 启动失败

```bash
# 查看详细错误日志
docker compose logs mysql

# 常见原因：
# - 端口 3306 被占用 → 修改 docker-compose.yml 中的 MYSQL_PORT
# - 权限不足 → 确保 Docker 有足够权限
# - 数据损坏 → 删除卷重建: docker volume rm claw-web-mysql-data
```

#### 2. Master 无法连接 MySQL

```bash
# 检查网络连通性
docker compose exec master curl mysql:3306

# 查看依赖状态
docker compose ps -a

# 常见原因：
# - MySQL 未就绪 → 等待健康检查通过
# - 网络配置错误 → 检查 networks 配置
```

#### 3. Worker 无法连接 Master

```bash
# 检查 Token 是否一致
docker compose exec master echo $MASTER_INTERNAL_TOKEN
docker compose exec worker-template echo $MASTER_INTERNAL_TOKEN

# 必须确保两个容器的 MASTER_INTERNAL_TOKEN 相同！
```

#### 4. 前端无法访问后端 API

```bash
# 检查 Nginx 配置
docker compose exec frontend cat /etc/nginx/conf.d/default.conf

# 测试反向代理
docker compose exec frontend curl http://master:3000/api/health

# 常见原因：
# - Master 未启动 → 先启动 master 服务
# - 网络问题 → 检查 frontend-network 是否正确
```

#### 5. 内存不足

```bash
# 查看内存使用
docker stats --no-stream

# 解决方案：
# 1. 减小 CONTAINER_POOL_MAX_SIZE（默认 10）
# 2. 降低 Worker 内存限制（deploy.resources.limits.memory）
# 3. 关闭不需要的服务
```

### 性能优化建议

1. **减少 Worker 数量**
   ```env
   CONTAINER_POOL_MIN_SIZE=1
   CONTAINER_POOL_MAX_SIZE=3
   ```

2. **启用 Docker Build Cache**
   ```bash
   # 不要每次都 --no-cache
   docker compose build  # 第二次构建会很快
   ```

3. **调整资源限制**
   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M  # 根据实际内存调整
   ```

---

## 🔒 安全加固建议

### 生产环境必做项

1. **✅ 修改所有默认密码**
   - MySQL root 密码
   - MySQL 用户密码
   - JWT Secret（至少 32 字符随机字符串）

2. **✅ 设置强 Token**
   - `MASTER_INTERNAL_TOKEN`: 至少 32 字符
   - 定期轮换 Token

3. **✅ 配置 HTTPS**
   - 使用 Let's Encrypt 证书
   - 或在负载均衡层终止 SSL

4. **✅ 限制网络暴露**
   - MySQL 仅监听内网（已实现）
   - Worker Internal API 不对外暴露（已实现）
   - 可考虑禁用 frontend 直接访问，通过反代

5. **✅ 启用日志审计**
   - 配置集中化日志收集（ELK/Loki）
   - 监控异常请求模式

6. **✅ 定期备份数据库**
   - 设置 Cron 定时备份
   - 备份文件存储到异地

---

## 📊 监控与告警

### 基础监控指标

| 指标 | 命令 | 正常值 |
|-----|------|--------|
| 服务状态 | `docker compose ps` | 全部 Up |
| CPU 使用率 | `docker stats` | < 80% |
| 内存使用率 | `docker stats` | < 85% |
| 磁盘空间 | `df -h` | > 20% 可用 |
| 容器数量 | `docker ps -q \| wc -l` | 符合预期 |

### 健康检查端点

```bash
# Master 健康
curl http://localhost:3000/api/health

# Worker 健康（从 Master 内部）
curl http://worker-host:4000/internal/health

# 前端可访问
curl http://localhost/
```

---

## 🔄 升级指南

### 更新到新版本

```bash
# 1. 备份数据
./start.sh backup

# 2. 拉取新代码
git pull origin main

# 3. 重新构建镜像
./start.sh build

# 4. 重启服务（零停机滚动更新）
docker compose up -d --no-deps master worker-template

# 5. 验证服务
./start.sh status
```

### 回滚版本

```bash
# 回滚到上一版本
git checkout HEAD~1
docker compose up -d --force-recreate
```

---

## 📞 技术支持

遇到问题时：

1. 查看本文档的「故障排查」章节
2. 检查 GitHub Issues: [项目地址]
3. 提交 Issue 时请附上：
   - 操作系统和 Docker 版本
   - 完整的错误日志 (`docker compose logs`)
   - 复现步骤
   - `.env` 文件中的敏感信息请脱敏

---

**文档版本**: v1.0  
**最后更新**: 2026-04-16  
**适用版本**: Claw-Web Master-Worker Architecture
