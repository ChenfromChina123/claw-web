# MySQL会话持久化方案

## 目标
实现基于MySQL的会话持久化，支持多用户多会话，工具调用记录，以及活跃会话内存缓存。

## 数据库设计

### 表结构

```sql
-- 用户表
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,          -- 用户UUID
  username VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 会话表
CREATE TABLE sessions (
  id VARCHAR(36) PRIMARY KEY,          -- 会话UUID
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) DEFAULT '新对话',  -- 会话标题
  model VARCHAR(50) DEFAULT 'qwen-plus',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 消息表（包含工具调用）
CREATE TABLE messages (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL,
  role ENUM('user', 'assistant', 'system') NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 工具调用表
CREATE TABLE tool_calls (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,    -- 关联到assistant消息
  session_id VARCHAR(36) NOT NULL,    -- 冗余存储便于查询
  tool_name VARCHAR(100) NOT NULL,
  tool_input JSON,                    -- 工具输入参数
  tool_output JSON,                   -- 工具输出结果
  status ENUM('pending', 'executing', 'completed', 'error') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_tool_calls_session_id ON tool_calls(session_id);
```

## 架构设计

### 分层结构
```
┌─────────────────────────────────────────────────────┐
│                    前端 (Vue)                        │
│         http://localhost:5173                       │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket
┌─────────────────────▼───────────────────────────────┐
│                  API层 (Bun)                        │
│              ws://localhost:3000                   │
│  ┌─────────────────────────────────────────────┐   │
│  │           SessionManager                     │   │
│  │  - 管理内存中的活跃会话                       │   │
│  │  - 路由消息到对应会话                        │   │
│  │  - 处理会话创建/切换/删除                     │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                会话服务层                            │
│  ┌────────────────┐  ┌────────────────────────┐    │
│  │  In-Memory     │  │   MySQL Repository    │    │
│  │  Session Cache  │  │   (持久化存储)         │    │
│  └────────────────┘  └────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 会话加载策略
1. **首次连接**：从MySQL加载用户最新会话到内存
2. **消息发送**：先更新内存，后异步持久化到MySQL
3. **会话切换**：将旧会话写回MySQL，加载新会话到内存
4. **连接断开**：异步保存会话到MySQL

## 实现步骤

### 1. 数据库层
- 创建MySQL连接模块 `src/db/mysql.ts`
- 创建表初始化脚本
- 实现CRUD操作

### 2. 会话管理
- 创建 `src/services/session.ts`
- 实现内存缓存 `Map<sessionId, Session>`
- 实现会话持久化方法

### 3. API扩展
- 添加会话管理WebSocket消息类型：
  - `create_session` - 创建新会话
  - `list_sessions` - 列出用户所有会话
  - `load_session` - 加载指定会话
  - `delete_session` - 删除会话
  - `rename_session` - 重命名会话

### 4. 前端适配
- 添加会话列表侧边栏
- 实现会话切换UI
- 显示会话历史消息和工具调用

### 5. 数据迁移
- 将现有内存会话迁移到MySQL
- 确保向后兼容

## WebSocket消息协议

### 客户端发送
```typescript
// 创建会话
{ type: 'create_session', userId: string, title?: string }

// 切换会话
{ type: 'load_session', sessionId: string }

// 发送消息（带上sessionId）
{ type: 'user_message', sessionId: string, content: string }

// 清除会话
{ type: 'clear_session', sessionId: string }

// 删除会话
{ type: 'delete_session', sessionId: string }
```

### 服务端推送
```typescript
// 会话列表
{ type: 'session_list', sessions: Session[] }

// 消息历史（加载会话时）
{ type: 'session_loaded', session: Session, messages: Message[] }

// 新消息
{ type: 'message', role: 'user'|'assistant', content: string, sessionId: string }

// 工具调用
{ type: 'tool_call', toolCall: ToolCall, sessionId: string }
```

## 文件结构
```
server/src/
├── index.ts                 # 主入口
├── db/
│   ├── mysql.ts            # MySQL连接
│   ├── schema.sql          # 表结构
│   └── repositories/
│       ├── userRepository.ts
│       ├── sessionRepository.ts
│       └── messageRepository.ts
├── services/
│   └── sessionManager.ts   # 会话管理服务
├── models/
│   └── types.ts           # 类型定义
└── websocket/
    └── handlers.ts        # WebSocket处理器

web/src/
├── App.vue                # 主组件
├── components/
│   ├── ChatMessage.vue    # 消息组件
│   ├── ChatInput.vue      # 输入组件
│   └── SessionSidebar.vue # 会话侧边栏
└── stores/
    └── sessionStore.ts    # 会话状态管理
```

## 依赖
- `mysql2` - MySQL客户端
- `uuid` - 生成UUID
