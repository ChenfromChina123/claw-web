# Claw-Web 部署指南

## 📦 快速部署（使用已有镜像）

### 步骤 1：上传镜像到服务器

#### 方法 A：使用 PowerShell 脚本（推荐）

在本地 PowerShell 中执行：

```powershell
cd d:\Users\Administrator\AistudyProject\claw-web
.\upload-to-server.ps1
```

脚本会自动：
- 检查镜像文件是否存在
- 如果不存在则创建镜像备份
- 压缩镜像文件
- 上传到服务器 `/opt/` 目录

#### 方法 B：手动 SCP 上传

```powershell
# 上传镜像
scp claw-web-images.zip root@8.163.46.149:/opt/

# 上传项目文件
scp docker-compose.yml root@8.163.46.149:/opt/claw-web/
scp .env root@8.163.46.149:/opt/claw-web/
```

### 步骤 2：在服务器上部署

SSH 登录服务器：
```bash
ssh root@8.163.46.149
```

上传部署脚本：
```bash
# 方式 1：使用 scp 上传
scp deploy-from-backup.sh root@8.163.46.149:/opt/

# 方式 2：直接在服务器上创建
cat > /opt/deploy-from-backup.sh << 'EOF'
[粘贴 deploy-from-backup.sh 的内容]
EOF
```

执行部署：
```bash
cd /opt
chmod +x deploy-from-backup.sh
./deploy-from-backup.sh
```

---

## 🔧 手动部署（详细步骤）

### 1. 加载 Docker 镜像

```bash
cd /opt
unzip claw-web-images.zip
docker load -i claw-web-images.tar
```

验证镜像：
```bash
docker images
# 应该看到：
# claw-web-master:latest
# claw-web-frontend:latest
# claw-web-backend-worker:latest
```

### 2. 配置环境变量

```bash
cd /opt/claw-web

# 复制环境变量文件
cp .env.example .env

# 编辑配置（可选）
vim .env
```

主要配置项：
```bash
# 数据库配置
MYSQL_ROOT_PASSWORD=clawweb2024
MYSQL_DATABASE=claw_web
MYSQL_USER=clawuser
MYSQL_PASSWORD=clawpass2024

# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# 内部通信 Token
MASTER_INTERNAL_TOKEN=internal-master-worker-token-2024
```

### 3. 启动服务

```bash
cd /opt/claw-web
docker-compose up -d
```

### 4. 验证部署

```bash
# 查看容器状态
docker-compose ps

# 查看 Master 日志
docker logs claw-web-master --tail 50

# 查看前端日志
docker logs claw-web-frontend --tail 20

# 测试 API
curl http://localhost:13000/api/info

# 测试前端
curl http://localhost
```

---

## 🌐 访问服务

### 本地访问
- **前端**：http://localhost
- **Master API**：http://localhost:13000
- **健康检查**：http://localhost:13000/api/info

### 服务器访问
- **前端**：http://8.163.46.149
- **Master API**：http://8.163.46.149:13000

---

## 🛠️ 常用命令

### 服务管理
```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 重启服务
docker-compose restart

# 重启单个服务
docker-compose restart master
```

### 日志查看
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看 Master 日志
docker logs claw-web-master -f

# 查看前端日志
docker logs claw-web-frontend -f

# 查看最近 100 行日志
docker logs claw-web-master --tail 100
```

### 容器管理
```bash
# 查看容器状态
docker-compose ps

# 进入容器
docker exec -it claw-web-master sh

# 查看容器资源使用
docker stats
```

---

## ❓ 故障排查

### 1. 容器启动失败

```bash
# 查看详细错误
docker-compose logs master

# 检查端口占用
netstat -tulpn | grep :3000

# 检查 Docker 服务
systemctl status docker
```

### 2. 数据库连接失败

```bash
# 查看 MySQL 日志
docker logs claw-web-mysql

# 测试数据库连接
docker exec claw-web-master curl mysql:3306
```

### 3. 健康检查失败

```bash
# 手动测试健康检查
curl http://localhost:13000/api/info

# 查看 Master 是否运行
docker exec claw-web-master ps aux
```

---

## 📊 系统要求

### 最低配置
- CPU: 2 核
- 内存：2GB（建议 4GB）
- 磁盘：20GB 可用空间

### 推荐配置
- CPU: 4 核
- 内存：8GB
- 磁盘：50GB SSD

---

## 🔐 安全建议

1. **修改默认密码**
   - 数据库密码
   - JWT Secret
   - Master Internal Token

2. **配置防火墙**
   ```bash
   # 只开放必要端口
   ufw allow 22/tcp    # SSH
   ufw allow 80/tcp    # HTTP
   ufw allow 443/tcp   # HTTPS（如果使用）
   ```

3. **定期备份**
   ```bash
   # 备份数据库
   docker exec claw-web-mysql mysqldump -u root -p claw_web > backup.sql
   
   # 备份镜像
   docker save claw-web-master:latest -o backup-master.tar
   ```

---

## 📞 获取帮助

如有问题，请检查：
1. 日志文件：`docker-compose logs`
2. 系统资源：`htop`、`df -h`
3. 网络连接：`ping 8.163.46.149`
