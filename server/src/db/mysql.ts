import mysql from 'mysql2/promise'
import { readFileSync } from 'fs'
import { resolve } from 'path'

let pool: mysql.Pool | null = null

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

function loadDbConfig(): DbConfig {
  const configPath = resolve(__dirname, '../../.env')
  const envContent = readFileSync(configPath, 'utf-8')

  const config: Record<string, string> = {}
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        config[key.trim()] = valueParts.join('=').trim()
      }
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

    const schemaPath = resolve(__dirname, './schema.sql')
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

    await tempPool.query(`
      DROP INDEX username ON users
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
