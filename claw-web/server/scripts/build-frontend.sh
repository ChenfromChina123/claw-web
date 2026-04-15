#!/bin/bash
#
# 前端构建脚本
# 在 Master 容器内手动构建前端
#
# 使用方法：
#   docker exec claude-backend-master /app/scripts/build-frontend.sh
#

set -e

echo "======================================"
echo "  前端构建脚本"
echo "======================================"

# 检查是否在容器内运行
if [ ! -f "/app/package.json" ]; then
    echo "❌ 错误：请在 Master 容器内运行此脚本"
    echo "用法：docker exec claude-backend-master /app/scripts/build-frontend.sh"
    exit 1
fi

# 检查前端源代码是否存在
if [ ! -d "/app/web-src" ]; then
    echo "❌ 错误：前端源代码目录 /app/web-src 不存在"
    echo "请将前端源代码挂载到容器的 /app/web-src 目录"
    exit 1
fi

cd /app/web-src

echo ""
echo "[1/3] 安装前端依赖..."
npm install --registry=https://registry.npmmirror.com --legacy-peer-deps

echo ""
echo "[2/3] 构建前端..."
npm run build

echo ""
echo "[3/3] 复制构建产物到 public 目录..."
if [ -d "dist" ]; then
    rm -rf /app/public/*
    cp -r dist/* /app/public/
    echo "✅ 前端构建完成！"
else
    echo "❌ 错误：构建产物 dist 目录不存在"
    exit 1
fi

echo ""
echo "======================================"
echo "  构建完成"
echo "======================================"
echo "前端文件已部署到 /app/public 目录"
