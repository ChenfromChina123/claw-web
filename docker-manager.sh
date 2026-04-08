#!/bin/bash
# ============================================================
# 多用户 Docker 隔离部署管理脚本
# 功能：为每个用户创建独立的容器实例，实现完全隔离
#
# 使用方法：
#   ./docker-manager.sh create-user <user_id>     # 创建新用户实例
#   ./docker-manager.sh start-user <user_id>      # 启动用户实例
#   ./docker-manager.sh stop-user <user_id>       # 停止用户实例
#   ./docker-manager.sh delete-user <user_id>     # 删除用户实例
#   ./docker-manager.sh list-users                # 列出所有用户
#   ./docker-manager.sh show-ports <user_id>      # 显示用户端口映射
# ============================================================

set -e

# ==================== 配置区 ====================
BASE_PORT_BACKEND=5000      # 基础后端端口
BASE_PORT_FRONTEND=3000     # 基础前端端口
BASE_PORT_MYSQL=3306        # 基础 MySQL 端口
BASE_PORT_REDIS=6379        # 基础 Redis 端口
PORT_INCREMENT=1000         # 每个用户的端口增量

DOCKER_NETWORK="aispring-user-network"  # Docker 网络名称
DATA_BASE_DIR="/opt/aispring-users"     # 用户数据根目录

# ==================== 辅助函数 ====================

/**
 * 计算用户端口偏移量
 * @param {string} user_id - 用户ID
 * @returns {number} 端口偏移量
 */
calculate_port_offset() {
    local user_id=$1
    # 使用用户ID的哈希值生成唯一的端口偏移（避免冲突）
    local hash=$(echo -n "$user_id" | md5sum | cut -c1-8)
    local offset=$((16#$hash % 100))  # 限制在 0-99 范围内
    echo $((offset * PORT_INCREMENT))
}

/**
 * 生成用户的 docker-compose 文件
 * @param {string} user_id - 用户ID
 */
generate_user_compose() {
    local user_id=$1
    local port_offset=$(calculate_port_offset $user_id)

    local backend_port=$((BASE_PORT_BACKEND + port_offset))
    local frontend_port=$((BASE_PORT_FRONTEND + port_offset))
    local mysql_port=$((BASE_PORT_MYSQL + port_offset))
    local redis_port=$((BASE_PORT_REDIS + port_offset))

    local user_dir="${DATA_BASE_DIR}/${user_id}"
    mkdir -p "${user_dir}/data"
    mkdir -p "${user_dir}/mysql"
    mkdir -p "${user_dir}/redis"
    mkdir -p "${user_dir}/logs"

    cat > "${user_dir}/docker-compose.yml" <<EOF
# ============================================================
# 用户 ${user_id} 的独立 Docker Compose 配置
# 自动生成 - 请勿手动修改
# ============================================================

version: '3.8'

services:
  # ========== MySQL 数据库（用户隔离） ==========
  mysql-${user_id}:
    image: mysql:8.0
    container_name: mysql-${user_id}
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: aispring_${user_id}
      MYSQL_USER: \${DB_USER}
      MYSQL_PASSWORD: \${DB_PASSWORD}
      TZ: Asia/Shanghai
    ports:
      - "${mysql_port}:3306"
    volumes:
      - mysql_${user_id}_data:/var/lib/mysql
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --max_connections=100
    networks:
      - network-${user_id}
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ========== Redis 缓存（用户隔离） ==========
  redis-${user_id}:
    image: redis:7-alpine
    container_name: redis-${user_id}
    restart: unless-stopped
    ports:
      - "${redis_port}:6379"
    volumes:
      - redis_${user_id}_data:/data
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    networks:
      - network-${user_id}
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ========== Spring Boot 后端 ==========
  backend-${user_id}:
    build:
      context: ../../aispring
      dockerfile: Dockerfile
    container_name: backend-${user_id}
    restart: unless-stopped
    ports:
      - "${backend_port}:5000"
    environment:
      DB_HOST: mysql-${user_id}
      DB_PORT: 3306
      DB_NAME: aispring_${user_id}
      DB_USERNAME: \${DB_USER}
      DB_PASSWORD: \${DB_PASSWORD}
      REDIS_HOST: redis-${user_id}
      REDIS_PORT: 6379
      JWT_SECRET_KEY: \${JWT_SECRET_KEY}_${user_id}
      DEEPSEEK_API_KEY: \${DEEPSEEK_API_KEY}
      DEEPSEEK_URL: \${DEEPSEEK_URL}
      JASYPT_PASSWORD: \${JASYPT_PASSWORD}_${user_id}
      APP_STORAGE_ROOT: /app/data
      SPRING_PROFILES_ACTIVE: prod
      JAVA_OPTS: "-Xms128m -Xmx256m -XX:+UseContainerSupport"
    volumes:
      - backend_${user_id}_data:/app/data
      - backend_${user_id}_logs:/app/logs
    depends_on:
      mysql-${user_id}:
        condition: service_healthy
      redis-${user_id}:
        condition: service_healthy
    networks:
      - network-${user_id}

  # ========== Claude Code Web 前后端 ==========
  web-${user_id}:
    build:
      context: ../../claude-code-haha
      dockerfile: Dockerfile
    container_name: web-${user_id}
    restart: unless-stopped
    ports:
      - "${frontend_port}:3000"
    environment:
      NODE_ENV: production
      DB_HOST: mysql-${user_id}
      DB_PORT: 3306
      DB_USER: \${DB_USER}
      DB_PASSWORD: \${DB_PASSWORD}
      DB_NAME: claude_code_${user_id}
      JWT_SECRET: \${JWT_SECRET}_${user_id}
      ANTHROPIC_API_KEY: \${ANTHROPIC_API_KEY}
      ANTHROPIC_AUTH_TOKEN: \${ANTHROPIC_AUTH_TOKEN}
      WORKSPACE_BASE_DIR: /app/data/workspaces
    volumes:
      - web_${user_id}_data:/app/data
      - web_${user_id}_workspaces:/app/data/workspaces
    depends_on:
      mysql-${user_id}:
        condition: service_healthy
      redis-${user_id}:
        condition: service_healthy
    networks:
      - network-${user_id}

networks:
  network-${user_id}:
    driver: bridge
    name: network-${user_id}

volumes:
  mysql_${user_id}_data:
    driver: local
  redis_${user_id}_data:
    driver: local
  backend_${user_id}_data:
    driver: local
  backend_${user_id}_logs:
    driver: local
  web_${user_id}_data:
    driver: local
  web_${user_id}_workspaces:
    driver: local
EOF

    # 创建环境变量文件
    cat > "${user_dir}/.env" <<EOF
# 用户 ${user_id} 的环境变量
DB_ROOT_PASSWORD=root_${user_id}_secure
DB_USER=user_${user_id}
DB_PASSWORD=db_${user_id}_secure_password
JWT_SECRET_KEY=${JWT_SECRET_KEY:-default_secret}
JWT_SECRET=${JWT_SECRET:-default_jwt_secret}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
DEEPSEEK_URL=${DEEPSEEK_URL:-https://dashscope.aliyuncs.com/compatible-mode}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ANTHROPIC_AUTH_TOKEN=${ANTHROPIC_AUTH_TOKEN}
JASYPT_PASSWORD=${JASYPT_PASSWORD:-aistudy_secret}
EOF

    echo "✅ 已生成用户 ${user_id} 的配置文件"
    echo "   📁 配置目录: ${user_dir}"
    echo "   🔗 后端端口: ${backend_port}"
    echo "   🌐 前端端口: ${frontend_port}"
    echo "   💾 MySQL 端口: ${mysql_port}"
    echo "   ⚡ Redis 端口: ${redis_port}"
}

# ==================== 主命令 ====================

case "$1" in
    create-user)
        if [ -z "$2" ]; then
            echo "❌ 错误: 请提供用户ID"
            echo "用法: $0 create-user <user_id>"
            exit 1
        fi
        generate_user_compose "$2"
        ;;

    start-user)
        if [ -z "$2" ]; then
            echo "❌ 错误: 请提供用户ID"
            echo "用法: $0 start-user <user_id>"
            exit 1
        fi
        local user_dir="${DATA_BASE_DIR}/${2}"
        if [ ! -d "$user_dir" ]; then
            echo "❌ 错误: 用户 $2 不存在，请先创建"
            exit 1
        fi
        cd "$user_dir"
        docker-compose up -d
        echo "✅ 用户 $2 的服务已启动"
        ;;

    stop-user)
        if [ -z "$2" ]; then
            echo "❌ 错误: 请提供用户ID"
            echo "用法: $0 stop-user <user_id>"
            exit 1
        fi
        local user_dir="${DATA_BASE_DIR}/${2}"
        if [ ! -d "$user_dir" ]; then
            echo "❌ 错误: 用户 $2 不存在"
            exit 1
        fi
        cd "$user_dir"
        docker-compose down
        echo "✅ 用户 $2 的服务已停止"
        ;;

    delete-user)
        if [ -z "$2" ]; then
            echo "❌ 错误: 请提供用户ID"
            echo "用法: $0 delete-user <user_id>"
            exit 1
        fi
        local user_dir="${DATA_BASE_DIR}/${2}"
        if [ ! -d "$user_dir" ]; then
            echo "❌ 错误: 用户 $2 不存在"
            exit 1
        fi
        read -p "⚠️  确定要删除用户 $2 及其所有数据吗？(y/N) " confirm
        if [[ $confirm =~ ^[Yy]$ ]]; then
            cd "$user_dir"
            docker-compose down -v
            cd ..
            rm -rf "$user_dir"
            echo "✅ 用户 $2 已完全删除"
        else
            echo "❌ 操作已取消"
        fi
        ;;

    list-users)
        echo "📋 当前已创建的用户列表:"
        echo "================================"
        if [ -d "$DATA_BASE_DIR" ]; then
            for user_dir in "${DATA_BASE_DIR}"/*/; do
                if [ -d "$user_dir" ]; then
                    local user_id=$(basename "$user_dir")
                    local port_offset=$(calculate_port_offset $user_id)
                    local backend_port=$((BASE_PORT_BACKEND + port_offset))
                    local frontend_port=$((BASE_PORT_FRONTEND + port_offset))

                    # 检查服务状态
                    local status="stopped"
                    if docker ps | grep -q "backend-${user_id}"; then
                        status="running ✅"
                    fi

                    printf "%-15s 后端:%-6s 前端:%-6s 状态: %s\n" \
                           "$user_id" "$backend_port" "$frontend_port" "$status"
                fi
            done
        else
            echo "   (暂无用户)"
        fi
        echo "================================"
        ;;

    show-ports)
        if [ -z "$2" ]; then
            echo "❌ 错误: 请提供用户ID"
            echo "用法: $0 show-ports <user_id>"
            exit 1
        fi
        local port_offset=$(calculate_port_offset $2)
        echo "🔗 用户 $2 的端口映射:"
        echo "================================"
        echo "后端 API:      $((BASE_PORT_BACKEND + port_offset))"
        echo "前端 Web:      $((BASE_PORT_FRONTEND + port_offset))"
        echo "MySQL 数据库:  $((BASE_PORT_MYSQL + port_offset))"
        echo "Redis 缓存:    $((BASE_PORT_REDIS + port_offset))"
        echo "================================"
        ;;

    *)
        echo "AI Study Project - 多用户 Docker 管理工具"
        echo ""
        echo "使用方法:"
        echo "  $0 create-user <user_id>     创建新的用户实例"
        echo "  $0 start-user <user_id>      启动用户服务"
        echo "  $0 stop-user <user_id>       停止用户服务"
        echo "  $0 delete-user <user_id>     删除用户及数据"
        echo "  $0 list-users                列出所有用户"
        echo "  $0 show-ports <user_id>      显示用户端口"
        echo ""
        echo "示例:"
        echo "  $0 create-user zhangsan"
        echo "  $0 start-user zhangsan"
        ;;
esac
