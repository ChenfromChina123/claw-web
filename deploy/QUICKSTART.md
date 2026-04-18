# Claw-Web 部署脚本 - 快速使用指南

## 🚀 一键部署（从零开始）

### 前提条件
- 全新的 Linux 服务器
- 已安装 Docker（如未安装会自动安装）
- root 权限

### 部署步骤

```bash
# 1. 下载脚本
curl -fsSL https://raw.githubusercontent.com/ChenfromChina123/claw-web/feature/api-auth-enhancement/deploy/deploy.sh -o deploy.sh

# 2. 赋予执行权限
chmod +x deploy.sh

# 3. 运行部署（会自动安装 Docker 和 Git）
sudo ./deploy.sh
```

## 📋 部署后配置

### 1. 配置 LLM API Key

编辑 `/opt/claw-web/.env` 文件：

```bash
# 通义千问（推荐）
QWEN_API_KEY=sk-your-key-here
LLM_PROVIDER=qwen
LLM_MODEL=qwen-plus
```

### 2. 重启服务生效

```bash
cd /opt/claw-web
docker compose restart master
```

## 🔧 常用命令

```bash
# 查看服务状态
sudo ./deploy.sh --status

# 查看实时日志
sudo ./deploy.sh --logs

# 停止服务
sudo ./deploy.sh --stop

# 重置所有数据（危险！）
sudo ./deploy.sh --reset
```

## 🌐 访问地址

- **前端界面**: `http://<服务器IP>:80`
- **API 接口**: `http://<服务器IP>:13000/api`

## 🐛 故障排查

### 脚本报错 `/bin: Is a directory`

**原因**: Bash 不支持 `/** */` 注释语法

**解决**: 已修复！请使用最新版本的脚本。

### 服务启动失败

```bash
# 查看详细日志
docker compose logs master

# 检查 Docker 状态
docker ps

# 检查端口占用
netstat -tulpn | grep :13000
```

## 📝 版本

- **当前分支**: `feature/api-auth-enhancement`
- **脚本版本**: v1.1 (已修复注释语法问题)
