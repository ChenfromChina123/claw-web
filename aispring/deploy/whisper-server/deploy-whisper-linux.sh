#!/bin/bash
#
# Whisper Server 部署脚本 (Linux)
# 用于在 Linux 服务器上部署 Whisper 语音识别服务
#

set -e

# 配置变量
WHISPER_VERSION="1.7.4"
WHISPER_MODEL="base.en"
WHISPER_PORT=8090
WHISPER_HOST="0.0.0.0"
INSTALL_DIR="/opt/whisper-server"
MODEL_DIR="${INSTALL_DIR}/models"
LOG_DIR="/var/log/whisper-server"
USER="whisper"
SERVICE_NAME="whisper-server"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否以 root 运行
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "请使用 root 权限运行此脚本"
        exit 1
    fi
}

# 安装依赖
install_dependencies() {
    log_info "安装依赖包..."

    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y wget curl git build-essential
    elif command -v yum &> /dev/null; then
        yum install -y wget curl git gcc gcc-c++ make
    elif command -v dnf &> /dev/null; then
        dnf install -y wget curl git gcc gcc-c++ make
    else
        log_error "不支持的包管理器"
        exit 1
    fi
}

# 创建用户
create_user() {
    if ! id -u ${USER} &>/dev/null; then
        log_info "创建 whisper 用户..."
        useradd -r -s /bin/false -d ${INSTALL_DIR} ${USER}
    fi
}

# 创建目录
create_directories() {
    log_info "创建目录..."
    mkdir -p ${INSTALL_DIR}
    mkdir -p ${MODEL_DIR}
    mkdir -p ${LOG_DIR}

    chown -R ${USER}:${USER} ${INSTALL_DIR}
    chown -R ${USER}:${USER} ${LOG_DIR}
}

# 下载 whisper.cpp
download_whisper() {
    log_info "下载 whisper.cpp..."

    cd /tmp

    # 下载预编译版本
    ARCH=$(uname -m)
    case ${ARCH} in
        x86_64)
            WHISPER_ARCH="x64"
            ;;
        aarch64)
            WHISPER_ARCH="arm64"
            ;;
        *)
            log_error "不支持的架构: ${ARCH}"
            exit 1
            ;;
    esac

    WHISPER_URL="https://github.com/ggerganov/whisper.cpp/releases/download/v${WHISPER_VERSION}/whisper-linux-${WHISPER_ARCH}.tar.gz"

    wget -q ${WHISPER_URL} -O whisper.tar.gz || {
        log_warn "预编译版本下载失败，尝试从源码编译..."
        build_from_source
        return
    }

    tar -xzf whisper.tar.gz
    cp -r whisper-linux-${WHISPER_ARCH}/* ${INSTALL_DIR}/
    chmod +x ${INSTALL_DIR}/whisper-server

    rm -rf whisper.tar.gz whisper-linux-${WHISPER_ARCH}
}

# 从源码编译
build_from_source() {
    log_info "从源码编译 whisper.cpp..."

    cd /tmp
    git clone https://github.com/ggerganov/whisper.cpp.git
    cd whisper.cpp

    # 编译 server (正确的 make 目标是 server)
    make server

    # 复制编译产物
    cp ./bin/whisper-server ${INSTALL_DIR}/whisper-server || cp ./server ${INSTALL_DIR}/whisper-server || {
        log_error "找不到编译后的 whisper-server 可执行文件"
        exit 1
    }

    chmod +x ${INSTALL_DIR}/whisper-server

    cd /tmp
    rm -rf whisper.cpp
}

# 下载模型
download_model() {
    log_info "下载 Whisper 模型 (${WHISPER_MODEL})..."

    MODEL_FILE="${MODEL_DIR}/ggml-${WHISPER_MODEL}.bin"

    if [ -f "${MODEL_FILE}" ]; then
        log_info "模型已存在，跳过下载"
        return
    fi

    MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${WHISPER_MODEL}.bin"

    wget -q ${MODEL_URL} -O ${MODEL_FILE} || {
        log_error "模型下载失败"
        exit 1
    }

    chown ${USER}:${USER} ${MODEL_FILE}
}

# 创建 systemd 服务
create_systemd_service() {
    log_info "创建 systemd 服务..."

    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Whisper.cpp Speech Recognition Server
After=network.target

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/whisper-server -m ${MODEL_DIR}/ggml-${WHISPER_MODEL}.bin --port ${WHISPER_PORT} --host ${WHISPER_HOST}
Restart=always
RestartSec=10
StandardOutput=append:${LOG_DIR}/whisper-server.log
StandardError=append:${LOG_DIR}/whisper-server-error.log

# 资源限制
LimitNOFILE=65535
LimitNPROC=4096

# 安全设置
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
}

# 创建环境变量配置
create_env_config() {
    log_info "创建环境配置..."

    cat > ${INSTALL_DIR}/whisper-server.conf << EOF
# Whisper Server 配置文件
# 修改后需重启服务: systemctl restart whisper-server

# 监听端口
WHISPER_PORT=${WHISPER_PORT}

# 监听地址
WHISPER_HOST=${WHISPER_HOST}

# 模型路径
WHISPER_MODEL=${MODEL_DIR}/ggml-${WHISPER_MODEL}.bin

# 线程数 (默认: CPU核心数)
WHISPER_THREADS=$(nproc)

# 语言 (en, zh, auto)
WHISPER_LANGUAGE=en
EOF

    chown ${USER}:${USER} ${INSTALL_DIR}/whisper-server.conf
}

# 创建管理脚本
create_manage_script() {
    log_info "创建管理脚本..."

    cat > ${INSTALL_DIR}/manage.sh << 'EOF'
#!/bin/bash
# Whisper Server 管理脚本

case "$1" in
    start)
        systemctl start whisper-server
        echo "Whisper Server 已启动"
        ;;
    stop)
        systemctl stop whisper-server
        echo "Whisper Server 已停止"
        ;;
    restart)
        systemctl restart whisper-server
        echo "Whisper Server 已重启"
        ;;
    status)
        systemctl status whisper-server
        ;;
    logs)
        tail -f /var/log/whisper-server/whisper-server.log
        ;;
    test)
        echo "测试 Whisper Server..."
        curl -s http://localhost:8090/health || echo "服务未响应"
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|test}"
        exit 1
        ;;
esac
EOF

    chmod +x ${INSTALL_DIR}/manage.sh
}

# 配置防火墙
configure_firewall() {
    log_info "配置防火墙..."

    if command -v ufw &> /dev/null; then
        ufw allow ${WHISPER_PORT}/tcp
        log_info "已添加 UFW 规则"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=${WHISPER_PORT}/tcp
        firewall-cmd --reload
        log_info "已添加 firewalld 规则"
    else
        log_warn "未检测到防火墙，请手动配置"
    fi
}

# 启动服务
start_service() {
    log_info "启动 Whisper Server..."
    systemctl start ${SERVICE_NAME}
    sleep 3

    if systemctl is-active --quiet ${SERVICE_NAME}; then
        log_info "Whisper Server 启动成功!"
    else
        log_error "Whisper Server 启动失败，请检查日志"
        journalctl -u ${SERVICE_NAME} -n 50
        exit 1
    fi
}

# 测试服务
test_service() {
    log_info "测试 Whisper Server..."

    # 等待服务完全启动
    sleep 5

    # 检查服务状态
    if curl -s http://localhost:${WHISPER_PORT}/ > /dev/null; then
        log_info "Whisper Server 运行正常"
        log_info "API 端点: http://$(hostname -I | awk '{print $1}'):${WHISPER_PORT}/inference"
    else
        log_warn "服务可能还在初始化中，请稍后检查"
    fi
}

# 显示使用说明
show_usage() {
    echo ""
    echo "=========================================="
    echo "  Whisper Server 部署完成!"
    echo "=========================================="
    echo ""
    echo "服务地址: http://$(hostname -I | awk '{print $1}'):${WHISPER_PORT}/inference"
    echo ""
    echo "管理命令:"
    echo "  启动:   systemctl start whisper-server"
    echo "  停止:   systemctl stop whisper-server"
    echo "  重启:   systemctl restart whisper-server"
    echo "  状态:   systemctl status whisper-server"
    echo "  日志:   tail -f /var/log/whisper-server/whisper-server.log"
    echo ""
    echo "测试命令:"
    echo "  curl -X POST -F 'file=@audio.wav' http://localhost:${WHISPER_PORT}/inference"
    echo ""
}

# 主函数
main() {
    echo "=========================================="
    echo "  Whisper Server Linux 部署脚本"
    echo "=========================================="
    echo ""

    check_root
    install_dependencies
    create_user
    create_directories
    download_whisper
    download_model
    create_systemd_service
    create_env_config
    create_manage_script
    configure_firewall
    start_service
    test_service
    show_usage
}

# 执行主函数
main "$@"
