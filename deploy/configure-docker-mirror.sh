#!/bin/bash

# ============================================================================
# Docker 镜像源配置脚本（国内优化）
# 用途：快速配置 Docker 镜像加速器，解决拉取超时问题
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Docker 镜像源配置工具（国内优化）${NC}"
echo ""

# 检查是否以 root 运行
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}错误：此脚本必须以 root 用户运行${NC}"
    exit 1
fi

# 检查 Docker 是否已安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误：Docker 未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker 已安装：$(docker --version)"
echo ""

# 备份现有配置
if [[ -f /etc/docker/daemon.json ]]; then
    echo -e "${YELLOW}⚠${NC} 检测到现有配置，备份到 /etc/docker/daemon.json.bak"
    cp /etc/docker/daemon.json /etc/docker/daemon.json.bak
fi

# 配置镜像源
echo -e "${BLUE}配置 Docker 镜像源...${NC}"

mkdir -p /etc/docker

cat > /etc/docker/daemon.json <<EOF
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
  "max-concurrent-downloads": 10,
  "log-driver": "json-file",
  "log-level": "warn",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "data-root": "/var/lib/docker"
}
EOF

echo -e "${GREEN}✓${NC} 配置文件已写入 /etc/docker/daemon.json"
echo ""

# 重启 Docker
echo -e "${BLUE}重启 Docker 服务...${NC}"
systemctl daemon-reload
systemctl restart docker

if systemctl is-active --quiet docker; then
    echo -e "${GREEN}✓${NC} Docker 服务已重启"
else
    echo -e "${RED}✗${NC} Docker 服务重启失败"
    exit 1
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  Docker 镜像源配置完成！               ${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# 测试镜像源
echo -e "${BLUE}测试镜像源连接...${NC}"
echo "拉取测试镜像：hello-world"

if docker pull hello-world:latest &>/dev/null; then
    echo -e "${GREEN}✓${NC} 镜像源工作正常"
    docker rmi hello-world:latest &>/dev/null
else
    echo -e "${YELLOW}⚠${NC} 部分镜像源可能不可用，但配置已生效"
fi

echo ""
echo -e "${YELLOW}提示：${NC}"
echo -e "  - 如果仍然拉取缓慢，可以手动更换其他镜像源"
echo -e "  - 查看当前配置：cat /etc/docker/daemon.json"
echo -e "  - 重启 Docker: systemctl restart docker"
echo ""
