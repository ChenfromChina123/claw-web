# AI聊天会话分支功能 - 后端实现计划

## 1. 需求概述

添加类似Git版本控制的AI聊天会话分支功能，允许用户在当前会话的某一条历史对话中创建分支并进行对话。该条对话的内容会被保存，并在所选的对话内容基础上进行重新对话。

### 核心功能
- 从任意消息节点创建新的对话分支
- 分支之间可以切换查看历史
- 主分支和子分支构成树状结构
- 每个分支有独立的对话历史

## 2. 现有数据模型分析

### 2.1 会话表 (sessions)
```sql
- id: VARCHAR(36) PRIMARY KEY
- user_id: VARCHAR(36) NOT NULL
- title: VARCHAR(255)
- model: VARCHAR(50)
- is_pinned: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 2.2 消息表 (messages)
```sql
- id: VARCHAR(36) PRIMARY KEY
- session_id: VARCHAR(36) NOT NULL
- role: ENUM('user', 'assistant', 'system')
- content: JSON NOT NULL
- attachments: JSON
- sequence: INT DEFAULT 0
- created_at: TIMESTAMP
```

## 3. 分支功能数据模型设计

### 3.1 新增表: 会话分支表 (session_branches)

```sql
CREATE TABLE IF NOT EXISTS session_branches (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL COMMENT '所属会话ID',
  parent_branch_id VARCHAR(36) NULL COMMENT '父分支ID，NULL表示主分支',
  parent_message_id VARCHAR(36) NULL COMMENT '从哪条消息分出的，NULL表示从会话开始',
  name VARCHAR(100) NOT NULL COMMENT '分支名称',
  description TEXT COMMENT '分支描述',
  is_main BOOLEAN DEFAULT FALSE COMMENT '是否为主分支',
  is_active BOOLEAN DEFAULT FALSE COMMENT '当前激活的分支',
  message_count INT DEFAULT 0 COMMENT '消息数量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_branch_id) REFERENCES session_branches(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_message_id) REFERENCES messages(id) ON DELETE SET NULL,
  INDEX idx_branches_session_id (session_id),
  INDEX idx_branches_parent (parent_branch_id),
  INDEX idx_branches_active (session_id, is_active)
);
```

### 3.2 修改消息表: 添加分支关联

```sql
-- 为messages表添加branch_id字段
ALTER TABLE messages ADD COLUMN branch_id VARCHAR(36) NULL AFTER session_id;
ALTER TABLE messages ADD FOREIGN KEY (branch_id) REFERENCES session_branches(id) ON DELETE CASCADE;
ALTER TABLE messages ADD INDEX idx_messages_branch_id (branch_id);

-- 为现有数据设置默认值（将现有消息关联到主分支）
-- 这个迁移将在应用启动时自动执行
```

### 3.3 分支关系示意图

```
会话 (Session)
├── 主分支 (Main Branch) [is_main=true]
│   ├── 消息1 (User)
│   ├── 消息2 (Assistant)
│   ├── 消息3 (User)
│   └── 消息4 (Assistant)
│       └── 分支A (从消息4创建)
│           ├── 消息5-A (User)
│           ├── 消息6-A (Assistant)
│           └── 分支A-1 (从消息6-A创建)
│               └── 消息7-A1 (User)
└── 分支B (从消息2创建)
    ├── 消息5-B (User)
    └── 消息6-B (Assistant)
```

## 4. API接口设计

### 4.1 分支管理接口

#### 4.1.1 创建分支
```
POST /api/sessions/:sessionId/branches
请求体:
{
  "parentBranchId": "分支ID，可选，默认从当前激活分支创建",
  "parentMessageId": "从哪条消息分出的，可选，默认从最后一条",
  "name": "分支名称，可选，自动生成如'分支1'",
  "description": "分支描述，可选"
}
响应:
{
  "id": "分支ID",
  "sessionId": "会话ID",
  "parentBranchId": "父分支ID",
  "parentMessageId": "父消息ID",
  "name": "分支名称",
  "description": "描述",
  "isMain": false,
  "isActive": true,
  "messageCount": 0,
  "createdAt": "创建时间"
}
```

#### 4.1.2 获取分支列表
```
GET /api/sessions/:sessionId/branches
响应:
{
  "branches": [
    {
      "id": "分支ID",
      "name": "分支名称",
      "parentBranchId": "父分支ID",
      "parentMessageId": "父消息ID",
      "isMain": true,
      "isActive": false,
      "messageCount": 10,
      "createdAt": "创建时间"
    }
  ],
  "activeBranchId": "当前激活的分支ID"
}
```

#### 4.1.3 获取分支详情
```
GET /api/sessions/:sessionId/branches/:branchId
响应:
{
  "id": "分支ID",
  "sessionId": "会话ID",
  "parentBranchId": "父分支ID",
  "parentMessageId": "父消息ID",
  "name": "分支名称",
  "description": "描述",
  "isMain": false,
  "isActive": true,
  "messageCount": 5,
  "createdAt": "创建时间",
  "updatedAt": "更新时间"
}
```

#### 4.1.4 切换激活分支
```
POST /api/sessions/:sessionId/branches/:branchId/switch
响应:
{
  "success": true,
  "activeBranchId": "分支ID"
}
```

#### 4.1.5 更新分支信息
```
PUT /api/sessions/:sessionId/branches/:branchId
请求体:
{
  "name": "新名称",
  "description": "新描述"
}
响应: 更新后的分支对象
```

#### 4.1.6 删除分支
```
DELETE /api/sessions/:sessionId/branches/:branchId
说明: 删除分支会级联删除该分支下的所有消息
响应:
{
  "success": true,
  "message": "分支已删除"
}
```

### 4.2 修改现有接口

#### 4.2.1 获取会话消息 (GET /api/sessions/:id)
修改点:
- 添加 `branchId` 查询参数，可选，默认返回当前激活分支的消息
- 返回的消息按分支历史组织

```
GET /api/sessions/:id?branchId=xxx
响应:
{
  "session": {...},
  "messages": [...],
  "toolCalls": {...},
  "currentBranch": {
    "id": "分支ID",
    "name": "分支名称",
    "parentMessageId": "父消息ID"
  },
  "branchHistory": [
    // 当前分支继承的父分支消息历史
  ]
}
```

#### 4.2.2 发送消息 (WebSocket /api/chat)
修改点:
- 添加 `branchId` 字段到WebSocket消息中
- 消息保存时关联到指定分支

```
WebSocket消息格式:
{
  "type": "chat",
  "sessionId": "会话ID",
  "branchId": "分支ID，可选，默认使用当前激活分支",
  "content": "消息内容",
  ...
}
```

## 5. 实现步骤

### 步骤1: 创建数据库迁移文件
文件: `server/src/master/db/migrations/add_session_branches.sql`
- 创建 `session_branches` 表
- 为 `messages` 表添加 `branch_id` 字段
- 为现有会话创建默认主分支
- 将现有消息关联到主分支

### 步骤2: 更新类型定义
文件: `server/src/master/models/types.ts`
- 添加 `Branch` 接口
- 更新 `Message` 接口添加 `branchId` 字段
- 更新 `SessionWithMessages` 接口添加分支相关信息

### 步骤3: 创建分支Repository
文件: `server/src/master/db/repositories/branchRepository.ts`
- 实现分支的CRUD操作
- 实现分支切换逻辑
- 实现分支树查询

### 步骤4: 修改消息Repository
文件: `server/src/master/db/repositories/messageRepository.ts`
- 修改查询方法支持按分支查询
- 添加获取分支历史消息的方法（包含继承的父分支消息）

### 步骤5: 修改会话Repository
文件: `server/src/master/db/repositories/sessionRepository.ts`
- 创建会话时自动创建主分支
- 添加获取会话分支列表的方法

### 步骤6: 创建分支路由
文件: `server/src/master/routes/branches.routes.ts`
- 实现分支管理API接口
- 注册到主路由

### 步骤7: 修改会话路由
文件: `server/src/master/routes/sessions.routes.ts`
- 修改获取会话详情接口，支持返回分支信息
- 添加分支相关的嵌套路由

### 步骤8: 修改聊天服务
文件: `server/src/master/services/chatService.ts` (或相关文件)
- 修改消息发送逻辑，支持指定分支
- 确保消息保存时关联正确的分支

### 步骤9: 更新SessionManager
文件: `server/src/master/services/sessionManager.ts`
- 集成分支管理功能
- 管理当前激活分支状态

## 6. 数据迁移策略

### 6.1 现有数据处理
1. 为每个现有会话创建默认主分支
2. 将所有现有消息的 `branch_id` 设置为对应的主分支ID
3. 设置主分支的 `is_main = true`, `is_active = true`

### 6.2 迁移SQL示例
```sql
-- 1. 创建分支表
CREATE TABLE IF NOT EXISTS session_branches (...);

-- 2. 添加branch_id到messages表
ALTER TABLE messages ADD COLUMN branch_id VARCHAR(36) NULL;

-- 3. 为每个会话创建主分支
INSERT INTO session_branches (id, session_id, name, is_main, is_active, message_count)
SELECT 
  UUID() as id,
  s.id as session_id,
  '主分支' as name,
  TRUE as is_main,
  TRUE as is_active,
  COUNT(m.id) as message_count
FROM sessions s
LEFT JOIN messages m ON s.id = m.session_id
GROUP BY s.id;

-- 4. 更新messages表的branch_id
UPDATE messages m
JOIN session_branches b ON m.session_id = b.session_id AND b.is_main = TRUE
SET m.branch_id = b.id;

-- 5. 添加外键约束
ALTER TABLE messages ADD FOREIGN KEY (branch_id) REFERENCES session_branches(id);
```

## 7. 关键业务逻辑

### 7.1 创建分支流程
1. 验证用户权限（是否是会话所有者）
2. 验证父分支和父消息是否存在
3. 创建新分支记录
4. 设置新分支为激活状态（可选，根据业务需求）
5. 返回分支信息

### 7.2 获取分支消息历史流程
1. 获取当前分支信息
2. 如果分支有父消息，递归获取父分支的消息直到父消息位置
3. 合并所有祖先分支的消息历史
4. 添加当前分支的消息
5. 按时间/序列排序返回

### 7.3 切换分支流程
1. 验证分支存在且属于当前会话
2. 将会话的所有分支设置为非激活
3. 将指定分支设置为激活
4. 返回成功状态

## 8. 注意事项

1. **性能考虑**: 分支历史查询可能涉及多层级联查询，考虑添加适当的索引
2. **数据一致性**: 删除分支时要级联删除该分支的所有消息
3. **并发处理**: 分支切换要考虑并发情况，使用事务保证数据一致性
4. **向后兼容**: 确保前端未更新时，现有API仍能正常工作（默认使用主分支）

## 9. WebSocket消息链路修改

### 9.1 新增WebSocket消息类型
在 `server/src/master/types/websocket.ts` 中添加：

```typescript
// 分支相关WebSocket消息类型
export type BranchWebSocketMessageType =
  | 'create_branch'
  | 'branch_created'
  | 'list_branches'
  | 'branches_list'
  | 'switch_branch'
  | 'branch_switched'
  | 'delete_branch'
  | 'branch_deleted'
  | 'rename_branch'
  | 'branch_renamed'

// 创建分支请求
export interface CreateBranchMessage {
  type: 'create_branch'
  sessionId: string
  parentMessageId?: string
  name?: string
  description?: string
}

// 分支创建成功响应
export interface BranchCreatedMessage {
  type: 'branch_created'
  branch: Branch
  sessionId: string
}

// 获取分支列表请求
export interface ListBranchesMessage {
  type: 'list_branches'
  sessionId: string
}

// 分支列表响应
export interface BranchesListMessage {
  type: 'branches_list'
  branches: Branch[]
  activeBranchId: string
  sessionId: string
}

// 切换分支请求
export interface SwitchBranchMessage {
  type: 'switch_branch'
  sessionId: string
  branchId: string
}

// 分支切换成功响应
export interface BranchSwitchedMessage {
  type: 'branch_switched'
  branchId: string
  sessionId: string
  messages: Message[]  // 切换后加载该分支的消息历史
}
```

### 9.2 修改现有WebSocket消息处理
在 `server/src/master/websocket/wsMessageRouter.ts` 中添加分支相关消息处理器：

```typescript
// 在 handleWebSocketMessage 的 switch 语句中添加：
case 'create_branch':
  await handleCreateBranch(ws, wsData, message, sendEvent)
  break

case 'list_branches':
  await handleListBranches(ws, wsData, message, sendEvent)
  break

case 'switch_branch':
  await handleSwitchBranch(ws, wsData, message, sendEvent)
  break

case 'delete_branch':
  await handleDeleteBranch(ws, wsData, message, sendEvent)
  break

case 'rename_branch':
  await handleRenameBranch(ws, wsData, message, sendEvent)
  break
```

### 9.3 修改user_message处理
在 `handleUserMessage` 函数中：
- 接收 `branchId` 参数（可选）
- 如果没有提供 `branchId`，使用当前会话的激活分支
- 保存消息时关联到正确的分支

```typescript
async function handleUserMessage(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = message.sessionId as string || wsData.sessionId
  const branchId = message.branchId as string  // 新增：分支ID
  // ... 其余逻辑
  
  // 在调用 processMessage 时传入 branchId
  sessionConversationManager.processMessage(
    sessionId,
    content,
    model,
    sessionManager,
    sendEvent,
    {
      branchId,  // 新增参数
      ...agentOptions,
      imageAttachments,
    }
  )
}
```

## 10. 文件变更清单

### 新增文件
1. `server/src/master/db/migrations/add_session_branches.sql` - 数据库迁移
2. `server/src/master/db/repositories/branchRepository.ts` - 分支数据访问
3. `server/src/master/routes/branches.routes.ts` - 分支路由 (HTTP API)

### 修改文件
1. `server/src/master/db/schema.sql` - 更新完整schema
2. `server/src/master/models/types.ts` - 添加类型定义
3. `server/src/master/db/repositories/messageRepository.ts` - 支持分支查询
4. `server/src/master/db/repositories/sessionRepository.ts` - 集成分支创建
5. `server/src/master/routes/sessions.routes.ts` - 添加分支相关接口
6. `server/src/master/routes/index.ts` - 注册分支路由
7. `server/src/master/services/sessionManager.ts` - 管理分支状态
8. `server/src/master/types/websocket.ts` - 添加WebSocket消息类型
9. `server/src/master/websocket/wsMessageRouter.ts` - 添加分支消息处理器
10. `server/src/master/services/conversation/sessionConversationManager.ts` - 支持分支的消息处理
