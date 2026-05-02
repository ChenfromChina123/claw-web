# Claw-Web 一键部署脚本

## 📖 概述

这是一个从零开始的一键部署脚本，适用于**没有任何工具的纯 Linux 环境**（仅需已安装 Docker）。

**当前部署分支**: `feature/api-auth-enhancement`

---

## 🚀 快速开始

### 方法 1：完整交互式部署（推荐）

```bash
# 1. 下载脚本（如果还没有项目代码）
curl -fsSL https://raw.githubusercontent.com/ChenfromChina123/claw-web/feature/api-auth-enhancement/deploy/deploy.sh -o deploy.sh

# 2. 赋予执行权限
chmod +x deploy.sh

# 3. 以 root 用户运行
sudo ./deploy.sh
```

### 方法 2：从项目代码部署

```bash
# 1. 克隆项目
git clone -b feature/api-auth-enhancement https://github.com/ChenfromChina123/claw-web.git
cd claw-web

# 2. 运行部署脚本
chmod +x deploy/deploy.sh
sudo ./deploy/deploy.sh
```

### 方法 3：验证部署状态

```bash
# 部署后运行验证脚本
sudo ./deploy/verify.sh
```

---

## 📋 部署选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `--quick` | 快速模式（使用默认配置） | `sudo ./deploy.sh --quick` |
| `--reset` | 重置所有数据后重新部署 | `sudo ./deploy.sh --reset` |
| `--status` | 查看服务运行状态 | `sudo ./deploy.sh --status` |
| `--logs` | 查看实时日志 | `sudo ./deploy.sh --logs` |
| `--stop` | 停止所有服务 | `sudo ./deploy.sh --stop` |
| `--help` | 显示帮助信息 | `sudo ./deploy.sh --help` |

---

## 🔧 部署流程

```
┌─────────────────────────────────────────────────────┐
│              一键部署流程（全自动）                   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1️⃣  权限检查 (必须以 root 运行)                      │
│         ↓                                           │
│  2️⃣  自动安装 Docker (如未安装)                      │
│         ↓                                           │
│  3️⃣  自动安装 Git (如未安装)                         │
│         ↓                                           │
│  4️⃣  系统资源检查 (CPU/内存/磁盘)                    │
│         ↓                                           │
│  5️⃣  克隆项目代码 (指定分支)                         │
│         ↓                                           │
│  6️⃣  生成交互式 .env 配置                            │
│         ↓                                           │
│  7️⃣  构建 Docker 镜像                              │
│         ↓                                           │
│  8️⃣  启动服务 (MySQL → Master → Frontend)          │
│         ↓                                           │
│  9️⃣  健康检查 & 显示访问地址 ✅                      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 前置条件

### 支持的 Linux 发行版
- **Ubuntu**: 20.04, 22.04, 24.04
- **Debian**: 10, 11, 12
- **CentOS**: 7, 8
- **RHEL**: 7, 8, 9
- **Fedora**: 36, 37, 38
- **AlmaLinux**: 8, 9
- **Rocky Linux**: 8, 9

### 最低要求
- **Docker**: 已安装（如未安装会自动安装）
- **磁盘空间**: ≥ 20 GB 可用空间

### 推荐配置
- **CPU**: ≥ 4 核
- **内存**: ≥ 8 GB
- **磁盘**: ≥ 50 GB SSD

---

## 🌐 访问地址

部署成功后，脚本会显示访问地址：

| 服务 | 默认地址 | 说明 |
|------|---------|------|
| **前端界面** | `http://<服务器IP>:80` | Web UI |
| **API 接口** | `http://<服务器IP>:13000/api` | REST API |
| **MySQL** | `<服务器IP>:23306` | 数据库 |

---

## ⚙️ 配置说明

### 必须配置的变量

编辑 `/opt/claw-web/.env` 文件：

```bash
# 1. LLM API Key（二选一）

# 选项 A: 通义千问（推荐）
QWEN_API_KEY=sk-your-key-here
LLM_PROVIDER=qwen
LLM_MODEL=qwen-plus

# 选项 B: Anthropic Claude
ANTHROPIC_AUTH_TOKEN=sk-ant-xxx
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514

# 2. 修改默认密码（生产环境必须！）
MYSQL_ROOT_PASSWORD=your_secure_password
JWT_SECRET=your_secure_secret
MASTER_INTERNAL_TOKEN=your_secure_token
```

### 可选配置

```bash
# SMTP 邮件服务（用于验证码）
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=your_email@qq.com
SMTP_PASS=your_smtp_password
```

---

## 🔍 常用运维命令

### 查看服务状态
```bash
cd /opt/claw-web
docker compose ps
```

### 查看日志
```bash
# 查看所有服务日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f master
docker compose logs -f frontend
```

### 重启服务
```bash
# 重启所有服务
docker compose restart

# 重启特定服务
docker compose restart master
```

### 更新代码
```bash
cd /opt/claw-web
git pull origin feature/api-auth-enhancement
docker compose build master
docker compose restart master
```

### 备份数据
```bash
# 备份 MySQL 数据库
docker exec claw-web-mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} claw_web > backup.sql

# 备份工作区数据
tar -czf workspaces-backup.tar.gz /data/claws/workspaces
```

---

## 🐛 故障排查

### 1. 服务启动失败

```bash
# 查看 Docker 日志
docker compose logs master

# 检查端口占用
netstat -tulpn | grep :13000

# 检查磁盘空间
df -h
```

### 2. 数据库连接失败

```bash
# 检查 MySQL 状态
docker exec claw-web-mysql mysqladmin -u root -p status

# 重置数据库
docker compose down -v
docker compose up -d mysql
```

### 3. 前端无法访问

```bash
# 检查前端容器
docker ps | grep frontend

# 查看前端日志
docker compose logs frontend

# 检查防火墙
ufw status
```

---

## 📊 分支说明

**当前部署分支**: `feature/api-auth-enhancement`

这是当前开发分支，包含：
- ✅ API 认证增强功能
- ✅ Qwen LLM 完整支持
- ✅ 文件写入后前端自动刷新
- ✅ 增强的错误处理和日志

---

## 🔒 安全建议

1. **修改所有默认密码**
   - MySQL root 密码
   - JWT Secret
   - Master Internal Token

2. **配置防火墙**
   ```bash
   # 仅开放必要端口
   ufw allow 80/tcp    # HTTP
   ufw allow 443/tcp   # HTTPS (如果配置 SSL)
   ufw enable
   ```

3. **定期备份**
   ```bash
   # 添加到 crontab
   0 2 * * * cd /opt/claw-web && ./backup.sh
   ```

4. **监控磁盘空间**
   ```bash
   # 启用 Docker 自动清理
   docker system prune -af --volumes --filter "until=24h"
   ```

---

## 📞 获取帮助

- **GitHub Issues**: https://github.com/ChenfromChina123/claw-web/issues
- **文档**: https://github.com/ChenfromChina123/claw-web/wiki

---

## 📝 版本历史

| 版本 | 日期 | 更新内容 |
|------|------|----------|
| v1.0 | 2026-04-18 | 初始版本，支持一键部署 |
| v1.1 | 2026-04-18 | 添加分支指定功能 |
| v1.2 | 2026-04-18 | 修复 Bash 注释语法错误，添加 CentOS/RHEL/Fedora 支持 |
| v1.3 | 2026-05-01 | 同步记录安卓端流式与数据库性能修复（事件可靠投递、缓存刷新、Schema 版本） |

---

**最后更新**: 2026-05-01  
**维护者**: Claw-Web Team
