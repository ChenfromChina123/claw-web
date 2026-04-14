import { jwtDecode, type JwtPayload } from 'jwt-decode'
import type { User } from '@/types'

export interface DecodedToken extends JwtPayload {
  userId: string
  email?: string
  isAdmin?: boolean
}

/**
 * 解码 JWT Token
 * @param token JWT Token 字符串
 * @returns 解码后的 Token 信息
 */
export function decodeToken(token: string): DecodedToken {
  return jwtDecode<DecodedToken>(token)
}

/**
 * 检查 Token 是否有效（未过期）
 * @param token JWT Token 字符串
 * @returns Token 是否有效
 */
export function isTokenValid(token: string): boolean {
  try {
    const decoded = decodeToken(token)
    console.log('[AuthService] Decoded token:', { 
      userId: decoded.userId, 
      exp: decoded.exp, 
      currentTime: Date.now() / 1000 
    })
    const currentTime = Date.now() / 1000
    const isValid = !!decoded.exp && decoded.exp > currentTime
    console.log('[AuthService] Token validation:', { isValid, exp: decoded.exp, currentTime })
    return isValid
  } catch (error) {
    console.error('[AuthService] Token validation error:', error)
    return false
  }
}

/**
 * 获取 Token 过期时间
 * @param token JWT Token 字符串
 * @returns 过期时间（毫秒），如果无效则返回 null
 */
export function getTokenExpiration(token: string): number | null {
  try {
    const decoded = decodeToken(token)
    if (!decoded.exp) return null
    return decoded.exp * 1000
  } catch {
    return null
  }
}

/**
 * 检查 Token 是否即将过期（剩余时间少于 5 分钟）
 * @param token JWT Token 字符串
 * @returns 是否即将过期
 */
export function isTokenExpiring(token: string): boolean {
  const expiration = getTokenExpiration(token)
  if (!expiration) return false
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000
  return expiration - now < fiveMinutes
}

/**
 * 从 localStorage 获取当前用户信息
 * @returns 用户信息，如果未登录或 Token 无效则返回 null
 */
export function getCurrentUserFromToken(): User | null {
  const token = localStorage.getItem('token')
  if (!token || !isTokenValid(token)) {
    return null
  }
  try {
    const decoded = decodeToken(token)
    return {
      id: decoded.userId,
      email: decoded.email || '',
      username: decoded.email?.split('@')[0] || 'User',
      avatar: '/avatars/default.png',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * 检查用户是否已登录且 Token 有效
 * @returns 是否已登录
 */
export function checkLoginStatus(): boolean {
  const token = localStorage.getItem('token')
  if (!token) return false
  return isTokenValid(token)
}
