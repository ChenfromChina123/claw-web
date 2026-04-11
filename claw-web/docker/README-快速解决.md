# 🚀 Docker 国内镜像快速启动

## 问题说明

您当前遇到的构建缓慢问题是因为 Docker 需要从海外 Docker Hub 下载基础镜像。

## ⚡ 3 分钟快速解决

### 步骤 1：运行自动配置脚本

以**管理员身份**打开 PowerShell，执行：

```powershell
cd d:\Users\Administrator\AistudyProject\HAHA\claude-code-haha\docker
.\configure-docker-mirror.ps1
```

### 步骤 2：重启 Docker Desktop

脚本会提示您重启 Docker Desktop，选择 `y` 自动重启，或手动重启。

### 步骤 3：重新构建

```bash
docker compose -f docker-compose.cn-fast.yml up -d --build
```

## 📋 如果自动脚本不起作用

### 手动配置 Docker Desktop

1. 打开 Docker Desktop
2. 点击 Settings ⚙️ → Docker Engine
3. 将以下 JSON 粘贴到配置框中：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://registry.docker-cn.com"
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

4. 点击 **Apply & Restart**

### 或者：手动拉取镜像

```bash
# 拉取基础镜像
docker pull registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine
docker pull ccr.ccs.tencentyun.com/oven/bun:1
docker pull registry.cn-hangzhou.aliyuncs.com/library/nginx:1.25-alpine

# 重命名标签
docker tag registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine node:20-alpine
docker tag ccr.ccs.tencentyun.com/oven/bun:1 oven/bun:1
docker tag registry.cn-hangzhou.aliyuncs.com/library/nginx:1.25-alpine nginx:1.25-alpine

# 重新构建
docker compose -f docker-compose.cn.yml up -d --build
```

## ✅ 验证配置成功

```bash
# 检查镜像加速器
docker info | findstr "Registry Mirrors"

# 应该能看到配置的镜像源地址
```

## 📊 预期效果

| 配置前 | 配置后 |
|-------|-------|
| 构建 30-60 分钟 | 构建 5-15 分钟 |
| 下载速度 50KB/s | 下载速度 5-10MB/s |
| 经常失败 | 稳定成功 |

## 🆘 遇到问题？

查看详细文档：
- `docker/快速配置指南.md` - 详细配置步骤
- `docker/优化总结.md` - 完整优化方案
- `docker/README-镜像加速.md` - 技术说明

## 📞 常用命令

```bash
# 查看构建进度
docker compose -f docker-compose.cn-fast.yml logs -f

# 查看服务状态
docker compose -f docker-compose.cn-fast.yml ps

# 停止服务
docker compose -f docker-compose.cn-fast.yml down

# 清理缓存
docker system prune -a
```

---

**提示**: 配置完成后，后续构建会使用缓存，速度会更快！
