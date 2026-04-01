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
        await tempPool.query(statement)
      }
    }
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
