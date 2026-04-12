/**
 * 路由模块导出
 * 
 * 统一注册和管理所有 HTTP 路由
 */

// 认证路由
export { handleAuthRoutes, default as authRoutes } from './auth.routes'

// 会话路由
export { handleSessionRoutes, default as sessionRoutes } from './sessions.routes'

// 工具路由
export { handleToolsRoutes, default as toolsRoutes } from './tools.routes'

// Agent 路由
export { handleAgentRoutes, default as agentRoutes } from './agents.routes'

// Agent 工作目录路由
export { handleAgentWorkdirRoutes, default as agentWorkdirRoutes } from './agent.routes'

// MCP 路由
export { handleMCPRoutes, default as mcpRoutes } from './mcp.routes'

// 监控路由
export { handleMonitoringRoutes, default as monitoringRoutes } from './monitoring.routes'

// 诊断路由
export { handleDiagnosticsRoutes, default as diagnosticsRoutes } from './diagnostics.routes'

// 工作区路由
export { handleWorkspaceRoutes, default as workspaceRoutes } from './workspace.routes'

// 提示词模板路由
export { handlePromptTemplateRoutes, default as promptTemplateRoutes } from './promptTemplate.routes'

// Skills 路由
export { handleSkillRoutes, handleSkillImportRoutes, default as skillRoutes } from './skills.routes'

import type { Request, Response } from 'express'

// 所有路由处理器列表（按优先级排序）
const routeHandlers = [
  // 认证相关
  (req: Request) => import('./auth.routes').then(m => m.handleAuthRoutes(req)),

  // Agent 相关（放在会话相关之前，避免路由冲突）
  (req: Request) => import('./agent.routes').then(m => m.handleAgentWorkdirRoutes(req)),

  // 会话相关
  (req: Request) => import('./sessions.routes').then(m => m.handleSessionRoutes(req)),

  // 工具相关
  (req: Request) => import('./tools.routes').then(m => m.handleToolsRoutes(req)),

  // Agent 编排相关
  (req: Request) => import('./agents.routes').then(m => m.handleAgentRoutes(req)),

  // MCP 相关
  (req: Request) => import('./mcp.routes').then(m => m.handleMCPRoutes(req)),

  // 监控相关
  (req: Request) => import('./monitoring.routes').then(m => m.handleMonitoringRoutes(req)),

  // 诊断相关
  (req: Request) => import('./diagnostics.routes').then(m => m.handleDiagnosticsRoutes(req)),

  // 工作区相关
  (req: Request) => import('./workspace.routes').then(m => m.handleWorkspaceRoutes(req)),

  // 提示词模板相关
  (req: Request) => import('./promptTemplate.routes').then(m => m.handlePromptTemplateRoutes(req)),

  // 技能导入相关（放在最后，作为通用处理器）
  (req: Request) => import('./skills.routes').then(m => m.handleSkillImportRoutes(req)),
]

/**
 * 按顺序尝试处理请求，返回第一个非 null 的响应
 */
export async function handleRequest(req: Request): Promise<Response | null> {
  for (const handler of routeHandlers) {
    const result = await handler(req)
    if (result !== null) {
      return result
    }
  }
  return null
}