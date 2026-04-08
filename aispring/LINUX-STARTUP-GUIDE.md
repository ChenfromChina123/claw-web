# Linux 一键启动搜索服务

## 概述

本脚本用于在 Linux 环境下一键启动 SearXNG 搜索服务，使用端口 **9080**（避免与常用端口冲突）。

## 使用方法

### 1. 赋予执行权限

```bash
chmod +x start-search-service.sh
```

### 2. 启动服务

```bash
./start-search-service.sh
```

脚本会自动：
- 检查 Docker 和 Docker Compose 是否安装
- 检查 Docker 服务是否运行
- 启动 SearXNG 容器（使用端口 9080）
- 等待服务启动并验证

### 3. 验证服务

启动成功后，可以通过以下方式验证：

**浏览器访问**：
- http://localhost:9080

**测试搜索 API**：
```bash
curl "http://localhost:9080/search?q=test&format=json"
```

**查看日志**：
```bash
docker logs -f searxng
```

### 4. 停止服务

```bash
docker-compose down
```

## 配置说明

### 端口配置

脚本中定义了两个端口变量：

```bash
SEARXNG_PORT=9080    # SearXNG 服务端口
BACKEND_PORT=9500    # 后端服务端口（参考）
```

如需修改端口，直接编辑脚本中的这两个变量即可。

### Docker Compose 配置

脚本会自动修改 `docker-compose.yml` 中的端口映射，将默认的 8080 端口改为 9080。

## 系统要求

- **操作系统**: Linux (Ubuntu/CentOS/Debian 等)
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **内存**: 至少 2GB 可用内存
- **磁盘**: 至少 10GB 可用空间

## 安装 Docker (如果未安装)

### Ubuntu/Debian

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo apt-get install docker-compose-plugin
```

### CentOS

```bash
# 安装 Docker
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker

# 安装 Docker Compose
sudo yum install docker-compose-plugin
```

## 故障排查

### 1. Docker 服务未运行

```bash
# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### 2. 端口被占用

如果 9080 端口已被占用，修改脚本中的 `SEARXNG_PORT` 变量：

```bash
SEARXNG_PORT=9081  # 改为其他端口
```

### 3. 容器启动失败

查看容器日志：

```bash
docker logs searxng
```

### 4. 权限问题

确保当前用户有 Docker 权限：

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## 开机自启动

如果需要开机自动启动搜索服务，可以创建一个 systemd 服务：

### 1. 创建服务文件

```bash
sudo vim /etc/systemd/system/searxng-search.service
```

### 2. 添加以下内容

```ini
[Unit]
Description=SearXNG Search Service
After=network.target docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/zhixueyunjing/aispring
ExecStart=/opt/zhixueyunjing/aispring/start-search-service.sh
ExecStop=/opt/zhixueyunjing/aispring/docker-compose down
User=root

[Install]
WantedBy=multi-user.target
```

### 3. 启用服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable searxng-search
sudo systemctl start searxng-search
```

## 性能优化

### 1. 增加内存限制

编辑 `docker-compose.yml`，添加内存限制：

```yaml
services:
  searxng:
    deploy:
      resources:
        limits:
          memory: 2G
```

### 2. 持久化缓存

添加缓存卷：

```yaml
services:
  searxng:
    volumes:
      - ./searxng-config:/etc/searxng:rw
      - searxng-cache:/var/cache/searxng

volumes:
  searxng-cache:
```

## 相关资源

- [SearXNG 官方文档](https://docs.searxng.org/)
- [Docker 官方文档](https://docs.docker.com/)
- [项目 GitHub](https://github.com/ChenfromChina123/ZhiXueYunJing)
