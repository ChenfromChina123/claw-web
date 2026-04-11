# Docker 国内镜像加速配置指南

## 📋 概述

本文档介绍如何在中国大陆地区使用 Docker 镜像加速器，提高 Docker 构建和拉取速度。

---

## 🚀 镜像源配置

### 已配置的镜像源

本项目已配置以下国内镜像源：

1. **Debian 软件源**：阿里云镜像
   - `https://mirrors.aliyun.com/debian`
   - `https://mirrors.aliyun.com/debian-security`

2. **Docker 镜像加速器**（可选配置）
   - 阿里云：`https://<your-aliyun-id>.mirror.aliyuncs.com`
   - 腾讯云：`https://mirror.ccs.tencentyun.com`
   - 网易：`https://hub-mirror.c.163.com`

---

## 🔧 配置方法

### 方法 1：Docker Desktop 配置（推荐）

**Windows/Mac**：

1. 打开 Docker Desktop
2. 进入 **Settings** → **Docker Engine**
3. 添加镜像加速器配置：

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
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

4. 点击 **Apply & Restart**

### 方法 2：Linux 服务器配置

**编辑 `/etc/docker/daemon.json`**：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

**重启 Docker**：

```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 方法 3：Dockerfile 中配置（已实现）

本项目 Dockerfile 已自动配置阿里云镜像源：

```dockerfile
# ✅ 使用国内镜像源加速（阿里云镜像）
RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's|http://security.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources
```

---

## 📊 镜像加速效果

### 测试方法

```bash
# 测试镜像拉取速度
time docker pull mysql:8.0

# 查看下载速度
docker pull mysql:8.0
```

### 预期效果

| 场景 | 未加速 | 已加速 | 提升 |
|------|--------|--------|------|
| 拉取 MySQL 镜像 | 5-10 分钟 | 30 秒 -2 分钟 | 5-10 倍 |
| 拉取 Node 镜像 | 3-8 分钟 | 20 秒 -1 分钟 | 5-8 倍 |
| apt-get update | 1-5 分钟 | 10-30 秒 | 5-10 倍 |
| apt-get install | 2-10 分钟 | 30 秒 -3 分钟 | 3-5 倍 |

---

## 🛠️ 常见问题

### 问题 1：镜像源不可用

**症状**：
```
Error response from daemon: Get https://mirror.xxx.com: dial tcp: lookup mirror.xxx.com: no such host
```

**解决方案**：
- 更换其他镜像源
- 检查网络连接
- 使用 HTTP 代理

### 问题 2：部分镜像无法加速

**症状**：
某些私有镜像或特定版本镜像无法通过加速器拉取

**解决方案**：
```bash
# 使用官方源直接拉取
docker pull --disable-content-trust <image-name>

# 或使用代理
export https_proxy=http://proxy-server:port
docker pull <image-name>
```

### 问题 3：构建速度慢

**症状**：
Dockerfile 中 apt-get install 速度慢

**解决方案**：
已在 Dockerfile 中配置国内镜像源，如仍慢可：
1. 使用更轻量的基础镜像（如 alpine）
2. 减少 apt 包数量
3. 使用多阶段构建

---

## 📝 最佳实践

### 1. 多阶段构建

```dockerfile
# 构建阶段
FROM oven/bun:1 AS builder
RUN apt-get update && apt-get install -y gcc g++ make

# 运行阶段（只包含必要文件）
FROM oven/bun:1-slim
COPY --from=builder /app/dist /app
```

### 2. 使用 .dockerignore

创建 `.dockerignore` 文件，排除不必要的文件：

```
node_modules
npm-debug.log
.git
.env
*.md
.dockerignore
.gitignore
```

### 3. 缓存优化

```dockerfile
# 先复制 package.json，利用 Docker 缓存
COPY package.json bun.lock ./
RUN bun install

# 再复制源代码
COPY . .
```

---

## 🔗 相关资源

### 国内镜像源列表

- **阿里云**：https://cr.console.aliyun.com/
- **腾讯云**：https://mirror.ccs.tencentyun.com/
- **网易**：https://hub-mirror.c.163.com/
- **百度云**：https://mirror.baidubce.com/
- **中科大**：https://docker.mirrors.ustc.edu.cn/
- **DaoCloud**：https://docker.m.daocloud.io/

### 官方文档

- [Docker 官方文档](https://docs.docker.com/)
- [Docker 中国](https://www.docker.com.cn/)
- [阿里云容器镜像服务](https://www.aliyun.com/product/acr)

---

## 💡 提示

1. **定期检查镜像源可用性**：某些镜像源可能会失效
2. **使用多个镜像源**：提高可用性
3. **本地开发环境**：可以配置更多镜像源
4. **生产环境**：建议使用私有镜像仓库

---

**文档版本**：v1.0  
**创建日期**：2026-04-10  
**最后更新**：2026-04-10
