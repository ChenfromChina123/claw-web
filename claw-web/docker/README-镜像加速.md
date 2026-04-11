# Docker 国内镜像加速器配置指南

## 问题说明
Docker Hub 在国内访问速度较慢，构建过程中需要下载基础镜像（如 `node:20-alpine`、`oven/bun:1`、`nginx:1.25-alpine`）会非常耗时。

## 解决方案

### 方案一：使用 Docker Desktop 镜像加速器（推荐）

#### Docker Desktop Windows 配置步骤：

1. 打开 Docker Desktop
2. 点击右上角的 **Settings**（设置）
3. 选择左侧的 **Docker Engine**
4. 在 JSON 配置中添加镜像加速器地址：

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://registry.docker-cn.com"
  ]
}
```

5. 点击 **Apply & Restart** 应用配置并重启 Docker Desktop

#### 其他可用的镜像加速器地址：

- 阿里云：`https://<your-code>.mirror.aliyuncs.com`（需要注册阿里云账号获取专属加速地址）
- 科大镜像：`https://docker.mirrors.ustc.edu.cn`
- 腾讯云：`https://mirror.ccs.tencentyun.com`
- 网易云：`https://hub-mirror.c.163.com`

### 方案二：使用国内镜像替代（已配置）

项目已经配置了使用国内镜像的 Docker Compose 文件：

```bash
# 使用国内镜像加速版本
docker compose -f docker-compose.cn-fast.yml up -d

# 或者使用原来的国内版本
docker compose -f docker-compose.cn.yml up -d
```

### 方案三：手动拉取镜像并使用标签重命名

如果自动拉取失败，可以手动下载镜像：

```bash
# 1. 从国内镜像源手动拉取
docker pull registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine
docker pull registry.cn-hangzhou.aliyuncs.com/library/nginx:1.25-alpine
docker pull ccr.ccs.tencentyun.com/oven/bun:1

# 2. 重命名标签以匹配 Dockerfile 中的引用
docker tag registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine node:20-alpine
docker tag registry.cn-hangzhou.aliyuncs.com/library/nginx:1.25-alpine nginx:1.25-alpine
docker tag ccr.ccs.tencentyun.com/oven/bun:1 oven/bun:1

# 3. 重新运行构建
docker compose -f docker-compose.cn.yml build
```

### 方案四：使用 Docker 镜像加速脚本

创建一个 PowerShell 脚本自动配置镜像加速：

```powershell
# 文件：configure-docker-mirror.ps1

$dockerConfigPath = "$env:USERPROFILE\.docker\daemon.json"

$config = @{
    "registry-mirrors" = @(
        "https://docker.mirrors.ustc.edu.cn",
        "https://registry.docker-cn.com"
    )
    "builder" = @{
        "gc" = @{
            "defaultKeepStorage" = "20GB"
            "enabled" = $true
        }
    }
    "experimental" = $false
}

# 创建配置目录
$dir = Split-Path -Parent $dockerConfigPath
if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir
}

# 保存配置文件
$config | ConvertTo-Json -Depth 10 | Set-Content $dockerConfigPath

Write-Host "Docker 镜像加速器配置已保存到：$dockerConfigPath"
Write-Host "请重启 Docker Desktop 以应用配置"
```

运行脚本：
```powershell
.\configure-docker-mirror.ps1
```

然后重启 Docker Desktop。

## 构建优化建议

### 1. 使用 BuildKit 缓存

```bash
# 启用 BuildKit
$env:DOCKER_BUILDKIT=1

# 使用缓存构建
docker compose -f docker-compose.cn.yml build --progress=plain
```

### 2. 清理未使用的镜像和容器

```bash
# 清理未使用的镜像
docker image prune -a

# 清理停止的容器
docker container prune

# 清理构建缓存
docker builder prune -a
```

### 3. 并行构建服务

```bash
# 并行构建所有服务
docker compose -f docker-compose.cn.yml build --parallel

# 或者分别构建每个服务
docker compose -f docker-compose.cn.yml build mysql
docker compose -f docker-compose.cn.yml build backend
docker compose -f docker-compose.cn.yml build frontend
```

## 常见问题

### Q: 构建过程中卡在某个步骤怎么办？

A: 使用 `--progress=plain` 查看详细日志：
```bash
docker compose -f docker-compose.cn.yml build --progress=plain
```

### Q: 如何查看构建缓存使用情况？

A: 使用以下命令查看：
```bash
docker builder ls
docker image ls --filter dangling=true
```

### Q: 构建失败提示 "no match for platform" 怎么办？

A: 指定平台构建：
```bash
docker compose -f docker-compose.cn.yml build --platform linux/amd64
```

## 快速开始

1. **配置 Docker 镜像加速器**（参考方案一）
2. **使用国内镜像版本构建**：
   ```bash
   cd d:\Users\Administrator\AistudyProject\HAHA\claw-web
   docker compose -f docker-compose.cn-fast.yml up -d --build
   ```
3. **查看构建进度**：
   ```bash
   docker logs -f claude-backend
   docker logs -f claude-frontend
   ```

## 性能对比

| 配置 | 平均构建时间 | 说明 |
|------|------------|------|
| 默认 Docker Hub | 30-60 分钟 | 受网络影响大 |
| 配置镜像加速器 | 5-15 分钟 | 速度提升 4-6 倍 |
| 手动拉取镜像 | 3-10 分钟 | 最稳定快速 |

## 推荐配置顺序

1. ✅ **首选**：配置 Docker Desktop 镜像加速器（一劳永逸）
2. ✅ **备选**：使用 `docker-compose.cn-fast.yml` 
3. ✅ **应急**：手动拉取镜像并重命名标签
