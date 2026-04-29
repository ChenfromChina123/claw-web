# Claw-Web 后端 API 详细文档

> **文档版本**: v3.0  
> **更新日期**: 2026-04-28  
> **基础架构**: Master-Worker 分布式隔离架构  
> **技术栈**: TypeScript + Bun + Express + Docker + MySQL + WebSocket

---

## 📋 目录

- [1. 系统架构概览](#1-系统架构概览)
- [2. 通用约定](#2-通用约定)
- [3. 认证 API](#3-认证-api)
- [4. 会话管理 API](#4-会话管理-api)
- [5. Agent 编排 API](#5-agent-编排-api)
- [6. Agent 工作目录 API](#6-agent-工作目录-api)
- [7. 工具管理 API](#7-工具管理-api)
- [8. MCP 服务 API](#8-mcp-服务-api)
- [9. 监控与诊断 API](#9-监控与诊断-api)
- [10. 工作区管理 API](#10-工作区管理-api)
- [11. 提示词模板 API](#11-提示词模板-api)
- [12. Skills 技能 API](#12-skills-技能-api)
- [13. 用户等级 API](#13-用户等级-api)
- [14. 快照管理 API](#14-快照管理-api)
- [15. 项目部署 API](#15-项目部署-api)
- [16. 插件管理 API](#16-插件管理-api)
- [17. 导出与分享 API](#17-导出与分享-api)
- [18. 外部访问 API](#18-外部访问-api)
- [19. 管理员容器管理 API](#19-管理员容器管理-api)
- [20. 容器管理 API](#20-容器管理-api)
- [21. WebSocket 端点](#21-websocket-端点)
- [22. Worker 内部 API](#22-worker-内部-api)
- [23. 数据类型定义](#23-数据类型定义)
- [24. 错误码体系](#24-错误码体系)
- [25. 安全规范](#25-安全规范)

---

## 1. 系统架构概览

### 1.1 架构设计原则

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Vue.js)                         │
│                   端口: 5173 (开发) / 80 (生产)               │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Master 服务 (端口: 3000)                  │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐   │
│  │ 鉴权模块 │ 会话管理 │ 工具注册 │ Agent引擎 │ 容器编排  │   │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘   │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐   │
│  │ MCP桥接  │ 技能系统 │ 监控诊断 │ 安全中间件│ 路由网关  │   │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ X-Master-Token + Internal API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Worker 服务 (端口: 4000)                  │
│  ┌──────────┬──────────┬──────────┬───────────┐             │
│  │ 沙箱执行 │ PTY终端  │ 文件操作 │ 进程管理  │             │
│  └──────────┴──────────┴──────────┴───────────┘             │
│              ⚠️ 网络隔离 | 无状态 | 不可访问MySQL            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心目录结构

```
server/src/
├── master/                 # 控制层 (Master)
│   ├── routes/            # API 路由定义 (17个路由模块)
│   ├── services/          # 业务逻辑层
│   ├── integrations/      # 集成模块 (MCP/工具/技能/插件)
│   ├── orchestrator/      # 容器编排系统
│   ├── security/          # 安全服务
│   ├── middleware/        # 中间件
│   ├── agents/            # Agent 引擎
│   ├── db/                # 数据库访问层
│   └── prompts/           # 提示词模板
│
├── worker/                # 执行层 (Worker)
│   ├── server/            # Worker HTTP服务
│   ├── terminal/          # PTY 终端管理
│   └── sandbox/           # 沙箱执行环境
│
└── shared/                # 共享模块 (Master ↔ Worker 同步)
    ├── types/             # 类型定义
    ├── constants/         # 常量定义
    └── utils/             # 工具函数
```

### 1.3 服务端口说明

| 服务 | 端口 | 协议 | 用途 |
|------|------|------|------|
| Master | 3000 | HTTP/WS | 控制层 - 鉴权、网关、会话管理、容器调度 |
| Worker | 4000 | HTTP/WS | 执行层 - 沙箱、PTY、文件操作 |
| 前端 | 5173/80 | HTTP | 前端界面 |

### 1.4 请求处理流程

**普通 HTTP API 请求流：**
```
前端 -> Bun.serve (httpServer.ts) -> handleRequest (routes/index.ts) -> 具体路由处理器 -> 服务层 -> 数据库
```

**需要 Worker 执行的请求流：**
```
前端 -> Master HTTP -> authMiddleware -> 容器映射查询 -> proxyToWorkerContainer -> Worker Internal API -> 返回
```

**WebSocket 消息流：**
```
前端 -[WS]-> handleWebSocketMessage (wsMessageRouter.ts) -> 具体消息处理器 -> sessionConversationManager -> AI API + 工具执行 -> 事件推送回前端
```

**PTY 终端流：**
```
前端 -[WS]-> Master -> workerForwarder.connectToWorker -[WS]-> Worker PTY -> 输出回传 -> 前端
```

---

## 2. 通用约定

### 2.1 基础 URL

| 环境 | Master 基础 URL | Worker 基础 URL |
|------|----------------|----------------|
| 开发 | `http://localhost:3000` | `http://localhost:4000` |
| 生产 | `http://<master-host>:3000` | `http://<worker-host>:4000` |

### 2.2 认证方式

大部分 API 需要在请求头中携带 JWT Token：

```
Authorization: Bearer <jwt_token>
```

管理员 API 额外需要管理员权限验证。

Worker 内部 API 使用 Master Token 认证：

```
X-Master-Token: <master_internal_token>
X-User-Id: <user_id>
```

### 2.3 统一响应格式

**成功响应：**

```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应：**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述信息"
  }
}
```

### 2.4 HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 429 | 请求频率超限 |
| 500 | 服务器内部错误 |

### 2.5 路由优先级

Master 路由按以下优先级顺序匹配（定义于 `routes/index.ts`）：

1. 认证路由 (`auth.routes`)
2. Agent 工作目录路由 (`agent.routes`)
3. 会话路由 (`sessions.routes`)
4. 工具路由 (`tools.routes`)
5. Agent 编排路由 (`agents.routes`)
6. MCP 路由 (`mcp.routes`)
7. 监控路由 (`monitoring.routes`)
8. 诊断路由 (`diagnostics.routes`)
9. 工作区路由 (`workspace.routes`)
10. 提示词模板路由 (`promptTemplate.routes`)
11. 用户等级路由 (`userTier.routes`)
12. 快照路由 (`snapshot.routes`)
13. Skills 路由 (`skills.routes`)
14. 管理员容器路由 (`adminContainer.routes`)

---

## 3. 认证 API

**路由文件**: `master/routes/auth.routes.ts`  
**服务文件**: `master/services/authService.ts`, `master/services/jwtService.ts`

### 3.1 发送注册验证码

```
POST /api/auth/register/send-code
```

**请求体：**

```json
{
  "email": "user@example.com"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "验证码已发送"
  }
}
```

**错误场景：**
- 邮箱格式无效
- 邮箱已注册
- 验证码发送频率超限

---

### 3.2 用户注册

```
POST /api/auth/register
```

**请求体：**

```json
{
  "email": "user@example.com",
  "username": "myname",
  "password": "MyPassword123!",
  "code": "123456"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | ✅ | 邮箱地址 |
| username | string | ✅ | 用户名 |
| password | string | ✅ | 密码（bcrypt 加密存储） |
| code | string | ✅ | 邮箱验证码 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "username": "myname",
    "email": "user@example.com",
    "tier": "free",
    "createdAt": "2026-04-28T00:00:00.000Z"
  }
}
```

---

### 3.3 用户登录

```
POST /api/auth/login
```

**请求体：**

```json
{
  "email": "user@example.com",
  "password": "MyPassword123!"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "userId": "uuid-string",
    "username": "myname",
    "email": "user@example.com",
    "tier": "free"
  }
}
```

**错误场景：**
- 邮箱或密码错误 → `INVALID_CREDENTIALS`
- 账号不存在 → `NOT_FOUND`

---

### 3.4 发送忘记密码验证码

```
POST /api/auth/forgot-password/send-code
```

**请求体：**

```json
{
  "email": "user@example.com"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "验证码已发送"
  }
}
```

---

### 3.5 重置密码

```
POST /api/auth/forgot-password
```

**请求体：**

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewPassword456!"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "密码重置成功"
  }
}
```

---

### 3.6 获取当前用户信息

```
GET /api/auth/me
```

**请求头：**

```
Authorization: Bearer <jwt_token>
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "uuid-string",
    "username": "myname",
    "email": "user@example.com",
    "tier": "free",
    "createdAt": "2026-04-28T00:00:00.000Z",
    "updatedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

**错误场景：**
- Token 缺失 → `NO_TOKEN`
- Token 过期 → `TOKEN_EXPIRED`
- Token 无效 → `INVALID_TOKEN`

---

### 3.7 GitHub OAuth 登录

```
GET /api/auth/github
```

**响应**: 302 重定向到 GitHub OAuth 授权页面

---

### 3.8 GitHub OAuth 回调

```
GET /api/auth/github/callback?code=<github_code>
```

**响应**: 302 重定向到前端页面，URL 中携带 Token

---

## 4. 会话管理 API

**路由文件**: `master/routes/sessions.routes.ts`  
**服务文件**: `master/services/sessionManager.ts`  
**仓库文件**: `master/db/repositories/sessionRepository.ts`, `master/db/repositories/messageRepository.ts`

### 4.1 获取用户会话列表

```
GET /api/sessions
```

**请求头：**

```
Authorization: Bearer <jwt_token>
```

**成功响应：**

```json
{
  "success": true,
  "data": [
    {
      "id": "session-uuid",
      "userId": "user-uuid",
      "title": "新对话",
      "model": "claude-3-5-sonnet",
      "isPinned": false,
      "createdAt": "2026-04-28T00:00:00.000Z",
      "updatedAt": "2026-04-28T00:00:00.000Z"
    }
  ]
}
```

---

### 4.2 创建新会话

```
POST /api/sessions
```

**请求体：**

```json
{
  "title": "我的新对话",
  "model": "claude-3-5-sonnet"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | ❌ | 会话标题（默认 "新对话"） |
| model | string | ❌ | 使用的模型（默认系统配置） |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "session-uuid",
    "userId": "user-uuid",
    "title": "我的新对话",
    "model": "claude-3-5-sonnet",
    "isPinned": false,
    "createdAt": "2026-04-28T00:00:00.000Z",
    "updatedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

> **注意**: 如果用户有空会话（无消息），系统会自动复用该会话而非创建新的。

---

### 4.3 加载会话详情

```
GET /api/sessions/:id
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 会话 UUID |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "userId": "user-uuid",
      "title": "我的对话",
      "model": "claude-3-5-sonnet",
      "isPinned": false,
      "createdAt": "2026-04-28T00:00:00.000Z",
      "updatedAt": "2026-04-28T00:00:00.000Z"
    },
    "messages": [
      {
        "id": "msg-uuid",
        "sessionId": "session-uuid",
        "role": "user",
        "content": "你好",
        "createdAt": "2026-04-28T00:00:00.000Z"
      },
      {
        "id": "msg-uuid-2",
        "sessionId": "session-uuid",
        "role": "assistant",
        "content": "你好！有什么可以帮你的吗？",
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "toolCalls": [
      {
        "id": "tc-uuid",
        "messageId": "msg-uuid-2",
        "toolName": "Bash",
        "toolInput": {"command": "ls -la"},
        "toolOutput": {"stdout": "total 8\ndrwxr-xr-x ...", "exitCode": 0},
        "status": "completed",
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ]
  }
}
```

---

### 4.4 更新会话信息

```
PUT /api/sessions/:id
```

**请求体：**

```json
{
  "title": "更新后的标题",
  "model": "qwen-max",
  "isPinned": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | ❌ | 新标题 |
| model | string | ❌ | 切换模型 |
| isPinned | boolean | ❌ | 是否置顶 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "session-uuid",
    "title": "更新后的标题",
    "model": "qwen-max",
    "isPinned": true
  }
}
```

---

### 4.5 删除会话

```
DELETE /api/sessions/:id
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "会话已删除"
  }
}
```

---

### 4.6 清空会话消息

```
POST /api/sessions/:id/clear
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "会话消息已清空"
  }
}
```

---

### 4.7 获取会话已打开文件

```
GET /api/sessions/:id/open-files
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "openFilePaths": ["/workspace/src/index.ts", "/workspace/src/app.ts"],
    "activeFilePath": "/workspace/src/index.ts"
  }
}
```

---

### 4.8 保存会话已打开文件

```
PUT /api/sessions/:id/open-files
```

**请求体：**

```json
{
  "openFilePaths": ["/workspace/src/index.ts", "/workspace/src/app.ts"],
  "activeFilePath": "/workspace/src/index.ts"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "已保存"
  }
}
```

---

### 4.9 删除会话已打开文件记录

```
DELETE /api/sessions/:id/open-files
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "已删除"
  }
}
```

---

### 4.10 搜索消息

```
GET /api/sessions/messages/search
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | ✅ | 搜索关键词 |
| sessionId | string | ❌ | 限定会话 ID |
| startDate | string | ❌ | 起始日期 (ISO 8601) |
| endDate | string | ❌ | 结束日期 (ISO 8601) |
| limit | number | ❌ | 返回条数（默认 20） |
| offset | number | ❌ | 偏移量（默认 0） |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": "msg-uuid",
        "sessionId": "session-uuid",
        "role": "user",
        "content": "包含关键词的消息内容",
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "total": 42
  }
}
```

---

## 5. Agent 编排 API

**路由文件**: `master/routes/agents.routes.ts`  
**服务文件**: `master/agents/` 目录

### 5.1 获取所有可用 Agent 列表

```
GET /api/agents
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "type": "coder",
        "name": "代码助手",
        "description": "专注于代码编写和调试的 Agent",
        "capabilities": ["code_generation", "debugging", "refactoring"]
      }
    ],
    "count": 5
  }
}
```

---

### 5.2 获取特定 Agent 详情

```
GET /api/agents/:type
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | Agent 类型标识 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "agentType": "coder",
    "name": "代码助手",
    "description": "专注于代码编写和调试的 Agent",
    "systemPrompt": "...",
    "availableTools": ["Bash", "FileRead", "FileWrite", "FileEdit", "Glob", "Grep"],
    "maxTurns": 30
  }
}
```

---

### 5.3 获取多 Agent 协调状态

```
GET /api/agents/orchestration/state
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "active": true,
    "orchestratorType": "sequential",
    "subAgents": ["coder", "reviewer"],
    "status": "running",
    "currentStep": 2,
    "totalSteps": 5
  }
}
```

---

### 5.4 初始化多 Agent 协调

```
POST /api/agents/orchestration/init
```

**请求体：**

```json
{
  "orchestratorType": "sequential",
  "subAgentTypes": ["coder", "reviewer", "tester"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| orchestratorType | string | ❌ | 编排类型：sequential / parallel / hierarchical |
| subAgentTypes | string[] | ❌ | 子 Agent 类型列表 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "active": true,
    "orchestratorType": "sequential",
    "subAgents": ["coder", "reviewer", "tester"],
    "status": "initialized"
  }
}
```

---

### 5.5 执行 Agent 任务

```
POST /api/agents/execute
```

**请求体：**

```json
{
  "agentId": "coder",
  "sessionId": "session-uuid",
  "task": "创建一个 Express 服务器",
  "prompt": "请创建一个简单的 Express 服务器，包含健康检查端点",
  "tools": ["Bash", "FileWrite", "FileRead"],
  "maxTurns": 15
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agentId | string | ✅ | Agent 标识 |
| sessionId | string | ✅ | 会话 ID |
| task | string | ❌ | 任务描述 |
| prompt | string | ✅ | 用户提示词 |
| tools | string[] | ❌ | 可用工具列表 |
| maxTurns | number | ❌ | 最大执行轮数 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "role": "assistant",
        "content": "我来帮你创建 Express 服务器..."
      }
    ],
    "toolCalls": [
      {
        "toolName": "FileWrite",
        "toolInput": "{\"path\": \"server.js\", \"content\": \"...\"}",
        "result": "文件已写入"
      }
    ],
    "executionStatus": "completed"
  }
}
```

---

### 5.6 中断正在执行的 Agent

```
POST /api/agents/:agentId/interrupt
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Agent 已中断",
    "agentId": "coder"
  }
}
```

---

### 5.7 发送消息到 Agent

```
POST /api/agents/:agentId/message
```

**请求体：**

```json
{
  "message": "请添加错误处理中间件"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "msg-uuid",
    "content": "好的，我来添加错误处理中间件..."
  }
}
```

---

### 5.8 Agent 管理 API（Express Router）

以下端点挂载在 `/api/agents` 下，使用 Express Router 定义：

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/:agentId/interrupt` | 中断 Agent |
| POST | `/execute` | 执行 Agent（异步） |
| GET | `/:agentId/status` | 获取 Agent 状态 |
| GET | `/:agentId/messages` | 获取 Agent 消息历史 |
| GET | `/:agentId/pending-messages` | 获取待处理消息 |
| POST | `/:agentId/message` | 发送消息到 Agent |
| GET | `/active` | 获取所有活跃 Agent |
| GET | `/registry/status` | 获取 Agent 注册表状态 |
| POST | `/:parentAgentId/fork` | Fork 子代理 |
| GET | `/:agentId/can-fork` | 检查是否可以 Fork |
| GET | `/:rootAgentId/fork-tree` | 获取 Fork 树 |
| POST | `/send-message` | 发送消息到 Agent（跨 Agent） |
| GET | `/stats` | 获取 Agent 系统统计 |
| GET | `/status-panel/agents` | 获取可用 Agent 列表（前端面板） |
| GET | `/status-panel/state` | 获取所有 Agent 当前状态 |
| GET | `/status-panel/state/:agentId` | 获取指定 Agent 状态 |
| POST | `/status-panel/sync-tool-call` | 同步工具调用 |

#### 5.8.1 Fork 子代理

```
POST /api/agents/:parentAgentId/fork
```

**请求体：**

```json
{
  "prompt": "请专注于测试代码",
  "inheritMessages": true,
  "inheritTools": true,
  "inheritPermissionMode": true
}
```

#### 5.8.2 团队管理

```
POST /api/agents/teams
```

**请求体：**

```json
{
  "teamName": "开发团队",
  "description": "全栈开发团队",
  "orchestratorType": "hierarchical"
}
```

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/teams` | 创建团队 |
| GET | `/teams` | 获取团队列表 |
| GET | `/teams/:teamId` | 获取团队详情 |
| POST | `/teams/:teamId/members` | 添加团队成员 |
| POST | `/teams/:teamId/tasks` | 添加团队任务 |
| POST | `/teams/:teamId/assign` | 分配任务 |
| GET | `/teams/:teamId/progress` | 获取团队进度 |

#### 5.8.3 任务分解

```
POST /api/agents/decompose
```

**请求体：**

```json
{
  "task": "构建一个完整的 Web 应用",
  "projectContext": "Node.js + Express + React",
  "preferences": {
    "maxSubTasks": 5,
    "priorityOrder": ["backend", "frontend", "testing"]
  }
}
```

#### 5.8.4 隔离上下文

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/api/agents/isolations` | 创建隔离上下文 |
| GET | `/api/agents/isolations` | 获取用户所有隔离上下文 |
| GET | `/api/agents/isolations/:isolationId` | 获取隔离上下文详情 |
| POST | `/api/agents/isolations/:isolationId/execute` | 在隔离上下文中执行命令 |
| DELETE | `/api/agents/isolations/:isolationId` | 销毁隔离上下文 |

---

## 6. Agent 工作目录 API

**路由文件**: `master/routes/agent.routes.ts`

### 6.1 获取目录/文件列表

```
GET /api/agent/workdir/list
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| path | string | ❌ | 目录路径（默认根目录） |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "name": "src",
        "path": "/workspace/src",
        "isDirectory": true,
        "size": 0,
        "modifiedAt": "2026-04-28T00:00:00.000Z"
      },
      {
        "name": "package.json",
        "path": "/workspace/package.json",
        "isDirectory": false,
        "size": 1024,
        "modifiedAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "path": "/workspace",
    "sessionId": "session-uuid",
    "timestamp": "2026-04-28T00:00:00.000Z"
  }
}
```

---

### 6.2 获取文件内容

```
GET /api/agent/workdir/content
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| path | string | ✅ | 文件路径 |

**成功响应（文本文件）：**

```json
{
  "success": true,
  "data": {
    "mode": "text",
    "content": "文件内容...",
    "language": "typescript",
    "path": "/workspace/src/index.ts",
    "size": 2048,
    "modifiedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

**成功响应（二进制文件）：**

```json
{
  "success": true,
  "data": {
    "mode": "binary",
    "content": "base64-encoded-content...",
    "mimeType": "image/png",
    "path": "/workspace/assets/logo.png",
    "size": 15360,
    "modifiedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

---

### 6.3 保存文件修改

```
POST /api/agent/workdir/save
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "filePath": "/workspace/src/index.ts",
  "content": "console.log('Hello, World!');"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| filePath | string | ✅ | 文件路径 |
| content | string | ✅ | 文件内容 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "path": "/workspace/src/index.ts",
    "savedAt": "2026-04-28T00:00:00.000Z",
    "size": 32
  }
}
```

---

### 6.4 新建文件/文件夹

```
POST /api/agent/workdir/create
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "targetPath": "/workspace/src/utils",
  "kind": "directory"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| targetPath | string | ✅ | 目标路径 |
| kind | string | ✅ | 类型：`file` 或 `directory` |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "path": "/workspace/src/utils",
    "kind": "directory"
  }
}
```

---

### 6.5 流式下载文件

```
GET /api/agent/workdir/download
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| path | string | ✅ | 文件路径 |

**响应**: 文件流（`Content-Type` 根据文件类型自动设置）

---

### 6.6 上传文件到工作区

```
POST /api/agent/workdir/upload
```

**请求体**: `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| directory | string | ❌ | 目标目录（默认根目录） |
| files | File[] | ✅ | 上传的文件列表 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "uploaded": [
      { "filename": "file1.txt", "size": 1024, "path": "/workspace/file1.txt" }
    ],
    "failed": [
      { "filename": "file2.exe", "reason": "文件类型不允许" }
    ],
    "total": 2
  }
}
```

---

### 6.7 删除文件或文件夹

```
DELETE /api/agent/workdir/delete
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "path": "/workspace/src/old-file.ts"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "已删除",
    "path": "/workspace/src/old-file.ts"
  }
}
```

---

### 6.8 获取当前会话有效工作区路径

```
GET /api/agent/session/effective-workspace
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "path": "/workspace"
  }
}
```

---

### 6.9 用户主目录操作

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| GET | `/api/agent/userdir/info` | 获取用户主目录信息 |
| GET | `/api/agent/userdir/list` | 获取用户主目录内容 |
| GET | `/api/agent/userdir/content?path=<path>` | 获取用户主目录文件内容 |
| POST | `/api/agent/userdir/save` | 保存用户主目录文件 |

#### 用户主目录信息

```
GET /api/agent/userdir/info
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "workspaceId": "user-uuid",
    "path": "/data/claws/workspaces/users/user-uuid/",
    "quota": {
      "maxStorageMB": 500,
      "usedStorageMB": 120
    }
  }
}
```

---

### 6.10 Skills 管理（用户目录下）

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| GET | `/api/agent/userdir/skills` | 获取用户已安装 skills |
| POST | `/api/agent/userdir/skills/install` | 安装 skill |
| GET | `/api/agent/userdir/skills/:skillId` | 获取 skill 内容 |
| DELETE | `/api/agent/userdir/skills/:skillId` | 卸载 skill |

#### 安装 Skill

```
POST /api/agent/userdir/skills/install
```

**请求体：**

```json
{
  "skillId": "skill-uuid",
  "name": "代码审查",
  "version": "1.0.0",
  "data": { "prompt": "...", "tools": ["Bash", "FileRead"] }
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "skillId": "skill-uuid",
    "path": "/data/claws/workspaces/users/user-uuid/.skills/skill-uuid.md"
  }
}
```

---

## 7. 工具管理 API

**路由文件**: `master/routes/tools.routes.ts`

### 7.1 获取所有工具列表

```
GET /api/tools
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | ❌ | 按分类过滤 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "Bash",
        "description": "执行 shell 命令",
        "category": "execution",
        "inputSchema": {
          "type": "object",
          "properties": {
            "command": { "type": "string", "description": "要执行的命令" },
            "cwd": { "type": "string", "description": "工作目录" }
          },
          "required": ["command"]
        }
      }
    ],
    "categories": ["execution", "file", "search", "web"],
    "total": 8
  }
}
```

---

### 7.2 获取特定工具详情

```
GET /api/tools/:name
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "name": "Bash",
    "description": "执行 shell 命令",
    "category": "execution",
    "inputSchema": { ... },
    "outputSchema": { ... },
    "examples": [ ... ]
  }
}
```

---

### 7.3 执行工具

```
POST /api/tools/execute
```

**请求体：**

```json
{
  "toolName": "Bash",
  "toolInput": {
    "command": "ls -la /workspace"
  },
  "sessionId": "session-uuid",
  "context": {
    "workingDirectory": "/workspace"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| toolName | string | ✅ | 工具名称 |
| toolInput | object | ✅ | 工具输入参数 |
| sessionId | string | ❌ | 关联会话 ID |
| context | object | ❌ | 执行上下文 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "result": "total 8\ndrwxr-xr-x 2 root root 4096 ...",
    "error": null,
    "output": "total 8\ndrwxr-xr-x 2 root root 4096 ...",
    "metadata": {
      "exitCode": 0,
      "duration": 120,
      "toolName": "Bash"
    }
  }
}
```

---

### 7.4 获取工具执行历史

```
GET /api/tools/history
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | ❌ | 返回条数（默认 50） |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "tc-uuid",
        "toolName": "Bash",
        "toolInput": "{\"command\": \"ls -la\"}",
        "result": "...",
        "status": "completed",
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "count": 15
  }
}
```

---

### 7.5 清空工具执行历史

```
POST /api/tools/history/clear
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "历史已清空"
  }
}
```

---

### 7.6 验证工具输入

```
POST /api/tools/validate
```

**请求体：**

```json
{
  "toolName": "Bash",
  "toolInput": {
    "command": "ls -la"
  }
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "tool": {
      "name": "Bash",
      "inputSchema": { ... }
    }
  }
}
```

**验证失败响应：**

```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": ["缺少必填字段: command"],
    "tool": { ... }
  }
}
```

---

## 8. MCP 服务 API

**路由文件**: `master/routes/mcp.routes.ts`  
**服务文件**: `master/services/mcp/McpGateway.ts`

### 8.1 获取 MCP 服务器列表

```
GET /api/mcp/servers
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "id": "server-uuid",
        "name": "filesystem",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
        "enabled": true,
        "status": "connected",
        "transport": "stdio"
      }
    ],
    "count": 3
  }
}
```

---

### 8.2 添加 MCP 服务器

```
POST /api/mcp/servers
```

**请求体：**

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
  "env": {},
  "transport": "stdio",
  "url": null
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 服务器名称 |
| command | string | ❌ | 启动命令（stdio 模式） |
| args | string[] | ❌ | 命令参数 |
| env | object | ❌ | 环境变量 |
| transport | string | ❌ | 传输方式：stdio / sse |
| url | string | ❌ | SSE 模式的 URL |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "serverId": "server-uuid",
    "message": "MCP 服务器已添加"
  }
}
```

---

### 8.3 移除 MCP 服务器

```
DELETE /api/mcp/servers/:id
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "MCP 服务器已移除"
  }
}
```

---

### 8.4 启用/禁用 MCP 服务器

```
PUT /api/mcp/servers/:id/toggle
```

**请求体：**

```json
{
  "enabled": false
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "enabled": false,
    "message": "MCP 服务器已禁用"
  }
}
```

---

### 8.5 测试 MCP 服务器连接

```
POST /api/mcp/servers/:id/test
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "connected": true,
    "tools": ["read_file", "write_file", "list_directory"],
    "latency": 150
  }
}
```

---

### 8.6 获取 MCP 工具列表

```
GET /api/mcp/tools
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| serverId | string | ❌ | 按服务器 ID 过滤 |
| serverName | string | ❌ | 按服务器名称过滤 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "read_file",
        "description": "读取文件内容",
        "inputSchema": { ... },
        "serverId": "server-uuid",
        "serverName": "filesystem"
      }
    ],
    "count": 5,
    "serverId": null,
    "serverName": null
  }
}
```

---

### 8.7 调用 MCP 工具

```
POST /api/mcp/call
```

**请求体：**

```json
{
  "toolName": "read_file",
  "toolInput": {
    "path": "/workspace/src/index.ts"
  },
  "serverId": "server-uuid"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "result": "文件内容...",
    "error": null,
    "toolName": "read_file"
  }
}
```

---

### 8.8 获取 MCP 状态

```
GET /api/mcp/status
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "totalServers": 3,
    "connectedServers": 2,
    "totalTools": 15,
    "servers": [
      { "name": "filesystem", "status": "connected" },
      { "name": "github", "status": "connected" },
      { "name": "database", "status": "disconnected" }
    ]
  }
}
```

---

## 9. 监控与诊断 API

**路由文件**: `master/routes/monitoring.routes.ts`, `master/routes/diagnostics.routes.ts`, `master/routes/monitoringDashboard.routes.ts`

### 9.1 获取性能统计

```
GET /api/monitoring/performance
```

> ⚠️ 需要管理员权限

**成功响应：**

```json
{
  "success": true,
  "data": {
    "database": {
      "activeConnections": 5,
      "totalQueries": 1200,
      "avgQueryTime": 45
    },
    "containers": {
      "running": 3,
      "total": 5,
      "avgCpuUsage": "15%",
      "avgMemoryUsage": "256MB"
    },
    "system": {
      "uptime": 86400,
      "cpuUsage": "25%",
      "memoryUsage": "2.1GB / 8GB"
    }
  }
}
```

---

### 9.2 获取资源使用情况

```
GET /api/monitoring/resources
```

> ⚠️ 需要管理员权限

**成功响应：**

```json
{
  "success": true,
  "data": {
    "cpu": {
      "usage": 25.5,
      "cores": 4
    },
    "memory": {
      "total": 8192,
      "used": 2150,
      "free": 6042,
      "unit": "MB"
    },
    "process": {
      "pid": 12345,
      "memoryUsage": 256,
      "cpuUsage": 5.2
    }
  }
}
```

---

### 9.3 获取容器状态

```
GET /api/monitoring/containers
```

> ⚠️ 需要管理员权限

**成功响应：**

```json
{
  "success": true,
  "data": {
    "containers": [
      {
        "id": "container-uuid",
        "name": "claw-worker-user1",
        "status": "running",
        "cpuUsage": "10%",
        "memoryUsage": "128MB",
        "userId": "user-uuid"
      }
    ],
    "total": 5,
    "running": 3,
    "stopped": 2
  }
}
```

---

### 9.4 获取系统健康状态

```
GET /api/diagnostics/health
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "version": "1.0.0",
    "services": {
      "database": "connected",
      "docker": "running",
      "workerPool": "3/5 available"
    }
  }
}
```

---

### 9.5 获取组件详细信息

```
GET /api/diagnostics/components
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "health": {
      "database": { "status": "healthy", "latency": 5 },
      "docker": { "status": "healthy", "containers": 5 },
      "workspace": { "status": "healthy", "diskUsage": "45%" }
    },
    "metrics": {
      "requestsPerMinute": 120,
      "activeWebSockets": 15,
      "activeAgents": 3
    },
    "alerts": []
  }
}
```

---

### 9.6 监控仪表盘 API（Express Router）

挂载在 `/api/monitoring-dashboard` 下：

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| GET | `/metrics` | Prometheus 格式指标导出 |
| GET | `/dashboard` | 仪表盘综合数据（需认证） |
| GET | `/alerts` | 获取活跃告警（需认证） |
| GET | `/history/:metric` | 获取历史趋势数据 |

#### 获取历史趋势

```
GET /api/monitoring-dashboard/history/:metric
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| hours | number | ❌ | 查询小时数（默认 24） |
| interval | string | ❌ | 采样间隔（1m/5m/15m/1h） |

---

## 10. 工作区管理 API

**路由文件**: `master/routes/workspace.routes.ts`

### 10.1 上传文件到工作区

```
POST /api/workspace/:sessionId/upload
```

**请求体**: `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ✅ | 上传的文件 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "fileId": "file-uuid",
    "filename": "document.pdf",
    "size": 204800,
    "path": "/workspace/uploads/document.pdf"
  }
}
```

---

### 10.2 获取工作区文件列表

```
GET /api/workspace/:sessionId/files
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "name": "document.pdf",
        "path": "/workspace/uploads/document.pdf",
        "size": 204800,
        "uploadedAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

### 10.3 删除工作区文件

```
DELETE /api/workspace/:sessionId/files/:filename
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "文件已删除"
  }
}
```

---

### 10.4 获取工作区信息

```
GET /api/workspace/:sessionId
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "workspace": {
      "sessionId": "session-uuid",
      "path": "/workspace",
      "totalFiles": 15,
      "totalSize": "2.5MB",
      "createdAt": "2026-04-28T00:00:00.000Z"
    }
  }
}
```

---

### 10.5 清空工作区

```
DELETE /api/workspace/:sessionId
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "工作区已清空"
  }
}
```

---

## 11. 提示词模板 API

**路由文件**: `master/routes/promptTemplate.routes.ts`  
**仓库文件**: `master/db/repositories/promptTemplateRepository.ts`

### 11.1 分类管理

#### 获取所有分类

```
GET /api/prompt-templates/categories
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "categories": [
      { "id": 1, "name": "代码生成", "icon": "💻", "sortOrder": 1 },
      { "id": 2, "name": "文档编写", "icon": "📝", "sortOrder": 2 }
    ]
  }
}
```

#### 创建分类

```
POST /api/prompt-templates/categories
```

**请求体：**

```json
{
  "name": "代码审查",
  "icon": "🔍",
  "sortOrder": 3
}
```

#### 更新分类

```
PUT /api/prompt-templates/categories/:id
```

**请求体：**

```json
{
  "name": "代码审查与优化",
  "icon": "🔎",
  "sortOrder": 4
}
```

#### 删除分类

```
DELETE /api/prompt-templates/categories/:id
```

---

### 11.2 模板管理

#### 获取模板列表

```
GET /api/prompt-templates
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| categoryId | number | ❌ | 按分类过滤 |
| keyword | string | ❌ | 关键词搜索 |
| favorites | boolean | ❌ | 仅显示收藏 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "templates": [
      {
        "id": 1,
        "title": "React 组件生成器",
        "content": "请帮我创建一个 React 组件...",
        "categoryId": 1,
        "description": "快速生成 React 组件模板",
        "tags": ["react", "组件"],
        "isFavorite": false,
        "useCount": 42,
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ]
  }
}
```

#### 创建模板

```
POST /api/prompt-templates
```

**请求体：**

```json
{
  "title": "API 文档生成",
  "content": "请为以下 API 生成文档...",
  "categoryId": 2,
  "description": "自动生成 API 接口文档",
  "tags": ["api", "文档"]
}
```

#### 获取单个模板

```
GET /api/prompt-templates/:id
```

#### 更新模板

```
PUT /api/prompt-templates/:id
```

**请求体：**

```json
{
  "title": "REST API 文档生成",
  "content": "请为以下 REST API 生成文档...",
  "description": "自动生成 REST API 接口文档",
  "categoryId": 2,
  "tags": ["api", "rest", "文档"]
}
```

#### 删除模板

```
DELETE /api/prompt-templates/:id
```

#### 切换收藏状态

```
POST /api/prompt-templates/:id/favorite
```

**请求体：**

```json
{
  "isFavorite": true
}
```

#### 使用模板（增加使用次数）

```
POST /api/prompt-templates/:id/use
```

---

## 12. Skills 技能 API

**路由文件**: `master/routes/skills.routes.ts`

### 12.1 列出所有技能

```
GET /api/skills
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | ❌ | 按分类过滤 |
| query | string | ❌ | 搜索关键词 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "id": "skill-uuid",
        "name": "代码审查",
        "description": "自动审查代码质量",
        "category": "development",
        "enabled": true,
        "version": "1.0.0"
      }
    ],
    "categories": ["development", "writing", "analysis"],
    "total": 12,
    "stats": {
      "enabled": 8,
      "disabled": 4,
      "categories": 3
    }
  }
}
```

---

### 12.2 获取技能详情

```
GET /api/skills/:id
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "skill-uuid",
    "name": "代码审查",
    "description": "自动审查代码质量",
    "category": "development",
    "enabled": true,
    "content": "# 代码审查技能\n\n你是一个专业的代码审查助手...",
    "tools": ["FileRead", "Grep", "Glob"],
    "version": "1.0.0",
    "createdAt": "2026-04-28T00:00:00.000Z"
  }
}
```

---

### 12.3 启用/禁用技能

```
POST /api/skills/:id/toggle
```

**请求体：**

```json
{
  "enabled": false
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "skill": {
      "id": "skill-uuid",
      "name": "代码审查",
      "enabled": false
    },
    "message": "技能已禁用"
  }
}
```

---

### 12.4 获取所有类别

```
GET /api/skills/categories
```

**成功响应：**

```json
{
  "success": true,
  "data": ["development", "writing", "analysis", "security"]
}
```

---

### 12.5 获取统计信息

```
GET /api/skills/stats
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "total": 12,
    "enabled": 8,
    "disabled": 4,
    "categories": 3,
    "recentlyUsed": 5
  }
}
```

---

### 12.6 从 URL 导入技能

```
POST /api/skills/import/url
```

**请求体：**

```json
{
  "url": "https://example.com/skills/code-review.md",
  "category": "development"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "skillName": "代码审查",
    "skillId": "skill-uuid",
    "filePath": "/data/skills/code-review.md",
    "message": "技能导入成功"
  }
}
```

---

### 12.7 上传技能文件

```
POST /api/skills/import/file
```

**请求体**: `multipart/form-data` 或 JSON

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | ❌ | 技能文件（FormData 模式） |
| content | string | ❌ | 技能内容（JSON 模式） |
| name | string | ❌ | 技能名称 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "success": true,
    "skillName": "自定义技能",
    "skillId": "skill-uuid",
    "filePath": "/data/skills/custom-skill.md",
    "message": "技能导入成功"
  }
}
```

---

### 12.8 验证技能内容

```
POST /api/skills/validate
```

**请求体：**

```json
{
  "content": "# 我的技能\n\n你是一个助手..."
}
```

或：

```json
{
  "url": "https://example.com/skills/test.md"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "name": "我的技能",
    "description": "提取的描述",
    "tools": ["Bash", "FileRead"],
    "warnings": []
  }
}
```

---

## 13. 用户等级 API

**路由文件**: `master/routes/userTier.routes.ts`

### 13.1 获取所有等级配额配置

```
GET /api/tier/quotas
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "free": {
      "maxSessions": 5,
      "maxMessagesPerDay": 100,
      "maxStorageMB": 500,
      "maxPtyProcesses": 2,
      "maxConcurrentAgents": 1
    },
    "pro": {
      "maxSessions": 50,
      "maxMessagesPerDay": 1000,
      "maxStorageMB": 5000,
      "maxPtyProcesses": 5,
      "maxConcurrentAgents": 3
    },
    "enterprise": {
      "maxSessions": -1,
      "maxMessagesPerDay": -1,
      "maxStorageMB": 50000,
      "maxPtyProcesses": 20,
      "maxConcurrentAgents": 10
    }
  }
}
```

---

### 13.2 获取当前用户配额

```
GET /api/tier/my-quota
```

**请求头：**

```
Authorization: Bearer <jwt_token>
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "userId": "user-uuid",
    "username": "myname",
    "tier": "free",
    "quota": {
      "maxSessions": 5,
      "maxMessagesPerDay": 100,
      "maxStorageMB": 500
    },
    "hasCustomQuota": false
  }
}
```

---

### 13.3 更新用户等级

```
PUT /api/tier/update/:userId
```

> ⚠️ 需要管理员权限

**请求体：**

```json
{
  "tier": "pro",
  "subscriptionExpiresAt": "2027-04-28T00:00:00.000Z"
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "用户等级已更新"
  }
}
```

---

### 13.4 设置自定义配额

```
PUT /api/tier/custom-quota/:userId
```

> ⚠️ 需要管理员权限

**请求体：**

```json
{
  "customQuota": {
    "maxSessions": 20,
    "maxMessagesPerDay": 500,
    "maxStorageMB": 2000
  }
}
```

---

### 13.5 获取资源使用统计

```
GET /api/tier/usage-stats/:userId
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "sessions": { "used": 3, "limit": 5 },
    "messages": { "used": 45, "limit": 100 },
    "storage": { "usedMB": 120, "limitMB": 500 },
    "ptyProcesses": { "active": 1, "limit": 2 }
  }
}
```

---

### 13.6 获取所有用户等级列表

```
GET /api/tier/users
```

> ⚠️ 需要管理员权限

**成功响应：**

```json
{
  "success": true,
  "data": [
    {
      "userId": "user-uuid",
      "username": "myname",
      "email": "user@example.com",
      "tier": "free",
      "createdAt": "2026-04-28T00:00:00.000Z"
    }
  ]
}
```

---

## 14. 快照管理 API

**路由文件**: `master/routes/snapshot.routes.ts`  
**服务文件**: `master/services/enhancedSnapshotService.ts`, `master/services/workSnapshotService.ts`

### 14.1 获取用户快照列表

```
GET /api/snapshots
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | ❌ | 返回条数（默认 20） |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "snapshots": [
      {
        "id": "snapshot-uuid",
        "sessionId": "session-uuid",
        "snapshotType": "manual",
        "description": "开发完成前的快照",
        "workspacePath": "/workspace",
        "size": "15MB",
        "createdAt": "2026-04-28T00:00:00.000Z"
      }
    ],
    "count": 5
  }
}
```

---

### 14.2 创建新快照

```
POST /api/snapshots
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "containerId": "container-uuid",
  "snapshotType": "manual",
  "workspacePath": "/workspace",
  "description": "开发完成前的快照"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | ✅ | 会话 ID |
| containerId | string | ❌ | 容器 ID |
| snapshotType | string | ❌ | 类型：manual / auto / checkpoint |
| workspacePath | string | ❌ | 工作空间路径 |
| description | string | ❌ | 快照描述 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "snapshot": {
      "id": "snapshot-uuid",
      "sessionId": "session-uuid",
      "snapshotType": "manual",
      "description": "开发完成前的快照",
      "size": "15MB",
      "createdAt": "2026-04-28T00:00:00.000Z"
    },
    "message": "快照创建成功"
  }
}
```

---

### 14.3 获取快照详情

```
GET /api/snapshots/:snapshotId
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "snapshot": {
      "id": "snapshot-uuid",
      "sessionId": "session-uuid",
      "snapshotType": "manual",
      "description": "开发完成前的快照",
      "workspacePath": "/workspace",
      "files": ["src/index.ts", "package.json"],
      "size": "15MB",
      "createdAt": "2026-04-28T00:00:00.000Z"
    }
  }
}
```

---

### 14.4 删除快照

```
DELETE /api/snapshots/:snapshotId
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "快照已删除"
  }
}
```

---

### 14.5 恢复快照

```
POST /api/snapshots/:snapshotId/restore
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| containerId | string | ❌ | 目标容器 ID |
| sessionId | string | ❌ | 目标会话 ID |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "快照已恢复",
    "snapshot": {
      "id": "snapshot-uuid",
      "restoredAt": "2026-04-28T00:00:00.000Z"
    }
  }
}
```

---

## 15. 项目部署 API

**路由文件**: `master/routes/deployment.routes.ts`  
**服务文件**: `master/services/projectDeploymentService.ts`

> 挂载在 `/api/deployments` 下，使用 Express Router

### 15.1 创建新项目部署

```
POST /api/deployments
```

**请求体：**

```json
{
  "name": "my-web-app",
  "type": "node",
  "sourceType": "git",
  "sourceUrl": "https://github.com/user/repo.git",
  "buildCommand": "npm run build",
  "startCommand": "npm start",
  "envVars": {
    "NODE_ENV": "production",
    "PORT": "8080"
  },
  "memoryLimit": 256,
  "autoRestart": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | ✅ | 项目名称 |
| type | string | ❌ | 项目类型：node / python / static |
| sourceType | string | ❌ | 源码类型：git / upload |
| sourceUrl | string | ❌ | Git 仓库 URL |
| sourceCode | string | ❌ | 直接上传的源码 |
| buildCommand | string | ❌ | 构建命令 |
| startCommand | string | ✅ | 启动命令 |
| envVars | object | ❌ | 环境变量 |
| memoryLimit | number | ❌ | 内存限制 (MB) |
| autoRestart | boolean | ❌ | 自动重启 |

---

### 15.2 获取用户所有项目

```
GET /api/deployments
```

---

### 15.3 获取项目详情

```
GET /api/deployments/:projectId
```

---

### 15.4 启动项目

```
POST /api/deployments/:projectId/start
```

---

### 15.5 停止项目

```
POST /api/deployments/:projectId/stop
```

---

### 15.6 重启项目

```
POST /api/deployments/:projectId/restart
```

---

### 15.7 删除项目

```
DELETE /api/deployments/:projectId
```

---

### 15.8 获取项目日志

```
GET /api/deployments/:projectId/logs
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| lines | number | ❌ | 返回行数（默认 100） |

---

### 15.9 获取项目状态

```
GET /api/deployments/:projectId/status
```

---

## 16. 插件管理 API

**路由文件**: `master/routes/plugin.routes.ts`

> 挂载在 `/api/plugins` 下，使用 Express Router

### 16.1 获取所有插件

```
GET /api/plugins
```

---

### 16.2 获取单个插件

```
GET /api/plugins/:id
```

---

### 16.3 安装插件

```
POST /api/plugins/install
```

**请求体：**

```json
{
  "source": "https://github.com/user/plugin.git",
  "enable": true,
  "config": {
    "apiKey": "xxx"
  }
}
```

---

### 16.4 卸载插件

```
DELETE /api/plugins/:id
```

---

### 16.5 启用插件

```
POST /api/plugins/:id/enable
```

---

### 16.6 禁用插件

```
POST /api/plugins/:id/disable
```

---

### 16.7 更新插件配置

```
PUT /api/plugins/:id/config
```

**请求体：**

```json
{
  "config": {
    "apiKey": "new-key",
    "maxRetries": 3
  }
}
```

---

### 16.8 获取插件配置

```
GET /api/plugins/:id/config
```

---

### 16.9 执行插件操作

```
POST /api/plugins/:id/execute
```

**请求体：**

```json
{
  "action": "analyze",
  "params": {
    "target": "/workspace/src"
  }
}
```

---

### 16.10 获取插件统计

```
GET /api/plugins/stats
```

---

### 16.11 获取所有已启用的插件工具

```
GET /api/plugins/tools/list
```

---

### 16.12 创建示例插件

```
POST /api/plugins/create-samples
```

---

## 17. 导出与分享 API

**路由文件**: `master/routes/export.routes.ts`

### 17.1 导出会话为 Markdown

```
POST /api/export/markdown
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "messageIds": ["msg-uuid-1", "msg-uuid-2"]
}
```

**响应**: Markdown 文件流

---

### 17.2 导出会话为 HTML

```
POST /api/export/html
```

**请求体：** 同上

**响应**: HTML 文件流

---

### 17.3 导出会话为 JSON

```
POST /api/export/json
```

**请求体：** 同上

**响应**: JSON 文件流

---

### 17.4 创建分享链接

```
POST /api/share
```

**请求体：**

```json
{
  "sessionId": "session-uuid",
  "title": "我的对话分享",
  "expiresInHours": 72
}
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "shareId": "share-uuid",
    "shareCode": "abc123",
    "shareUrl": "https://example.com/share/abc123",
    "expiresAt": "2026-05-01T00:00:00.000Z"
  }
}
```

---

### 17.5 获取分享内容

```
GET /api/share/:shareCode
```

> ⚠️ 无需认证

**成功响应：**

```json
{
  "success": true,
  "data": {
    "title": "我的对话分享",
    "session": { ... },
    "messages": [ ... ],
    "sharedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

---

### 17.6 删除分享

```
DELETE /api/share/:shareId
```

---

### 17.7 获取用户分享列表

```
GET /api/share/user/list
```

---

## 18. 外部访问 API

**路由文件**: `master/routes/externalAccess.routes.ts`

> 挂载在 `/api/external-access` 下，使用 Express Router

### 18.1 域名管理

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/domain` | 为项目分配域名 |
| POST | `/domain/verify` | 验证域名所有权 |
| GET | `/domain/:projectId` | 获取项目域名信息 |
| DELETE | `/domain/:domainId` | 删除域名 |

#### 分配域名

```
POST /api/external-access/domain
```

**请求体：**

```json
{
  "projectId": "project-uuid",
  "customDomain": "app.example.com"
}
```

#### 验证域名所有权

```
POST /api/external-access/domain/verify
```

**请求体：**

```json
{
  "domain": "app.example.com",
  "method": "dns"
}
```

---

### 18.2 SSL 证书管理

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/ssl` | 申请 SSL 证书 |
| POST | `/ssl/renew` | 续期 SSL 证书 |
| GET | `/ssl/list` | 列出所有 SSL 证书 |

#### 申请 SSL 证书

```
POST /api/external-access/ssl
```

**请求体：**

```json
{
  "domain": "app.example.com",
  "email": "admin@example.com",
  "staging": false,
  "wildcard": false,
  "dnsProvider": "cloudflare",
  "dnsCredentials": {
    "apiToken": "xxx"
  }
}
```

---

### 18.3 内网穿透隧道

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/tunnel` | 创建内网穿透隧道 |
| DELETE | `/tunnel/:tunnelId` | 删除隧道 |
| GET | `/tunnel/:projectId` | 获取项目隧道信息 |

#### 创建隧道

```
POST /api/external-access/tunnel
```

**请求体：**

```json
{
  "projectId": "project-uuid",
  "type": "ngrok",
  "localPort": 8080,
  "subdomain": "myapp",
  "customDomain": null,
  "auth": null
}
```

---

### 18.4 反向代理

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| POST | `/proxy` | 配置反向代理 |
| GET | `/proxy/stats` | 获取代理统计信息 |

#### 配置反向代理

```
POST /api/external-access/proxy
```

**请求体：**

```json
{
  "projectId": "project-uuid",
  "domain": "app.example.com",
  "workerPort": 8080,
  "internalPort": 3000,
  "sslEnabled": true,
  "accessControl": {
    "allowedIps": null,
    "authRequired": false
  }
}
```

---

## 19. 管理员容器管理 API

**路由文件**: `master/routes/adminContainer.routes.ts`

### 19.1 获取所有容器列表

```
GET /api/admin/containers
```

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| all | boolean | ❌ | 是否包含停止的容器 |

**成功响应：**

```json
{
  "success": true,
  "data": {
    "containers": [
      {
        "id": "container-uuid",
        "name": "claw-worker-user1",
        "state": "running",
        "image": "claw-worker:latest",
        "created": "2026-04-28T00:00:00.000Z",
        "ports": "4000/tcp -> 0.0.0.0:4001"
      }
    ],
    "total": 5,
    "running": 3,
    "stopped": 2
  }
}
```

---

### 19.2 获取容器详情

```
GET /api/admin/containers/:id
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "id": "container-uuid",
    "name": "claw-worker-user1",
    "state": "running",
    "image": "claw-worker:latest",
    "created": "2026-04-28T00:00:00.000Z",
    "ports": { "4000/tcp": "0.0.0.0:4001" },
    "networks": ["claw-network"],
    "env": ["WORKER_INTERNAL_PORT=4000", "CONTAINER_ROLE=worker"],
    "userId": "user-uuid"
  }
}
```

---

### 19.3 启动容器

```
POST /api/admin/containers/:id/start
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "容器已启动",
    "containerId": "container-uuid"
  }
}
```

---

### 19.4 停止容器

```
POST /api/admin/containers/:id/stop
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "容器已停止",
    "containerId": "container-uuid"
  }
}
```

---

### 19.5 重启容器

```
POST /api/admin/containers/:id/restart
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "容器已重启",
    "containerId": "container-uuid"
  }
}
```

---

### 19.6 删除容器

```
DELETE /api/admin/containers/:id
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "容器已删除",
    "containerId": "container-uuid"
  }
}
```

---

### 19.7 清理未使用容器

```
POST /api/admin/containers/prune
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "message": "清理完成",
    "spaceReclaimed": "1.5GB",
    "containersRemoved": 3
  }
}
```

---

### 19.8 获取容器池统计

```
GET /api/admin/pool/stats
```

**成功响应：**

```json
{
  "success": true,
  "data": {
    "containers": {
      "total": 10,
      "running": 5,
      "stopped": 3,
      "warm": 2
    },
    "images": 3,
    "volumes": 8,
    "networks": 2
  }
}
```

---

## 20. 容器管理 API

**路由文件**: `master/routes/containerManagement.routes.ts`

> 挂载在 `/api/containers` 下，使用 Express Router

### 20.1 获取容器池统计信息

```
GET /api/containers/stats
```

> ⚠️ 需要管理员权限

---

### 20.2 获取所有用户-容器映射

```
GET /api/containers/users
```

> ⚠️ 需要管理员权限

---

### 20.3 为用户分配容器

```
POST /api/containers/assign
```

> ⚠️ 需要管理员权限

**请求体：**

```json
{
  "targetUserId": "user-uuid",
  "username": "myname"
}
```

---

### 20.4 释放用户容器

```
DELETE /api/containers/:userId/release
```

> ⚠️ 需要管理员权限或用户本人

---

### 20.5 查询用户容器状态

```
GET /api/containers/:userId/status
```

> ⚠️ 需要管理员权限或用户本人

---

### 20.6 预热新容器

```
POST /api/containers/prewarm
```

> ⚠️ 需要管理员权限

---

## 21. WebSocket 端点

**路由文件**: `master/websocket/wsMessageRouter.ts`  
**转发器**: `master/websocket/workerForwarder.ts`

### 21.1 WebSocket 连接

```
WS /ws
```

**连接协议**: WebSocket  
**认证方式**: 连接后发送 `login` 消息携带 Token

---

### 21.2 WebSocket 消息类型

#### 客户端 → 服务器

| 消息类型 | 说明 | payload 格式 |
|----------|------|-------------|
| `login` | Token 登录 | `{ token: string }` |
| `register` | 用户注册 | `{ username, email, password, code }` |
| `create_session` | 创建会话 | `{ title?, model? }` |
| `load_session` | 加载会话 | `{ sessionId }` |
| `list_sessions` | 列出会话 | `{}` |
| `user_message` | 发送用户消息 | `{ sessionId, content, model? }` |
| `interrupt_generation` | 中断生成 | `{ sessionId }` |
| `delete_session` | 删除会话 | `{ sessionId }` |
| `rename_session` | 重命名会话 | `{ sessionId, title }` |
| `clear_session` | 清空会话 | `{ sessionId }` |
| `rollback_session` | 回滚会话 | `{ sessionId, anchorMessageId }` |
| `get_tools` | 获取工具列表 | `{}` |
| `execute_command` | 执行命令 | `{ command, cwd? }` |
| `validate_user` | 验证用户 | `{ token }` |
| `get_models` | 获取模型列表 | `{}` |
| `get_status` | 获取状态 | `{}` |
| `agents_list` | 获取 Agent 列表 | `{}` |
| `agents_orchestration_state` | 获取协调状态 | `{}` |
| `agents_orchestration_init` | 初始化协调 | `{ orchestratorType?, subAgentTypes? }` |
| `ping` | 心跳 | `{}` |

#### 服务器 → 客户端

| 消息类型 | 说明 | payload 格式 |
|----------|------|-------------|
| `pong` | 心跳响应 | `{}` |
| `session_created` | 会话已创建 | `{ session }` |
| `session_loaded` | 会话已加载 | `{ session, messages, toolCalls }` |
| `sessions_list` | 会话列表 | `{ sessions }` |
| `assistant_message` | AI 响应消息（流式） | `{ sessionId, messageId, content, isComplete }` |
| `tool_call` | 工具调用通知 | `{ sessionId, toolCall }` |
| `tool_result` | 工具执行结果 | `{ sessionId, toolResult }` |
| `generation_interrupted` | 生成已中断 | `{ sessionId }` |
| `pty_output` | PTY 终端输出 | `{ sessionId, data }` |
| `error` | 错误消息 | `{ code, message }` |
| `result` | 操作结果 | `{ success, data }` |

---

### 21.3 WebSocket 消息格式

**请求消息格式：**

```json
{
  "type": "user_message",
  "payload": {
    "sessionId": "session-uuid",
    "content": "请帮我创建一个 Express 服务器"
  }
}
```

**响应消息格式：**

```json
{
  "type": "assistant_message",
  "payload": {
    "sessionId": "session-uuid",
    "messageId": "msg-uuid",
    "content": "好的，我来帮你创建...",
    "isComplete": false
  }
}
```

---

## 22. Worker 内部 API

**路由文件**: `worker/server/index.ts`  
**沙箱引擎**: `worker/sandbox/index.ts`  
**PTY 管理器**: `worker/terminal/ptyManager.ts`

> ⚠️ Worker 内部 API 仅供 Master 调用，不对外暴露。所有请求必须携带 `X-Master-Token` 和 `X-User-Id` 头。

### 22.1 健康检查

```
GET /internal/health
```

> 无需认证

**成功响应：**

```json
{
  "status": "ok",
  "role": "worker",
  "uptime": 86400,
  "ptySessions": {
    "total": 3,
    "byUser": {
      "user-uuid": 2
    }
  }
}
```

---

### 22.2 内部 API 请求

```
POST /internal/*
```

**请求头：**

```
X-Master-Token: <master_internal_token>
X-User-Id: <user_id>
Content-Type: application/json
```

**请求体格式：**

```json
{
  "type": "<operation_type>",
  "requestId": "req-uuid",
  "payload": { ... }
}
```

**响应格式：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": { ... }
}
```

**错误响应格式：**

```json
{
  "requestId": "req-uuid",
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

---

### 22.3 执行命令

**type**: `exec`

**请求体：**

```json
{
  "type": "exec",
  "requestId": "req-uuid",
  "payload": {
    "command": "npm install express",
    "cwd": "/workspace",
    "env": { "NODE_ENV": "development" },
    "timeout": 30000
  }
}
```

| payload 字段 | 类型 | 必填 | 说明 |
|-------------|------|------|------|
| command | string | ✅ | 要执行的命令 |
| cwd | string | ❌ | 工作目录（默认 `/workspace`） |
| env | object | ❌ | 环境变量 |
| timeout | number | ❌ | 超时时间 ms（默认 30000） |

**成功响应：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": {
    "stdout": "added 57 packages in 3s\n",
    "stderr": "",
    "exitCode": 0,
    "duration": 3200
  }
}
```

> **安全限制**: 阻止容器破坏性操作（shutdown、reboot、mkfs、rm -rf /、dd 写设备、fork bomb）

---

### 22.4 PTY 操作

#### 创建 PTY 会话

**type**: `pty_create`

**请求体：**

```json
{
  "type": "pty_create",
  "requestId": "req-uuid",
  "payload": {
    "cols": 80,
    "rows": 24,
    "cwd": "/workspace"
  }
}
```

| payload 字段 | 类型 | 必填 | 说明 |
|-------------|------|------|------|
| cols | number | ✅ | 终端列数 |
| rows | number | ✅ | 终端行数 |
| cwd | string | ❌ | 工作目录（默认 `/workspace`） |

**成功响应：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": {
    "sessionId": "pty-session-uuid",
    "pid": 12345
  }
}
```

> **注意**: PTY 功能需要环境变量 `PTY_ENABLED=true` 才能启用。默认使用 `/bin/bash --login`，终端类型 `xterm-256color`。

#### 写入 PTY

**type**: `pty_write`

**请求体：**

```json
{
  "type": "pty_write",
  "requestId": "req-uuid",
  "payload": {
    "sessionId": "pty-session-uuid",
    "data": "ls -la\n"
  }
}
```

#### 调整 PTY 大小

**type**: `pty_resize`

**请求体：**

```json
{
  "type": "pty_resize",
  "requestId": "req-uuid",
  "payload": {
    "sessionId": "pty-session-uuid",
    "cols": 120,
    "rows": 40
  }
}
```

#### 销毁 PTY

**type**: `pty_destroy`

**请求体：**

```json
{
  "type": "pty_destroy",
  "requestId": "req-uuid",
  "payload": {
    "sessionId": "pty-session-uuid"
  }
}
```

---

### 22.5 文件操作

#### 读取文件

**type**: `file_read`

**请求体：**

```json
{
  "type": "file_read",
  "requestId": "req-uuid",
  "payload": {
    "path": "/workspace/src/index.ts",
    "encoding": "utf-8"
  }
}
```

| payload 字段 | 类型 | 必填 | 说明 |
|-------------|------|------|------|
| path | string | ✅ | 文件路径（必须在 `/workspace` 内） |
| encoding | string | ❌ | 编码（默认 utf-8） |

**成功响应：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": {
    "content": "console.log('Hello, World!');",
    "encoding": "utf-8"
  }
}
```

> **安全限制**: 所有文件操作路径必须经过 `isPathSafe()` 校验，确保在 `/workspace` 目录内。

#### 写入文件

**type**: `file_write`

**请求体：**

```json
{
  "type": "file_write",
  "requestId": "req-uuid",
  "payload": {
    "path": "/workspace/src/index.ts",
    "content": "console.log('Updated!');",
    "encoding": "utf-8"
  }
}
```

#### 列出目录

**type**: `file_list`

**请求体：**

```json
{
  "type": "file_list",
  "requestId": "req-uuid",
  "payload": {
    "path": "/workspace/src"
  }
}
```

**成功响应：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": {
    "items": [
      {
        "name": "index.ts",
        "path": "/workspace/src/index.ts",
        "isDirectory": false,
        "size": 1024,
        "modifiedAt": "2026-04-28T00:00:00.000Z"
      }
    ]
  }
}
```

---

### 22.6 Agent 工具执行

**type**: `tool_exec`

**请求体：**

```json
{
  "type": "tool_exec",
  "requestId": "req-uuid",
  "payload": {
    "toolName": "Bash",
    "toolInput": {
      "command": "npm test"
    },
    "cwd": "/workspace",
    "timeout": 60000
  }
}
```

**支持的工具：**

| 工具名 | 功能 | 特殊参数 |
|--------|------|---------|
| `Bash` / `Exec` | 执行命令 | `command`, `cwd` |
| `FileRead` | 读取文件 | `path`, `offset`, `limit` |
| `FileWrite` | 写入文件 | `path`, `content` |
| `FileEdit` | 编辑文件 | `path`, `old_string`, `new_string` |
| `Glob` | 文件搜索 | `pattern`（忽略 node_modules/.git） |
| `Grep` | 内容搜索 | `pattern`, `output_mode`（files_with_matches / content） |

**成功响应：**

```json
{
  "requestId": "req-uuid",
  "success": true,
  "data": {
    "result": "测试通过\n3 tests passed",
    "output": "测试通过\n3 tests passed"
  }
}
```

---

### 22.7 Worker WebSocket PTY

```
WS /internal/pty
```

**连接头：**

```
X-Master-Token: <master_internal_token>
X-User-Id: <user_id>
```

**客户端 → Worker 消息：**

| type | payload | 说明 |
|------|---------|------|
| `create` | `{ cols, rows, cwd? }` | 创建 PTY 会话 |
| `input` | `{ sessionId, data }` | 输入数据到 PTY |
| `resize` | `{ sessionId, cols, rows }` | 调整 PTY 大小 |
| `destroy` | `{ sessionId }` | 销毁 PTY 会话 |
| `exec` | `{ command, cwd? }` | 执行命令 |

**Worker → 客户端消息：**

| type | payload | 说明 |
|------|---------|------|
| `created` | `{ sessionId, pid }` | PTY 创建成功 |
| `output` | `{ sessionId, data }` | PTY 输出数据（持续推送） |
| `destroyed` | `{ sessionId }` | PTY 已销毁 |
| `exec_result` | `{ stdout, stderr, exitCode }` | 命令执行结果 |
| `exit` | `{ sessionId, exitCode }` | 进程退出 |
| `error` | `{ message, sessionId? }` | 错误消息 |

**连接失败关闭码：**

| 关闭码 | 说明 |
|--------|------|
| 4401 | Master Token 无效 |
| 4400 | 缺少 User ID |

---

## 23. 数据类型定义

**类型文件**: `shared/types/index.ts`, `shared/types/worker.ts`, `shared/types/errors.ts`

### 23.1 用户与认证类型

```typescript
interface User {
  id: string
  username: string
  email: string
  tier: UserTier
  createdAt: string
  updatedAt: string
}

type UserTier = 'free' | 'pro' | 'enterprise'
```

### 23.2 会话与消息类型

```typescript
interface Session {
  id: string
  userId: string
  title: string
  model?: string
  isPinned: boolean
  messages: Message[]
  createdAt: string
  updatedAt: string
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  attachments?: Attachment[]
}

interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
  path: string
}
```

### 23.3 容器与工作空间类型

```typescript
interface ContainerInfo {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  hostPort?: number
  userId?: string
}

interface WorkspaceInfo {
  userId: string
  path: string
  quota: WorkspaceQuota
}

interface WorkspaceQuota {
  maxStorageMB: number
  maxSessions: number
  maxPtyProcesses: number
}

interface WorkerConfig {
  port: number
  workspaceDir: string
  maxMemoryMB: number
  timeout: number
}
```

### 23.4 Worker 请求类型

```typescript
type WorkerRequestType = 
  | 'exec' | 'pty_create' | 'pty_write' | 'pty_resize' | 'pty_destroy'
  | 'file_read' | 'file_write' | 'file_list' | 'tool_exec'

interface WorkerBaseRequest {
  requestId: string
  userId: string
  type: WorkerRequestType
}

interface WorkerExecRequest extends WorkerBaseRequest {
  type: 'exec'
  command: string
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}

interface WorkerPTYCreateRequest extends WorkerBaseRequest {
  type: 'pty_create'
  cols: number
  rows: number
  cwd?: string
}

interface WorkerFileReadRequest extends WorkerBaseRequest {
  type: 'file_read'
  path: string
  encoding?: string
}
```

### 23.5 Worker 响应类型

```typescript
interface WorkerBaseResponse {
  requestId: string
  success: boolean
  data?: any
  error?: { code: string; message: string }
}

interface WorkerExecResponse extends WorkerBaseResponse {
  data: {
    stdout: string
    stderr: string
    exitCode: number
    duration: number
  }
}

interface WorkerPTYCreateResponse extends WorkerBaseResponse {
  data: {
    sessionId: string
    pid: number
  }
}

interface WorkerHealthResponse {
  status: string
  role: string
  uptime: number
  ptySessions: {
    total: number
    byUser: Record<string, number>
  }
}
```

### 23.6 WebSocket PTY 消息类型

```typescript
type WorkerWebSocketMessageType = 
  | 'create' | 'created' | 'input' | 'output' | 'resize'
  | 'destroy' | 'destroyed' | 'exec' | 'exec_result' | 'exit' | 'error'

interface WorkerWebSocketBaseMessage {
  type: WorkerWebSocketMessageType
  requestId?: string
  userId?: string
}

interface WorkerWebSocketCreateMessage extends WorkerWebSocketBaseMessage {
  type: 'create'
  cols: number
  rows: number
  cwd?: string
}

interface WorkerWebSocketOutputMessage extends WorkerWebSocketBaseMessage {
  type: 'output'
  sessionId: string
  data: string
}
```

---

## 24. 错误码体系

**错误码文件**: `shared/types/errors.ts`

### 24.1 通用错误码 (CommonErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| UNKNOWN | 10000 | 未知错误 |
| INTERNAL_SERVER | 10001 | 服务器内部错误 |
| UNAUTHORIZED | 10002 | 未授权 |
| FORBIDDEN | 10003 | 禁止访问 |
| NOT_FOUND | 10004 | 资源不存在 |
| INVALID_PARAMS | 10005 | 参数无效 |
| RATE_LIMITED | 10006 | 请求频率超限 |
| CONFLICT | 10007 | 资源冲突 |
| SERVICE_UNAVAILABLE | 10008 | 服务不可用 |
| TIMEOUT | 10009 | 请求超时 |
| BAD_GATEWAY | 10010 | 网关错误 |
| PAYLOAD_TOO_LARGE | 10011 | 请求体过大 |

### 24.2 认证错误码 (AuthErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| INVALID_TOKEN | 10100 | Token 无效 |
| TOKEN_EXPIRED | 10101 | Token 已过期 |
| NO_TOKEN | 10102 | 缺少 Token |
| INVALID_CREDENTIALS | 10103 | 凭据无效 |
| USER_NOT_FOUND | 10104 | 用户不存在 |
| USER_ALREADY_EXISTS | 10105 | 用户已存在 |
| WEAK_PASSWORD | 10106 | 密码强度不足 |
| EMAIL_NOT_VERIFIED | 10107 | 邮箱未验证 |
| VERIFICATION_CODE_INVALID | 10108 | 验证码无效 |
| VERIFICATION_CODE_EXPIRED | 10109 | 验证码已过期 |

### 24.3 会话错误码 (SessionErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| SESSION_NOT_FOUND | 10200 | 会话不存在 |
| SESSION_EXPIRED | 10201 | 会话已过期 |
| SESSION_ENDED | 10202 | 会话已结束 |
| SESSION_LIMIT_EXCEEDED | 10203 | 会话数量超限 |
| MESSAGE_NOT_FOUND | 10204 | 消息不存在 |
| INVALID_MESSAGE_ROLE | 10205 | 消息角色无效 |
| SESSION_ACCESS_DENIED | 10206 | 会话访问被拒绝 |

### 24.4 工具错误码 (ToolErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| TOOL_NOT_FOUND | 10300 | 工具不存在 |
| INVALID_TOOL_INPUT | 10301 | 工具输入无效 |
| TOOL_EXECUTION_FAILED | 10302 | 工具执行失败 |
| TOOL_TIMEOUT | 10303 | 工具执行超时 |
| TOOL_DISABLED | 10304 | 工具已禁用 |
| TOOL_PERMISSION_DENIED | 10305 | 工具权限不足 |
| TOOL_RATE_LIMITED | 10306 | 工具调用频率超限 |
| TOOL_VALIDATION_FAILED | 10307 | 工具验证失败 |

### 24.5 Agent 错误码 (AgentErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| AGENT_NOT_FOUND | 10400 | Agent 不存在 |
| AGENT_EXECUTION_FAILED | 10401 | Agent 执行失败 |
| AGENT_TIMEOUT | 10402 | Agent 执行超时 |
| AGENT_INTERRUPTED | 10403 | Agent 被中断 |
| AGENT_LIMIT_EXCEEDED | 10404 | Agent 数量超限 |
| AGENT_FORK_FAILED | 10405 | Agent Fork 失败 |
| AGENT_COMMUNICATION_FAILED | 10406 | Agent 通信失败 |

### 24.6 工作目录错误码 (WorkdirErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| FILE_NOT_FOUND | 10500 | 文件不存在 |
| UNSAFE_PATH | 10501 | 不安全路径 |
| READ_FILE_FAILED | 10502 | 读取文件失败 |
| WRITE_FILE_FAILED | 10503 | 写入文件失败 |
| DELETE_FILE_FAILED | 10504 | 删除文件失败 |
| DIRECTORY_NOT_FOUND | 10505 | 目录不存在 |
| FILE_TOO_LARGE | 10506 | 文件过大 |
| PERMISSION_DENIED | 10507 | 权限不足 |
| PATH_TRAVERSAL_DETECTED | 10508 | 路径遍历攻击检测 |

### 24.7 PTY 错误码 (PTYErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| PTY_NOT_FOUND | 10600 | PTY 会话不存在 |
| PTY_CREATE_FAILED | 10601 | PTY 创建失败 |
| PTY_LIMIT_EXCEEDED | 10602 | PTY 数量超限 |
| PTY_DISABLED | 10603 | PTY 功能已禁用 |
| PTY_WRITE_FAILED | 10604 | PTY 写入失败 |
| PTY_RESIZE_FAILED | 10605 | PTY 调整大小失败 |
| PTY_DESTROY_FAILED | 10606 | PTY 销毁失败 |

### 24.8 MCP 错误码 (MCPErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| MCP_SERVER_NOT_FOUND | 10700 | MCP 服务器不存在 |
| MCP_CONNECTION_FAILED | 10701 | MCP 连接失败 |
| MCP_TOOL_NOT_FOUND | 10702 | MCP 工具不存在 |
| MCP_TOOL_EXECUTION_FAILED | 10703 | MCP 工具执行失败 |
| MCP_SERVER_ALREADY_EXISTS | 10704 | MCP 服务器已存在 |
| MCP_INVALID_CONFIG | 10705 | MCP 配置无效 |
| MCP_TIMEOUT | 10706 | MCP 操作超时 |

### 24.9 Worker 错误码 (WorkerErrorCode)

| 错误码 | 数值 | 说明 |
|--------|------|------|
| WORKER_UNAVAILABLE | 10800 | Worker 不可用 |
| WORKER_CONNECTION_FAILED | 10801 | Worker 连接失败 |
| WORKER_UNAUTHORIZED | 10802 | Worker 认证失败 |
| WORKER_TIMEOUT | 10803 | Worker 操作超时 |
| WORKER_EXEC_FAILED | 10804 | Worker 执行失败 |
| WORKER_HEALTH_CHECK_FAILED | 10805 | Worker 健康检查失败 |
| WORKER_NOT_ASSIGNED | 10806 | Worker 未分配 |

### 24.10 错误详情接口

```typescript
interface ErrorDetails {
  code: ErrorCode
  message: string
  details?: any
  requestId?: string
  timestamp?: string
}

function createErrorDetails(code: ErrorCode, message: string, details?: any): ErrorDetails
```

---

## 25. 安全规范

### 25.1 架构安全铁律

| 规则 | 说明 |
|------|------|
| Master 禁区 | 禁止在 Master 执行用户命令、创建 PTY、直接读写沙盒文件 |
| Worker 禁区 | 禁止 Worker 连接数据库、处理用户鉴权，Worker 必须无状态 |
| 通信安全 | Master 与 Worker 通信必须携带 `X-Master-Token` |
| 网络隔离 | Worker 必须网络隔离，无法访问 MySQL |

### 25.2 路径安全

所有 Worker 文件操作必须经过 `isPathSafe()` 校验：

```typescript
function isPathSafe(path: string, allowedBaseDir: string): boolean
```

- 确保路径在允许的基础目录（`/workspace`）内
- 阻止 `..` 路径遍历攻击
- 自动清理反斜杠和多余分隔符

### 25.3 命令安全

Worker 沙箱引擎阻止以下破坏性命令：

| 阻止模式 | 说明 |
|----------|------|
| `shutdown\|reboot\|halt` | 关机/重启 |
| `mkfs` | 格式化 |
| `rm -rf /` | 删除根目录 |
| `dd ... of=/dev/` | 破坏性写入设备 |
| `:(){ :|:& };:` | Fork bomb |

### 25.4 认证层级

| 层级 | 说明 | 适用范围 |
|------|------|---------|
| 无认证 | 公开端点 | 健康检查、分享获取 |
| JWT 认证 | 标准 Bearer Token | 大部分 API |
| 管理员权限 | JWT + 管理员角色 | 监控、容器管理、用户等级 |
| Master Token | 内部通信 Token | Worker Internal API |

### 25.5 资源限制

```typescript
const RESOURCE_LIMITS = {
  worker: {
    MAX_MEMORY_MB: 256,
    MAX_THREADS: 2,
    MAX_OPEN_FILES: 100,
    MAX_PROCESSES: 50
  }
}

const DEFAULT_TIMEOUTS = {
  EXEC: 30000,           // 命令执行超时 30s
  PTY_IDLE: 300000,      // PTY 空闲超时 5min
  WORKER_HEALTH_CHECK: 15000  // 健康检查间隔 15s
}
```

### 25.6 常量定义

```typescript
const DEFAULT_WORKER_PORT = 4000
const DEFAULT_MASTER_PORT = 3000
const DEFAULT_WORKSPACE_DIR = '/workspace'

const INTERNAL_API_PATHS = {
  exec: '/internal/exec',
  pty_create: '/internal/pty/create',
  pty_write: '/internal/pty/write',
  pty_resize: '/internal/pty/resize',
  pty_destroy: '/internal/pty/destroy',
  file_read: '/internal/file/read',
  file_write: '/internal/file/write',
  file_list: '/internal/file/list',
  health: '/internal/health'
}
```

---

## 附录：httpServer.ts 直接定义的端点

在 `master/server/httpServer.ts` 中直接处理的路由：

| HTTP 方法 | 路径 | 说明 |
|-----------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/info` | 服务器信息 |
| GET | `/api/models` | 可用模型列表 |
| WS | `/ws` | WebSocket 连接 |

---

> **最后更新**: 2026-04-28  
> **维护者**: AI Assistant
