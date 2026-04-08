# ===========================================
# 🚀 Docker 镜像加速配置指南
# ===========================================
#
# 由于网络原因无法直接访问 Docker Hub，
# 需要配置镜像加速器。以下是几种方案：
#
# ⚠️ 重要：配置后需要重启 Docker Desktop 才能生效！

## 方案一：Docker Desktop 配置镜像加速（推荐）

### Windows 系统：

1. **打开 Docker Desktop**
2. 点击右上角 **⚙️ 设置 (Settings)**
3. 左侧选择 **Docker Engine**
4. 在 JSON 配置中添加以下内容：

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io",
    "https://dockerhub.timeweb.cloud"
  ],
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false
}
```

5. 点击 **Apply & Restart** 按钮
6. 等待 Docker 重启完成（约 1-2 分钟）

### 验证配置成功：

```bash
docker info | findstr "Registry Mirrors"
# 应该看到你配置的镜像地址
```

---

## 方案二：使用命令行配置（高级用户）

### 创建/编辑 daemon.json 文件：

**Windows 路径：** `C:\Users\你的用户名\.docker\daemon.json`

```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me",
    "https://docker.m.daocloud.io"
  ]
}
```

### 重启 Docker 服务：

```bash
# 在 PowerShell (管理员) 中执行
Restart-Service docker
```

或在 Docker Desktop 中点击 **Restart**

---

## 方案三：使用代理服务器（如果你有 VPN/代理）

如果你有 HTTP/HTTPS 代理，可以在 Docker Desktop 中配置：

1. 打开 Docker Desktop → Settings → Resources → Proxies
2. 选择 "Manual proxy configuration"
3. 填写你的代理地址：
   - HTTP Proxy: `http://127.0.0.1:7890` （根据你的代理端口修改）
   - HTTPS Proxy: `http://127.0.0.1:7890`
4. Apply & Restart

---

## 方案四：离线/本地部署（无网络环境）

如果完全无法访问外网，可以：

1. **在有网络的机器上导出镜像：**
   ```bash
   docker save -o mysql-8.0.tar mysql:8.0
   docker save -o redis-7-alpine.tar redis:7-alpine
   docker save -o nginx-alpine.tar nginx:alpine
   ```

2. **传输到目标机器并加载：**
   ```bash
   docker load -i mysql-8.0.tar
   docker load -i redis-7-alpine.tar
   docker load -i nginx-alpine.tar
   ```

3. **然后正常启动服务：**
   ```bash
   docker compose up -d --build
   ```

---

## ✅ 配置完成后的启动步骤

### 1. 测试镜像拉取：

```bash
docker pull mysql:8.0
docker pull redis:7-alpine
```

如果能够成功拉取，说明配置生效！

### 2. 启动 Claude Code HAHA 服务：

```bash
cd d:\Users\Administrator\AistudyProject\HAHA\claude-code-haha

# 使用标准配置启动
docker compose up -d --build

# 或使用开发配置（内存占用更少）
docker compose -f docker-compose.cn.yml up -d --build
```

### 3. 查看服务状态：

```bash
docker compose ps
```

应该看到 4 个服务都在运行：
- claude-mysql (数据库)
- claude-redis (缓存)
- claude-backend (后端 API)
- claude-frontend (前端)

### 4. 访问服务：

- 前端界面：http://localhost:8080
- 后端 API：http://localhost:3000/api
- 健康检查：http://localhost:3000/api/health

### 5. 查看日志：

```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f mysql
```

---

## 🔧 常见问题排查

### 问题 1：仍然无法拉取镜像

**解决方案：**
1. 检查网络连接
2. 尝试更换其他镜像源
3. 检查是否有防火墙阻止
4. 尝试使用手机热点（排除局域网问题）

### 问题 2：容器启动失败

**查看错误日志：**
```bash
docker compose logs backend
docker inspect claude-backend
```

**常见原因：**
- 端口被占用（修改 .env 中的 PORT）
- 内存不足（调整 docker-compose.yml 中的 memory limits）
- 数据库连接失败（检查 DB_HOST 是否为 mysql）

### 问题 3：用户数据丢失

**不用担心！** 用户数据已迁移到：
- `docker-data/user-workspaces/` (用户主目录)
- `docker-data/session-workspaces/` (会话目录)

这些目录通过 Docker Volume 挂载到容器中，数据持久化保存。

---

## 📊 服务架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      Docker Network                         │
│                     (172.28.0.0/16)                        │
├──────────────┬──────────────┬──────────────┬───────────────┤
│              │              │              │               │
│  ┌────────┐  │  ┌────────┐  │  ┌────────┐  │  ┌─────────┐ │
│  │ Frontend│  │  │ Backend│  │  │  MySQL │  │  │  Redis  │ │
│  │ :8080   │──┼─▶│ :3000  │──┼─▶│ :3306  │  │  │ :6379   │ │
│  │ Nginx  │  │  │  Bun   │  │  │ 8.0    │  │  │ 7.x     │ │
│  └────────┘  │  └────────┘  │  └────────┘  │  └─────────┘ │
│              │              │              │               │
│   64MB RAM   │   512MB RAM  │   256MB RAM  │   96MB RAM   │
└──────────────┴──────────────┴──────────────┴───────────────┘
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   docker-data/      │
                    ├─ user-workspaces/   │ ◀── 用户隔离空间
                    ├─ session-workspaces/│ ◀── 会话隔离空间
                    └─ logs/              │
                    └────────────────────┘
```

---

## 🎯 下一步操作清单

- [ ] 1. 配置 Docker 镜像加速器（方案一/二/三选一）
- [ ] 2. 重启 Docker Desktop
- [ ] 3. 测试镜像拉取：`docker pull mysql:8.0`
- [ ] 4. 启动服务：`docker compose up -d --build`
- [ ] 5. 访问 http://localhost:8080 验证前端
- [ ] 6. 访问 http://localhost:3000/api/health 验证后端
- [ ] 7. 登录系统测试多租户隔离功能

---

**文档版本**: v1.0
**更新日期**: 2026年4月
