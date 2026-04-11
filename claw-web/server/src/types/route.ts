/**
 * HTTP 路由相关类型定义
 */

/**
 * 路由处理函数类型
 */
export type RouteHandler = (req: Request) => Promise<Response> | Response | null

/**
 * 路由中间件类型
 */
export type RouteMiddleware = (req: Request, next: () => Promise<Response | null>) => Promise<Response | null>

/**
 * HTTP 方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS'

/**
 * 路由配置
 */
export interface RouteConfig {
  path: string
  method: HttpMethod
  handler: RouteHandler
  middlewares?: RouteMiddleware[]
}

/**
 * API 响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * 分页参数
 */
export interface PaginationParams {
  limit?: number
  offset?: number
  page?: number
  pageSize?: number
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  page: number
  pageSize: number
}