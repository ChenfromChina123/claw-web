#!/bin/bash
# Claw-Web 完整部署脚本（使用已有镜像）
# 使用方法：bash deploy-complete.sh

set -e

echo "========================================"
echo "  Claw-Web 完整部署（镜像方式）"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
BACKUP_FILE="/opt/temp/claw-web-images.tar"
PROJECT_DIR="/opt/claw-web"

echo -e "${YELLOW}步骤 1/6: 停止旧服务${NC}"
echo "----------------------------------------"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    docker-compose down 2>/dev/null || echo "没有运行中的服务"
else
    echo "项目目录不存在，跳过停止服务"
fi
echo ""

echo -e "${YELLOW}步骤 2/6: 清理旧容器和镜像${NC}"
echo "----------------------------------------"
# 停止并删除容器
docker stop $(docker ps -aq --filter "name=claw-web") 2>/dev/null || true
docker rm $(docker ps -aq --filter "name=claw-web") 2>/dev/null || true
echo "✓ 容器已清理"

# 删除旧镜像（可选，如果想保留可以注释掉）
# docker rmi $(docker images -q claw-web-*) 2>/dev/null || true
# echo "✓ 旧镜像已清理"
echo ""

echo -e "${YELLOW}步骤 3/6: 加载新镜像${NC}"
echo "----------------------------------------"
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}错误：找不到镜像文件 $BACKUP_FILE${NC}"
    echo "请确保已上传镜像到服务器"
    exit 1
fi

docker load -i "$BACKUP_FILE"
echo "✓ 镜像加载成功"
echo ""

echo -e "${YELLOW}步骤 4/6: 验证镜像${NC}"
echo "----------------------------------------"
docker images | grep claw-web
echo ""

echo -e "${YELLOW}步骤 5/6: 检查项目配置${NC}"
echo "----------------------------------------"
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}错误：项目目录不存在${NC}"
    echo "请先创建项目目录并上传配置文件"
    exit 1
fi

cd "$PROJECT_DIR"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}警告：找不到 .env 文件${NC}"
    if [ -f ".env.example" ]; then
        echo "正在从 .env.example 创建..."
        cp .env.example .env
        echo -e "${YELLOW}请编辑 .env 文件配置环境变量${NC}"
    else
        echo -e "${RED}错误：找不到 .env.example${NC}"
        exit 1
    fi
fi

# 检查 docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}错误：找不到 docker-compose.yml${NC}"
    exit 1
fi

echo "✓ 项目配置检查完成"
echo ""

echo -e "${YELLOW}步骤 6/6: 启动服务${NC}"
echo "----------------------------------------"
echo "正在启动 Docker 服务..."
docker-compose up -d

echo ""
echo "等待服务启动..."
sleep 15

# 检查服务状态
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  服务状态：${NC}"
echo -e "${GREEN}========================================${NC}"
docker-compose ps

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "访问地址："
echo "  前端：http://localhost"
echo "  API:   http://localhost:13000"
echo ""
echo "查看日志："
echo "  docker-compose logs -f master"
echo "  docker-compose logs -f frontend"
echo ""
echo "常用命令："
echo "  docker-compose down     - 停止服务"
echo "  docker-compose restart  - 重启服务"
echo "  docker-compose ps       - 查看状态"
echo ""
