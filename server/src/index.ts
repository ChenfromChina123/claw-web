/**
 * Claude Code HAHA - Deep React Integration Server
 * 
 * 项目入口文件
 * 
 * 拆分后的目录结构：
 * - src/
 *   ├── index.ts                  # 入口文件，仅负责启动服务器
 *   ├── server/
 *   │   └── httpServer.ts         # HTTP 服务器配置与启动
 *   ├── routes/                   # HTTP 路由模块
 *   │   ├── auth.routes.ts        # /api/auth/* 路由
 *   │   ├── sessions.routes.ts     # /api/sessions/* 路由
 *   │   ├── tools.routes.ts       # /api/tools/* 路由
 *   │   ├── agents.routes.ts      # /api/agents/* 路由
 *   │   ├── mcp.routes.ts         # /api/mcp/* 路由
 *   │   ├── monitoring.routes.ts  # /api/monitoring/* 路由
 *   │   ├── diagnostics.routes.ts # /api/diagnostics/* 路由
 *   │   └── index.ts              # 统一导出
 *   ├── websocket/                # WebSocket 处理模块
 *   │   └── wsMessageRouter.ts    # 消息路由
 *   ├── services/                 # 业务服务层
 *   │   ├── conversation/         # 会话管理
 *   │   └── ...                   # 其他服务
 *   ├── utils/                   # 工具函数
 *   │   ├── constants.ts          # 常量配置
 *   │   ├── response.ts          # HTTP 响应辅助
 *   │   ├── auth.ts              # 认证中间件
 *   │   ├── websocket.ts         # WebSocket 辅助
 *   │   └── workdir.ts           # 工作目录辅助
 *   └── types/                   # 类型定义
 *       ├── websocket.ts         # WebSocket 类型
 *       └── route.ts             # 路由类型
 */

// 调试信息
console.log('[Env] Checking environment variables...')
console.log('[Env] ANTHROPIC_AUTH_TOKEN exists:', !!process.env.ANTHROPIC_AUTH_TOKEN)
console.log('[Env] ANTHROPIC_AUTH_TOKEN length:', process.env.ANTHROPIC_AUTH_TOKEN?.length)
console.log('[Env] ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL)

// 导入服务器启动函数
import { startServer } from './server/httpServer'

// 启动服务器
startServer().catch((error) => {
  console.error('[Server] Failed to start:', error)
  process.exit(1)
})