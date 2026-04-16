/**
 * 外部访问 API 路由
 * 
 * 提供的端点：
 * - POST /api/external-access/domain - 为项目分配域名
 * - POST /api/external-access/domain/verify - 验证域名所有权
 * - GET /api/external-access/domain/:projectId - 获取项目域名信息
 * - DELETE /api/external-access/domain/:domainId - 删除域名
 * - POST /api/external-access/ssl - 申请 SSL 证书
 * - POST /api/external-access/ssl/renew - 续期 SSL 证书
 * - POST /api/external-access/tunnel - 创建内网穿透隧道
 * - DELETE /api/external-access/tunnel/:tunnelId - 删除隧道
 * - GET /api/external-access/tunnel/:projectId - 获取项目隧道信息
 */

import { Router, type Request, type Response } from 'express'
import { getReverseProxyService, type ProxyConfig } from '../services/reverseProxyService'
import { getSSLService, type CertificateRequest } from '../services/sslService'
import { getTunnelService, type TunnelConfig } from '../services/tunnelService'
import { getDomainService } from '../services/domainService'
import { verifyToken } from '../utils/auth'

const router = Router()

// ==================== 中间件：认证检查 ====================

/**
 * 认证中间件
 */
async function authMiddleware(req: Request, res: Response, next: Function) {
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

    ;(req as any).user = payload
    next()
  } catch (error) {
    console.error('[ExternalAccessRoutes] 认证中间件错误:', error)
    return res.status(500).json({
      success: false,
      error: '服务器内部错误'
    })
  }
}

// ==================== 域名管理路由 ====================

/**
 * POST /api/external-access/domain
 * 为项目分配域名
 */
router.post('/domain', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId, customDomain } = req.body

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：projectId'
      })
    }

    const domainService = getDomainService()
    const domainInfo = await domainService.assignDomain(projectId, user.userId, customDomain)

    res.json({
      success: true,
      data: domainInfo,
      message: '域名分配成功'
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 域名分配失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '域名分配失败'
    })
  }
})

/**
 * POST /api/external-access/domain/verify
 * 验证域名所有权
 */
router.post('/domain/verify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { domain, method = 'dns' } = req.body

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：domain'
      })
    }

    const domainService = getDomainService()
    const verification = await domainService.verifyDomain(domain, method)

    res.json({
      success: true,
      data: verification
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 域名验证失败:', error)
    res.status(500).json({
      success: false,
      error: '域名验证失败'
    })
  }
})

/**
 * GET /api/external-access/domain/:projectId
 * 获取项目域名信息
 */
router.get('/domain/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params

    // TODO: 从数据库查询域名信息
    res.json({
      success: true,
      data: {
        projectId,
        message: '功能开发中'
      }
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 获取域名信息失败:', error)
    res.status(500).json({
      success: false,
      error: '获取域名信息失败'
    })
  }
})

/**
 * DELETE /api/external-access/domain/:domainId
 * 删除域名
 */
router.delete('/domain/:domainId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { domainId } = req.params
    const domainService = getDomainService()

    await domainService.deleteDomain(domainId)

    res.json({
      success: true,
      message: '域名已删除'
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 删除域名失败:', error)
    res.status(500).json({
      success: false,
      error: '删除域名失败'
    })
  }
})

// ==================== SSL 证书管理路由 ====================

/**
 * POST /api/external-access/ssl
 * 申请 SSL 证书
 */
router.post('/ssl', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { domain, email, staging, wildcard, dnsProvider, dnsCredentials } = req.body

    if (!domain || !email) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：domain, email'
      })
    }

    const sslService = getSSLService()
    const request: CertificateRequest = {
      domain,
      email,
      staging,
      wildcard,
      dnsProvider,
      dnsCredentials
    }

    const result = await sslService.requestCertificate(request)

    res.json({
      success: result.success,
      data: result,
      message: result.message
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] SSL 证书申请失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'SSL 证书申请失败'
    })
  }
})

/**
 * POST /api/external-access/ssl/renew
 * 续期 SSL 证书
 */
router.post('/ssl/renew', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { domains, force, dryRun } = req.body

    const sslService = getSSLService()
    const result = await sslService.renewCertificate({ domains, force, dryRun })

    res.json({
      success: result.success,
      data: result,
      message: result.message
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] SSL 证书续期失败:', error)
    res.status(500).json({
      success: false,
      error: 'SSL 证书续期失败'
    })
  }
})

/**
 * GET /api/external-access/ssl/list
 * 列出所有 SSL 证书
 */
router.get('/ssl/list', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sslService = getSSLService()
    const certificates = await sslService.listCertificates()

    res.json({
      success: true,
      data: {
        total: certificates.length,
        certificates
      }
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 获取证书列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取证书列表失败'
    })
  }
})

// ==================== 内网穿透管理路由 ====================

/**
 * POST /api/external-access/tunnel
 * 创建内网穿透隧道
 */
router.post('/tunnel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId, type, localPort, subdomain, customDomain, auth } = req.body

    if (!projectId || !type || !localPort) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：projectId, type, localPort'
      })
    }

    const tunnelService = getTunnelService()
    const config: TunnelConfig = {
      projectId,
      type,
      localPort,
      subdomain,
      customDomain,
      auth
    }

    const tunnelInfo = await tunnelService.createTunnel(config)

    res.json({
      success: true,
      data: tunnelInfo,
      message: '隧道创建成功'
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 创建隧道失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建隧道失败'
    })
  }
})

/**
 * DELETE /api/external-access/tunnel/:tunnelId
 * 删除隧道
 */
router.delete('/tunnel/:tunnelId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { tunnelId } = req.params
    const { type } = req.query

    if (!type) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：type'
      })
    }

    const tunnelService = getTunnelService()
    await tunnelService.stopTunnel(tunnelId, type as any)

    res.json({
      success: true,
      message: '隧道已删除'
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 删除隧道失败:', error)
    res.status(500).json({
      success: false,
      error: '删除隧道失败'
    })
  }
})

/**
 * GET /api/external-access/tunnel/:projectId
 * 获取项目隧道信息
 */
router.get('/tunnel/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params

    // TODO: 从数据库查询隧道信息
    res.json({
      success: true,
      data: {
        projectId,
        message: '功能开发中'
      }
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 获取隧道信息失败:', error)
    res.status(500).json({
      success: false,
      error: '获取隧道信息失败'
    })
  }
})

// ==================== 反向代理管理路由 ====================

/**
 * POST /api/external-access/proxy
 * 配置反向代理
 */
router.post('/proxy', authMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      projectId,
      domain,
      workerPort,
      internalPort,
      sslEnabled,
      accessControl
    } = req.body

    if (!projectId || !domain || !workerPort || !internalPort) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：projectId, domain, workerPort, internalPort'
      })
    }

    const reverseProxyService = getReverseProxyService()

    // 生成 Nginx 配置
    const config: ProxyConfig = {
      projectId,
      domain,
      workerPort,
      internalPort,
      sslEnabled: sslEnabled || false,
      accessControl
    }

    const nginxConfig = await reverseProxyService.generateNginxConfig(config)

    // 写入配置文件
    await reverseProxyService.writeNginxConfig(projectId, nginxConfig)

    // 重载 Nginx
    const reloaded = await reverseProxyService.reloadNginx()

    res.json({
      success: reloaded,
      data: {
        projectId,
        domain,
        configPath: `/etc/nginx/conf.d/${projectId}.conf`
      },
      message: reloaded ? '反向代理配置成功' : 'Nginx 重载失败'
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 反向代理配置失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '反向代理配置失败'
    })
  }
})

/**
 * GET /api/external-access/proxy/stats
 * 获取代理统计信息
 */
router.get('/proxy/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const reverseProxyService = getReverseProxyService()
    const stats = await reverseProxyService.getProxyStats()

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('[ExternalAccessRoutes] 获取统计信息失败:', error)
    res.status(500).json({
      success: false,
      error: '获取统计信息失败'
    })
  }
})

export default router
