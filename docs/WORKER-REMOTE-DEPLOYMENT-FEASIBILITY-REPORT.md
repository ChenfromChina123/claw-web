# Claw-Web Worker 部署到任意设备的可行性研究报告

**文档版本**: v1.0  
**生成日期**: 2026-04-17  
**研究范围**: 通信架构、操作兼容性、权限可控性  
**目标场景**: 将 Worker 部署到远程服务器、边缘设备、家用 PC、云实例等任意设备

---

## 一、研究背景与目标

### 1.1 当前架构

当前 Claw-Web 架构中，Worker 运行在 Master 同一宿主机的 Docker 容器内，由 `ContainerOrchestrator` 通过 `docker run` 命令动态创建和管理。

**核心约束**：
- Worker 由 Master 通过 `docker CLI` 直接创建（[containerOrchestrator.ts:1421-1510](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/orchestrator/containerOrchestrator.ts#L1421-L1510)）
- 通信依赖 Docker 内部 DNS（`http://{containerName}:3000`）
- 网络隔离依赖 Docker 自定义网络（`worker-network`）
- 文件系统通过 Bind Mount（`-v {hostPath}:/workspace`）实现持久化

### 1.2 研究目标

探究将 Worker 部署到**任意设备**（如远程服务器、边缘设备、家用 PC、云实例等）的可行性，从以下三个维度进行深度分析：

1. **通信可行性**：Master 与远程 Worker 的通信机制改造
2. **操作兼容性**：Worker 在不同操作系统和设备上的运行兼容性
3. **权限可控性**：远程部署后的安全隔离和权限控制

### 1.3 当前架构示意图

```
┌─────────────────────────────────────────────────────────────┐
│                     当前架构（同宿主机）                       │
│                                                              │
│  ┌──────────┐   Docker Network   ┌──────────────────────┐   │
│  │  Master   │ ◄──────────────► │  Worker (Docker 容器)   │   │
│  │  (3000)   │   worker-network  │  (3000/4000)          │   │
│  │           │                   │  ├─ PTY (node-pty)    │   │
│  │  ├─ JWT   │   HTTP + WS      │  ├─ Sandbox (exec)    │   │
│  │  ├─ 编排器 │ ──────────────► │  └─ FileOps (fs)      │   │
│  │  └─ MySQL │   X-Master-Token │                        │   │
│  └──────────┘                   └──────────────────────┘   │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────┐                                               │
│  │  MySQL   │  ◄── claude-network（Worker 无法访问）         │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、通信可行性分析

### 2.1 当前通信机制

| 通信方式 | 用途 | 当前实现 | 远程可行性 |
|---------|------|---------|-----------|
| HTTP（Master→Worker） | 命令执行、文件操作 | Docker 内部 DNS | ⚠️ 需改造 |
| WebSocket（Master→Worker） | PTY 终端实时通信 | Docker 内部 DNS | ⚠️ 需改造 |
| 心跳 Ping/Pong | 连接存活检测 | 30s 间隔，60s 超时 | ✅ 直接可用 |
| Token 认证 | 请求鉴权 | `X-Master-Token` Header | ✅ 直接可用 |

### 2.2 核心改造需求

#### 2.2.1 问题 1：地址发现

**现状**：Master 通过 Docker 容器名（如 `claude-worker-user-xxx`）访问 Worker，依赖 Docker 内部 DNS 解析。

**改造方案 A：Worker 主动注册模式（推荐）**

```
┌──────────┐                    ┌──────────┐
│  Master   │ ◄── 注册请求 ──── │  Worker   │
│  (3000)   │                    │ (任意设备) │
│           │ ─── 确认+配置 ──► │           │
│           │ ◄──── 心跳 ────── │           │
└──────────┘                    └──────────┘
```

Worker 启动时主动向 Master 发送注册请求：

```typescript
POST https://master-host:3000/internal/worker/register
{
  "workerId": "device-xxx",
  "endpoint": "https://worker-host:4000",
  "capabilities": { 
    "pty": true, 
    "platform": "linux",
    "arch": "x64",
    "maxMemoryMB": 256,
    "maxProcesses": 50
  },
  "token": "shared-secret"
}
```

**改造方案 B：配置文件/服务发现模式**

Master 配置文件中声明所有远程 Worker 地址：

```yaml
REMOTE_WORKERS:
  - id: "edge-1"
    url: "https://192.168.1.100:4000"
    token: "xxx"
  - id: "cloud-1"
    url: "https://cloud.example.com:4000"
    token: "xxx"
```

**推荐方案 A**，原因：
- Worker 可能在 NAT 后面，需要主动出站连接
- 支持动态上下线，无需重启 Master
- 与当前热池机制概念一致

#### 2.2.2 问题 2：NAT 穿透

**场景**：家用 PC / 边缘设备通常在 NAT 后面，Master 无法直接访问 Worker。

| 方案 | 原理 | 复杂度 | 可靠性 |
|------|------|--------|--------|
| Worker 主动 WebSocket 长连接 | Worker 出站连接 Master，复用连接双向通信 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 反向代理（frp/ngrok） | 第三方穿透工具 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| TURN/STUN | WebRTC 标准穿透 | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| VPN 组网 | Tailscale/WireGuard | ⭐⭐ | ⭐⭐⭐⭐⭐ |

**推荐**：**Worker 主动 WebSocket 长连接** + **Tailscale 备选**

当前 [WorkerForwarder](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/websocket/workerForwarder.ts) 已实现 Master→Worker 的 WebSocket 连接，只需**反转连接方向**：由 Worker 主动连接 Master 的 WebSocket 端点，Master 通过该连接下发指令。

#### 2.2.3 问题 3：通信加密

**现状**：Docker 内部网络通信未加密（HTTP/WS 明文）。

**远程部署需求**：公网传输必须加密。

**解决方案**：
- Worker 端启用 HTTPS（Bun 原生支持 TLS）
- WebSocket 升级为 WSS
- 或通过 Tailscale/WireGuard 组网，应用层无需改动

#### 2.2.4 问题 4：连接可靠性

**现状**：Docker 内部网络几乎零丢包。

**远程部署挑战**：
- 网络抖动、延迟增大
- 连接断开重连

**改造点**：
- WorkerForwarder 增加自动重连逻辑（指数退避）
- PTY 会话断线恢复（当前 `WorkerPTYManager` 断线即销毁，需增加持久化）
- 请求超时时间需根据网络延迟调整（当前 `DEFAULT_TIMEOUTS.EXEC = 30000ms`）

### 2.3 通信改造总结

| 改造项 | 优先级 | 工作量 | 风险 |
|--------|--------|--------|------|
| Worker 主动注册 API | P0 | 中 | 低 |
| WebSocket 连接方向反转 | P0 | 大 | 中 |
| 通信加密（TLS） | P0 | 小 | 低 |
| 自动重连机制 | P1 | 中 | 低 |
| PTY 断线恢复 | P2 | 大 | 高 |
| NAT 穿透方案集成 | P1 | 中 | 中 |

---

## 三、操作兼容性分析

### 3.1 运行时依赖

| 依赖项 | 当前要求 | 远程设备可用性 | 替代方案 |
|--------|---------|--------------|---------|
| **Bun 运行时** | `oven/bun:1` | ✅ Linux/macOS/Windows 均支持 | Node.js 也可（需适配） |
| **node-pty** | 原生模块，需编译 | ⚠️ 需编译工具链 | 可降级为禁用 PTY |
| **child_process** | Node.js 内置 | ✅ 全平台 | - |
| **fs/promises** | Node.js 内置 | ✅ 全平台 | - |

### 3.2 Docker 依赖分析

**核心问题**：当前 Worker 的生命周期完全由 Docker 管理。

| Docker 依赖 | 用途 | 远程设备替代方案 |
|-------------|------|----------------|
| `docker run` | 创建 Worker 容器 | Worker 直接在设备上启动 |
| `docker stop/rm` | 销毁容器 | 进程信号（SIGTERM/SIGINT） |
| `docker inspect` | 健康检查 | HTTP 健康检查端点（已有 `/internal/health`） |
| `docker exec` | 容器内执行命令 | 不需要（Worker 本身就在设备上） |
| Docker 网络 | 网络隔离 | VPN/TLS + 防火墙规则 |
| Bind Mount | 文件持久化 | 直接使用本地文件系统 |
| `--cap-drop=ALL` | 安全加固 | 操作系统级权限控制 |
| `--pids-limit` | 进程限制 | cgroups（Linux）/ Job Objects（Windows） |
| `--read-only` | 文件系统保护 | 操作系统级权限控制 |

**结论**：Docker 不是 Worker 运行的必要条件，而是**安全隔离**和**生命周期管理**的便利工具。远程设备上 Worker 可以直接作为进程运行（当前开发模式 `bun run start:worker` 已经如此）。

### 3.3 PTY 跨平台兼容性

| 平台 | Shell | node-pty 可用性 | 已知问题 |
|------|-------|----------------|---------|
| Linux (x86_64) | `/bin/bash` | ✅ 完全支持 | 需编译工具链 |
| Linux (ARM) | `/bin/bash` | ✅ 需交叉编译 | 树莓派等需预编译 binary |
| macOS | `/bin/bash` | ✅ 完全支持 | 需 Xcode CLI Tools |
| Windows | `cmd.exe` | ⚠️ 需 VS Build Tools | 编译可能失败 |
| Alpine Linux | `/bin/sh` | ⚠️ musl libc 兼容 | 需额外配置 |

**降级方案**：当 node-pty 不可用时，设置 `PTY_ENABLED=false`，Worker 仍可提供命令执行（`exec`）和文件操作功能，仅失去交互式终端能力。

### 3.4 文件系统操作兼容性

当前 [WorkerSandbox](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/sandbox/index.ts) 的文件操作已具备良好的跨平台能力：

| 操作 | 实现方式 | 跨平台 | 远程适配 |
|------|---------|--------|---------|
| 读取文件 | `fs/promises.readFile` | ✅ | 无需改动 |
| 写入文件 | `fs/promises.writeFile` | ✅ | 无需改动 |
| 列目录 | `fs/promises.readdir` | ✅ | 无需改动 |
| 删除文件 | `fs/promises.unlink` | ✅ | 无需改动 |
| 命令执行 | `child_process.exec` | ✅ | Shell 差异需处理 |
| 工作目录 | `process.platform` 自动切换 | ✅ | 无需改动 |

**已知跨平台问题**（来自 [containerOrchestrator.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/orchestrator/containerOrchestrator.ts)）：

| 功能 | Linux 命令 | Windows 替代 | 影响 |
|------|-----------|-------------|------|
| 磁盘空间检查 | `df -h` | ❌ 无直接替代 | 低（远程设备可自行报告） |
| 目录大小计算 | `du -sb` | ❌ 无直接替代 | 中（配额管理受影响） |
| 端口检测 | `ss -tln` | `netstat -ano` | 低（已有分支处理） |
| 目录权限 | `chmod 755` | `icacls` | 低（已有分支处理） |

### 3.5 操作兼容性评级

```
兼容性评级：
┌─────────────────────────────────────────────────────────┐
│  Linux 服务器    ████████████████████  95%  ✅ 高度兼容   │
│  macOS 设备     ███████████████████░  90%  ✅ 高度兼容   │
│  Windows PC     ████████████████░░░░  80%  ⚠️ 需适配    │
│  ARM 边缘设备   ███████████████░░░░░  75%  ⚠️ 需适配    │
│  Alpine 容器    ██████████████░░░░░░  70%  ⚠️ 需适配    │
│  限制环境 (无 PTY) ████████████░░░░░░░  60%  ⚠️ 功能降级   │
└─────────────────────────────────────────────────────────┘
```

---

## 四、权限可控性分析

### 4.1 当前权限控制体系

```
┌───────────────────────────────────────────────────────────────┐
│                     当前权限控制（Docker 依赖）                  │
│                                                                │
│  Layer 1: 网络隔离 ─── Docker 自定义网络 (worker-network)       │
│  Layer 2: 文件隔离 ─── Bind Mount + isPathSafe()               │
│  Layer 3: 进程隔离 ─── --pids-limit + --cap-drop=ALL           │
│  Layer 4: 通信认证 ─── X-Master-Token                          │
│  Layer 5: 命令过滤 ─── isCommandSafe() + PathSandbox            │
│  Layer 6: 资源配额 ─── Docker cgroups (--memory, --cpus)       │
│  Layer 7: 用户隔离 ─── 一用户一容器 + 独立工作空间              │
└───────────────────────────────────────────────────────────────┘
```

### 4.2 远程部署下的权限控制挑战

#### 挑战 1：网络隔离失效

**现状**：Docker `worker-network` 确保 Worker 无法访问 MySQL。

**远程部署风险**：Worker 在独立设备上，可自由访问网络。

**解决方案**：

| 方案 | 安全等级 | 实现复杂度 |
|------|---------|-----------|
| VPN 组网 + 防火墙规则 | ⭐⭐⭐⭐ | 中 |
| Mutual TLS（双向证书认证） | ⭐⭐⭐⭐⭐ | 高 |
| Worker 出站白名单（iptables） | ⭐⭐⭐⭐ | 中 |
| 数据库连接串不注入 Worker 环境 | ⭐⭐⭐ | 低（已实现） |

**关键**：当前架构已确保 Worker 环境中**不包含数据库连接信息**（`DATABASE_URL` 仅在 Master 环境中），这是最基础也最重要的防线。远程部署后这一原则必须保持。

#### 挑战 2：文件系统隔离弱化

**现状**：Docker `--read-only` + Bind Mount 限制 Worker 只能写 `/workspace`。

**远程部署风险**：Worker 进程直接在宿主机运行，可访问整个文件系统。

**解决方案**：

| 方案 | 适用平台 | 安全等级 |
|------|---------|---------|
| 操作系统用户隔离（专用低权限用户） | 全平台 | ⭐⭐⭐ |
| chroot 隔离 | Linux | ⭐⭐⭐⭐ |
| cgroups v2 资源限制 | Linux | ⭐⭐⭐⭐ |
| SELinux/AppArmor 策略 | Linux | ⭐⭐⭐⭐⭐ |
| Windows Job Objects + 低完整性级别 | Windows | ⭐⭐⭐ |
| 代码层 `isPathSafe()` 强制（已实现） | 全平台 | ⭐⭐⭐ |

**推荐组合**：`专用低权限用户` + `isPathSafe()` + `isCommandSafe()` + `cgroups/Job Objects`

#### 挑战 3：资源配额控制

**现状**：Docker cgroups 限制 CPU/内存/进程数。

**远程部署风险**：Worker 可能消耗设备全部资源。

**解决方案**：

```typescript
// Worker 端自限制方案（不依赖 Docker）
const RESOURCE_LIMITS = {
  WORKER: {
    MAX_MEMORY_MB: 256,      // Bun 进程内存限制
    MAX_THREADS: 2,          // 线程限制
    MAX_OPEN_FILES: 100,     // 文件描述符限制
    MAX_PROCESSES: 50,       // 子进程限制
  },
}
```

| 资源 | Docker 方式 | 远程替代方案 |
|------|-----------|-------------|
| 内存限制 | `--memory=256m` | `process.resourceLimits?.maxOldGenerationSizeMb`（Bun） |
| CPU 限制 | `--cpus=1` | cgroups（Linux）/ Job Objects（Windows） |
| 进程数限制 | `--pids-limit=100` | `WorkerPTYManager` 会话数限制（已有） |
| 文件描述符 | `--ulimit nofile=1024` | `ulimit`（Linux）/ 注册表（Windows） |
| 磁盘配额 | Bind Mount 大小 | `USER_STORAGE_QUOTA_MB` 环境变量（已有） |

#### 挑战 4：Token 安全性

**现状**：`MASTER_INTERNAL_TOKEN` 为静态字符串，Docker 内网传输。

**远程部署风险**：Token 在公网传输可能被截获。

**解决方案**：

| 方案 | 安全等级 | 改动量 |
|------|---------|--------|
| Mutual TLS（mTLS） | ⭐⭐⭐⭐⭐ | 大 |
| JWT 短期 Token + 刷新 | ⭐⭐⭐⭐ | 中 |
| HMAC 签名请求 | ⭐⭐⭐ | 小 |
| 当前静态 Token + TLS | ⭐⭐⭐ | 小 |

**推荐**：短期 JWT Token + TLS 加密传输

#### 挑战 5：多租户隔离

**现状**：一用户一容器，物理隔离。

**远程部署场景**：一个设备可能服务多个用户（资源受限设备）。

**解决方案**：

| 方案 | 隔离强度 | 复杂度 |
|------|---------|--------|
| 一设备一用户（推荐） | ⭐⭐⭐⭐⭐ | 低 |
| 一设备多用户 + 代码层隔离 | ⭐⭐⭐ | 高 |
| 一设备多用户 + 进程级隔离 | ⭐⭐⭐⭐ | 中 |

**推荐**：远程设备采用**一设备一用户**模式，避免多租户复杂性。

### 4.3 权限可控性评级

```
┌─────────────────────────────────────────────────────────┐
│  当前 Docker 模式    ████████████████████  95%  ✅ 强     │
│  VPN + 低权限用户    ████████████████░░░░  80%  ⚠️ 中强   │
│  TLS + 代码层隔离    ██████████████░░░░░░  70%  ⚠️ 中     │
│  仅代码层隔离        ████████████░░░░░░░░  60%  ⚠️ 弱     │
│  无额外隔离措施      ████████░░░░░░░░░░░░  40%  ❌ 不可接受 │
└─────────────────────────────────────────────────────────┘
```

---

## 五、架构改造方案

### 5.1 推荐架构：混合模式

```
┌─────────────────────────────────────────────────────────────────┐
│                        混合部署架构                               │
│                                                                  │
│  ┌──────────┐                                                    │
│  │  Master   │                                                   │
│  │  (3000)   │                                                   │
│  │           │                                                   │
│  │  ┌──────────────────────┐                                     │
│  │  │ WorkerRegistry       │  ← 新增：远程 Worker 注册中心       │
│  │  │ ├─ register()        │                                     │
│  │  │ ├─ heartbeat()       │                                     │
│  │  │ ├─ getWorker(userId) │                                     │
│  │  │ └─ deregister()      │                                     │
│  │  └──────────────────────┘                                     │
│  │           │                                                    │
│  │  ┌──────────────────────┐                                     │
│  │  │ Scheduler (改造)     │                                     │
│  │  │ ├─ 本地 Docker Worker │  ← 保持现有                        │
│  │  │ └─ 远程 Worker       │  ← 新增                            │
│  │  └──────────────────────┘                                     │
│  └─────┬─────────┬─────────┬────────────────┘                    │
│        │         │         │                                     │
│   ┌────▼───┐ ┌───▼────┐ ┌─▼──────────────┐                     │
│   │Docker  │ │Docker  │ │ 远程 Worker     │                     │
│   │Worker 1│ │Worker 2│ │ (任意设备)       │                     │
│   │(本地)  │ │(本地)  │ │                  │                     │
│   └────────┘ └────────┘ │ ├─ 主动 WS 连接   │                     │
│                           │ ├─ 心跳上报      │                     │
│                           │ └─ 能力声明      │                     │
│                           └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 改造步骤

**Phase 1：通信层改造（P0）**

1. 新增 `WorkerRegistry` 模块，提供远程 Worker 注册/发现 API
2. 改造 `WorkerForwarder`，支持反向 WebSocket（Worker 主动连接）
3. Worker 启动时增加注册流程
4. 通信加密（TLS/WSS）

**Phase 2：调度层改造（P1）**

5. 改造 `ContainerOrchestrator`，支持混合调度（本地 Docker + 远程 Worker）
6. 新增 `RemoteWorkerProvider`，实现与 `ContainerOrchestrator` 相同的接口
7. 调度策略增加设备能力感知（CPU/内存/平台）

**Phase 3：安全加固（P1）**

8. Token 升级为 JWT 短期 Token
9. Worker 端自限制资源（不依赖 Docker cgroups）
10. 远程 Worker 安全基线检查

**Phase 4：可靠性增强（P2）**

11. WebSocket 自动重连
12. PTY 断线恢复
13. 离线任务队列

### 5.3 关键接口设计

```typescript
// 新增：远程 Worker 注册请求
interface WorkerRegistrationRequest {
  workerId: string
  endpoint: string
  capabilities: WorkerCapabilities
  token: string
}

interface WorkerCapabilities {
  platform: 'linux' | 'darwin' | 'win32'
  arch: 'x64' | 'arm64' | 'arm'
  pty: boolean
  maxMemoryMB: number
  maxProcesses: number
  maxSessions: number
  version: string
}

// 改造：统一 Worker 提供者接口
interface WorkerProvider {
  assign(userId: string, options: AssignOptions): Promise<WorkerInstance>
  release(userId: string): Promise<void>
  healthCheck(workerId: string): Promise<boolean>
  getWorkerEndpoint(userId: string): Promise<string>
}

// Docker Worker 提供者（现有逻辑）
class DockerWorkerProvider implements WorkerProvider { ... }

// 远程 Worker 提供者（新增）
class RemoteWorkerProvider implements WorkerProvider { ... }
```

---

## 六、风险评估

### 6.1 高风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Worker 被攻破后访问内网 | 数据泄露 | 中 | VPN 隔离 + 出站白名单 |
| Token 泄露 | 伪造请求 | 中 | JWT 短期 Token + TLS |
| 恶意 Worker 注册 | 资源滥用 | 低 | 注册预共享密钥 + 设备指纹 |
| PTY 注入攻击 | 远程代码执行 | 中 | isCommandSafe() + 命令白名单 |

### 6.2 中风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 网络不稳定导致 PTY 断开 | 用户体验差 | 高 | 自动重连 + 会话恢复 |
| 远程设备资源耗尽 | 服务不可用 | 中 | 资源自限制 + 心跳监控 |
| 跨平台命令差异 | 执行结果不一致 | 中 | 命令适配层 + 平台检测 |

### 6.3 低风险项

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Bun 版本不一致 | 兼容性问题 | 低 | 版本锁定 + 启动检查 |
| 时区差异 | 日志时间错乱 | 低 | 统一 TZ 环境变量 |

---

## 七、结论与建议

### 7.1 总体可行性评级

| 维度 | 评级 | 说明 |
|------|------|------|
| **通信可行性** | ⭐⭐⭐⭐ (80%) | 核心协议（HTTP+WS+Token）已具备，需改造连接方向和加密 |
| **操作兼容性** | ⭐⭐⭐⭐ (85%) | Worker 代码已有跨平台适配，Linux/macOS 几乎可直接运行 |
| **权限可控性** | ⭐⭐⭐ (65%) | Docker 提供的强隔离需用 OS 级方案替代，安全等级下降 |

### 7.2 核心建议

1. **分阶段实施**：先支持远程 Linux 服务器（兼容性最高），再扩展到其他平台
2. **Worker 主动连接模式**：反转 WebSocket 方向，解决 NAT 穿透问题
3. **安全基线**：远程 Worker 必须满足最低安全要求（TLS + 低权限用户 + 防火墙）
4. **混合调度**：保留本地 Docker Worker 用于高安全场景，远程 Worker 用于弹性扩展
5. **能力声明**：Worker 注册时声明自身能力（平台、PTY 支持等），Master 据此调度
6. **降级运行**：当 node-pty 不可用时，Worker 应能以无 PTY 模式运行

### 7.3 不建议的场景

- **不受信任的设备**：无法保证安全隔离的设备不应接入
- **多用户共享设备**：远程设备建议一设备一用户，避免租户隔离问题
- **高延迟网络**：PTY 交互体验严重依赖低延迟（>200ms 不可接受）

---

## 八、附录

### 8.1 关键文件索引

| 功能 | 文件路径 |
|------|---------|
| Worker 通信类型定义 | [server/src/shared/types/worker.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/types/worker.ts) |
| 共享常量 | [server/src/shared/constants/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/constants/index.ts) |
| 共享工具函数 | [server/src/shared/utils/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/utils/index.ts) |
| WorkerForwarder | [server/src/master/websocket/workerForwarder.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/websocket/workerForwarder.ts) |
| wsPTYBridge | [server/src/master/integration/wsPTYBridge.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/integration/wsPTYBridge.ts) |
| Worker HTTP 服务 | [server/src/worker/server/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/server/index.ts) |
| Worker PTY 管理 | [server/src/worker/terminal/ptyManager.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/terminal/ptyManager.ts) |
| Worker 沙箱 | [server/src/worker/sandbox/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/sandbox/index.ts) |
| 容器编排器 | [server/src/master/orchestrator/containerOrchestrator.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/orchestrator/containerOrchestrator.ts) |
| 认证中间件 | [server/src/master/utils/auth.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/utils/auth.ts) |
| 租户隔离中间件 | [server/src/master/middleware/tenantIsolation.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/middleware/tenantIsolation.ts) |
| Docker 网络隔离 | [docker-compose.yml](file:///d:/Users/Administrator/AistudyProject/claw-web/docker-compose.yml) |

### 8.2 术语表

| 术语 | 说明 |
|------|------|
| Master | 控制层（端口 3000），负责鉴权、网关、会话管理、容器调度 |
| Worker | 执行层（端口 4000），负责命令执行、PTY 终端、文件操作 |
| PTY | 伪终端（Pseudo Terminal），交互式命令行终端 |
| Bind Mount | Docker 卷挂载方式，将宿主机目录映射到容器内 |
| cgroups | Linux 控制组，用于限制进程资源使用 |
| NAT | 网络地址转换，使内网设备可以访问外网 |
| mTLS | 双向 TLS 认证，客户端和服务器互相验证证书 |
| SELinux | Security-Enhanced Linux，强制访问控制安全模块 |

### 8.3 参考资料

- [Master-Worker 架构分离迁移计划](./master-worker_架构分离迁移计划_5822e26c.plan.md)
- [Master-Worker 架构报告](./master-worker-architecture-report.md)
- [Docker 部署指南](./DOCKER-DEPLOYMENT-GUIDE.md)
- [架构合规性报告](./ARCHITECTURE-COMPLIANCE-REPORT.md)

---

**文档结束**
