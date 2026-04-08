#!/bin/bash
#
# Linux 环境一键启动搜索服务脚本
# 功能：启动 SearXNG 搜索服务
#
# 使用方法：
#   chmod +x start-search-service.sh
#   ./start-search-service.sh
#

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 配置
SEARXNG_PORT=9080
BACKEND_PORT=9500

# 检查 Docker 是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    log_success "Docker 和 Docker Compose 已安装"
}

# 检查 Docker 是否运行
check_docker_running() {
    if ! docker info &> /dev/null; then
        log_error "Docker 服务未运行，请启动 Docker 服务"
        exit 1
    fi
    
    log_success "Docker 服务正在运行"
}

# 启动 SearXNG 服务
start_searxng() {
    log_info "正在启动 SearXNG 搜索服务（端口：$SEARXNG_PORT）..."
    
    cd "$(dirname "$0")"
    
    # 修改 docker-compose.yml 中的端口
    if [ -f "docker-compose.yml" ]; then
        # 备份原文件
        cp docker-compose.yml docker-compose.yml.bak
        
        # 修改端口
        sed -i "s/- \"8080:8080\"/- \"$SEARXNG_PORT:8080\"/g" docker-compose.yml
        
        # 启动
        docker-compose up -d
        
        # 等待服务启动
        log_info "等待 SearXNG 服务启动..."
        sleep 10
        
        # 检查容器状态
        if docker ps | grep -q searxng; then
            log_success "SearXNG 服务启动成功"
            log_info "访问地址：http://localhost:$SEARXNG_PORT"
            log_info "测试搜索：http://localhost:$SEARXNG_PORT/search?q=test&format=json"
        else
            log_error "SearXNG 服务启动失败，请查看日志：docker logs searxng"
            # 恢复原文件
            mv docker-compose.yml.bak docker-compose.yml
            exit 1
        fi
        
        # 清理备份
        rm -f docker-compose.yml.bak
    else
        log_error "未找到 docker-compose.yml 文件"
        exit 1
    fi
}

# 主函数
main() {
    log_info "=========================================="
    log_info "  启动搜索服务"
    log_info "=========================================="
    
    check_docker
    check_docker_running
    start_searxng
    
    log_success "=========================================="
    log_success "  搜索服务启动完成！"
    log_success "=========================================="
    echo ""
    log_info "SearXNG 地址：http://localhost:$SEARXNG_PORT"
    log_info "后端服务地址：http://localhost:$BACKEND_PORT"
    echo ""
    log_info "查看日志：docker logs -f searxng"
    log_info "停止服务：docker-compose down"
    echo ""
}

# 运行主函数
main "$@"
