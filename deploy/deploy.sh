#!/bin/bash

# ============================================================================
# Claw-Web 一键部署脚本 (Linux)
# 
# 功能：从零开始部署 Claw-Web AI 智能体平台
# 前置条件：仅需要 Docker 已安装
# 
# 使用方法：
#   chmod +x deploy.sh
#   ./deploy.sh [选项]
#
# 选项：
#   --quick     快速模式（跳过交互式配置）
#   --reset     重置所有数据（危险操作）
#   --status    查看服务状态
#   --logs      查看日志
#   --stop      停止所有服务
#   --help      显示帮助信息
#
# 作者：Claw-Web Team
# 日期：2026-04-18
# ============================================================================

set -e  # 遇到错误立即退出

# ==================== 颜色定义 ====================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==================== 全局变量 ====================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${SCRIPT_DIR}/.."
INSTALL_DIR="/opt/claw-web"
GIT_REPO="https://github.com/ChenfromChina123/claw-web.git"
LOG_FILE="/var/log/claw-web-deploy.log"

# ==================== 工具函数 ====================

/**
 * 输出带颜色的信息日志
 */
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

/**
 * 输出警告日志
 */
log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

/**
 * 输出错误日志
 */
log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a "$LOG_FILE"
}

/**
 * 输出步骤标题
 */
log_step() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

/**
 * 显示进度条效果
 */
show_progress() {
    local duration=$1
    local message=$2
    echo -n "  ${message}"
    for i in $(seq 1 $duration); do
        sleep 1
        echo -n "."
    done
    echo " ${GREEN}✓${NC}"
}

/**
 * 检查命令是否存在
 */
check_command() {
    if command -v "$1" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

/**
 * 生成随机密码（32位）
 */
generate_password() {
    openssl rand -base64 32 | tr -d '/+=' | head -c 32
}

# ==================== 系统检查函数 ====================

/**
 * 检查是否为 root 用户运行
 */
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本必须以 root 用户运行！请使用: sudo ./deploy.sh"
        exit 1
    fi
    log_info "权限检查通过：当前为 root 用户"
}

/**
 * 检查并安装 Docker
 */
install_docker() {
    log_step "检查 Docker 环境"
    
    if check_command docker; then
        log_info "Docker 已安装: $(docker --version)"
        
        # 检查 Docker 服务状态
        if systemctl is-active --quiet docker; then
            log_info "Docker 服务正在运行"
            return 0
        else
            log_warn "Docker 服务未启动，尝试启动..."
            systemctl start docker
            systemctl enable docker
            log_info "Docker 服务已启动并设置开机自启"
            return 0
        fi
    fi
    
    log_warn "Docker 未安装，开始自动安装..."
    
    # 更新包索引
    apt-get update -qq
    
    # 安装依赖
    apt-get install -y -qq \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # 添加 Docker 官方 GPG 密钥
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    
    # 添加 Docker 仓库
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # 安装 Docker
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
    
    # 启动并设置开机自启
    systemctl start docker
    systemctl enable docker
    
    # 将当前用户添加到 docker 组（非 root 运行时需要）
    # usermod -aG docker $SUDO_USER
    
    log_info "Docker 安装完成: $(docker --version)"
    
    # 安装 Docker Compose（如果系统版本较旧没有 plugin）
    if ! check_command docker-compose && ! docker compose version &>/dev/null; then
        log_info "安装独立版 Docker Compose..."
        curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
            -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
    fi
}

/**
 * 检查并安装 Git
 */
install_git() {
    log_step "检查 Git 环境"
    
    if check_command git; then
        log_info "Git 已安装: $(git --version)"
        return 0
    fi
    
    log_warn "Git 未安装，开始自动安装..."
    apt-get install -y -qq git
    log_info "Git 安装完成: $(git --version)"
}

/**
 * 检查系统资源
 */
check_system_resources() {
    log_step "检查系统资源"
    
    # CPU 核心数
    local cpu_cores=$(nproc)
    log_info "CPU 核心数: ${cpu_cores}"
    
    if [[ $cpu_cores -lt 2 ]]; then
        log_warn "CPU 核心数较少（建议至少 2 核）"
    fi
    
    # 内存
    local total_mem=$(free -g | awk '/Mem:/ {print $2}')
    log_info "总内存: ${total_mem} GB"
    
    if [[ $total_mem -lt 4 ]]; then
        log_warn "内存较少（建议至少 4 GB）"
    fi
    
    # 磁盘空间
    local disk_free=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
    log_info "可用磁盘空间: ${disk_free} GB"
    
    if [[ $disk_free -lt 20 ]]; then
        log_error "磁盘空间不足（建议至少 20 GB 可用空间）"
        exit 1
    fi
    
    # Docker 磁盘空间
    local docker_disk=$(docker system df 2>/dev/null | tail -1 | awk '{print $4}' || echo "未知")
    log_info "Docker 占用空间: ${docker_disk}"
}

# ==================== 项目部署函数 ====================

/**
 * 克隆或更新项目代码
 */
setup_project() {
    log_step "配置项目代码"
    
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        log_warn "项目目录已存在，更新代码..."
        cd "$INSTALL_DIR"
        git pull origin main || git pull origin master
        log_info "项目代码已更新"
    else
        log_info "克隆项目代码到 ${INSTALL_DIR}..."
        
        # 创建父目录
        mkdir -p "$(dirname "$INSTALL_DIR")"
        
        # 克隆项目（浅克隆加快速度）
        git clone --depth 1 "$GIT_REPO" "$INSTALL_DIR"
        
        log_info "项目代码克隆完成"
    fi
    
    # 创建必要目录
    mkdir -p "$INSTALL_DIR/server/src/master/db/migrations"
    mkdir -p "/data/claws/workspaces/users"
    
    log_info "目录结构创建完成"
}

/**
 * 生成交互式环境配置
 */
configure_environment() {
    log_step "配置环境变量"
    
    local env_file="$INSTALL_DIR/.env"
    
    # 如果 .env 已存在且不是 reset 模式，询问是否重新配置
    if [[ -f "$env_file" ]] && [[ "$1" != "--reset" ]]; then
        read -p "检测到现有配置文件，是否重新配置？(y/N): " reconfig
        if [[ "$reconfig" != "y" && "$reconfig" != "Y" ]]; then
            log_info "使用现有配置文件"
            return 0
        fi
    fi
    
    log_info "生成新的环境配置..."
    
    # 生成随机密码和密钥
    local mysql_root_pass=$(generate_password)
    local mysql_user_pass=$(generate_password)
    local jwt_secret=$(generate_password)
    local master_token=$(generate_password)
    
    # 创建 .env 文件
    cat > "$env_file" << EOF
# ==================== Claw-Web 自动生成的环境变量配置 ====================
# 生成时间: $(date)

# ==================== MySQL 数据库配置 ====================
MYSQL_ROOT_PASSWORD=${mysql_root_pass}
MYSQL_DATABASE=claw_web
MYSQL_USER=clawuser
MYSQL_PASSWORD=${mysql_user_pass}
MYSQL_PORT=23306

# ==================== Master 服务配置 ====================
MASTER_PORT=13000

# JWT 认证配置
JWT_SECRET=${jwt_secret}
JWT_EXPIRES_IN=7d

# Anthropic API 配置（用于 AI Agent 功能）
ANTHROPIC_AUTH_TOKEN=
ANTHROPIC_BASE_URL=https://api.anthropic.com

# 阿里云百炼（通义千问）API 配置
# 获取方式：https://bailian.console.aliyun.com/
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# LLM 模型选择配置
# 可选值: anthropic, qwen
LLM_PROVIDER=qwen
LLM_MODEL=qwen-plus

# ==================== Worker 容器池配置 ====================
CONTAINER_POOL_MIN_SIZE=1
CONTAINER_POOL_MAX_SIZE=5
CONTAINER_IDLE_TIMEOUT_MS=0
CONTAINER_BASE_PORT=3100

# Master-Worker 内部通信 Token（必须保持一致！）
MASTER_INTERNAL_TOKEN=${master_token}

# ==================== 前端服务配置 ====================
FRONTEND_PORT=80

# ==================== 监控与运维配置 ====================
DISK_WARNING_THRESHOLD=80
DISK_CRITICAL_THRESHOLD=90
ENABLE_DOCKER_AUTO_CLEANUP=true

# PTY 终端配置（生产模式启用）
PTY_ENABLED=true

# SMTP 邮件服务配置（可选）
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
EOF
    
    # 设置权限
    chmod 600 "$env_file"
    
    log_info "环境配置文件已生成: ${env_file}"
    log_warn "请根据需要修改 LLM API 密钥（QWEN_API_KEY 或 ANTHROPIC_AUTH_TOKEN）"
}

/**
 * 快速模式配置（使用默认值）
 */
configure_quick_mode() {
    log_step "快速模式配置环境变量"
    
    local env_file="$INSTALL_DIR/.env"
    
    cat > "$env_file" << EOF
# Claw-Web 快速部署配置
MYSQL_ROOT_PASSWORD=clawweb2024_root
MYSQL_DATABASE=claw_web
MYSQL_USER=clawuser
MYSQL_PASSWORD=clawpass2024
MYSQL_PORT=23306
MASTER_PORT=13000
JWT_SECRET=claw-web-jwt-secret-change-me
JWT_EXPIRES_IN=7d
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_PROVIDER=qwen
LLM_MODEL=qwen-plus
CONTAINER_POOL_MIN_SIZE=1
CONTAINER_POOL_MAX_SIZE=5
CONTAINER_IDLE_TIMEOUT_MS=0
CONTAINER_BASE_PORT=3100
MASTER_INTERNAL_TOKEN=internal-token-change-me
FRONTEND_PORT=80
DISK_WARNING_THRESHOLD=80
DISK_CRITICAL_THRESHOLD=90
ENABLE_DOCKER_AUTO_CLEANUP=true
PTY_ENABLED=true
EOF
    
    log_info "快速配置完成（使用默认密码，生产环境请修改！）"
}

# ==================== 服务管理函数 ====================

/**
 * 构建并启动所有服务
 */
start_services() {
    log_step "构建并启动服务"
    
    cd "$INSTALL_DIR"
    
    # 清理旧容器和镜像（如果是 reset 模式）
    if [[ "$1" == "--reset" ]]; then
        log_warn "重置模式：停止并删除旧容器..."
        docker compose down -v --remove-orphans 2>/dev/null || true
        
        # 删除旧镜像
        docker rmi claw-web-master:latest 2>/dev/null || true
        docker rmi claw-web-backend-worker:latest 2>/dev/null || true
        docker rmi claw-web-frontend:latest 2>/dev/null || true
    fi
    
    # 构建并启动（不使用缓存确保最新代码）
    log_info "构建 Docker 镜像（这可能需要几分钟）..."
    docker compose build --no-cache master worker frontend
    
    # 启动服务
    log_info "启动所有服务..."
    docker compose up -d mysql master frontend
    
    # 构建 Worker 模板镜像（不自动启动）
    docker compose build --no-cache worker
    
    show_progress 10 "等待服务启动"
    
    # 检查服务状态
    check_services_health
}

/**
 * 检查服务健康状态
 */
check_services_health() {
    log_step "检查服务健康状态"
    
    cd "$INSTALL_DIR"
    
    local services=("claw-web-mysql" "claw-web-master" "claw-web-frontend")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local status=$(docker inspect --format='{{.State.Status}}' "$service" 2>/dev/null || echo "not_found")
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "unknown")
        
        if [[ "$status" == "running" ]]; then
            if [[ "$health" == "healthy" ]]; then
                log_info "✓ ${service}: 运行中 (健康)"
            else
                log_warn "⚠ ${service}: 运行中 (${health})"
                all_healthy=false
            fi
        else
            log_error "✗ ${service}: ${status}"
            all_healthy=false
        fi
    done
    
    if [[ "$all_healthy" == true ]]; then
        echo ""
        log_info "=========================================="
        log_info "🎉 所有服务已成功启动！"
        log_info "=========================================="
        echo ""
        print_access_info
    else
        echo ""
        log_warn "部分服务可能还在初始化中，请稍后查看状态"
        echo ""
        print_access_info
    fi
}

/**
 * 打印访问信息
 */
print_access_info() {
    local host_ip=$(hostname -I | awk '{print $1}')
    local mysql_port=$(grep MYSQL_PORT "$INSTALL_DIR/.env" | cut -d'=' -f2)
    local master_port=$(grep MASTER_PORT "$INSTALL_DIR/.env" | cut -d'=' -f2)
    local frontend_port=$(grep FRONTEND_PORT "$INSTALL_DIR/.env" | cut -d'=' -f2)
    
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}  🚀 Claw-Web 部署成功！访问地址：       ${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BLUE}前端界面:${NC}  http://${host_ip}:${frontend_port}"
    echo -e "  ${BLUE}API 接口:${NC}  http://${host_ip}:${master_port}/api"
    echo -e "  ${BLUE}MySQL:${NC}     ${host_ip}:${mysql_port}"
    echo ""
    echo -e "  ${YELLOW}常用命令：${NC}"
    echo -e "    查看状态:  docker compose -f ${INSTALL_DIR}/docker-compose.yml ps"
    echo -e "    查看日志:  docker compose -f ${INSTALL_DIR}/docker-compose.yml logs -f"
    echo -e "    停止服务:  docker compose -f ${INSTALL_DIR}/docker-compose.yml down"
    echo -e "    重启服务:  docker compose -f ${INSTALL_DIR}/docker-compose.yml restart"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════${NC}"
}

/**
 * 停止所有服务
 */
stop_services() {
    log_step "停止所有服务"
    
    cd "$INSTALL_DIR"
    docker compose down
    
    log_info "所有服务已停止"
}

/**
 * 查看服务状态
 */
show_status() {
    log_step "服务运行状态"
    
    cd "$INSTALL_DIR"
    docker compose ps
    
    echo ""
    log_info "资源使用情况:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
}

/**
 * 查看实时日志
 */
show_logs() {
    log_info "查看实时日志（Ctrl+C 退出）..."
    
    cd "$INSTALL_DIR"
    docker compose logs -f --tail=100
}

/**
 * 重置所有数据（危险操作）
 */
reset_all() {
    log_warn "⚠️  此操作将删除所有数据！包括数据库、工作区等"
    read -p "确认要继续吗？输入 'YES' 确认: " confirm
    
    if [[ "$confirm" != "YES" ]]; then
        log_info "操作已取消"
        return 0
    fi
    
    log_step "重置所有数据"
    
    cd "$INSTALL_DIR"
    
    # 停止并删除所有容器、网络、卷
    docker compose down -v --remove-orphans --rmi all
    
    # 删除残留数据
    rm -rf /data/claws/workspaces/*
    
    log_info "所有数据已清除"
}

# ==================== 主函数 ====================

/**
 * 显示帮助信息
 */
show_help() {
    echo ""
    echo -e "${GREEN}Claw-Web 一键部署脚本${NC}"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --quick     快速模式（使用默认配置，跳过交互）"
    echo "  --reset     重置所有数据后重新部署"
    echo "  --status   查看服务运行状态"
    echo "  --logs     查看实时日志"
    echo "  --stop     停止所有服务"
    echo "  --help     显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  $0              # 交互式完整部署"
    echo "  $0 --quick      # 快速部署（使用默认配置）"
    echo "  $0 --status     # 查看服务状态"
    echo "  $0 --logs       # 查看日志"
    echo ""
}

/**
 * 主入口函数
 */
main() {
    # 解析命令行参数
    case "${1:-}" in
        --help|-h)
            show_help
            exit 0
            ;;
        --status)
            show_status
            exit 0
            ;;
        --logs)
            show_logs
            exit 0
            ;;
        --stop)
            check_root
            stop_services
            exit 0
            ;;
        --reset)
            check_root
            install_docker
            install_git
            check_system_resources
            setup_project
            configure_environment "$1"
            start_services "$1"
            exit 0
            ;;
        --quick)
            check_root
            install_docker
            install_git
            check_system_resources
            setup_project
            configure_quick_mode
            start_services
            exit 0
            ;;
        "")
            # 无参数，执行完整交互式部署
            ;;
        *)
            log_error "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
    
    # ========== 完整部署流程 ==========
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     Claw-Web 一键部署脚本 v1.0         ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # 1. 权限检查
    check_root
    
    # 2. 安装依赖
    install_docker
    install_git
    
    # 3. 系统检查
    check_system_resources
    
    # 4. 项目配置
    setup_project
    
    # 5. 环境配置
    configure_environment
    
    # 6. 启动服务
    start_services
    
    # 完成
    echo ""
    log_info "部署流程完成！"
}

# 执行主函数
main "$@"
