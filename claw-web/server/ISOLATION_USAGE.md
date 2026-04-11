# Worktree/Remote 隔离使用指南

## 📋 目录

- [概述](#概述)
- [核心概念](#核心概念)
- [API 接口](#api-接口)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)

---

## 🎯 概述

本系统实现了两种 Agent 执行隔离模式：

1. **Worktree 隔离**：使用 Git Worktree 创建临时工作副本
2. **Remote 隔离**：在远程环境（SSH/Docker）中执行

这些隔离模式确保 Agent 在安全、独立的环境中执行任务，避免对主环境造成意外影响。

---

## 📚 核心概念

### 1. IsolationMode 枚举

```typescript
enum IsolationMode {
  WORKTREE = 'worktree',  // Git Worktree 隔离
  REMOTE = 'remote'       // 远程隔离
}
```

### 2. WorktreeConfig 配置

```typescript
interface WorktreeConfig {
  mainRepoPath: string;      // 主仓库路径
  worktreeName: string;      // 工作树名称
  worktreePath?: string;     // 工作树路径（自动生成）
  branchName?: string;       // 分支名称
  commit?: string;           // 基于的提交
}
```

### 3. RemoteConfig 配置

```typescript
interface RemoteConfig {
  type: 'ssh' | 'docker' | 'kubernetes' | 'serverless';
  connection: {
    host?: string;
    port?: number;
    user?: string;
    keyPath?: string;
    password?: string;
  };
  container?: {
    image: string;
    volumes?: Array<{ host: string; container: string }>;
    environment?: Record<string, string>;
  };
  timeout?: number;
}
```

### 4. IsolationContextManager

核心管理器，负责：
- 创建/销毁隔离上下文
- 执行命令
- 资源清理

---

## 🔌 API 接口

### 创建隔离上下文

**端点**: `POST /api/agents/isolation`

**请求体**:
```json
{
  "name": "my-agent-task",
  "mode": "worktree",
  "description": "在隔离环境中执行代码重构",
  "worktree": {
    "mainRepoPath": "/path/to/repo",
    "worktreeName": "agent-refactor-001",
    "branchName": "feature/auto-refactor"
  }
}
```

**响应**:
```json
{
  "isolationId": "iso_12345678",
  "name": "my-agent-task",
  "mode": "worktree",
  "status": "ready",
  "workingDirectory": "/path/to/repo/../agent-refactor-001",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 在隔离上下文中执行命令

**端点**: `POST /api/agents/isolation/:isolationId/execute`

**请求体**:
```json
{
  "command": "npm",
  "args": ["run", "build"],
  "cwd": "/isolated/path",
  "env": { "NODE_ENV": "production" },
  "timeout": 60000
}
```

### 获取隔离上下文详情

**端点**: `GET /api/agents/isolation/:isolationId`

### 销毁隔离上下文

**端点**: `DELETE /api/agents/isolation/:isolationId`

---

## 💡 使用示例

### 示例 1: 使用 Worktree 隔离执行 Agent

```typescript
import { runAgent } from './agents/runAgent'
import { getBuiltInAgents } from './agents'

async function executeWithWorktree() {
  const agents = getBuiltInAgents()
  const agentDef = agents.find(a => a.agentType === 'general-purpose')
  
  if (!agentDef) {
    throw new Error('Agent not found')
  }

  // 执行 Agent，启用 worktree 隔离
  const result = await runAgent({
    agentDefinition: agentDef,
    sessionId: 'session_001',
    promptMessages: [
      { role: 'user', content: '重构 src/utils 目录下的代码' }
    ],
    isolation: 'worktree',
    worktree: {
      mainRepoPath: '/path/to/your/repo',
      worktreeName: 'agent-refactor-001',
      branchName: 'feature/auto-refactor'
    },
    maxTurns: 50,
    onProgress: (progress) => {
      console.log(`Agent ${progress.agentId}: ${progress.message}`)
    }
  })

  // 处理结果
  for await (const event of result) {
    switch (event.type) {
      case 'complete':
        console.log('Agent 完成:', event.result)
        break
      case 'error':
        console.error('Agent 错误:', event.error)
        break
    }
  }
}
```

### 示例 2: 使用 Remote 隔离（SSH）

```typescript
async function executeWithSSH() {
  const agents = getBuiltInAgents()
  const agentDef = agents.find(a => a.agentType === 'code-reviewer')
  
  const result = await runAgent({
    agentDefinition: agentDef,
    sessionId: 'session_002',
    promptMessages: [
      { role: 'user', content: '审查最近的代码提交' }
    ],
    isolation: 'remote',
    remote: {
      type: 'ssh',
      connection: {
        host: 'review-server.example.com',
        port: 22,
        user: 'reviewer',
        keyPath: '/home/user/.ssh/id_rsa'
      },
      timeout: 300000  // 5 分钟超时
    }
  })
}
```

### 示例 3: 使用 Remote 隔离（Docker）

```typescript
async function executeWithDocker() {
  const agents = getBuiltInAgents()
  const agentDef = agents.find(a => a.agentType === 'test-runner')
  
  const result = await runAgent({
    agentDefinition: agentDef,
    sessionId: 'session_003',
    promptMessages: [
      { role: 'user', content: '运行所有单元测试' }
    ],
    isolation: 'remote',
    remote: {
      type: 'docker',
      connection: {},
      container: {
        image: 'node:18-alpine',
        volumes: [
          { host: '/path/to/repo', container: '/app' }
        ],
        environment: {
          CI: 'true',
          NODE_ENV: 'test'
        }
      }
    }
  })
}
```

### 示例 4: 手动管理隔离上下文

```typescript
import { getIsolationManager } from './agents/contextIsolation'

async function manualIsolation() {
  const manager = getIsolationManager()
  
  // 创建隔离上下文
  const isolationId = await manager.create({
    isolationId: 'iso_manual_001',
    mode: 'worktree',
    name: 'manual-task',
    description: '手动管理的隔离任务',
    workingDirectory: '/path/to/repo',
    cleanupPolicy: 'delayed',  // 延迟清理
    worktree: {
      mainRepoPath: '/path/to/repo',
      worktreeName: 'manual-worktree'
    }
  })
  
  // 在隔离上下文中执行命令
  const result = await manager.execute({
    isolationId,
    command: 'git',
    args: ['status'],
    cwd: '/path/to/worktree',
    timeout: 30000
  })
  
  console.log('执行结果:', result)
  
  // 手动销毁隔离上下文
  await manager.destroy(isolationId)
}
```

### 示例 5: 通过 HTTP API 调用

```bash
# 1. 创建 worktree 隔离上下文
curl -X POST http://localhost:3000/api/agents/isolation \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api-test",
    "mode": "worktree",
    "worktree": {
      "mainRepoPath": "/path/to/repo",
      "worktreeName": "api-worktree"
    }
  }'

# 响应：{"isolationId": "iso_12345678", ...}

# 2. 在隔离上下文中执行命令
curl -X POST http://localhost:3000/api/agents/isolation/iso_12345678/execute \
  -H "Content-Type: application/json" \
  -d '{
    "command": "npm",
    "args": ["test"],
    "timeout": 60000
  }'

# 3. 查看隔离上下文状态
curl http://localhost:3000/api/agents/isolation/iso_12345678

# 4. 销毁隔离上下文
curl -X DELETE http://localhost:3000/api/agents/isolation/iso_12345678
```

---

## 🎓 最佳实践

### 1. 选择合适的隔离模式

**使用 Worktree 隔离，如果：**
- ✅ 主要进行代码修改
- ✅ 需要快速启动和迭代
- ✅ 希望保留 Git 历史记录
- ✅ 资源有限（无远程服务器）

**使用 Remote 隔离，如果：**
- ✅ 需要完全的环境隔离
- ✅ 执行危险或破坏性操作
- ✅ 需要特定 OS/环境配置
- ✅ 生产环境部署
- ✅ 安全合规要求

### 2. 清理策略

```typescript
// 立即清理 - 适用于临时任务
cleanupPolicy: 'immediate'

// 延迟清理 - 适用于需要查看结果的任务（推荐）
cleanupPolicy: 'delayed'  // 默认 1 分钟后清理

// 手动清理 - 适用于需要长期保留的任务
cleanupPolicy: 'manual'
```

### 3. 错误处理

```typescript
try {
  const result = await runAgent({
    isolation: 'worktree',
    worktree: { ... }
  })
  
  for await (const event of result) {
    // 处理事件
  }
} catch (error) {
  console.error('隔离执行失败:', error)
  // 隔离创建失败会自动回退到普通执行模式
}
```

### 4. 资源管理

```typescript
// 添加清理钩子
context.addCleanupHook(async () => {
  console.log('清理资源...')
  // 清理临时文件、关闭连接等
})

// 确保在 finally 块中清理
try {
  // 执行任务
} finally {
  await context.cleanup()
}
```

### 5. 监控和日志

```typescript
// 启用详细日志
process.env.ISOLATION_DEBUG = 'true'

// 监控隔离上下文状态
const manager = getIsolationManager()
const contexts = manager.listContexts()

contexts.forEach(ctx => {
  console.log(`隔离上下文：${ctx.isolationId}`)
  console.log(`  - 状态：${ctx.status}`)
  console.log(`  - 执行次数：${ctx.executionCount}`)
  console.log(`  - 总时长：${ctx.totalDuration}ms`)
})
```

---

## 🔧 配置选项

### 环境变量

```bash
# 启用隔离调试日志
ISOLATION_DEBUG=true

# 设置默认清理延迟（毫秒）
ISOLATION_CLEANUP_DELAY=60000

# 最大并发隔离数
MAX_CONCURRENT_ISOLATIONS=10

# Git Worktree 配置
GIT_WORKTREE_KEEP_ON_ERROR=false  # 错误时是否保留 worktree
```

---

## 📊 架构图

```
┌─────────────────────────────────────────────────────┐
│                   Agent 执行请求                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   检查隔离参数          │
        │   isolation: worktree  │
        │   /remote              │
        └────────┬───────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
  ┌──────────┐      ┌──────────┐
  │ Worktree │      │  Remote  │
  │ Isolation│      │ Isolation│
  └────┬─────┘      └────┬─────┘
       │                 │
       │  Git Worktree   │  SSH/Docker/K8s
       │  创建工作树      │  建立连接
       │                 │
       ▼                 ▼
  ┌─────────────────────────┐
  │   IsolationContext      │
  │   - 工作目录隔离         │
  │   - 资源限制             │
  │   - 清理策略             │
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │   Agent 执行             │
  │   - 工具调用             │
  │   - 文件系统操作          │
  │   - 命令执行             │
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │   清理和销毁             │
  │   - 删除 worktree        │
  │   - 关闭远程连接          │
  │   - 释放资源             │
  └─────────────────────────┘
```

---

## 🚀 下一步

1. **性能优化**: 实现 worktree 缓存，加快创建速度
2. **资源监控**: 添加 CPU/内存使用监控
3. **并发控制**: 实现隔离上下文的并发限制
4. **持久化**: 将隔离配置保存到数据库
5. **Webhook 通知**: 隔离任务完成时发送通知

---

## 📞 支持

如有问题，请查看：
- [contextIsolation.ts](./src/agents/contextIsolation.ts) - 完整实现
- [runAgent.ts](./src/agents/runAgent.ts) - Agent 执行集成
- [agentApi.ts](./src/routes/agentApi.ts) - API 接口
