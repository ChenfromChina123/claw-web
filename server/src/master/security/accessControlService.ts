/**
 * 访问控制服务
 * 
 * 功能：
 * - 基于角色的访问控制（RBAC）
 * - 权限验证
 * - 资源所有权验证
 * - API 访问限制
 * 
 * 使用场景：
 * - 验证用户是否有权访问特定资源
 * - 实现细粒度的权限控制
 * - 防止未授权访问
 */

// ==================== 类型定义 ====================

/**
 * 用户角色
 */
export type UserRole = 'admin' | 'user' | 'guest'

/**
 * 权限类型
 */
export type Permission = 
  | 'project:create'
  | 'project:read'
  | 'project:update'
  | 'project:delete'
  | 'project:start'
  | 'project:stop'
  | 'project:logs'
  | 'domain:create'
  | 'domain:delete'
  | 'ssl:create'
  | 'ssl:delete'
  | 'tunnel:create'
  | 'tunnel:delete'
  | 'admin:all'

/**
 * 资源类型
 */
export type ResourceType = 
  | 'project'
  | 'domain'
  | 'ssl_certificate'
  | 'tunnel'
  | 'user'
  | 'system'

/**
 * 访问控制规则
 */
export interface AccessControlRule {
  role: UserRole
  permissions: Permission[]
  resourceLimits?: {
    maxProjects?: number
    maxDomains?: number
    maxTunnels?: number
    maxStorageMB?: number
  }
}

/**
 * 用户权限上下文
 */
export interface UserPermissionContext {
  userId: string
  role: UserRole
  permissions: Permission[]
  resourceOwnership: Map<string, string[]>
}

/**
 * 访问控制决策
 */
export interface AccessDecision {
  allowed: boolean
  reason?: string
  requiredPermissions?: Permission[]
  missingPermissions?: Permission[]
}

// ==================== 访问控制服务 ====================

export class AccessControlService {
  private rolePermissions: Map<UserRole, Permission[]>
  private resourceLimits: Map<UserRole, any>

  constructor() {
    this.rolePermissions = new Map()
    this.resourceLimits = new Map()
    this.initializeDefaultRules()
  }

  /**
   * 初始化默认访问控制规则
   */
  private initializeDefaultRules() {
    // 管理员权限
    this.rolePermissions.set('admin', [
      'admin:all',
      'project:create',
      'project:read',
      'project:update',
      'project:delete',
      'project:start',
      'project:stop',
      'project:logs',
      'domain:create',
      'domain:delete',
      'ssl:create',
      'ssl:delete',
      'tunnel:create',
      'tunnel:delete'
    ])

    // 普通用户权限
    this.rolePermissions.set('user', [
      'project:create',
      'project:read',
      'project:update',
      'project:delete',
      'project:start',
      'project:stop',
      'project:logs',
      'domain:create',
      'domain:delete',
      'ssl:create',
      'ssl:delete',
      'tunnel:create',
      'tunnel:delete'
    ])

    // 访客权限
    this.rolePermissions.set('guest', [
      'project:read'
    ])

    // 资源限制
    this.resourceLimits.set('admin', {
      maxProjects: 100,
      maxDomains: 50,
      maxTunnels: 50,
      maxStorageMB: 51200 // 50 GB
    })

    this.resourceLimits.set('user', {
      maxProjects: 10,
      maxDomains: 5,
      maxTunnels: 5,
      maxStorageMB: 10240 // 10 GB
    })

    this.resourceLimits.set('guest', {
      maxProjects: 0,
      maxDomains: 0,
      maxTunnels: 0,
      maxStorageMB: 0
    })
  }

  /**
   * 检查用户是否有特定权限
   */
  hasPermission(role: UserRole, permission: Permission): boolean {
    const permissions = this.rolePermissions.get(role) || []
    
    // 管理员拥有所有权限
    if (permissions.includes('admin:all')) {
      return true
    }

    return permissions.includes(permission)
  }

  /**
   * 检查用户是否有多个权限
   */
  hasPermissions(role: UserRole, permissions: Permission[]): AccessDecision {
    const userPermissions = this.rolePermissions.get(role) || []
    
    // 管理员拥有所有权限
    if (userPermissions.includes('admin:all')) {
      return { allowed: true }
    }

    const missingPermissions = permissions.filter(p => !userPermissions.includes(p))

    return {
      allowed: missingPermissions.length === 0,
      reason: missingPermissions.length > 0 ? `缺少权限: ${missingPermissions.join(', ')}` : undefined,
      requiredPermissions: permissions,
      missingPermissions
    }
  }

  /**
   * 验证资源所有权
   */
  async verifyResourceOwnership(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    context: UserPermissionContext
  ): Promise<boolean> {
    // 管理员可以访问所有资源
    if (context.role === 'admin') {
      return true
    }

    // 检查资源所有权
    const ownedResources = context.resourceOwnership.get(resourceType) || []
    return ownedResources.includes(resourceId)
  }

  /**
   * 检查资源限制
   */
  checkResourceLimit(
    role: UserRole,
    resourceType: 'projects' | 'domains' | 'tunnels',
    currentCount: number
  ): { allowed: boolean; limit?: number; remaining?: number } {
    const limits = this.resourceLimits.get(role)
    
    if (!limits) {
      return { allowed: false }
    }

    const limitKey = `max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}` as keyof typeof limits
    const limit = limits[limitKey] as number

    return {
      allowed: currentCount < limit,
      limit,
      remaining: Math.max(0, limit - currentCount)
    }
  }

  /**
   * 获取用户角色
   */
  getUserRole(userId: string): UserRole {
    // TODO: 从数据库或缓存获取用户角色
    // 这里暂时返回默认角色
    return 'user'
  }

  /**
   * 创建权限上下文
   */
  async createUserPermissionContext(userId: string): Promise<UserPermissionContext> {
    const role = this.getUserRole(userId)
    const permissions = this.rolePermissions.get(role) || []

    // TODO: 从数据库获取用户拥有的资源
    const resourceOwnership = new Map<string, string[]>()

    return {
      userId,
      role,
      permissions,
      resourceOwnership
    }
  }

  /**
   * 检查 API 访问权限
   */
  async checkAPIAccess(
    userId: string,
    endpoint: string,
    method: string,
    resourceId?: string
  ): Promise<AccessDecision> {
    const context = await this.createUserPermissionContext(userId)

    // 根据端点和方法确定所需权限
    const requiredPermission = this.getRequiredPermission(endpoint, method)

    if (!requiredPermission) {
      return { allowed: true }
    }

    // 检查权限
    const permissionCheck = this.hasPermissions(context.role, [requiredPermission])
    
    if (!permissionCheck.allowed) {
      return permissionCheck
    }

    // 如果涉及特定资源，检查所有权
    if (resourceId) {
      const resourceType = this.getResourceType(endpoint)
      if (resourceType) {
        const hasOwnership = await this.verifyResourceOwnership(
          userId,
          resourceType,
          resourceId,
          context
        )

        if (!hasOwnership) {
          return {
            allowed: false,
            reason: '您没有权限访问此资源'
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 根据端点和方法获取所需权限
   */
  private getRequiredPermission(endpoint: string, method: string): Permission | null {
    const permissionMap: Record<string, Record<string, Permission>> = {
      '/api/deployments': {
        POST: 'project:create',
        GET: 'project:read',
        PUT: 'project:update',
        DELETE: 'project:delete'
      },
      '/api/external-access/domain': {
        POST: 'domain:create',
        DELETE: 'domain:delete'
      },
      '/api/external-access/ssl': {
        POST: 'ssl:create',
        DELETE: 'ssl:delete'
      },
      '/api/external-access/tunnel': {
        POST: 'tunnel:create',
        DELETE: 'tunnel:delete'
      }
    }

    // 匹配端点
    for (const [pattern, methods] of Object.entries(permissionMap)) {
      if (endpoint.startsWith(pattern)) {
        return methods[method] || null
      }
    }

    return null
  }

  /**
   * 根据端点获取资源类型
   */
  private getResourceType(endpoint: string): ResourceType | null {
    if (endpoint.includes('/deployments')) return 'project'
    if (endpoint.includes('/domain')) return 'domain'
    if (endpoint.includes('/ssl')) return 'ssl_certificate'
    if (endpoint.includes('/tunnel')) return 'tunnel'
    return null
  }

  /**
   * 授予用户额外权限（管理员功能）
   */
  grantPermission(userId: string, permission: Permission): boolean {
    // TODO: 实现权限授予逻辑
    console.log(`[AccessControlService] 授予用户 ${userId} 权限: ${permission}`)
    return true
  }

  /**
   * 撤销用户权限（管理员功能）
   */
  revokePermission(userId: string, permission: Permission): boolean {
    // TODO: 实现权限撤销逻辑
    console.log(`[AccessControlService] 撤销用户 ${userId} 权限: ${permission}`)
    return true
  }
}

// ==================== 单例实例 ====================

let accessControlService: AccessControlService | null = null

/**
 * 获取访问控制服务实例
 */
export function getAccessControlService(): AccessControlService {
  if (!accessControlService) {
    accessControlService = new AccessControlService()
  }
  return accessControlService
}
