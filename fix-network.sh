#!/bin/bash
# 修复前端容器网络问题
# 使用方法：bash fix-network.sh

set -e

echo "========================================"
echo "  修复前端容器网络配置"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}步骤 1: 查看当前网络配置${NC}"
echo "----------------------------------------"
echo "前端容器连接的网络："
docker inspect claw-web-frontend --format='{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{"\n"}}{{end}}'
echo ""

echo "Master 容器连接的网络："
docker inspect claw-web-master --format='{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{"\n"}}{{end}}'
echo ""

# 检查前端是否在 claude-network 中
if docker network inspect claw-web_claude-network --format='{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' | grep -q claw-web-frontend; then
    echo -e "${GREEN}✓ 前端容器已在 claude-network 中${NC}"
else
    echo -e "${YELLOW}⚠️ 前端容器不在 claude-network 中，正在添加...${NC}"
    docker network connect claw-web_claude-network claw-web-frontend
    echo -e "${GREEN}✓ 已添加前端容器到 claude-network${NC}"
fi
echo ""

echo -e "${YELLOW}步骤 2: 测试网络连通性${NC}"
echo "----------------------------------------"
echo "测试前端容器能否访问 Master..."
if docker exec claw-web-frontend ping -c 3 master > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ping 成功${NC}"
else
    echo -e "${RED}✗ Ping 失败${NC}"
fi

echo ""
echo "测试 API 连接..."
if docker exec claw-web-frontend curl -s http://master:3000/api/info > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API 连接成功${NC}"
    docker exec claw-web-frontend curl -s http://master:3000/api/info
else
    echo -e "${RED}✗ API 连接失败${NC}"
fi
echo ""

echo -e "${YELLOW}步骤 3: 重启 Nginx${NC}"
echo "----------------------------------------"
docker restart claw-web-frontend
sleep 3
echo -e "${GREEN}✓ Nginx 已重启${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  修复完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "请刷新浏览器测试：http://8.163.46.149:8080"
echo ""
