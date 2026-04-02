/**
 * GitHub OAuth 认证服务
 * 处理GitHub登录流程，包括获取授权URL、处理回调、获取用户信息等
 */

import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../db/mysql'
import { generateToken } from './jwtService'
import type { AuthResponse } from '../models/types'

// GitHub OAuth 配置
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback'

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails'

/**
 * 生成随机用户名
 * 格式: github_ + 8位随机字母数字
 */
function generateRandomUsername(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'github_'
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 检查用户名是否已存在，如果存在则添加随机后缀
 */
async function generateUniqueUsername(pool: any, baseUsername?: string): Promise<string> {
  let username = baseUsername || generateRandomUsername()
  let isUnique = false
  let attempts = 0
  const maxAttempts = 10

  while (!isUnique && attempts < maxAttempts) {
    const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username])
    if ((existing as any[]).length === 0) {
      isUnique = true
    } else {
      // 如果用户名已存在，添加随机后缀
      const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
      username = baseUsername ? `${baseUsername}_${suffix}` : generateRandomUsername()
    }
    attempts++
  }

  if (!isUnique) {
    // 如果尝试多次仍未找到唯一用户名，使用 UUID 前8位
    username = `github_${uuidv4().substring(0, 8)}`
  }

  return username
}

/**
 * GitHub OAuth 认证服务类
 */
export class GithubAuthService {
  /**
   * 获取GitHub OAuth授权URL
   * @param state 可选的状态参数，用于防止CSRF攻击
   * @returns 授权URL
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: GITHUB_CALLBACK_URL,
      scope: 'user:email read:user',
    })

    if (state) {
      params.append('state', state)
    }

    return `${GITHUB_AUTH_URL}?${params.toString()}`
  }

  /**
   * 使用授权码获取访问令牌
   * @param code GitHub返回的授权码
   * @returns 访问令牌
   */
  async getAccessToken(code: string): Promise<string> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    })

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`)
    }

    const data = await response.json() as { access_token?: string; error?: string; error_description?: string }

    if (data.error) {
      throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`)
    }

    if (!data.access_token) {
      throw new Error('No access token received from GitHub')
    }

    return data.access_token
  }

  /**
   * 获取GitHub用户信息
   * @param accessToken GitHub访问令牌
   * @returns 用户信息
   */
  async getUserInfo(accessToken: string): Promise<{
    id: number
    login: string
    name: string | null
    email: string | null
    avatar_url: string
  }> {
    const response = await fetch(GITHUB_USER_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Code-HAHA',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`)
    }

    return await response.json() as {
      id: number
      login: string
      name: string | null
      email: string | null
      avatar_url: string
    }
  }

  /**
   * 获取用户的主邮箱地址
   * @param accessToken GitHub访问令牌
   * @returns 主邮箱地址
   */
  async getPrimaryEmail(accessToken: string): Promise<string | null> {
    const response = await fetch(GITHUB_EMAILS_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Claude-Code-HAHA',
      },
    })

    if (!response.ok) {
      console.warn('Failed to get user emails:', response.statusText)
      return null
    }

    const emails = await response.json() as Array<{
      email: string
      primary: boolean
      verified: boolean
    }>

    // 优先返回主邮箱
    const primaryEmail = emails.find(e => e.primary && e.verified)
    if (primaryEmail) {
      return primaryEmail.email
    }

    // 如果没有主邮箱，返回第一个已验证的邮箱
    const verifiedEmail = emails.find(e => e.verified)
    if (verifiedEmail) {
      return verifiedEmail.email
    }

    return null
  }

  /**
   * 处理GitHub登录回调
   * @param code GitHub返回的授权码
   * @returns 认证响应
   */
  async handleCallback(code: string): Promise<AuthResponse> {
    // 1. 获取访问令牌
    const accessToken = await this.getAccessToken(code)

    // 2. 获取用户信息
    const githubUser = await this.getUserInfo(accessToken)

    // 3. 获取用户邮箱
    let email = githubUser.email
    if (!email) {
      email = await this.getPrimaryEmail(accessToken)
    }

    if (!email) {
      throw new Error('无法获取用户邮箱地址，请确保您的GitHub账号有公开的邮箱或在授权时允许访问邮箱')
    }

    const pool = getPool()

    // 4. 检查用户是否已存在
    const [existingUsers] = await pool.query(
      'SELECT * FROM users WHERE github_id = ? OR email = ?',
      [githubUser.id.toString(), email]
    )

    let userId: string
    let username: string
    let avatar: string

    const users = existingUsers as any[]

    if (users.length > 0) {
      // 用户已存在，更新信息
      const existingUser = users[0]
      userId = existingUser.id
      username = existingUser.username
      avatar = githubUser.avatar_url || existingUser.avatar || '/avatars/default.png'

      // 更新GitHub ID和头像（如果之前没有）
      await pool.query(
        `UPDATE users 
         SET github_id = ?, avatar = ?, last_login = NOW() 
         WHERE id = ?`,
        [githubUser.id.toString(), avatar, userId]
      )

      console.log(`GitHub用户登录成功: ${email}`)
    } else {
      // 新用户，创建账号
      userId = uuidv4()
      // 使用GitHub用户名或生成随机用户名
      const baseUsername = githubUser.login || githubUser.name || ''
      username = await generateUniqueUsername(pool, baseUsername.replace(/[^a-zA-Z0-9_]/g, '_'))
      avatar = githubUser.avatar_url || '/avatars/default.png'

      await pool.query(
        `INSERT INTO users (id, username, email, github_id, avatar, is_active, created_at, updated_at, last_login) 
         VALUES (?, ?, ?, ?, ?, TRUE, NOW(), NOW(), NOW())`,
        [userId, username, email, githubUser.id.toString(), avatar]
      )

      console.log(`GitHub用户注册成功: ${email}`)
    }

    // 5. 生成JWT令牌
    const token = await generateToken({
      userId,
      email,
      isAdmin: false,
    })

    return {
      accessToken: token,
      tokenType: 'Bearer',
      userId,
      username,
      email,
      isAdmin: false,
      avatar,
    }
  }
}

export const githubAuthService = new GithubAuthService()
