/**
 * Request Router Middleware - 请求路由中间件
 *
 * 功能：
 * - 将用户请求路由到对应的Worker容器
 * - 反向代理HTTP请求
 * - WebSocket连接转发
 * - 负载均衡与故障转移
 * - 请求追踪与日志记录
 *
 * 工作流程：
 * 1. 提取用户身份（JWT Token）
 * 2. 查询用户-容器映射
 * 3. 若无容器，触发调度分配
 * 4. 反向代理请求到目标Worker
 * 5. 返回响应给客户端
 */

import { Request, Response, NextFunction } from 'express'
import { getContainerOrchestrator, type UserContainerMapping } from '../orchestrator/containerOrchestrator'
import { getSchedulingPolicy } from '../orchestrator/schedulingPolicy'

// ==================== 类型定义 ====================

/**
 * 路由上下文（附加到req对象）
 */
export interface RoutingContext {
  /** 用户ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 用户角色 */
  role?: string
  /** 目标容器信息 */
  targetContainer?: {
    containerId: string
    hostPort: number
    containerName: string
  }
  /** 是否使用了路由 */
  isRouted: boolean
  /** 路由时间戳 */
  routedAt: Date
}

/**
 * 路由选项
 */
export interface RouterOptions {
  /** 是否启用自动分配容器 */
  autoAssignContainer: boolean
  /** 超时时间（毫秒）*/
  timeoutMs: number
  /** 最大重试次数 */
  maxRetries: number
  /** 是否启用请求追踪 */
  enableTracing: boolean
}

// ==================== 默认配置 ====================

const DEFAULT_ROUTER_OPTIONS: Required<RouterOptions> = {
  autoAssignContainer: process.env.AUTO_ASSIGN_CONTAINER !== 'false',
  timeoutMs: parseInt(process.env.ROUTER_TIMEOUT_MS || '30000', 10),
  maxRetries: parseInt(process.env.ROUTER_MAX_RETRIES || '2', 10),
  enableTracing: process.env.ENABLE_REQUEST_TRACING === 'true'
}

// ==================== 辅助函数 ====================

/**
 * 从请求中提取用户身份
 */
function extractUserFromRequest(req: Request): { userId?: string; username?: string; role?: string } | null {
  // 方式1：从Authorization header提取
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      // 尝试解码JWT获取用户信息（简化版）
      const payload = decodeJWTPayload(token)
      return {
        userId: payload.userId || payload.sub,
        username: payload.username || payload.email,
        role: payload.role
      }
    } catch {
      // 解码失败，继续尝试其他方式
    }
  }

  // 方式2：从查询参数提取（用于WebSocket等场景）
  if (req.query.userId) {
    return {
      userId: req.query.userId as string,
      username: req.query.username as string
    }
  }

  // 方式3：从自定义header提取
  const xUserId = req.headers['x-user-id'] as string
  if (xUserId) {
    return {
      userId: xUserId,
      username: req.headers['x-user-name'] as string,
      role: req.headers['x-user-role'] as string
    }
  }

  return null
}

/**
 * 简化的JWT Payload解码（不验证签名）
 */
function decodeJWTPayload(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payload = parts[1]
    const decoded = Buffer.from(payload, 'base64url').toString()
    return JSON.parse(decoded)

  } catch (error) {
    console.error('[RequestRouter] JWT解码失败:', error)
    return {}
  }
}

/**
 * 执行HTTP反向代理
 */
async function proxyHttpRequest(
  targetPort: number,
  originalReq: Request,
  originalRes: Response,
  path: string
): Promise<void> {
  const targetUrl = `http://localhost:${targetPort}${path}`

  try {
    // 使用fetch进行代理（Node.js 18+内置）
    const proxyHeaders = new Headers()

    // 转发原始headers（过滤掉hop-by-hop headers）
    const hopByHopHeaders = [
      'host', 'connection', 'keep-alive', 'transfer-encoding',
      'upgrade', 'proxy-authenticate', 'proxy-authorization',
      'te', 'trailers'
    ]

    for (const [key, value] of Object.entries(originalReq.headers)) {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        proxyHeaders.set(key, value as string)
      }
    }

    // 添加标识头，表明这是来自Master的代理请求
    proxyHeaders.set('X-Forwarded-For', originalReq.ip || 'unknown')
    proxyHeaders.set('X-Proxy-Origin', 'claw-web-master')
    proxyHeaders.set('Host', `localhost:${targetPort}`)

    const response = await fetch(targetUrl, {
      method: originalReq.method,
      headers: proxyHeaders,
      body: ['GET', 'HEAD'].includes(originalReq.method) ? undefined : originalReq.body,
      signal: AbortSignal.timeout(DEFAULT_ROUTER_OPTIONS.timeoutMs)
    })

    // 转发响应状态和headers
    originalRes.status(response.status)

    response.headers.forEach((value, key) => {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        originalRes.setHeader(key, value)
      }
    })

    // 流式转发响应体
    const reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        originalRes.write(value)
      }
    }

    originalRes.end()

  } catch (error) {
    console.error(`[RequestRouter] 代理请求失败 (${targetUrl}):`, error)

    if ((error as any).name === 'TimeoutError') {
      originalRes.status(504).json({
        success: false,
        error: '网关超时',
        code: 'GATEWAY_TIMEOUT'
      })
    } else {
      originalRes.status(502).json({
        success: false,
        error: '无法连接到后端服务',
        code: 'BAD_GATEWAY'
      })
    }
  }
}

// ==================== 主中间件函数 ====================

/**
 * 创建请求路由中间件
 * @param options 可选的路由配置
 * @returns Express中间件函数
 */
export function createRequestRouter(options?: Partial<RouterOptions>) {
  const config = { ...DEFAULT_ROUTER_OPTIONS, ...options }

  /**
   * Express中间件主函数
   */
  async function requestRouterMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const startTime = Date.now()

    try {
      // 1. 提取用户身份
      const userInfo = extractUserFromRequest(req)

      if (!userInfo.userId) {
        // 无法识别用户的请求直接放行（可能是公开API或静态资源）
        if (DEFAULT_ROUTER_OPTIONS.enableTracing) {
          console.log(`[RequestRouter] 未识别用户，放行请求: ${req.method} ${req.path}`)
        }
        return next()
      }

      // 2. 查询用户容器映射
      const orchestrator = getContainerOrchestrator()
      let mapping = orchestrator.getUserMapping(userInfo.userId)

      // 3. 如果没有映射且启用了自动分配，则触发调度
      if (!mapping && config.autoAssignContainer) {
        const schedulingPolicy = getSchedulingPolicy()

        if (DEFAULT_ROUTER_OPTIONS.enableTracing) {
          console.log(
            `[RequestRouter] 用户 ${userInfo.userId} 无容器，开始调度...`
          )
        }

        const scheduleResult = await schedulingPolicy.scheduleContainer(
          userInfo.userId,
          userInfo.username,
          { role: userInfo.role }
        )

        if (scheduleResult.success && scheduleResult.mapping) {
          mapping = scheduleResult.mapping

          if (DEFAULT_ROUTER_OPTIONS.enableTracing) {
            console.log(
              `[RequestRouter] 成功为用户 ${userInfo.userId} 分配容器: ` +
              `${mapping.container.containerId} (${scheduleResult.strategy})`
            )
          }
        } else {
          // 调度失败
          console.warn(
            `[RequestRouter] 为用户 ${userInfo.userId} 分配容器失败: ${scheduleResult.error}`
          )

          res.status(503).json({
            success: false,
            error: scheduleResult.error || '暂时无法为您分配服务资源',
            code: scheduleResult.code || 'SCHEDULING_FAILED',
            retryAfter: 30  // 建议30秒后重试
          })
          res.setHeader('Retry-After', '30')
          return
        }
      }

      // 4. 如果仍然没有映射，放行请求（可能走共享模式或其他处理）
      if (!mapping) {
        if (DEFAULT_ROUTER_OPTIONS.enableTracing) {
          console.log(
            `[RequestRouter] 用户 ${userInfo.userId} 无容器且未分配，放行请求`
          )
        }
        return next()
      }

      // 5. 构建路由上下文并附加到请求对象
      const routingContext: RoutingContext = {
        userId: userInfo.userId,
        username: userInfo.username,
        role: userInfo.role,
        targetContainer: {
          containerId: mapping.container.containerId,
          hostPort: mapping.container.hostPort,
          containerName: mapping.container.containerName
        },
        isRouted: true,
        routedAt: new Date()
      }

      ;(req as any).routingContext = routingContext

      // 6. 更新最后活动时间
      const mapper = await import('../orchestrator/userContainerMapper').then(m => m.getUserContainerMapper())
      mapper.updateLastActivity(userInfo.userId)

      // 7. 执行反向代理
      if (DEFAULT_ROUTER_OPTIONS.enableTracing) {
        console.log(
          `[RequestRouter] 代理请求: ${req.method} ${req.path} -> ` +
          `container:${routingContext.targetContainer.containerName}:${routingContext.targetContainer.hostPort}`
        )
      }

      await proxyHttpRequest(
        routingContext.targetContainer.hostPort,
        req,
        res,
        req.originalUrl || req.url
      )

      // 8. 记录耗时
      const duration = Date.now() - startTime
      if (duration > 1000) {
        console.warn(
          `[RequestRouter] 慢请求警告: ${req.method} ${req.path} -> ` +
          `${duration}ms`
        )
      }

    } catch (error) {
      console.error('[RequestRouter] 路由中间件异常:', error)

      // 确保未发送响应时才发送错误
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '内部服务器错误',
          code: 'INTERNAL_ERROR'
        })
      }
    }
  }

  return requestRouterMiddleware
}

// ==================== WebSocket路由辅助函数 ====================

/**
 * 处理WebSocket升级请求的路由
 *
 * 注意：Express不原生支持WebSocket，
 * 此函数用于在WebSocket服务器中使用
 */
export async function routeWebSocketConnection(
  userId: string,
  ws: any,
  upgradeReq: any
): Promise<{
  success: boolean
  targetPort?: number
  containerId?: string
  error?: string
}> {
  try {
    // 查询或创建映射
    const orchestrator = getContainerOrchestrator()
    let mapping = orchestrator.getUserMapping(userId)

    if (!mapping) {
      const schedulingPolicy = getSchedulingPolicy()
      const result = await schedulingPolicy.scheduleContainer(userId)

      if (!result.success || !result.mapping) {
        return {
          success: false,
          error: result.error || '无法分配容器'
        }
      }

      mapping = result.mapping
    }

    // 返回目标端口信息（由调用方建立实际的WS连接）
    return {
      success: true,
      targetPort: mapping.container.hostPort,
      containerId: mapping.container.containerId
    }

  } catch (error) {
    console.error('[RequestRouter] WebSocket路由失败:', error)
    return {
      success: false,
      error: 'WebSocket路由失败'
    }
  }
}

// ==================== 导出 ====================

export default createRequestRouter
