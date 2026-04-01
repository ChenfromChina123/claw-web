import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getPool } from '../db/mysql'
import { generateToken } from './jwtService'
import type { User, AuthResponse, LoginRequest, RegisterRequest, ResetPasswordRequest } from '../models/types'

const CODE_EXPIRE_MINUTES = 5

function emailRegex(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export class AuthService {
  async sendRegisterCode(email: string): Promise<void> {
    if (!emailRegex(email)) {
      throw new Error('邮箱格式不正确')
    }

    const pool = getPool()
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
    if ((existing as any[]).length > 0) {
      throw new Error('该邮箱已被注册')
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000)

    await pool.query(
      'INSERT INTO verification_codes (id, email, code, usage_type, expires_at, is_used) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), email, code, 'register', expiresAt, false]
    )

    console.log(`注册验证码 ${code} 已发送到 ${email}`)
    console.log(`[开发模式] 验证码: ${code}`)
  }

  async register(request: RegisterRequest): Promise<AuthResponse> {
    const { email, username, password, code } = request

    if (!emailRegex(email)) {
      throw new Error('邮箱格式不正确')
    }

    if (username.length < 2 || username.length > 50) {
      throw new Error('用户名长度必须在2-50个字符之间')
    }

    if (password.length < 6) {
      throw new Error('密码至少6位')
    }

    const pool = getPool()
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
    if ((existing as any[]).length > 0) {
      throw new Error('该邮箱已被注册')
    }

    const [codes] = await pool.query(
      `SELECT * FROM verification_codes 
       WHERE email = ? AND usage_type = 'register' AND is_used = FALSE AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    ) as [any[], unknown]

    const validCode = (codes as any[])[0]
    if (!validCode || validCode.code !== code) {
      throw new Error('验证码无效或已过期')
    }

    await pool.query('UPDATE verification_codes SET is_used = TRUE WHERE id = ?', [validCode.id])

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = uuidv4()

    await pool.query(
      `INSERT INTO users (id, username, email, password_hash, is_active) VALUES (?, ?, ?, ?, TRUE)`,
      [userId, username, email, passwordHash]
    )

    const token = await generateToken({ userId, email })

    console.log(`用户注册成功: ${email}`)

    return {
      accessToken: token,
      tokenType: 'Bearer',
      userId,
      username,
      email,
      isAdmin: false,
      avatar: '/avatars/default.png',
    }
  }

  async login(request: LoginRequest): Promise<AuthResponse> {
    const { email, password } = request

    if (!email || !password) {
      throw new Error('邮箱和密码不能为空')
    }

    const pool = getPool()
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? AND is_active = TRUE', [email])
    const users = rows as any[]

    if (users.length === 0) {
      throw new Error('用户不存在或已被禁用')
    }

    const user = users[0]
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      throw new Error('密码错误')
    }

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id])

    const token = await generateToken({
      userId: user.id,
      email: user.email,
      isAdmin: user.is_admin,
    })

    console.log(`用户登录成功: ${email}`)

    return {
      accessToken: token,
      tokenType: 'Bearer',
      userId: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.is_admin || false,
      avatar: user.avatar || '/avatars/default.png',
    }
  }

  async sendForgotPasswordCode(email: string): Promise<void> {
    if (!emailRegex(email)) {
      throw new Error('邮箱格式不正确')
    }

    const pool = getPool()
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
    if ((existing as any[]).length === 0) {
      throw new Error('该邮箱未注册')
    }

    const code = generateCode()
    const expiresAt = new Date(Date.now() + CODE_EXPIRE_MINUTES * 60 * 1000)

    await pool.query(
      'INSERT INTO verification_codes (id, email, code, usage_type, expires_at, is_used) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), email, code, 'reset_password', expiresAt, false]
    )

    console.log(`重置密码验证码 ${code} 已发送到 ${email}`)
    console.log(`[开发模式] 验证码: ${code}`)
  }

  async resetPassword(request: ResetPasswordRequest): Promise<void> {
    const { email, code, newPassword } = request

    if (!emailRegex(email)) {
      throw new Error('邮箱格式不正确')
    }

    if (newPassword.length < 6) {
      throw new Error('密码至少6位')
    }

    const pool = getPool()
    const [codes] = await pool.query(
      `SELECT * FROM verification_codes 
       WHERE email = ? AND usage_type = 'reset_password' AND is_used = FALSE AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [email]
    ) as [any[], unknown]

    const validCode = (codes as any[])[0]
    if (!validCode || validCode.code !== code) {
      throw new Error('验证码无效或已过期')
    }

    await pool.query('UPDATE verification_codes SET is_used = TRUE WHERE id = ?', [validCode.id])

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password_hash = ? WHERE email = ?', [passwordHash, email])

    console.log(`用户重置密码成功: ${email}`)
  }

  async getUserById(userId: string): Promise<User | null> {
    const pool = getPool()
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId])
    const users = rows as any[]

    if (users.length === 0) {
      return null
    }

    const user = users[0]
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      isActive: user.is_active,
      isAdmin: user.is_admin,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_login,
    }
  }
}

export const authService = new AuthService()
