#!/bin/bash
# Claw-Web 服务器部署脚本
# 使用方法：在服务器上执行 bash deploy-from-backup.sh

set -e

echo "========================================"
echo "  Claw-Web 服务器部署工具"
echo "========================================"
echo ""

BACKUP_FILE="/opt/claw-web-images.tar"
PROJECT_DIR="/opt/claw-web"

# 检查镜像文件是否存在
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ 错误：找不到镜像文件 $BACKUP_FILE"
    echo "请先上传镜像文件到服务器"
    exit 1
fi

echo "✓ 找到镜像文件：$BACKUP_FILE"
echo ""

# 加载 Docker 镜像
echo "正在加载 Docker 镜像..."
docker load -i "$BACKUP_FILE"

echo ""
echo "✓ 镜像加载成功"
echo ""

# 验证镜像
echo "已加载的镜像："
docker images | grep claw-web

echo ""

# 检查项目目录
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ 错误：项目目录不存在 $PROJECT_DIR"
    echo "请确保已上传项目文件"
    exit 1
fi

# 进入项目目录
cd "$PROJECT_DIR"

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告：找不到 .env 文件"
    echo "正在从 .env.example 创建..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "请编辑 .env 文件配置环境变量"
    else
        echo "❌ 错误：找不到 .env.example"
        exit 1
    fi
fi

echo ""
echo "✓ 项目目录：$PROJECT_DIR"
echo ""

# 停止旧服务
echo "正在停止旧服务（如果存在）..."
docker-compose down 2>/dev/null || true

echo ""

# 启动新服务
echo "正在启动服务..."
docker-compose up -d

echo ""
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo ""
echo "服务状态："
docker-compose ps

echo ""
echo "========================================"
echo "  部署完成！"
echo "========================================"
echo ""
echo "访问地址："
echo "  前端：http://$SERVER_IP"
echo "  API:   http://$SERVER_IP:13000"
echo ""
echo "查看日志："
echo "  docker-compose logs -f master"
echo "  docker-compose logs -f frontend"
echo ""
