# Claw-Web 后端 Master-Worker 架构拆分详细报告

## 📋 报告概述

**项目名称**: Claw-Web (Claude Code HAHA - Deep React Integration Server)
**分析日期**: 2026-04-16
**架构模式**: Master-Worker 分布式容器化架构
**技术栈**: TypeScript + Bun Runtime + Docker 容器化

---

## 一、架构总览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React/Vue)                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/WebSocket (Port 3000)
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MASTER 服务 (控制层)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ HTTP服务 │ │ WebSocket│ │ 路由层   │ │ 容器编排器       │   │
│  │ (3000)   │ │ 服务     │ │ (23个)   │ │ (ContainerOrch.) │   │
│  └──────────┘ └────┬─────┘ └──────────┘ └────────┬─────────┘   │
│                    │                              │              │
│                    ▼                              ▼              │
│           ┌────────────────┐            ┌──────────────┐        │
│           │ WorkerForwarder│            │ UserMapper   │        │
│           │ (连接管理)     │            │ (用户映射)   │        │
│           └────────────────┘            └──────────────┘        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Internal API / WebSocket
                           │ (X-Master-Token 认证)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WORKER 服务 (执行层) × N                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │Internal  │ │ Sandbox  │ │ PTY      │ │ 文件系统操作     │   │
│  │API(4000) │ │ (命令执行)│ │ Manager  │ │ (读写/列表)     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计理念

| 设计原则 | 说明 |
|---------|------|
| **职责分离** | Master 负责管理和调度，Worker 负责执行和隔离 |
| **安全隔离** | Worker 不直接访问数据库，通过 Master Token 验证通信 |
| **弹性伸缩** | 支持热容器池，可动态扩缩容 Worker 数量 |
| **多租户支持** | 每个用户分配独立 Worker 容器，实现资源隔离 |

---

## 二、目录结构详解

### 2.1 后端代码组织

```
server/src/
├── index.ts                  # 普通模式入口（单机版）
├── index.master.ts          # Master 模式入口
├── index.worker.ts          # Worker 模式入口
│
├── master/                  # 【Master 专属模块】
│   ├── index.ts             # Master 启动入口
│   ├── httpServer.ts        # Master HTTP 服务器（推测）
│   ├── services/            # Master 业务服务
│   └── websocket/
│       ├── index.ts         # WebSocket 服务
│       └── workerForwarder.ts # Worker 连接转发器 ⭐核心
│
├── worker/                  # 【Worker 专属模块】
│   ├── index.ts             # Worker 启动入口
│   ├── server/
│   │   └── index.ts         # Worker Internal API ⭐核心
│   ├── sandbox/
│   │   └── index.ts         # 沙箱命令执行引擎 ⭐核心
│   └── terminal/
│       ├── index.ts         # 终端管理
│       └── ptyManager.ts    # PTY 会话管理器 ⭐核心
│
├── shared/                  # 【共享模块】⭐关键
│   ├── index.ts             # 统一导出
│   ├── constants/
│   │   └── index.ts         # 共享常量定义
│   ├── types/
│   │   └── index.ts         # 共享类型定义
│   └── utils/
│       └── index.ts         # 共享工具函数
│
├── orchestrator/            # 【Master 专属】容器编排器
│   └── containerOrchestrator.ts # 核心编排逻辑 ⭐核心
│
├── routes/                  # 【Master 专属】API 路由层 (23个路由模块)
│   ├── index.ts
│   ├── auth.routes.ts       # 认证路由
│   ├── sessions.routes.ts   # 会话路由
│   ├── agents.routes.ts     # Agent 路由
│   ├── tools.routes.ts      # 工具路由
│   ├── mcp.routes.ts        # MCP 路由
│   ├── monitoring.routes.ts # 监控路由
│   └── ... (共23个路由文件)
│
├── db/                      # 【Master 专属】数据库层
│   ├── mysql.ts             # MySQL 连接
│   └── schema.sql           # 数据库 Schema
│
├── agents/                  # Agent 系统
├── models/                  # 数据模型
├── prompts/                 # 提示词管理
├── skills/                  # 技能系统
├── security/                # 安全模块
├── types/                   # 类型定义
└── utils/                   # 工具函数
```

---

## 三、Master 服务深度解析

### 3.1 核心职责

#### ✅ Master 负责：

| 功能域 | 具体职责 | 对应模块 |
|-------|---------|---------|
| **用户认证与授权** | JWT 验证、用户身份识别、权限校验 | `auth.routes.ts`, `security/` |
| **API 网关** | 接收前端请求、路由分发、负载均衡 | `httpServer.ts`, `routes/` (23个) |
| **会话管理** | 创建/销毁会话、消息持久化、历史记录 | `sessions.routes.ts`, `db/mysql.ts` |
| **容器编排** | Worker 生命周期管理、热池维护、资源调度 | `orchestrator/containerOrchestrator.ts` |
| **WebSocket 管理** | 前端连接、消息转发到 Worker | `websocket/workerForwarder.ts` |
| **数据库操作** | 所有 CRUD 操作、事务管理、数据持久化 | `db/mysql.ts` |
| **监控与诊断** | 系统状态监控、日志收集、健康检查 | `monitoring.routes.ts`, `diagnostics.routes.ts` |
| **用户映射** | 用户→容器映射关系管理 | `orchestrator/userContainerMapper.ts` |

#### ❌ Master 不负责：
- ❌ 不执行任何用户命令
- ❌ 不直接操作文件系统（除配置文件）
- ❌ 不创建 PTY 终端进程
- ❌ 不运行 Agent 逻辑（仅调度）

### 3.2 关键组件：容器编排器 (ContainerOrchestrator)

**位置**: [containerOrchestrator.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/orchestrator/containerOrchestrator.ts)

```typescript
// 核心配置参数
interface PoolConfig {
  minPoolSize: number;        // 最小热容器数 (默认: 3)
  maxPoolSize: number;        // 最大热容器数 (默认: 10)
  idleTimeoutMs: number;      // 空闲超时 (默认: 5分钟)
  healthCheckIntervalMs: number; // 健康检查间隔 (默认: 15秒)
  imageName: string;          // Docker 镜像名
  networkName: string;        // Docker 网络 (worker-network, 与 MySQL 隔离!)
  basePort: number;           // 起始端口 (默认: 3100)
}
```

**核心能力**:

1. **热池管理**
   - 预启动空闲 Worker 容器
   - 快速分配给新用户（秒级响应）
   - 自动回收超时未使用的容器

2. **用户隔离**
   - 每个用户绑定独立 Worker 容器
   - 容器间完全隔离（网络、文件系统、进程）
   - 支持 Free/Pro/Enterprise 三级用户配额

3. **资源监控**
   - 内存/CPU 使用率跟踪
   - 磁盘空间告警（80%警告/90%严重）
   - Docker 自动清理机制

4. **故障恢复**
   - 健康检查失败自动重启
   - 容器异常退出自动替换
   - 优雅关闭时保留活跃用户容器

### 3.3 关键组件：Worker 转发器 (WorkerForwarder)

**位置**: [workerForwarder.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/websocket/workerForwarder.ts)

**功能**: Master 与 Worker 之间的桥梁

```typescript
class WorkerForwarder {
  // 连接管理
  private connections: Map<string, WorkerConnection>  // userId:containerId -> connection
  private userConnections: Map<string, string>        // userId -> connectionKey

  // 核心方法
  async connectToWorker(userId, containerId, hostPort)  // 建立 WS 连接
  async createPTY(userId, containerId, options)         // 创建终端会话
  async execOnWorker(userId, containerId, command)      // 远程执行命令
  writeToPTY(userId, sessionId, data)                   // 写入终端输入
  resizePTY(userId, sessionId, cols, rows)              // 调整终端大小
  destroyPTY(userId, sessionId)                         // 销毁终端
}
```

**工作流程**:
1. 前端发送请求 → Master 接收
2. Master 通过 `userContainerMapper` 找到用户的 Worker 容器
3. Master 通过 `WorkerForwarder` 建立 WebSocket 连接
4. Master 转发请求到 Worker 的 Internal API
5. Worker 执行完成后返回结果
6. Master 将结果返回给前端

---

## 四、Worker 服务深度解析

### 4.1 核心职责

#### ✅ Worker 负责：

| 功能域 | 具体职责 | 对应模块 |
|-------|---------|---------|
| **命令执行** | 安全沙箱环境执行 Shell 命令 | `sandbox/index.ts` |
| **终端管理** | 创建/管理 PTY 伪终端会话 | `terminal/ptyManager.ts` |
| **文件系统操作** | 受限的文件读写、目录列出 | `sandbox/index.ts` |
| **Agent 运行** | 执行 AI Agent 逻辑和工具调用 | (通过 sandbox) |
| **流式输出** | 实时输出命令结果和终端数据 | `server/index.ts` |

#### ❌ Worker 不负责：
- ❌ 不处理用户认证（依赖 X-Master-Token）
- ❌ 不访问数据库（无 MySQL 连接）
- ❌ 不管理会话状态
- ❌ 不暴露公共 API（仅内部接口）

### 4.2 关键组件：沙箱执行引擎 (WorkerSandbox)

**位置**: [sandbox/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/sandbox/index.ts)

**安全特性**:

```typescript
class WorkerSandbox {
  private workspaceDir: string = '/workspace'  // 工作目录限制
  
  // 路径安全检查 - 防止路径遍历攻击
  async exec(command, options) {
    if (!isPathSafe(cwd, this.workspaceDir)) {
      return { error: 'INVALID_CWD' }  // ❌ 拒绝访问工作目录外路径
    }
    // 执行命令...
  }
  
  // 所有文件操作都有路径验证
  async readFile(path) {
    if (!isPathSafe(path, this.workspaceDir)) {
      return { error: 'INVALID_PATH' }  // ❌ 拒绝非法路径
    }
  }
}
```

**执行能力**:
- ✅ 命令执行 (`exec`) - 支持超时控制 (默认30s)
- ✅ 文件读取 (`readFile`)
- ✅ 文件写入 (`writeFile`)
- ✅ 目录列出 (`listDir`)
- ✅ 文件删除 (`deleteFile`)
- ✅ 环境变量注入 (`HOME=/workspace`)

**限制措施**:
- 工作目录限制在 `/workspace`
- 超时保护防止长时间运行
- 输出缓冲区限制 (1MB)
- 路径规范化防 `..` 遍历

### 4.3 关键组件：PTY 管理器 (WorkerPTYManager)

**位置**: [ptyManager.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/terminal/ptyManager.ts)

**功能**: 管理交互式终端会话

```typescript
class WorkerPTYManager {
  private sessions: Map<string, PTYSession> = new Map()
  
  create(userId, options): PTYSession {
    // 使用 node-pty 创建伪终端
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols, rows, cwd,
      env: { HOME: cwd, USER: userId }  // 注入用户上下文
    })
    
    // 自动清理：进程退出时删除 session
    ptyProcess.onExit(() => this.sessions.delete(sessionId))
    
    return session
  }
  
  // 其他方法: write, resize, destroy, listByUser, getStats
}
```

**特性**:
- 支持 Windows (`cmd.exe`) 和 Linux (`/bin/bash`)
- 每个用户可创建多个 PTY 会话
- 自动追踪会话统计信息
- 进程退出自动清理

### 4.4 Internal API 接口设计

**位置**: [server/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/server/index.ts)

**认证机制**:
```typescript
// 每个 Internal API 请求必须携带:
// 1. X-Master-Token: 内部通信密钥
// 2. X-User-Id: 用户标识

const token = req.headers.get('X-Master-Token')
if (!validateMasterToken(token)) {
  return Response.json({ error: 'Unauthorized' }, { status: 403 })
}

const userId = req.headers.get('X-User-Id')
if (!userId) {
  return Response.json({ error: 'User ID required' }, { status: 400 })
}
```

**暴露的 API 端点**:

| 方法 | 路径 | 功能 |
|-----|------|------|
| GET | `/internal/health` | 健康检查（无需认证）|
| POST | `/internal/exec` | 执行命令 |
| POST | `/internal/pty/create` | 创建 PTY 会话 |
| POST | `/internal/pty/write` | 写入 PTY 输入 |
| POST | `/internal/pty/resize` | 调整 PTY 大小 |
| POST | `/internal/pty/destroy` | 销毁 PTY 会话 |
| POST | `/internal/file/read` | 读取文件 |
| POST | `/internal/file/write` | 写入文件 |
| POST | `/internal/file/list` | 列出目录 |

---

## 五、通信机制详解

### 5.1 Master → Worker 通信

#### 方式一：HTTP Internal API（同步）

```
Master (HTTP Client) ──POST──▶ Worker :4000/internal/exec
                      ◀──JSON── Worker (Response)
```

**使用场景**:
- 命令执行（exec）
- 文件操作（read/write/list）
- PTY 创建/销毁

**请求格式**:
```json
{
  "type": "exec",
  "requestId": "1776337903-abc123def",
  "userId": "user-uuid",
  "payload": {
    "command": "ls -la",
    "cwd": "/workspace",
    "timeout": 30000
  }
}
```

**响应格式**:
```json
{
  "requestId": "1776337903-abc123def",
  "success": true,
  "data": {
    "stdout": "...",
    "stderr": "",
    "exitCode": 0,
    "duration": 150
  }
}
```

#### 方式二：WebSocket（异步/流式）

```
Frontend ──WS──▶ Master :3000/ws
               │
               ▼
         WorkerForwarder
               │
               └──WS──▶ Worker :4000/internal/pty
                        │
                        ▼
                   PTY Process
```

**使用场景**:
- 终端实时交互（PTY I/O）
- 流式输出（长命令执行）
- 实时数据推送

**消息格式**:
```json
// Master -> Worker: 创建 PTY
{ "type": "create", "requestId": "...", "cols": 120, "rows": 30 }

// Worker -> Master: PTY 已创建
{ "type": "created", "requestId": "...", "sessionId": "pty-xxx" }

// Frontend -> Master -> Worker: 输入数据
{ "type": "input", "sessionId": "pty-xxx", "data": "ls\n" }

// Worker -> Master -> Frontend: 输出数据
{ "type": "output", "sessionId": "pty-xxx", "data": "total 42..." }
```

### 5.2 安全机制

| 层级 | 机制 | 说明 |
|-----|------|------|
| **网络隔离** | Docker Network | Worker 在 worker-network，MySQL 在 claude-network |
| **认证鉴权** | X-Master-Token | Internal API 必须携带内部 Token |
| **用户标识** | X-User-Id | 每次请求携带用户 ID 用于审计和隔离 |
| **路径沙盒** | isPathSafe() | 文件操作限制在工作目录内 |
| **命令黑名单** | (待实现) | 危险命令过滤 |
| **超时保护** | Timeout 控制 | 命令执行有默认超时时间 |
| **资源限制** | Docker Cgroups | 内存/CPU/进程数限制 |

### 5.3 共享模块 (Shared Module)

**位置**: [shared/](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/index.ts)

**重要性**: ⭐⭐⭐⭐⭐ (保证 Master/Worker 行为一致)

```typescript
// shared/types/index.ts - 类型一致性
export interface InternalAPIRequest {
  type: 'exec' | 'pty_create' | ...  // 请求类型枚举
  requestId: string                   // 请求ID（用于追踪）
  userId: string                      // 用户ID
  payload: unknown                    // 载荷
}

export interface ContainerInfo {
  id: string
  status: 'running' | 'stopped' | ...
  hostPort: number
  userId?: string
}

// shared/constants/index.ts - 配置一致性
export const INTERNAL_API_PATHS = {
  EXEC: '/internal/exec',
  PTY_CREATE: '/internal/pty/create',
  // ...所有内部 API 路径
}

export const DEFAULT_TIMEOUTS = {
  EXEC: 30000,           // 命令执行超时
  PTY_IDLE: 300000,      // PTY 空闲超时 (5分钟)
  WORKER_HEALTH_CHECK: 15000  // 健康检查间隔
}

// shared/utils/index.ts - 工具函数一致性
export function validateMasterToken(token): boolean  // Token 验证
export function getWorkerInternalPort(): number       // 获取端口
export function isPathSafe(path, baseDir): boolean    // 路径安全检查
export function generateRequestId(): string           // 生成唯一请求ID
```

---

## 六、启动流程对比

### 6.1 Master 启动流程

```
index.master.ts
    │
    ├─ 1️⃣ 检查 CONTAINER_ROLE=master
    │
    ├─ 2️⃣ 初始化 ContainerOrchestrator
    │      ├─ 加载 PoolConfig (从环境变量)
    │      ├─ 预启动 minPoolSize 个 Worker 容器
    │      └─ 启动健康检查定时器
    │
    ├─ 3️⃣ 初始化 UserContainerMapper
    │      └─ 从磁盘加载已有用户映射
    │
    ├─ 4️⃣ 启动 HTTP Server (Port 3000)
    │      ├─ 注册 23 个路由模块
    │      ├─ 启动 WebSocket 服务
    │      └─ 初始化 WorkerForwarder
    │
    └─ 5️⃣ 注册优雅关闭处理
         ├─ SIGINT/SIGTERM 信号监听
         ├─ 保存用户映射
         └─ 关闭编排器（保留活跃容器）
```

### 6.2 Worker 启动流程

```
index.worker.ts
    │
    ├─ 1️⃣ 读取 WORKER_INTERNAL_PORT (默认 4000)
    │
    ├─ 2️⃣ 启动 Internal API Server
    │      ├─ 监听 Port 4000
    │      ├─ 注册 /internal/* 路由
    │      ├─ 初始化 WorkerSandbox
    │      └─ 初始化 WorkerPTYManager
    │
    └─ 3️⃣ 注册关闭处理
         ├─ 停止 HTTP Server
         └─ 销毁所有 PTY 会话
```

### 6.3 普通模式启动（对比）

```
index.ts (单机模式)
    │
    ├─ 启动 HTTP Server (Port 3000)
    ├─ 初始化 Skills 系统
    └─ 所有功能在同一进程中运行（无容器化）
```

---

## 七、路由分布分析

### 7.1 Master 独占路由（23个）

| 分类 | 路由文件 | 功能说明 |
|-----|---------|---------|
| **认证** | `auth.routes.ts` | 登录/注册/JWT |
| **会话** | `sessions.routes.ts` | 会话CRUD |
| **Agent** | `agent.routes.ts`, `agents.routes.ts`, `agentApi.ts` | Agent 管理 |
| **工具** | `tools.routes.ts` | 工具注册/查询 |
| **MCP** | `mcp.routes.ts` | MCP 服务器管理 |
| **工作区** | `workspace.routes.ts` | 工作区管理 |
| **用户等级** | `userTier.routes.ts` | Free/Pro/Enterprise |
| **技能** | `skills.routes.ts`, `promptTemplate.routes.ts` | 技能系统 |
| **插件** | `plugin.routes.ts` | 插件管理 |
| **快照** | `snapshot.routes.ts` | 会话快照 |
| **导出** | `export.routes.ts` | 数据导出 |
| **监控** | `monitoring.routes.ts`, `monitoringDashboard.routes.ts` | 系统监控 |
| **诊断** | `diagnostics.routes.ts` | 故障诊断 |
| **部署** | `deployment.routes.ts` | 部署管理 |
| **容器管理** | `containerManagement.routes.ts`, `adminContainer.routes.ts` | 容器运维 |
| **外部访问** | `externalAccess.routes.ts` | 外部接入 |

### 7.2 Worker 无路由（仅 Internal API）

Worker 不对外暴露任何公开路由，所有接口均为内部调用。

---

## 八、数据流完整示例

### 示例1：用户执行命令

```
1. 前端发送 POST /api/tools/exec
   Body: { command: "npm install", cwd: "/workspace/my-app" }

2. Master (auth.middleware) 验证 JWT Token ✓

3. Master (tools.routes.ts) 处理请求
   └─ 从 JWT 提取 userId

4. Master (userContainerMapper) 查找用户对应的 Worker
   └─ 返回 { containerId: "worker-abc", hostPort: 3101 }

5. Master (WorkerForwarder.execOnWorker)
   └─ POST http://localhost:3101/internal/exec
      Headers: { X-Master-Token: "secret", X-User-Id: "user-123" }
      Body: { type: "exec", requestId: "...", payload: {...} }

6. Worker (server/index.ts) 验证 Token ✓

7. Worker (sandbox.exec) 安全执行命令
   ├─ 检查 cwd 在 /workspace 内 ✓
   ├─ 设置超时 30s
   └─ spawn("npm install", { cwd, timeout })

8. Worker 返回执行结果
   { success: true, data: { stdout: "...", exitCode: 0 } }

9. Master 转发结果给前端
```

### 示例2：用户打开终端

```
1. 前端建立 WebSocket ws://master:3000/ws?token=jwt

2. Master 验证 JWT，建立 WS 连接

3. 前端发送 { type: "pty_create", cols: 120, rows: 30 }

4. Master 通过 WorkerForwarder.createPTY
   └─ WS 发送到 Worker:4000/internal/pty
      { type: "create", cols: 120, rows: 30 }

5. Worker (ptyManager.create) 创建 node-pty 进程
   └─ 返回 { sessionId: "pty-xyz" }

6. Master 缓存映射: frontendSessionId -> workerSessionId

7. 前端输入 "ls" 并回车
   └─ Master 转发到 Worker PTY

8. Worker PTY 输出 "total 42 ..."
   └─ Master 实时推送给前端
```

---

## 九、安全架构评估

### 9.1 安全层级

```
┌─────────────────────────────────────────┐
│ Level 1: 网络隔离                        │
│ ├─ Worker 容器在独立的 Docker 网络       │
│ └─ 无法直接访问 MySQL (claude-network)   │
├─────────────────────────────────────────┤
│ Level 2: 认证授权                        │
│ ├─ 公共 API: JWT Token 验证              │
│ └─ Internal API: X-Master-Token 验证     │
├─────────────────────────────────────────┤
│ Level 3: 沙箱隔离                        │
│ ├─ 文件系统: 路径白名单 (/workspace)      │
│ ├─ 命令执行: 超时+缓冲区限制             │
│ └─ 进程管理: Docker Cgroups 限制         │
├─────────────────────────────────────────┤
│ Level 4: 审计追踪                        │
│ ├─ 每个请求带 requestId 可追踪           │
│ └─ 每个操作关联 userId 可审计           │
└─────────────────────────────────────────┘
```

### 9.2 潜在风险点

| 风险项 | 当前状态 | 建议 |
|-------|---------|------|
| 命令注入 | ⚠️ 仅有路径检查 | 建议增加命令黑名单（rm -rf / 等）|
| Token 泄露 | ✅ 仅内网通信 | 定期轮换 MASTER_INTERNAL_TOKEN |
| 容器逃逸 | ⚠️ 依赖 Docker 隔离 | 考虑使用 gVisor/Kata Containers |
| DoS 攻击 | ⚠️ 有超时但无限流 | 建议增加速率限制 |
| 日志审计 | ⚠️ 有 requestId | 建议增加操作日志持久化 |

---

## 十、性能与扩展性

### 10.1 性能指标

| 指标 | 目标值 | 说明 |
|-----|--------|------|
| **冷启动时间** | < 3s | 新用户首次分配容器 |
| **热启动时间** | < 100ms | 从热池获取容器 |
| **命令执行延迟** | < 50ms | Master→Worker 往返 |
| **PTY 延迟** | < 20ms | 终端输入输出延迟 |
| **最大并发用户** | 100+ | 取决于服务器资源 |

### 10.2 扩展策略

**水平扩展**:
```
                    ┌─ Worker 1 (:3100)
Frontend ──▶ LB ──▶├─ Worker 2 (:3101)
  (负载均衡)        ├─ Worker 3 (:3102)
                    └─ Worker N (:310N)
                    
Master 可部署多个实例（无状态层）
Worker 可动态增减（按需扩缩容）
```

**垂直扩展**:
- 增加 `CONTAINER_POOL_MAX_SIZE` (默认 10)
- 升级服务器硬件（内存/CPU）
- 优化 Docker 镜像大小

---

## 十一、配置与环境变量

### 11.1 Master 关键配置

```bash
# 角色设置
CONTAINER_ROLE=master

# 容器池配置
CONTAINER_POOL_MIN_SIZE=3        # 最小热容器数
CONTAINER_POOL_MAX_SIZE=10       # 最大热容器数
CONTAINER_IDLE_TIMEOUT_MS=300000 # 空闲超时 (5分钟)
CONTAINER_BASE_PORT=3100         # 起始端口

# Docker 配置
WORKER_IMAGE_NAME=claw-web-backend-worker:latest
DOCKER_NETWORK_NAME=claw-web_worker-network
HOST_WORKSPACE_PATH=/data/claws/workspaces

# 监控配置
DISK_WARNING_THRESHOLD=80        # 磁盘告警阈值 (%)
DISK_CRITICAL_THRESHOLD=90       # 磁盘严重阈值 (%)
ENABLE_DOCKER_AUTO_CLEANUP=true  # Docker 自动清理
```

### 11.2 Worker 关键配置

```bash
# 角色设置
CONTAINER_ROLE=worker

# Internal API 配置
WORKER_INTERNAL_PORT=4000        # 内部 API 端口
MASTER_INTERNAL_TOKEN=secret-key  # 内部通信密钥

# 工作目录
WORKSPACE_DIR=/workspace         # 沙箱根目录

# AI 配置 (Worker 需要)
ANTHROPIC_AUTH_TOKEN=sk-ant-...  # Anthropic API Key
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

### 11.3 共享常量

```typescript
// 默认端口
DEFAULT_MASTER_PORT = 3000       # Master 公共 API
DEFAULT_WORKER_PORT = 4000       # Worker Internal API

// 超时配置
DEFAULT_TIMEOUTS = {
  EXEC: 30000,                   // 命令执行 30s
  PTY_IDLE: 300000,              # PTY 空闲 5分钟
  WORKER_HEALTH_CHECK: 15000     // 健康检查 15s
}

// 资源限制
RESOURCE_LIMITS = {
  WORKER: {
    MAX_MEMORY_MB: 256,          # 最大内存 256MB
    MAX_THREADS: 2,              # 最大线程数
    MAX_OPEN_FILES: 100,         # 最大文件句柄
    MAX_PROCESSES: 50            // 最大进程数
  }
}
```

---

## 十二、优缺点总结

### ✅ 优点

1. **安全性高**
   - Worker 完全不接触数据库
   - 多层隔离（网络/进程/文件系统）
   - 内部通信 Token 认证

2. **隔离性好**
   - 每用户独立容器
   - 故障不影响其他用户
   - 资源配额可控

3. **弹性伸缩**
   - 热池机制快速响应用户
   - 支持动态扩缩容
   - 可水平扩展 Master/Worker

4. **可维护性强**
   - 职责清晰，易于理解
   - 共享模块保证一致性
   - 独立部署，故障定位容易

5. **多租户支持**
   - 用户级别隔离
   - 三级会员体系 (Free/Pro/Enterprise)
   - 灵活的配额管理

### ⚠️ 待改进点

1. **复杂度增加**
   - 需要维护两套服务
   - 调试跨服务问题较复杂
   - 需要额外的容器编排知识

2. **资源开销**
   - 每个用户一个容器，内存占用较高
   - 热池预启动消耗资源
   - Docker 本身有性能损耗 (~2-3%)

3. **网络延迟**
   - Master ↔ Worker 通信增加延迟
   - 特别是频繁的小请求场景
   - 可考虑本地缓存优化

4. **运维复杂度**
   - 需要监控多个服务
   - 日志分散在多个容器
   - 升级需要协调 Master 和 Worker

5. **单点故障**
   - 目前 Master 是单点
   - 建议后续增加 Master HA

---

## 十三、建议与展望

### 13.1 短期优化（1-2周）

1. **增加命令黑名单**
   ```typescript
   const BLACKLISTED_COMMANDS = [
     'rm -rf /', 'mkfs', 'dd if=', ':(){ :|:& };:'
   ]
   ```

2. **添加速率限制**
   - Master 层: 每用户每分钟请求数限制
   - Worker 层: 命令执行频率限制

3. **完善监控指标**
   - Prometheus metrics 导出
   - Grafana Dashboard
   - 告警规则配置

### 13.2 中期改进（1-2月）

1. **Master 高可用**
   - 部署多个 Master 实例
   - 使用 Redis 共享状态
   - L4/L7 负载均衡

2. **Worker 预编译镜像**
   - 减小镜像体积 (< 200MB)
   - 使用多阶段构建
   - 预安装常用依赖

3. **日志聚合**
   - ELK Stack 或 Loki
   - 结构化 JSON 日志
   - RequestId 全链路追踪

### 13.3 长期规划（3-6月）

1. **Serverless Worker**
   - 基于 AWS Lambda/Fargate
   - 按需启动，按秒计费
   - 无需维护热池

2. **gVisor 沙箱**
   - 更强的内核级隔离
   - 防止容器逃逸
   - 符合合规要求

3. **多区域部署**
   - 全球多节点
   - 就近接入
   - 数据主权合规

---

## 十四、附录

### A. 关键文件索引

| 文件 | 作用 | 重要度 |
|-----|------|--------|
| [index.master.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/index.master.ts) | Master 入口 | ⭐⭐⭐⭐ |
| [index.worker.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/index.worker.ts) | Worker 入口 | ⭐⭐⭐⭐ |
| [master/websocket/workerForwarder.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/master/websocket/workerForwarder.ts) | Worker 连接管理 | ⭐⭐⭐⭐⭐ |
| [worker/server/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/server/index.ts) | Worker Internal API | ⭐⭐⭐⭐⭐ |
| [worker/sandbox/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/sandbox/index.ts) | 沙箱执行引擎 | ⭐⭐⭐⭐⭐ |
| [worker/terminal/ptyManager.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/worker/terminal/ptyManager.ts) | PTY 会话管理 | ⭐⭐⭐⭐ |
| [orchestrator/containerOrchestrator.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/orchestrator/containerOrchestrator.ts) | 容器编排器 | ⭐⭐⭐⭐⭐ |
| [shared/types/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/types/index.ts) | 共享类型定义 | ⭐⭐⭐⭐ |
| [shared/utils/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/utils/index.ts) | 共享工具函数 | ⭐⭐⭐⭐ |
| [shared/constants/index.ts](file:///d:/Users/Administrator/AistudyProject/claw-web/server/src/shared/constants/index.ts) | 共享常量 | ⭐⭐⭐ |

### B. 术语表

| 术语 | 解释 |
|-----|------|
| **Master** | 主控服务，负责管理、调度、认证 |
| **Worker** | 工作服务，负责执行、沙箱隔离 |
| **ContainerOrchestrator** | 容器编排器，管理 Worker 生命周期 |
| **Warm Pool** | 热容器池，预启动的空闲 Worker |
| **WorkerForwarder** | Master 端的 Worker 连接管理器 |
| **Internal API** | Worker 暴露的内部接口（仅 Master 可调用）|
| **PTY** | Pseudo Terminal，伪终端，用于交互式 shell |
| **Sandbox** | 沙箱，受限的执行环境 |
| **User Mapping** | 用户到容器的映射关系 |
| **X-Master-Token** | Master-Worker 内部通信的认证 Token |

### C. 参考资源

- [Docker 官方文档](https://docs.docker.com/)
- [node-pty GitHub](https://github.com/microsoft/node-pty)
- [Bun Runtime](https://bun.sh/)
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455)

---

## 📊 报告统计

- **总代码行数分析**: ~2500+ 行核心代码
- **Master 模块数量**: 6 个主要模块
- **Worker 模块数量**: 4 个主要模块
- **共享模块数量**: 3 个子模块
- **API 路由数量**: 23 个路由文件
- **Internal API 端点**: 9 个内部接口
- **安全层级**: 4 层防护
- **架构评分**: ⭐⭐⭐⭐☆ (4.5/5)

---

**报告生成时间**: 2026-04-16  
**分析工具**: Trae IDE Code Analysis  
**报告版本**: v1.0  
**下次审查建议**: 架构变更后或季度评审
