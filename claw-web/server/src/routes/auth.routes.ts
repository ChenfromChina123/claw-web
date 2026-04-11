/**
 * 认证路由 - 处理用户认证相关 API
 */

import { authService } from '../services/authService'
import { githubAuthService } from '../services/githubAuthService'
import { verifyToken, extractTokenFromHeader } from '../services/jwtService'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import type { LoginRequest, RegisterRequest, ResetPasswordRequest } from '../models/types'
import { FRONTEND_URL } from '../utils/constants'

/**
 * 处理认证相关的 HTTP 请求
 */
export async function handleAuthRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // 发送注册验证码
  if (path === '/api/auth/register/send-code' && method === 'POST') {
    try {
      const body = await req.json() as { email: string }
      await authService.sendRegisterCode(body.email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  // 用户注册
  if (path === '/api/auth/register' && method === 'POST') {
    try {
      const body = await req.json() as RegisterRequest
      const result = await authService.register({
        email: body.email,
        username: body.username,
        password: body.password,
        code: body.code,
      })
      return createSuccessResponse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '注册失败'
      return createErrorResponse('REGISTER_FAILED', message, 400)
    }
  }

  // 用户登录
  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const body = await req.json() as LoginRequest
      const result = await authService.login({
        email: body.email,
        password: body.password,
      })
      return createSuccessResponse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      return createErrorResponse('LOGIN_FAILED', message, 401)
    }
  }

  // 发送忘记密码验证码
  if (path === '/api/auth/forgot-password/send-code' && method === 'POST') {
    try {
      const body = await req.json() as { email: string }
      await authService.sendForgotPasswordCode(body.email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  // 重置密码
  if (path === '/api/auth/forgot-password' && method === 'POST') {
    try {
      const body = await req.json() as ResetPasswordRequest
      await authService.resetPassword({
        email: body.email,
        code: body.code,
        newPassword: body.newPassword,
      })
      return createSuccessResponse({ message: '密码重置成功' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置密码失败'
      return createErrorResponse('RESET_PASSWORD_FAILED', message, 400)
    }
  }

  // 获取当前用户信息
  if (path === '/api/auth/me' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const user = await authService.getUserById(auth.userId)
      if (!user) {
        return createErrorResponse('USER_NOT_FOUND', '用户不存在', 404)
      }
      return createSuccessResponse(user)
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取用户信息失败'
      return createErrorResponse('GET_USER_FAILED', message, 500)
    }
  }

  // GitHub OAuth 登录
  if (path === '/api/auth/github' && method === 'GET') {
    const authUrl = githubAuthService.getAuthUrl()
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl,
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // GitHub OAuth 回调
  if (path === '/api/auth/github/callback' && method === 'GET') {
    const callbackUrl = new URL(req.url)
    const code = callbackUrl.searchParams.get('code')
    const error = callbackUrl.searchParams.get('error')
    const errorDescription = callbackUrl.searchParams.get('error_description')

    if (error) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${FRONTEND_URL}/login?error=${encodeURIComponent(errorDescription || error)}`,
        },
      })
    }

    if (!code) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${FRONTEND_URL}/login?error=${encodeURIComponent('未收到授权码')}`,
        },
      })
    }

    try {
      const result = await githubAuthService.handleCallback(code)
      const redirectUrl = `${FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(result.accessToken)}&userId=${encodeURIComponent(result.userId)}&username=${encodeURIComponent(result.username)}&email=${encodeURIComponent(result.email)}&avatar=${encodeURIComponent(result.avatar || '')}`
      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub登录失败'
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${FRONTEND_URL}/login?error=${encodeURIComponent(message)}`,
        },
      })
    }
  }

  // 不匹配任何路由，返回 null 让其他路由处理
  return null
}

export default handleAuthRoutes