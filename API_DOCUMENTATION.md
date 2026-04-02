# Claude Code HAHA - 前后端 API 文档

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 技术栈](#2-技术栈)
- [3. 架构设计](#3-架构设计)
- [4. HTTP REST API](#4-http-rest-api)
- [5. WebSocket API](#5-websocket-api)
- [6. 数据库 Schema](#6-数据库-schema)
- [7. 前端 API 客户端](#7-前端-api-客户端)
- [8. 工具系统](#8-工具系统)
- [9. 认证与授权](#9-认证与授权)
- [10. 会话管理](#10-会话管理)

---

## 1. 项目概述

Claude Code HAHA 是一个集成了 AI 对话、工具执行、会话管理的 full-stack 应用。

### 项目结构

```
claude-code-haha/
├── server/                 # 后端服务 (Bun.js)
│   ├── src/
│   │   ├── db/            # 数据库相关
│   │   ├── models/        # 数据模型
│   │   ├── services/      # 业务服务层
│   │   ├── integration/   # 集成模块
│   │   └── index.ts       # 服务器入口
│   └── package.json
└── web/                   # 前端应用 (Vue 3 + TypeScript + Vite)
    ├── src/
    │   ├── api/           # API 客户端
    │   ├── components/    # Vue 组件
    │   ├── composables/   # 组合式函数
    │   ├── services/      # 服务层
    │   ├── stores/        # 状态管理 (Pinia)
    │   ├── types/         # TypeScript 类型定义
    │   ├── utils/         # 工具函数
    │   └── views/         # 页面视图
    └── package.json
```

---

## 2. 技术栈

### 后端技术栈
- **运行时**: Bun.js
- **框架**: 原生 Bun HTTP Server
- **数据库**: MySQL
- **认证**: JWT (JSON Web Token)
- **WebSocket**: 原生 WebSocket
- **AI 集成**: Anthropic SDK

### 前端技术栈
- **框架**: Vue 3 (Composition API)
- **构建工具**: Vite
- **语言**: TypeScript
- **状态管理**: Pinia
- **路由**: Vue Router
- **HTTP 客户端**: Axios
- **UI**: 自定义组件库

---

## 3. 架构设计

### 3.1 系统架构图

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Browser   │ ◄─────► │   Bun Server │ ◄─────► │   MySQL DB  │
│  (Vue 3)    │  WS/HTTP │  (REST API)  │         │             │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │ Anthropic AI │
                       │   Service    │
                       └──────────────┘
```

### 3.2 通信协议

#### HTTP REST API
- **基础 URL**: `/api`
- **认证方式**: Bearer Token (JWT)
- **响应格式**: 
  ```typescript
  interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: {
      code: string
      message: string
    }
  }
  ```

#### WebSocket API
- **端点**: `/ws`
- **协议**: 自定义消息协议
- **功能**: 实时通信、流式响应、RPC 调用

---

## 4. HTTP REST API

### 4.1 认证接口

#### 4.1.1 发送注册验证码

**端点**: `POST /api/auth/register/send-code`

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "验证码已发送到您的邮箱"
  }
}
```

**错误码**:
- `SEND_CODE_FAILED`: 发送验证码失败

---

#### 4.1.2 用户注册

**端点**: `POST /api/auth/register`

**请求体**:
```json
{
  "email": "user@example.com",
  "username": "john_doe",
  "password": "secure_password",
  "code": "123456"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt_token_here",
    "tokenType": "Bearer",
    "userId": "uuid",
    "username": "john_doe",
    "email": "user@example.com",
    "isAdmin": false,
    "avatar": "/avatars/default.png"
  }
}
```

**错误码**:
- `REGISTER_FAILED`: 注册失败

---

#### 4.1.3 用户登录

**端点**: `POST /api/auth/login`

**请求体**:
```json
{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**响应**: 同用户注册响应

**错误码**:
- `LOGIN_FAILED`: 登录失败

---

#### 4.1.4 发送重置密码验证码

**端点**: `POST /api/auth/forgot-password/send-code`

**请求体**:
```json
{
  "email": "user@example.com"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "验证码已发送到您的邮箱"
  }
}
```

---

#### 4.1.5 重置密码

**端点**: `POST /api/auth/forgot-password`

**请求体**:
```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "new_secure_password"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "密码重置成功"
  }
}
```

---

#### 4.1.6 获取当前用户信息

**端点**: `GET /api/auth/me`

**Headers**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "john_doe",
    "email": "user@example.com",
    "avatar": "/avatars/default.png",
    "isActive": true,
    "isAdmin": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "lastLogin": "2024-01-01T00:00:00Z"
  }
}
```

**错误码**:
- `UNAUTHORIZED`: 未授权
- `USER_NOT_FOUND`: 用户不存在

---

#### 4.1.7 GitHub OAuth 登录

**端点**: `GET /api/auth/github`

**响应**: 302 重定向到 GitHub OAuth 授权页面

---

#### 4.1.8 GitHub OAuth 回调

**端点**: `GET /api/auth/github/callback`

**查询参数**:
- `code`: OAuth 授权码

**响应**: 302 重定向到前端，带上 token 和用户信息

---

### 4.2 会话管理接口

#### 4.2.1 获取用户会话列表

**端点**: `GET /api/sessions`

**Headers**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "uuid",
        "userId": "uuid",
        "title": "对话标题",
        "model": "qwen-plus",
        "isPinned": false,
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z",
        "messageCount": 10
      }
    ]
  }
}
```

---

#### 4.2.2 创建新会话

**端点**: `POST /api/sessions`

**Headers**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "title": "新对话",
  "model": "qwen-plus"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "title": "新对话",
    "model": "qwen-plus",
    "isPinned": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

---

#### 4.2.3 加载会话详情

**端点**: `GET /api/sessions/:id`

**Headers**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "session": { ... },
    "messages": [
      {
        "id": "uuid",
        "sessionId": "uuid",
        "role": "user",
        "content": "用户消息内容",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "toolCalls": [
      {
        "id": "uuid",
        "messageId": "uuid",
        "sessionId": "uuid",
        "toolName": "Bash",
        "toolInput": { "command": "ls -la" },
        "toolOutput": { "stdout": "...", "stderr": "" },
        "status": "completed",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

---

#### 4.2.4 更新会话信息

**端点**: `PUT /api/sessions/:id`

**Headers**:
```
Authorization: Bearer <token>
```

**请求体**:
```json
{
  "title": "新标题",
  "model": "qwen-turbo",
  "isPinned": true
}
```

**响应**: 返回更新后的会话对象

---

#### 4.2.5 删除会话

**端点**: `DELETE /api/sessions/:id`

**Headers**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "Session deleted"
  }
}
```

---

#### 4.2.6 清空会话消息

**端点**: `POST /api/sessions/:id/clear`

**Headers**:
```
Authorization: Bearer <token>
```

**响应**:
```json
{
  "success": true,
  "data": {
    "message": "Session cleared"
  }
}
```

---

### 4.3 信息查询接口

#### 4.3.1 健康检查

**端点**: `GET /api/health`

**响应**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "timestamp": "2024-01-01T00:00:00Z",
    "uptime": 3600,
    "dbConnected": true,
    "connections": 10
  }
}
```

---

#### 4.3.2 可用模型列表

**端点**: `GET /api/models`

**响应**:
```json
{
  "success": true,
  "data": {
    "models": [
      {
        "id": "qwen-plus",
        "name": "通义千问 Plus",
        "provider": "aliyun",
        "description": "最适合编程和复杂推理"
      },
      {
        "id": "qwen-turbo",
        "name": "通义千问 Turbo",
        "provider": "aliyun",
        "description": "快速响应，适合简单任务"
      },
      {
        "id": "qwen-max",
        "name": "通义千问 Max",
        "provider": "aliyun",
        "description": "最强能力，适合最复杂任务"
      },
      {
        "id": "claude-3-5-sonnet-20241022",
        "name": "Claude 3.5 Sonnet",
        "provider": "anthropic",
        "description": "Anthropic 最强编程模型"
      },
      {
        "id": "claude-3-opus-20240229",
        "name": "Claude 3 Opus",
        "provider": "anthropic",
        "description": "最通用，最强推理能力"
      }
    ]
  }
}
```

---

#### 4.3.3 可用工具列表

**端点**: `GET /api/tools`

**响应**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "Bash",
        "description": "Execute shell commands in the terminal",
        "inputSchema": {
          "type": "object",
          "properties": {
            "command": { "type": "string", "description": "Shell command to execute" },
            "cwd": { "type": "string", "description": "Working directory" },
            "timeout": { "type": "number", "description": "Timeout in milliseconds" },
            "env": { "type": "object", "description": "Environment variables" }
          },
          "required": ["command"]
        },
        "category": "shell"
      }
      // ... 其他工具
    ]
  }
}
```

---

#### 4.3.4 MCP 服务器列表

**端点**: `GET /api/mcp/servers`

**响应**:
```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "id": "server_id",
        "name": "Server Name",
        "type": "stdio",
        "command": "command",
        "args": [],
        "enabled": true,
        "status": "connected"
      }
    ]
  }
}
```

---

#### 4.3.5 命令列表

**端点**: `GET /api/commands`

**响应**:
```json
{
  "success": true,
  "data": {
    "commands": [
      {
        "name": "help",
        "description": "显示帮助信息",
        "usage": "/help"
      }
    ]
  }
}
```

---

#### 4.3.6 服务器信息

**端点**: `GET /api/info`

**响应**:
```json
{
  "success": true,
  "data": {
    "name": "Claude Code HAHA",
    "version": "1.0.0",
    "description": "Deep React Integration Server",
    "features": {
      "tools": 15,
      "models": 5,
      "websocket": true,
      "mcp": true,
      "auth": true
    },
    "endpoints": {
      "api": "http://localhost:3000/api",
      "websocket": "ws://localhost:3000/ws"
    }
  }
}
```

---

## 5. WebSocket API

### 5.1 连接建立

**端点**: `ws://localhost:3000/ws`

**连接后消息**:
```json
{
  "type": "connected",
  "connectionId": "uuid",
  "timestamp": 1234567890
}
```

### 5.2 客户端 -> 服务端消息类型

#### 5.2.1 注册/登录

**注册**:
```json
{
  "type": "register",
  "userId": "uuid",
  "username": "john_doe"
}
```

**登录**:
```json
{
  "type": "login",
  "token": "jwt_token"
}
```

**响应**:
```json
{
  "type": "registered",
  "userId": "uuid",
  "username": "john_doe"
}
```

---

#### 5.2.2 创建会话

**消息**:
```json
{
  "type": "create_session",
  "title": "新对话",
  "model": "qwen-plus",
  "force": false
}
```

**响应**:
```json
{
  "type": "session_created",
  "session": {
    "id": "uuid",
    "title": "新对话",
    "model": "qwen-plus"
  }
}
```

---

#### 5.2.3 加载会话

**消息**:
```json
{
  "type": "load_session",
  "sessionId": "uuid"
}
```

**响应**:
```json
{
  "type": "session_loaded",
  "session": { ... },
  "messages": [...],
  "toolCalls": [...]
}
```

---

#### 5.2.4 列出会话

**消息**:
```json
{
  "type": "list_sessions"
}
```

**响应**:
```json
{
  "type": "session_list",
  "sessions": [...]
}
```

---

#### 5.2.5 发送用户消息

**消息**:
```json
{
  "type": "user_message",
  "content": "用户消息内容",
  "sessionId": "uuid",
  "model": "qwen-plus"
}
```

**流式响应事件**:
```json
{
  "type": "message_start",
  "iteration": 1,
  "sessionId": "uuid"
}
```

```json
{
  "type": "content_block_delta",
  "text": "增量文本",
  "sessionId": "uuid"
}
```

```json
{
  "type": "tool_use",
  "id": "tool_id",
  "name": "Bash",
  "sessionId": "uuid"
}
```

```json
{
  "type": "tool_input_delta",
  "id": "tool_id",
  "partial_json": "{\"command\": \"ls",
  "sessionId": "uuid"
}
```

```json
{
  "type": "tool_start",
  "name": "Bash",
  "input": { "command": "ls -la" },
  "sessionId": "uuid"
}
```

```json
{
  "type": "message_stop",
  "stop_reason": "end_turn",
  "iteration": 1,
  "sessionId": "uuid"
}
```

---

#### 5.2.6 删除会话

**消息**:
```json
{
  "type": "delete_session",
  "sessionId": "uuid"
}
```

**响应**:
```json
{
  "type": "session_deleted",
  "sessionId": "uuid"
}
```

---

#### 5.2.7 重命名会话

**消息**:
```json
{
  "type": "rename_session",
  "sessionId": "uuid",
  "title": "新标题"
}
```

**响应**:
```json
{
  "type": "session_renamed",
  "sessionId": "uuid",
  "title": "新标题"
}
```

---

#### 5.2.8 清空会话

**消息**:
```json
{
  "type": "clear_session",
  "sessionId": "uuid"
}
```

**响应**:
```json
{
  "type": "session_cleared",
  "sessionId": "uuid"
}
```

---

#### 5.2.9 RPC 调用

**消息**:
```json
{
  "type": "rpc_call",
  "id": "unique_id",
  "method": "tool.execute",
  "params": {
    "name": "Bash",
    "input": { "command": "ls -la" }
  }
}
```

**响应**:
```json
{
  "type": "rpc_response",
  "id": "unique_id",
  "success": true,
  "result": { ... }
}
```

---

#### 5.2.10 心跳检测

**请求**:
```json
{
  "type": "ping"
}
```

**响应**:
```json
{
  "type": "pong",
  "timestamp": 1234567890
}
```

---

#### 5.2.11 获取工具列表

**消息**:
```json
{
  "type": "get_tools"
}
```

**响应**:
```json
{
  "type": "tools",
  "tools": [...]
}
```

---

#### 5.2.12 获取模型列表

**消息**:
```json
{
  "type": "get_models"
}
```

**响应**:
```json
{
  "type": "models",
  "models": [...]
}
```

---

#### 5.2.13 执行命令

**消息**:
```json
{
  "type": "execute_command",
  "command": "/help"
}
```

**响应**:
```json
{
  "type": "command_result",
  "result": { ... }
}
```

---

#### 5.2.14 获取状态

**消息**:
```json
{
  "type": "get_status"
}
```

**响应**:
```json
{
  "type": "status",
  "uptime": 3600,
  "memory": { ... },
  "connections": 10,
  "sessions": 5,
  "models": [...]
}
```

---

### 5.3 服务端 -> 客户端事件类型

#### 5.3.1 流式消息事件

- `message_start`: 消息流开始
- `content_block_delta`: 内容增量更新
- `message_stop`: 消息流结束
- `message_delta`: 消息元数据更新

#### 5.3.2 工具调用事件

- `tool_use`: 工具调用开始
- `tool_input_delta`: 工具输入增量
- `tool_start`: 工具执行开始
- `tool_end`: 工具执行结束
- `tool_error`: 工具执行错误
- `tool_progress`: 工具执行进度

#### 5.3.3 会话事件

- `session_created`: 会话已创建
- `session_loaded`: 会话已加载
- `session_list`: 会话列表
- `session_deleted`: 会话已删除
- `session_renamed`: 会话已重命名
- `session_cleared`: 会话已清空

#### 5.3.4 系统事件

- `connected`: 连接已建立
- `registered`: 用户已注册
- `logged_in`: 用户已登录
- `error`: 错误信息
- `max_iterations_reached`: 达到最大迭代次数
- `conversation_end`: 对话结束

---

### 5.4 RPC 方法列表

#### 系统方法

- `system.ping`: Ping 服务器
- `system.info`: 获取服务器信息
- `system.listMethods`: 列出所有 RPC 方法

#### 工具执行方法

- `tool.execute`: 执行工具
- `tool.list`: 列出可用工具
- `tool.history`: 获取工具执行历史

#### 会话管理方法

- `session.create`: 创建会话
- `session.list`: 列出用户会话
- `session.load`: 加载会话
- `session.delete`: 删除会话

#### 认证方法

- `auth.register`: 用户注册
- `auth.login`: 用户登录
- `auth.sendCode`: 发送验证码

#### 模型方法

- `model.list`: 列出可用模型

#### MCP 方法

- `mcp.listServers`: 列出 MCP 服务器
- `mcp.getStatus`: 获取 MCP 状态

#### 命令方法

- `command.list`: 列出可用命令
- `command.execute`: 执行命令

---

## 6. 数据库 Schema

### 6.1 用户表 (users)

```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(120) UNIQUE,
  password_hash VARCHAR(255),
  github_id VARCHAR(50) UNIQUE,
  avatar VARCHAR(255) DEFAULT '/avatars/default.png',
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_email (email),
  INDEX idx_username (username),
  INDEX idx_github_id (github_id)
);
```

### 6.2 验证码表 (verification_codes)

```sql
CREATE TABLE verification_codes (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(120) NOT NULL,
  code VARCHAR(6) NOT NULL,
  usage_type VARCHAR(20) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_code (code)
);
```

### 6.3 会话表 (sessions)

```sql
CREATE TABLE sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) DEFAULT '新对话',
  model VARCHAR(50) DEFAULT 'qwen-plus',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_is_pinned (is_pinned)
);
```

### 6.4 消息表 (messages)

```sql
CREATE TABLE messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_messages_session_id (session_id)
);
```

### 6.5 工具调用表 (tool_calls)

```sql
CREATE TABLE tool_calls (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(36) NOT NULL,
  tool_name VARCHAR(100) NOT NULL,
  tool_input JSON,
  tool_output JSON,
  status ENUM('pending', 'executing', 'completed', 'error') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  INDEX idx_tool_calls_session_id (session_id),
  INDEX idx_tool_calls_message_id (message_id)
);
```

---

## 7. 前端 API 客户端

### 7.1 API 客户端配置

**文件**: `web/src/api/client.ts`

```typescript
// 基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// Axios 实例配置
{
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
}

// 请求拦截器
// - 自动添加 Authorization header
// - Token 从 localStorage 获取

// 响应拦截器
// - 统一错误处理
// - 401 自动跳转登录
// - 自动重试机制 (最多 3 次)
```

### 7.2 API 模块

#### 7.2.1 认证 API (authApi.ts)

```typescript
// 发送注册验证码
authApi.sendRegisterCode(email: string)

// 用户注册
authApi.register(request: RegisterRequest)

// 用户登录
authApi.login(request: LoginRequest)

// 发送重置密码验证码
authApi.sendForgotPasswordCode(email: string)

// 重置密码
authApi.resetPassword(request: ResetPasswordRequest)

// 获取当前用户
authApi.getCurrentUser()

// 退出登录
authApi.logout()
```

#### 7.2.2 会话 API (sessionApi.ts)

```typescript
// 创建会话
sessionApi.createSession(request?: CreateSessionRequest)

// 获取会话列表
sessionApi.listSessions()

// 加载会话详情
sessionApi.loadSession(sessionId: string)

// 更新会话
sessionApi.updateSession(sessionId: string, updates: Partial<Session>)

// 重命名会话
sessionApi.renameSession(sessionId: string, title: string)

// 删除会话
sessionApi.deleteSession(sessionId: string)

// 清空会话
sessionApi.clearSession(sessionId: string)

// 导出会话
sessionApi.exportSession(sessionId: string, format: string)
```

#### 7.2.3 工具 API (toolApi.ts)

```typescript
// 获取工具列表
toolApi.listTools()

// 按分类获取工具
toolApi.getToolsByCategory(category: string)

// 获取执行历史
toolApi.getHistory(limit: number)

// 执行工具
toolApi.execute(name: string, input: Record<string, unknown>)
```

#### 7.2.4 模型 API (modelApi.ts)

```typescript
// 获取模型列表
modelApi.listModels()

// 获取默认模型
modelApi.getDefaultModel()

// 按提供商获取模型
modelApi.getModelsByProvider(provider: string)
```

#### 7.2.5 MCP API (mcpApi.ts)

```typescript
// 获取服务器列表
mcpApi.listServers()

// 创建服务器
mcpApi.createServer(request: CreateMCPServerRequest)

// 更新服务器
mcpApi.updateServer(serverId: string, updates: Partial<CreateMCPServerRequest>)

// 删除服务器
mcpApi.deleteServer(serverId: string)

// 切换服务器状态
mcpApi.toggleServer(serverId: string, enabled: boolean)

// 测试连接
mcpApi.testConnection(serverId: string)

// 获取服务器工具
mcpApi.getServerTools(serverId: string)
```

---

### 7.3 WebSocket 客户端

**文件**: `web/src/composables/useWebSocket.ts`

#### 7.3.1 核心功能

```typescript
// 建立连接
wsClient.connect(token?: string): Promise<void>

// 断开连接
wsClient.disconnect(): void

// 发送消息
wsClient.send(message: WSMessage): boolean

// RPC 调用
wsClient.callRPC<T>(method: string, params?: Record<string, unknown>, timeout?: number): Promise<T>

// 事件订阅
wsClient.on(event: string, callback: Function): () => void

// 取消订阅
wsClient.off(event: string, callback: Function): void

// 获取状态
wsClient.getState(): WebSocketState
```

#### 7.3.2 便捷方法

```typescript
// 创建会话
wsClient.createSession(title?: string, model?: string, force?: boolean): void

// 加载会话
wsClient.loadSession(sessionId: string): void

// 列出会话
wsClient.listSessions(): void

// 发送消息
wsClient.sendMessage(content: string, model?: string): void

// 删除会话
wsClient.deleteSession(sessionId: string): void

// 重命名会话
wsClient.renameSession(sessionId: string, title: string): void

// 清空会话
wsClient.clearSession(sessionId?: string): void

// 获取工具
wsClient.getTools(): void

// 获取模型
wsClient.getModels(): void

// 执行命令
wsClient.executeCommand(command: string): void
```

#### 7.3.3 响应式状态

```typescript
// 连接状态
wsClient.status: Ref<ConnectionStatus>

// 是否已连接
wsClient.isConnected: Ref<boolean>

// 当前会话
wsClient.currentSession: Ref<Session | null>

// 消息列表
wsClient.messages: Ref<Message[]>

// 工具调用列表
wsClient.toolCalls: Ref<ToolCall[]>

// 连接错误
wsClient.connectionError: Ref<string | null>
```

---

## 8. 工具系统

### 8.1 内置工具列表

#### 文件工具

1. **FileRead** - 读取文件内容
2. **FileWrite** - 写入文件
3. **FileEdit** - 编辑文件 (查找替换)
4. **FileDelete** - 删除文件/目录
5. **FileRename** - 重命名/移动文件
6. **FileList** - 列出目录内容

#### 搜索工具

7. **Glob** - 文件模式匹配
8. **Grep** - 文本内容搜索

#### Shell 工具

9. **Bash** - 执行 Shell 命令
10. **Shell** - 交互式 Shell 会话

#### 网络工具

11. **WebSearch** - 网络搜索 (DuckDuckGo, Wikipedia, ArXiv)
12. **WebFetch** - 获取网页内容

#### 系统工具

13. **TodoWrite** - 创建/更新待办事项
14. **TaskCreate** - 创建任务
15. **TaskList** - 列出任务
16. **Config** - 配置管理
17. **AskUserQuestion** - 向用户提问

### 8.2 工具执行流程

```
1. AI 模型返回 tool_use 内容块
2. 前端发送 tool_use 事件
3. 服务端解析工具输入
4. 执行工具处理器
5. 返回工具执行结果
6. AI 模型根据结果继续对话
```

### 8.3 工具权限系统

```typescript
interface ToolPermissions {
  requiresAuth?: boolean      // 需要认证
  dangerous?: boolean         // 危险操作
  sandboxed?: boolean         // 沙箱执行
  confirmationRequired?: boolean  // 需要确认
}
```

---

## 9. 认证与授权

### 9.1 JWT Token

**Token 结构**:
```typescript
interface JWTPayload {
  userId: string
  username: string
  email: string
  isAdmin: boolean
  iat: number
  exp: number
}
```

**有效期**: 7 天

### 9.2 认证流程

#### 9.2.1 邮箱密码认证

1. 用户输入邮箱密码
2. 服务端验证凭据
3. 生成 JWT Token
4. 返回 Token 给客户端
5. 客户端存储到 localStorage
6. 后续请求携带 Authorization header

#### 9.2.2 GitHub OAuth 认证

1. 前端重定向到 `/api/auth/github`
2. 服务端返回 GitHub OAuth URL
3. 用户授权 GitHub
4. GitHub 回调到 `/api/auth/github/callback`
5. 服务端交换 access token
6. 获取 GitHub 用户信息
7. 创建/更新本地用户
8. 生成 JWT Token
9. 重定向回前端，带上 Token

### 9.3 验证码机制

**用途**:
- 用户注册
- 忘记密码

**特性**:
- 6 位数字
- 有效期 10 分钟
- 一次性使用
- 发送到用户邮箱

---

## 10. 会话管理

### 10.1 会话生命周期

```
创建 → 激活 → 消息交互 → 保存 → 加载/删除
```

### 10.2 会话状态

```typescript
interface Session {
  id: string
  userId: string
  title: string
  model: string
  isPinned?: boolean
  createdAt: Date
  updatedAt: Date
  messageCount?: number
}
```

### 10.3 消息格式

```typescript
interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
  toolCalls?: ToolCall[]
}
```

### 10.4 工具调用格式

```typescript
interface ToolCall {
  id: string
  messageId: string
  sessionId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput: Record<string, unknown> | null
  status: 'pending' | 'executing' | 'completed' | 'error'
  createdAt: Date
  completedAt?: Date
  duration?: number
  error?: string
}
```

### 10.5 会话管理器

**核心方法**:

```typescript
class SessionManager {
  // 创建会话
  createSession(userId: string, title?: string, model?: string, force?: boolean): Promise<Session>
  
  // 加载会话
  loadSession(sessionId: string): Promise<InMemorySession | null>
  
  // 获取用户会话列表
  getUserSessions(userId: string): Promise<Session[]>
  
  // 添加消息
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string, toolCalls?: ToolCall[]): void
  
  // 添加工具调用
  addToolCall(sessionId: string, toolCall: ToolCall): void
  
  // 删除会话
  deleteSession(sessionId: string): Promise<void>
  
  // 更新会话
  updateSession(sessionId: string, updates: object): Promise<Session | null>
  
  // 保存会话
  saveSession(sessionId: string): Promise<void>
  
  // 清空会话
  clearSession(sessionId: string): Promise<void>
}
```

### 10.6 内存管理

- 会话数据缓存在内存中
- 使用 Map 存储活跃会话
- 2 秒防抖自动保存到数据库
- 连接关闭时强制保存
- 服务器关闭时保存所有脏会话

---

## 附录

### A. 错误码列表

| 错误码 | 说明 |
|--------|------|
| UNAUTHORIZED | 未授权 |
| USER_NOT_FOUND | 用户不存在 |
| LOGIN_FAILED | 登录失败 |
| REGISTER_FAILED | 注册失败 |
| SEND_CODE_FAILED | 发送验证码失败 |
| RESET_PASSWORD_FAILED | 重置密码失败 |
| SESSION_NOT_FOUND | 会话不存在 |
| GET_SESSIONS_FAILED | 获取会话列表失败 |
| CREATE_SESSION_FAILED | 创建会话失败 |
| LOAD_SESSION_FAILED | 加载会话失败 |
| UPDATE_SESSION_FAILED | 更新会话失败 |
| DELETE_SESSION_FAILED | 删除会话失败 |
| CLEAR_SESSION_FAILED | 清空会话失败 |

### B. 环境变量

```bash
# 服务器配置
PORT=3000
WS_PORT=3001

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=claude_code_haha

# Anthropic API 配置
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_AUTH_TOKEN=your_auth_token
ANTHROPIC_BASE_URL=https://api.anthropic.com
API_TIMEOUT_MS=300000

# 前端配置
FRONTEND_URL=http://localhost:5173

# GitHub OAuth 配置
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# JWT 配置
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

### C. 开发环境设置

#### 后端

```bash
cd server
npm install
npm run dev
```

#### 前端

```bash
cd web
npm install
npm run dev
```

### D. 端口说明

- **3000**: HTTP API 端口
- **3001**: WebSocket 端口 (可选，默认使用 3000)
- **5173**: 前端开发服务器端口

---

**文档版本**: 1.0.0  
**最后更新**: 2024-01-01  
**维护者**: Claude Code HAHA Team
