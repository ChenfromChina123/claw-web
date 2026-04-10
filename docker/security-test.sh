#!/bin/bash

# Docker 安全配置测试脚本
# 用于验证生产环境的安全配置是否正确应用

set -e

CONTAINER_NAME="claude-backend-prod"
COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_NC='\033[0m' # No Color

echo "======================================"
echo "Docker 安全配置测试"
echo "======================================"
echo ""

# 测试 1：验证容器是否以非 root 用户运行
echo "测试 1：检查用户身份..."
USER_NAME=$(docker exec $CONTAINER_NAME whoami 2>/dev/null || echo "failed")
if [ "$USER_NAME" = "bun" ]; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：容器以非 root 用户（bun）运行"
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：容器用户是：$USER_NAME（应该是 bun）"
fi
echo ""

# 测试 2：验证无法提权
echo "测试 2：测试提权..."
if docker exec $CONTAINER_NAME sudo whoami 2>&1 | grep -q "command not found"; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：sudo 命令不存在，无法提权"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：sudo 命令存在，请检查配置"
fi
echo ""

# 测试 3：验证只读文件系统
echo "测试 3：测试根文件系统..."
if docker exec $CONTAINER_NAME touch /test-file 2>&1 | grep -q "Read-only file system"; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：根文件系统为只读"
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：根文件系统可写（应该启用 read_only: true）"
fi
echo ""

# 测试 4：验证临时文件系统
echo "测试 4：测试临时文件系统..."
if docker exec $CONTAINER_NAME touch /tmp/test-file 2>/dev/null; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：可以写入 /tmp（tmpfs 配置正确）"
    docker exec $CONTAINER_NAME rm -f /tmp/test-file
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：无法写入 /tmp（tmpfs 配置可能有问题）"
fi
echo ""

# 测试 5：验证 noexec 挂载
echo "测试 5：测试 noexec 挂载..."
if docker exec $CONTAINER_NAME sh -c "echo '#!/bin/sh' > /tmp/test.sh && chmod +x /tmp/test.sh && /tmp/test.sh" 2>&1 | grep -q "Permission denied\|Exec format error"; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：/tmp 禁止执行（noexec 生效）"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：/tmp 可能未启用 noexec"
fi
docker exec $CONTAINER_NAME rm -f /tmp/test.sh 2>/dev/null || true
echo ""

# 测试 6：验证能力配置
echo "测试 6：检查 Docker 能力配置..."
CAP_DROP=$(docker inspect $CONTAINER_NAME --format='{{.HostConfig.CapDrop}}' 2>/dev/null || echo "none")
CAP_ADD=$(docker inspect $CONTAINER_NAME --format='{{.HostConfig.CapAdd}}' 2>/dev/null || echo "none")

if [[ "$CAP_DROP" == *"ALL"* ]]; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：CapDrop 包含 ALL"
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：CapDrop 应该是 ALL（当前：$CAP_DROP）"
fi

if [[ "$CAP_ADD" == *"CHOWN"* ]] && [[ "$CAP_ADD" == *"SETUID"* ]]; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：CapAdd 包含必需的能力"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：CapAdd 可能不完整（当前：$CAP_ADD）"
fi
echo ""

# 测试 7：验证 Seccomp 配置
echo "测试 7：检查 Seccomp 配置..."
SECCOMP=$(docker inspect $CONTAINER_NAME --format='{{.HostConfig.SecurityOpt}}' 2>/dev/null || echo "none")
if [[ "$SECCOMP" == *"seccomp"* ]]; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：Seccomp 配置文件已应用"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：未检测到 Seccomp 配置文件"
fi
echo ""

# 测试 8：验证资源限制
echo "测试 8：检查资源限制..."
MEMORY_LIMIT=$(docker inspect $CONTAINER_NAME --format='{{.HostConfig.Memory}}' 2>/dev/null || echo "0")
if [ "$MEMORY_LIMIT" -gt 0 ]; then
    MEMORY_MB=$((MEMORY_LIMIT / 1024 / 1024))
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：内存限制为 ${MEMORY_MB}MB"
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：未设置内存限制"
fi

CPU_LIMIT=$(docker inspect $CONTAINER_NAME --format='{{.HostConfig.NanoCpus}}' 2>/dev/null || echo "0")
if [ "$CPU_LIMIT" -gt 0 ]; then
    CPU_CORES=$(echo "scale=2; $CPU_LIMIT / 1000000000" | bc 2>/dev/null || echo "unknown")
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：CPU 限制为 ${CPU_CORES} 核"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：未设置 CPU 限制"
fi
echo ""

# 测试 9：验证 PTY 功能
echo "测试 9：测试 PTY 功能..."
if docker exec -it $CONTAINER_NAME echo "PTY test" 2>/dev/null | grep -q "PTY test"; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：PTY 功能正常"
else
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：PTY 功能可能有问题"
fi
echo ""

# 测试 10：验证健康检查
echo "测试 10：检查健康状态..."
HEALTH_STATUS=$(docker inspect $CONTAINER_NAME --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "${COLOR_GREEN}✓ 通过${COLOR_NC}：容器健康状态正常"
elif [ "$HEALTH_STATUS" = "starting" ]; then
    echo -e "${COLOR_YELLOW}⚠ 警告${COLOR_NC}：容器正在启动中"
else
    echo -e "${COLOR_RED}✗ 失败${COLOR_NC}：容器健康状态：$HEALTH_STATUS"
fi
echo ""

echo "======================================"
echo "测试完成"
echo "======================================"
echo ""
echo "说明："
echo "  ✓ 通过 - 安全配置正确应用"
echo "  ⚠ 警告 - 配置可能不完整，但不影响安全"
echo "  ✗ 失败 - 需要修复的安全配置问题"
echo ""
