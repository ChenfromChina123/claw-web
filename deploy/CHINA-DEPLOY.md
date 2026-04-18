# 国内部署 Claw-Web 完整指南

##  国内网络优化方案

### 问题说明
在中国大陆部署时，经常会遇到 Docker 镜像拉取超时的问题：
```
failed to solve: oven/bun:1: failed to resolve source metadata
httpReadSeeker: failed open: failed to do request: TLS handshake timeout
```

---

## ✅ 解决方案

### 方案一：使用优化后的部署脚本（推荐）

最新版本的部署脚本已自动配置国内镜像源：

```bash
# 1. 下载最新脚本
curl -fsSL https://raw.githubusercontent.com/ChenfromChina123/claw-web/feature/api-auth-enhancement/deploy/deploy.sh -o deploy.sh

# 2. 运行部署
chmod +x deploy.sh
sudo ./deploy.sh
```

**自动优化**：
- ✅ 自动配置阿里云 Docker 镜像源
- ✅ 自动配置多个国内镜像加速器
- ✅ 优化并发下载设置
- ✅ 支持 CentOS/RHEL/Fedora

---

### 方案二：手动配置镜像源

如果已经安装了 Docker，但遇到拉取问题：

```bash
# 1. 下载镜像源配置脚本
curl -fsSL https://raw.githubusercontent.com/ChenfromChina123/claw-web/feature/api-auth-enhancement/deploy/configure-docker-mirror.sh -o configure-mirror.sh

# 2. 运行配置
chmod +x configure-mirror.sh
sudo ./configure-mirror.sh

# 3. 重新部署
sudo ./deploy.sh
```

---

### 方案三：完全手动配置

#### 1. 编辑 Docker 配置文件
```bash
sudo vi /etc/docker/daemon.json
```

#### 2. 添加以下内容
```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1panel.live",
    "https://hub.rat.dev",
    "https://dhub.kubesre.xyz",
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ],
  "max-concurrent-downloads": 10
}
```

#### 3. 重启 Docker
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

#### 4. 验证配置
```bash
docker info | grep -A 10 "Registry Mirrors"
```

---

## 🚀 推荐的镜像源（2026 年最新）

| 镜像源 | 地址 | 稳定性 |
|--------|------|--------|
| DaoCloud | `https://docker.m.daocloud.io` | ⭐⭐⭐⭐⭐ |
| 1Panel | `https://docker.1panel.live` | ⭐⭐⭐⭐⭐ |
| Rat.dev | `https://hub.rat.dev` | ⭐⭐⭐⭐ |
| 科大镜像 | `https://docker.mirrors.ustc.edu.cn` | ⭐⭐⭐⭐ |
| 阿里云 | `https://hub-mirror.c.163.com` | ⭐⭐⭐⭐ |
| 百度云 | `https://mirror.baidubce.com` | ⭐⭐⭐ |

---

## 📋 完整部署流程（CentOS 示例）

```bash
# 步骤 1: 准备环境
sudo yum update -y
sudo yum install -y curl git

# 步骤 2: 下载部署脚本
cd /www/project
curl -fsSL https://raw.githubusercontent.com/ChenfromChina123/claw-web/feature/api-auth-enhancement/deploy/deploy.sh -o deploy.sh
chmod +x deploy.sh

# 步骤 3: 运行部署（自动配置镜像源）
sudo ./deploy.sh

# 步骤 4: 配置 LLM API Key
sudo vi /opt/claw-web/.env
# 添加：QWEN_API_KEY=sk-your-key-here

# 步骤 5: 重启服务
cd /opt/claw-web
docker compose restart master

# 步骤 6: 访问
# 浏览器打开：http://<服务器IP>
```

---

## 🔧 常见问题

### Q1: 镜像源都超时怎么办？

**解决方案**：逐个测试可用镜像源

```bash
# 测试镜像源是否可用
curl -I https://docker.m.daocloud.io

# 如果某个镜像源不可用，从 daemon.json 中移除
sudo vi /etc/docker/daemon.json
sudo systemctl restart docker
```

### Q2: 部署过程中断怎么办？

**解决方案**：清理后重新部署

```bash
cd /opt/claw-web

# 停止并清理
docker compose down -v

# 删除旧镜像
docker rmi $(docker images | grep claw-web) -f

# 重新部署
sudo ./deploy.sh
```

### Q3: 服务启动后无法访问？

**解决方案**：检查防火墙

```bash
# 查看防火墙状态
sudo firewall-cmd --state

# 开放端口
sudo firewall-cmd --zone=public --add-port=80/tcp --permanent
sudo firewall-cmd --zone=public --add-port=13000/tcp --permanent
sudo firewall-cmd --reload

# 或者临时关闭防火墙（测试用）
sudo systemctl stop firewalld
```

---

## 📊 部署时间参考

| 网络环境 | 预计时间 |
|---------|---------|
| 配置镜像源后 | 5-10 分钟 |
| 未配置镜像源 | 30 分钟+ 或失败 |
| 本地离线镜像 | 2-3 分钟 |

---

## 💡 高级技巧

### 1. 预拉取镜像（加速部署）

```bash
# 提前拉取基础镜像
docker pull docker.io/library/node:20-slim
docker pull docker.io/library/debian:bookworm-slim
docker pull docker.io/library/docker:cli
```

### 2. 使用本地镜像仓库

```bash
# 搭建本地 Harbor 仓库
docker run -d -p 5000:5000 --restart=always --name registry \
  -v /data/registry:/var/lib/registry \
  registry:2
```

### 3. 离线部署

```bash
# 在有网络的机器上保存镜像
docker save -o claw-web-images.tar \
  claw-web-master:latest \
  claw-web-frontend:latest

# 传输到目标机器
scp claw-web-images.tar user@server:/tmp/

# 加载镜像
docker load -i /tmp/claw-web-images.tar
```

---

## 📞 获取帮助

- **GitHub Issues**: https://github.com/ChenfromChina123/claw-web/issues
- **部署文档**: https://github.com/ChenfromChina123/claw-web/tree/feature/api-auth-enhancement/deploy

---

**最后更新**: 2026-04-18  
**适用版本**: v1.2+
