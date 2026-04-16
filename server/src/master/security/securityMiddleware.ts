/**
 * 安全中间件
 * 
 * 功能：
 * - 请求认证
 * - 权限验证
 * - 速率限制
 * - 安全头设置
 * - 审计日志记录
 * 
 * 使用场景：
 * - 保护 API 端点
 * - 防止未授权访问
 * - 防止 DDoS 攻击
 * - 记录安全事件
 */

import { Request, Response, NextFunction } from 'express'
import { getAccessControlService } from './accessControlService'
import { getQuotaService } from './quotaService'
import { getAuditService } from './auditService'
import { verifyToken } from '../utils/auth'

// ==================== 类型定义 ====================

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    email: string
    role: string
  }
}

interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

// ==================== 安全中间件 ====================

/**
 * 认证中间件
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: '无效或过期的认证令牌'
      })
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role || 'user'
    }

    next()
  } catch (error) {
    console.error('[SecurityMiddleware] 认证失败:', error)
    return res.status(500).json({
      success: false,
      error: '服务器内部错误'
    })
  }
}

/**
 * 权限验证中间件
 */
export function requirePermission(permission: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未认证'
        })
      }

      const accessControl = getAccessControlService()
      const hasPermission = accessControl.hasPermission(
        req.user.role as any,
        permission as any
      )

      if (!hasPermission) {
        // 记录权限拒绝事件
        const auditService = getAuditService()
        await auditService.logResourceAccess(
          req.user.userId,
          req.user.email,
          req.path,
          req.params.id || '',
          '访问资源',
          false,
          req.ip
        )

        return res.status(403).json({
          success: false,
          error: '权限不足'
        })
      }

      next()
    } catch (error) {
      console.error('[SecurityMiddleware] 权限验证失败:', error)
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      })
    }
  }
}

/**
 * 资源所有权验证中间件
 */
export function requireOwnership(resourceType: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未认证'
        })
      }

      // 管理员跳过所有权检查
      if (req.user.role === 'admin') {
        return next()
      }

      const resourceId = req.params.id || req.params.projectId
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: '缺少资源 ID'
        })
      }

      // TODO: 从数据库验证资源所有权
      // const isOwner = await checkResourceOwnership(req.user.userId, resourceType, resourceId)

      // 暂时允许所有请求通过
      next()
    } catch (error) {
      console.error('[SecurityMiddleware] 所有权验证失败:', error)
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      })
    }
  }
}

/**
 * 资源配额检查中间件
 */
export function checkQuota(resourceType: 'project' | 'domain' | 'tunnel') {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: '未认证'
        })
      }

      const quotaService = getQuotaService()
      const canCreate = await quotaService.canCreateResource(
        req.user.userId,
        resourceType
      )

      if (!canCreate) {
        return res.status(429).json({
          success: false,
          error: `已达到${resourceType}创建上限`
        })
      }

      next()
    } catch (error) {
      console.error('[SecurityMiddleware] 配额检查失败:', error)
      return res.status(500).json({
        success: false,
        error: '服务器内部错误'
      })
    }
  }
}

/**
 * 速率限制中间件
 */
export function rateLimit(
  windowMs: number = 60000, // 时间窗口（毫秒）
  maxRequests: number = 100 // 最大请求数
) {
  const store: RateLimitStore = {}

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown'
    const now = Date.now()

    // 清理过期记录
    if (store[key] && now > store[key].resetTime) {
      delete store[key]
    }

    // 初始化或增加计数
    if (!store[key]) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs
      }
    } else {
      store[key].count++
    }

    // 检查是否超限
    if (store[key].count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        retryAfter: Math.ceil((store[key].resetTime - now) / 1000)
      })
    }

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', maxRequests.toString())
    res.setHeader('X-RateLimit-Remaining', (maxRequests - store[key].count).toString())
    res.setHeader('X-RateLimit-Reset', store[key].resetTime.toString())

    next()
  }
}

/**
 * 安全头中间件
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // 防止 XSS 攻击
  res.setHeader('X-XSS-Protection', '1; mode=block')

  // 防止 MIME 类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff')

  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY')

  // HSTS（仅在生产环境启用 HTTPS）
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  // CSP
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  )

  next()
}

/**
 * 审计日志中间件
 */
export function auditLog(action: string) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const startTime = Date.now()

    // 保存原始的 res.json 方法
    const originalJson = res.json.bind(res)

    // 重写 res.json 方法
    res.json = function(body: any): Response {
      const duration = Date.now() - startTime

      // 异步记录审计日志
      ;(async () => {
        try {
          const auditService = getAuditService()
          
          await auditService.log({
            eventType: 'resource.access',
            level: body.success ? 'info' : 'warning',
            userId: req.user?.userId,
            userName: req.user?.email,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            resource: req.path,
            resourceId: req.params.id || req.params.projectId,
            action,
            success: body.success || false,
            details: {
              method: req.method,
              path: req.path,
              statusCode: res.statusCode
            },
            duration
          })
        } catch (error) {
          console.error('[SecurityMiddleware] 审计日志记录失败:', error)
        }
      })()

      return originalJson(body)
    }

    next()
  }
}

/**
 * CORS 中间件
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }

  next()
}

/**
 * 输入验证中间件
 */
export function validateInput(rules: Record<string, (value: any) => boolean>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = []

    for (const [field, validator] of Object.entries(rules)) {
      const value = req.body[field]
      
      if (!validator(value)) {
        errors.push(`字段 ${field} 验证失败`)
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        errors
      })
    }

    next()
  }
}

/**
 * IP 黑名单中间件
 */
export function ipBlacklist(blacklist: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || ''

    if (blacklist.includes(clientIp)) {
      return res.status(403).json({
        success: false,
        error: '访问被拒绝'
      })
    }

    next()
  }
}

/**
 * IP 白名单中间件
 */
export function ipWhitelist(whitelist: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip || ''

    if (!whitelist.includes(clientIp)) {
      return res.status(403).json({
        success: false,
        error: '访问被拒绝'
      })
    }

    next()
  }
}
