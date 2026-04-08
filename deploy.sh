#!/bin/bash

# ===========================================
# Claude Code HAHA - Docker 快速部署脚本
# ===========================================
#
# 使用方法：
# chmod +x deploy.sh
# ./deploy.sh [命令]
#
# 命令：
#   start     - 启动所有服务
#   stop      - 停止所有服务
#   restart   - 重启所有服务
#   build     - 重新构建镜像
#   logs      - 查看日志
#   status    - 查看服务状态
#   clean     - 清理数据和容器
#   help      - 显示帮助信息

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装！请先安装 Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装！请安装 Docker Compose"
        exit 1
    fi

    print_success "Docker 环境检查通过"
}

# 检查 .env 文件
check_env_file() {
    if [ ! -f ".env" ]; then
        print_warning ".env 文件不存在，正在从模板创建..."

        if [ -f ".env.docker.example" ]; then
            cp .env.docker.example .env
            print_success ".env 文件已创建，请编辑并填写配置"
            print_info "编辑命令: nano .env 或 vim .env"
            read -p "是否现在编辑？(y/n): " edit_now
            if [ "$edit_now" = "y" ] || [ "$edit_now" = "Y" ]; then
                ${EDITOR:-nano} .env
            fi
        else
            print_error ".env.docker.example 模板文件不存在！"
            exit 1
        fi
    else
        print_success ".env 文件已存在"
    fi
}

# 创建必要的目录
create_directories() {
    print_info "创建数据目录..."

    mkdir -p docker-data/user-workspaces
    mkdir -p docker-data/session-workspaces
    mkdir -p docker-data/logs
    mkdir -p docker/nginx/ssl

    print_success "目录创建完成"
}

# 启动服务
start_services() {
    print_info "正在启动 Claude Code HAHA 服务..."

    check_docker
    check_env_file
    create_directories

    # 使用 docker compose（新版）或 docker-compose（旧版）
    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi

    echo ""
    print_success "=========================================="
    print_success "  Claude Code HAHA 启动成功！"
    print_success "=========================================="
    echo ""
    print_info "访问地址："
    echo "  前端: http://localhost:${FRONTEND_PORT:-80}"
    echo "  API:  http://localhost:${PORT:-3000}/api"
    echo ""
    print_info "常用命令："
    echo "  查看日志: ./deploy.sh logs"
    echo "  查看状态: ./deploy.sh status"
    echo "  停止服务: ./deploy.sh stop"
    echo ""
}

# 停止服务
stop_services() {
    print_info "正在停止服务..."

    if docker compose version &> /dev/null; then
        docker compose down
    else
        docker-compose down
    fi

    print_success "所有服务已停止"
}

# 重启服务
restart_services() {
    stop_services
    sleep 2
    start_services
}

# 重新构建镜像
build_images() {
    print_info "正在重新构建 Docker 镜像..."

    if docker compose version &> /dev/null; then
        docker compose build --no-cache
    else
        docker-compose build --no-cache
    fi

    print_success "镜像构建完成"
}

# 查看日志
show_logs() {
    local service=${1:-}
    
    if [ -n "$service" ]; then
        if docker compose version &> /dev/null; then
            docker compose logs -f "$service"
        else
            docker-compose logs -f "$service"
        fi
    else
        if docker compose version &> /dev/null; then
            docker compose logs -f --tail=100
        else
            docker-compose logs -f --tail=100
        fi
    fi
}

# 查看服务状态
show_status() {
    print_info "Claude Code HAHA 服务状态："
    echo ""

    if docker compose version &> /dev/null; then
        docker compose ps
    else
        docker-compose ps
    fi

    echo ""
    print_info "资源使用情况："
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
}

# 清理数据和容器
clean_all() {
    print_warning "⚠️  此操作将删除所有数据、容器和镜像！"
    read -p "确定要继续吗？(yes/no): " confirm

    if [ "$confirm" = "yes" ]; then
        print_info "正在清理..."

        # 停止并删除容器
        if docker compose version &> /dev/null; then
            docker compose down -v --rmi all
        else
            docker-compose down -v --rmi all
        fi

        # 删除数据目录
        rm -rf docker-data/

        print_success "清理完成"
    else
        print_info "操作已取消"
    fi
}

# 显示帮助信息
show_help() {
    echo "Claude Code HAHA - Docker 部署工具"
    echo ""
    echo "用法: ./deploy.sh [命令]"
    echo ""
    echo "命令:"
    echo "  start     启动所有服务"
    echo "  stop      停止所有服务"
    echo "  restart   重启所有服务"
    echo "  build     重新构建镜像"
    echo "  logs [服务]  查看日志（可指定服务名）"
    echo "  status    查看服务状态和资源使用"
    echo "  clean     清理所有数据和容器"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例："
    echo "  ./deploy.sh start          # 启动服务"
    echo "  ./deploy.sh logs backend   # 查看后端日志"
    echo "  ./deploy.sh status         # 查看状态"
}

# 主程序
main() {
    local command=${1:-help}

    case $command in
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        build)
            build_images
            ;;
        logs)
            show_logs $2
            ;;
        status)
            show_status
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
