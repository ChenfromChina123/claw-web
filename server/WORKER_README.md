# Worker 本地开发指南

## 快速启动

### Windows

```powershell
# 设置环境变量
$env:MASTER_INTERNAL_TOKEN = "internal-master-worker-token-2024"
$env:PTY_ENABLED = "true"
$env:WORKSPACE_DIR = "C:\workspace"

# 创建工作目录（如果不存在）
New-Item -ItemType Directory -Path "C:\workspace" -Force

# 启动 Worker
cd server
bun run start:worker
```

### Linux / macOS

```bash
# 设置环境变量
export MASTER_INTERNAL_TOKEN="internal-master-worker-token-2024"
export PTY_ENABLED="true"
export WORKSPACE_DIR="/workspace"

# 创建工作目录（如果不存在）
sudo mkdir -p /workspace
sudo chmod 777 /workspace

# 启动 Worker
cd server
bun run start:worker
```

## 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MASTER_INTERNAL_TOKEN` | Master-Worker 通信 Token | 必填 |
| `PTY_ENABLED` | 是否启用 PTY 终端 | `false` |
| `WORKSPACE_DIR` | 工作目录（Windows） | `C:\workspace` |

## 测试

### 运行跨平台测试

```bash
cd server
bun run test/worker-cross-platform-test.ts
```

测试项目：
- ✅ 健康检查
- ✅ 命令执行
- ✅ 文件读写
- ✅ 目录列表
- ✅ 安全验证（路径遍历、Token 验证）

### 手动测试

```bash
# 健康检查
curl http://localhost:4000/internal/health

# 执行命令
curl -X POST http://localhost:4000/internal/exec \
  -H "X-Master-Token: internal-master-worker-token-2024" \
  -H "X-User-Id: test-user" \
  -H "Content-Type: application/json" \
  -d '{"type":"exec","requestId":"test","payload":{"command":"echo hello","cwd":"/workspace"}}'
```

## 跨平台兼容性

### 自动适配功能

1. **工作目录**：根据操作系统自动切换
   - Windows: `C:\workspace` (可通过 `WORKSPACE_DIR` 自定义)
   - Linux/macOS: `/workspace`

2. **路径处理**：使用 `path` 模块自动处理路径分隔符
   - Windows: `\`
   - Linux/macOS: `/`

3. **目录列表**：使用 Node.js `fs` 模块，不依赖系统命令
   - 避免使用 `ls` (Linux) 或 `dir` (Windows)
   - 跨平台一致的行为

4. **命令执行**：使用系统原生 shell
   - Windows: `cmd.exe`
   - Linux/macOS: `/bin/sh`

## 安全特性

- ✅ 路径沙箱隔离（禁止访问工作目录外文件）
- ✅ Master Token 验证
- ✅ 路径遍历攻击防护
- ✅ 命令黑名单验证

## 常见问题

### Q: Worker 启动失败，提示 "Cannot find package 'node-pty'"
A: 运行 `bun install` 安装依赖

### Q: 文件操作失败，提示 "INVALID_CWD"
A: 确保使用的工作目录在沙箱范围内（Windows: `C:\workspace`, Linux: `/workspace`）

### Q: 如何在 Docker 中使用？
A: Docker 模式下 Worker 会自动使用 `/workspace`，无需手动配置

## 架构说明

Worker 是纯沙箱执行环境：
- ❌ 不连接数据库
- ❌ 不处理用户认证
- ✅ 只执行来自 Master 的可信请求
- ✅ 专注于命令执行和文件操作

通信协议：
- HTTP API: `http://localhost:4000/internal/*`
- WebSocket: `ws://localhost:4000/internal/pty`
- 需要 `X-Master-Token` 和 `X-User-Id` 请求头
