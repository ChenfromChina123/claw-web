这是一个超大型文件（约 3500+ 行）的拆分方案。核心思路是**按职责垂直切分**，将 HTTP 路由、WebSocket 处理、业务逻辑、工具函数等分离到独立模块中。

## 1. 目标目录结构

```
src/
├── index.ts                          # 入口文件，仅负责启动服务器
├── server/
│   ├── httpServer.ts                 # HTTP 服务器配置与路由挂载
│   ├── websocketServer.ts            # WebSocket 服务器配置与消息路由
│   └── rpcMethods.ts                 # RPC 方法注册（原 initializeRPCMethods）
├── routes/
│   ├── auth.routes.ts                # /api/auth/* 路由
│   ├── sessions.routes.ts            # /api/sessions/* 路由
│   ├── tools.routes.ts               # /api/tools/* 路由
│   ├── agents.routes.ts              # /api/agents/* 路由
│   ├── mcp.routes.ts                 # /api/mcp/* 路由
│   ├── workspace.routes.ts           # /api/workspace/* 及 /api/agent/workdir/* 路由
│   ├── monitoring.routes.ts          # /api/monitoring/* 路由
│   ├── diagnostics.routes.ts         # /api/diagnostics/* 路由
│   └── index.ts                      # 统一导出并注册所有路由
├── websocket/
│   ├── handlers/
│   │   ├── session.handlers.ts       # create_session, load_session, list_sessions 等
│   │   ├── message.handlers.ts       # user_message, interrupt_generation 等
│   │   ├── agent.handlers.ts         # agents_list, agents_orchestration_* 等
│   │   └── system.handlers.ts        # ping, get_status, get_models 等
│   ├── wsMessageRouter.ts            # 根据 message.type 分发到对应 handler
│   └── eventSender.ts                # 创建 sendEvent 函数的工具
├── services/
│   ├── conversation/
│   │   ├── sessionConversationManager.ts   # 原 SessionConversationManager 类
│   │   ├── toolExecutorWrapper.ts          # 封装 toolExecutor 调用
│   │   └── aiStreamService.ts              # callAIWithStream 逻辑
│   └── ... (其他已有 service 保持不变)
├── utils/
│   ├── response.ts                   # createSuccessResponse, createErrorResponse
│   ├── auth.ts                       # authMiddleware
│   ├── websocket.ts                  # websocketPayloadToText
│   ├── workdir.ts                    # readDirectory, detectLanguage, getMimeType 等
│   └── constants.ts                  # AVAILABLE_MODELS, 端口配置等
└── types/
    └── websocket.ts                  # WebSocketData, WebSocketMessage 等类型
```

## 2. 模块职责详述

### 2.1 `index.ts` (入口文件，精简至 50 行左右)

```typescript
import { startServer } from './server/httpServer'

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error)
  process.exit(1)
})

// 全局异常处理保持不变
```

### 2.2 `server/httpServer.ts`

- 负责 `Bun.serve` 的创建
- 调用 `routes/index.ts` 获取路由处理函数
- 处理 WebSocket upgrade
- 集成数据库初始化、各服务初始化逻辑

### 2.3 `routes/` 拆分策略

每个路由文件导出一个 `registerRoutes` 函数，接收 `app: Router`（或直接返回 `Bun.Serve` 的 `fetch` 片段）。建议采用**中间件链式**模式：

```typescript
// routes/auth.routes.ts
import type { Request } from 'bun'

export function createAuthRouter() {
  return async (req: Request): Promise<Response | null> => {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/auth/')) return null
    
    // 处理具体路由
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      // ...
    }
    // ...
    return null // 未匹配则返回 null 交给下一个路由
  }
}
```

在 `httpServer.ts` 中组合：

```typescript
const routers = [
  createAuthRouter(),
  createSessionsRouter(),
  // ...
]

async function fetch(req: Request) {
  for (const router of routers) {
    const res = await router(req)
    if (res) return res
  }
  return new Response('Not Found', { status: 404 })
}
```

### 2.4 WebSocket 处理拆分

将 `websocket.message` 中的巨型 `switch` 拆分为多个 handler 文件，通过 `wsMessageRouter` 分发：

```typescript
// websocket/wsMessageRouter.ts
import { handleSessionMessages } from './handlers/session.handlers'
import { handleMessageMessages } from './handlers/message.handlers'
// ...

const handlers = {
  ...handleSessionMessages,
  ...handleMessageMessages,
  // ...
}

export async function routeWebSocketMessage(wsData, message, sendEvent) {
  const handler = handlers[message.type]
  if (handler) {
    return await handler(wsData, message, sendEvent)
  }
  sendEvent('error', { message: `Unknown type: ${message.type}` })
}
```

每个 handler 文件导出对象：

```typescript
// websocket/handlers/session.handlers.ts
export const sessionHandlers = {
  async create_session(wsData, message, sendEvent) {
    // ...
  },
  async load_session(wsData, message, sendEvent) {
    // ...
  },
}
```

### 2.5 `SessionConversationManager` 独立为 Service

目前该类在 `index.ts` 内部定义，应移至 `services/conversation/sessionConversationManager.ts`，并通过依赖注入获取 `toolExecutor` 等依赖。

### 2.6 工具函数与常量外移

- `createSuccessResponse` / `createErrorResponse` → `utils/response.ts`
- `authMiddleware` → `utils/auth.ts`
- `websocketPayloadToText` → `utils/websocket.ts`
- 工作目录相关辅助函数（`readDirectory`, `detectLanguage`, `getMimeType`, `resolveWorkdirFullPath` 等）→ `utils/workdir.ts`
- `AVAILABLE_MODELS`, `PORT`, `WS_PORT` 等 → `utils/constants.ts`

## 3. 拆分顺序建议


| 阶段  | 任务                                                 | 预估影响             |
| --- | -------------------------------------------------- | ---------------- |
| 1   | 提取所有工具函数与常量到 `utils/`                              | 低风险，纯代码移动        |
| 2   | 提取 `SessionConversationManager` 类到 `services/`     | 需调整引用路径          |
| 3   | 拆分 HTTP 路由到 `routes/` 各文件                          | 需重构 `fetch` 处理逻辑 |
| 4   | 拆分 WebSocket 消息处理到 `websocket/handlers/`           | 需重构 `message` 事件 |
| 5   | 将 `initializeRPCMethods` 移至 `server/rpcMethods.ts` | 独立模块             |
| 6   | 精简 `index.ts` 为纯启动入口                               | 收尾工作             |


## 4. 依赖关系管理

拆分后需注意循环依赖。建议使用**依赖注入**或**服务定位器**模式解决：

```typescript
// services/index.ts
export const services = {
  sessionManager: SessionManager.getInstance(),
  toolExecutor,
  mcpBridge: getMCPBridge(),
  // ...
}
```

各模块通过 `services` 对象获取所需依赖，避免直接互相导入。

## 5. 注意事项

- 拆分过程中保持原有逻辑不变，每完成一个阶段运行测试确保功能正常。
- 类型定义（如 `WebSocketData`, `RPCContext`）集中到 `types/` 目录。
- 原 `index.ts` 中大量的 `console.log` 调试信息可后续统一替换为日志服务。

