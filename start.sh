#!/bin/bash
# Claw-Web Docker 快速启动脚本
#
# 使用方法：
#   ./start.sh          # 启动所有服务
#   ./start.sh build    # 构建并启动
#   ./start.sh stop     # 停止所有服务
#   ./start.sh logs     # 查看日志
#   ./start.sh status   # 查看状态

set -e

echo "=========================================="
echo "  Claw-Web Master-Worker Docker Service"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  未找到 .env 文件，从模板创建...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ 已创建 .env 文件，请根据需要修改配置${NC}"
fi

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ 错误: Docker 未安装${NC}"
    echo "请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查 Docker Compose 是否可用
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ 错误: Docker Compose 不可用${NC}"
    exit 1
fi

case "${1:-start}" in
    build)
        echo -e "${BLUE}📦 构建 Docker 镜像...${NC}"
        docker compose build --no-cache
        echo -e "${GREEN}✅ 构建完成${NC}"
        ;;

    start|up)
        echo -e "${BLUE}🚀 启动 Claw-Web 服务...${NC}"
        
        # 创建必要目录
        mkdir -p docker server/workspaces/users
        
        # 启动服务
        docker compose up -d
        
        echo ""
        echo -e "${GREEN}=========================================="
        echo "  ✅ Claw-Web 服务已启动！"
        echo "==========================================${NC}"
        echo ""
        echo -e "${BLUE}服务访问地址：${NC}"
        echo "  🌐 前端界面: http://localhost:${FRONTEND_PORT:-80}"
        echo "  🔧 Master API: http://localhost:${MASTER_PORT:-3000}"
        echo "  🗄️  MySQL: localhost:${MYSQL_PORT:-3306}"
        echo ""
        echo -e "${BLUE}常用命令：${NC}"
        echo "  查看日志: $0 logs"
        echo "  查看状态: $0 status"
        echo "  停止服务: $0 stop"
        echo ""
        echo -e "${YELLOW}⚠️  首次启动可能需要 1-2 分钟初始化数据库${NC}"
        ;;

    stop|down)
        echo -e "${YELLOW}🛑 停止 Claw-Web 服务...${NC}"
        docker compose down
        echo -e "${GREEN}✅ 服务已停止${NC}"
        ;;

    restart)
        echo -e "${YELLOW}🔄 重启 Claw-Web 服务...${NC}"
        docker compose restart
        echo -e "${GREEN}✅ 服务已重启${NC}"
        ;;

    logs)
        echo -e "${BLUE}📋 查看日志（Ctrl+C 退出）...${NC}"
        docker compose logs -f --tail=100
        ;;

    status)
        echo -e "${BLUE}📊 服务状态：${NC}"
        docker compose ps
        echo ""
        echo -e "${BLUE}资源使用情况：${NC}"
        docker stats --no-stream
        ;;

    master-logs)
        echo -e "${BLUE}📋 Master 日志：${NC}"
        docker compose logs -f --tail=50 master
        ;;

    worker-logs)
        echo -e "${BLUE}📋 Worker 日志：${NC}"
        docker compose logs -f --tail=50 worker-template
        ;;

    mysql-logs)
        echo -e "${BLUE}📋 MySQL 日志：${NC}"
        docker compose logs -f --tail=50 mysql
        ;;

    clean)
        echo -e "${RED}⚠️  清理所有容器、镜像和数据卷...${NC}"
        read -p "确定要删除所有数据吗？(y/N) " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            docker compose down -v --rmi all
            echo -e "${GREEN}✅ 清理完成${NC}"
        else
            echo -e "${YELLOW}已取消${NC}"
        fi
        ;;

    shell-master)
        echo -e "${BLUE}🐚 进入 Master 容器 Shell...${NC}"
        docker compose exec master /bin/sh
        ;;

    shell-worker)
        echo -e "${BLUE}🐚 进入 Worker 容器 Shell...${NC}"
        docker compose exec worker-template /bin/sh
        ;;

    shell-mysql)
        echo -e "${BLUE}🐚 进入 MySQL Shell...${NC}"
        docker compose exec mysql mysql -u ${MYSQL_USER:-clawuser} -p${MYSQL_PASSWORD:-clawpass2024} ${MYSQL_DATABASE:-claw_web}
        ;;

    backup)
        echo -e "${BLUE}💾 备份数据库...${NC}"
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
        docker compose exec mysqldump -u ${MYSQL_USER:-clawuser} -p${MYSQL_PASSWORD:-clawpass2024} ${MYSQL_DATABASE:-claw_web} > "$BACKUP_FILE"
        echo -e "${GREEN}✅ 已备份到 $BACKUP_FILE${NC}"
        ;;

    *)
        echo -e "${YELLOW}用法: $0 {build|start|stop|restart|logs|status|clean|shell-*|backup}${NC}"
        echo ""
        echo "命令说明:"
        echo "  build         构建 Docker 镜像"
        echo "  start/up      启动所有服务（默认）"
        echo "  stop/down     停止所有服务"
        echo "  restart       重启服务"
        echo "  logs          查看所有服务日志"
        echo "  status        查看服务和资源状态"
        echo "  master-logs   查看 Master 日志"
        echo "  worker-logs   查看 Worker 日志"
        echo "  mysql-logs    查看 MySQL 日志"
        echo "  clean         清理所有容器和卷"
        echo "  shell-master  进入 Master 容器"
        echo "  shell-worker  进入 Worker 容器"
        echo "  shell-mysql   进入 MySQL Shell"
        echo "  backup        备份数据库"
        ;;
esac
