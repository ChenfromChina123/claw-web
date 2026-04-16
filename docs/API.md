# Claw-Web 前后端 API 文档

> 文档生成日期：2026-04-16
> 基础架构：Master-Worker 分布式架构
> - Master 服务：端口 3000（控制层：鉴权、网关、会话管理、容器调度）
> - Worker 服务：端口 4000（执行层：沙箱、PTY 伪终端、文件操作）

---

## 目录

- [1. 认证相关 API](#1-认证相关-api)
- [2. 会话管理 API](#2-会话管理-api)
- [3. 工具管理 API](#3-工具管理-api)
- [4. Agent 相关 API](#4-agent-相关-api)
- [5. Agent 工作目录 API](#5-agent-工作目录-api)
- [6. MCP 服务 API](#6-mcp-服务-api)
- [7. 监控与诊断 API](#7-监控与诊断-api)
- [8. 工作区管理 API](#8-工作区管理-api)
- [9. 提示词模板 API](#9-提示词模板-api)
- [10. Skills 技能 API](#10-skills-技能-api)
- [11. 用户等级 API](#11-用户等级-api)
- [12. 快照管理 API](#12-快照管理-api)
- [13. WebSocket 端点](#13-websocket-端点)
- [14. Worker 内部 API](#14-worker-内部-api)
- [15. 前后端不一致项](#15-前后端不一致项)

---

## 1. 认证相关 API

**基础路径**: `/api/auth`

### 1.1 发送注册验证码
- **端点**: `POST /api/auth/register/send-code`
- **认证**: 无需认证
- **请求体**:
```json
{
  "email": "string"
}
```
- **响应**:
```json
{
  "message": "验证码已发送到您的邮箱"
}
```

### 1.2 用户注册
- **端点**: `POST /api/auth/register`
- **认证**: 无需认证
- **请求体**:
```json
{
  "email": "string",
  "username": "string",
  "password": "string",
  "code": "string"
}
```
- **响应**: 返回注册结果（包含用户信息和 token）

### 1.3 用户登录
- **端点**: `POST /api/auth/login`
- **认证**: 无需认证
- **请求体**:
```json
{
  "email": "string",
  "password": "string"
}
```
- **响应**: 返回登录结果（包含 token 和用户信息）

### 1.4 发送忘记密码验证码
- **端点**: `POST /api/auth/forgot-password/send-code`
- **认证**: 无需认证
- **请求体**:
```json
{
  "email": "string"
}
```

### 1.5 重置密码
- **端点**: `POST /api/auth/forgot-password`
- **认证**: 无需认证
- **请求体**:
```json
{
  "email": "string",
  "code": "string",
  "newPassword": "string"
}
```

### 1.6 获取当前用户信息
- **端点**: `GET /api/auth/me`
- **认证**: 需要 Bearer Token
- **响应**: 返回用户详细信息

### 1.7 GitHub OAuth 登录
- **端点**: `GET /api/auth/github`
- **认证**: 无需认证
- **行为**: 302 重定向到 GitHub 授权页面

### 1.8 GitHub OAuth 回调
- **端点**: `GET /api/auth/github/callback`
- **认证**: 无需认证
- **查询参数**: `code` (GitHub 授权码)
- **行为**: 302 重定向到前端 OAuth 回调页面，携带 token 和用户信息

---

## 2. 会话管理 API

**基础路径**: `/api/sessions`

### 2.1 获取用户会话列表
- **端点**: `GET /api/sessions`
- **认证**: 需要 Bearer Token
- **响应**:
```json
{
  "sessions": "Session[]"
}
```

### 2.2 创建新会话
- **端点**: `POST /api/sessions`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "title": "string (可选，默认: 新对话)",
  "model": "string (可选，默认: qwen-plus)"
}
```

### 2.3 获取会话详情
- **端点**: `GET /api/sessions/:id`
- **认证**: 需要 Bearer Token
- **响应**:
```json
{
  "session": "Session",
  "messages": "Message[]",
  "toolCalls": "ToolCall[]"
}
```

### 2.4 更新会话
- **端点**: `PUT /api/sessions/:id`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "title": "string (可选)",
  "model": "string (可选)",
  "isPinned": "boolean (可选)"
}
```

### 2.5 删除会话
- **端点**: `DELETE /api/sessions/:id`
- **认证**: 需要 Bearer Token

### 2.6 清空会话消息
- **端点**: `POST /api/sessions/:id/clear`
- **认证**: 需要 Bearer Token

### 2.7 获取会话已打开文件
- **端点**: `GET /api/sessions/:id/open-files`
- **认证**: 需要 Bearer Token
- **响应**:
```json
{
  "openFilePaths": "string[]",
  "activeFilePath": "string | null"
}
```

### 2.8 保存会话已打开文件
- **端点**: `PUT /api/sessions/:id/open-files`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "openFilePaths": "string[]",
  "activeFilePath": "string | null"
}
```

### 2.9 删除会话已打开文件记录
- **端点**: `DELETE /api/sessions/:id/open-files`
- **认证**: 需要 Bearer Token

### 2.10 搜索消息
- **端点**: `GET /api/sessions/messages/search`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `keyword` (可选)
  - `sessionId` (可选)
  - `startDate` (可选)
  - `endDate` (可选)
  - `limit` (可选)
  - `offset` (可选)
- **注意**: 至少需要提供一个搜索条件

---

## 3. 工具管理 API

**基础路径**: `/api/tools`

### 3.1 获取工具列表
- **端点**: `GET /api/tools`
- **查询参数**: `category` (可选，过滤类别)
- **响应**:
```json
{
  "tools": [
    {
      "name": "string",
      "description": "string",
      "inputSchema": "object",
      "category": "string",
      "permissions": "string[]"
    }
  ],
  "categories": ["file", "shell", "web", "system", "ai", "mcp"],
  "total": "number"
}
```

### 3.2 获取工具详情
- **端点**: `GET /api/tools/:name`

### 3.3 执行工具
- **端点**: `POST /api/tools/execute`
- **请求体**:
```json
{
  "toolName": "string",
  "toolInput": "object",
  "sessionId": "string (可选)",
  "context": "object (可选)"
}
```

### 3.4 获取工具执行历史
- **端点**: `GET /api/tools/history`
- **查询参数**: `limit` (默认: 50)

### 3.5 清空工具执行历史
- **端点**: `POST /api/tools/history/clear`

### 3.6 验证工具输入
- **端点**: `POST /api/tools/validate`
- **请求体**:
```json
{
  "toolName": "string",
  "toolInput": "object"
}
```

---

## 4. Agent 相关 API

**基础路径**: `/api/agents`

### 4.1 获取 Agent 列表
- **端点**: `GET /api/agents`
- **响应**: 返回所有可用 Agent 列表

### 4.2 获取 Agent 详情
- **端点**: `GET /api/agents/:type`
- **响应**: 返回特定 Agent 的详细信息

### 4.3 获取协调状态
- **端点**: `GET /api/agents/orchestration/state`

### 4.4 初始化多 Agent 协调
- **端点**: `POST /api/agents/orchestration/init`
- **请求体**:
```json
{
  "orchestratorType": "string (可选)",
  "subAgentTypes": "string[] (可选)"
}
```

### 4.5 执行 Agent 任务
- **端点**: `POST /api/agents/execute`
- **请求体**:
```json
{
  "agentId": "string",
  "sessionId": "string",
  "task": "string",
  "prompt": "string",
  "tools": "string[]",
  "maxTurns": "number (可选)"
}
```

### 4.6 中断 Agent
- **端点**: `POST /api/agents/:agentId/interrupt`
- **认证**: 需要 Bearer Token

### 4.7 发送消息到 Agent
- **端点**: `POST /api/agents/:agentId/message`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "message": "string"
}
```

---

## 5. Agent 工作目录 API

**基础路径**: `/api/agent`

### 5.1 获取目录列表
- **端点**: `GET /api/agent/workdir/list`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `sessionId` (必需)
  - `path` (可选，默认: /)

### 5.2 获取文件内容
- **端点**: `GET /api/agent/workdir/content`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `sessionId` (必需)
  - `path` (必需)

### 5.3 保存文件
- **端点**: `POST /api/agent/workdir/save`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "sessionId": "string",
  "filePath": "string",
  "content": "string"
}
```

### 5.4 创建文件/文件夹
- **端点**: `POST /api/agent/workdir/create`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "sessionId": "string",
  "targetPath": "string",
  "kind": "file | directory"
}
```

### 5.5 下载文件
- **端点**: `GET /api/agent/workdir/download`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `sessionId` (必需)
  - `path` (必需)

### 5.6 上传文件
- **端点**: `POST /api/agent/workdir/upload`
- **认证**: 需要 Bearer Token
- **Content-Type**: `multipart/form-data`
- **表单字段**:
  - `sessionId` (必需)
  - `directory` (可选，默认: uploads)
  - `files` (文件数组)

### 5.7 删除文件/文件夹
- **端点**: `DELETE /api/agent/workdir/delete`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "sessionId": "string",
  "path": "string"
}
```

### 5.8 获取有效工作区路径
- **端点**: `GET /api/agent/session/effective-workspace`
- **认证**: 需要 Bearer Token
- **查询参数**: `sessionId` (必需)

### 5.9 获取用户主目录信息
- **端点**: `GET /api/agent/userdir/info`
- **认证**: 需要 Bearer Token

### 5.10 获取用户主目录内容
- **端点**: `GET /api/agent/userdir/list`
- **认证**: 需要 Bearer Token

### 5.11 获取用户主目录文件内容
- **端点**: `GET /api/agent/userdir/content`
- **认证**: 需要 Bearer Token
- **查询参数**: `path` (必需)

### 5.12 保存用户主目录文件
- **端点**: `POST /api/agent/userdir/save`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "filePath": "string",
  "content": "string"
}
```

### 5.13 获取已安装 Skills
- **端点**: `GET /api/agent/userdir/skills`
- **认证**: 需要 Bearer Token

### 5.14 安装 Skill
- **端点**: `POST /api/agent/userdir/skills/install`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "skillId": "string",
  "name": "string",
  "version": "string (可选)",
  "data": "object"
}
```

### 5.15 获取 Skill 内容
- **端点**: `GET /api/agent/userdir/skills/:skillId`
- **认证**: 需要 Bearer Token

### 5.16 卸载 Skill
- **端点**: `DELETE /api/agent/userdir/skills/:skillId`
- **认证**: 需要 Bearer Token

---

## 6. MCP 服务 API

**基础路径**: `/api/mcp`

### 6.1 获取 MCP 服务器列表
- **端点**: `GET /api/mcp/servers`
- **响应**: 返回所有 MCP 服务器列表及状态

### 6.2 添加 MCP 服务器
- **端点**: `POST /api/mcp/servers`
- **请求体**:
```json
{
  "name": "string",
  "command": "string",
  "args": "string[] (可选)",
  "env": "object (可选)",
  "transport": "stdio | websocket | sse | streamable-http (可选)",
  "url": "string (可选)"
}
```

### 6.3 移除 MCP 服务器
- **端点**: `DELETE /api/mcp/servers/:id`

### 6.4 启用/禁用 MCP 服务器
- **端点**: `PUT /api/mcp/servers/:id/toggle`
- **请求体**:
```json
{
  "enabled": "boolean"
}
```

### 6.5 测试 MCP 服务器连接
- **端点**: `POST /api/mcp/servers/:id/test`

### 6.6 获取 MCP 工具列表
- **端点**: `GET /api/mcp/tools`
- **查询参数**:
  - `serverId` (可选)
  - `serverName` (可选)

### 6.7 调用 MCP 工具
- **端点**: `POST /api/mcp/call`
- **请求体**:
```json
{
  "toolName": "string",
  "toolInput": "object",
  "serverId": "string (可选)"
}
```

### 6.8 获取 MCP 状态
- **端点**: `GET /api/mcp/status`

---

## 7. 监控与诊断 API

### 7.1 性能统计
- **端点**: `GET /api/monitoring/performance`
- **认证**: 需要 Bearer Token + 管理员权限

### 7.2 资源使用情况
- **端点**: `GET /api/monitoring/resources`
- **认证**: 需要 Bearer Token + 管理员权限

### 7.3 系统健康状态
- **端点**: `GET /api/monitoring/health`
- **无需认证**

### 7.4 容器状态
- **端点**: `GET /api/monitoring/containers`
- **认证**: 需要 Bearer Token + 管理员权限

### 7.5 健康检查
- **端点**: `GET /api/diagnostics/health`

### 7.6 组件详细信息
- **端点**: `GET /api/diagnostics/components`

---

## 8. 工作区管理 API

**基础路径**: `/api/workspace`

### 8.1 上传文件到工作区
- **端点**: `POST /api/workspace/:sessionId/upload`
- **认证**: 需要 Bearer Token
- **Content-Type**: `multipart/form-data`
- **表单字段**: `file`

### 8.2 获取工作区文件列表
- **端点**: `GET /api/workspace/:sessionId/files`
- **认证**: 需要 Bearer Token

### 8.3 删除工作区文件
- **端点**: `DELETE /api/workspace/:sessionId/files/:filename`
- **认证**: 需要 Bearer Token

### 8.4 获取工作区信息
- **端点**: `GET /api/workspace/:sessionId`
- **认证**: 需要 Bearer Token

### 8.5 清空工作区
- **端点**: `DELETE /api/workspace/:sessionId`
- **认证**: 需要 Bearer Token

---

## 9. 提示词模板 API

**基础路径**: `/api/prompt-templates`

### 9.1 获取所有分类
- **端点**: `GET /api/prompt-templates/categories`

### 9.2 创建分类
- **端点**: `POST /api/prompt-templates/categories`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "name": "string",
  "icon": "string (可选)",
  "sortOrder": "number (可选)"
}
```

### 9.3 更新分类
- **端点**: `PUT /api/prompt-templates/categories/:id`
- **认证**: 需要 Bearer Token

### 9.4 删除分类
- **端点**: `DELETE /api/prompt-templates/categories/:id`
- **认证**: 需要 Bearer Token

### 9.5 获取模板列表
- **端点**: `GET /api/prompt-templates`
- **认证**: 可选（未登录只能查看内置模板）
- **查询参数**:
  - `categoryId` (可选)
  - `keyword` (可选)
  - `favorites` (可选，boolean)

### 9.6 创建模板
- **端点**: `POST /api/prompt-templates`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "title": "string",
  "content": "string",
  "categoryId": "string (可选)",
  "description": "string (可选)",
  "tags": "string[] (可选)"
}
```

### 9.7 获取单个模板
- **端点**: `GET /api/prompt-templates/:id`
- **认证**: 需要 Bearer Token

### 9.8 更新模板
- **端点**: `PUT /api/prompt-templates/:id`
- **认证**: 需要 Bearer Token

### 9.9 删除模板
- **端点**: `DELETE /api/prompt-templates/:id`
- **认证**: 需要 Bearer Token

### 9.10 切换收藏状态
- **端点**: `POST /api/prompt-templates/:id/favorite`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "isFavorite": "boolean"
}
```

### 9.11 使用模板（增加使用次数）
- **端点**: `POST /api/prompt-templates/:id/use`
- **认证**: 需要 Bearer Token

---

## 10. Skills 技能 API

**基础路径**: `/api/skills`

### 10.1 列出所有技能
- **端点**: `GET /api/skills`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `category` (可选)
  - `query` (可选)

### 10.2 获取技能详情
- **端点**: `GET /api/skills/:id`
- **认证**: 需要 Bearer Token

### 10.3 启用/禁用技能
- **端点**: `POST /api/skills/:id/toggle`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "enabled": "boolean"
}
```

### 10.4 获取所有类别
- **端点**: `GET /api/skills/categories`
- **认证**: 需要 Bearer Token

### 10.5 获取统计信息
- **端点**: `GET /api/skills/stats`
- **认证**: 需要 Bearer Token

### 10.6 从 URL 导入技能
- **端点**: `POST /api/skills/import/url`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "url": "string",
  "category": "string (可选)"
}
```

### 10.7 上传技能文件
- **端点**: `POST /api/skills/import/file`
- **认证**: 需要 Bearer Token
- **Content-Type**: `multipart/form-data` 或 `application/json`
- **表单字段**: `file` 或 JSON `{ content, name }`

### 10.8 验证技能内容
- **端点**: `POST /api/skills/validate`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "content": "string (可选)",
  "url": "string (可选)"
}
```

---

## 11. 用户等级 API

**基础路径**: `/api/tier`

### 11.1 获取所有配额配置
- **端点**: `GET /api/tier/quotas`

### 11.2 获取当前用户等级和配额
- **端点**: `GET /api/tier/my-quota`
- **认证**: 需要 Bearer Token

### 11.3 更新用户等级（管理员）
- **端点**: `PUT /api/tier/update/:userId`
- **认证**: 需要 Bearer Token + 管理员权限
- **请求体**:
```json
{
  "tier": "string",
  "subscriptionExpiresAt": "string (可选)"
}
```

### 11.4 设置自定义配额（管理员）
- **端点**: `PUT /api/tier/custom-quota/:userId`
- **认证**: 需要 Bearer Token + 管理员权限
- **请求体**: 自定义配额对象

### 11.5 获取用户资源使用统计
- **端点**: `GET /api/tier/usage-stats/:userId`
- **认证**: 需要 Bearer Token

### 11.6 获取所有用户等级列表（管理员）
- **端点**: `GET /api/tier/users`
- **认证**: 需要 Bearer Token + 管理员权限

---

## 12. 快照管理 API

**基础路径**: `/api/snapshots`

### 12.1 获取用户快照列表
- **端点**: `GET /api/snapshots`
- **认证**: 需要 Bearer Token
- **查询参数**: `limit` (默认: 50)

### 12.2 创建新快照
- **端点**: `POST /api/snapshots`
- **认证**: 需要 Bearer Token
- **请求体**:
```json
{
  "sessionId": "string",
  "containerId": "string (可选)",
  "snapshotType": "checkpoint (默认)",
  "workspacePath": "string (可选)",
  "includeProcessState": "boolean (默认: true)",
  "includeGitState": "boolean (默认: true)",
  "includeExecutionState": "boolean (默认: true)"
}
```

### 12.3 获取快照详情
- **端点**: `GET /api/snapshots/:snapshotId`
- **认证**: 需要 Bearer Token

### 12.4 删除快照
- **端点**: `DELETE /api/snapshots/:snapshotId`
- **认证**: 需要 Bearer Token

### 12.5 恢复快照
- **端点**: `POST /api/snapshots/:snapshotId/restore`
- **认证**: 需要 Bearer Token
- **查询参数**:
  - `containerId` (可选)
  - `sessionId` (可选)

---

## 13. WebSocket 端点

### 13.1 PTY 终端 WebSocket
- **用途**: 实时终端交互
- **数据流**: 前端 → Master (WS) → Worker Forwarder → Worker PTY
- **认证**: 连接时需携带 `X-Master-Token`

### 13.2 Agent 执行状态 WebSocket
- **用途**: 接收 Agent 执行过程中的状态更新
- **触发**: Agent 执行时通过回调函数推送状态

### 13.3 Worker Forwarder WebSocket
- **用途**: Master 与 Worker 之间的内部通信
- **认证**: 必须携带 `X-Master-Token`
- **安全要求**: Worker 必须网络隔离，无法访问 MySQL

---

## 14. Worker 内部 API

**端口**: 4000
**安全要求**: 所有请求必须携带 `X-Master-Token` 头

### 14.1 执行命令
- **端点**: `POST /internal/exec`
- **用途**: 在沙箱中执行用户命令
- **数据流**: Master → Worker `/internal/exec` → 返回执行结果

### 14.2 PTY 伪终端
- **用途**: 创建和管理交互式终端会话
- **注意**: Master 禁止直接创建 PTY，必须通过 Worker

### 14.3 文件操作
- **路径限制**: 所有文件操作必须经过 `isPathSafe()` 限制在 `/workspace`
- **支持操作**: 读取、写入、删除、列表

---

## 15. 前后端不一致项

### 15.1 路由路径不一致

| 功能 | 后端路径 | 前端可能使用的路径 | 说明 |
|------|----------|-------------------|------|
| Agent 工作目录列表 | `/api/agent/workdir/list` | 未在前端 API 服务中找到对应调用 | 前后端可能存在路由未对齐 |
| Agent 文件内容 | `/api/agent/workdir/content` | 未在前端 API 服务中找到对应调用 | 同上 |
| 工作区上传 | `/api/workspace/:sessionId/upload` | `filesApi.ts` 中的上传路径可能不匹配 | 需要确认前端是否正确调用 |

### 15.2 响应格式不一致

- **后端统一响应格式**: 使用 `createSuccessResponse()` 和 `createErrorResponse()` 封装
- **前端期望格式**: 部分前端 API 调用可能期望不同的响应结构（如直接返回数据而非包装在 `data` 字段中）

### 15.3 认证方式差异

- **外部 API (前端调用)**: 使用 `Authorization: Bearer <token>`
- **内部 API (Master ↔ Worker)**: 使用 `X-Master-Token` 头
- **部分监控端点**: 直接使用 `verifyToken()` 而非 `authMiddleware()`，导致错误处理可能不一致

### 15.4 类型定义不同步

- **Shared 模块**: `server/src/shared/types/index.ts` 定义了 `InternalAPIRequest` 和 `InternalAPIResponse`
- **前端类型**: 前端可能有独立的类型定义，未与后端 shared 模块保持同步
- **风险**: 修改 API 时如果未同步更新 shared 类型，可能导致通信错误

### 15.5 WebSocket 认证

- **文档要求**: WebSocket 连接需携带 `X-Master-Token`
- **实际情况**: 前端 WebSocket 连接可能使用不同的认证机制（如 URL 参数携带 token）
- **建议**: 统一认证方式，避免安全漏洞

### 15.6 管理员路由

以下路由需要管理员权限，但部分实现直接使用 `verifyToken()` 而非统一的 `authMiddleware()`：
- `/api/monitoring/*`
- `/api/tier/*`
- `/api/adminContainer/*`

这可能导致权限检查逻辑不一致，建议统一使用 `authMiddleware()`。

### 15.7 前端 API 客户端与后端路由映射

前端 `src/services/api/` 目录下的 API 调用文件主要面向 Anthropic API 和 Claude AI 服务，与本项目自定义的 Master API 路由可能存在以下不一致：
- 前端可能直接调用 Anthropic API 而非通过 Master 代理
- 部分 Agent 执行可能绕过 Master 直接调用外部服务

**建议**: 建立统一的 API 网关层，确保所有前端请求都经过 Master 服务。

---

## 附录

### A. 通用响应格式

**成功响应**:
```json
{
  "success": true,
  "data": { ... }
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述"
  }
}
```

### B. 通用错误码

| 错误码 | 说明 | HTTP 状态码 |
|--------|------|-------------|
| `UNAUTHORIZED` | 未认证或认证失败 | 401 |
| `FORBIDDEN` | 权限不足 | 403 |
| `NOT_FOUND` | 资源不存在 | 404 |
| `INVALID_PARAMS` | 请求参数无效 | 400 |
| `*_FAILED` | 操作失败（具体见前缀） | 500 |

### C. 安全要求

1. **Master 禁区**: 禁止在 Master 执行用户命令、创建 PTY、或直接读写沙盒文件
2. **Worker 禁区**: 禁止 Worker 连接数据库、处理用户鉴权，Worker 必须无状态
3. **安全隔离**: Master 与 Worker 通信必须携带 `X-Master-Token`，Worker 必须网络隔离
4. **文件路径**: 所有 Worker 文件操作必须经过 `isPathSafe()` 限制在 `/workspace`
5. **工作空间隔离**: 按用户隔离，路径格式 `/data/claws/workspaces/users/{userId}/`

### D. 端口说明

| 服务 | 端口 | 用途 |
|------|------|------|
| Master | 3000 | 控制层：鉴权、网关、会话管理 |
| Worker | 4000 | 执行层：沙箱、PTY、文件操作 |
