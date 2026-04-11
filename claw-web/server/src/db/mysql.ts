import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'

let pool: mysql.Pool | null = null

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function loadDbConfig(): DbConfig {
  const config: Record<string, string> = {}

  // 优先从环境变量读取（Docker/生产环境推荐方式）
  const envVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  for (const key of envVars) {
    if (process.env[key]) {
      config[key] = process.env[key]
    }
  }

  // 如果环境变量不完整，尝试从 .env 文件补充
  if (!config['DB_HOST'] || !config['DB_USER']) {
    let configPath = join(__dirname, '../../.env')
    try {
      readFileSync(configPath, 'utf-8')
    } catch {
      configPath = join(process.cwd(), '.env')
    }

    try {
      const envContent = readFileSync(configPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0 && !config[key.trim()]) {
            config[key.trim()] = valueParts.join('=').trim()
          }
        }
      }
    } catch {
      console.log('[loadDbConfig] No .env file found, using environment variables only')
    }
  }

  return {
    host: config['DB_HOST'] || 'localhost',
    port: parseInt(config['DB_PORT'] || '3306', 10),
    user: config['DB_USER'] || 'root',
    password: config['DB_PASSWORD'] || '',
    database: config['DB_NAME'] || 'claude_code_haha',
  }
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = loadDbConfig()
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    })
    console.log('MySQL pool created with config:', { host: config.host, port: config.port, user: config.user, database: config.database })
  }
  return pool
}

export async function initDatabase(): Promise<void> {
  const config = loadDbConfig()

  const tempPool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 2,
  })

  try {
    await tempPool.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\``)
    console.log(`Database ${config.database} ensured`)

    await tempPool.query(`USE \`${config.database}\``)
    console.log(`Using database ${config.database}`)

    // 使用 __dirname 获取当前文件所在目录，然后向上查找
    const currentDir = __dirname // server/src/db/
    const projectRoot = resolve(currentDir, '..', '..') // server/
    const schemaPath = join(projectRoot, 'src', 'db', 'schema.sql')
    const schema = readFileSync(schemaPath, 'utf-8')

    const statements = schema.split(';').filter(s => s.trim())
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await tempPool.query(statement)
        } catch (err: any) {
          if (err.code !== 'ER_TABLE_EXISTS_ERROR' && err.code !== 'ER_DUP_KEYNAME') {
            console.warn('Schema statement warning:', err.message)
          }
        }
      }
    }

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN email VARCHAR(120) UNIQUE AFTER username
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN password_hash VARCHAR(255) AFTER email
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER password_hash
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN is_admin BOOLEAN DEFAULT FALSE AFTER is_active
    `).catch(() => {})

    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN last_login TIMESTAMP NULL AFTER updated_at
    `).catch(() => {})

    await tempPool.query(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id VARCHAR(36) PRIMARY KEY,
        email VARCHAR(120) NOT NULL,
        code VARCHAR(6) NOT NULL,
        usage_type VARCHAR(20) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_code (code)
      )
    `).catch(() => {})

    // 添加 github_id 字段（如果不存在）
    await tempPool.query(`
      ALTER TABLE users 
      ADD COLUMN github_id VARCHAR(50) UNIQUE AFTER password_hash
    `).catch(() => {})

    // 添加 github_id 索引
    await tempPool.query(`
      CREATE INDEX idx_github_id ON users(github_id)
    `).catch(() => {})

    await tempPool.query(`
      DROP INDEX username ON users
    `).catch(() => {})

    // 添加 is_pinned 字段到 sessions 表（如果不存在）
    await tempPool.query(`
      ALTER TABLE sessions 
      ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE AFTER model
    `).catch(() => {})

    // 添加 is_master 字段到 sessions 表（如果不存在）
    await tempPool.query(`
      ALTER TABLE sessions 
      ADD COLUMN is_master BOOLEAN DEFAULT FALSE AFTER is_pinned
    `).catch(() => {})

    console.log('Database schema initialized')
  } finally {
    await tempPool.end()
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log('MySQL pool closed')
  }
}
