#!/bin/bash

# ============================================================================
# Claw-Web 部署验证脚本
# 用途：快速验证部署是否成功
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INSTALL_DIR="/opt/claw-web"

echo -e "${BLUE}Claw-Web 部署验证工具${NC}"
echo ""

# 1. 检查 Docker 容器
echo -e "${YELLOW}[1/5] 检查 Docker 容器状态...${NC}"
if docker ps --format '{{.Names}}' | grep -q "claw-web-mysql"; then
    echo -e "  ${GREEN}✓${NC} MySQL 容器运行中"
else
    echo -e "  ${RED}✗${NC} MySQL 容器未运行"
    exit 1
fi

if docker ps --format '{{.Names}}' | grep -q "claw-web-master"; then
    echo -e "  ${GREEN}✓${NC} Master 容器运行中"
else
    echo -e "  ${RED}✗${NC} Master 容器未运行"
    exit 1
fi

if docker ps --format '{{.Names}}' | grep -q "claw-web-frontend"; then
    echo -e "  ${GREEN}✓${NC} Frontend 容器运行中"
else
    echo -e "  ${RED}✗${NC} Frontend 容器未运行"
    exit 1
fi

# 2. 检查健康状态
echo -e "${YELLOW}[2/5] 检查服务健康状态...${NC}"
sleep 3

mysql_health=$(docker inspect --format='{{.State.Health.Status}}' claw-web-mysql 2>/dev/null || echo "unknown")
master_health=$(docker inspect --format='{{.State.Health.Status}}' claw-web-master 2>/dev/null || echo "unknown")

if [[ "$mysql_health" == "healthy" ]]; then
    echo -e "  ${GREEN}✓${NC} MySQL 健康状态：${mysql_health}"
else
    echo -e "  ${YELLOW}⚠${NC} MySQL 健康状态：${mysql_health}"
fi

if [[ "$master_health" == "healthy" ]]; then
    echo -e "  ${GREEN}✓${NC} Master 健康状态：${master_health}"
else
    echo -e "  ${YELLOW}⚠${NC} Master 健康状态：${master_health}"
fi

# 3. 检查 API 响应
echo -e "${YELLOW}[3/5] 检查 API 响应...${NC}"
api_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:13000/api/health 2>/dev/null || echo "000")
if [[ "$api_response" == "200" ]]; then
    echo -e "  ${GREEN}✓${NC} API 响应正常 (HTTP ${api_response})"
else
    echo -e "  ${RED}✗${NC} API 响应异常 (HTTP ${api_response})"
fi

# 4. 检查数据库连接
echo -e "${YELLOW}[4/5] 检查数据库连接...${NC}"
db_check=$(docker exec claw-web-mysql mysqladmin -u root -p${MYSQL_ROOT_PASSWORD:-clawweb2024} status 2>/dev/null && echo "OK" || echo "FAIL")
if [[ "$db_check" == "OK" ]]; then
    echo -e "  ${GREEN}✓${NC} 数据库连接正常"
else
    echo -e "  ${RED}✗${NC} 数据库连接失败"
fi

# 5. 检查磁盘空间
echo -e "${YELLOW}[5/5] 检查磁盘空间...${NC}"
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [[ $disk_usage -lt 80 ]]; then
    echo -e "  ${GREEN}✓${NC} 磁盘使用率：${disk_usage}%"
elif [[ $disk_usage -lt 90 ]]; then
    echo -e "  ${YELLOW}⚠${NC} 磁盘使用率：${disk_usage}% (警告)"
else
    echo -e "  ${RED}✗${NC} 磁盘使用率：${disk_usage}% (危险)"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════${NC}"
echo -e "${GREEN}  验证完成！                        ${NC}"
echo -e "${GREEN}════════════════════════════════════${NC}"
echo ""

# 显示访问信息
host_ip=$(hostname -I | awk '{print $1}')
echo -e "访问地址:"
echo -e "  ${BLUE}前端界面:${NC}  http://${host_ip}:80"
echo -e "  ${BLUE}API 接口:${NC}  http://${host_ip}:13000/api"
echo ""
echo -e "提示：如果无法访问，请检查防火墙设置"
echo -e "  sudo ufw allow 80/tcp"
echo -e "  sudo ufw allow 13000/tcp"
echo ""
